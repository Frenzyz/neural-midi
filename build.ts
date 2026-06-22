import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const production = process.argv.includes("--production");

const modelSrc = path.join("models", "melody-v1.onnx");
const modelDest = path.join("dist", "models", "melody-v1.onnx");
if (fs.existsSync(modelSrc)) {
  fs.mkdirSync(path.dirname(modelDest), { recursive: true });
  fs.copyFileSync(modelSrc, modelDest);
  console.log(`  build: bundled ${modelSrc} → ${modelDest}`);
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
