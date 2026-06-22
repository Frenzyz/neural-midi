import type { GenerationParams, StylePreset } from "./types.js";
import { toNumber } from "../util/coerce.js";

export interface ExpressionKnobs {
  restResampleProb: number;
  repeatPitchPenalty: number;
  sustainRepeatPenalty: number;
  maxMelodyNoteDuration: number;
  harmonyDensity: number;
  hybridAccompaniment: boolean;
  ghostNoteChance: number;
  sampleTemperature: number;
  maxPolyphonyPerSlot: number;
  maxSixteenthsPerBar: number;
  /** 0–1 timing/scale strictness for grid + chord snap. */
  rigidity: number;
  /** Nucleus top-p for ONNX sampling (lower = more focused). */
  nucleusTopP: number;
}

const DEFAULT_EXPRESSION = 0.5;
const DEFAULT_STYLE: StylePreset = "expressive";

export function resolveRigidity(params: GenerationParams): number {
  if (params.rigidity !== undefined) {
    return Math.max(0, Math.min(1, toNumber(params.rigidity, 0.5)));
  }
  const style = params.stylePreset ?? DEFAULT_STYLE;
  const expression = Math.max(0, Math.min(1, toNumber(params.expression, DEFAULT_EXPRESSION)));
  switch (style) {
    case "clean":
      return 0.85 + (1 - expression) * 0.15;
    case "dense":
      return 0.45 + expression * 0.15;
    case "expressive":
    default:
      return 0.55 + expression * 0.25;
  }
}

export function resolveExpression(params: GenerationParams): ExpressionKnobs {
  const expression = Math.max(0, Math.min(1, toNumber(params.expression, DEFAULT_EXPRESSION)));
  const style = params.stylePreset ?? DEFAULT_STYLE;
  const temperature = Math.max(0.1, toNumber(params.temperature, 0.7));
  const rigidity = resolveRigidity(params);

  let restResampleProb = 0.08 + expression * 0.22;
  let repeatPitchPenalty = 2.0 + expression * 2.0;
  let sustainRepeatPenalty = 2.5 + (1 - expression) * 2.5;
  let maxMelodyNoteDuration = 1.75 - expression * 0.25;
  let harmonyDensity = 0.25 + expression * 0.35;
  let hybridAccompaniment = false;
  let ghostNoteChance = 0;
  let maxPolyphonyPerSlot = 2;
  let maxSixteenthsPerBar = 12;
  let nucleusTopP = 0.92 - rigidity * 0.12 + expression * 0.08;

  switch (style) {
    case "clean":
      restResampleProb = 0.28 + (1 - expression) * 0.22;
      repeatPitchPenalty = 2.5 + expression;
      harmonyDensity = 0.15 + expression * 0.15;
      maxPolyphonyPerSlot = 1;
      maxSixteenthsPerBar = 8;
      break;
    case "dense":
      restResampleProb = 0.02 + expression * 0.08;
      repeatPitchPenalty = 0.8 + expression * 0.6;
      harmonyDensity = Math.min(0.45, 0.28 + expression * 0.22);
      hybridAccompaniment = true;
      maxPolyphonyPerSlot = 4;
      maxSixteenthsPerBar = 16;
      break;
    case "expressive":
    default:
      maxPolyphonyPerSlot = 1;
      maxSixteenthsPerBar = 12;
      break;
  }

  if (rigidity >= 0.75) {
    maxPolyphonyPerSlot = Math.min(maxPolyphonyPerSlot, style === "dense" ? 3 : 1);
  }

  return {
    restResampleProb,
    repeatPitchPenalty,
    sustainRepeatPenalty,
    maxMelodyNoteDuration: Math.max(1.0, maxMelodyNoteDuration),
    harmonyDensity,
    hybridAccompaniment,
    ghostNoteChance,
    sampleTemperature: temperature * (0.85 + expression * 0.45),
    maxPolyphonyPerSlot,
    maxSixteenthsPerBar,
    rigidity,
    nucleusTopP: Math.max(0.75, Math.min(0.98, nucleusTopP)),
  };
}
