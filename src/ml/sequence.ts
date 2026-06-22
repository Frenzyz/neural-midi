import type { ArticulationType, ChordMode, GenerationMode, Genre, MidiNote, Scale, StylePreset } from "./types.js";

export interface SequenceState {
  notes: MidiNote[];
  key: string;
  scale: Scale;
  genre: Genre;
  bars: number;
  temperature: number;
  expression: number;
  stylePreset: StylePreset;
  tightenPhrasing: boolean;
  seed: number;
  chordMode: ChordMode;
  generationMode: GenerationMode;
  articulation: ArticulationType;
  chordLabels: string[];
  generationHistory: MidiNote[][];
  historyIndex: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  selectionStart: number;
  selectionEnd: number;
  useRegionSettings: boolean;
  regionKey: string;
  regionScale: Scale;
  regionGenre: Genre;
  regionTemperature: number;
  regionExpression: number;
  regionStylePreset: StylePreset;
  regionTightenPhrasing: boolean;
  regionSeed: number;
}

export interface PreviewEvent {
  startTime: number;
  duration: number;
  frequency: number;
  velocity: number;
}

export function totalBeats(bars: number, beatsPerBar: number): number {
  return Math.max(0, bars * beatsPerBar);
}

export function normalizeSelection(
  start: number,
  end: number,
  maxBeat: number,
  grid = 0.25,
): { start: number; end: number } {
  let a = Math.max(0, Math.min(start, end));
  let b = Math.min(maxBeat, Math.max(start, end));
  if (b - a < grid) b = Math.min(maxBeat, a + grid);
  a = Math.round(a / grid) * grid;
  b = Math.round(b / grid) * grid;
  return { start: a, end: Math.max(a + grid, b) };
}

/** Remove notes overlapping [regionStart, regionEnd) and insert generated notes offset into the region. */
export function mergeRegionNotes(
  existing: MidiNote[],
  regionStart: number,
  regionEnd: number,
  generated: MidiNote[],
): MidiNote[] {
  const outside = existing.filter(
    (n) => n.startTime + n.duration <= regionStart || n.startTime >= regionEnd,
  );
  const placed = generated
    .filter((n) => n.startTime + regionStart < regionEnd)
    .map((n) => ({
      ...n,
      startTime: n.startTime + regionStart,
    }));
  return [...outside, ...placed].sort((a, b) => a.startTime - b.startTime);
}

export function regionBars(regionStart: number, regionEnd: number, beatsPerBar: number): number {
  const beats = Math.max(beatsPerBar, regionEnd - regionStart);
  return Math.max(1, Math.min(8, Math.ceil(beats / beatsPerBar)));
}

export function notesToPreviewEvents(notes: MidiNote[], tempo: number): PreviewEvent[] {
  const secPerBeat = 60 / Math.max(1, tempo);
  return notes.map((n) => ({
    startTime: n.startTime * secPerBeat,
    duration: Math.max(0.05, n.duration * secPerBeat),
    frequency: 440 * 2 ** ((n.pitch - 69) / 12),
    velocity: n.velocity,
  }));
}

export interface EditorResult {
  action:
    | "cancel"
    | "apply"
    | "generate_all"
    | "generate_selection"
    | "history_back"
    | "history_forward"
    | "remap_scale";
  notes: MidiNote[];
  key: string;
  scale: Scale;
  genre: Genre;
  bars: number;
  temperature: number;
  expression: number;
  stylePreset: StylePreset;
  tightenPhrasing: boolean;
  seed: number;
  chordMode: ChordMode;
  generationMode: GenerationMode;
  articulation: ArticulationType;
  selectionStart: number;
  selectionEnd: number;
  useRegionSettings: boolean;
  regionKey: string;
  regionScale: Scale;
  regionGenre: Genre;
  regionTemperature: number;
  regionExpression: number;
  regionStylePreset: StylePreset;
  regionTightenPhrasing: boolean;
  regionSeed: number;
  remapToKey?: string;
  remapToScale?: Scale;
}
