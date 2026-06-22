import type { ChordEvent, MidiNote } from "./types.js";
import { chordAtBeat } from "./chords.js";
import { mulberry32, quantizeBeat } from "./melody-engine.js";
import { GRID } from "./pattern-engine.js";

/** Average note count per bar (polyphony-aware). */
export function notesPerBar(notes: MidiNote[], beatsPerBar: number, bars: number): number {
  if (bars <= 0) return 0;
  return notes.length / bars;
}

/** Simultaneous pitch count at a given beat. */
export function polyphonyAt(notes: MidiNote[], beat: number): number {
  return notes.filter((n) => n.startTime <= beat && n.startTime + n.duration > beat).length;
}

export function averagePolyphony(notes: MidiNote[], totalBeats: number, step = 0.25): number {
  if (totalBeats <= 0) return 0;
  let sum = 0;
  let count = 0;
  for (let t = 0; t < totalBeats; t += step) {
    sum += polyphonyAt(notes, t);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export interface DensityTarget {
  minNotesPerBar: number;
  minAvgPolyphony: number;
}

export const DENSITY_TARGETS: Record<string, DensityTarget> = {
  melody: { minNotesPerBar: 4, minAvgPolyphony: 1.2 },
  hybrid: { minNotesPerBar: 8, minAvgPolyphony: 2.0 },
  chords: { minNotesPerBar: 6, minAvgPolyphony: 2.5 },
};

export function meetsDensityTarget(
  notes: MidiNote[],
  beatsPerBar: number,
  bars: number,
  mode: keyof typeof DENSITY_TARGETS,
): boolean {
  const target = DENSITY_TARGETS[mode] ?? DENSITY_TARGETS.melody;
  return (
    notesPerBar(notes, beatsPerBar, bars) >= target.minNotesPerBar &&
    averagePolyphony(notes, bars * beatsPerBar) >= target.minAvgPolyphony
  );
}

/** Boost density by duplicating chord-tone stacks when output is too sparse. */
export function boostDensityIfSparse(
  notes: MidiNote[],
  progression: ChordEvent[],
  beatsPerBar: number,
  bars: number,
  mode: keyof typeof DENSITY_TARGETS,
  seed: number,
): MidiNote[] {
  if (meetsDensityTarget(notes, beatsPerBar, bars, mode)) return notes;
  const rng = mulberry32(seed + 99);
  const extras: MidiNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const chord = chordAtBeat(progression, bar * beatsPerBar);
    if (!chord) continue;
    for (let hit = 0; hit < beatsPerBar; hit += 1) {
      if (rng() > 0.55) continue;
      const t = bar * beatsPerBar + hit;
      for (const pc of chord.pitchClasses.slice(0, 3)) {
        extras.push({
          pitch: 60 + pc + (hit % 2) * 12,
          startTime: quantizeBeat(t, GRID),
          duration: 0.25,
          velocity: 58 + Math.floor(rng() * 20),
        });
      }
    }
  }
  const merged = [...notes, ...extras].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
  const seen = new Set<string>();
  return merged.filter((n) => {
    const k = `${Math.round(n.startTime / GRID)}_${n.pitch}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
