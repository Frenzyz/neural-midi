import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const srcRoot = join("node_modules", "onnxruntime-node");
const commonSrc = join("node_modules", "onnxruntime-common");

if (!existsSync(srcRoot)) {
  console.warn("  build: onnxruntime-node not installed — ONNX runtime not bundled");
  process.exit(0);
}

if (!existsSync(commonSrc)) {
  console.warn("  build: onnxruntime-common missing — run npm install");
  process.exit(1);
}

const platform = process.platform;
const arch = process.arch;
const binSrcDir = join(srcRoot, "bin", "napi-v6", platform, arch);

if (!existsSync(join(binSrcDir, "onnxruntime_binding.node"))) {
  console.warn(`  build: no onnxruntime binary for ${platform}/${arch}`);
  process.exit(1);
}

const vendorRoot = join("dist", "vendor", "node_modules");
const ortDest = join(vendorRoot, "onnxruntime-node");
const commonDest = join(vendorRoot, "onnxruntime-common");

rmSync(join("dist", "vendor"), { recursive: true, force: true });
mkdirSync(ortDest, { recursive: true });

cpSync(join(srcRoot, "dist"), join(ortDest, "dist"), { recursive: true });
cpSync(join(srcRoot, "lib"), join(ortDest, "lib"), { recursive: true });
cpSync(join(srcRoot, "package.json"), join(ortDest, "package.json"));

const binDest = join(ortDest, "bin", "napi-v6", platform, arch);
mkdirSync(binDest, { recursive: true });
for (const name of readdirSync(binSrcDir)) {
  cpSync(join(binSrcDir, name), join(binDest, name));
}

cpSync(commonSrc, commonDest, { recursive: true });

console.log(`  build: vendored onnxruntime-node (${platform}/${arch}) → dist/vendor/node_modules/`);
