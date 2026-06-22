# src/

TypeScript source for the Neural Midi Ableton Live extension. Bundled to `dist/extension.js` via esbuild.

## Contents

- `extension.ts` — SDK `activate()` entry; registers commands, wires UI → ML → clip I/O
- `ml/` — Inference facade, ONNX runtime, stub engine, chords, tokenizer (see `ml/AGENTS.md`)
- `ui/` — Modal dialog HTML builder (see `ui/AGENTS.md`)
- `util/` — Shared helpers (`coerce.ts` for SDK `bigint`/time-signature quirks)
- `html.d.ts` — Ambient module for `*.html` imports (esbuild loader exists; UI is inline strings today)

## Shared Patterns

- **Command namespace:** `neuralMidi.generate` (modal + full params), `neuralMidi.continue` (no UI, hardcoded params)
- **Generation flow:** dialog JSON → `resolveChordProgression()` → `generateMelody()` → `clip.notes`
- **Storage:** call `setLazyStorageDir(storageDirectory)` on activate; model/ORT paths use `__dirname`, not `process.cwd()`
- **Transactions:** all clip writes go through `ext.withinTransaction()`
- **Types:** import domain enums/interfaces from `ml/types.ts`

## Key Files

- `extension.ts` — Only file esbuild bundles; keep it as the orchestration layer
- `util/coerce.ts` — `toNumber()`, `resolveTimeSignature()`; use for every Live SDK numeric read
- `ml/inference.ts` — Single entry for melody generation; route new backends here

## Testing

Colocate `*.test.ts` next to source. Run `npm test` from repo root. No Extension Host integration tests — stub path is what CI-less runs exercise.
