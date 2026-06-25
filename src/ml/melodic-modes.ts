/**
 * Melodic technique modes informed by chord–emotion associations
 * (Tabletop Composer chord relationships; Juslin & Västfjäll 2008, PMC3764399).
 */
import type { ChordEvent, ChordQuality, GenerationParams, MidiNote } from "./types.js";

export type MelodicTechniqueMode =
  | "auto"
  | "bright"
  | "melancholy"
  | "tension"
  | "hopeful"
  | "mystery"
  | "triumphant"
  | "intimate";

export type VoicingStyle = "close" | "open" | "shell" | "color";

export type ContourPreference = "ascending" | "descending" | "arch" | "wave" | "neutral";

export interface TechniqueProfile {
  label: string;
  /** 0 = leap-friendly, 1 = stepwise bias. */
  intervalStepBias: number;
  restResampleMult: number;
  repeatPitchPenaltyMult: number;
  harmonyDensityMult: number;
  expressionBias: number;
  contour: ContourPreference;
  voicingStyle: VoicingStyle;
  cadenceStrength: number;
  maxLeap: number;
  velocityBias: number;
}

/** Chord-quality → default technique when mode is `auto`. */
export const CHORD_QUALITY_TECHNIQUE: Record<
  ChordQuality,
  Exclude<MelodicTechniqueMode, "auto">
> = {
  major: "bright",
  minor: "melancholy",
  dom7: "tension",
  min7: "intimate",
  dim: "tension",
  sus: "mystery",
};

export const TECHNIQUE_PROFILES: Record<Exclude<MelodicTechniqueMode, "auto">, TechniqueProfile> = {
  bright: {
    label: "Bright",
    intervalStepBias: 0.45,
    restResampleMult: 0.85,
    repeatPitchPenaltyMult: 1.1,
    harmonyDensityMult: 1.0,
    expressionBias: 0.1,
    contour: "ascending",
    voicingStyle: "close",
    cadenceStrength: 0.55,
    maxLeap: 10,
    velocityBias: 6,
  },
  melancholy: {
    label: "Melancholy",
    intervalStepBias: 0.82,
    restResampleMult: 1.35,
    repeatPitchPenaltyMult: 1.25,
    harmonyDensityMult: 0.7,
    expressionBias: -0.08,
    contour: "descending",
    voicingStyle: "close",
    cadenceStrength: 0.4,
    maxLeap: 7,
    velocityBias: -8,
  },
  tension: {
    label: "Tension",
    intervalStepBias: 0.35,
    restResampleMult: 0.7,
    repeatPitchPenaltyMult: 0.85,
    harmonyDensityMult: 1.15,
    expressionBias: 0.15,
    contour: "wave",
    voicingStyle: "shell",
    cadenceStrength: 0.25,
    maxLeap: 12,
    velocityBias: 4,
  },
  hopeful: {
    label: "Hopeful",
    intervalStepBias: 0.55,
    restResampleMult: 1.0,
    repeatPitchPenaltyMult: 1.0,
    harmonyDensityMult: 0.95,
    expressionBias: 0.05,
    contour: "arch",
    voicingStyle: "open",
    cadenceStrength: 0.75,
    maxLeap: 9,
    velocityBias: 3,
  },
  mystery: {
    label: "Mystery",
    intervalStepBias: 0.6,
    restResampleMult: 1.2,
    repeatPitchPenaltyMult: 1.15,
    harmonyDensityMult: 0.85,
    expressionBias: -0.05,
    contour: "wave",
    voicingStyle: "open",
    cadenceStrength: 0.35,
    maxLeap: 8,
    velocityBias: -4,
  },
  triumphant: {
    label: "Triumphant",
    intervalStepBias: 0.3,
    restResampleMult: 0.75,
    repeatPitchPenaltyMult: 0.9,
    harmonyDensityMult: 1.1,
    expressionBias: 0.18,
    contour: "ascending",
    voicingStyle: "open",
    cadenceStrength: 0.85,
    maxLeap: 14,
    velocityBias: 10,
  },
  intimate: {
    label: "Intimate",
    intervalStepBias: 0.88,
    restResampleMult: 1.45,
    repeatPitchPenaltyMult: 1.35,
    harmonyDensityMult: 0.6,
    expressionBias: -0.12,
    contour: "arch",
    voicingStyle: "close",
    cadenceStrength: 0.5,
    maxLeap: 5,
    velocityBias: -10,
  },
};

export const TECHNIQUE_MODE_OPTIONS: { value: MelodicTechniqueMode; label: string }[] = [
  { value: "auto", label: "Auto (from chords)" },
  { value: "bright", label: "Bright" },
  { value: "melancholy", label: "Melancholy" },
  { value: "tension", label: "Tension" },
  { value: "hopeful", label: "Hopeful" },
  { value: "mystery", label: "Mystery" },
  { value: "triumphant", label: "Triumphant" },
  { value: "intimate", label: "Intimate" },
];

export function resolveModeForChord(
  chord: ChordEvent | undefined,
): Exclude<MelodicTechniqueMode, "auto"> {
  if (!chord) return "bright";
  return CHORD_QUALITY_TECHNIQUE[chord.quality];
}

/** Weighted vote across progression; major→minor transitions bias melancholy (M III m CR). */
export function resolveTechniqueMode(params: GenerationParams): Exclude<MelodicTechniqueMode, "auto"> {
  const requested = params.melodicTechniqueMode ?? "auto";
  const progression = params.chordProgression ?? [];

  if (requested !== "auto") {
    return requested;
  }

  if (progression.length === 0) {
    return params.scale === "natural-minor" || params.scale === "phrygian" ? "melancholy" : "bright";
  }

  const scores = new Map<Exclude<MelodicTechniqueMode, "auto">, number>();
  const bump = (mode: Exclude<MelodicTechniqueMode, "auto">, weight: number): void => {
    scores.set(mode, (scores.get(mode) ?? 0) + weight);
  };

  for (const chord of progression) {
    bump(CHORD_QUALITY_TECHNIQUE[chord.quality], Math.max(0.25, chord.duration));
  }

  for (let i = 1; i < progression.length; i++) {
    const prev = progression[i - 1]!;
    const cur = progression[i]!;
    const interval = (cur.rootPc - prev.rootPc + 12) % 12;
    if (prev.quality === "major" && cur.quality === "minor" && interval === 4) {
      bump("melancholy", 2);
    }
    if (prev.quality === "minor" && cur.quality === "major" && (interval === 8 || interval === 9)) {
      bump("hopeful", 2);
    }
    if (cur.quality === "dim" || prev.quality === "dim") {
      bump("tension", 1.5);
    }
    if (cur.quality === "sus" || prev.quality === "sus") {
      bump("mystery", 1.2);
    }
  }

  let best: Exclude<MelodicTechniqueMode, "auto"> = resolveModeForChord(progression[0]);
  let bestScore = -1;
  for (const [mode, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = mode;
    }
  }
  return best;
}

export function getTechniqueProfile(
  mode: Exclude<MelodicTechniqueMode, "auto">,
): TechniqueProfile {
  return TECHNIQUE_PROFILES[mode];
}

export function mergeModeIntoParams(
  params: GenerationParams,
  mode?: Exclude<MelodicTechniqueMode, "auto">,
): GenerationParams {
  const resolved = mode ?? resolveTechniqueMode(params);
  const profile = getTechniqueProfile(resolved);
  const baseExpr = params.expression ?? 0.5;
  const shifted = Math.max(0, Math.min(1, baseExpr + profile.expressionBias));
  return {
    ...params,
    expression: shifted,
    melodicTechniqueMode: params.melodicTechniqueMode ?? "auto",
  };
}

export function voicingPitchesForStyle(
  chord: ChordEvent,
  style: VoicingStyle,
  centerMidi = 60,
): number[] {
  const root = chord.rootPc;
  const triad =
    chord.pitchClasses.length >= 3
      ? [...chord.pitchClasses]
      : [root, (root + (chord.quality === "minor" || chord.quality === "min7" ? 3 : 4)) % 12, (root + 7) % 12];

  let pcs: number[];
  switch (style) {
    case "shell": {
      const third = triad.find((pc) => pc !== root && pc !== (root + 7) % 12) ?? triad[1]!;
      const seventh =
        chord.quality === "dom7" || chord.quality === "min7"
          ? (root + 10) % 12
          : (root + 7) % 12;
      pcs = [root, third, seventh];
      break;
    }
    case "color": {
      pcs = [...triad];
      const add9 = (root + 2) % 12;
      if (!pcs.includes(add9)) pcs.push(add9);
      if (chord.quality === "major" && !pcs.includes((root + 11) % 12)) {
        pcs.push((root + 11) % 12);
      }
      break;
    }
    case "open": {
      pcs = [root, triad[1] ?? (root + 4) % 12, triad[2] ?? (root + 7) % 12];
      break;
    }
    case "close":
    default:
      pcs = triad;
      break;
  }

  const baseOct = Math.floor(centerMidi / 12);
  const voicing: number[] = [];

  if (style === "open") {
    voicing.push((baseOct - 1) * 12 + pcs[0]!);
    voicing.push(baseOct * 12 + (pcs[1] ?? pcs[0]!));
    voicing.push((baseOct + 1) * 12 + (pcs[2] ?? pcs[1] ?? pcs[0]!));
    if (pcs.length > 3) voicing.push((baseOct + 1) * 12 + pcs[3]!);
  } else {
    for (const pc of pcs) {
      let pitch = baseOct * 12 + pc;
      if (pitch < centerMidi - 6) pitch += 12;
      if (pitch > centerMidi + 14) pitch -= 12;
      voicing.push(pitch);
    }
  }

  return [...new Set(voicing)].sort((a, b) => a - b);
}

/** Light contour shaping on lead notes across the clip. */
export function applyContourBias(
  notes: MidiNote[],
  contour: ContourPreference,
  totalBeats: number,
  scalePitches: number[],
  strength = 0.35,
): MidiNote[] {
  if (notes.length === 0 || contour === "neutral" || scalePitches.length === 0 || strength <= 0) {
    return notes;
  }

  const leadMin = 55;
  return notes.map((n) => {
    if (n.velocity < leadMin) return n;
    const t = totalBeats > 0 ? n.startTime / totalBeats : 0;
    let bias = 0;
    switch (contour) {
      case "ascending":
        bias = t;
        break;
      case "descending":
        bias = 1 - t;
        break;
      case "arch":
        bias = 1 - Math.abs(t - 0.5) * 2;
        break;
      case "wave":
        bias = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        break;
    }

    const steps = Math.round(bias * strength * 4);
    if (steps === 0) return n;

    let idx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < scalePitches.length; i++) {
      const d = Math.abs(scalePitches[i]! - n.pitch);
      if (d < bestDist) {
        bestDist = d;
        idx = i;
      }
    }

    const targetIdx =
      contour === "descending"
        ? Math.max(0, idx - steps)
        : Math.min(scalePitches.length - 1, idx + steps);
    const pitch = scalePitches[targetIdx] ?? n.pitch;
    return { ...n, pitch };
  });
}

export function techniqueModeHint(
  params: GenerationParams,
  chordLabel?: string,
): string {
  const resolved = resolveTechniqueMode(params);
  const profile = getTechniqueProfile(resolved);
  const from = chordLabel ? ` from ${chordLabel}` : "";
  if ((params.melodicTechniqueMode ?? "auto") === "auto") {
    return `Auto → ${profile.label}${from}`;
  }
  return profile.label;
}
