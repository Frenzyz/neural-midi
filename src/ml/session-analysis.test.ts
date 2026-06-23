import { describe, expect, it } from "vitest";
import {
  detectKeyFromNotes,
  fingerprintRhythm,
  inferGenreFromRhythm,
  mergeKeyScaleAnalysis,
  rhythmTemplateFromFingerprint,
} from "./session-analysis.js";
import type { MidiNote } from "./types.js";

function cMajorMelody(): MidiNote[] {
  const notes: MidiNote[] = [];
  for (const pitch of [60, 62, 64, 65, 67, 69, 71, 72, 74]) {
    for (let i = 0; i < 4; i++) {
      notes.push({
        pitch,
        startTime: notes.length * 0.25,
        duration: 0.5,
        velocity: pitch % 12 === 0 ? 110 : 90,
      });
    }
  }
  return notes;
}

function aMinorMelody(): MidiNote[] {
  return [
    { pitch: 69, startTime: 0, duration: 0.5, velocity: 100 },
    { pitch: 71, startTime: 0.5, duration: 0.5, velocity: 95 },
    { pitch: 72, startTime: 1, duration: 0.5, velocity: 100 },
    { pitch: 74, startTime: 1.5, duration: 0.5, velocity: 90 },
    { pitch: 72, startTime: 2, duration: 0.5, velocity: 100 },
    { pitch: 71, startTime: 2.5, duration: 0.5, velocity: 95 },
    { pitch: 69, startTime: 3, duration: 1, velocity: 100 },
  ];
}

describe("session-analysis", () => {
  it("detects C major from diatonic melody", () => {
    const result = detectKeyFromNotes(cMajorMelody());
    expect(result.key).toBe("C");
    expect(result.scale).toBe("major");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects A minor from minor melody", () => {
    const result = detectKeyFromNotes(aMinorMelody());
    expect(result.key).toBe("A");
    expect(result.scale).toBe("natural-minor");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("fingerprints rhythm on 16th grid", () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 0.25, velocity: 100 },
      { pitch: 62, startTime: 1, duration: 0.25, velocity: 100 },
      { pitch: 64, startTime: 2, duration: 0.25, velocity: 100 },
      { pitch: 65, startTime: 3, duration: 0.25, velocity: 100 },
    ];
    const fp = fingerprintRhythm(notes, 4);
    expect(fp).toHaveLength(16);
    expect(fp[0]).toBeGreaterThan(0);
    expect(fp[4]).toBeGreaterThan(0);
    expect(fp[8]).toBeGreaterThan(0);
    expect(fp[12]).toBeGreaterThan(0);
  });

  it("builds rhythm template from fingerprint", () => {
    const fp = new Array<number>(16).fill(0);
    fp[0] = 1;
    fp[4] = 0.8;
    fp[8] = 0.6;
    const template = rhythmTemplateFromFingerprint(fp, 4);
    expect(template.length).toBeGreaterThan(0);
    expect(template[0]?.offset).toBe(0);
    expect(template[0]?.accent).toBe(true);
  });

  it("infers a genre from rhythmic pattern", () => {
    const notes: MidiNote[] = [
      { pitch: 60, startTime: 0, duration: 0.25, velocity: 100 },
      { pitch: 62, startTime: 0.5, duration: 0.25, velocity: 95 },
      { pitch: 64, startTime: 1, duration: 0.5, velocity: 100 },
      { pitch: 65, startTime: 2, duration: 0.25, velocity: 100 },
      { pitch: 67, startTime: 2.5, duration: 0.25, velocity: 95 },
      { pitch: 69, startTime: 3, duration: 0.5, velocity: 100 },
    ];
    const fp = fingerprintRhythm(notes, 4);
    const genre = inferGenreFromRhythm(fp, notes.length / 4);
    expect(genre).toBeDefined();
  });

  it("prefers Live scale when it disagrees with MIDI", () => {
    const merged = mergeKeyScaleAnalysis({
      live: { key: "D", scale: "dorian" },
      midi: { key: "C", scale: "major", confidence: 0.7, rootPc: 0 },
      hasMidi: true,
    });
    expect(merged.key).toBe("D");
    expect(merged.scale).toBe("dorian");
    expect(merged.source).toBe("live-scale");
  });

  it("marks mixed source when Live and MIDI agree", () => {
    const merged = mergeKeyScaleAnalysis({
      live: { key: "G", scale: "major" },
      midi: { key: "G", scale: "major", confidence: 0.82, rootPc: 7 },
      hasMidi: true,
    });
    expect(merged.source).toBe("mixed");
    expect(merged.confidence).toBeGreaterThan(0.7);
  });

  it("falls back to MIDI when Live scale is unavailable", () => {
    const merged = mergeKeyScaleAnalysis({
      live: null,
      midi: { key: "E", scale: "natural-minor", confidence: 0.65, rootPc: 4 },
      hasMidi: true,
    });
    expect(merged.key).toBe("E");
    expect(merged.source).toBe("midi-analysis");
  });
});
