import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { createInt64ScalarTensor } from "./onnx-tensors.js";

export const MODEL_FILENAME = "melody-v1.onnx";
const HIDDEN_SIZE = 128;

type OrtModule = typeof import("onnxruntime-node");
type InferenceSession = import("onnxruntime-node").InferenceSession;

let ortModule: OrtModule | null = null;
let session: InferenceSession | null = null;
let modelPath: string | null = null;
let loadPromise: Promise<boolean> | null = null;

/** Paths where onnxruntime-node may live (bundled vendor first). */
export function ortPackageCandidates(): string[] {
  const dirs = [
    path.join(__dirname, "vendor", "node_modules", "onnxruntime-node"),
    path.join(__dirname, "..", "node_modules", "onnxruntime-node"),
    path.join(process.cwd(), "node_modules", "onnxruntime-node"),
  ];
  return dirs.filter((d) => fs.existsSync(path.join(d, "package.json")));
}

function loadOrt(): OrtModule | null {
  if (ortModule) return ortModule;

  const req = createRequire(__filename);
  const candidates = ortPackageCandidates();

  for (const ortDir of candidates) {
    try {
      const mod = req(ortDir) as OrtModule;
      if (typeof mod.InferenceSession?.create !== "function") continue;
      ortModule = mod;
      console.log(`[Neural Midi] onnxruntime-node loaded from ${ortDir}`);
      return ortModule;
    } catch (err) {
      console.warn(`[Neural Midi] onnxruntime load failed (${ortDir}):`, err);
    }
  }

  console.warn("[Neural Midi] onnxruntime-node not available — using rule-based engine");
  return null;
}

export function candidateModelPaths(storageDirectory: string): string[] {
  return [
    path.join(storageDirectory, "models", MODEL_FILENAME),
    path.join(process.cwd(), "models", MODEL_FILENAME),
    path.join(__dirname, "models", MODEL_FILENAME),
  ];
}

export function findModelPath(storageDirectory: string): string | null {
  return candidateModelPaths(storageDirectory).find((p) => fs.existsSync(p)) ?? null;
}

export async function ensureModelInStorage(storageDirectory: string): Promise<string | null> {
  const destDir = path.join(storageDirectory, "models");
  const dest = path.join(destDir, MODEL_FILENAME);
  if (fs.existsSync(dest)) return dest;

  const source = candidateModelPaths(storageDirectory).find((p) => fs.existsSync(p) && p !== dest);
  if (!source) return null;

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(source, dest);
  return dest;
}

export async function loadOnnxSession(storageDirectory: string): Promise<boolean> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ort = loadOrt();
    if (!ort) return false;

    const resolved = await ensureModelInStorage(storageDirectory);
    if (!resolved) return false;

    session = await ort.InferenceSession.create(resolved, {
      executionProviders: ["cpu"],
    });
    modelPath = resolved;
    console.log(`[Neural Midi] ONNX session ready (${resolved})`);
    return true;
  })();
  return loadPromise;
}

export function isOnnxReady(): boolean {
  return session !== null;
}

export function getModelPath(): string | null {
  return modelPath;
}

export interface StepResult {
  logits: Float32Array;
  hidden: Float32Array;
}

export async function runMelodyStep(
  prevToken: number,
  chordRoot: Float32Array,
  chordQuality: Float32Array,
  position: number,
  hidden: Float32Array,
): Promise<StepResult> {
  if (!session || !ortModule) {
    throw new Error("ONNX session not loaded");
  }

  const feeds: Record<string, import("onnxruntime-node").Tensor> = {
    prev_token: createInt64ScalarTensor(ortModule.Tensor, prevToken),
    chord_root: new ortModule.Tensor("float32", chordRoot, [1, 12]),
    chord_quality: new ortModule.Tensor("float32", chordQuality, [1, 6]),
    position: createInt64ScalarTensor(ortModule.Tensor, position),
    h_in: new ortModule.Tensor("float32", hidden, [1, 1, HIDDEN_SIZE]),
  };

  const out = await session.run(feeds);
  const logits = out.logits!.data as Float32Array;
  const hOut = out.h_out!.data as Float32Array;
  return { logits, hidden: hOut };
}

export { HIDDEN_SIZE };
