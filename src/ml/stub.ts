import type { GenerationParams, GenerationResult, MidiNote } from "./types.js";
import { resolveTimeSignature, toNumber } from "../util/coerce.js";
import { chordAtBeat } from "./chords.js";
import { genreEntry, pickMotifFragments } from "./genre-library.js";
import {
  GENRE_PROFILES,
  SCALE_INTERVALS,
  NOTE_TO_PC,
  buildScalePitches,
  mulberry32,
  nearestScaleIndex,
} from "./melody-engine.js";
import {
  addHarmonicStacks,
  addHarmonyLayer,
  applyLegatoOverlap,
  mergeVoices,
  motifFromFragment,
  phraseFromMotifs,
} from "./pattern-engine.js";

const STUB_VERSION = "stub-0.7.0";

function cadenceTargetIndex(pitches: number[], rootPc: number, intervals: number[]): number {
  const tonicCandidates = pitches
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p % 12 - rootPc + 12) % 12 === intervals[0]);
  if (tonicCandidates.length === 0) return 0;
  const mid = Math.floor(pitches.length / 2);
  let best = tonicCandidates[0]!.i;
  let bestDist = Infinity;
  for (const { i } of tonicCandidates) {
    const d = Math.abs(i - mid);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function enrichWithHarmony(
  notes: MidiNote[],
  progression: import("./types.js").ChordEvent[],
  rng: () => number,
  density: number,
): MidiNote[] {
  const layers: MidiNote[][] = [notes];
  for (const note of notes) {
    const chord = chordAtBeat(progression, note.startTime);
    if (!chord) continue;
    const layer = addHarmonyLayer([note], chord.pitchClasses, rng, density);
    if (layer.length > 1) layers.push(layer.slice(1));
  }
  return mergeVoices(...layers);
}

/**
 * Fragment-based melodic generator with genre motifs and phrase structure.
 */
export function generateStubMelody(params: GenerationParams): GenerationResult {
  const rng = mulberry32(toNumber(params.seed, 1));
  const rootPc = NOTE_TO_PC[params.key] ?? 0;
  const intervals = SCALE_INTERVALS[params.scale] ?? SCALE_INTERVALS.major;
  const profile = GENRE_PROFILES[params.genre] ?? GENRE_PROFILES.pop;
  const { numerator: beatsPerBar } = resolveTimeSignature({
    signatureNumerator: params.timeSignature.numerator,
    signatureDenominator: params.timeSignature.denominator,
  });
  const bars = Math.max(1, toNumber(params.bars, 4));
  const mode = params.generationMode ?? (params.chordProgression?.length ? "hybrid" : "melody");
  const progression = params.chordProgression ?? [];

  const pitches = buildScalePitches(rootPc, intervals, profile.minMidi, profile.maxMidi);
  if (pitches.length === 0) {
    return {
      notes: [{ pitch: 60 + rootPc, startTime: 0, duration: 0.5, velocity: 90 }],
      modelVersion: STUB_VERSION,
      usedStub: true,
    };
  }

  const [fragA, fragB] = pickMotifFragments(params.genre, rng);
  const motifA = motifFromFragment(fragA, beatsPerBar, rng);
  const motifB = motifFromFragment(fragB, beatsPerBar, rng);

  let notes = phraseFromMotifs(bars, beatsPerBar, motifA, motifB, pitches, rng);

  if (mode !== "chords" && progression.length > 0) {
    notes = enrichWithHarmony(notes, progression, rng, mode === "hybrid" ? 0.55 : 0.75);
    notes = addHarmonicStacks(notes, progression, rng, 0.8);
  }

  notes = applyLegatoOverlap(notes, params.articulation === "pluck" ? 0.05 : 0.1);

  if (notes.length === 0) {
    const tonicIdx = nearestScaleIndex(pitches, 60 + rootPc);
    notes = [{ pitch: pitches[tonicIdx]!, startTime: 0, duration: 0.5, velocity: 90 }];
  } else {
    const lead = notes.filter((n) => n.velocity >= 55).sort((a, b) => a.startTime - b.startTime);
    const last = lead[lead.length - 1] ?? notes[notes.length - 1]!;
    last.pitch = pitches[cadenceTargetIndex(pitches, rootPc, intervals)]!;
    last.velocity = Math.min(127, last.velocity + 6);
  }

  return {
    notes: notes.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch),
    modelVersion: STUB_VERSION,
    usedStub: true,
  };
}
