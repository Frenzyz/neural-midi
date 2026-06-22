# Neural Midi

An [Ableton Live Extension](https://www.ableton.com/en/live/extensions/) that generates melody MIDI sequences entirely on-device using machine learning — inspired by tools like Unison MIDI Wizard, but private, offline, and built into Live's workflow.

## Status

Phrase-based melody engine (`stub-0.6.0`) with **genre fragment library**, **generation history**, chord-aware generation, humanization (swing, ghosts, velocity), and optional **ONNX inference** (`melody-v2.onnx`, falls back to `melody-v1.onnx`).

## Train the ONNX model (multi-dataset)

The training pipeline supports several research datasets via `--datasets`:

| Dataset | Source | Notes |
|---------|--------|--------|
| **maestro** | [MAESTRO v3.0.0](https://magenta.tensorflow.org/datasets/maestro) | Piano performances (CC BY-NC-SA 4.0) |
| **pop909** | [POP909](https://github.com/music-x-lab/POP909-Dataset) | Pop melodies + chords |
| **jsb** | Bach chorales (GitHub) | Harmonic grounding |
| **lmd** | HuggingFace `mkorzeniowski/lmd_matched_melody` | Lakh MIDI melody subset (optional; skipped if unavailable) |

```bash
cd /Users/aaditchetan/Projects/neural-midi
python3 -m venv .venv
source .venv/bin/activate
pip install -r training/requirements.txt

# Download thousands of melody MIDIs → training/data/midi/
python training/download_data.py --datasets maestro,pop909,jsb,lmd --max-per-dataset 2000

# Train larger 2-layer GRU (hidden 256) → models/melody-v2.onnx
python training/train_melody.py --epochs 12 --max-files 5000
```

First run downloads to `training/data/` (gitignored). Rebuild after training:

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

## Sequence editor (MIDI Wizard layout)

Right-click a MIDI clip → **Neural Midi → Sequence Editor…** to open the in-Live editor modal (920×640).

Inspired by Unison MIDI Wizard:

| Area | Controls |
|------|----------|
| **Top panel** | GENRE, KEY + scale, MODE (Chords / Hybrid / Melody), TYPE (Lead / Pluck), LENGTH (4 / 8 bars) |
| **Center** | Arcs generate button with **&lt; / &gt;** history navigation and position indicator (e.g. `3 / 7`) |
| **Chord lane** | Per-bar chord labels (Cm7, Fm7, …) from detected progression |
| **Piano roll** | Note blocks with pitch labels; drag timeline to select a region |
| **Velocity row** | Teal velocity stalks per note |
| **Footer** | Play preview, Generate Selection, **Apply to Clip** |

| Feature | How |
|---------|-----|
| **Preview** | Footer **Play** — Web Audio preview (no clip write) |
| **Generate all** | Central arcs button — new generation each click (auto-incremented seed) |
| **Generation history** | **&lt;** and **&gt;** browse prior generations in-modal; **Apply to Clip** writes the currently viewed snapshot |
| **Partial generation** | Select bars → **Generate Selection** (also pushes history) |
| **Hybrid mode** | Locks melody to chord tones per bar when chords are detected |
| **Apply to clip** | Writes the edited sequence into the Live clip |

Generation runs on-device (ONNX v2 when available, otherwise stub). See [docs/GENERATION-RESEARCH.md](docs/GENERATION-RESEARCH.md) for MIDI Wizard research and how we approximate fragment-based composition.

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

**Then in Live (required before starting the Extension Host):**

1. Open **Ableton Live 12 Beta** and wait until a set is fully loaded
2. **Preferences → Extensions → Developer Mode** ON (Live shuts down its built-in host; `npm start` launches yours)
3. Leave Live running in the foreground

```bash
npm start
```

Keep the terminal open while developing. After code changes, press Ctrl+C, then run `npm start` again.

### Handshake timeout troubleshooting

`Extension Host bring-up timed out (control channel handshake)` means Live never connected to the dev Extension Host. This happens **before** your extension loads — bundle size is not the cause.

| Cause | Fix |
|-------|-----|
| **Developer Mode off** | Preferences → Extensions → turn **Developer Mode** ON. Toggle off → on if unsure. |
| **Live not ready** | Open Live Beta first, load a set, then run `npm start`. |
| **Stale Extension Host** | `npm run stop-host` then `npm start` (only one host at a time). |
| **Previous `npm start` still running** | Ctrl+C the old terminal, or `npm run stop-host`. |
| **Live needs restart** | Quit Live Beta completely, reopen, re-enable Developer Mode, `npm run stop-host`, `npm start`. |

**Reliable sequence:**

```bash
npm run stop-host
```

Open Live 12 Beta → load a set → Developer Mode ON → then:

```bash
cd ~/Projects/neural-midi
npm start
```

**Shell tip:** run `npm start` on its own line. Do not append comments on the same line (`npm start # …`) — the shell passes `#` as part of the path and breaks `extensions-cli`.

Preflight checks Live is running and blocks stale hosts; it **cannot** detect Developer Mode (no public API). If preflight passes but handshake fails, Developer Mode is the most likely cause.

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
