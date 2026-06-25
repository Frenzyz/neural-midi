import type { ChordEvent, ChordQuality, Genre, MidiNote, Scale } from "./types.js";
import { QUALITY_TO_INDEX } from "./types.js";
import { voicingPitchesForStyle, type VoicingStyle } from "./melodic-modes.js";
import { NOTE_TO_PC, SCALE_INTERVALS } from "./melody-engine.js";
import { genreEntry } from "./genre-library.js";
import { quantizeBeat } from "./melody-engine.js";

const GRID = 0.25;

function arpeggiateBarLocal(
  chord: ChordEvent,
  barStart: number,
  beatsPerBar: number,
  rng: () => number,
  steps: number,
): MidiNote[] {
  const pcs = chord.pitchClasses.length > 0 ? chord.pitchClasses : [chord.rootPc];
  const notes: MidiNote[] = [];
  const stepLen = beatsPerBar / steps;
  for (let i = 0; i < steps; i++) {
    if (rng() < 0.08) continue;
    const pc = pcs[i % pcs.length]!;
    notes.push({
      pitch: 60 + pc + (i % 2) * 12,
      startTime: quantizeBeat(barStart + i * stepLen, GRID),
      duration: Math.max(GRID, stepLen * 0.9),
      velocity: 64 + (i % 2 === 0 ? 10 : 0),
    });
  }
  return notes;
}

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

/** Close-position voicing with optional 7th/9th color. */
export function chordVoicingPitches(
  chord: ChordEvent,
  centerMidi = 60,
  rich = false,
): number[] {
  const root = chord.rootPc;
  let pcs = chord.pitchClasses.length > 0 ? [...chord.pitchClasses] : [root, (root + 4) % 12, (root + 7) % 12];
  if (rich) {
    if (chord.quality === "dom7" || chord.quality === "min7") {
      if (!pcs.includes((root + 10) % 12)) pcs.push((root + 10) % 12);
    } else if (chord.quality === "major" && !pcs.includes((root + 2) % 12)) {
      pcs.push((root + 2) % 12);
    }
  }
  const baseOct = Math.floor(centerMidi / 12);
  const voicing: number[] = [];

  for (const pc of pcs) {
    let pitch = baseOct * 12 + pc;
    if (pitch < centerMidi - 6) pitch += 12;
    if (pitch > centerMidi + 14) pitch -= 12;
    voicing.push(pitch);
  }
  return [...new Set(voicing)].sort((a, b) => a - b);
}

/** Voice-lead from previous voicing to minimize movement. */
export function voiceLeadVoicing(
  chord: ChordEvent,
  prevPitches: number[],
  centerMidi = 58,
  voicingStyle: VoicingStyle = "color",
): number[] {
  const candidates: number[][] = [];
  for (let shift = -12; shift <= 12; shift += 12) {
    candidates.push(voicingPitchesForStyle(chord, voicingStyle, centerMidi + shift));
  }
  if (!prevPitches.length) {
    return candidates[0] ?? voicingPitchesForStyle(chord, voicingStyle, centerMidi);
  }
  const prevCenter = prevPitches.reduce((a, b) => a + b, 0) / prevPitches.length;
  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const cand of candidates) {
    const center = cand.reduce((a, b) => a + b, 0) / cand.length;
    const cost = Math.abs(center - prevCenter);
    if (cost < bestCost) {
      bestCost = cost;
      best = cand;
    }
  }
  return best;
}

export interface ChordVoicingOptions {
  beatsPerBar: number;
  bars: number;
  progression: ChordEvent[];
  articulation?: "lead" | "pluck";
  rng?: () => number;
  voicingStyle?: VoicingStyle;
}

/** Block / rhythm chord MIDI for Chords mode. */
export function generateChordVoicings(options: ChordVoicingOptions): MidiNote[] {
  const { beatsPerBar, bars, progression, articulation = "lead", voicingStyle = "color" } = options;
  const rng = options.rng ?? (() => 0.5);
  const notes: MidiNote[] = [];
  let prevVoicing: number[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * beatsPerBar;
    const chord = chordAtBeat(progression, barStart);
    if (!chord) continue;

    const voicing = voiceLeadVoicing(chord, prevVoicing, 58 + (bar % 2) * 2, voicingStyle);
    prevVoicing = voicing;
    const pluck = articulation === "pluck";
    const hits = pluck ? [0, 1, 2, 3] : [0, 2];

    for (const hit of hits) {
      const startTime = barStart + hit;
      const duration = pluck ? 0.35 : beatsPerBar / hits.length - 0.02;
      const velocity = hit === 0 ? 84 : 72;

      for (const pitch of voicing) {
        notes.push({
          pitch,
          startTime,
          duration: Math.max(0.25, duration),
          velocity: Math.min(127, velocity + Math.floor(rng() * 8)),
        });
      }
    }
  }

  return notes;
}

/** Full hybrid accompaniment: voicings + rhythmic hits + arpeggios. */
export function generateHybridAccompaniment(
  progression: ChordEvent[],
  beatsPerBar: number,
  bars: number,
  articulation: "lead" | "pluck" = "lead",
  rng: () => number = () => 0.5,
  voicingStyle: VoicingStyle = "color",
): MidiNote[] {
  const notes: MidiNote[] = [];
  let prevVoicing: number[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * beatsPerBar;
    const chord = chordAtBeat(progression, barStart);
    if (!chord) continue;

    const voicing = voiceLeadVoicing(chord, prevVoicing, 52, voicingStyle);
    prevVoicing = voicing;

    const hitTimes = articulation === "pluck" ? [0, 1, 2, 3] : [0, 1.5, 2.5];
    for (const t of hitTimes) {
      for (const pitch of voicing) {
        notes.push({
          pitch,
          startTime: barStart + t,
          duration: articulation === "pluck" ? 0.28 : 0.55,
          velocity: t === 0 ? 74 : 62,
        });
      }
    }

    if (rng() < 0.75) {
      notes.push(...arpeggiateBarLocal(chord, barStart, beatsPerBar, rng, articulation === "pluck" ? 8 : 4));
    }
  }
  return notes;
}

/** @deprecated use generateHybridAccompaniment */
export function generateHybridChordStabs(
  progression: ChordEvent[],
  beatsPerBar: number,
  bars: number,
  articulation: "lead" | "pluck" = "lead",
): MidiNote[] {
  const notes: MidiNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * beatsPerBar;
    const chord = chordAtBeat(progression, barStart);
    if (!chord) continue;

    const voicing = chordVoicingPitches(chord, 52);
    const stabTimes = articulation === "pluck" ? [0, 2] : [0];
    for (const t of stabTimes) {
      for (const pitch of voicing) {
        notes.push({
          pitch,
          startTime: barStart + t,
          duration: articulation === "pluck" ? 0.3 : 0.5,
          velocity: 68,
        });
      }
    }
  }
  return notes;
}

const DIATONIC_MAJOR_QUALITIES: ChordQuality[] = ["major", "minor", "minor", "major", "major", "minor", "dim"];
const DIATONIC_MINOR_QUALITIES: ChordQuality[] = ["minor", "dim", "major", "minor", "minor", "major", "major"];

function chordFromDegree(
  rootPc: number,
  degree: number,
  scale: Scale,
): Omit<ChordEvent, "startBeat" | "duration"> {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  const qualities =
    scale === "natural-minor" || scale === "dorian" || scale === "phrygian"
      ? DIATONIC_MINOR_QUALITIES
      : DIATONIC_MAJOR_QUALITIES;
  const chordRoot = (rootPc + intervals[degree % intervals.length]!) % 12;
  const quality = qualities[degree % qualities.length] ?? "major";
  const tmpl = CHORD_TEMPLATES.find((t) => t.quality === quality) ?? CHORD_TEMPLATES[0]!;
  return {
    rootPc: chordRoot,
    quality: tmpl.quality,
    pitchClasses: tmpl.intervals.map((i) => (chordRoot + i) % 12),
  };
}

/** Fallback genre-aware progression when none is detected. */
export function defaultDiatonicProgression(
  key: string,
  scale: Scale,
  bars: number,
  beatsPerBar: number,
  genre?: Genre,
): ChordEvent[] {
  const rootPc = NOTE_TO_PC[key] ?? 0;
  const entry = genre ? genreEntry(genre) : null;
  const degrees = entry?.progressionDegrees ?? (scale === "natural-minor" ? [0, 4, 2, 5] : [0, 4, 5, 3]);
  const progression: ChordEvent[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const degree = degrees[bar % degrees.length]!;
    progression.push({
      startBeat: bar * beatsPerBar,
      duration: beatsPerBar,
      ...chordFromDegree(rootPc, degree, scale),
    });
  }
  return progression;
}
