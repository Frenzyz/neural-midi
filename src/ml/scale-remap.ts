import { NOTE_TO_PC, SCALE_INTERVALS, buildScalePitches, nearestScaleIndex } from "./melody-engine.js";
import type { MidiNote, Scale } from "./types.js";

function rootPc(key: string): number {
  return NOTE_TO_PC[key] ?? 0;
}

/** Remap each note to the same scale degree in a new key/scale. */
export function remapPitch(
  pitch: number,
  fromKey: string,
  fromScale: Scale,
  toKey: string,
  toScale: Scale,
): number {
  const fromRoot = rootPc(fromKey);
  const toRoot = rootPc(toKey);
  const semitoneShift = ((toRoot - fromRoot) % 12 + 12) % 12;
  const shifted = pitch + semitoneShift;
  const toPitches = buildScalePitches(toRoot, SCALE_INTERVALS[toScale], 36, 96);
  const idx = nearestScaleIndex(toPitches, shifted);
  return toPitches[idx] ?? shifted;
}

export function remapToScale(
  notes: MidiNote[],
  fromKey: string,
  fromScale: Scale,
  toKey: string,
  toScale: Scale,
): MidiNote[] {
  if (fromKey === toKey && fromScale === toScale) {
    return notes.map((n) => ({ ...n }));
  }
  return notes.map((n) => ({
    ...n,
    pitch: remapPitch(n.pitch, fromKey, fromScale, toKey, toScale),
  }));
}
