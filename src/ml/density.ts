import type { ChordEvent, Genre, MidiNote, Scale } from "./types.js";
import { chordAtBeat } from "./chords.js";
import {
  buildScalePitches,
  mulberry32,
  NOTE_TO_PC,
  quantizeBeat,
  SCALE_INTERVALS,
} from "./melody-engine.js";
import { fillPhraseGaps, GRID } from "./pattern-engine.js";
import { minMelodyNotes, minNotesPerBar } from "./taste-filter.js";

const SPARSE_GENRES: Set<Genre> = new Set(["lofi", "ambient", "rnb"]);

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
  melody: { minNotesPerBar: 1.5, minAvgPolyphony: 1.0 },
  hybrid: { minNotesPerBar: 5, minAvgPolyphony: 1.5 },
  chords: { minNotesPerBar: 4, minAvgPolyphony: 2.0 },
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

/** Gentle melody fill using phrase gaps when below floor (not machine-gun 16ths). */
export function boostMelodyDensityGently(
  notes: MidiNote[],
  beatsPerBar: number,
  bars: number,
  key: string,
  scale: Scale,
  genre: Genre | undefined,
  seed: number,
): MidiNote[] {
  const minTotal = minMelodyNotes(bars, genre);
  const leadCount = notes.filter((n) => n.velocity >= 55).length;
  if (leadCount >= minTotal) return notes;

  const rootPc = NOTE_TO_PC[key] ?? 0;
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  const pitches = buildScalePitches(rootPc, intervals, 55, 80);
  const sparse = genre !== undefined && SPARSE_GENRES.has(genre);
  return fillPhraseGaps(notes, pitches, beatsPerBar, bars, minNotesPerBar(genre), mulberry32(seed + 99), sparse);
}

/** Boost density by duplicating chord-tone stacks when output is too sparse. */
export function boostDensityIfSparse(
  notes: MidiNote[],
  progression: ChordEvent[],
  beatsPerBar: number,
  bars: number,
  mode: keyof typeof DENSITY_TARGETS,
  seed: number,
  key = "C",
  scale: Scale = "major",
  genre?: Genre,
): MidiNote[] {
  if (mode === "melody") {
    return boostMelodyDensityGently(notes, beatsPerBar, bars, key, scale, genre, seed);
  }
  if (meetsDensityTarget(notes, beatsPerBar, bars, mode)) return notes;
  const rng = mulberry32(seed + 99);
  const extras: MidiNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const chord = chordAtBeat(progression, bar * beatsPerBar);
    if (!chord) continue;
    for (let hit = 0; hit < beatsPerBar; hit += 2) {
      if (rng() > 0.45) continue;
      const t = bar * beatsPerBar + hit;
      const pc = chord.pitchClasses[Math.floor(rng() * chord.pitchClasses.length)]!;
      extras.push({
        pitch: 60 + pc + (hit % 2) * 12,
        startTime: quantizeBeat(t, GRID),
        duration: 0.5 + (rng() < 0.4 ? 0.5 : 0),
        velocity: 58 + Math.floor(rng() * 16),
      });
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
