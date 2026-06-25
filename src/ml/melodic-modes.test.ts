import { describe, expect, it } from "vitest";
import {
  applyContourBias,
  CHORD_QUALITY_TECHNIQUE,
  mergeModeIntoParams,
  resolveModeForChord,
  resolveTechniqueMode,
  voicingPitchesForStyle,
} from "./melodic-modes.js";
import { generateChordVoicings } from "./chords.js";
import { resolveExpression } from "./expression.js";
import type { ChordEvent, GenerationParams } from "./types.js";

const base: GenerationParams = {
  key: "C",
  scale: "major",
  genre: "pop",
  bars: 4,
  temperature: 0.7,
  seed: 1,
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  chordMode: "none",
};

function chord(
  rootPc: number,
  quality: ChordEvent["quality"],
  startBeat = 0,
): ChordEvent {
  const intervals: Record<ChordEvent["quality"], number[]> = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dom7: [0, 4, 7, 10],
    min7: [0, 3, 7, 10],
    dim: [0, 3, 6],
    sus: [0, 5, 7],
  };
  const iv = intervals[quality];
  return {
    startBeat,
    duration: 4,
    rootPc,
    quality,
    pitchClasses: iv.map((i) => (rootPc + i) % 12),
  };
}

describe("melodic technique modes", () => {
  it("maps chord qualities to emotion techniques", () => {
    expect(resolveModeForChord(chord(0, "major"))).toBe("bright");
    expect(resolveModeForChord(chord(0, "minor"))).toBe("melancholy");
    expect(resolveModeForChord(chord(0, "dim"))).toBe("tension");
    expect(resolveModeForChord(chord(0, "sus"))).toBe("mystery");
    expect(CHORD_QUALITY_TECHNIQUE.min7).toBe("intimate");
  });

  it("auto-resolves from progression with M III m sadness CR", () => {
    const progression = [chord(0, "major", 0), chord(4, "minor", 4)];
    const mode = resolveTechniqueMode({ ...base, melodicTechniqueMode: "auto", chordProgression: progression });
    expect(mode).toBe("melancholy");
  });

  it("respects explicit technique override", () => {
    const mode = resolveTechniqueMode({ ...base, melodicTechniqueMode: "triumphant" });
    expect(mode).toBe("triumphant");
  });

  it("mergeModeIntoParams shifts expression for melancholy", () => {
    const merged = mergeModeIntoParams({ ...base, expression: 0.5, melodicTechniqueMode: "melancholy" }, "melancholy");
    expect(merged.expression).toBeLessThan(0.5);
  });

  it("resolveExpression applies technique voicing and contour", () => {
    const expr = resolveExpression({ ...base, melodicTechniqueMode: "tension" });
    expect(expr.voicingStyle).toBe("shell");
    expect(expr.contour).toBe("wave");
    expect(expr.maxLeap).toBeGreaterThan(10);
  });

  it("voicing styles produce different spreads", () => {
    const c = chord(0, "major");
    const close = voicingPitchesForStyle(c, "close", 60);
    const open = voicingPitchesForStyle(c, "open", 60);
    const shell = voicingPitchesForStyle(c, "shell", 60);
    expect(open[open.length - 1]! - open[0]!).toBeGreaterThan(close[close.length - 1]! - close[0]!);
    expect(shell.length).toBeLessThanOrEqual(3);
  });

  it("generateChordVoicings uses open voicing when requested", () => {
    const progression = [chord(0, "major", 0), chord(5, "minor", 4)];
    const close = generateChordVoicings({
      beatsPerBar: 4,
      bars: 2,
      progression,
      voicingStyle: "close",
    });
    const open = generateChordVoicings({
      beatsPerBar: 4,
      bars: 2,
      progression,
      voicingStyle: "open",
    });
    const closeSpan = Math.max(...close.map((n) => n.pitch)) - Math.min(...close.map((n) => n.pitch));
    const openSpan = Math.max(...open.map((n) => n.pitch)) - Math.min(...open.map((n) => n.pitch));
    expect(openSpan).toBeGreaterThan(closeSpan);
  });

  it("applyContourBias nudges ascending contour upward", () => {
    const notes = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 80 },
      { pitch: 60, startTime: 2, duration: 0.5, velocity: 80 },
      { pitch: 60, startTime: 3.5, duration: 0.5, velocity: 80 },
    ];
    const scale = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
    const shaped = applyContourBias(notes, "ascending", 4, scale, 0.5);
    expect(shaped[2]!.pitch).toBeGreaterThanOrEqual(shaped[0]!.pitch);
  });
});
