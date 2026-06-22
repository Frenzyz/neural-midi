export interface MidiNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

export type Scale =
  | "major"
  | "natural-minor"
  | "dorian"
  | "mixolydian"
  | "lydian"
  | "phrygian"
  | "locrian"
  | "harmonic-minor"
  | "melodic-minor";

export type Genre =
  | "pop"
  | "trap"
  | "house"
  | "lofi"
  | "edm"
  | "rnb"
  | "drill"
  | "ambient";

export type ChordQuality = "major" | "minor" | "dom7" | "min7" | "dim" | "sus";

export type ChordMode = "none" | "same-track" | "clip-below";

/** Melody generation mode (Wizard UI). */
export type GenerationMode = "chords" | "hybrid" | "melody";

/** Note articulation style (Wizard UI). */
export type ArticulationType = "lead" | "pluck";

export interface ChordEvent {
  startBeat: number;
  duration: number;
  rootPc: number;
  quality: ChordQuality;
  pitchClasses: number[];
}

export interface GenerationParams {
  key: string;
  scale: Scale;
  genre: Genre;
  bars: number;
  temperature: number;
  seed: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  chordMode: ChordMode;
  chordProgression?: ChordEvent[];
  generationMode?: GenerationMode;
  articulation?: ArticulationType;
}

export interface GenerationResult {
  notes: MidiNote[];
  modelVersion: string;
  usedStub: boolean;
}

export const CHORD_QUALITY_COUNT = 6;

export const QUALITY_TO_INDEX: Record<ChordQuality, number> = {
  major: 0,
  minor: 1,
  dom7: 2,
  min7: 3,
  dim: 4,
  sus: 5,
};
