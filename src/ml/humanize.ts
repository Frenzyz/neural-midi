import type { ChordEvent, MidiNote } from "./types.js";
import { chordAtBeat } from "./chords.js";
import { quantizeBeat } from "./melody-engine.js";
import { GRID } from "./pattern-engine.js";

/** Delay off-beats slightly for swing feel (MIDI Wizard humanization). */
export function applySwing(
  notes: MidiNote[],
  amount: number,
  beatsPerBar: number,
): MidiNote[] {
  if (amount <= 0) return notes;
  const maxShift = 0.06 * amount;
  return notes.map((n) => {
    const posInBar = n.startTime % beatsPerBar;
    const sixteenth = Math.round(posInBar / GRID);
    const isOffbeat = sixteenth % 2 === 1;
    if (!isOffbeat) return n;
    return {
      ...n,
      startTime: n.startTime + maxShift,
    };
  });
}

export function applyVelocityHumanize(
  notes: MidiNote[],
  rng: () => number,
  accentBoost = 12,
): MidiNote[] {
  return notes.map((n) => {
    const pos = n.startTime % 4;
    const onDownbeat = Math.abs(pos % 1) < 0.01;
    const accent = onDownbeat ? accentBoost : 0;
    const jitter = Math.floor((rng() - 0.5) * 16);
    return {
      ...n,
      velocity: Math.max(35, Math.min(127, n.velocity + accent + jitter)),
    };
  });
}

/** Quiet passing-tone pickups between main notes. */
export function addGhostNotes(
  notes: MidiNote[],
  allowedPitches: number[],
  rng: () => number,
  chance: number,
): MidiNote[] {
  if (chance <= 0 || allowedPitches.length === 0) return notes;
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const ghosts: MidiNote[] = [];

  for (let i = 1; i < sorted.length; i++) {
    if (rng() > chance) continue;
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const gap = curr.startTime - prev.startTime;
    if (gap < 0.35 || gap > 1.5) continue;
    const ghostTime = quantizeBeat(prev.startTime + prev.duration * 0.85, GRID);
    if (ghostTime >= curr.startTime) continue;
    const pitch =
      allowedPitches.filter((p) => p !== prev.pitch && p !== curr.pitch)[
        Math.floor(rng() * allowedPitches.length)
      ] ??
      allowedPitches[Math.floor(rng() * allowedPitches.length)] ??
      prev.pitch;
    if (pitch === prev.pitch || pitch === curr.pitch) continue;
    ghosts.push({
      pitch,
      startTime: ghostTime,
      duration: Math.min(0.12, gap * 0.3),
      velocity: Math.max(28, Math.round(prev.velocity * 0.45)),
    });
  }

  return [...notes, ...ghosts].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

/** Light passing chord tones between strong beats. */
export function addHarmonicFillers(
  notes: MidiNote[],
  progression: ChordEvent[],
  beatsPerBar: number,
  rng: () => number,
  chance = 0.35,
): MidiNote[] {
  const fillers: MidiNote[] = [];
  for (const n of notes) {
    if (rng() > chance) continue;
    const chord = chordAtBeat(progression, n.startTime);
    if (!chord) continue;
    const fillerTime = quantizeBeat(n.startTime + n.duration * 0.5, GRID);
    const pc = chord.pitchClasses[Math.floor(rng() * chord.pitchClasses.length)]!;
    fillers.push({
      pitch: 60 + pc,
      startTime: fillerTime,
      duration: GRID,
      velocity: Math.max(32, Math.round(n.velocity * 0.5)),
    });
  }
  return [...notes, ...fillers].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}
