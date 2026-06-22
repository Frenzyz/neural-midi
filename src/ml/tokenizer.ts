import type { ChordEvent, ChordQuality, MidiNote } from "./types.js";
import { QUALITY_TO_INDEX } from "./types.js";

/** REST / start token */
export const REST_TOKEN = 12;
export const VOCAB_SIZE = 13;
export const POSITION_COUNT = 16;

export function pitchToToken(pitch: number): number {
  return pitch % 12;
}

export function tokenToPitch(token: number, octave: number): number {
  if (token === REST_TOKEN) return -1;
  return octave * 12 + token;
}

export function chordRootOneHot(chord: ChordEvent | undefined): Float32Array {
  const v = new Float32Array(12);
  if (chord) v[chord.rootPc] = 1;
  return v;
}

export function chordQualityOneHot(chord: ChordEvent | undefined): Float32Array {
  const v = new Float32Array(6);
  if (chord) v[QUALITY_TO_INDEX[chord.quality]] = 1;
  return v;
}

export function positionIndex(beatInBar: number, beatsPerBar: number): number {
  const norm = (beatInBar % beatsPerBar) / Math.max(beatsPerBar, 1);
  return Math.min(POSITION_COUNT - 1, Math.floor(norm * POSITION_COUNT));
}

export function notesToTokenSequence(notes: MidiNote[], grid = 0.25): number[] {
  if (notes.length === 0) return [REST_TOKEN];
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const end = sorted[sorted.length - 1]!.startTime + sorted[sorted.length - 1]!.duration;
  const tokens: number[] = [REST_TOKEN];
  for (let t = 0; t < end; t += grid) {
    const active = sorted.find((n) => t >= n.startTime && t < n.startTime + n.duration);
    tokens.push(active ? pitchToToken(active.pitch) : REST_TOKEN);
  }
  return tokens;
}

export function qualityFromIndex(idx: number): ChordQuality {
  const qualities: ChordQuality[] = ["major", "minor", "dom7", "min7", "dim", "sus"];
  return qualities[Math.max(0, Math.min(5, idx))] ?? "major";
}
