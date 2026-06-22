type OrtTensor = import("onnxruntime-node").Tensor;
type OrtTensorCtor = typeof import("onnxruntime-node").Tensor;

/** Copy values into a fresh Float32Array (avoids cross-realm instanceof failures). */
export function float32Vector(data: ArrayLike<number>): Float32Array {
  if (data instanceof Float32Array) {
    return new Float32Array(data);
  }
  return Float32Array.from(data);
}

/**
 * Build a float32 ONNX tensor. Copies into a new Float32Array first; falls back to
 * a plain number[] if Extension Host rejects foreign typed-array instances.
 */
export function createFloat32Tensor(
  TensorCtor: OrtTensorCtor,
  data: ArrayLike<number>,
  dims: readonly number[],
): OrtTensor {
  const buffer = float32Vector(data);
  try {
    return new TensorCtor("float32", buffer, dims);
  } catch {
    return new TensorCtor("float32", Array.from(buffer), dims);
  }
}

/** Scalar int64 buffer for ONNX Runtime (must use BigInt elements). */
export function bigInt64Scalar(value: number | bigint): BigInt64Array {
  const v = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  const out = new BigInt64Array(1);
  out[0] = v;
  return out;
}

/**
 * Build a rank-2 int64 tensor `[1, 1]` for ONNX inputs such as `prev_token` and `position`.
 * Falls back to a `bigint[]` when Extension Host rejects foreign BigInt64Array instances.
 */
export function createInt64ScalarTensor(
  TensorCtor: OrtTensorCtor,
  value: number | bigint,
  dims: readonly number[] = [1, 1],
): OrtTensor {
  const scalar = bigInt64Scalar(value);
  try {
    return new TensorCtor("int64", scalar, dims);
  } catch {
    return new TensorCtor("int64", [scalar[0]!], dims);
  }
}
