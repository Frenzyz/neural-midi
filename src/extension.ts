import {
  initialize,
  MidiClip,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";

import { generateMelody, loadModel } from "./ml/inference.js";
import type { Genre, GenerationParams, MidiNote, Scale } from "./ml/types.js";
import { buildGenerateDialogHtml } from "./ui/generate-dialog.js";

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

interface DialogResult {
  action: string;
  key: string;
  scale: Scale;
  genre: Genre;
  bars: number;
  temperature: number;
  seed: number;
}

export function activate(activation: ActivationContext): void {
  const ext = initialize(activation, "1.0.0");
  console.log("[Neural Midi] Activating…");

  const storageDir = ext.environment.storageDirectory;
  if (storageDir) {
    loadModel(storageDir).catch((err) => {
      console.warn("[Neural Midi] Model load deferred:", err);
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

      const tempo = song.tempo ?? 120;
      const timeSignature = {
        numerator: song.signatureNumerator ?? 4,
        denominator: song.signatureDenominator ?? 4,
      };

      const resultJson = await ext.ui.showModalDialog(
        buildGenerateDialogHtml({
          key: "C",
          scale: "major",
          genre: "pop",
          bars: 4,
          temperature: 0.7,
          seed: Math.floor(Math.random() * 1_000_000),
          tempo,
        }),
        480,
        420,
      );

      if (!resultJson || resultJson === "null") return;

      const dialog = JSON.parse(resultJson) as DialogResult;
      if (dialog.action !== "generate") return;

      const params: GenerationParams = {
        key: dialog.key,
        scale: dialog.scale,
        genre: dialog.genre,
        bars: Math.max(1, Math.min(8, dialog.bars)),
        temperature: dialog.temperature,
        seed: dialog.seed,
        tempo,
        timeSignature,
      };

      const result = await generateMelody(params);
      const notes = fromMidiNotes(result.notes);

      ext.withinTransaction(() => {
        clip.notes = notes;
      });

      console.log(
        `[Neural Midi] Wrote ${notes.length} notes (model: ${result.modelVersion}, stub: ${result.usedStub})`,
      );
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

      const result = await generateMelody({
        key: "C",
        scale: "major",
        genre: "pop",
        bars: 2,
        temperature: 0.6,
        seed: Date.now() % 1_000_000,
        tempo: song.tempo ?? 120,
        timeSignature: {
          numerator: song.signatureNumerator ?? 4,
          denominator: song.signatureDenominator ?? 4,
        },
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
}
