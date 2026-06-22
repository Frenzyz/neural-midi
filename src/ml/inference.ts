import type { GenerationParams, GenerationResult } from "./types.js";
import { generateOnnxMelody } from "./onnx-generate.js";
import { findModelPath, loadOnnxSession, isOnnxReady } from "./onnx-runtime.js";
import { generateStubMelody } from "./stub.js";

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

export async function generateMelody(params: GenerationParams): Promise<GenerationResult> {
  if (!isModelLoaded()) {
    await tryLazyOnnxLoad();
  }
  if (isModelLoaded()) {
    const onnx = await generateOnnxMelody(params);
    if (onnx && onnx.notes.length > 0) return onnx;
  }
  return generateStubMelody(params);
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
