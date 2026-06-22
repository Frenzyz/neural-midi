import { describe, expect, it } from "vitest";
import {
  detectChordFromPitchClasses,
  inferChordProgression,
  isLikelyChordClip,
  pitchClassesAtTime,
} from "./chords.js";
import type { MidiNote } from "./types.js";

describe("chords", () => {
  it("detects C major", () => {
    const chord = detectChordFromPitchClasses([0, 4, 7]);
    expect(chord?.rootPc).toBe(0);
    expect(chord?.quality).toBe("major");
  });

  it("detects A minor", () => {
    const chord = detectChordFromPitchClasses([9, 0, 4]);
    expect(chord?.rootPc).toBe(9);
    expect(chord?.quality).toBe("minor");
  });

  it("infers per-bar progression from block chords", () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 4, velocity: 80 },
      { pitch: 64, startTime: 0, duration: 4, velocity: 80 },
      { pitch: 67, startTime: 0, duration: 4, velocity: 80 },
      { pitch: 57, startTime: 4, duration: 4, velocity: 80 },
      { pitch: 60, startTime: 4, duration: 4, velocity: 80 },
      { pitch: 64, startTime: 4, duration: 4, velocity: 80 },
    ];
    const prog = inferChordProgression(notes, 4, 2);
    expect(prog.length).toBe(2);
    expect(prog[0]?.rootPc).toBe(0);
  });

  it("identifies polyphonic chord clips", () => {
    const chordNotes: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 2, velocity: 80 },
      { pitch: 64, startTime: 0, duration: 2, velocity: 80 },
      { pitch: 67, startTime: 0, duration: 2, velocity: 80 },
    ];
    const melodyNotes: MidiNote[] = [{ pitch: 72, startTime: 0, duration: 0.5, velocity: 90 }];
    expect(isLikelyChordClip(chordNotes)).toBe(true);
    expect(isLikelyChordClip(melodyNotes)).toBe(false);
  });

  it("collects sounding pitch classes", () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 1, velocity: 80 },
      { pitch: 64, startTime: 0, duration: 1, velocity: 80 },
    ];
    expect(pitchClassesAtTime(notes, 0.5)).toEqual([0, 4]);
  });
});
