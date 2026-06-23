# ml/

Melody generation subsystem. ONNX-first with silent fallback to the rule-based stub engine.

## File Structure

- `types.ts` — `MidiNote`, `GenerationParams`, `Scale`, `Genre`, `ChordMode`, `ChordEvent`
- `inference.ts` — Facade: `generateMelody()`, `loadModel()`; ONNX then stub
- `melody-engine.ts` — Shared music theory: scales, genre rhythms, RNG, quantize
- `stub.ts` — Rule-based phrase generator (key/scale/genre aware; version `stub-0.3.0`)
- `onnx-runtime.ts` — ORT session load from `dist/vendor/`, `runMelodyStep()`
- `onnx-generate.ts` — Autoregressive ONNX sampling loop
- `onnx-tensors.ts` — Tensor construction with Extension Host buffer workarounds
- `tokenizer.ts` — Vocab and one-hot encodings (must match Python training)
- `chords.ts` — Chord detection from polyphonic MIDI
- `session-chords.ts` — Live session traversal → `ChordEvent[]` progression
- `session-analysis.ts` — On-demand project snapshot: key/scale (K–S + Live scale), rhythm, genre, chords

## Key Abstractions

- `generateMelody(params)` in `inference.ts` — always call this; never bypass to ONNX/stub directly
- `GenerationParams` — key, scale, genre, bars, temperature, seed, chordProgression
- GRU step model: `prev_token`, chord one-hots, `position`, `h_in[128]` → `logits`, `h_out`

## Patterns

- Lazy ONNX load on first generation (`tryLazyOnnxLoad`), not at `loadModel()` time
- Stub uses key/scale/genre; ONNX uses chords + position only — UI genre has no ONNX effect
- Chord templates duplicated with `training/train_melody.py` — update both when changing detection
- Tokenizer constants (`REST_TOKEN=12`, `VOCAB_SIZE=13`, `HIDDEN_SIZE=128`, `GRID=0.25`) must stay aligned with Python

## Testing

Colocated tests: `chords`, `tokenizer`, `stub`, `inference`, `onnx-tensors`, `onnx-runtime`. Add tests for musical invariants (monophonic, scale adherence, deterministic seed).

## Gotchas

- `onnxruntime-node` is external to esbuild — loaded via `createRequire(__filename)` from vendored path
- ONNX failure or empty output silently falls back to stub
- `onnx-tensors.ts` copies typed arrays — Extension Host may reject foreign buffers
- `docs/DESIGN.md` references `decode.ts`/`postprocess.ts` that do not exist; logic is inline here
