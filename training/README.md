# Training pipeline

Trains `models/melody-v1.onnx` from real MIDI data.

## Dataset: MAESTRO v3.0.0

- **Source:** [Google Magenta MAESTRO](https://magenta.tensorflow.org/datasets/maestro)
- **License:** CC BY-NC-SA 4.0 (non-commercial research / personal use)
- **Download size:** ~58 MB zip (full MIDI archive)
- **Default subset:** 150–200 files for fast iteration (~2 min train on CPU)

MAESTRO is piano performances with aligned MIDI. The pipeline:

1. Reduces each file to a **monophonic melody** (highest sounding pitch per 16th-note step)
2. Infers **chord labels per bar** from simultaneous pitch classes
3. Trains a chord-conditioned **GRU step model** (predict next pitch class)

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r training/requirements.txt

python training/download_data.py --max-files 200
python training/train_melody.py --epochs 8 --max-files 200
```

Output: `models/melody-v1.onnx` (~250 KB)

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--max-files` | 200 | Number of MAESTRO MIDI files to use |
| `--epochs` | 8 | Training epochs |
| `--batch-size` | 256 | Batch size |
| `--data-dir` | `training/data/midi` | Parsed MIDI directory |

## Scaling up

For better quality, increase `--max-files` (MAESTRO has ~1,200 performances) and epochs.  
For pop/chord-aligned data, consider adding [POP909](https://github.com/music-x-lab/POP909-Dataset) in a future training script.
