import {
  initialize,
  MidiClip,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";

import { generateMelody, loadModel, setLazyStorageDir } from "./ml/inference.js";
import { chordLabelsPerBar } from "./ml/chords.js";
import { resolveChordProgression } from "./ml/session-chords.js";
import {
  mergeRegionNotes,
  normalizeSelection,
  regionBars,
  type EditorResult,
  type SequenceState,
} from "./ml/sequence.js";
import type { ChordMode, Genre, GenerationParams, MidiNote, Scale } from "./ml/types.js";
import { buildSequenceEditorHtml, modalDialogUrl } from "./ui/sequence-editor.js";
import { toNumber, resolveTimeSignature } from "./util/coerce.js";

function toMidiNotes(raw: unknown[]): MidiNote[] {
  return (raw as Record<string, unknown>[]).map((n) => ({
    pitch: Number(n.pitch ?? 60),
    startTime: Number(n.startTime ?? 0),
    duration: Number(n.duration ?? 0.25),
    velocity: Number(n.velocity ?? 100),
  }));
}

function fromMidiNotes(notes: MidiNote[]): MidiNote[] {
  return notes.map((n) => ({
    pitch: Math.round(n.pitch),
    startTime: n.startTime,
    duration: n.duration,
    velocity: Math.round(n.velocity),
  }));
}

function editorStateFromDialog(dialog: EditorResult, prev: SequenceState): SequenceState {
  return {
    ...prev,
    notes: dialog.notes,
    key: dialog.key,
    scale: dialog.scale,
    genre: dialog.genre,
    bars: dialog.bars,
    temperature: dialog.temperature,
    seed: dialog.seed,
    chordMode: dialog.chordMode,
    generationMode: dialog.generationMode,
    articulation: dialog.articulation,
    selectionStart: dialog.selectionStart,
    selectionEnd: dialog.selectionEnd,
    useRegionSettings: dialog.useRegionSettings,
    regionKey: dialog.regionKey,
    regionScale: dialog.regionScale,
    regionGenre: dialog.regionGenre,
    regionTemperature: dialog.regionTemperature,
    regionSeed: dialog.regionSeed,
  };
}

function buildGenerationParams(
  dialog: EditorResult,
  tempo: number,
  timeSignature: { numerator: number; denominator: number },
  chordProgression: GenerationParams["chordProgression"],
  regionStart: number,
  regionEnd: number,
  fullGenerate: boolean,
): GenerationParams {
  const beatsPerBar = timeSignature.numerator || 4;
  const useRegion = !fullGenerate && dialog.useRegionSettings;
  return {
    key: useRegion ? dialog.regionKey : dialog.key,
    scale: (useRegion ? dialog.regionScale : dialog.scale) as Scale,
    genre: (useRegion ? dialog.regionGenre : dialog.genre) as Genre,
    bars: fullGenerate ? dialog.bars : regionBars(regionStart, regionEnd, beatsPerBar),
    temperature: useRegion ? dialog.regionTemperature : dialog.temperature,
    seed: useRegion ? dialog.regionSeed : dialog.seed,
    tempo,
    timeSignature,
    chordMode: dialog.chordMode,
    chordProgression,
    generationMode: dialog.generationMode,
    articulation: dialog.articulation,
  };
}

async function runSequenceEditor(
  showModal: (url: string) => Promise<string | null>,
  initial: SequenceState,
  generate: (
    dialog: EditorResult,
    regionStart: number,
    regionEnd: number,
    fullGenerate: boolean,
  ) => Promise<MidiNote[]>,
): Promise<MidiNote[] | null> {
  let state = initial;

  for (;;) {
    const resultJson = await showModal(modalDialogUrl(buildSequenceEditorHtml(state)));
    if (!resultJson || resultJson === "null") return null;

    const dialog = JSON.parse(resultJson) as EditorResult;
    state = editorStateFromDialog(dialog, state);

    if (dialog.action === "cancel") return null;

    if (dialog.action === "apply") {
      return fromMidiNotes(dialog.notes);
    }

    if (dialog.action === "generate_all" || dialog.action === "generate_selection") {
      const beatsPerBar = state.timeSignature.numerator || 4;
      const maxBeat = state.bars * beatsPerBar;
      const fullGenerate = dialog.action === "generate_all";
      let regionStart = 0;
      let regionEnd = maxBeat;

      if (!fullGenerate) {
        const sel = normalizeSelection(dialog.selectionStart, dialog.selectionEnd, maxBeat);
        regionStart = sel.start;
        regionEnd = sel.end;
      }

      const generated = await generate(dialog, regionStart, regionEnd, fullGenerate);
      state.notes = fullGenerate
        ? generated
        : mergeRegionNotes(state.notes, regionStart, regionEnd, generated);
      continue;
    }
  }
}

export function activate(activation: ActivationContext): void {
  const ext = initialize(activation, "1.0.0");
  console.log("[Neural Midi] Activating…");

  const storageDir = ext.environment.storageDirectory;
  if (storageDir) {
    setLazyStorageDir(storageDir);
    loadModel(storageDir).catch((err) => {
      console.warn("[Neural Midi] Model check deferred:", err);
    });
  }

  ext.commands.registerCommand("neuralMidi.generate", async (args: unknown) => {
    try {
      const clip = ext.getObjectFromHandle(args as Handle, MidiClip);
      const song = ext.application?.song;
      if (!song) {
        console.log("[Neural Midi] No active song");
        return;
      }

      const tempo = toNumber(song.tempo, 120);
      const timeSignature = resolveTimeSignature(song.scenes[0]);
      const beatsPerBar = timeSignature.numerator || 4;

      const initialProgression = resolveChordProgression(
        song,
        clip,
        args,
        "same-track",
        4,
      );

      const initialState: SequenceState = {
        notes: toMidiNotes(clip.notes),
        key: "C",
        scale: "major",
        genre: "pop",
        bars: 4,
        temperature: 0.7,
        seed: Math.floor(Math.random() * 1_000_000),
        chordMode: "same-track",
        generationMode: initialProgression.length > 0 ? "hybrid" : "melody",
        articulation: "lead",
        chordLabels: chordLabelsPerBar(initialProgression, 4, beatsPerBar),
        tempo,
        timeSignature,
        selectionStart: 0,
        selectionEnd: beatsPerBar,
        useRegionSettings: false,
        regionKey: "C",
        regionScale: "major",
        regionGenre: "pop",
        regionTemperature: 0.7,
        regionSeed: Math.floor(Math.random() * 1_000_000),
      };

      const notes = await runSequenceEditor(
        (url) => ext.ui.showModalDialog(url, 920, 640),
        initialState,
        async (dialog, regionStart, regionEnd, fullGenerate) => {
          const bars = fullGenerate
            ? dialog.bars
            : Math.ceil((regionEnd - regionStart) / beatsPerBar) || 1;
          const chordProgression = resolveChordProgression(
            song,
            clip,
            args,
            dialog.chordMode,
            bars,
          );
          const params = buildGenerationParams(
            dialog,
            tempo,
            timeSignature,
            chordProgression.length > 0 ? chordProgression : undefined,
            regionStart,
            regionEnd,
            fullGenerate,
          );
          const result = await generateMelody(params);
          const regionBeats = regionEnd - regionStart;
          return result.notes.filter((n) => n.startTime < regionBeats);
        },
      );

      if (!notes) return;

      ext.withinTransaction(() => {
        clip.notes = notes;
      });

      console.log(`[Neural Midi] Applied ${notes.length} notes to clip`);
    } catch (err) {
      console.error("[Neural Midi] generate error:", err);
    }
  });

  ext.commands.registerCommand("neuralMidi.continue", async (args: unknown) => {
    try {
      const clip = ext.getObjectFromHandle(args as Handle, MidiClip);
      const existing = toMidiNotes(clip.notes);
      const song = ext.application?.song;
      if (!song) return;

      const chordProgression = resolveChordProgression(song, clip, args, "same-track", 2);

      const result = await generateMelody({
        key: "C",
        scale: "major",
        genre: "pop",
        bars: 2,
        temperature: 0.6,
        seed: Date.now() % 1_000_000,
        tempo: toNumber(song.tempo, 120),
        timeSignature: resolveTimeSignature(song.scenes[0]),
        chordMode: "same-track",
        chordProgression: chordProgression.length > 0 ? chordProgression : undefined,
      });

      const offset =
        existing.length > 0
          ? Math.max(...existing.map((n) => n.startTime + n.duration))
          : 0;

      const continued = result.notes.map((n) => ({
        ...n,
        startTime: n.startTime + offset,
      }));

      ext.withinTransaction(() => {
        clip.notes = [...existing, ...continued];
      });

      console.log(`[Neural Midi] Continued melody with ${continued.length} new notes`);
    } catch (err) {
      console.error("[Neural Midi] continue error:", err);
    }
  });

  ext.ui.registerContextMenuAction("MidiClip", "Sequence Editor…", "neuralMidi.generate");
  ext.ui.registerContextMenuAction("MidiClip", "Continue Melody", "neuralMidi.continue");
}
