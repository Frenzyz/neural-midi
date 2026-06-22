import { describe, expect, it } from "vitest";
import {
  bigInt64Scalar,
  createFloat32Tensor,
  createInt64ScalarTensor,
  float32Vector,
} from "./onnx-tensors.js";

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

  it("copies float32 vectors into fresh Float32Array buffers", () => {
    const source = new Float32Array([1, 0, 0.5]);
    const copy = float32Vector(source);
    expect(copy).toBeInstanceOf(Float32Array);
    expect(copy).not.toBe(source);
    expect(Array.from(copy)).toEqual([1, 0, 0.5]);
    expect(float32Vector([2, 3])).toEqual(new Float32Array([2, 3]));
  });

  it("creates float32 ONNX tensors from vectors", async () => {
    const ort = await import("onnxruntime-node");
    const root = new Float32Array(12);
    root[0] = 1;
    const tensor = createFloat32Tensor(ort.Tensor, root, [1, 12]);
    expect(tensor.type).toBe("float32");
    expect(tensor.dims).toEqual([1, 12]);
    expect(tensor.data).toBeInstanceOf(Float32Array);
    expect((tensor.data as Float32Array)[0]).toBe(1);
  });

  it("creates float32 hidden-state tensors", async () => {
    const ort = await import("onnxruntime-node");
    const hidden = new Float32Array(128);
    hidden[0] = 0.25;
    const tensor = createFloat32Tensor(ort.Tensor, hidden, [1, 1, 128]);
    expect(tensor.dims).toEqual([1, 1, 128]);
    expect((tensor.data as Float32Array)[0]).toBe(0.25);
  });
});
