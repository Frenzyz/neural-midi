import type { Genre, Scale } from "./types.js";

export const SCALE_INTERVALS: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  "natural-minor": [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11],
};

export const NOTE_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export interface RhythmEvent {
  /** Beat offset within the bar (0 = downbeat). */
  offset: number;
  duration: number;
  accent: boolean;
  /** 0–1 — skip this slot to create a rest. */
  restChance: number;
}

export interface GenreProfile {
  minMidi: number;
  maxMidi: number;
  patterns: RhythmEvent[][];
  phraseLength: number;
  /** Higher = more leaps and rhythmic surprises. */
  expressiveness: number;
}

/** One rhythm pattern = one bar of attacks. */
export const GENRE_PROFILES: Record<Genre, GenreProfile> = {
  pop: {
    minMidi: 60,
    maxMidi: 84,
    phraseLength: 4,
    expressiveness: 0.45,
    patterns: [
      [
        { offset: 0, duration: 0.75, accent: true, restChance: 0 },
        { offset: 1, duration: 0.5, accent: false, restChance: 0.1 },
        { offset: 2, duration: 0.75, accent: true, restChance: 0 },
        { offset: 3, duration: 0.5, accent: false, restChance: 0.15 },
      ],
      [
        { offset: 0, duration: 0.5, accent: true, restChance: 0 },
        { offset: 0.5, duration: 0.25, accent: false, restChance: 0.05 },
        { offset: 1.5, duration: 0.5, accent: false, restChance: 0.1 },
        { offset: 2.5, duration: 0.75, accent: true, restChance: 0 },
        { offset: 3.5, duration: 0.25, accent: false, restChance: 0.2 },
      ],
    ],
  },
  trap: {
    minMidi: 57,
    maxMidi: 81,
    phraseLength: 4,
    expressiveness: 0.35,
    patterns: [
      [
        { offset: 0, duration: 0.5, accent: true, restChance: 0 },
        { offset: 1.5, duration: 0.25, accent: false, restChance: 0.25 },
        { offset: 2.25, duration: 0.25, accent: false, restChance: 0.3 },
        { offset: 3, duration: 0.5, accent: true, restChance: 0.1 },
      ],
      [
        { offset: 0.75, duration: 0.25, accent: false, restChance: 0.2 },
        { offset: 2, duration: 0.5, accent: true, restChance: 0 },
        { offset: 3.25, duration: 0.25, accent: false, restChance: 0.15 },
      ],
    ],
  },
  house: {
    minMidi: 60,
    maxMidi: 86,
    phraseLength: 4,
    expressiveness: 0.4,
    patterns: [
      [
        { offset: 0, duration: 0.5, accent: true, restChance: 0 },
        { offset: 0.5, duration: 0.5, accent: false, restChance: 0.1 },
        { offset: 1.5, duration: 0.5, accent: false, restChance: 0.1 },
        { offset: 2, duration: 0.5, accent: true, restChance: 0 },
        { offset: 3, duration: 0.5, accent: false, restChance: 0.15 },
      ],
    ],
  },
  lofi: {
    minMidi: 55,
    maxMidi: 79,
    phraseLength: 4,
    expressiveness: 0.3,
    patterns: [
      [
        { offset: 0.08, duration: 1.2, accent: true, restChance: 0 },
        { offset: 1.66, duration: 0.9, accent: false, restChance: 0.15 },
        { offset: 3.1, duration: 0.7, accent: false, restChance: 0.2 },
      ],
    ],
  },
  edm: {
    minMidi: 62,
    maxMidi: 88,
    phraseLength: 4,
    expressiveness: 0.55,
    patterns: [
      [
        { offset: 0, duration: 0.25, accent: true, restChance: 0 },
        { offset: 0.5, duration: 0.25, accent: false, restChance: 0.05 },
        { offset: 1, duration: 0.5, accent: true, restChance: 0 },
        { offset: 2, duration: 0.25, accent: false, restChance: 0.05 },
        { offset: 2.5, duration: 0.25, accent: false, restChance: 0.1 },
        { offset: 3, duration: 0.5, accent: true, restChance: 0 },
      ],
    ],
  },
  rnb: {
    minMidi: 58,
    maxMidi: 82,
    phraseLength: 4,
    expressiveness: 0.35,
    patterns: [
      [
        { offset: 0, duration: 1.25, accent: true, restChance: 0 },
        { offset: 1.5, duration: 0.5, accent: false, restChance: 0.1 },
        { offset: 2.75, duration: 0.75, accent: false, restChance: 0.15 },
      ],
    ],
  },
  drill: {
    minMidi: 55,
    maxMidi: 79,
    phraseLength: 4,
    expressiveness: 0.5,
    patterns: [
      [
        { offset: 0, duration: 0.25, accent: true, restChance: 0 },
        { offset: 0.75, duration: 0.25, accent: false, restChance: 0.15 },
        { offset: 2, duration: 0.25, accent: true, restChance: 0.05 },
        { offset: 2.75, duration: 0.25, accent: false, restChance: 0.2 },
        { offset: 3.5, duration: 0.25, accent: false, restChance: 0.1 },
      ],
    ],
  },
  ambient: {
    minMidi: 52,
    maxMidi: 76,
    phraseLength: 4,
    expressiveness: 0.25,
    patterns: [
      [
        { offset: 0, duration: 2, accent: true, restChance: 0 },
        { offset: 2.5, duration: 1.25, accent: false, restChance: 0.1 },
      ],
    ],
  },
};

/** Normalized melodic height per bar within a 4-bar phrase (arch + cadence). */
export const PHRASE_CONTOUR = [0.35, 0.65, 0.55, 0.15];

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildScalePitches(
  rootPc: number,
  intervals: number[],
  minMidi: number,
  maxMidi: number,
): number[] {
  const pitches: number[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const rel = (midi % 12 - rootPc + 12) % 12;
    if (intervals.includes(rel)) pitches.push(midi);
  }
  return pitches;
}

export function nearestScaleIndex(pitches: number[], midi: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pitches.length; i++) {
    const dist = Math.abs(pitches[i]! - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function quantizeBeat(beat: number, grid = 0.25): number {
  return Math.round(beat / grid) * grid;
}
