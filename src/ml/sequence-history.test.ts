import { describe, expect, it } from "vitest";
import {
  createHistory,
  currentSnapshot,
  historyBack,
  historyForward,
  historyLabel,
  nextGenerationSeed,
  pushSnapshot,
} from "./sequence-history.js";
import type { MidiNote } from "./types.js";

const note = (p: number, t: number): MidiNote => ({
  pitch: p,
  startTime: t,
  duration: 0.5,
  velocity: 80,
});

describe("sequence-history", () => {
  it("creates history with initial snapshot", () => {
    const h = createHistory([note(60, 0)]);
    expect(h.snapshots).toHaveLength(1);
    expect(historyLabel(h)).toBe("1 / 1");
  });

  it("pushes and truncates forward branch on new generate", () => {
    let h = createHistory([note(60, 0)]);
    h = pushSnapshot(h, [note(62, 0)]);
    h = pushSnapshot(h, [note(64, 0)]);
    expect(h.snapshots).toHaveLength(3);
    h = historyBack(h)!;
    h = pushSnapshot(h, [note(67, 0)]);
    expect(h.snapshots).toHaveLength(3);
    expect(currentSnapshot(h)[0]!.pitch).toBe(67);
    expect(h.index).toBe(2);
  });

  it("navigates back and forward", () => {
    let h = createHistory([note(60, 0)]);
    h = pushSnapshot(h, [note(62, 0)]);
    h = historyBack(h)!;
    expect(currentSnapshot(h)[0]!.pitch).toBe(60);
    h = historyForward(h)!;
    expect(currentSnapshot(h)[0]!.pitch).toBe(62);
  });

  it("increments generation seed with history length", () => {
    expect(nextGenerationSeed(42, 0)).toBe(43);
    expect(nextGenerationSeed(42, 5)).toBe(128);
    expect(nextGenerationSeed(999_999, 0)).toBe(0);
  });
});
