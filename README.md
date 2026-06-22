# Neural Midi

An [Ableton Live Extension](https://www.ableton.com/en/live/extensions/) that generates melody MIDI sequences entirely on-device using machine learning — inspired by tools like Unison MIDI Wizard, but private, offline, and built into Live's workflow.

## Status

Early scaffold. The extension shell builds against the Ableton Extensions SDK; the ML inference pipeline is stubbed and ready for model integration.

## Requirements

- **Ableton Live 12.4.5 Suite** (beta or later) with Extensions enabled
- **Node.js** ≥ 24.16.0 (LTS)
- **Ableton Extensions SDK** — obtain from [ableton.github.io/extensions-sdk](https://ableton.github.io/extensions-sdk) (not redistributable; not included in this repo)

## Quick start

```bash
cp .env.example .env
# Edit .env — set ABLETON_SDK_PATH and EXTENSION_HOST_PATH

npm run setup
npm start          # build + launch Extension Host against Live
```

Enable **Developer Mode** in Live → Preferences → Extensions to load local builds.

## Usage (planned)

Right-click a MIDI clip (or empty clip slot) → **Neural Midi → Generate Melody**.

Configure key, scale, genre, bar count, and temperature, then generate one or more melody variations directly into the clip — no cloud calls, no account required.

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
| `src/ml/` | Tokenization, inference, post-processing |
| `src/ui/` | Modal dialog HTML for generation controls |
| `models/` | ONNX model weights (gitignored until trained) |
| `training/` | Offline training scripts and datasets (future) |

## Build & package

```bash
npm run build        # typecheck + bundle
npm run package      # produce release/Neural-Midi-<version>.ablx
```

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

Not affiliated with Ableton AG or Unison Audio. Ableton Extensions SDK is proprietary; obtain it directly from Ableton.
