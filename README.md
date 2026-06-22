# Neural Midi

An [Ableton Live Extension](https://www.ableton.com/en/live/extensions/) that generates melody MIDI sequences entirely on-device using machine learning — inspired by tools like Unison MIDI Wizard, but private, offline, and built into Live's workflow.

## Status

Phrase-based melody engine (`stub-0.3.0`) with **chord-aware generation** and optional **ONNX inference** (`melody-v1.onnx`). Uses ONNX when the model file is present; otherwise falls back to the rule-based engine.

## Train the ONNX model (MAESTRO dataset)

The training pipeline downloads **[MAESTRO v3.0.0](https://magenta.tensorflow.org/datasets/maestro)** (CC BY-NC-SA 4.0) — ~90 MB zip, piano performances with aligned MIDI. By default we use the first **200 files** (~subset) for a fast first train.

```bash
cd /Users/aaditchetan/Projects/neural-midi
python3 -m venv .venv
source .venv/bin/activate
pip install -r training/requirements.txt

# Download + extract MAESTRO subset → training/data/midi/
python training/download_data.py --max-files 200

# Train chord-conditioned GRU and export models/melody-v1.onnx (~1–3 min CPU)
python training/train_melody.py --epochs 8 --max-files 200
```

First run downloads MAESTRO to `training/data/` (gitignored). Rebuild the extension after training:

```bash
npm run build
npm start
```

## Chord-aware generation

In the **Generate Melody** dialog, choose a chord source:

| Mode | Behavior |
|------|----------|
| **No chords** | Melody only (scale + genre) |
| **Same track (auto)** | Finds a polyphonic MIDI clip earlier on the same track |
| **Clip below** | Uses the clip in the slot directly below the target clip |

Chords are inferred per bar from simultaneous notes. Both the ONNX model and stub engine use the progression to bias toward chord tones.

## Sequence editor

Right-click a MIDI clip → **Neural Midi → Sequence Editor…** to open the in-Live editor modal.

| Feature | How |
|---------|-----|
| **Preview** | **Play** / **Stop** — Web Audio preview of the current sequence (no clip write) |
| **Generate all** | Replace the full sequence using global key, scale, genre, and seed |
| **Partial generation** | Drag on the timeline to select a bar region → **Generate Selection** |
| **Region overrides** | Enable *Override for selection* to use different key/scale/genre/temp/seed for the selection |
| **Scale remap** | After generation, pick a new key/scale and click **Apply scale change** (preserves rhythm) |
| **Apply to clip** | Writes the edited sequence into the Live clip |

Generation runs on-device (ONNX when available, otherwise the rule-based engine). The editor reopens after each generate so you can preview and iterate before applying.

## ONNX runtime in Live

`onnxruntime-node` is a **native Node addon** and cannot be bundled into `dist/extension.js`. On `npm run build`, the build copies the platform-specific binary plus `onnxruntime-common` into `dist/vendor/node_modules/`. The extension loads ONNX from that vendored path first (via `createRequire(__filename)`), so it works in Live's Extension Host even when `process.cwd()` is not the project directory.

`npm run package` includes `dist/vendor` and `dist/models` in the `.ablx` archive (~75 MB on Apple Silicon).

After `npm install`, always run `npm run build` before `npm start` so the vendor tree is up to date.

## Requirements

- **Ableton Live 12.4.5 Suite** (beta or later) with Extensions enabled
- **Node.js** ≥ 24.16.0 (LTS)
- **Ableton Extensions SDK** — unzip into `sdk/extensions-sdk-1.0.0-beta.0/` (see [sdk/README.md](sdk/README.md); not redistributable)

## Quick start

```bash
cp .env.example .env
# EXTENSION_HOST_PATH must point at Ableton Live 12 Beta (not Suite without Extension Host)

npm run setup
npm run build
```

**Then in Live (required before `npm start`):**

1. Open **Ableton Live 12 Beta**
2. **Preferences → Extensions → Developer Mode** ON
3. Leave Live running

```bash
npm start          # preflight checks + Extension Host
```

If you see `Extension Host bring-up timed out (control channel handshake)`, Live was not running or Developer Mode was off when the host started. Quit `npm start`, open Live with Developer Mode enabled, then run `npm start` again.

## Usage

Right-click a MIDI clip → **Neural Midi → Sequence Editor…** to generate, preview, and edit melodies before writing to the clip.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Ableton Live Extension Host (Node.js)                  │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Modal UI     │  │ MIDI writer │  │ ONNX Runtime  │  │
│  │ (webview)    │→ │ (SDK API)   │← │ (on-device)   │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
    User params                         models/*.onnx
    (key, scale, genre)                 (shipped with .ablx)
```

See [docs/DESIGN.md](docs/DESIGN.md) for the full technical design.

## Project layout

| Path | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry — commands, UI, clip I/O |
| `src/ml/chords.ts` | Chord detection from MIDI notes |
| `src/ml/onnx-*.ts` | ONNX Runtime loading + generation |
| `models/` | `melody-v1.onnx` (train with `training/train_melody.py`) |
| `training/` | MAESTRO download + training scripts |

## Build & package

```bash
npm run build        # typecheck + bundle
npm run package      # produce release/Neural-Midi-<version>.ablx
```

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

Not affiliated with Ableton AG or Unison Audio. Ableton Extensions SDK is proprietary; obtain it directly from Ableton.
