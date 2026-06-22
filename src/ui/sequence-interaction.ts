/** Shared beat/bar math for the sequence editor (testable). */

export const GRID_BEATS = 0.25;

export function quantizeBeat(beat: number, grid = GRID_BEATS): number {
  return Math.round(beat / grid) * grid;
}

export function barIndexFromX(x: number, width: number, bars: number): number {
  if (width <= 0 || bars <= 0) return 0;
  const barW = width / bars;
  return Math.max(0, Math.min(bars - 1, Math.floor(x / barW)));
}

export function barsToBeatRange(
  selectedBars: number[],
  beatsPerBar: number,
): { start: number; end: number } {
  if (selectedBars.length === 0) {
    return { start: 0, end: beatsPerBar };
  }
  const min = Math.min(...selectedBars);
  const max = Math.max(...selectedBars);
  return { start: min * beatsPerBar, end: (max + 1) * beatsPerBar };
}

export function beatRangeToBars(
  start: number,
  end: number,
  beatsPerBar: number,
  totalBars: number,
): number[] {
  const first = Math.max(0, Math.floor(start / beatsPerBar));
  const last = Math.min(totalBars - 1, Math.ceil(end / beatsPerBar) - 1);
  const bars: number[] = [];
  for (let b = first; b <= last; b++) bars.push(b);
  return bars.length > 0 ? bars : [0];
}

export function toggleBarSelection(
  selectedBars: number[],
  bar: number,
  extend: boolean,
  totalBars: number,
): number[] {
  const clamped = Math.max(0, Math.min(totalBars - 1, bar));
  if (extend) {
    if (selectedBars.includes(clamped)) return [...selectedBars];
    return [...selectedBars, clamped].sort((a, b) => a - b);
  }
  return [clamped];
}

export function snapPitchToScale(
  pitch: number,
  key: string,
  scale: string,
  noteToPc: Record<string, number>,
  scaleIntervals: Record<string, number[]>,
  minMidi = 48,
  maxMidi = 84,
): number {
  const root = noteToPc[key] ?? 0;
  const intervals = scaleIntervals[scale] ?? scaleIntervals.major ?? [0, 2, 4, 5, 7, 9, 11];
  const allowed = new Set<number>();
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const rel = (midi % 12 - root + 12) % 12;
    if (intervals.includes(rel)) allowed.add(midi);
  }
  let best = pitch;
  let bestDist = Infinity;
  for (const p of allowed) {
    const d = Math.abs(p - pitch);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export interface NoteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function noteCanvasRect(
  startTime: number,
  duration: number,
  pitch: number,
  canvasW: number,
  canvasH: number,
  totalBeats: number,
  minPitch: number,
  maxPitch: number,
  noteHeight: number,
): NoteRect {
  const range = maxPitch - minPitch;
  const w = Math.max(noteHeight, (duration / totalBeats) * canvasW);
  const x = (startTime / totalBeats) * canvasW;
  const y = canvasH - ((pitch - minPitch) / range) * canvasH - noteHeight - 2;
  return { x, y, w, h: noteHeight };
}

export type NoteHitZone = "resize-left" | "resize-right" | "body" | null;

export function hitTestNote(
  px: number,
  py: number,
  rect: NoteRect,
  edgePx = 8,
): NoteHitZone {
  if (px < rect.x || px > rect.x + rect.w || py < rect.y || py > rect.y + rect.h) {
    return null;
  }
  if (px - rect.x <= edgePx) return "resize-left";
  if (rect.x + rect.w - px <= edgePx) return "resize-right";
  return "body";
}
