import { describe, expect, it } from "vitest";
import {
  mergeRegionNotes,
  normalizeSelection,
  notesToPreviewEvents,
  regionBars,
} from "./sequence.js";
import type { MidiNote } from "./types.js";

describe("sequence", () => {
  it("normalizes selection to grid and minimum span", () => {
    const sel = normalizeSelection(1.1, 1.2, 16);
    expect(sel.start).toBe(1);
    expect(sel.end).toBe(1.25);
  });

  it("merges generated notes into a region", () => {
    const existing: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      { pitch: 62, startTime: 4, duration: 1, velocity: 100 },
    ];
    const generated: MidiNote[] = [
      { pitch: 72, startTime: 0, duration: 0.5, velocity: 90 },
      { pitch: 74, startTime: 0.5, duration: 0.5, velocity: 90 },
    ];
    const merged = mergeRegionNotes(existing, 2, 4, generated);
    expect(merged).toHaveLength(4);
    expect(merged.some((n) => n.pitch === 72 && n.startTime === 2)).toBe(true);
    expect(merged.some((n) => n.startTime === 4 && n.pitch === 62)).toBe(true);
    expect(merged.some((n) => n.startTime === 0)).toBe(true);
  });

  it("computes region bar count", () => {
    expect(regionBars(0, 4, 4)).toBe(1);
    expect(regionBars(0, 8, 4)).toBe(2);
  });

  it("builds preview events from notes", () => {
    const events = notesToPreviewEvents(
      [{ pitch: 69, startTime: 1, duration: 0.5, velocity: 100 }],
      120,
    );
    expect(events[0]!.frequency).toBeCloseTo(440, 0);
    expect(events[0]!.startTime).toBeCloseTo(0.5, 2);
  });
});
