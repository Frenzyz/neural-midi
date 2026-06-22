/** Scalar int64 buffer for ONNX Runtime (must use BigInt elements). */
export function bigInt64Scalar(value: number | bigint): BigInt64Array {
  const v = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  const out = new BigInt64Array(1);
  out[0] = v;
  return out;
}

type OrtTensor = import("onnxruntime-node").Tensor;

/**
 * Build a rank-2 int64 tensor `[1, 1]` for ONNX inputs such as `prev_token` and `position`.
 * Falls back to a `bigint[]` when Extension Host rejects foreign BigInt64Array instances.
 */
export function createInt64ScalarTensor(
  TensorCtor: typeof import("onnxruntime-node").Tensor,
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
