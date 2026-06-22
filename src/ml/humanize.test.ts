import { describe, expect, it } from "vitest";
import { addGhostNotes, applySwing, applyVelocityHumanize } from "./humanize.js";
import { mulberry32 } from "./melody-engine.js";

describe("humanize", () => {
  it("applies swing to off-beats", () => {
    const notes = [{ pitch: 60, startTime: 0.25, duration: 0.25, velocity: 80 }];
    const swung = applySwing(notes, 1, 4);
    expect(swung[0]!.startTime).toBeGreaterThan(0.25);
  });

  it("adds ghost notes between gaps", () => {
    const notes = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 90 },
      { pitch: 62, startTime: 1, duration: 0.5, velocity: 85 },
    ];
    const ghosts = addGhostNotes(notes, [60, 62, 64], mulberry32(1), 1);
    expect(ghosts.length).toBeGreaterThan(notes.length);
  });

  it("varies velocity with accents", () => {
    const notes = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 70 },
      { pitch: 62, startTime: 1, duration: 0.5, velocity: 70 },
    ];
    const out = applyVelocityHumanize(notes, mulberry32(2), 12);
    expect(out[0]!.velocity).not.toBe(out[1]!.velocity);
  });
});
