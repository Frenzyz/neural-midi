import type { GenerationMode, MidiNote, StylePreset } from "./types.js";

export const DEFAULT_GRID_DIVISION = 16;

export function gridStepBeats(beatsPerBar: number, gridDivision = DEFAULT_GRID_DIVISION): number {
  return beatsPerBar / Math.max(1, gridDivision);
}

export function snapToGrid(beat: number, gridStep: number): number {
  if (gridStep <= 0) return beat;
  return Math.round(beat / gridStep) * gridStep;
}

export function snapDurationToGrid(duration: number, gridStep: number, minSteps = 1): number {
  if (gridStep <= 0) return duration;
  const steps = Math.max(minSteps, Math.round(duration / gridStep));
  return steps * gridStep;
}

export function slotIndex(startTime: number, gridStep: number): number {
  return Math.round(startTime / gridStep);
}

export function maxSixteenthsPerBar(style: StylePreset = "expressive"): number {
  switch (style) {
    case "clean":
      return 8;
    case "dense":
      return 16;
    case "expressive":
    default:
      return 12;
  }
}

export function maxPolyphonyPerSlot(mode: GenerationMode): number {
  switch (mode) {
    case "melody":
      return 1;
    case "hybrid":
      return 4;
    case "chords":
      return 4;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function maxLeadNotesPerSlot(mode: GenerationMode): number {
  return mode === "melody" ? 1 : 2;
}

const LEAD_VELOCITY_MIN = 55;

export interface GridQuantizeOptions {
  beatsPerBar: number;
  bars: number;
  mode: GenerationMode;
  stylePreset?: StylePreset;
  gridDivision?: number;
}

export function quantizeNotesToGrid(notes: MidiNote[], options: GridQuantizeOptions): MidiNote[] {
  const gridStep = gridStepBeats(options.beatsPerBar, options.gridDivision);
  return notes.map((n) => ({
    ...n,
    startTime: snapToGrid(n.startTime, gridStep),
    duration: snapDurationToGrid(Math.max(gridStep * 0.5, n.duration), gridStep),
    velocity: Math.round(n.velocity),
  }));
}

/** Per grid slot: keep lead priority, cap polyphony, dedupe same pitch. */
export function resolveOverlaps(notes: MidiNote[], options: GridQuantizeOptions): MidiNote[] {
  const gridStep = gridStepBeats(options.beatsPerBar, options.gridDivision);
  const maxPoly = maxPolyphonyPerSlot(options.mode);
  const maxLead = maxLeadNotesPerSlot(options.mode);

  const bySlot = new Map<number, MidiNote[]>();
  for (const n of notes) {
    const slot = slotIndex(n.startTime, gridStep);
    const list = bySlot.get(slot) ?? [];
    list.push(n);
    bySlot.set(slot, list);
  }

  const result: MidiNote[] = [];
  for (const group of bySlot.values()) {
    const sorted = [...group].sort((a, b) => {
      const aLead = a.velocity >= LEAD_VELOCITY_MIN ? 1 : 0;
      const bLead = b.velocity >= LEAD_VELOCITY_MIN ? 1 : 0;
      if (aLead !== bLead) return bLead - aLead;
      return b.velocity - a.velocity;
    });

    const kept: MidiNote[] = [];
    let leadKept = 0;
    for (const n of sorted) {
      if (kept.length >= maxPoly) break;
      if (kept.some((k) => k.pitch === n.pitch)) continue;
      const isLead = n.velocity >= LEAD_VELOCITY_MIN;
      if (isLead && leadKept >= maxLead) continue;
      if (isLead) leadKept++;
      kept.push(n);
    }
    result.push(...kept);
  }

  return result.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

/** Drop lowest-velocity notes in excess grid slots within each bar. */
export function capBarGridDensity(notes: MidiNote[], options: GridQuantizeOptions): MidiNote[] {
  const gridStep = gridStepBeats(options.beatsPerBar, options.gridDivision);
  const maxSlots = maxSixteenthsPerBar(options.stylePreset);
  const slotsPerBar = Math.round(options.beatsPerBar / gridStep);

  const byBar = new Map<number, MidiNote[]>();
  for (const n of notes) {
    const bar = Math.floor(n.startTime / options.beatsPerBar);
    if (bar < 0 || bar >= options.bars) continue;
    const list = byBar.get(bar) ?? [];
    list.push(n);
    byBar.set(bar, list);
  }

  const kept: MidiNote[] = [];
  for (let bar = 0; bar < options.bars; bar++) {
    const barNotes = byBar.get(bar) ?? [];
    const slotGroups = new Map<number, MidiNote[]>();
    for (const n of barNotes) {
      const slotInBar = slotIndex(n.startTime - bar * options.beatsPerBar, gridStep);
      const clamped = Math.max(0, Math.min(slotsPerBar - 1, slotInBar));
      const list = slotGroups.get(clamped) ?? [];
      list.push(n);
      slotGroups.set(clamped, list);
    }

    if (slotGroups.size <= maxSlots) {
      kept.push(...barNotes);
      continue;
    }

    const ranked = [...slotGroups.entries()]
      .map(([slot, group]) => ({
        slot,
        score: Math.max(...group.map((n) => n.velocity)),
      }))
      .sort((a, b) => b.score - a.score);
    const allowed = new Set(ranked.slice(0, maxSlots).map((r) => r.slot));

    for (const n of barNotes) {
      const slotInBar = slotIndex(n.startTime - bar * options.beatsPerBar, gridStep);
      const clamped = Math.max(0, Math.min(slotsPerBar - 1, slotInBar));
      if (allowed.has(clamped)) kept.push(n);
    }
  }

  return kept.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

export function applyGridPipeline(notes: MidiNote[], options: GridQuantizeOptions): MidiNote[] {
  if (notes.length === 0) return notes;
  let result = quantizeNotesToGrid(notes, options);
  result = resolveOverlaps(result, options);
  result = capBarGridDensity(result, options);
  return result;
}

export function allNotesOnGrid(notes: MidiNote[], gridStep: number): boolean {
  return notes.every(
    (n) =>
      Math.abs(n.startTime / gridStep - Math.round(n.startTime / gridStep)) < 0.001 &&
      Math.abs(n.duration / gridStep - Math.round(n.duration / gridStep)) < 0.001,
  );
}

export function maxNotesPerSlot(notes: MidiNote[], gridStep: number): number {
  const counts = new Map<number, number>();
  for (const n of notes) {
    const slot = slotIndex(n.startTime, gridStep);
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  return counts.size === 0 ? 0 : Math.max(...counts.values());
}
