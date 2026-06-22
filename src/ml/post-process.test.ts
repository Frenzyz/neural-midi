import { describe, expect, it } from "vitest";
import { postProcessMelody } from "./post-process.js";
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
    const out = postProcessMelody(raw, base);
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
});
