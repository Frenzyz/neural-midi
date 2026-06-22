import { describe, expect, it } from "vitest";
import { generateStubMelody } from "../src/ml/stub.js";

describe("generateStubMelody", () => {
  it("produces deterministic output for the same seed", () => {
    const params = {
      key: "C",
      scale: "major" as const,
      genre: "pop" as const,
      bars: 2,
      temperature: 0.5,
      seed: 42,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
    };

    const a = generateStubMelody(params);
    const b = generateStubMelody(params);
    expect(a.notes).toEqual(b.notes);
  });

  it("returns at least one note", () => {
    const result = generateStubMelody({
      key: "A",
      scale: "natural-minor",
      genre: "trap",
      bars: 4,
      temperature: 0.8,
      seed: 123,
      tempo: 140,
      timeSignature: { numerator: 4, denominator: 4 },
    });

    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.usedStub).toBe(true);
  });
});
