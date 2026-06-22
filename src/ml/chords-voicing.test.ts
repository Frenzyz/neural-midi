import { describe, expect, it } from "vitest";
import { chordVoicingPitches, generateChordVoicings, generateHybridAccompaniment, generateHybridChordStabs } from "./chords.js";

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

  it("voices C major close position with extensions when rich", () => {
    const v = chordVoicingPitches(progression[0]!, 48, true);
    expect(v.length).toBeGreaterThanOrEqual(3);
    expect(v.map((p) => p % 12).sort()).toContain(0);
  });

  it("generates polyphonic chord blocks", () => {
    const notes = generateChordVoicings({
      beatsPerBar: 4,
      bars: 2,
      progression,
    });
    expect(notes.length).toBeGreaterThanOrEqual(12);
    const bar0 = notes.filter((n) => n.startTime < 4);
    expect(bar0.length).toBeGreaterThanOrEqual(3);
  });

  it("generates hybrid accompaniment with hits and arpeggios", () => {
    const acc = generateHybridAccompaniment(progression, 4, 2, "pluck", () => 0.1);
    expect(acc.length).toBeGreaterThan(12);
    expect(acc.some((n) => n.startTime === 0)).toBe(true);
    expect(acc.some((n) => n.startTime > 0 && n.startTime < 4)).toBe(true);
  });

  it("generates hybrid stabs on strong beats", () => {
    const stabs = generateHybridChordStabs(progression, 4, 2, "pluck");
    expect(stabs.some((n) => n.startTime === 0)).toBe(true);
    expect(stabs.some((n) => n.startTime === 2)).toBe(true);
  });
});
