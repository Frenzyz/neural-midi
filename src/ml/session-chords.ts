import { MidiClip } from "@ableton-extensions/sdk";
import type { ChordEvent, ChordMode, MidiNote } from "./types.js";
import { inferChordProgression, isLikelyChordClip } from "./chords.js";
import { resolveTimeSignature, toNumber } from "../util/coerce.js";

function toMidiNotes(raw: unknown[]): MidiNote[] {
  return (raw as Record<string, unknown>[]).map((n) => ({
    pitch: Number(n.pitch ?? 60),
    startTime: Number(n.startTime ?? 0),
    duration: Number(n.duration ?? 0.25),
    velocity: Number(n.velocity ?? 100),
  }));
}

function handleId(h: unknown): string {
  return String((h as { id: bigint }).id ?? 0);
}

interface ClipLocation {
  trackIndex: number;
  slotIndex: number;
}

function findClipLocation(
  song: { tracks: unknown[] },
  targetHandle: unknown,
): ClipLocation | null {
  const targetId = handleId(targetHandle);
  const tracks = song.tracks as Array<{ clipSlots?: Array<{ clip?: unknown }> }>;

  for (let ti = 0; ti < tracks.length; ti++) {
    const slots = tracks[ti]?.clipSlots ?? [];
    for (let si = 0; si < slots.length; si++) {
      const clip = slots[si]?.clip;
      if (!clip) continue;
      if (handleId((clip as { handle?: unknown }).handle ?? clip) === targetId) {
        return { trackIndex: ti, slotIndex: si };
      }
    }
  }
  return null;
}

function readClipNotes(clip: MidiClip<"1.0.0">): MidiNote[] {
  return toMidiNotes(clip.notes as unknown[]);
}

function progressionFromClip(
  clip: MidiClip<"1.0.0">,
  beatsPerBar: number,
  bars: number,
): ChordEvent[] {
  return inferChordProgression(readClipNotes(clip), beatsPerBar, bars);
}

function findChordClipOnTrack(
  song: { tracks: unknown[] },
  trackIndex: number,
  beforeSlot: number,
  bars: number,
  beatsPerBar: number,
): ChordEvent[] {
  const track = (song.tracks as Array<{ clipSlots?: Array<{ clip?: unknown }> }>)[trackIndex];
  if (!track) return [];

  let best: { notes: MidiNote[]; score: number } | null = null;

  const slots = track.clipSlots ?? [];
  for (let si = 0; si < beforeSlot && si < slots.length; si++) {
    const raw = slots[si]?.clip;
    if (!(raw instanceof MidiClip)) continue;
    const clip = raw as MidiClip<"1.0.0">;
    const notes = readClipNotes(clip);
    if (!isLikelyChordClip(notes)) continue;
    const score = notes.length;
    if (!best || score > best.score) best = { notes, score };
  }

  if (!best) return [];
  return inferChordProgression(best.notes, beatsPerBar, bars);
}

export function resolveChordProgression(
  song: { tracks: unknown[]; scenes: unknown[] },
  targetClip: MidiClip<"1.0.0">,
  targetHandle: unknown,
  chordMode: ChordMode,
  bars: number,
): ChordEvent[] {
  if (chordMode === "none") return [];

  const beatsPerBar = resolveTimeSignature(
    (song.scenes as Array<{ signatureNumerator?: unknown; signatureDenominator?: unknown }>)[0],
  ).numerator;

  const loc = findClipLocation(song, targetHandle);
  if (!loc) return [];

  if (chordMode === "clip-below") {
    const track = (song.tracks as Array<{ clipSlots?: Array<{ clip?: unknown }> }>)[loc.trackIndex];
    const belowSlot = loc.slotIndex - 1;
    if (belowSlot < 0 || !track) return [];
    const raw = track.clipSlots?.[belowSlot]?.clip;
    if (!(raw instanceof MidiClip)) return [];
    return progressionFromClip(raw as MidiClip<"1.0.0">, beatsPerBar, bars);
  }

  if (chordMode === "same-track") {
    return findChordClipOnTrack(song, loc.trackIndex, loc.slotIndex, bars, beatsPerBar);
  }

  return [];
}
