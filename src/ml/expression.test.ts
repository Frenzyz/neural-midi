import { describe, expect, it } from "vitest";
import { resolveExpression } from "./expression.js";
import type { GenerationParams } from "./types.js";

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

describe("resolveExpression", () => {
  it("applies genre-specific sampling priors", () => {
    const trap = resolveExpression({ ...base, genre: "trap" });
    const ambient = resolveExpression({ ...base, genre: "ambient" });
    expect(ambient.sampleTemperature).toBeLessThan(trap.sampleTemperature);
    expect(trap.durationChoices[0]).toBeLessThan(ambient.durationChoices[0]!);
    expect(ambient.scaleLockStrength).toBeGreaterThan(trap.scaleLockStrength);
  });

  it("style preset bundles adjust rigidity and scale lock", () => {
    const clean = resolveExpression({ ...base, stylePreset: "clean", expression: 0.2 });
    const dense = resolveExpression({ ...base, stylePreset: "dense", expression: 0.8 });
    expect(clean.rigidity).toBeGreaterThan(dense.rigidity);
    expect(clean.scaleLockStrength).toBeGreaterThan(dense.scaleLockStrength);
  });
});
