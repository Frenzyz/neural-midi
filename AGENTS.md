# Neural Midi

On-device ML melody generation as an Ableton Live 12 Extension — chord-aware MIDI with optional ONNX inference and a rule-based fallback.

## Tech Stack

- **Runtime:** Node.js ≥ 24.16.0, ESM (`"type": "module"`)
- **Language:** TypeScript 5.9 (strict, `NodeNext` modules)
- **Extension:** Ableton Extensions SDK 1.0.0-beta.0 (vendored, not in git)
- **Bundler:** esbuild 0.28 → CJS `dist/extension.js`
- **Inference:** onnxruntime-node 1.27 (native addon, vendored to `dist/vendor/`)
- **Training:** Python 3 + PyTorch (`training/`)
- **Tests:** Vitest 2.x (colocated `*.test.ts`)

## Repository Structure

- `src/` — Extension source: SDK entry, ML inference, UI modals, utilities
- `scripts/` — SDK setup, ONNX vendoring, dev preflight, packaging
- `training/` — MAESTRO download + PyTorch GRU training → ONNX export
- `models/` — `melody-v1.onnx` weights (gitignored; copied to `dist/models/` at build)
- `build.ts` — Typecheck gate, model copy, ONNX vendor, esbuild bundle
- `manifest.json` — Extension metadata; entry `dist/extension.js`
- `docs/DESIGN.md` — Technical design (partially stale; verify against code)

Skip `sdk/`, `vendor/`, `node_modules/`, `dist/`, `release/`, `.dev/` — generated or local-only.

## Conventions

- Use `.js` extensions on relative imports; `node:` prefix for builtins
- Named exports only; kebab-case files, camelCase functions, PascalCase types
- Domain types in `src/ml/types.ts` — extend there, don't scatter
- Coerce Live SDK values via `src/util/coerce.ts` (`bigint` is common)
- Log with `[Neural Midi]` prefix; catch errors per command — never crash the host
- Write clip changes inside `ext.withinTransaction(() => { clip.notes = ... })`
- No CI — run `npm run typecheck`, `npm test`, and `npm run build` before claiming done

## Agent Navigation

Deeper context lives in directory-level AGENTS.md files:

- `src/AGENTS.md` — Extension layout and SDK integration
- `src/ml/AGENTS.md` — Inference, ONNX, chords, tokenizer
- `src/ui/AGENTS.md` — Modal dialog patterns
- `training/AGENTS.md` — Python training pipeline
- `scripts/AGENTS.md` — Build, vendor, and dev scripts

See `CONTEXT.md` for how this hierarchy works.
