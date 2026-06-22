import { float32Vector } from "./onnx-tensors.js";
import { chordAtBeat } from "./chords.js";
import { addHarmonyLayer, addHarmonicStacks, applyLegatoOverlap, mergeVoices } from "./pattern-engine.js";
import { mulberry32, quantizeBeat } from "./melody-engine.js";
import { runMelodyStep, getHiddenStateSize, getOnnxModelVersion, isOnnxReady } from "./onnx-runtime.js";
import {
  chordQualityOneHot,
  chordRootOneHot,
  positionIndex,
  REST_TOKEN,
  VOCAB_SIZE,
} from "./tokenizer.js";
import type { GenerationParams, GenerationResult, MidiNote } from "./types.js";
import { resolveTimeSignature, toNumber } from "../util/coerce.js";

function sampleToken(logits: Float32Array, temperature: number, rng: () => number): number {
  const scaled = new Float32Array(VOCAB_SIZE);
  let max = -Infinity;
  for (let i = 0; i < VOCAB_SIZE; i++) {
    scaled[i] = logits[i]! / Math.max(0.1, temperature);
    if (scaled[i]! > max) max = scaled[i]!;
  }
  let sum = 0;
  for (let i = 0; i < VOCAB_SIZE; i++) {
    scaled[i] = Math.exp(scaled[i]! - max);
    sum += scaled[i]!;
  }
  let r = rng() * sum;
  for (let i = 0; i < VOCAB_SIZE; i++) {
    r -= scaled[i]!;
    if (r <= 0) return i;
  }
  return REST_TOKEN;
}

function tokenToMidiPitch(token: number, octave: number): number {
  return octave * 12 + token;
}

export async function generateOnnxMelody(params: GenerationParams): Promise<GenerationResult | null> {
  if (!isOnnxReady()) return null;

  const rng = mulberry32(toNumber(params.seed, 1));
  const { numerator: beatsPerBar } = resolveTimeSignature({
    signatureNumerator: params.timeSignature.numerator,
    signatureDenominator: params.timeSignature.denominator,
  });
  const bars = Math.max(1, toNumber(params.bars, 4));
  const totalBeats = bars * beatsPerBar;
  const temperature = Math.max(0.1, toNumber(params.temperature, 0.7));
  const progression = params.chordProgression ?? [];
  const grid = 0.25;
  const steps = Math.ceil(totalBeats / grid);

  let prevToken = REST_TOKEN;
  let hidden = new Float32Array(getHiddenStateSize());
  const notes: MidiNote[] = [];
  let octave = 5;
  let lastPitch = 60;

  for (let step = 0; step < steps; step++) {
    const beat = step * grid;
    const chord = chordAtBeat(progression, beat);
    const pos = positionIndex(beat % beatsPerBar, beatsPerBar);

    const { logits, hidden: hOut } = await runMelodyStep(
      Math.trunc(prevToken),
      chordRootOneHot(chord),
      chordQualityOneHot(chord),
      Math.trunc(pos),
      float32Vector(hidden),
    );
    hidden = Float32Array.from(hOut);

    const token = sampleToken(logits, temperature, rng);
    prevToken = token;

    let pitchToken = token;
    if (pitchToken === REST_TOKEN && rng() < 0.42) {
      pitchToken = sampleToken(logits, Math.max(0.15, temperature * 0.85), rng);
      prevToken = pitchToken;
    }

    if (pitchToken === REST_TOKEN) continue;

    let pitch = tokenToMidiPitch(pitchToken, octave);

    if (Math.abs(pitch - lastPitch) > 7) {
      octave += pitch > lastPitch ? 1 : -1;
      octave = Math.max(4, Math.min(6, octave));
      pitch = tokenToMidiPitch(token, octave);
    }

    if (pitch < 48) {
      octave++;
      pitch = tokenToMidiPitch(token, octave);
    }
    if (pitch > 84) {
      octave--;
      pitch = tokenToMidiPitch(token, octave);
    }

    notes.push({
      pitch,
      startTime: quantizeBeat(beat),
      duration: grid * 1.5,
      velocity: 72 + Math.floor(rng() * 30),
    });
    lastPitch = pitch;
  }

  const deduped: MidiNote[] = [];
  for (const n of notes) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.startTime - n.startTime) < 0.01) continue;
    deduped.push(n);
  }

  if (deduped.length === 0) return null;

  const mode = params.generationMode ?? (progression.length ? "hybrid" : "melody");
  let enriched = applyLegatoOverlap(deduped, 0.08);

  if (mode !== "chords" && progression.length > 0) {
    const extraLayers: MidiNote[][] = [];
    for (const n of deduped) {
      const chord = chordAtBeat(progression, n.startTime);
      if (!chord) continue;
      const extra = addHarmonyLayer([n], chord.pitchClasses, rng, mode === "hybrid" ? 0.65 : 0.78);
      if (extra.length > 1) extraLayers.push(extra.slice(1));
    }
    enriched = mergeVoices(enriched, ...extraLayers);
    enriched = addHarmonicStacks(enriched, progression, rng, 0.75);
  }

  return {
    notes: enriched,
    modelVersion: getOnnxModelVersion(),
    usedStub: false,
  };
}
