# Neural Midi — Technical Design

## Goal

Generate musically coherent melody MIDI in Ableton Live, entirely on-device, with a workflow similar to Unison MIDI Wizard's Melody mode:

- Pick key, scale, genre, length, and creative controls
- Generate multiple variations instantly
- Write results into a MIDI clip inside Live

Unlike cloud-based or proprietary plugins, Neural Midi runs local inference inside Live's Extension Host — no network, no telemetry, no subscription.

## Constraints

| Constraint | Implication |
|------------|-------------|
| Ableton Extensions SDK (JS/TS, Node 24) | Use `onnxruntime-node` or `tfjs-node` for inference |
| Extension Host sandbox | Model must ship inside `.ablx`; target < 50 MB |
| No observers / real-time playback API (SDK 1.0) | Generate-on-demand via context menu, not live arpeggiator |
| Suite + Live 12.4.5+ only | Document clearly in README |

## Recommended approach: ONNX + small autoregressive model

### Why ONNX Runtime

- Mature Node.js bindings (`onnxruntime-node`)
- Cross-platform (macOS Intel/ARM, Windows)
- Quantized INT8 models run fast on CPU without GPU
- Train in Python (PyTorch), export once, ship `.onnx` with extension

### Alternatives considered

| Approach | Pros | Cons |
|----------|------|------|
| **ONNX Runtime** (recommended) | Fast CPU inference, small bundles, industry standard | Training pipeline separate from extension |
| TensorFlow.js | Pure JS ecosystem | Larger runtime, slower cold start |
| Rule-based + Markov (no ML) | Tiny, instant | Less "wizard-like"; harder to match genre diversity |
| WASM custom model | Maximum control | High engineering cost |

### Model architecture (v1)

Small autoregressive transformer or LSTM over a MIDI token vocabulary:

```
Tokens: [BAR] [NOTE_ON pitch duration velocity] [REST duration] [EOS]
Context: key root, scale id, genre id (conditioning embeddings)
Output: sequence of tokens → decoded to MidiNote[]
```

Target size: 5–20M parameters, INT8 quantized → ~5–15 MB ONNX file.

Training data: royalty-free MIDI corpora (Lakh MIDI, MAESTRO subset, or curated genre packs). Train offline; never ship raw training data in the extension.

## Data flow

1. User right-clicks MIDI clip → `neuralMidi.generate`
2. Extension reads clip context (tempo, time signature, existing notes if "continue melody")
3. Modal UI collects: key, scale, genre, bars, temperature, seed, variation count
4. `src/ml/inference.ts` loads ONNX session (cached after first run)
5. Model generates token sequence; `src/ml/decode.ts` converts to note events
6. `src/ml/postprocess.ts` quantizes to grid, clamps to scale, humanizes velocity/timing
7. `ext.withinTransaction(() => { clip.notes = generatedNotes })`

## UI (v1)

Single modal webview (`src/ui/generate-dialog.html`) with:

- Key / scale selectors
- Genre preset dropdown (trap, house, pop, lo-fi, …)
- Bars (1–8), temperature, seed
- "Generate" → preview note count + optional audition via built-in tone (future)
- "Apply" → write to clip

## Phased roadmap

### Phase 0 — Scaffold (current)
- Extension shell, build pipeline, stub inference
- GitHub repo, design doc

### Phase 1 — MVP melody generation
- Train/export v1 ONNX model (monophonic melodies, 4 genres)
- Wire inference + clip write
- Basic modal UI

### Phase 2 — Wizard parity features
- Hybrid mode (melody locked to chord clip)
- Multiple variations (up to 8)
- Humanization controls (swing, velocity spread)
- Genre expansion (32 presets)

### Phase 3 — Polish
- Model hot-swap / user fine-tunes
- Drag MIDI from extension to new clip
- Integration tests against Extension Host

## Open questions

- **Chord-aware generation**: read harmony from sibling clips on same track, or require user to select a chord clip first?
- **Model licensing**: train only on permissively licensed MIDI; document provenance.
- **Preview audio**: SDK webview can use Web Audio; worth v1 or defer?
