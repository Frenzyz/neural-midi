import { float32Vector } from "./onnx-tensors.js";
import { chordAtBeat } from "./chords.js";
import { resolveExpression } from "./expression.js";
import { addHarmonyLayer, applyLegatoOverlap, mergeVoices } from "./pattern-engine.js";
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

/** Down-weight same pitch token when it would extend a 2-note repeat streak. */
function applyRepeatPitchPenalty(
  logits: Float32Array,
  recentPitchTokens: number[],
  penalty: number,
): void {
  if (recentPitchTokens.length < 2 || penalty <= 0) return;
  const last = recentPitchTokens[recentPitchTokens.length - 1]!;
  const prev = recentPitchTokens[recentPitchTokens.length - 2]!;
  if (last !== REST_TOKEN && last === prev) {
    logits[last] = (logits[last] ?? 0) - penalty;
  }
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
  const expr = resolveExpression(params);
  const temperature = expr.sampleTemperature;
  const progression = params.chordProgression ?? [];
  const grid = 0.25;
  const steps = Math.ceil(totalBeats / grid);

  let prevToken = REST_TOKEN;
  let hidden = new Float32Array(getHiddenStateSize());
  const notes: MidiNote[] = [];
  const recentPitchTokens: number[] = [];
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

    const logitsForSample = Float32Array.from(logits);
    applyRepeatPitchPenalty(logitsForSample, recentPitchTokens, expr.repeatPitchPenalty);

    const token = sampleToken(logitsForSample, temperature, rng);
    prevToken = token;

    let pitchToken = token;
    if (pitchToken === REST_TOKEN && rng() < expr.restResampleProb) {
      applyRepeatPitchPenalty(logitsForSample, recentPitchTokens, expr.repeatPitchPenalty);
      pitchToken = sampleToken(logitsForSample, Math.max(0.2, temperature * 0.9), rng);
      prevToken = pitchToken;
    }

    if (pitchToken === REST_TOKEN) continue;

    recentPitchTokens.push(pitchToken);
    if (recentPitchTokens.length > 4) recentPitchTokens.shift();

    const durationChoices = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const durationWeights = [0.12, 0.2, 0.28, 0.15, 0.15, 0.1];
    let durRoll = rng();
    let noteDuration = 1.0;
    for (let di = 0; di < durationChoices.length; di++) {
      durRoll -= durationWeights[di]!;
      if (durRoll <= 0) {
        noteDuration = durationChoices[di]!;
        break;
      }
    }

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
      duration: noteDuration,
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

  if (mode !== "chords" && progression.length > 0 && mode === "hybrid") {
    const extraLayers: MidiNote[][] = [];
    for (const n of deduped) {
      const chord = chordAtBeat(progression, n.startTime);
      if (!chord) continue;
      const extra = addHarmonyLayer([n], chord.pitchClasses, rng, 0.35);
      if (extra.length > 1) extraLayers.push(extra.slice(1));
    }
    enriched = mergeVoices(enriched, ...extraLayers);
  }

  return {
    notes: enriched,
    modelVersion: getOnnxModelVersion(),
    usedStub: false,
  };
}
