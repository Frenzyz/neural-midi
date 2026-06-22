import { describe, expect, it } from "vitest";
import { expandedMotifsForGenre } from "./genre-library.js";
import { generateMelody } from "./inference.js";
import { allNotesOnGrid, gridStepBeats } from "./grid-quantize.js";
import {
  createVarietyPlan,
  pitchSequenceFingerprint,
  uniqueFingerprintCount,
} from "./variety.js";
import type { GenerationParams } from "./types.js";

const base: GenerationParams = {
  key: "C",
  scale: "major",
  genre: "pop",
  bars: 4,
  temperature: 0.75,
  expression: 0.6,
  stylePreset: "expressive",
  seed: 100,
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  chordMode: "none",
  generationMode: "melody",
};

describe("variety", () => {
  it("expanded genre library has 10+ fragments per genre", () => {
    const motifs = expandedMotifsForGenre("trap");
    expect(motifs.length).toBeGreaterThanOrEqual(10);
  });

  it("variety plan changes with generation index", () => {
    const a = createVarietyPlan(base, 0);
    const b = createVarietyPlan(base, 3);
    const differs =
      a.motifIndexA !== b.motifIndexA ||
      a.motifIndexB !== b.motifIndexB ||
      a.strategyA !== b.strategyA ||
      a.degreeTranspose !== b.degreeTranspose;
    expect(differs).toBe(true);
  });

  it("10 generations with different seeds produce mostly unique sequences", async () => {
    const fingerprints: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await generateMelody({
        ...base,
        seed: 1000 + i * 137,
        generationIndex: i,
      });
      fingerprints.push(pitchSequenceFingerprint(result.notes));
    }
    expect(uniqueFingerprintCount(fingerprints)).toBeGreaterThanOrEqual(8);
  });

  it("high rigidity keeps all notes on strict 16th grid", async () => {
    const gridStep = gridStepBeats(4, 16);
    const result = await generateMelody({
      ...base,
      stylePreset: "clean",
      expression: 0.2,
      rigidity: 0.95,
      seed: 42,
    });
    expect(allNotesOnGrid(result.notes, gridStep)).toBe(true);
  });
});
