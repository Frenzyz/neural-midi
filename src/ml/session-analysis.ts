import { MidiClip } from "@ableton-extensions/sdk";
import type { ChordEvent, Genre, MidiNote, Scale } from "./types.js";
import {
  detectChordFromPitchClasses,
  inferChordProgression,
  isLikelyChordClip,
  pitchClassesAtTime,
} from "./chords.js";
import { NOTE_TO_PC, type RhythmEvent } from "./melody-engine.js";
import { GENRE_LIBRARY } from "./genre-library.js";
import { resolveTimeSignature, toNumber } from "../util/coerce.js";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const GRID = 0.25;
const SIXTEENTH = 0.25;

/** Krumhansl–Schmuckler key profiles (normalized). */
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export type ProjectAnalysisSource = "live-scale" | "midi-analysis" | "mixed";

export interface ProjectAnalysis {
  key: string;
  scale: Scale;
  confidence: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  chordProgression: ChordEvent[];
  rhythmTemplate?: RhythmEvent[];
  inferredGenre?: Genre;
  swingAmount: number;
  source: ProjectAnalysisSource;
  analyzedClipCount: number;
}

export interface AnalyzeProjectOptions {
  bars?: number;
  excludeClipHandle?: unknown;
}

interface ClipSample {
  notes: MidiNote[];
  trackIndex: number;
  slotIndex: number;
  isChord: boolean;
}

function handleId(h: unknown): string {
  return String((h as { id: bigint }).id ?? 0);
}

function toMidiNotes(raw: unknown[]): MidiNote[] {
  return (raw as Record<string, unknown>[]).map((n) => ({
    pitch: Number(n.pitch ?? 60),
    startTime: Number(n.startTime ?? 0),
    duration: Number(n.duration ?? 0.25),
    velocity: Number(n.velocity ?? 100),
  }));
}

function readClipNotes(clip: MidiClip<"1.0.0">): MidiNote[] {
  return toMidiNotes(clip.notes as unknown[]);
}

function normalizeProfile(profile: number[]): number[] {
  const sum = profile.reduce((a, b) => a + b, 0);
  return profile.map((v) => v / sum);
}

function rotateProfile(profile: number[], semitones: number): number[] {
  const out = new Array<number>(12).fill(0);
  for (let i = 0; i < 12; i++) {
    out[i] = profile[(i - semitones + 12) % 12]!;
  }
  return out;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den > 0 ? num / den : 0;
}

export interface KeyDetectionResult {
  key: string;
  scale: Scale;
  confidence: number;
  rootPc: number;
}

/** Weighted pitch-class histogram → K–S key detection. */
export function detectKeyFromNotes(notes: MidiNote[]): KeyDetectionResult {
  const histogram = new Array<number>(12).fill(0);
  for (const n of notes) {
    const weight = Math.max(0.1, n.duration) * (n.velocity / 127);
    histogram[n.pitch % 12] += weight;
  }

  const total = histogram.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return { key: "C", scale: "major", confidence: 0, rootPc: 0 };
  }

  const normalized = histogram.map((v) => v / total);
  const majorBase = normalizeProfile(KS_MAJOR);
  const minorBase = normalizeProfile(KS_MINOR);

  let best: KeyDetectionResult = { key: "C", scale: "major", confidence: 0, rootPc: 0 };

  for (let root = 0; root < 12; root++) {
    const majorCorr = pearsonCorrelation(normalized, rotateProfile(majorBase, root));
    if (majorCorr > best.confidence) {
      best = { key: KEY_NAMES[root]!, scale: "major", confidence: majorCorr, rootPc: root };
    }
    const minorCorr = pearsonCorrelation(normalized, rotateProfile(minorBase, root));
    if (minorCorr > best.confidence) {
      best = {
        key: KEY_NAMES[root]!,
        scale: "natural-minor",
        confidence: minorCorr,
        rootPc: root,
      };
    }
  }

  return best;
}

/** 16th-note onset density per bar slot (length 16). */
export function fingerprintRhythm(notes: MidiNote[], beatsPerBar = 4): number[] {
  const slots = new Array<number>(16).fill(0);
  for (const n of notes) {
    const barBeat = ((n.startTime % beatsPerBar) + beatsPerBar) % beatsPerBar;
    const slot = Math.min(15, Math.floor(barBeat / SIXTEENTH));
    slots[slot] += 1;
  }
  const max = Math.max(...slots, 1);
  return slots.map((v) => v / max);
}

export function rhythmTemplateFromFingerprint(
  fingerprint: number[],
  beatsPerBar = 4,
): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  for (let i = 0; i < fingerprint.length; i++) {
    const strength = fingerprint[i]!;
    if (strength < 0.2) continue;
    events.push({
      offset: i * SIXTEENTH,
      duration: Math.min(0.75, beatsPerBar / 4),
      accent: i % 4 === 0,
      restChance: Math.max(0, 1 - strength),
    });
  }
  return events.length > 0 ? events : [{ offset: 0, duration: 0.5, accent: true, restChance: 0 }];
}

function genreRhythmFingerprint(genre: Genre): number[] {
  const entry = GENRE_LIBRARY[genre];
  const motif = entry.motifs[0];
  if (!motif) return new Array<number>(16).fill(0);
  const slots = new Array<number>(16).fill(0);
  for (const slot of motif.slots) {
    const idx = Math.min(15, Math.floor(slot.beatInMotif / SIXTEENTH));
    slots[idx] += 1;
  }
  const max = Math.max(...slots, 1);
  return slots.map((v) => v / max);
}

export function inferGenreFromRhythm(
  fingerprint: number[],
  noteDensity: number,
): Genre | undefined {
  const genres = Object.keys(GENRE_LIBRARY) as Genre[];
  let best: { genre: Genre; score: number } | null = null;

  for (const genre of genres) {
    const template = genreRhythmFingerprint(genre);
    const corr = pearsonCorrelation(fingerprint, template);
    const densityTarget = genre === "ambient" || genre === "lofi" ? 0.35 : genre === "edm" ? 1.4 : 0.9;
    const densityScore = 1 - Math.min(1, Math.abs(noteDensity - densityTarget));
    const score = corr * 0.65 + densityScore * 0.35;
    if (!best || score > best.score) best = { genre, score };
  }

  return best && best.score > 0.2 ? best.genre : undefined;
}

export function estimateSwingAmount(notes: MidiNote[], beatsPerBar = 4): number {
  if (notes.length < 4) return 0.08;

  let offbeatTotal = 0;
  let offbeatLate = 0;
  let offbeatCount = 0;

  for (const n of notes) {
    const barBeat = ((n.startTime % beatsPerBar) + beatsPerBar) % beatsPerBar;
    const snapped = Math.round(barBeat / GRID) * GRID;
    const isOffbeat = Math.abs(barBeat % 0.5 - 0.25) < 0.12 || Math.abs(barBeat % 1 - 0.75) < 0.12;
    if (!isOffbeat) continue;
    offbeatCount++;
    const delta = barBeat - snapped;
    offbeatTotal += delta;
    if (delta > 0.02) offbeatLate++;
  }

  if (offbeatCount < 2) return 0.08;
  const lateRatio = offbeatLate / offbeatCount;
  const avgLate = offbeatTotal / offbeatCount;
  return Math.max(0.04, Math.min(0.22, 0.06 + lateRatio * 0.08 + avgLate * 0.5));
}

function liveScaleNameToScale(name: string): Scale | null {
  const n = name.toLowerCase().trim().replace(/\s+/g, "-");
  const map: Record<string, Scale> = {
    major: "major",
    minor: "natural-minor",
    "natural-minor": "natural-minor",
    dorian: "dorian",
    mixolydian: "mixolydian",
    lydian: "lydian",
    phrygian: "phrygian",
    locrian: "locrian",
    "harmonic-minor": "harmonic-minor",
    "melodic-minor": "melodic-minor",
  };
  return map[n] ?? null;
}

function readLiveScale(song: Record<string, unknown>): { key: string; scale: Scale } | null {
  const scaleEnabled =
    Boolean(song.scale_mode_enabled) ||
    Boolean(song.scaleModeEnabled) ||
    Boolean(song.scale_mode) ||
    Boolean(song.scaleMode);
  if (!scaleEnabled) return null;

  const rootRaw = song.root_note ?? song.rootNote;
  const scaleRaw = song.scale_name ?? song.scaleName;
  if (rootRaw == null || scaleRaw == null) return null;

  const rootPc = ((toNumber(rootRaw, 0) % 12) + 12) % 12;
  const scale = liveScaleNameToScale(String(scaleRaw));
  if (!scale) return null;

  return { key: KEY_NAMES[rootPc] ?? "C", scale };
}

function enumerateSessionClips(
  song: { tracks: unknown[] },
  excludeHandle?: unknown,
): ClipSample[] {
  const excludeId = excludeHandle != null ? handleId(excludeHandle) : null;
  const tracks = song.tracks as Array<{ clipSlots?: Array<{ clip?: unknown }> }>;
  const samples: ClipSample[] = [];

  for (let ti = 0; ti < tracks.length; ti++) {
    const slots = tracks[ti]?.clipSlots ?? [];
    for (let si = 0; si < slots.length; si++) {
      const raw = slots[si]?.clip;
      if (!(raw instanceof MidiClip)) continue;
      const clip = raw as MidiClip<"1.0.0">;
      const clipHandle = (clip as { handle?: unknown }).handle ?? clip;
      if (excludeId && handleId(clipHandle) === excludeId) continue;
      const notes = readClipNotes(clip);
      if (notes.length === 0) continue;
      samples.push({
        notes,
        trackIndex: ti,
        slotIndex: si,
        isChord: isLikelyChordClip(notes),
      });
    }
  }

  return samples;
}

function aggregateMelodyNotes(samples: ClipSample[]): MidiNote[] {
  return samples.filter((s) => !s.isChord).flatMap((s) => s.notes);
}

function inferSessionChords(
  samples: ClipSample[],
  beatsPerBar: number,
  bars: number,
): ChordEvent[] {
  const chordClips = samples.filter((s) => s.isChord);
  if (chordClips.length === 0) return [];

  const best = chordClips.reduce((a, b) => (a.notes.length >= b.notes.length ? a : b));
  const progression = inferChordProgression(best.notes, beatsPerBar, bars);
  if (progression.length > 0) return progression;

  const merged: ChordEvent[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const startBeat = bar * beatsPerBar;
    const pcs = new Set<number>();
    for (const sample of chordClips) {
      for (const pc of pitchClassesAtTime(sample.notes, startBeat + 0.05)) {
        pcs.add(pc);
      }
    }
    const detected = detectChordFromPitchClasses([...pcs].sort((a, b) => a - b));
    if (detected) {
      merged.push({ startBeat, duration: beatsPerBar, ...detected });
    }
  }
  return merged;
}

export interface MergeAnalysisInput {
  live: { key: string; scale: Scale } | null;
  midi: KeyDetectionResult;
  hasMidi: boolean;
}

/** Prefer Live scale when enabled; blend confidence when both agree. */
export function mergeKeyScaleAnalysis(input: MergeAnalysisInput): {
  key: string;
  scale: Scale;
  confidence: number;
  source: ProjectAnalysisSource;
} {
  const { live, midi, hasMidi } = input;

  if (live && hasMidi) {
    const agree = live.key === midi.key && live.scale === midi.scale;
    if (agree) {
      return {
        key: live.key,
        scale: live.scale,
        confidence: Math.min(1, (midi.confidence + 0.85) / 2),
        source: "mixed",
      };
    }
    return {
      key: live.key,
      scale: live.scale,
      confidence: 0.75,
      source: "live-scale",
    };
  }

  if (live) {
    return { key: live.key, scale: live.scale, confidence: 0.8, source: "live-scale" };
  }

  if (hasMidi) {
    return {
      key: midi.key,
      scale: midi.scale,
      confidence: Math.max(0, Math.min(1, midi.confidence)),
      source: "midi-analysis",
    };
  }

  return { key: "C", scale: "major", confidence: 0, source: "midi-analysis" };
}

export function analyzeProject(
  song: {
    tracks: unknown[];
    scenes: unknown[];
    tempo?: unknown;
    root_note?: unknown;
    rootNote?: unknown;
    scale_name?: unknown;
    scaleName?: unknown;
    scale_mode_enabled?: unknown;
    scaleModeEnabled?: unknown;
    scale_mode?: unknown;
    scaleMode?: unknown;
  },
  _targetClip: MidiClip<"1.0.0">,
  options: AnalyzeProjectOptions = {},
): ProjectAnalysis {
  const bars = options.bars ?? 4;
  const timeSignature = resolveTimeSignature(
    (song.scenes as Array<{ signatureNumerator?: unknown; signatureDenominator?: unknown }>)[0],
  );
  const beatsPerBar = timeSignature.numerator || 4;
  const tempo = toNumber(song.tempo, 120);

  const samples = enumerateSessionClips(song, options.excludeClipHandle);
  const melodyNotes = aggregateMelodyNotes(samples);
  const allNotes = samples.flatMap((s) => s.notes);

  const midiKey = detectKeyFromNotes(allNotes.length > 0 ? allNotes : melodyNotes);
  const liveScale = readLiveScale(song as Record<string, unknown>);
  const merged = mergeKeyScaleAnalysis({
    live: liveScale,
    midi: midiKey,
    hasMidi: allNotes.length > 0,
  });

  const rhythmNotes = melodyNotes.length > 0 ? melodyNotes : allNotes;
  const fingerprint = fingerprintRhythm(rhythmNotes, beatsPerBar);
  const barsCovered = Math.max(
    1,
    ...rhythmNotes.map((n) => Math.ceil((n.startTime + n.duration) / beatsPerBar)),
  );
  const densityPerBar = rhythmNotes.length / barsCovered;
  const inferredGenre = inferGenreFromRhythm(fingerprint, densityPerBar);
  const swingAmount =
    inferredGenre != null
      ? GENRE_LIBRARY[inferredGenre].swing
      : estimateSwingAmount(rhythmNotes, beatsPerBar);

  const chordProgression = inferSessionChords(samples, beatsPerBar, bars);
  const rhythmTemplate = rhythmTemplateFromFingerprint(fingerprint, beatsPerBar);

  return {
    key: merged.key,
    scale: merged.scale,
    confidence: merged.confidence,
    tempo,
    timeSignature,
    chordProgression,
    rhythmTemplate,
    inferredGenre,
    swingAmount,
    source: merged.source,
    analyzedClipCount: samples.length,
  };
}

/** Apply analysis to editor defaults when match-project is enabled. */
export function applyProjectAnalysisToState<T extends {
  key: string;
  scale: Scale;
  genre: Genre;
  regionKey: string;
  regionScale: Scale;
  regionGenre: Genre;
}>(
  state: T,
  analysis: ProjectAnalysis,
  matchProject: boolean,
): T {
  if (!matchProject) return state;
  const genre = analysis.inferredGenre ?? state.genre;
  return {
    ...state,
    key: analysis.key,
    scale: analysis.scale,
    genre,
    regionKey: analysis.key,
    regionScale: analysis.scale,
    regionGenre: genre,
  };
}

export function pcToKey(pc: number): string {
  return KEY_NAMES[((pc % 12) + 12) % 12] ?? "C";
}

export function keyToPc(key: string): number {
  return NOTE_TO_PC[key] ?? 0;
}
