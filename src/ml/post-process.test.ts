import { describe, expect, it } from "vitest";
import {
  alignPhraseBoundaries,
  enforceScaleAdherence,
  postProcessMelody,
  splitOversustainedNotes,
} from "./post-process.js";
import { isPitchInScale } from "./melody-engine.js";
import type { GenerationParams, MidiNote } from "./types.js";

const base: GenerationParams = {
  key: "C",
  scale: "major",
  genre: "pop",
  bars: 2,
  temperature: 0.6,
  seed: 1,
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  chordMode: "none",
};

describe("post-process", () => {
  it("quantizes and dedupes notes on grid", () => {
    const raw: MidiNote[] = [
      { pitch: 61, startTime: 0.02, duration: 0.3, velocity: 100 },
      { pitch: 62, startTime: 0.03, duration: 0.3, velocity: 90 },
      { pitch: 64, startTime: 0.5, duration: 0.25, velocity: 95 },
    ];
    const out = postProcessMelody(raw, { ...base, bars: 1 });
    expect(out.length).toBe(3);
    expect(out.every((n) => n.startTime % 0.25 === 0)).toBe(true);
    const atZero = out.filter((n) => n.startTime === 0);
    expect(atZero.length).toBe(2);
  });

  it("biases hybrid mode toward chord tones", () => {
    const raw: MidiNote[] = [{ pitch: 61, startTime: 0, duration: 0.5, velocity: 100 }];
    const out = postProcessMelody(
      raw,
      {
        ...base,
        chordProgression: [
          {
            startBeat: 0,
            duration: 4,
            rootPc: 0,
            quality: "major",
            pitchClasses: [0, 4, 7],
          },
        ],
      },
      { mode: "hybrid" },
    );
    expect([60, 64, 67]).toContain(out[0]!.pitch);
  });

  it("splits oversustained same-pitch notes with stepwise variation", () => {
    const raw: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 4, velocity: 80 },
    ];
    const scalePitches = [60, 62, 64, 65, 67, 69, 71, 72];
    const out = splitOversustainedNotes(raw, 1.5, scalePitches);
    expect(out.length).toBeGreaterThan(1);
    expect(out.some((n) => n.pitch !== 60)).toBe(true);
    expect(out[out.length - 1]!.startTime + out[out.length - 1]!.duration).toBeCloseTo(4, 1);
  });

  it("snaps out-of-scale lead notes to key", () => {
    const raw: MidiNote[] = [
      { pitch: 61, startTime: 0, duration: 0.5, velocity: 80 },
      { pitch: 63, startTime: 1, duration: 0.5, velocity: 80 },
    ];
    const out = enforceScaleAdherence(raw, "C", "major");
    for (const n of out) {
      expect(isPitchInScale(n.pitch, "C", "major")).toBe(true);
    }
  });

  it("trims notes past 4-bar phrase boundaries", () => {
    const raw: MidiNote[] = [
      { pitch: 60, startTime: 15, duration: 2, velocity: 80 },
    ];
    const pitches = [60, 62, 64, 65, 67, 69, 71, 72];
    const out = alignPhraseBoundaries(raw, pitches, 0, "major", 4, 8);
    const note = out.find((n) => n.startTime === 15)!;
    expect(note.duration).toBeLessThanOrEqual(1);
  });

  it("full pipeline keeps lead notes in selected scale", () => {
    const raw: MidiNote[] = [
      { pitch: 61, startTime: 0, duration: 0.5, velocity: 90 },
      { pitch: 63, startTime: 0.5, duration: 0.5, velocity: 90 },
      { pitch: 66, startTime: 1, duration: 0.5, velocity: 90 },
      { pitch: 68, startTime: 1.5, duration: 0.5, velocity: 90 },
      { pitch: 70, startTime: 2, duration: 0.5, velocity: 90 },
      { pitch: 73, startTime: 2.5, duration: 0.5, velocity: 90 },
      { pitch: 75, startTime: 3, duration: 0.5, velocity: 90 },
      { pitch: 61, startTime: 3.5, duration: 0.5, velocity: 90 },
    ];
    const out = postProcessMelody(raw, { ...base, bars: 4, scale: "natural-minor", key: "A" });
    const lead = out.filter((n) => n.velocity >= 55);
    for (const n of lead) {
      expect(isPitchInScale(n.pitch, "A", "natural-minor")).toBe(true);
    }
  });
});
