import type { GenerationParams, GenerationResult } from "./types.js";
import { generateStubMelody } from "./stub.js";

let modelLoaded = false;

/**
 * Load the ONNX model from extension storage. Stubbed until v1 model is trained.
 */
export async function loadModel(_storageDirectory: string): Promise<void> {
  // Future: ort.InferenceSession.create(path.join(storageDirectory, "models/melody-v1.onnx"))
  modelLoaded = true;
}

export function isModelLoaded(): boolean {
  return modelLoaded;
}

/**
 * Generate a monophonic melody. Falls back to rule-based stub when no ONNX model is present.
 */
export async function generateMelody(params: GenerationParams): Promise<GenerationResult> {
  // Phase 1: replace stub with ONNX inference
  return generateStubMelody(params);
}
