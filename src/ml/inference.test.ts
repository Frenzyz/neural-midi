import { describe, expect, it } from "vitest";
import { generateMelody, isModelLoaded } from "./inference.js";
import { allNotesOnGrid, gridStepBeats, maxNotesPerSlot } from "./grid-quantize.js";
import { maxContinuousSamePitchBeats } from "./post-process.js";
import { maxConsecutiveSamePitch } from "./taste-filter.js";
import type { GenerationParams } from "./types.js";

const params: GenerationParams = {
  key: "C",
  scale: "major",
  genre: "pop",
  bars: 2,
  temperature: 0.6,
  expression: 0.5,
  stylePreset: "expressive",
  tightenPhrasing: false,
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

  it("expressive mode 4-bar melody preserves richness", async () => {
    const result = await generateMelody({
      ...params,
      genre: "lofi",
      generationMode: "melody",
      bars: 4,
      seed: 884568,
      key: "D",
      scale: "major",
      expression: 0.5,
      stylePreset: "expressive",
      tightenPhrasing: false,
    });
    expect(result.notes.length).toBeGreaterThanOrEqual(4);
    const leadNotes = result.notes.filter((n) => n.velocity >= 55);
    expect(leadNotes.length).toBeGreaterThanOrEqual(3);
  });

  it("tighten off keeps more notes than tighten on for same seed", async () => {
    const base = {
      ...params,
      genre: "lofi" as const,
      generationMode: "melody" as const,
      bars: 4,
      seed: 884568,
      key: "D",
    };
    const loose = await generateMelody({ ...base, tightenPhrasing: false });
    const tight = await generateMelody({ ...base, tightenPhrasing: true });
    expect(loose.notes.length).toBeGreaterThanOrEqual(tight.notes.length);
    expect(loose.notes.length).toBeGreaterThanOrEqual(4);
    if (tight.notes.length < loose.notes.length) {
      expect(maxConsecutiveSamePitch(tight.notes)).toBeLessThanOrEqual(
        maxConsecutiveSamePitch(loose.notes),
      );
    }
  });

  it("dense style can add hybrid accompaniment in melody mode", async () => {
    const result = await generateMelody({
      ...params,
      generationMode: "melody",
      stylePreset: "dense",
      expression: 0.7,
      bars: 2,
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
    expect(result.notes.length).toBeGreaterThan(4);
  });

  it("4-bar output avoids sustained single pitch beyond 2 beats", async () => {
    const result = await generateMelody({
      ...params,
      genre: "lofi",
      generationMode: "melody",
      bars: 4,
      seed: 884568,
      key: "D",
      expression: 0.5,
      tightenPhrasing: false,
    });
    expect(result.notes.length).toBeGreaterThanOrEqual(4);
    expect(maxContinuousSamePitchBeats(result.notes)).toBeLessThanOrEqual(2.01);
  });

  it("120 BPM 4/4 output is on 16th grid with bounded slot density", async () => {
    const gridStep = gridStepBeats(4, 16);
    const result = await generateMelody({
      ...params,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      generationMode: "melody",
      bars: 4,
      stylePreset: "dense",
      seed: 437781,
    });
    expect(allNotesOnGrid(result.notes, gridStep)).toBe(true);
    expect(maxNotesPerSlot(result.notes, gridStep)).toBeLessThanOrEqual(1);
  });

  it("8-bar dense hybrid does not stack more than four notes per slot", async () => {
    const gridStep = gridStepBeats(4, 16);
    const result = await generateMelody({
      ...params,
      generationMode: "hybrid",
      bars: 8,
      stylePreset: "dense",
      expression: 0.55,
      seed: 437781,
      chordProgression: [
        {
          startBeat: 0,
          duration: 32,
          rootPc: 0,
          quality: "major",
          pitchClasses: [0, 4, 7],
        },
      ],
    });
    expect(allNotesOnGrid(result.notes, gridStep)).toBe(true);
    expect(maxNotesPerSlot(result.notes, gridStep)).toBeLessThanOrEqual(4);
  });
});
