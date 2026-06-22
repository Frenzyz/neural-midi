import { float32Vector } from "./onnx-tensors.js";
import { chordAtBeat } from "./chords.js";
import { resolveExpression } from "./expression.js";
import { pickWeightedDuration } from "./genre-library.js";
import {
  DEFAULT_GRID_DIVISION,
  gridStepBeats,
  slotIndex,
  snapDurationToGrid,
  snapToGrid,
} from "./grid-quantize.js";
import { addHarmonyLayer, mergeVoices } from "./pattern-engine.js";
import { mulberry32, pitchClassesInScale } from "./melody-engine.js";
import { runMelodyStep, getHiddenStateSize, getOnnxModelVersion, isOnnxReady } from "./onnx-runtime.js";
import {
  chordQualityOneHot,
  chordRootOneHot,
  genreOneHot,
  positionIndex,
  REST_TOKEN,
  VOCAB_SIZE,
} from "./tokenizer.js";
import type { GenerationParams, GenerationResult, MidiNote, Scale } from "./types.js";
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

/** Nucleus (top-p) sampling for more varied but coherent tokens. */
function sampleTokenNucleus(
  logits: Float32Array,
  temperature: number,
  topP: number,
  rng: () => number,
): number {
  const scaled = new Float32Array(VOCAB_SIZE);
  let max = -Infinity;
  for (let i = 0; i < VOCAB_SIZE; i++) {
    scaled[i] = logits[i]! / Math.max(0.1, temperature);
    if (scaled[i]! > max) max = scaled[i]!;
  }
  const probs: { idx: number; p: number }[] = [];
  let sum = 0;
  for (let i = 0; i < VOCAB_SIZE; i++) {
    const p = Math.exp(scaled[i]! - max);
    probs.push({ idx: i, p });
    sum += p;
  }
  for (const entry of probs) entry.p /= sum;
  probs.sort((a, b) => b.p - a.p);
  let cumulative = 0;
  const cutoff: { idx: number; p: number }[] = [];
  for (const entry of probs) {
    cumulative += entry.p;
    cutoff.push(entry);
    if (cumulative >= topP) break;
  }
  const total = cutoff.reduce((s, e) => s + e.p, 0);
  let r = rng() * total;
  for (const entry of cutoff) {
    r -= entry.p;
    if (r <= 0) return entry.idx;
  }
  return cutoff[cutoff.length - 1]?.idx ?? REST_TOKEN;
}

/** Down-weight same pitch token when repeat streak would extend. */
function applyRepeatPitchPenalty(
  logits: Float32Array,
  recentPitchTokens: number[],
  penalty: number,
  sustainPenalty: number,
  consecutiveGridSteps: number,
): void {
  if (recentPitchTokens.length < 2 || penalty <= 0) return;
  const last = recentPitchTokens[recentPitchTokens.length - 1]!;
  const prev = recentPitchTokens[recentPitchTokens.length - 2]!;
  if (last === REST_TOKEN || last !== prev) return;

  let p = penalty;
  if (consecutiveGridSteps > 4) p += sustainPenalty;
  if (consecutiveGridSteps > 8) p += sustainPenalty * 0.75;
  logits[last] = (logits[last] ?? 0) - p;
}

/** Penalize pitch-class tokens outside the selected key/scale before sampling. */
function applyScaleLogitMask(
  logits: Float32Array,
  key: string,
  scale: Scale,
  strength: number,
): void {
  if (strength <= 0) return;
  const allowed = new Set(pitchClassesInScale(key, scale));
  const penalty = 4 + strength * 10;
  for (let token = 0; token < 12; token++) {
    if (!allowed.has(token)) {
      logits[token] = (logits[token] ?? 0) - penalty;
    }
  }
}

function tokenToMidiPitch(token: number, octave: number): number {
  return octave * 12 + token;
}

export async function generateOnnxMelody(params: GenerationParams): Promise<GenerationResult | null> {
  if (!isOnnxReady()) return null;

  const rng = mulberry32(
    toNumber(params.seed, 1) + toNumber(params.generationIndex, 0) * 7919,
  );
  const { numerator: beatsPerBar } = resolveTimeSignature({
    signatureNumerator: params.timeSignature.numerator,
    signatureDenominator: params.timeSignature.denominator,
  });
  const bars = Math.max(1, toNumber(params.bars, 4));
  const totalBeats = bars * beatsPerBar;
  const expr = resolveExpression(params);
  const temperature = expr.sampleTemperature;
  const progression = params.chordProgression ?? [];
  const grid = gridStepBeats(beatsPerBar, DEFAULT_GRID_DIVISION);
  const steps = Math.ceil(totalBeats / grid);
  const mode = params.generationMode ?? (progression.length ? "hybrid" : "melody");
  const occupiedSlots = new Set<number>();
  const genreVec = genreOneHot(params.genre);

  let prevToken = REST_TOKEN;
  let hidden = new Float32Array(getHiddenStateSize());
  const notes: MidiNote[] = [];
  const recentPitchTokens: number[] = [];
  let consecutiveSamePitchSteps = 0;
  let octave = 5;
  let lastPitch = 60;

  for (let step = 0; step < steps; step++) {
    const beat = snapToGrid(step * grid, grid);
    const slot = slotIndex(beat, grid);
    const chord = chordAtBeat(progression, beat);
    const pos = positionIndex(beat % beatsPerBar, beatsPerBar);

    const { logits, hidden: hOut } = await runMelodyStep(
      Math.trunc(prevToken),
      chordRootOneHot(chord),
      chordQualityOneHot(chord),
      Math.trunc(pos),
      float32Vector(hidden),
      genreVec,
    );
    hidden = Float32Array.from(hOut);

    const logitsForSample = Float32Array.from(logits);
    applyRepeatPitchPenalty(
      logitsForSample,
      recentPitchTokens,
      expr.repeatPitchPenalty,
      expr.sustainRepeatPenalty,
      consecutiveSamePitchSteps,
    );
    applyScaleLogitMask(logitsForSample, params.key, params.scale, expr.scaleLockStrength);

    const token = sampleTokenNucleus(logitsForSample, temperature, expr.nucleusTopP, rng);
    prevToken = token;

    let pitchToken = token;
    if (pitchToken === REST_TOKEN && rng() < expr.restResampleProb) {
      applyRepeatPitchPenalty(
        logitsForSample,
        recentPitchTokens,
        expr.repeatPitchPenalty,
        expr.sustainRepeatPenalty,
        consecutiveSamePitchSteps,
      );
      applyScaleLogitMask(logitsForSample, params.key, params.scale, expr.scaleLockStrength);
      pitchToken = sampleTokenNucleus(
        logitsForSample,
        Math.max(0.2, temperature * 0.9),
        expr.nucleusTopP,
        rng,
      );
      prevToken = pitchToken;
    }

    if (pitchToken === REST_TOKEN) {
      consecutiveSamePitchSteps = 0;
      continue;
    }

    if (mode === "melody" && occupiedSlots.has(slot)) continue;

    const prevPitchTok = recentPitchTokens[recentPitchTokens.length - 1];
    if (prevPitchTok === pitchToken) {
      consecutiveSamePitchSteps++;
    } else {
      consecutiveSamePitchSteps = 1;
    }

    recentPitchTokens.push(pitchToken);
    if (recentPitchTokens.length > 4) recentPitchTokens.shift();

    const durationChoices = expr.durationChoices;
    const durationWeights = expr.durationWeights;
    let noteDuration = pickWeightedDuration(durationChoices, durationWeights, rng);
    noteDuration = Math.min(noteDuration, expr.maxMelodyNoteDuration);
    if (consecutiveSamePitchSteps > 4) {
      noteDuration = Math.min(noteDuration, 0.75);
    }
    noteDuration = snapDurationToGrid(noteDuration, grid);

    let pitch = tokenToMidiPitch(pitchToken, octave);

    if (Math.abs(pitch - lastPitch) > 7) {
      octave += pitch > lastPitch ? 1 : -1;
      octave = Math.max(4, Math.min(6, octave));
      pitch = tokenToMidiPitch(pitchToken, octave);
    }

    if (pitch < 48) {
      octave++;
      pitch = tokenToMidiPitch(pitchToken, octave);
    }
    if (pitch > 84) {
      octave--;
      pitch = tokenToMidiPitch(pitchToken, octave);
    }

    notes.push({
      pitch,
      startTime: beat,
      duration: noteDuration,
      velocity: 72 + Math.floor(rng() * 30),
    });
    occupiedSlots.add(slot);
    lastPitch = pitch;
  }

  if (notes.length === 0) return null;

  let enriched: MidiNote[] = notes;

  if (mode !== "chords" && progression.length > 0 && mode === "hybrid") {
    const extraLayers: MidiNote[][] = [];
    for (const n of notes) {
      const chord = chordAtBeat(progression, n.startTime);
      if (!chord) continue;
      const extra = addHarmonyLayer([n], chord.pitchClasses, rng, Math.min(0.35, expr.harmonyDensity));
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
