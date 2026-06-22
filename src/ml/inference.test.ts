import { describe, expect, it } from "vitest";
import { generateMelody, isModelLoaded } from "./inference.js";
import { distinctDurationsInRange, maxConsecutiveSamePitch } from "./taste-filter.js";
import type { GenerationParams } from "./types.js";

const params: GenerationParams = {
  key: "C",
  scale: "major",
  genre: "pop",
  bars: 2,
  temperature: 0.6,
  seed: 7,
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  chordMode: "none",
};

describe("inference", () => {
  it("falls back to stub when ONNX not loaded", async () => {
    const result = await generateMelody(params);
    expect(result.notes.length).toBeGreaterThan(0);
    if (!isModelLoaded()) {
      expect(result.usedStub).toBe(true);
    }
  });

  it("uses chord progression in stub path", async () => {
    const result = await generateMelody({
      ...params,
      chordProgression: [
        {
          startBeat: 0,
          duration: 4,
          rootPc: 0,
          quality: "major",
          pitchClasses: [0, 4, 7],
        },
      ],
    });
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("generates chord-only voicings in chords mode", async () => {
    const result = await generateMelody({
      ...params,
      generationMode: "chords",
      bars: 2,
    });
    expect(result.notes.length).toBeGreaterThanOrEqual(6);
    expect(result.notes.some((n) => n.startTime === 0)).toBe(true);
  });

  it("4-bar lofi melody has balanced density", async () => {
    const result = await generateMelody({
      ...params,
      genre: "lofi",
      generationMode: "melody",
      bars: 4,
      seed: 884568,
      key: "D",
      scale: "major",
    });
    expect(result.notes.length).toBeGreaterThanOrEqual(6);
    expect(maxConsecutiveSamePitch(result.notes)).toBeLessThanOrEqual(3);
    expect(distinctDurationsInRange(result.notes, 0, 16)).toBeGreaterThanOrEqual(2);
  });

  it("8-bar lofi melody avoids machine-gun repetition", async () => {
    const result = await generateMelody({
      ...params,
      genre: "lofi",
      generationMode: "melody",
      bars: 8,
      seed: 115022,
      key: "D",
    });
    expect(result.notes.length).toBeGreaterThan(0);
    expect(maxConsecutiveSamePitch(result.notes)).toBeLessThanOrEqual(3);
    expect(distinctDurationsInRange(result.notes, 0, 16)).toBeGreaterThanOrEqual(2);
  });
});
