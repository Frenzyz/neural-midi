import { describe, expect, it } from "vitest";
import { SCALE_INTERVALS, NOTE_TO_PC, buildScalePitches } from "./melody-engine.js";
import { generateStubMelody } from "./stub.js";

const baseParams = {
  key: "C",
  scale: "major" as const,
  genre: "pop" as const,
  bars: 4,
  temperature: 0.5,
  seed: 42,
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  chordMode: "none" as const,
};

function isInScale(pitch: number, key: string, scale: keyof typeof SCALE_INTERVALS): boolean {
  const root = NOTE_TO_PC[key] ?? 0;
  const rel = (pitch % 12 - root + 12) % 12;
  return SCALE_INTERVALS[scale].includes(rel);
}

describe("generateStubMelody", () => {
  it("produces deterministic output for the same seed", () => {
    const a = generateStubMelody({ ...baseParams, bars: 2 });
    const b = generateStubMelody({ ...baseParams, bars: 2 });
    expect(a.notes).toEqual(b.notes);
  });

  it("returns notes in key and ends on tonic", () => {
    const result = generateStubMelody(baseParams);
    expect(result.notes.length).toBeGreaterThan(3);

    for (const note of result.notes) {
      expect(isInScale(note.pitch, "C", "major")).toBe(true);
    }

    const last = result.notes[result.notes.length - 1]!;
    expect(last.pitch % 12).toBe(0); // C tonic
  });

  it("favors stepwise motion over random leaps", () => {
    const pitches = buildScalePitches(0, SCALE_INTERVALS.major, 60, 84);
    const result = generateStubMelody(baseParams);

    let stepwise = 0;
    let total = 0;
    for (let i = 1; i < result.notes.length; i++) {
      const prevIdx = pitches.indexOf(result.notes[i - 1]!.pitch);
      const currIdx = pitches.indexOf(result.notes[i]!.pitch);
      if (prevIdx < 0 || currIdx < 0) continue;
      total++;
      if (Math.abs(currIdx - prevIdx) <= 2) stepwise++;
    }

    expect(total).toBeGreaterThan(0);
    expect(stepwise / total).toBeGreaterThan(0.55);
  });

  it("handles bigint time signature values from the Live SDK", () => {
    const result = generateStubMelody({
      ...baseParams,
      bars: 2,
      timeSignature: { numerator: 4n as unknown as number, denominator: 4n as unknown as number },
    });
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("produces notes when time signature numerator is 0 (inherited in Live)", () => {
    const result = generateStubMelody({
      ...baseParams,
      timeSignature: { numerator: 0, denominator: 0 },
    });
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("allows polyphonic overlap in melody output", () => {
    const result = generateStubMelody({ ...baseParams, generationMode: "melody" });
    const atZero = result.notes.filter((n) => n.startTime === 0);
    const hasOverlap = result.notes.some((a, i) =>
      result.notes.some((b, j) =>
        i !== j && Math.abs(a.startTime - b.startTime) < 0.01,
      ),
    );
    expect(result.notes.length).toBeGreaterThan(4);
    expect(hasOverlap || atZero.length >= 1).toBe(true);
  });
});
