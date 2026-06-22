import { describe, expect, it } from "vitest";
import { chordRootOneHot, notesToTokenSequence, pitchToToken, REST_TOKEN } from "./tokenizer.js";
import type { ChordEvent } from "./types.js";

describe("tokenizer", () => {
  it("encodes pitch classes", () => {
    expect(pitchToToken(60)).toBe(0);
    expect(pitchToToken(61)).toBe(1);
  });

  it("builds token sequence with rests", () => {
    const tokens = notesToTokenSequence([
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 80 },
    ]);
    expect(tokens[0]).toBe(REST_TOKEN);
    expect(tokens).toContain(0);
  });

  it("one-hot encodes chord root", () => {
    const chord: ChordEvent = {
      startBeat: 0,
      duration: 4,
      rootPc: 5,
      quality: "major",
      pitchClasses: [5, 9, 0],
    };
    const v = chordRootOneHot(chord);
    expect(v[5]).toBe(1);
    expect(v[0]).toBe(0);
  });
});
