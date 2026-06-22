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

/** Inference-time priors when genre training data is thin — biases sampling without retraining. */
export interface GenreInferencePriors {
  temperatureMult: number;
  nucleusTopP: number;
  restResampleMult: number;
  repeatPitchPenaltyMult: number;
  /** 0–1 ONNX logit penalty strength for out-of-scale pitch classes. */
  scaleLockStrength: number;
  durationChoices: number[];
  durationWeights: number[];
}

const DEFAULT_DURATION_CHOICES = [0.5, 0.75, 1.0, 1.25, 1.5];
const DEFAULT_DURATION_WEIGHTS = [0.15, 0.22, 0.28, 0.2, 0.15];

function priors(
  overrides: Partial<GenreInferencePriors> & Pick<GenreInferencePriors, "temperatureMult" | "nucleusTopP">,
): GenreInferencePriors {
  return {
    restResampleMult: 1,
    repeatPitchPenaltyMult: 1,
    scaleLockStrength: 0.55,
    durationChoices: DEFAULT_DURATION_CHOICES,
    durationWeights: DEFAULT_DURATION_WEIGHTS,
    ...overrides,
  };
}

export const GENRE_INFERENCE_PRIORS: Record<Genre, GenreInferencePriors> = {
  pop: priors({ temperatureMult: 0.95, nucleusTopP: 0.9, scaleLockStrength: 0.65 }),
  trap: priors({
    temperatureMult: 0.82,
    nucleusTopP: 0.82,
    restResampleMult: 0.75,
    repeatPitchPenaltyMult: 1.35,
    scaleLockStrength: 0.72,
    durationChoices: [0.25, 0.35, 0.5, 0.75],
    durationWeights: [0.28, 0.22, 0.32, 0.18],
  }),
  house: priors({
    temperatureMult: 0.88,
    nucleusTopP: 0.85,
    scaleLockStrength: 0.68,
    durationChoices: [0.25, 0.5, 0.75, 1.0],
    durationWeights: [0.35, 0.3, 0.2, 0.15],
  }),
  lofi: priors({
    temperatureMult: 0.78,
    nucleusTopP: 0.88,
    restResampleMult: 1.2,
    scaleLockStrength: 0.78,
    durationChoices: [0.75, 1.0, 1.25, 1.5, 2.0],
    durationWeights: [0.2, 0.28, 0.28, 0.16, 0.08],
  }),
  edm: priors({
    temperatureMult: 1.05,
    nucleusTopP: 0.88,
    repeatPitchPenaltyMult: 0.85,
    scaleLockStrength: 0.6,
    durationChoices: [0.25, 0.5, 0.75, 1.0],
    durationWeights: [0.3, 0.35, 0.25, 0.1],
  }),
  rnb: priors({
    temperatureMult: 0.85,
    nucleusTopP: 0.9,
    restResampleMult: 1.1,
    scaleLockStrength: 0.7,
    durationChoices: [0.5, 0.75, 1.0, 1.25, 1.5],
    durationWeights: [0.12, 0.22, 0.32, 0.22, 0.12],
  }),
  drill: priors({
    temperatureMult: 0.8,
    nucleusTopP: 0.8,
    restResampleMult: 0.7,
    repeatPitchPenaltyMult: 1.25,
    scaleLockStrength: 0.74,
    durationChoices: [0.25, 0.35, 0.5, 0.75],
    durationWeights: [0.32, 0.24, 0.28, 0.16],
  }),
  ambient: priors({
    temperatureMult: 0.72,
    nucleusTopP: 0.92,
    restResampleMult: 1.35,
    scaleLockStrength: 0.82,
    durationChoices: [1.0, 1.25, 1.5, 2.0, 2.5],
    durationWeights: [0.18, 0.22, 0.28, 0.22, 0.1],
  }),
};

export function genreInferencePriors(genre: Genre): GenreInferencePriors {
  return GENRE_INFERENCE_PRIORS[genre] ?? GENRE_INFERENCE_PRIORS.pop;
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

export function pickWeightedDuration(
  choices: number[],
  weights: number[],
  rng: () => number,
): number {
  let roll = rng();
  for (let i = 0; i < choices.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return choices[i]!;
  }
  return choices[choices.length - 1] ?? 1.0;
}

export function pickMotifFragments(genre: Genre, rng: () => number): [MotifFragment, MotifFragment] {
  const motifs = expandedMotifsForGenre(genre);
  const a = motifs[Math.floor(rng() * motifs.length)] ?? motifs[0]!;
  const b = motifs[Math.floor(rng() * motifs.length)] ?? motifs[0]!;
  return [a, b];
}

const RHYTHM_TEMPLATES: { beatInMotif: number; duration: number; accent: boolean }[][] = [
  [
    { beatInMotif: 0, duration: 0.5, accent: true },
    { beatInMotif: 1, duration: 0.5, accent: false },
    { beatInMotif: 2, duration: 0.5, accent: true },
    { beatInMotif: 3, duration: 0.5, accent: false },
  ],
  [
    { beatInMotif: 0, duration: 0.75, accent: true },
    { beatInMotif: 1.5, duration: 0.25, accent: false },
    { beatInMotif: 2.5, duration: 0.75, accent: true },
  ],
  [
    { beatInMotif: 0, duration: 0.25, accent: true },
    { beatInMotif: 0.75, duration: 0.25, accent: false },
    { beatInMotif: 1.5, duration: 0.5, accent: true },
    { beatInMotif: 2.75, duration: 0.25, accent: false },
  ],
  [
    { beatInMotif: 0, duration: 1.0, accent: true },
    { beatInMotif: 2, duration: 1.0, accent: false },
  ],
  [
    { beatInMotif: 0, duration: 0.5, accent: true },
    { beatInMotif: 0.5, duration: 0.25, accent: false },
    { beatInMotif: 1.25, duration: 0.75, accent: true },
    { beatInMotif: 3, duration: 0.5, accent: false },
  ],
];

function variateFragment(base: MotifFragment, variant: number): MotifFragment {
  const rhythm = RHYTHM_TEMPLATES[variant % RHYTHM_TEMPLATES.length]!;
  const degreeShift = variant % 3;
  const reversed = [...base.degrees].reverse();
  const rotated = [...base.degrees.slice(degreeShift), ...base.degrees.slice(0, degreeShift)];
  const degrees = variant % 2 === 0 ? rotated : reversed;
  return {
    name: `${base.name}-v${variant}`,
    degrees: degrees.map((d) => d + (variant % 2)),
    slots: rhythm.map((slot, i) => ({
      beatInMotif: slot.beatInMotif,
      duration: slot.duration,
      accent: i % 2 === 0 ? slot.accent : !slot.accent,
    })),
  };
}

/** Base motifs plus programmatic variations (10+ per genre). */
export function expandedMotifsForGenre(genre: Genre): MotifFragment[] {
  const entry = genreEntry(genre);
  const expanded: MotifFragment[] = [...entry.motifs];
  for (const base of entry.motifs) {
    for (let v = 0; v < 10; v++) {
      expanded.push(variateFragment(base, v));
    }
  }
  return expanded;
}
