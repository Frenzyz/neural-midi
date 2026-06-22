import { describe, expect, it } from "vitest";
import { bigInt64Scalar, createInt64ScalarTensor } from "./onnx-tensors.js";

describe("onnx-tensors", () => {
  it("builds BigInt64Array scalars with BigInt values", () => {
    const data = bigInt64Scalar(7);
    expect(data).toBeInstanceOf(BigInt64Array);
    expect(data[0]).toBe(7n);
    expect(bigInt64Scalar(7.9)[0]).toBe(7n);
  });

  it("creates int64 ONNX tensors from scalars", async () => {
    const ort = await import("onnxruntime-node");
    const tensor = createInt64ScalarTensor(ort.Tensor, 12);
    expect(tensor.type).toBe("int64");
    expect(tensor.dims).toEqual([1, 1]);
    expect(tensor.data).toBeInstanceOf(BigInt64Array);
    expect((tensor.data as BigInt64Array)[0]).toBe(12n);
  });
});
