import type { Genre } from "./types.js";

/** Scale-degree index patterns (0 = tonic) for motif fragments. */
export interface MotifFragment {
  name: string;
  degrees: number[];
  slots: { beatInMotif: number; duration: number; accent: boolean }[];
}

export interface GenreLibraryEntry {
  /** Diatonic scale degrees per bar (I=0, II=1, …). */
  progressionDegrees: number[];
  motifs: MotifFragment[];
  swing: number;
  ghostNoteChance: number;
  velocityAccent: number;
}

/** Genre-labeled fragment library inspired by MIDI Wizard's approach. */
export const GENRE_LIBRARY: Record<Genre, GenreLibraryEntry> = {
  pop: {
    progressionDegrees: [0, 5, 3, 4],
    swing: 0.08,
    ghostNoteChance: 0.18,
    velocityAccent: 14,
    motifs: [
      {
        name: "hook-up",
        degrees: [0, 2, 4, 2, 5, 4],
        slots: [
          { beatInMotif: 0, duration: 0.5, accent: true },
          { beatInMotif: 0.75, duration: 0.25, accent: false },
          { beatInMotif: 1.5, duration: 0.5, accent: false },
          { beatInMotif: 2, duration: 0.75, accent: true },
          { beatInMotif: 3, duration: 0.5, accent: false },
        ],
      },
      {
        name: "answer-step",
        degrees: [4, 2, 0, 1, 0],
        slots: [
          { beatInMotif: 0, duration: 0.5, accent: true },
          { beatInMotif: 1, duration: 0.5, accent: false },
          { beatInMotif: 2.5, duration: 0.75, accent: true },
        ],
      },
    ],
  },
  trap: {
    progressionDegrees: [0, 5, 3, 5],
    swing: 0.14,
    ghostNoteChance: 0.24,
    velocityAccent: 10,
    motifs: [
      {
        name: "triplet-feel",
        degrees: [0, 2, 0, 4, 2],
        slots: [
          { beatInMotif: 0, duration: 0.35, accent: true },
          { beatInMotif: 1.5, duration: 0.25, accent: false },
          { beatInMotif: 2.25, duration: 0.25, accent: false },
          { beatInMotif: 3, duration: 0.5, accent: true },
        ],
      },
    ],
  },
  house: {
    progressionDegrees: [0, 0, 5, 5],
    swing: 0.06,
    ghostNoteChance: 0.16,
    velocityAccent: 12,
    motifs: [
      {
        name: "four-on-floor-lead",
        degrees: [0, 4, 5, 4, 0],
        slots: [
          { beatInMotif: 0, duration: 0.25, accent: true },
          { beatInMotif: 1, duration: 0.25, accent: false },
          { beatInMotif: 2, duration: 0.25, accent: true },
          { beatInMotif: 3, duration: 0.25, accent: false },
        ],
      },
    ],
  },
  lofi: {
    progressionDegrees: [0, 3, 4, 0],
    swing: 0.18,
    ghostNoteChance: 0.1,
    velocityAccent: 8,
    motifs: [
      {
        name: "lazy-cascade",
        degrees: [0, 2, 1, 2, 0],
        slots: [
          { beatInMotif: 0, duration: 1.0, accent: true },
          { beatInMotif: 1.25, duration: 0.75, accent: false },
          { beatInMotif: 2.5, duration: 0.5, accent: false },
          { beatInMotif: 3.25, duration: 0.5, accent: false },
        ],
      },
      {
        name: "sparse-bloom",
        degrees: [0, 4, 2, 0],
        slots: [
          { beatInMotif: 0, duration: 1.25, accent: true },
          { beatInMotif: 1.5, duration: 0.75, accent: false },
          { beatInMotif: 2.75, duration: 1.0, accent: false },
          { beatInMotif: 3.5, duration: 0.5, accent: false },
        ],
      },
    ],
  },
  edm: {
    progressionDegrees: [0, 5, 3, 4],
    swing: 0.05,
    ghostNoteChance: 0.14,
    velocityAccent: 16,
    motifs: [
      {
        name: "festival-lead",
        degrees: [4, 5, 4, 2, 0],
        slots: [
          { beatInMotif: 0, duration: 0.5, accent: true },
          { beatInMotif: 1, duration: 0.25, accent: false },
          { beatInMotif: 2, duration: 0.5, accent: true },
          { beatInMotif: 3, duration: 0.25, accent: false },
        ],
      },
    ],
  },
  rnb: {
    progressionDegrees: [0, 4, 5, 3],
    swing: 0.12,
    ghostNoteChance: 0.22,
    velocityAccent: 11,
    motifs: [
      {
        name: "soul-ornament",
        degrees: [0, 1, 2, 4, 2, 0],
        slots: [
          { beatInMotif: 0, duration: 0.75, accent: true },
          { beatInMotif: 1.5, duration: 0.25, accent: false },
          { beatInMotif: 2, duration: 0.5, accent: false },
          { beatInMotif: 3, duration: 0.5, accent: true },
        ],
      },
    ],
  },
  drill: {
    progressionDegrees: [0, 3, 5, 4],
    swing: 0.16,
    ghostNoteChance: 0.26,
    velocityAccent: 9,
    motifs: [
      {
        name: "sliding-16ths",
        degrees: [0, 2, 3, 2, 0],
        slots: [
          { beatInMotif: 0, duration: 0.25, accent: true },
          { beatInMotif: 0.75, duration: 0.25, accent: false },
          { beatInMotif: 1.5, duration: 0.25, accent: false },
          { beatInMotif: 2.25, duration: 0.25, accent: true },
        ],
      },
    ],
  },
  ambient: {
    progressionDegrees: [0, 2, 4, 5],
    swing: 0.04,
    ghostNoteChance: 0.12,
    velocityAccent: 6,
    motifs: [
      {
        name: "floating-pad-lead",
        degrees: [0, 2, 4, 5, 4],
        slots: [
          { beatInMotif: 0, duration: 1, accent: true },
          { beatInMotif: 2, duration: 1, accent: false },
        ],
      },
    ],
  },
};

export function genreEntry(genre: Genre): GenreLibraryEntry {
  return GENRE_LIBRARY[genre] ?? GENRE_LIBRARY.pop;
}

export function pickMotifFragments(genre: Genre, rng: () => number): [MotifFragment, MotifFragment] {
  const entry = genreEntry(genre);
  const motifs = entry.motifs;
  const a = motifs[Math.floor(rng() * motifs.length)] ?? motifs[0]!;
  const b = motifs[Math.floor(rng() * motifs.length)] ?? motifs[0]!;
  return [a, b];
}
