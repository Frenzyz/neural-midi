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

export interface GenerationParams {
  key: string;
  scale: Scale;
  genre: Genre;
  bars: number;
  temperature: number;
  seed: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
}

export interface GenerationResult {
  notes: MidiNote[];
  modelVersion: string;
  usedStub: boolean;
}
