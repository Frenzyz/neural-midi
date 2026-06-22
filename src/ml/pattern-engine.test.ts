import { describe, expect, it } from "vitest";
import {
  addHarmonyLayer,
  applyLegatoOverlap,
  buildMotif,
  mergeVoices,
  motifToNotes,
  phraseFromMotifs,
  varyMotif,
} from "./pattern-engine.js";
import { mulberry32 } from "./melody-engine.js";

describe("pattern-engine", () => {
  const pitches = [60, 62, 64, 65, 67, 69, 71, 72];
  const rng = mulberry32(99);

  it("builds a motif with rhythmic events", () => {
    const motif = buildMotif(4, [0, 2, 4, 2], rng);
    expect(motif.length).toBeGreaterThan(3);
    expect(motif[0]!.offset).toBe(0);
  });

  it("varies motif degrees", () => {
    const motif = buildMotif(4, [0, 2, 4], mulberry32(1));
    const varied = varyMotif(motif, mulberry32(2), 1);
    expect(varied.some((e, i) => e.degree !== motif[i]!.degree)).toBe(true);
  });

  it("repeats phrase structure across bars", () => {
    const a = buildMotif(4, [0, 2, 4, 5], mulberry32(3));
    const b = buildMotif(4, [4, 2, 0, 2], mulberry32(4));
    const notes = phraseFromMotifs(4, 4, a, b, pitches, mulberry32(5));
    expect(notes.length).toBeGreaterThan(6);
    expect(notes.some((n) => n.startTime >= 4)).toBe(true);
  });

  it("adds harmony layer with overlaps", () => {
    const melody = [{ pitch: 60, startTime: 0, duration: 0.5, velocity: 90 }];
    const layered = addHarmonyLayer(melody, [0, 4, 7], mulberry32(6), 1);
    expect(layered.length).toBe(2);
  });

  it("extends legato into next note", () => {
    const notes = [
      { pitch: 60, startTime: 0, duration: 0.4, velocity: 80 },
      { pitch: 62, startTime: 0.5, duration: 0.5, velocity: 80 },
    ];
    const legato = applyLegatoOverlap(notes);
    expect(legato[0]!.duration).toBeGreaterThan(0.4);
  });

  it("merges voices without duplicate pitch at same time", () => {
    const a = [{ pitch: 60, startTime: 0, duration: 0.5, velocity: 80 }];
    const b = [
      { pitch: 60, startTime: 0, duration: 0.5, velocity: 70 },
      { pitch: 64, startTime: 0, duration: 0.5, velocity: 65 },
    ];
    const merged = mergeVoices(a, b);
    expect(merged).toHaveLength(2);
  });

  it("maps motif to midi notes", () => {
    const motif = [{ offset: 0, degree: 2, duration: 0.5, velocity: 80 }];
    const notes = motifToNotes(motif, 0, pitches, pitches.length - 1);
    expect(notes[0]!.pitch).toBe(64);
  });
});
