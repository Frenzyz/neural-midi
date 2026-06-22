import type { GenerationParams, GenerationResult, MidiNote } from "./types.js";

const SCALE_INTERVALS: Record<GenerationParams["scale"], number[]> = {
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

const NOTE_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

const GENRE_RHYTHMS: Record<GenerationParams["genre"], number[]> = {
  pop: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  trap: [0, 0.75, 1.5, 2.25, 3],
  house: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  lofi: [0, 0.66, 1.33, 2, 2.66, 3.33],
  edm: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5],
  rnb: [0, 0.5, 1.25, 2, 2.75, 3.5],
  drill: [0, 0.5, 1, 1.5, 2.5, 3],
  ambient: [0, 1, 2, 3, 4, 5, 6, 7],
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function scalePitch(rootPc: number, intervals: number[], degree: number, octave: number): number {
  const pc = (rootPc + intervals[degree % intervals.length] + octave * 12) % 128;
  return Math.max(0, Math.min(127, pc + Math.floor(degree / intervals.length) * 12));
}

/**
 * Deterministic placeholder generator until the ONNX model ships.
 * Produces a monophonic melody quantized to 1/8 notes within the selected scale.
 */
export function generateStubMelody(params: GenerationParams): GenerationResult {
  const rng = mulberry32(params.seed);
  const rootPc = NOTE_TO_PC[params.key] ?? 0;
  const intervals = SCALE_INTERVALS[params.scale];
  const beatsPerBar = params.timeSignature.numerator;
  const totalBeats = params.bars * beatsPerBar;
  const rhythmTemplate = GENRE_RHYTHMS[params.genre];

  const notes: MidiNote[] = [];
  let beat = 0;
  let degree = Math.floor(rng() * intervals.length);
  let octave = 4;

  while (beat < totalBeats) {
    const slot = rhythmTemplate[Math.floor(rng() * rhythmTemplate.length)] % beatsPerBar;
    const startTime = beat + slot;
    if (startTime >= totalBeats) break;

    if (rng() < 0.15 + params.temperature * 0.1) {
      degree += rng() < 0.5 ? -1 : 1;
    }
    if (rng() < 0.08) octave += rng() < 0.5 ? -1 : 1;
    octave = Math.max(3, Math.min(6, octave));

    const pitch = scalePitch(rootPc, intervals, degree, octave);
    const duration = rng() < 0.3 ? 0.25 : 0.5;
    const velocity = Math.floor(72 + rng() * 40);

    notes.push({ pitch, startTime, duration, velocity });
    beat += beatsPerBar;
  }

  notes.sort((a, b) => a.startTime - b.startTime);

  return {
    notes,
    modelVersion: "stub-0.1.0",
    usedStub: true,
  };
}
