import { describe, expect, it } from "vitest";
import { chordVoicingPitches, generateChordVoicings, generateHybridChordStabs } from "./chords.js";

describe("chord voicing generation", () => {
  const progression = [
    {
      startBeat: 0,
      duration: 4,
      rootPc: 0,
      quality: "major" as const,
      pitchClasses: [0, 4, 7],
    },
    {
      startBeat: 4,
      duration: 4,
      rootPc: 5,
      quality: "minor" as const,
      pitchClasses: [5, 8, 0],
    },
  ];

  it("voices C major close position", () => {
    const v = chordVoicingPitches(progression[0]!);
    expect(v.length).toBe(3);
    expect(v.map((p) => p % 12).sort()).toEqual([0, 4, 7]);
  });

  it("generates polyphonic chord blocks", () => {
    const notes = generateChordVoicings({
      beatsPerBar: 4,
      bars: 2,
      progression,
    });
    expect(notes.length).toBeGreaterThanOrEqual(6);
    const bar0 = notes.filter((n) => n.startTime < 4);
    expect(bar0.length).toBeGreaterThanOrEqual(3);
  });

  it("generates hybrid stabs on strong beats", () => {
    const stabs = generateHybridChordStabs(progression, 4, 2, "pluck");
    expect(stabs.some((n) => n.startTime === 0)).toBe(true);
    expect(stabs.some((n) => n.startTime === 2)).toBe(true);
  });
});
