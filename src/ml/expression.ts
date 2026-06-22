import type { GenerationParams, StylePreset } from "./types.js";
import { toNumber } from "../util/coerce.js";

export interface ExpressionKnobs {
  /** ONNX: chance to resample away from REST token (lower = more rests). */
  restResampleProb: number;
  /** ONNX logit penalty when same pitch would repeat 3+ times. */
  repeatPitchPenalty: number;
  /** addHarmonyLayer / addHarmonicStacks density 0–1. */
  harmonyDensity: number;
  /** Dense style: add chord accompaniment even in melody mode. */
  hybridAccompaniment: boolean;
  /** Post-process ghost-note chance (0 = off). */
  ghostNoteChance: number;
  /** Sampling temperature blend for ONNX. */
  sampleTemperature: number;
}

const DEFAULT_EXPRESSION = 0.5;
const DEFAULT_STYLE: StylePreset = "expressive";

export function resolveExpression(params: GenerationParams): ExpressionKnobs {
  const expression = Math.max(0, Math.min(1, toNumber(params.expression, DEFAULT_EXPRESSION)));
  const style = params.stylePreset ?? DEFAULT_STYLE;
  const temperature = Math.max(0.1, toNumber(params.temperature, 0.7));

  let restResampleProb = 0.08 + expression * 0.22;
  let repeatPitchPenalty = 1.2 + expression * 1.8;
  let harmonyDensity = 0.25 + expression * 0.35;
  let hybridAccompaniment = false;
  let ghostNoteChance = 0;

  switch (style) {
    case "clean":
      restResampleProb = 0.28 + (1 - expression) * 0.22;
      repeatPitchPenalty = 2.5 + expression;
      harmonyDensity = 0.15 + expression * 0.15;
      break;
    case "dense":
      restResampleProb = 0.02 + expression * 0.08;
      repeatPitchPenalty = 0.8 + expression * 0.6;
      harmonyDensity = 0.5 + expression * 0.35;
      hybridAccompaniment = true;
      break;
    case "expressive":
    default:
      break;
  }

  return {
    restResampleProb,
    repeatPitchPenalty,
    harmonyDensity,
    hybridAccompaniment,
    ghostNoteChance,
    sampleTemperature: temperature * (0.85 + expression * 0.3),
  };
}
