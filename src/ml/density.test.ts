import { describe, expect, it } from "vitest";
import {
  averagePolyphony,
  boostDensityIfSparse,
  meetsDensityTarget,
  notesPerBar,
} from "./density.js";
import type { MidiNote } from "./types.js";

const sparse: MidiNote[] = [
  { pitch: 60, startTime: 0, duration: 1, velocity: 80 },
  { pitch: 62, startTime: 4, duration: 1, velocity: 80 },
];

const progression = [
  {
    startBeat: 0,
    duration: 16,
    rootPc: 0,
    quality: "major" as const,
    pitchClasses: [0, 4, 7],
  },
];

describe("density helpers", () => {
  it("computes notes per bar", () => {
    expect(notesPerBar(sparse, 4, 4)).toBe(0.5);
  });

  it("detects sparse output below hybrid target", () => {
    expect(meetsDensityTarget(sparse, 4, 4, "hybrid")).toBe(false);
  });

  it("boosts sparse hybrid output toward hybrid density", () => {
    const boosted = boostDensityIfSparse(sparse, progression, 4, 4, "hybrid", 42);
    expect(boosted.length).toBeGreaterThan(sparse.length);
    expect(averagePolyphony(boosted, 16)).toBeGreaterThan(averagePolyphony(sparse, 16));
  });
});
