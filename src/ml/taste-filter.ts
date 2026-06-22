import type { Genre, MidiNote } from "./types.js";
import { mulberry32, quantizeBeat } from "./melody-engine.js";
import { GRID } from "./pattern-engine.js";

export type TasteMode = "melody" | "hybrid" | "chords";

export interface TasteFilterOptions {
  mode: TasteMode;
  beatsPerBar: number;
  bars: number;
  seed?: number;
  genre?: Genre;
}

const DURATION_WEIGHTS = [
  { duration: 0.5, weight: 0.14 },
  { duration: 0.75, weight: 0.22 },
  { duration: 1.0, weight: 0.26 },
  { duration: 1.25, weight: 0.14 },
  { duration: 1.5, weight: 0.14 },
  { duration: 2.0, weight: 0.1 },
];

const SPARSE_GENRES: Set<Genre> = new Set(["lofi", "ambient", "rnb"]);

function pickWeightedDuration(rng: () => number): number {
  const r = rng();
  let acc = 0;
  for (const { duration, weight } of DURATION_WEIGHTS) {
    acc += weight;
    if (r <= acc) return duration;
  }
  return 1.0;
}

/** Longest run of consecutive same-pitch attacks on the lead voice (time-ordered). */
export function maxConsecutiveSamePitch(notes: MidiNote[], leadVelocityMin = 55): number {
  const lead = [...notes]
    .filter((n) => n.velocity >= leadVelocityMin)
    .sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
  if (lead.length === 0) return 0;

  let max = 1;
  let streak = 1;
  for (let i = 1; i < lead.length; i++) {
    if (lead[i]!.pitch === lead[i - 1]!.pitch) {
      streak++;
      max = Math.max(max, streak);
    } else {
      streak = 1;
    }
  }
  return max;
}

/** Count distinct quantized durations in a beat range. */
export function distinctDurationsInRange(
  notes: MidiNote[],
  startBeat: number,
  endBeat: number,
): number {
  const durations = new Set<number>();
  for (const n of notes) {
    if (n.startTime >= startBeat && n.startTime < endBeat) {
      durations.add(Math.round(n.duration * 4) / 4);
    }
  }
  return durations.size;
}

/** Merge machine-gun 16th runs on a single pitch into one longer note. */
function collapsePerPitchRuns(
  notes: MidiNote[],
  maxGridHits: number,
  rng: () => number,
): MidiNote[] {
  const byPitch = new Map<number, MidiNote[]>();
  for (const n of notes) {
    const list = byPitch.get(n.pitch) ?? [];
    list.push(n);
    byPitch.set(n.pitch, list);
  }

  const kept: MidiNote[] = [];
  for (const pitchNotes of byPitch.values()) {
    const sorted = [...pitchNotes].sort((a, b) => a.startTime - b.startTime);
    let i = 0;
    while (i < sorted.length) {
      const run: MidiNote[] = [sorted[i]!];
      let j = i + 1;
      while (j < sorted.length) {
        const prev = run[run.length - 1]!;
        const cur = sorted[j]!;
        const gap = cur.startTime - prev.startTime;
        if (gap >= GRID * 0.85 && gap <= GRID * 1.15) {
          run.push(cur);
          j++;
        } else {
          break;
        }
      }

      if (run.length > maxGridHits) {
        const first = run[0]!;
        const last = run[run.length - 1]!;
        const span = last.startTime - first.startTime + Math.max(last.duration, GRID);
        kept.push({
          ...first,
          duration: quantizeBeat(Math.min(span, pickWeightedDuration(rng) * 1.25), GRID),
          velocity: Math.max(...run.map((r) => r.velocity)),
        });
      } else {
        kept.push(...run);
      }
      i = j;
    }
  }

  return kept.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

/** Drop excess consecutive same-pitch attacks on the melodic lead. */
function limitLeadConsecutiveSamePitch(
  notes: MidiNote[],
  maxConsecutive: number,
  minSpacing: number,
): MidiNote[] {
  const leadMin = 55;
  const lead = notes.filter((n) => n.velocity >= leadMin);
  const harmony = notes.filter((n) => n.velocity < leadMin);
  const sorted = [...lead].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);

  const keptLead: MidiNote[] = [];
  let streak = 0;
  let lastPitch = -1;
  let lastKeptTime = -Infinity;

  for (const n of sorted) {
    if (n.pitch === lastPitch) {
      streak++;
      if (streak > maxConsecutive) continue;
      if (n.startTime - lastKeptTime < minSpacing) continue;
    } else {
      streak = 1;
      lastPitch = n.pitch;
    }
    keptLead.push(n);
    lastKeptTime = n.startTime;
  }

  return [...keptLead, ...harmony].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

/** Reassign short uniform durations with a weighted longer palette. */
function varyDurations(notes: MidiNote[], rng: () => number, sparse: boolean): MidiNote[] {
  return notes.map((n) => {
    if (n.duration > 0.4 && rng() > 0.35) return n;
    const base = pickWeightedDuration(rng);
    const duration = sparse ? Math.max(base, 0.75) : base;
    return {
      ...n,
      duration: quantizeBeat(Math.max(GRID, duration), GRID),
    };
  });
}

/** Thin weakest notes per bar to leave melodic breathing room. */
function injectMelodicRests(
  notes: MidiNote[],
  beatsPerBar: number,
  bars: number,
  targetRestFraction: number,
  rng: () => number,
): MidiNote[] {
  const leadMin = 55;
  const totalBeats = beatsPerBar * bars;
  let occupied = 0;
  for (const n of notes) {
    if (n.velocity >= leadMin) occupied += Math.min(n.duration, GRID * 2);
  }
  const currentDensity = occupied / totalBeats;
  const targetDensity = 1 - targetRestFraction;
  if (currentDensity <= targetDensity) return notes;

  const sorted = [...notes].sort((a, b) => a.velocity - b.velocity || a.startTime - b.startTime);
  const dropCount = Math.ceil((currentDensity - targetDensity) * totalBeats / GRID);
  const dropKeys = new Set<string>();

  for (let i = 0; i < Math.min(dropCount, sorted.length - 2); i++) {
    const n = sorted[i]!;
    if (n.velocity >= leadMin && rng() < 0.7) {
      dropKeys.add(`${Math.round(n.startTime / GRID)}_${n.pitch}`);
    }
  }

  if (dropKeys.size === 0) return notes;
  return notes.filter((n) => !dropKeys.has(`${Math.round(n.startTime / GRID)}_${n.pitch}`));
}

/**
 * Musical quality pass: anti-repeat, duration variety, rest space.
 * Run after density boosts and humanization.
 */
export function applyTasteFilter(notes: MidiNote[], options: TasteFilterOptions): MidiNote[] {
  if (notes.length === 0) return notes;

  const { mode, beatsPerBar, bars, seed = 1, genre } = options;
  const rng = mulberry32(seed + 401);
  const sparse = genre !== undefined && SPARSE_GENRES.has(genre);

  let result = [...notes];

  if (mode === "melody" || mode === "hybrid") {
    const maxGridHits = sparse ? 2 : 3;
    result = collapsePerPitchRuns(result, maxGridHits, rng);
    result = limitLeadConsecutiveSamePitch(
      result,
      sparse ? 2 : 3,
      sparse ? 0.5 : 0.25,
    );

    if (mode === "melody") {
      const restTarget = sparse ? 0.3 : 0.2;
      result = injectMelodicRests(result, beatsPerBar, bars, restTarget, rng);
    }

    result = varyDurations(result, rng, sparse);
  }

  return result.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}
