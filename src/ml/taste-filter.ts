import type { MidiNote } from "./types.js";
import { quantizeBeat } from "./melody-engine.js";
import { GRID } from "./pattern-engine.js";

export type TasteMode = "melody" | "hybrid" | "chords";

export interface LightTasteOptions {
  mode: TasteMode;
  seed?: number;
}

const LEAD_VELOCITY_MIN = 55;

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

/** Merge only extreme machine-gun runs (7+ grid-spaced hits on one pitch). */
function collapseExtremeRuns(notes: MidiNote[]): MidiNote[] {
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

      if (run.length > 6) {
        const first = run[0]!;
        const last = run[run.length - 1]!;
        kept.push({
          ...first,
          duration: quantizeBeat(last.startTime - first.startTime + last.duration, GRID),
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

/** Cap consecutive same-pitch lead attacks at 4 (no note deletion for density). */
function capConsecutiveSamePitch(notes: MidiNote[], maxConsecutive: number): MidiNote[] {
  const lead = notes.filter((n) => n.velocity >= LEAD_VELOCITY_MIN);
  const harmony = notes.filter((n) => n.velocity < LEAD_VELOCITY_MIN);
  const sorted = [...lead].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);

  const keptLead: MidiNote[] = [];
  let streak = 0;
  let lastPitch = -1;

  for (const n of sorted) {
    if (n.pitch === lastPitch) {
      streak++;
      if (streak > maxConsecutive) continue;
    } else {
      streak = 1;
      lastPitch = n.pitch;
    }
    keptLead.push(n);
  }

  return [...keptLead, ...harmony].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

/**
 * Opt-in "Tighten phrasing" — light anti-machine-gun only. No rest injection or density floor.
 */
export function applyLightTasteFilter(notes: MidiNote[], options: LightTasteOptions): MidiNote[] {
  if (notes.length === 0 || options.mode === "chords") return notes;

  let result = collapseExtremeRuns(notes);
  result = capConsecutiveSamePitch(result, 4);
  return result;
}

/** @deprecated use applyLightTasteFilter when tightenPhrasing is enabled */
export const applyTasteFilter = applyLightTasteFilter;

/** @deprecated removed from pipeline — density is controlled at generation time */
export function ensureMinimumPhraseDensity(notes: MidiNote[]): MidiNote[] {
  return notes;
}
