import type { GenerationParams, MidiNote, StylePreset } from "./types.js";
import type { MotifFragment } from "./genre-library.js";
import { expandedMotifsForGenre } from "./genre-library.js";
import {
  invertRhythmMotif,
  rotateMotifDegrees,
  transposeMotifDegrees,
  varyMotif,
  type MotifEvent,
} from "./pattern-engine.js";
import { mulberry32 } from "./melody-engine.js";
import { toNumber } from "../util/coerce.js";

export type VariationStrategy =
  | "transpose"
  | "invert-rhythm"
  | "rotate-degrees"
  | "vary-heavy"
  | "plain";

export interface VarietyPlan {
  seed: number;
  motifIndexA: number;
  motifIndexB: number;
  strategyA: VariationStrategy;
  strategyB: VariationStrategy;
  degreeTranspose: number;
  rhythmShift: number;
}

const STRATEGIES: VariationStrategy[] = [
  "transpose",
  "invert-rhythm",
  "rotate-degrees",
  "vary-heavy",
  "plain",
];

export function createVarietyPlan(params: GenerationParams, generationIndex = 0): VarietyPlan {
  const seed = toNumber(params.seed, 1) + generationIndex * 9973;
  const rng = mulberry32(seed);
  const motifs = expandedMotifsForGenre(params.genre);
  const motifIndexA = Math.floor(rng() * motifs.length);
  let motifIndexB = Math.floor(rng() * motifs.length);
  if (motifIndexB === motifIndexA && motifs.length > 1) {
    motifIndexB = (motifIndexB + 1 + Math.floor(rng() * (motifs.length - 1))) % motifs.length;
  }
  return {
    seed,
    motifIndexA,
    motifIndexB,
    strategyA: STRATEGIES[Math.floor(rng() * STRATEGIES.length)]!,
    strategyB: STRATEGIES[Math.floor(rng() * STRATEGIES.length)]!,
    degreeTranspose: Math.floor(rng() * 5) - 2,
    rhythmShift: Math.floor(rng() * 3),
  };
}

export function fragmentToMotifEvents(fragment: MotifFragment): MotifEvent[] {
  return fragment.slots.map((slot, i) => ({
    offset: slot.beatInMotif,
    degree: fragment.degrees[i % fragment.degrees.length]!,
    duration: slot.duration,
    velocity: slot.accent ? 88 : 74,
    accent: slot.accent,
  }));
}

export function applyVarietyToMotif(
  fragment: MotifFragment,
  strategy: VariationStrategy,
  degreeTranspose: number,
  rhythmShift: number,
  rng: () => number,
): MotifEvent[] {
  let motif = fragmentToMotifEvents(fragment);
  if (degreeTranspose !== 0) {
    motif = transposeMotifDegrees(motif, degreeTranspose);
  }
  if (rhythmShift !== 0) {
    motif = motif.map((e) => ({
      ...e,
      offset: Math.max(0, e.offset + rhythmShift * 0.25),
    }));
  }
  switch (strategy) {
    case "transpose":
      motif = transposeMotifDegrees(motif, rng() < 0.5 ? 1 : -1);
      break;
    case "invert-rhythm":
      motif = invertRhythmMotif(motif);
      break;
    case "rotate-degrees":
      motif = rotateMotifDegrees(motif, Math.floor(rng() * 3) + 1);
      break;
    case "vary-heavy":
      motif = varyMotif(motif, rng, 0.55);
      break;
    case "plain":
    default:
      motif = varyMotif(motif, rng, 0.2);
      break;
  }
  return motif;
}

export function pickVarietyFragments(
  params: GenerationParams,
  generationIndex = 0,
): { motifA: MotifEvent[]; motifB: MotifEvent[]; plan: VarietyPlan } {
  const plan = createVarietyPlan(params, generationIndex);
  const rng = mulberry32(plan.seed + 17);
  const motifs = expandedMotifsForGenre(params.genre);
  const fragA = motifs[plan.motifIndexA % motifs.length]!;
  const fragB = motifs[plan.motifIndexB % motifs.length]!;
  return {
    motifA: applyVarietyToMotif(fragA, plan.strategyA, plan.degreeTranspose, plan.rhythmShift, rng),
    motifB: applyVarietyToMotif(fragB, plan.strategyB, -plan.degreeTranspose, 0, mulberry32(plan.seed + 41)),
    plan,
  };
}

/** Compact fingerprint for variety tests — lead pitch sequence quantized to 16ths. */
export function pitchSequenceFingerprint(notes: MidiNote[], gridStep = 0.25): string {
  const lead = notes
    .filter((n) => n.velocity >= 55)
    .sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch)
    .map((n) => `${Math.round(n.startTime / gridStep)}:${n.pitch}`);
  return lead.join(",");
}

export function uniqueFingerprintCount(fingerprints: string[]): number {
  return new Set(fingerprints).size;
}

export function generationSeed(params: GenerationParams, historyLength: number): number {
  const base = toNumber(params.seed, 1);
  return (base + historyLength * 9973 + historyLength * historyLength) % 1_000_000;
}
