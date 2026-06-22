import { describe, expect, it } from "vitest";
import {
  allNotesOnGrid,
  applyGridPipeline,
  capBarGridDensity,
  gridStepBeats,
  maxNotesPerSlot,
  quantizeNotesToGrid,
  resolveOverlaps,
} from "./grid-quantize.js";
import type { MidiNote } from "./types.js";

const note = (start: number, dur: number, pitch: number, vel = 80): MidiNote => ({
  pitch,
  startTime: start,
  duration: dur,
  velocity: vel,
});

describe("grid-quantize", () => {
  const gridStep = gridStepBeats(4, 16);

  it("snaps 120 BPM 4/4 notes to 16th grid", () => {
    const raw = [note(0.02, 0.31, 60), note(1.13, 0.48, 62)];
    const out = quantizeNotesToGrid(raw, {
      beatsPerBar: 4,
      bars: 4,
      mode: "melody",
      stylePreset: "expressive",
    });
    expect(allNotesOnGrid(out, gridStep)).toBe(true);
    expect(out[0]!.startTime).toBe(0);
    expect(out[1]!.startTime).toBe(1.25);
  });

  it("melody mode keeps one note per 16th slot", () => {
    const raw = [
      note(0, 0.25, 60, 90),
      note(0, 0.25, 62, 70),
      note(0.25, 0.25, 64, 85),
    ];
    const out = resolveOverlaps(raw, {
      beatsPerBar: 4,
      bars: 1,
      mode: "melody",
    });
    expect(out.filter((n) => n.startTime === 0)).toHaveLength(1);
    expect(out).toHaveLength(2);
  });

  it("hybrid mode allows up to four notes per slot", () => {
    const raw = [
      note(0, 0.25, 60, 90),
      note(0, 0.25, 64, 80),
      note(0, 0.25, 67, 70),
      note(0, 0.25, 72, 65),
      note(0, 0.25, 76, 60),
    ];
    const out = resolveOverlaps(raw, {
      beatsPerBar: 4,
      bars: 1,
      mode: "hybrid",
    });
    expect(out.filter((n) => n.startTime === 0).length).toBeLessThanOrEqual(4);
  });

  it("caps dense style to sixteen slots per bar", () => {
    const raw: MidiNote[] = [];
    for (let i = 0; i < 20; i++) {
      raw.push(note(i * gridStep, gridStep, 60 + (i % 5), 50 + i));
    }
    const out = capBarGridDensity(raw, {
      beatsPerBar: 4,
      bars: 1,
      mode: "melody",
      stylePreset: "dense",
    });
    const slots = new Set(out.map((n) => Math.round(n.startTime / gridStep)));
    expect(slots.size).toBeLessThanOrEqual(16);
  });

  it("applyGridPipeline enforces slot limits for 8-bar dense", () => {
    const raw: MidiNote[] = [];
    for (let bar = 0; bar < 8; bar++) {
      for (let i = 0; i < 20; i++) {
        raw.push(note(bar * 4 + i * gridStep, gridStep, 60 + (i % 7), 40 + i));
      }
    }
    const out = applyGridPipeline(raw, {
      beatsPerBar: 4,
      bars: 8,
      mode: "hybrid",
      stylePreset: "dense",
    });
    expect(maxNotesPerSlot(out, gridStep)).toBeLessThanOrEqual(4);
    expect(allNotesOnGrid(out, gridStep)).toBe(true);
  });
});
