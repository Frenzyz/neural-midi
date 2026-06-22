import type { ChordEvent, MidiNote } from "./types.js";
import type { MotifFragment } from "./genre-library.js";
import { chordAtBeat } from "./chords.js";
import { quantizeBeat } from "./melody-engine.js";

export const GRID = 0.25;

export interface MotifEvent {
  /** Beat offset within the motif (0–motifLength). */
  offset: number;
  /** Index into scale pitch array. */
  degree: number;
  duration: number;
  velocity: number;
  accent?: boolean;
}

/** Build a 2-bar rhythmic motif from scale degrees. */
export function buildMotif(
  beatsPerBar: number,
  degrees: number[],
  rng: () => number,
): MotifEvent[] {
  const motif: MotifEvent[] = [];
  const slots = [
    { off: 0, dur: 0.5, accent: true },
    { off: 0.75, dur: 0.25, accent: false },
    { off: 1.5, dur: 0.5, accent: false },
    { off: 2, dur: 0.75, accent: true },
    { off: 3, dur: 0.5, accent: false },
    { off: beatsPerBar, dur: 0.5, accent: true },
    { off: beatsPerBar + 1, dur: 0.5, accent: false },
    { off: beatsPerBar + 2.5, dur: 0.75, accent: true },
    { off: beatsPerBar + 3.25, dur: 0.25, accent: false },
  ];

  let deg = 0;
  for (const slot of slots) {
    if (slot.off >= beatsPerBar * 2) break;
    if (rng() < 0.12) continue;
    motif.push({
      offset: slot.off,
      degree: degrees[deg % degrees.length]!,
      duration: slot.dur,
      velocity: slot.accent ? 88 : 76,
      accent: slot.accent,
    });
    deg += rng() < 0.35 ? 0 : 1;
  }
  return motif;
}

/** Build motif from a genre fragment library entry. */
export function motifFromFragment(
  fragment: MotifFragment,
  beatsPerBar: number,
  rng: () => number,
): MotifEvent[] {
  const motif: MotifEvent[] = [];
  let deg = 0;
  for (const slot of fragment.slots) {
    if (rng() < 0.03) continue;
    motif.push({
      offset: slot.beatInMotif,
      degree: fragment.degrees[deg % fragment.degrees.length]!,
      duration: slot.duration,
      velocity: slot.accent ? 88 : 74,
      accent: slot.accent,
    });
    deg += 1;
  }
  for (const slot of fragment.slots) {
    if (slot.beatInMotif >= beatsPerBar) continue;
    if (rng() < 0.05) continue;
    motif.push({
      offset: slot.beatInMotif + beatsPerBar,
      degree: fragment.degrees[deg % fragment.degrees.length]!,
      duration: slot.duration,
      velocity: slot.accent ? 80 : 68,
    });
    deg += 1;
  }
  return motif;
}

export function varyMotif(motif: MotifEvent[], rng: () => number, rate = 0.35): MotifEvent[] {
  return motif.map((e) => {
    if (rng() > rate) return { ...e };
    const shift = rng() < 0.5 ? -1 : 1;
    return {
      ...e,
      degree: Math.max(0, e.degree + shift),
      offset: e.offset + (rng() < 0.5 ? 0 : GRID),
      velocity: Math.max(55, e.velocity - 6),
    };
  });
}

export function transposeMotifDegrees(motif: MotifEvent[], semitoneSteps: number): MotifEvent[] {
  return motif.map((e) => ({ ...e, degree: e.degree + semitoneSteps }));
}

export function motifToNotes(
  motif: MotifEvent[],
  motifStartBeat: number,
  pitches: number[],
  maxIndex: number,
): MidiNote[] {
  return motif.map((e) => {
    const idx = Math.max(0, Math.min(maxIndex, e.degree));
    return {
      pitch: pitches[idx]!,
      startTime: quantizeBeat(motifStartBeat + e.offset, GRID),
      duration: quantizeBeat(Math.max(GRID, e.duration), GRID),
      velocity: e.velocity,
    };
  });
}

/** 2-bar motif → repeat → vary → answer phrase (call-and-response). */
export function phraseFromMotifs(
  bars: number,
  beatsPerBar: number,
  motifA: MotifEvent[],
  motifB: MotifEvent[],
  pitches: number[],
  rng: () => number,
): MidiNote[] {
  const maxIndex = pitches.length - 1;
  const notes: MidiNote[] = [];
  const motifLen = beatsPerBar * 2;

  for (let bar = 0; bar < bars; bar += 2) {
    const start = bar * beatsPerBar;
    const phraseIdx = Math.floor(bar / 2) % 2;
    let motif = phraseIdx === 0 ? motifA : varyMotif(motifB, rng, 0.4);

    if (bar >= 2 && bar < bars - 2) {
      motif = varyMotif(motifA, rng, 0.3);
    }
    if (bar >= bars - 2 && bars >= 4) {
      motif = motif.map((e) => ({
        ...e,
        degree: Math.max(0, Math.min(maxIndex, e.degree + (rng() < 0.5 ? -1 : 0))),
      }));
    }

    notes.push(...motifToNotes(motif, start, pitches, maxIndex));

    if (bar + 2 < bars) {
      const answerStart = start + motifLen;
      const answer = varyMotif(motifB, rng, 0.45);
      notes.push(...motifToNotes(answer, answerStart, pitches, maxIndex));
    }
  }

  return notes;
}

/** Add a second voice (chord tone or harmony) overlapping the melody. */
export function addHarmonyLayer(
  melody: MidiNote[],
  chordPitches: number[],
  rng: () => number,
  density = 0.45,
): MidiNote[] {
  const extras: MidiNote[] = [];
  for (const note of melody) {
    if (rng() > density || chordPitches.length < 2) continue;
    const harmonyPc = chordPitches[Math.floor(rng() * chordPitches.length)]!;
    const octave = Math.floor(note.pitch / 12);
    let harmonyPitch = octave * 12 + (harmonyPc % 12);
    if (harmonyPitch === note.pitch) {
      harmonyPitch += chordPitches.length > 1 ? 3 : 12;
    }
    if (Math.abs(harmonyPitch - note.pitch) < 3) harmonyPitch += 4;

    extras.push({
      pitch: harmonyPitch,
      startTime: note.startTime,
      duration: Math.min(note.duration + 0.12, note.duration * 1.15),
      velocity: Math.max(45, Math.round(note.velocity * 0.72)),
    });
  }
  return [...melody, ...extras];
}

/** Add 3rds/6ths double-stops and chord-tone stacks on melody notes. */
export function addHarmonicStacks(
  melody: MidiNote[],
  progression: ChordEvent[],
  rng: () => number,
  density = 0.7,
): MidiNote[] {
  const extras: MidiNote[] = [];
  for (const note of melody) {
    const chord = chordAtBeat(progression, note.startTime);
    if (!chord || rng() > density) continue;
    const pcs = chord.pitchClasses;
    const third = pcs[1] ?? pcs[0];
    const sixth = pcs[Math.min(2, pcs.length - 1)] ?? third;
    const octave = Math.floor(note.pitch / 12);
    const intervals = [
      { pc: third, vel: 0.68 },
      { pc: sixth, vel: 0.62 },
    ];
    for (const { pc, vel } of intervals) {
      let p = octave * 12 + (pc! % 12);
      if (Math.abs(p - note.pitch) < 2) p += 3;
      if (p === note.pitch) continue;
      extras.push({
        pitch: p,
        startTime: note.startTime,
        duration: note.duration * 0.95,
        velocity: Math.max(42, Math.round(note.velocity * vel)),
      });
    }
  }
  return mergeVoices(melody, extras);
}

/** Arpeggiated chord tones across a bar (8th-note pattern). */
export function arpeggiateChordBar(
  chord: ChordEvent,
  barStart: number,
  beatsPerBar: number,
  rng: () => number,
  steps = 8,
): MidiNote[] {
  const pcs = chord.pitchClasses.length > 0 ? chord.pitchClasses : [chord.rootPc];
  const notes: MidiNote[] = [];
  const stepLen = beatsPerBar / steps;
  for (let i = 0; i < steps; i++) {
    if (rng() < 0.08) continue;
    const pc = pcs[i % pcs.length]!;
    const pitch = 60 + pc + (i % 2) * 12;
    notes.push({
      pitch,
      startTime: quantizeBeat(barStart + i * stepLen, GRID),
      duration: Math.max(GRID, stepLen * 0.9),
      velocity: 64 + (i % 2 === 0 ? 10 : 0),
    });
  }
  return notes;
}

/** Legato overlap: extend note durations into the next attack. */
export function applyLegatoOverlap(notes: MidiNote[], overlap = 0.08): MidiNote[] {
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
  const byTime = new Map<number, MidiNote[]>();
  for (const n of sorted) {
    const key = Math.round(n.startTime * 1000);
    const group = byTime.get(key) ?? [];
    group.push(n);
    byTime.set(key, group);
  }

  const monophonic = [...byTime.values()].map((g) => g[0]!);
  for (let i = 0; i < monophonic.length - 1; i++) {
    const curr = monophonic[i]!;
    const next = monophonic[i + 1]!;
    const gap = next.startTime - curr.startTime;
    if (gap > 0.05 && gap < curr.duration + 0.5) {
      curr.duration = Math.max(curr.duration, gap + overlap);
    }
  }
  return sorted.map((n) => {
    const lead = monophonic.find((m) => Math.abs(m.startTime - n.startTime) < 0.001 && m.pitch === n.pitch);
    return lead ? { ...n, duration: lead.duration } : n;
  });
}

export function mergeVoices(...layers: MidiNote[][]): MidiNote[] {
  const seen = new Set<string>();
  const merged: MidiNote[] = [];
  for (const layer of layers) {
    for (const n of layer) {
      const key = `${Math.round(n.startTime / GRID)}_${n.pitch}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(n);
    }
  }
  return merged.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}
