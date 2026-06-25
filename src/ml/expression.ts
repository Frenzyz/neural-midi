import type { GenerationParams, StylePreset } from "./types.js";
import { genreInferencePriors } from "./genre-library.js";
import { getTechniqueProfile, mergeModeIntoParams, resolveTechniqueMode } from "./melodic-modes.js";
import type { ContourPreference, VoicingStyle } from "./melodic-modes.js";
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
  /** 0–1 ONNX logit penalty for out-of-scale pitch classes. */
  scaleLockStrength: number;
  durationChoices: number[];
  durationWeights: number[];
  /** Resolved technique mode (after `auto`). */
  resolvedTechniqueMode: Exclude<import("./types.js").MelodicTechniqueMode, "auto">;
  contour: ContourPreference;
  voicingStyle: VoicingStyle;
  cadenceStrength: number;
  maxLeap: number;
  intervalStepBias: number;
  velocityBias: number;
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
  const merged = mergeModeIntoParams(params);
  const expression = Math.max(0, Math.min(1, toNumber(merged.expression, DEFAULT_EXPRESSION)));
  const style = merged.stylePreset ?? DEFAULT_STYLE;
  const temperature = Math.max(0.1, toNumber(merged.temperature, 0.7));
  const rigidity = resolveRigidity(merged);
  const genre = genreInferencePriors(merged.genre);
  const resolvedTechniqueMode = resolveTechniqueMode(merged);
  const technique = getTechniqueProfile(resolvedTechniqueMode);

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

  const sampleTemperature =
    temperature * (0.85 + expression * 0.45) * genre.temperatureMult;
  const nucleusTopPClamped = Math.max(
    0.75,
    Math.min(0.98, nucleusTopP * genre.nucleusTopP / 0.9),
  );
  const scaleLockStrength = Math.min(
    1,
    genre.scaleLockStrength * (0.55 + rigidity * 0.45),
  );

  const stepBlend = technique.intervalStepBias;
  const adjustedRepeatPenalty =
    repeatPitchPenalty *
    genre.repeatPitchPenaltyMult *
    technique.repeatPitchPenaltyMult *
    (0.75 + stepBlend * 0.5);
  const adjustedRestProb =
    restResampleProb * genre.restResampleMult * technique.restResampleMult;
  const adjustedHarmony = harmonyDensity * technique.harmonyDensityMult;

  return {
    restResampleProb: adjustedRestProb,
    repeatPitchPenalty: adjustedRepeatPenalty,
    sustainRepeatPenalty,
    maxMelodyNoteDuration: Math.max(1.0, maxMelodyNoteDuration),
    harmonyDensity: adjustedHarmony,
    hybridAccompaniment,
    ghostNoteChance,
    sampleTemperature: Math.max(0.1, sampleTemperature),
    maxPolyphonyPerSlot,
    maxSixteenthsPerBar,
    rigidity,
    nucleusTopP: nucleusTopPClamped,
    scaleLockStrength,
    durationChoices: genre.durationChoices,
    durationWeights: genre.durationWeights,
    resolvedTechniqueMode,
    contour: technique.contour,
    voicingStyle: technique.voicingStyle,
    cadenceStrength: technique.cadenceStrength,
    maxLeap: technique.maxLeap,
    intervalStepBias: technique.intervalStepBias,
    velocityBias: technique.velocityBias,
  };
}
