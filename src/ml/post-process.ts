import type { ChordEvent, GenerationParams, MidiNote, Scale } from "./types.js";
import { chordAtBeat } from "./chords.js";
import { genreEntry } from "./genre-library.js";
import { addGhostNotes, applySwing, applyVelocityHumanize } from "./humanize.js";
import { applyLegatoOverlap, mergeVoices } from "./pattern-engine.js";
import { mulberry32 } from "./melody-engine.js";
import {
  NOTE_TO_PC,
  SCALE_INTERVALS,
  buildScalePitches,
  nearestScaleIndex,
  quantizeBeat,
} from "./melody-engine.js";
import { resolveTimeSignature, toNumber } from "../util/coerce.js";

export type GenerationMode = "chords" | "hybrid" | "melody";
export type ArticulationType = "lead" | "pluck";

const GRID = 0.25;

function snapToScale(pitch: number, rootPc: number, scale: Scale, minMidi = 48, maxMidi = 84): number {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  const pitches = buildScalePitches(rootPc, intervals, minMidi, maxMidi);
  if (pitches.length === 0) return pitch;
  return pitches[nearestScaleIndex(pitches, pitch)]!;
}

function snapToChordOrScale(
  pitch: number,
  chord: ChordEvent | undefined,
  rootPc: number,
  scale: Scale,
  hybridBias: number,
): number {
  const scaled = snapToScale(pitch, rootPc, scale);
  if (!chord || hybridBias <= 0) return scaled;

  const chordPitches: number[] = [];
  for (let octave = 3; octave <= 6; octave++) {
    for (const pc of chord.pitchClasses) {
      chordPitches.push(octave * 12 + pc);
    }
  }
  if (chordPitches.length === 0) return scaled;
  const nearest = chordPitches.reduce((best, p) =>
    Math.abs(p - scaled) < Math.abs(best - scaled) ? p : best,
  );
  return Math.round(scaled * (1 - hybridBias) + nearest * hybridBias);
}

function dedupeIdentical(notes: MidiNote[]): MidiNote[] {
  const seen = new Set<string>();
  const out: MidiNote[] = [];
  for (const n of notes) {
    const key = `${Math.round(n.startTime / GRID)}_${n.pitch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

function shapeArticulation(notes: MidiNote[], articulation: ArticulationType): MidiNote[] {
  return notes.map((n) => {
    if (articulation === "pluck") {
      return {
        ...n,
        duration: Math.min(n.duration, 0.35),
        velocity: Math.min(127, Math.round(n.velocity * 0.92)),
      };
    }
    return {
      ...n,
      duration: Math.max(n.duration, 0.2),
      velocity: Math.min(127, n.velocity + 4),
    };
  });
}

export interface PostProcessOptions {
  mode?: GenerationMode;
  articulation?: ArticulationType;
}

export function postProcessMelody(
  notes: MidiNote[],
  params: GenerationParams,
  options: PostProcessOptions = {},
): MidiNote[] {
  if (notes.length === 0) return notes;

  const mode = options.mode ?? (params.chordProgression?.length ? "hybrid" : "melody");
  const articulation = options.articulation ?? "lead";
  const rootPc = NOTE_TO_PC[params.key] ?? 0;
  const { numerator: beatsPerBar } = resolveTimeSignature({
    signatureNumerator: params.timeSignature.numerator,
    signatureDenominator: params.timeSignature.denominator,
  });
  const progression = params.chordProgression ?? [];
  const hybridBias = mode === "hybrid" ? 0.72 : mode === "chords" ? 0.88 : 0.15;
  const allowOverlap = mode !== "chords";

  let processed = notes.map((n) => {
    const startTime = quantizeBeat(n.startTime, GRID);
    const chord = chordAtBeat(progression, startTime);
    const onStrongBeat = Math.abs(startTime % beatsPerBar) < 0.01;
    const bias = onStrongBeat ? hybridBias : hybridBias * 0.65;
    const pitch = snapToChordOrScale(
      Math.round(n.pitch),
      chord,
      rootPc,
      params.scale,
      mode === "chords" ? 0 : bias,
    );
    return {
      pitch,
      startTime,
      duration: quantizeBeat(Math.max(0.08, n.duration), GRID),
      velocity: Math.max(40, Math.min(127, Math.round(toNumber(n.velocity, 90)))),
    };
  });

  processed = dedupeIdentical(processed);

  if (allowOverlap) {
    processed = applyLegatoOverlap(processed, articulation === "pluck" ? 0.04 : 0.1);
  }

  processed = shapeArticulation(processed, articulation);

  if (mode !== "chords") {
    const profile = genreEntry(params.genre);
    const rng = mulberry32(toNumber(params.seed, 1) + 17);
    const scalePitches = buildScalePitches(rootPc, SCALE_INTERVALS[params.scale] ?? SCALE_INTERVALS.major, 48, 84);
    processed = applySwing(processed, profile.swing, beatsPerBar);
    processed = applyVelocityHumanize(processed, rng, profile.velocityAccent);
    processed = addGhostNotes(processed, scalePitches, rng, profile.ghostNoteChance);
  }

  if (processed.length > 1 && mode === "melody") {
    const lead = processed
      .filter((n) => n.velocity >= 60)
      .sort((a, b) => a.startTime - b.startTime);
    const last = lead[lead.length - 1] ?? processed[processed.length - 1]!;
    const intervals = SCALE_INTERVALS[params.scale] ?? SCALE_INTERVALS.major;
    const tonicPc = (rootPc + intervals[0]!) % 12;
    const octave = Math.round(last.pitch / 12);
    last.pitch = octave * 12 + tonicPc;
    if (last.pitch < 55) last.pitch += 12;
  }

  return processed;
}

/** Merge melody with chord stabs, keeping both voices. */
export function postProcessHybrid(
  melody: MidiNote[],
  chordStabs: MidiNote[],
  params: GenerationParams,
  articulation: ArticulationType = "lead",
): MidiNote[] {
  const processedMelody = postProcessMelody(melody, params, { mode: "melody", articulation });
  const processedChords = postProcessMelody(chordStabs, params, { mode: "chords", articulation });
  return mergeVoices(processedMelody, processedChords);
}
