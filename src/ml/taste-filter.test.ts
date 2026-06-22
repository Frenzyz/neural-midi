import { describe, expect, it } from "vitest";
import {
  applyLightTasteFilter,
  distinctDurationsInRange,
  ensureMinimumPhraseDensity,
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
  it("collapses only extreme machine-gun runs of 7+ same-pitch 16ths", () => {
    const raw = machineGunLine(64, 0, 32);
    const filtered = applyLightTasteFilter(raw, { mode: "melody", seed: 42 });
    expect(filtered.length).toBeLessThan(raw.length);
    expect(maxConsecutiveSamePitch(filtered)).toBeLessThanOrEqual(4);
  });

  it("preserves sparse melodic input", () => {
    const sparse: MidiNote[] = [
      { pitch: 64, startTime: 0, duration: 1.0, velocity: 80 },
      { pitch: 66, startTime: 2, duration: 0.75, velocity: 76 },
      { pitch: 64, startTime: 4, duration: 1.25, velocity: 82 },
      { pitch: 62, startTime: 6, duration: 1.0, velocity: 78 },
    ];
    const filtered = applyLightTasteFilter(sparse, { mode: "melody", seed: 42 });
    expect(filtered.length).toBe(sparse.length);
  });

  it("limits consecutive same pitch on lead to at most 4", () => {
    const raw: MidiNote[] = [];
    for (let bar = 0; bar < 8; bar++) {
      raw.push(...machineGunLine(67, bar * 4, 16));
    }
    const filtered = applyLightTasteFilter(raw, { mode: "melody", seed: 99 });
    expect(maxConsecutiveSamePitch(filtered)).toBeLessThanOrEqual(4);
  });

  it("ensureMinimumPhraseDensity is a no-op (density at generation time)", () => {
    const sparse: MidiNote[] = [
      { pitch: 64, startTime: 0, duration: 1.0, velocity: 80 },
    ];
    expect(ensureMinimumPhraseDensity(sparse)).toBe(sparse);
  });

  it("distinctDurationsInRange counts quantized lengths", () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 80 },
      { pitch: 62, startTime: 1, duration: 1.0, velocity: 80 },
    ];
    expect(distinctDurationsInRange(notes, 0, 4)).toBe(2);
  });
});
