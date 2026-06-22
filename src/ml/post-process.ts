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
import { resolveExpression } from "./expression.js";

export type GenerationMode = "chords" | "hybrid" | "melody";
export type ArticulationType = "lead" | "pluck";

const GRID = 0.25;
const LEAD_VELOCITY_MIN = 55;

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

function stepwisePitch(pitch: number, scalePitches: number[]): number {
  if (scalePitches.length === 0) return pitch + 2;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < scalePitches.length; i++) {
    const d = Math.abs(scalePitches[i]! - pitch);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const next = scalePitches[Math.min(scalePitches.length - 1, bestIdx + 1)]!;
  if (next === pitch && bestIdx > 0) return scalePitches[bestIdx - 1]!;
  return next;
}

/**
 * Split long notes and break same-pitch chains longer than maxChainBeats
 * with stepwise pitch change — musical variation, not deletion.
 */
export function splitOversustainedNotes(
  notes: MidiNote[],
  maxBeatsPerNote = 1.5,
  scalePitches: number[] = [],
  maxChainBeats = 2.0,
): MidiNote[] {
  if (notes.length === 0 || maxBeatsPerNote <= 0) return notes;

  const harmony = notes.filter((n) => n.velocity < LEAD_VELOCITY_MIN);
  let lead = [...notes.filter((n) => n.velocity >= LEAD_VELOCITY_MIN)].sort(
    (a, b) => a.startTime - b.startTime || a.pitch - b.pitch,
  );

  const chunked: MidiNote[] = [];
  for (const note of lead) {
    let remaining = note.duration;
    let t = note.startTime;
    let pitch = note.pitch;
    let segment = 0;
    while (remaining > maxBeatsPerNote + 0.001) {
      chunked.push({
        ...note,
        pitch,
        startTime: quantizeBeat(t, GRID),
        duration: quantizeBeat(maxBeatsPerNote, GRID),
      });
      t += maxBeatsPerNote;
      remaining -= maxBeatsPerNote;
      segment++;
      if (segment > 0) pitch = stepwisePitch(pitch, scalePitches);
    }
    if (remaining > 0.001) {
      chunked.push({
        ...note,
        pitch,
        startTime: quantizeBeat(t, GRID),
        duration: quantizeBeat(remaining, GRID),
      });
    }
  }

  lead = chunked;
  const fixed: MidiNote[] = [];
  let i = 0;
  while (i < lead.length) {
    const first = lead[i]!;
    let j = i + 1;
    let chainEnd = first.startTime + first.duration;
    while (j < lead.length) {
      const n = lead[j]!;
      if (n.pitch !== first.pitch || n.startTime - chainEnd > GRID * 1.15) break;
      chainEnd = n.startTime + n.duration;
      j++;
    }

    const span = chainEnd - first.startTime;
    if (span <= maxChainBeats + 0.001) {
      for (let k = i; k < j; k++) fixed.push(lead[k]!);
    } else {
      const limit = first.startTime + maxChainBeats;
      const altPitch = stepwisePitch(first.pitch, scalePitches);
      for (let k = i; k < j; k++) {
        const n = lead[k]!;
        const noteEnd = n.startTime + n.duration;
        if (n.startTime >= limit - 0.001) {
          fixed.push({ ...n, pitch: altPitch });
          continue;
        }
        if (noteEnd <= limit + 0.001) {
          fixed.push(n);
          continue;
        }
        const headDur = quantizeBeat(limit - n.startTime, GRID);
        const tailDur = quantizeBeat(noteEnd - limit, GRID);
        if (headDur > 0.001) {
          fixed.push({ ...n, duration: headDur });
        }
        if (tailDur > 0.001) {
          fixed.push({
            ...n,
            startTime: limit,
            duration: tailDur,
            pitch: altPitch,
          });
        }
      }
    }
    i = j;
  }

  return [...fixed, ...harmony].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

/** Longest continuous same-pitch span on lead voice (beats). */
export function maxContinuousSamePitchBeats(
  notes: MidiNote[],
  leadVelocityMin = LEAD_VELOCITY_MIN,
): number {
  const lead = [...notes]
    .filter((n) => n.velocity >= leadVelocityMin)
    .sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
  if (lead.length === 0) return 0;

  let maxSpan = lead[0]!.duration;
  let chainPitch = lead[0]!.pitch;
  let chainStart = lead[0]!.startTime;
  let chainEnd = lead[0]!.startTime + lead[0]!.duration;

  for (let idx = 1; idx < lead.length; idx++) {
    const n = lead[idx]!;
    const gap = n.startTime - chainEnd;
    if (n.pitch === chainPitch && gap <= GRID * 1.15) {
      chainEnd = n.startTime + n.duration;
      maxSpan = Math.max(maxSpan, chainEnd - chainStart);
    } else {
      maxSpan = Math.max(maxSpan, n.duration);
      chainPitch = n.pitch;
      chainStart = n.startTime;
      chainEnd = n.startTime + n.duration;
    }
  }
  return maxSpan;
}

export interface PostProcessOptions {
  mode?: GenerationMode;
  articulation?: ArticulationType;
  /** 0 = no ghost notes (default expressive path). */
  ghostNoteChance?: number;
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
    processed = applySwing(processed, profile.swing, beatsPerBar);
    processed = applyVelocityHumanize(processed, rng, profile.velocityAccent);
    const ghostChance = options.ghostNoteChance ?? 0;
    if (ghostChance > 0) {
      const scalePitches = buildScalePitches(rootPc, SCALE_INTERVALS[params.scale] ?? SCALE_INTERVALS.major, 48, 84);
      processed = addGhostNotes(processed, scalePitches, rng, ghostChance);
    }
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

  if (mode !== "chords") {
    const expr = resolveExpression(params);
    const scalePitches = buildScalePitches(
      rootPc,
      SCALE_INTERVALS[params.scale] ?? SCALE_INTERVALS.major,
      48,
      84,
    );
    processed = splitOversustainedNotes(
      processed,
      expr.maxMelodyNoteDuration,
      scalePitches,
      2.0,
    );
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
