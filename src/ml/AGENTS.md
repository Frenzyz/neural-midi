# ml/

Melody generation subsystem. ONNX-first with silent fallback to the rule-based stub engine.

## File Structure

- `types.ts` — `MidiNote`, `GenerationParams`, `Scale`, `Genre`, `ChordMode`, `ChordEvent`, `MelodicTechniqueMode`
- `inference.ts` — Facade: `generateMelody()`, `loadModel()`; ONNX then stub
- `melody-engine.ts` — Shared music theory: scales, genre rhythms, RNG, quantize
- `stub.ts` — Rule-based phrase generator (key/scale/genre aware; version `stub-0.3.0`)
- `onnx-runtime.ts` — ORT session load from `dist/vendor/`, `runMelodyStep()`
- `onnx-generate.ts` — Autoregressive ONNX sampling loop
- `onnx-tensors.ts` — Tensor construction with Extension Host buffer workarounds
- `tokenizer.ts` — Vocab and one-hot encodings (must match Python training)
- `chords.ts` — Chord detection from polyphonic MIDI
- `session-chords.ts` — Live session traversal → `ChordEvent[]` progression
- `melodic-modes.ts` — Emotion/technique modes from chord quality & CRs (Tabletop Composer; Juslin PMC3764399)

## Melodic technique modes

`MelodicTechniqueMode` (`auto`, `bright`, `melancholy`, `tension`, `hopeful`, `mystery`, `triumphant`, `intimate`) shapes inference without retraining:

- **Auto** — weighted vote from `chordProgression` qualities; major→minor by major third biases melancholy (M III m CR)
- **Per-mode knobs** — interval step bias, rest density, voicing style (`close`/`open`/`shell`/`color`), contour, cadence strength, max leap
- **Integration** — `resolveExpression()` merges technique with genre/style; `post-process.ts` applies contour + cadence; `chords.ts` voicing for Hybrid/Chords modes
- **UI** — Technique dropdown in sequence editor (`melodicTechniqueMode` on `GenerationParams`)

Sources (summarized in code, not reproduced): [Tabletop Composer chord relationships](https://www.tabletopcomposer.com/post/chord-relationships-and-emotion); Juslin & Västfjäll (2008) via [PMC3764399](https://pmc.ncbi.nlm.nih.gov/articles/PMC3764399/).

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
