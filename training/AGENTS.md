# training/

Offline Python pipeline: download MAESTRO, train chord-conditioned GRU, export `models/melody-v1.onnx`.

## Contents

- `download_data.py` — Fetches MAESTRO v3.0.0, extracts subset → `training/data/midi/`, writes `manifest.csv`
  - `jsb` — 403 Bach chorales (ambient)
  - `bach_wtc` — Well-Tempered Clavier I+II via ksnortum GitHub releases
  - `bach` — Mutopia BachJS keyboard works (inventions, suites, …)
  - `classical` — Mutopia Mozart/Beethoven/Chopin/Haydn/… + classtab guitar leads
- `train_melody.py` — Monophonic reduction, per-bar chord labels, GRU training, ONNX export
- `reward.py` — Scalar melody reward (rest, diversity, entropy, interval, syncopation, anti-repeat)
- `train_reward.py` — RWR + REINFORCE fine-tune from a `.pt` checkpoint → new ONNX (e.g. v6→v7)
- `eval_generation.py` — Compare generated vs dataset metrics per genre
- `docs/classical-melody-craft.md` — Bach/classical craft notes tied to pipeline
- `requirements.txt` — torch, pretty_midi, numpy, requests, tqdm, onnx
- `data/` — Gitignored training data (`midi/`, `maestro_raw/`, `manifest.csv`)

## Pipeline

```
download_data.py → training/data/midi/
train_melody.py  → models/melody-v6.onnx
train_reward.py  → models/melody-v7.onnx  (fine-tune from v6.pt)
npm run build    → dist/models/melody-v1.onnx
```

Run via `npm run train` (200 files, 8 epochs) or invoke Python scripts directly with flags.

## Patterns

- Monophonic reduction: highest pitch per 0.25-beat grid step (matches TS `GRID`)
- Chord detection logic mirrors `src/ml/chords.ts` — keep templates and labeling aligned
- ONNX I/O names and shapes must match `src/ml/onnx-runtime.ts` (`prev_token`, chord one-hots, `position`, `h_in`, `logits`, `h_out`)
- Tokenizer constants (`REST_TOKEN`, `VOCAB_SIZE`, `POSITION_COUNT`, `HIDDEN_SIZE`) must match `src/ml/tokenizer.ts`

## Environment

Use a venv at repo root (`.venv`, gitignored):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r training/requirements.txt
```

## Gotchas

- MAESTRO is CC BY-NC-SA 4.0 — do not redistribute downloaded data
- `models/*.onnx` is gitignored; rebuild extension after training (`npm run build`)
- Default `--max-files 200` is a fast subset; increase for better model quality
- No automated tests for training — verify export by running `npm test` (onnx-runtime vendor check) and manual generation in Live
