import { describe, expect, it } from "vitest";
import { remapPitch, remapToScale } from "./scale-remap.js";
import type { MidiNote } from "./types.js";

describe("scale-remap", () => {
  const notes: MidiNote[] = [
    { pitch: 60, startTime: 0, duration: 0.5, velocity: 100 },
    { pitch: 64, startTime: 0.5, duration: 0.5, velocity: 90 },
    { pitch: 67, startTime: 1, duration: 0.5, velocity: 95 },
  ];

  it("preserves notes when key and scale unchanged", () => {
    const out = remapToScale(notes, "C", "major", "C", "major");
    expect(out.map((n) => n.pitch)).toEqual([60, 64, 67]);
  });

  it("transposes C major triad to G major", () => {
    const out = remapToScale(notes, "C", "major", "G", "major");
    expect(out[0]!.pitch).toBe(67);
    expect(out[1]!.pitch).toBe(71);
    expect(out[2]!.pitch).toBe(74);
  });

  it("remaps single pitch to target scale", () => {
    expect(remapPitch(61, "C", "major", "C", "natural-minor")).toBe(60);
  });
});
