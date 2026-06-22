import type { ChordEvent, ChordQuality, MidiNote } from "./types.js";
import { QUALITY_TO_INDEX } from "./types.js";

const CHORD_TEMPLATES: { quality: ChordQuality; intervals: number[] }[] = [
  { quality: "major", intervals: [0, 4, 7] },
  { quality: "minor", intervals: [0, 3, 7] },
  { quality: "dom7", intervals: [0, 4, 7, 10] },
  { quality: "min7", intervals: [0, 3, 7, 10] },
  { quality: "dim", intervals: [0, 3, 6] },
  { quality: "sus", intervals: [0, 5, 7] },
];

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  dom7: "7",
  min7: "m7",
  dim: "dim",
  sus: "sus",
};

export function chordLabel(chord: ChordEvent | undefined): string {
  if (!chord) return "—";
  return `${KEY_NAMES[chord.rootPc] ?? "C"}${QUALITY_SUFFIX[chord.quality]}`;
}

export function chordLabelsPerBar(
  progression: ChordEvent[],
  bars: number,
  beatsPerBar: number,
): string[] {
  const labels: string[] = [];
  for (let bar = 0; bar < bars; bar++) {
    labels.push(chordLabel(chordAtBeat(progression, bar * beatsPerBar)));
  }
  return labels;
}

export function pitchClassesAtTime(notes: MidiNote[], time: number): number[] {
  const pcs = new Set<number>();
  for (const n of notes) {
    if (time >= n.startTime && time < n.startTime + n.duration) {
      pcs.add(n.pitch % 12);
    }
  }
  return [...pcs].sort((a, b) => a - b);
}

export function detectChordFromPitchClasses(pcs: number[]): Omit<ChordEvent, "startBeat" | "duration"> | null {
  if (pcs.length < 2) return null;

  let best: { quality: ChordQuality; rootPc: number; score: number } | null = null;

  for (let root = 0; root < 12; root++) {
    for (const tmpl of CHORD_TEMPLATES) {
      const expected = new Set(tmpl.intervals.map((i) => (root + i) % 12));
      let hits = 0;
      for (const pc of pcs) {
        if (expected.has(pc)) hits++;
      }
      const precision = hits / expected.size;
      const recall = hits / pcs.length;
      const score = precision * 0.6 + recall * 0.4;
      if (!best || score > best.score) {
        best = { quality: tmpl.quality, rootPc: root, score };
      }
    }
  }

  if (!best || best.score < 0.55) return null;

  const tmpl = CHORD_TEMPLATES.find((t) => t.quality === best!.quality)!;
  const pitchClasses = tmpl.intervals.map((i) => (best!.rootPc + i) % 12);

  return { rootPc: best.rootPc, quality: best.quality, pitchClasses };
}

export function inferChordProgression(
  notes: MidiNote[],
  beatsPerBar: number,
  bars: number,
): ChordEvent[] {
  const progression: ChordEvent[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const startBeat = bar * beatsPerBar;
    const pcs = pitchClassesAtTime(notes, startBeat + 0.05);
    const detected = detectChordFromPitchClasses(pcs);
    if (detected) {
      progression.push({
        startBeat,
        duration: beatsPerBar,
        ...detected,
      });
    }
  }

  return progression;
}

export function chordAtBeat(progression: ChordEvent[], beat: number): ChordEvent | undefined {
  return progression.find((c) => beat >= c.startBeat && beat < c.startBeat + c.duration);
}

export function isPitchInChord(pitch: number, chord: ChordEvent): boolean {
  return chord.pitchClasses.includes(pitch % 12);
}

export function chordQualityIndex(quality: ChordQuality): number {
  return QUALITY_TO_INDEX[quality];
}

export function isLikelyChordClip(notes: MidiNote[]): boolean {
  if (notes.length < 3) return false;
  const sampleTimes = [0, 0.5, 1, 2];
  let polyphonic = 0;
  for (const t of sampleTimes) {
    if (pitchClassesAtTime(notes, t).length >= 3) polyphonic++;
  }
  return polyphonic >= 2;
}

export function nearestChordTonePitch(
  pitch: number,
  chord: ChordEvent,
  minMidi = 48,
  maxMidi = 84,
): number {
  const pc = pitch % 12;
  if (chord.pitchClasses.includes(pc)) return pitch;

  let best = pitch;
  let bestDist = Infinity;
  for (let p = minMidi; p <= maxMidi; p++) {
    if (!chord.pitchClasses.includes(p % 12)) continue;
    const d = Math.abs(p - pitch);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
