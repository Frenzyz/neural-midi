import { describe, expect, it } from "vitest";
import {
  GRID_BEATS,
  barIndexFromX,
  barsToBeatRange,
  beatRangeToBars,
  hitTestNote,
  maxContinuousSamePitchBeats,
  noteCanvasRect,
  quantizeBeat,
  removeNoteAtIndex,
  snapPitchToScale,
  toggleBarSelection,
} from "./sequence-interaction.js";

describe("sequence-interaction", () => {
  it("quantizes to 16th grid", () => {
    expect(quantizeBeat(1.13, GRID_BEATS)).toBe(1.25);
    expect(quantizeBeat(1.1, GRID_BEATS)).toBe(1);
  });

  it("maps x position to bar index", () => {
    expect(barIndexFromX(50, 400, 4)).toBe(0);
    expect(barIndexFromX(350, 400, 4)).toBe(3);
  });

  it("converts bar selection to beat range", () => {
    expect(barsToBeatRange([1, 2], 4)).toEqual({ start: 4, end: 12 });
    expect(barsToBeatRange([], 4)).toEqual({ start: 0, end: 4 });
  });

  it("converts beat range to bars", () => {
    expect(beatRangeToBars(4, 8, 4, 8)).toEqual([1]);
    expect(beatRangeToBars(0, 8, 4, 8)).toEqual([0, 1]);
  });

  it("toggles bar selection", () => {
    expect(toggleBarSelection([0], 2, true, 4)).toEqual([0, 2]);
    expect(toggleBarSelection([0, 2], 1, false, 4)).toEqual([1]);
  });

  it("hit-tests note zones", () => {
    const rect = { x: 100, y: 50, w: 40, h: 14 };
    expect(hitTestNote(105, 55, rect)).toBe("resize-left");
    expect(hitTestNote(135, 55, rect)).toBe("resize-right");
    expect(hitTestNote(120, 55, rect)).toBe("body");
    expect(hitTestNote(90, 55, rect)).toBe(null);
  });

  it("snaps pitch to scale", () => {
    const pc: Record<string, number> = { C: 0 };
    const intervals: Record<string, number[]> = { major: [0, 2, 4, 5, 7, 9, 11] };
    expect(snapPitchToScale(61, "C", "major", pc, intervals)).toBe(60);
  });

  it("computes note canvas rect", () => {
    const r = noteCanvasRect(0, 1, 60, 400, 200, 4, 48, 84, 14);
    expect(r.w).toBeGreaterThan(0);
    expect(r.y).toBeLessThan(200);
  });

  it("removes note at index from array", () => {
    const notes = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 80 },
      { pitch: 62, startTime: 1, duration: 0.5, velocity: 76 },
      { pitch: 64, startTime: 2, duration: 0.5, velocity: 82 },
    ];
    const out = removeNoteAtIndex(notes, 1);
    expect(out).toHaveLength(2);
    expect(out.map((n) => n.pitch)).toEqual([60, 64]);
    expect(removeNoteAtIndex(notes, -1)).toBe(notes);
    expect(removeNoteAtIndex(notes, 99)).toBe(notes);
  });

  it("measures continuous same-pitch span", () => {
    const notes = [
      { pitch: 60, startTime: 0, duration: 1.0, velocity: 80 },
      { pitch: 60, startTime: 1.0, duration: 1.5, velocity: 78 },
      { pitch: 62, startTime: 3, duration: 0.5, velocity: 80 },
    ];
    expect(maxContinuousSamePitchBeats(notes)).toBeCloseTo(2.5, 2);
  });
});
