import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const production = process.argv.includes("--production");

for (const name of ["melody-v5.onnx", "melody-v4.onnx", "melody-v3.onnx", "melody-v2.onnx", "melody-v1.onnx"]) {
  const modelSrc = path.join("models", name);
  const modelDest = path.join("dist", "models", name);
  if (fs.existsSync(modelSrc)) {
    fs.mkdirSync(path.dirname(modelDest), { recursive: true });
    fs.copyFileSync(modelSrc, modelDest);
    console.log(`  build: bundled ${modelSrc} → ${modelDest}`);
  }
}

execFileSync("node", ["scripts/vendor-onnx.mjs"], { stdio: "inherit" });

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: manifest.entry,
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcesContent: false,
  logLevel: "info",
  minify: production,
  sourcemap: !production,
  loader: { ".html": "text" },
  external: ["onnxruntime-node"],
});
