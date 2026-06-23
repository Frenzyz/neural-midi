import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { createFloat32Tensor, createInt64ScalarTensor, float32Vector } from "./onnx-tensors.js";

export const MODEL_FILENAMES = [
  "melody-v9.onnx",
  "melody-v8.onnx",
  "melody-v7.onnx",
  "melody-v6.onnx",
  "melody-v5.onnx",
  "melody-v4.onnx",
  "melody-v3.onnx",
  "melody-v2.onnx",
  "melody-v1.onnx",
] as const;

let hiddenSize = 128;
let gruLayers = 1;
let genreConditioning = false;

type OrtModule = typeof import("onnxruntime-node");
type InferenceSession = import("onnxruntime-node").InferenceSession;

let ortModule: OrtModule | null = null;
let session: InferenceSession | null = null;
let modelPath: string | null = null;
let loadPromise: Promise<boolean> | null = null;

function hasGenreConditioningModel(resolved: string): boolean {
  return (
    resolved.includes("melody-v9") ||
    resolved.includes("melody-v8") ||
    resolved.includes("melody-v7") ||
    resolved.includes("melody-v6") ||
    resolved.includes("melody-v5")
  );
}

function configureForModel(resolved: string): void {
  genreConditioning = hasGenreConditioningModel(resolved);
  if (
    resolved.includes("melody-v9") ||
    resolved.includes("melody-v8") ||
    resolved.includes("melody-v7") ||
    resolved.includes("melody-v6") ||
    resolved.includes("melody-v5") ||
    resolved.includes("melody-v4") ||
    resolved.includes("melody-v3")
  ) {
    hiddenSize = 320;
    gruLayers = 2;
  } else if (resolved.includes("melody-v2")) {
    hiddenSize = 256;
    gruLayers = 2;
  } else {
    hiddenSize = 128;
    gruLayers = 1;
  }
}

export function getHiddenStateSize(): number {
  return hiddenSize * gruLayers;
}

export function getHiddenTensorDims(): [number, number, number] {
  return [gruLayers, 1, hiddenSize];
}

export function getOnnxModelVersion(): string {
  if (resolvedIncludesV9()) return "onnx-v9.0";
  if (resolvedIncludesV8()) return "onnx-v8.0";
  if (resolvedIncludesV7()) return "onnx-v7.0";
  if (resolvedIncludesV6()) return "onnx-v6.0";
  if (resolvedIncludesV5()) return "onnx-v5.0";
  if (resolvedIncludesV4()) return "onnx-v4.0";
  if (hiddenSize >= 320) return "onnx-v3.0";
  return gruLayers > 1 ? "onnx-v2.0" : "onnx-v1.0";
}

export function hasGenreConditioning(): boolean {
  return genreConditioning;
}

function resolvedIncludesV9(): boolean {
  return modelPath?.includes("melody-v9") ?? false;
}

function resolvedIncludesV8(): boolean {
  return modelPath?.includes("melody-v8") ?? false;
}

function resolvedIncludesV7(): boolean {
  return modelPath?.includes("melody-v7") ?? false;
}

function resolvedIncludesV6(): boolean {
  return modelPath?.includes("melody-v6") ?? false;
}

function resolvedIncludesV5(): boolean {
  return modelPath?.includes("melody-v5") ?? false;
}

function resolvedIncludesV4(): boolean {
  return modelPath?.includes("melody-v4") ?? false;
}

/** @deprecated use getHiddenStateSize */
export const HIDDEN_SIZE = 128;

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
  for (const ortDir of ortPackageCandidates()) {
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
  const paths: string[] = [];
  for (const name of MODEL_FILENAMES) {
    paths.push(path.join(storageDirectory, "models", name));
    paths.push(path.join(process.cwd(), "models", name));
    paths.push(path.join(__dirname, "models", name));
  }
  return paths;
}

export function findModelPath(storageDirectory: string): string | null {
  return candidateModelPaths(storageDirectory).find((p) => fs.existsSync(p)) ?? null;
}

export async function ensureModelInStorage(storageDirectory: string): Promise<string | null> {
  const found = findModelPath(storageDirectory);
  if (!found) return null;

  const destDir = path.join(storageDirectory, "models");
  const dest = path.join(destDir, path.basename(found));
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(found, dest);
  }
  return dest;
}

export async function loadOnnxSession(storageDirectory: string): Promise<boolean> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ort = loadOrt();
    if (!ort) return false;

    const resolved = await ensureModelInStorage(storageDirectory);
    if (!resolved) return false;

    configureForModel(resolved);
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
  genre?: Float32Array,
): Promise<StepResult> {
  if (!session || !ortModule) {
    throw new Error("ONNX session not loaded");
  }

  const [layers, , size] = getHiddenTensorDims();
  const feeds: Record<string, import("onnxruntime-node").Tensor> = {
    prev_token: createInt64ScalarTensor(ortModule.Tensor, prevToken),
    chord_root: createFloat32Tensor(ortModule.Tensor, chordRoot, [1, 12]),
    chord_quality: createFloat32Tensor(ortModule.Tensor, chordQuality, [1, 6]),
    position: createInt64ScalarTensor(ortModule.Tensor, position),
    h_in: createFloat32Tensor(ortModule.Tensor, hidden, [layers, 1, size]),
  };

  if (genreConditioning) {
    if (!genre) {
      throw new Error("Genre one-hot required for melody-v5/v6/v7/v8/v9 model");
    }
    feeds.genre = createFloat32Tensor(ortModule.Tensor, genre, [1, genre.length]);
  }

  const out = await session.run(feeds);
  const logits = float32Vector(out.logits!.data as ArrayLike<number>);
  const hOut = float32Vector(out.h_out!.data as ArrayLike<number>);
  return { logits, hidden: hOut };
}
