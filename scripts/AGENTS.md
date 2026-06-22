# scripts/

Node.js helper scripts invoked by npm scripts and `build.ts`. Keep them as `.mjs` ESM modules.

## Contents

- `setup-sdk.mjs` — Copies Ableton SDK/CLI tarballs from `ABLETON_SDK_PATH` → `vendor/` (`npm run setup`)
- `vendor-onnx.mjs` — Platform-specific ORT binary + `onnxruntime-common` → `dist/vendor/node_modules/` (every build)
- `dev-preflight.mjs` — Validates `.env`, Extension Host module, Live Beta running (`npm start`)
- `package.mjs` — Runs `extensions-cli package` → `release/Neural-Midi-0.1.0.ablx`

## Build Chain

```
npm run setup     → setup-sdk.mjs + npm install
npm run build     → tsc + build.ts (model copy, vendor-onnx, esbuild)
npm start         → build + dev-preflight + extensions-cli run
npm run package   → build:prod + package.mjs
```

`build.ts` lives at repo root but calls `vendor-onnx.mjs` — coordinate changes across both.

## Patterns

- Read paths from `.env` (`ABLETON_SDK_PATH`, `EXTENSION_HOST_PATH`); never hardcode user machine paths
- `vendor-onnx.mjs` selects platform binary (darwin/linux/win32, arm64/x64) — test after ORT version bumps
- `dev-preflight.mjs` exits non-zero if Live is not running or Developer Mode is off
- Package output includes `dist/vendor` and `dist/models` (~75 MB on Apple Silicon)

## Gotchas

- `sdk/` and `vendor/` are gitignored — `npm run setup` is mandatory for first-time dev
- Do not bundle `onnxruntime-node` into esbuild; vendoring is the only supported path
- `dist/`, `release/`, `.dev/` are gitignored — agents cannot rely on committed artifacts
- No CI runs these scripts — verify locally after changes
