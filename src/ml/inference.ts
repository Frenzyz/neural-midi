import type { GenerationParams, GenerationResult, MidiNote } from "./types.js";
import { generateOnnxMelody } from "./onnx-generate.js";
import { findModelPath, loadOnnxSession, isOnnxReady } from "./onnx-runtime.js";
import {
  defaultDiatonicProgression,
  generateChordVoicings,
  generateHybridChordStabs,
} from "./chords.js";
import { postProcessHybrid, postProcessMelody } from "./post-process.js";
import { generateStubMelody } from "./stub.js";
import { resolveTimeSignature, toNumber } from "../util/coerce.js";

let modelLoaded = false;

export async function loadModel(storageDirectory: string): Promise<void> {
  const found = findModelPath(storageDirectory);
  if (!found) {
    console.log("[Neural Midi] No ONNX model found — using rule-based engine");
    return;
  }
  console.log("[Neural Midi] ONNX model found — will load on first generation");
}

export function isModelLoaded(): boolean {
  return modelLoaded && isOnnxReady();
}

function resolveMode(params: GenerationParams): "chords" | "hybrid" | "melody" {
  return params.generationMode ?? (params.chordProgression?.length ? "hybrid" : "melody");
}

function progressionForParams(params: GenerationParams): import("./types.js").ChordEvent[] {
  if (params.chordProgression?.length) return params.chordProgression;
  const { numerator: beatsPerBar } = resolveTimeSignature({
    signatureNumerator: params.timeSignature.numerator,
    signatureDenominator: params.timeSignature.denominator,
  });
  const bars = Math.max(1, toNumber(params.bars, 4));
  return defaultDiatonicProgression(params.key, params.scale, bars, beatsPerBar, params.genre);
}

export async function generateMelody(params: GenerationParams): Promise<GenerationResult> {
  if (!isModelLoaded()) {
    await tryLazyOnnxLoad();
  }

  const mode = resolveMode(params);
  const articulation = params.articulation ?? "lead";
  const { numerator: beatsPerBar } = resolveTimeSignature({
    signatureNumerator: params.timeSignature.numerator,
    signatureDenominator: params.timeSignature.denominator,
  });
  const bars = Math.max(1, toNumber(params.bars, 4));
  const progression = progressionForParams(params);

  if (mode === "chords") {
    const chordNotes = generateChordVoicings({
      beatsPerBar,
      bars,
      progression,
      articulation,
    });
    const notes = postProcessMelody(chordNotes, { ...params, chordProgression: progression }, {
      mode: "chords",
      articulation,
    });
    return {
      notes,
      modelVersion: "chord-voicing-1.0",
      usedStub: true,
    };
  }

  let result: GenerationResult;
  if (isModelLoaded()) {
    const onnx = await generateOnnxMelody(params);
    if (onnx && onnx.notes.length > 0) result = onnx;
    else result = generateStubMelody(params);
  } else {
    result = generateStubMelody(params);
  }

  let notes = postProcessMelody(result.notes, { ...params, chordProgression: progression }, {
    mode: "melody",
    articulation,
  });

  if (mode === "hybrid" && progression.length > 0) {
    const stabs = generateHybridChordStabs(progression, beatsPerBar, bars, articulation);
    notes = postProcessHybrid(notes, stabs, { ...params, chordProgression: progression }, articulation);
  }

  return { ...result, notes };
}

let lazyStorageDir: string | null = null;

export function setLazyStorageDir(dir: string): void {
  lazyStorageDir = dir;
}

async function tryLazyOnnxLoad(): Promise<void> {
  if (!lazyStorageDir || isModelLoaded()) return;
  modelLoaded = await loadOnnxSession(lazyStorageDir);
  if (modelLoaded) {
    console.log("[Neural Midi] ONNX model loaded");
  }
}
