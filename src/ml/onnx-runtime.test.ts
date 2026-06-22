import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("onnx-runtime vendoring", () => {
  it("bundles onnxruntime under dist/vendor after build", () => {
    if (!existsSync(join(process.cwd(), "node_modules/onnxruntime-node"))) {
      return;
    }
    const bundled = join(process.cwd(), "dist/vendor/node_modules/onnxruntime-node/package.json");
    const binding = join(
      process.cwd(),
      "dist/vendor/node_modules/onnxruntime-node/bin/napi-v6",
      process.platform,
      process.arch,
      "onnxruntime_binding.node",
    );
    expect(existsSync(bundled)).toBe(true);
    expect(existsSync(binding)).toBe(true);
    expect(existsSync(join(process.cwd(), "dist/vendor/node_modules/onnxruntime-common/package.json"))).toBe(true);
  });
});
