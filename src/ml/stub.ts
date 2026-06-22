import type { GenerationParams, GenerationResult, MidiNote, ChordEvent } from "./types.js";
import { resolveTimeSignature, toNumber } from "../util/coerce.js";
import { chordAtBeat } from "./chords.js";
import {
  GENRE_PROFILES,
  PHRASE_CONTOUR,
  SCALE_INTERVALS,
  NOTE_TO_PC,
  buildScalePitches,
  mulberry32,
  nearestScaleIndex,
  quantizeBeat,
  type RhythmEvent,
} from "./melody-engine.js";

const STUB_VERSION = "stub-0.3.0";

function nearestChordIndex(pitches: number[], chord: ChordEvent): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pitches.length; i++) {
    const pc = pitches[i]! % 12;
    if (!chord.pitchClasses.includes(pc)) continue;
    const dist = Math.abs(i - Math.floor(pitches.length * 0.55));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function contourTarget(barInPhrase: number, phraseLength: number): number {
  const idx = barInPhrase % PHRASE_CONTOUR.length;
  return PHRASE_CONTOUR[idx] ?? 0.5;
}

function chooseMotion(
  current: number,
  target: number,
  maxIndex: number,
  rng: () => number,
  temperature: number,
  expressiveness: number,
  isCadence: boolean,
): number {
  const dist = target - current;
  const stepChance = 0.72 - temperature * 0.18;
  const thirdChance = 0.14 + expressiveness * 0.1;

  if (isCadence) {
    if (current === target) return current;
    const step = dist > 0 ? 1 : -1;
    return Math.max(0, Math.min(maxIndex, current + step));
  }

  if (Math.abs(dist) <= 1 && rng() < stepChance) {
    const step = dist === 0 ? (rng() < 0.5 ? -1 : 1) : dist > 0 ? 1 : -1;
    return Math.max(0, Math.min(maxIndex, current + step));
  }

  if (rng() < thirdChance) {
    const step = dist >= 0 ? 2 : -2;
    return Math.max(0, Math.min(maxIndex, current + step));
  }

  if (rng() < 0.08 + temperature * expressiveness * 0.15) {
    const leap = Math.floor(rng() * 5) - 2;
    return Math.max(0, Math.min(maxIndex, current + leap));
  }

  const pull = dist > 0 ? 1 : dist < 0 ? -1 : rng() < 0.5 ? -1 : 1;
  return Math.max(0, Math.min(maxIndex, current + pull));
}

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

function humanizeVelocity(base: number, accent: boolean, rng: () => number): number {
  const center = accent ? base + 14 : base;
  return Math.max(40, Math.min(127, Math.floor(center + (rng() - 0.5) * 18)));
}

function trimDurations(notes: MidiNote[]): MidiNote[] {
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]!;
    const next = sorted[i + 1]!;
    const maxDur = next.startTime - curr.startTime;
    if (maxDur > 0.05 && curr.duration > maxDur) {
      curr.duration = Math.max(0.1, maxDur - 0.02);
    }
  }
  return sorted;
}

function generateBarNotes(
  barStart: number,
  beatsPerBar: number,
  barInPhrase: number,
  phraseLength: number,
  pattern: RhythmEvent[],
  pitches: number[],
  pitchIndex: number,
  rootPc: number,
  intervals: number[],
  rng: () => number,
  temperature: number,
  expressiveness: number,
  isFinalBar: boolean,
  chord: ChordEvent | undefined,
): { notes: MidiNote[]; pitchIndex: number } {
  const notes: MidiNote[] = [];
  let index = pitchIndex;
  const maxIndex = pitches.length - 1;
  const contour = contourTarget(barInPhrase, phraseLength);
  const targetIndex = Math.round(contour * maxIndex);
  const cadenceIndex = cadenceTargetIndex(pitches, rootPc, intervals);

  const events = [...pattern].sort((a, b) => a.offset - b.offset);
  let eventIdx = 0;

  for (const event of events) {
    if (event.offset >= beatsPerBar) continue;
    if (rng() < event.restChance + temperature * 0.08) continue;

    const isLastEvent = eventIdx === events.length - 1;
    const isCadence = isFinalBar && isLastEvent;
    let goal = isCadence ? cadenceIndex : targetIndex;
    if (chord && !isCadence) {
      const chordIdx = nearestChordIndex(pitches, chord);
      goal = Math.round(goal * 0.45 + chordIdx * 0.55);
    }

    index = chooseMotion(index, goal, maxIndex, rng, temperature, expressiveness, isCadence);

    const startTime = quantizeBeat(barStart + event.offset);
    const pitch = pitches[index]!;
    const velocity = humanizeVelocity(78, event.accent, rng);

    notes.push({
      pitch,
      startTime,
      duration: event.duration,
      velocity,
    });
    eventIdx++;
  }

  return { notes, pitchIndex: index };
}

/**
 * Rule-based melodic generator with phrase contours, genre rhythms, and cadences.
 * Serves as the on-device fallback until the ONNX model is integrated.
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
  const temperature = Math.max(0, Math.min(1, toNumber(params.temperature, 0.7)));

  const pitches = buildScalePitches(rootPc, intervals, profile.minMidi, profile.maxMidi);
  if (pitches.length === 0) {
    return {
      notes: [{ pitch: 60 + rootPc, startTime: 0, duration: 0.5, velocity: 90 }],
      modelVersion: STUB_VERSION,
      usedStub: true,
    };
  }

  // Start near the tonic in the middle register
  let pitchIndex = nearestScaleIndex(pitches, 60 + rootPc);

  const allNotes: MidiNote[] = [];

  const progression = params.chordProgression ?? [];

  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * beatsPerBar;
    const barInPhrase = bar % profile.phraseLength;
    const patternIdx = (bar + Math.floor(toNumber(params.seed, 1) / 97)) % profile.patterns.length;
    const pattern = profile.patterns[patternIdx] ?? profile.patterns[0]!;
    const isFinalBar = bar === bars - 1;
    const chord = chordAtBeat(progression, barStart);

    const { notes, pitchIndex: nextIndex } = generateBarNotes(
      barStart,
      beatsPerBar,
      barInPhrase,
      profile.phraseLength,
      pattern,
      pitches,
      pitchIndex,
      rootPc,
      intervals,
      rng,
      temperature,
      profile.expressiveness,
      isFinalBar,
      chord,
    );

    pitchIndex = nextIndex;
    allNotes.push(...notes);
  }

  // Repeat 2-bar motif with variation in bars 3–4 when long enough
  if (bars >= 4 && allNotes.length >= 4) {
    const midpoint = beatsPerBar * 2;
    const firstHalf = allNotes.filter((n) => n.startTime < midpoint);
    const secondHalfStart = beatsPerBar * 2;
    for (const note of firstHalf) {
      if (note.startTime >= beatsPerBar) {
        const echoed: MidiNote = {
          ...note,
          startTime: note.startTime - beatsPerBar + secondHalfStart,
          pitch:
            rng() < 0.65
              ? note.pitch
              : pitches[
                  Math.max(
                    0,
                    Math.min(
                      pitches.length - 1,
                      nearestScaleIndex(pitches, note.pitch) + (rng() < 0.5 ? -1 : 1),
                    ),
                  )
                ]!,
          velocity: Math.max(50, note.velocity - 8),
        };
        if (!allNotes.some((n) => Math.abs(n.startTime - echoed.startTime) < 0.01)) {
          allNotes.push(echoed);
        }
      }
    }
  }

  const deduped = new Map<number, MidiNote>();
  for (const note of allNotes) {
    const key = Math.round(note.startTime * 1000);
    if (!deduped.has(key)) deduped.set(key, note);
  }

  let result = trimDurations([...deduped.values()].sort((a, b) => a.startTime - b.startTime));

  if (result.length === 0) {
    result = [{
      pitch: pitches[pitchIndex] ?? pitches[0]!,
      startTime: 0,
      duration: 0.5,
      velocity: 90,
    }];
  } else {
    // Ensure final note resolves to tonic
    const last = result[result.length - 1]!;
    const tonic = pitches[cadenceTargetIndex(pitches, rootPc, intervals)]!;
    last.pitch = tonic;
    last.velocity = Math.min(127, last.velocity + 6);
  }

  return {
    notes: result,
    modelVersion: STUB_VERSION,
    usedStub: true,
  };
}
