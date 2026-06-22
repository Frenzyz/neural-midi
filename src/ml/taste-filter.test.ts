import { describe, expect, it } from "vitest";
import {
  applyTasteFilter,
  distinctDurationsInRange,
  maxConsecutiveSamePitch,
} from "./taste-filter.js";
import type { MidiNote } from "./types.js";
import { GRID } from "./pattern-engine.js";

function machineGunLine(pitch: number, start: number, count: number): MidiNote[] {
  const notes: MidiNote[] = [];
  for (let i = 0; i < count; i++) {
    notes.push({
      pitch,
      startTime: start + i * GRID,
      duration: GRID,
      velocity: 80,
    });
  }
  return notes;
}

describe("taste-filter", () => {
  it("collapses long same-pitch machine-gun runs", () => {
    const raw = machineGunLine(64, 0, 32);
    const filtered = applyTasteFilter(raw, {
      mode: "melody",
      beatsPerBar: 4,
      bars: 8,
      seed: 42,
      genre: "lofi",
    });
    expect(filtered.length).toBeLessThan(raw.length);
    expect(maxConsecutiveSamePitch(filtered)).toBeLessThanOrEqual(3);
  });

  it("limits consecutive same pitch on lead to at most 3", () => {
    const raw: MidiNote[] = [];
    for (let bar = 0; bar < 8; bar++) {
      raw.push(...machineGunLine(67, bar * 4, 16));
    }
    const filtered = applyTasteFilter(raw, {
      mode: "melody",
      beatsPerBar: 4,
      bars: 8,
      seed: 99,
    });
    expect(maxConsecutiveSamePitch(filtered)).toBeLessThanOrEqual(3);
  });

  it("produces at least two distinct durations per 4 bars", () => {
    const raw: MidiNote[] = [];
    for (let i = 0; i < 16; i++) {
      raw.push({
        pitch: 60 + (i % 3) * 2,
        startTime: i * GRID,
        duration: GRID,
        velocity: 80,
      });
    }
    const filtered = applyTasteFilter(raw, {
      mode: "melody",
      beatsPerBar: 4,
      bars: 4,
      seed: 7,
    });
    expect(distinctDurationsInRange(filtered, 0, 16)).toBeGreaterThanOrEqual(2);
  });
});
