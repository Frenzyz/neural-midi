import type { Genre, MidiNote, Scale } from "./types.js";
import {
  NOTE_TO_PC,
  SCALE_INTERVALS,
  buildScalePitches,
  mulberry32,
  quantizeBeat,
} from "./melody-engine.js";
import { fillPhraseGaps, GRID } from "./pattern-engine.js";

export type TasteMode = "melody" | "hybrid" | "chords";

export interface TasteFilterOptions {
  mode: TasteMode;
  beatsPerBar: number;
  bars: number;
  seed?: number;
  genre?: Genre;
  key?: string;
  scale?: Scale;
}

export interface MinDensityOptions extends TasteFilterOptions {
  key: string;
  scale: Scale;
}

const DURATION_WEIGHTS = [
  { duration: 0.5, weight: 0.16 },
  { duration: 0.75, weight: 0.24 },
  { duration: 1.0, weight: 0.26 },
  { duration: 1.25, weight: 0.14 },
  { duration: 1.5, weight: 0.12 },
  { duration: 2.0, weight: 0.08 },
];

const SPARSE_GENRES: Set<Genre> = new Set(["lofi", "ambient", "rnb"]);

const LEAD_VELOCITY_MIN = 55;

/** Target note counts: melody 1.5–3/bar (6–12 per 4 bars). */
export function minMelodyNotes(bars: number, genre?: Genre): number {
  const perBar = genre !== undefined && SPARSE_GENRES.has(genre) ? 1.5 : 2;
  return Math.max(6, Math.round(bars * perBar));
}

export function minNotesPerBar(genre?: Genre): number {
  return genre !== undefined && SPARSE_GENRES.has(genre) ? 1.5 : 2;
}

function pickWeightedDuration(rng: () => number): number {
  const r = rng();
  let acc = 0;
  for (const { duration, weight } of DURATION_WEIGHTS) {
    acc += weight;
    if (r <= acc) return duration;
  }
  return 1.0;
}

function leadNotes(notes: MidiNote[]): MidiNote[] {
  return notes.filter((n) => n.velocity >= LEAD_VELOCITY_MIN);
}

/** Longest run of consecutive same-pitch attacks on the lead voice (time-ordered). */
export function maxConsecutiveSamePitch(notes: MidiNote[], leadVelocityMin = LEAD_VELOCITY_MIN): number {
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

/** Merge machine-gun 16th runs on a single pitch into one longer note (5+ only). */
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
  const lead = notes.filter((n) => n.velocity >= LEAD_VELOCITY_MIN);
  const harmony = notes.filter((n) => n.velocity < LEAD_VELOCITY_MIN);
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

/** Reassign only very short uniform durations with a weighted longer palette. */
function varyDurations(notes: MidiNote[], rng: () => number, sparse: boolean): MidiNote[] {
  return notes.map((n) => {
    if (n.duration > GRID * 1.1 && rng() > 0.25) return n;
    const base = pickWeightedDuration(rng);
    const duration = sparse ? Math.max(base, 0.75) : base;
    return {
      ...n,
      duration: quantizeBeat(Math.max(GRID, duration), GRID),
    };
  });
}

/** Thin weakest notes per bar — capped removal, never below min notes/bar. */
function injectMelodicRests(
  notes: MidiNote[],
  beatsPerBar: number,
  bars: number,
  maxRestFraction: number,
  minPerBar: number,
  rng: () => number,
): MidiNote[] {
  const dropKeys = new Set<string>();
  const maxDropsPerBar = Math.max(1, Math.floor(beatsPerBar * maxRestFraction / GRID));

  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * beatsPerBar;
    const barEnd = barStart + beatsPerBar;
    const inBar = notes.filter(
      (n) => n.velocity >= LEAD_VELOCITY_MIN && n.startTime >= barStart && n.startTime < barEnd,
    );
    const canDrop = Math.max(0, inBar.length - Math.ceil(minPerBar));
    if (canDrop === 0) continue;

    const sorted = [...inBar].sort((a, b) => a.velocity - b.velocity || a.startTime - b.startTime);
    let dropped = 0;
    for (const n of sorted) {
      if (dropped >= Math.min(maxDropsPerBar, canDrop)) break;
      if (rng() > 0.55) continue;
      dropKeys.add(`${Math.round(n.startTime / GRID)}_${n.pitch}`);
      dropped++;
    }
  }

  if (dropKeys.size === 0) return notes;
  return notes.filter((n) => !dropKeys.has(`${Math.round(n.startTime / GRID)}_${n.pitch}`));
}

/**
 * Musical quality pass: anti-repeat, duration variety, light rest space.
 * Does not enforce minimum density — use ensureMinimumPhraseDensity after.
 */
export function applyTasteFilter(notes: MidiNote[], options: TasteFilterOptions): MidiNote[] {
  if (notes.length === 0) return notes;

  const { mode, beatsPerBar, bars, seed = 1, genre } = options;
  const rng = mulberry32(seed + 401);
  const sparse = genre !== undefined && SPARSE_GENRES.has(genre);

  let result = [...notes];

  if (mode === "melody" || mode === "hybrid") {
    result = collapsePerPitchRuns(result, 4, rng);
    result = limitLeadConsecutiveSamePitch(result, 3, sparse ? 0.25 : 0.25);

    if (mode === "melody") {
      const restCap = sparse ? 0.12 : 0.15;
      result = injectMelodicRests(result, beatsPerBar, bars, restCap, minNotesPerBar(genre), rng);
    }

    result = varyDurations(result, rng, sparse);
  }

  return result.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

/**
 * Floor guard: if output is too sparse after taste filter, fill gaps with phrase motifs.
 */
export function ensureMinimumPhraseDensity(
  notes: MidiNote[],
  options: MinDensityOptions,
): MidiNote[] {
  const { mode, beatsPerBar, bars, seed = 1, genre, key, scale } = options;
  if (mode === "chords") return notes;

  const minTotal = minMelodyNotes(bars, genre);
  if (leadNotes(notes).length >= minTotal) return notes;

  const rootPc = NOTE_TO_PC[key] ?? 0;
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  const pitches = buildScalePitches(rootPc, intervals, 55, 80);
  const sparse = genre !== undefined && SPARSE_GENRES.has(genre);
  const rng = mulberry32(seed + 601);

  return fillPhraseGaps(
    notes,
    pitches,
    beatsPerBar,
    bars,
    minNotesPerBar(genre),
    rng,
    sparse,
  );
}
