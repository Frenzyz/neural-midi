#!/usr/bin/env python3
"""Train chord-conditioned melody step model on MAESTRO and export ONNX.

Pipeline:
  1. python training/download_data.py --max-files 200
  2. python training/train_melody.py --epochs 8
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
import pretty_midi
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

VOCAB = 13  # 12 pitch classes + REST
REST = 12
HIDDEN = 128
POSITIONS = 16
GRID = 0.25

CHORD_TEMPLATES = [
    ("major", [0, 4, 7]),
    ("minor", [0, 3, 7]),
    ("dom7", [0, 4, 7, 10]),
    ("min7", [0, 3, 7, 10]),
    ("dim", [0, 3, 6]),
    ("sus", [0, 5, 7]),
]
QUALITY_TO_IDX = {q: i for i, (q, _) in enumerate(CHORD_TEMPLATES)}


def detect_chord(pcs: list[int]) -> tuple[int, int] | None:
    if len(pcs) < 2:
        return None
    best = None
    for root in range(12):
        for qi, (_, intervals) in enumerate(CHORD_TEMPLATES):
            expected = {(root + i) % 12 for i in intervals}
            hits = sum(1 for pc in pcs if pc in expected)
            score = hits / len(expected) * 0.6 + hits / len(pcs) * 0.4
            if best is None or score > best[2]:
                best = (root, qi, score)
    if best and best[2] >= 0.55:
        return best[0], best[1]
    return None


def extract_melody_and_chords(pm: pretty_midi.PrettyMIDI, max_beats: float = 16.0):
    """Highest-note monophonic reduction + per-bar chord labels."""
    if not pm.instruments:
        return [], []

    notes = sorted(
        (n for inst in pm.instruments for n in inst.notes if not inst.is_drum),
        key=lambda n: (n.start, -n.pitch),
    )
    if not notes:
        return [], []

    end = min(max_beats, pm.get_end_time())
    steps = int(end / GRID) + 1

    melody_tokens: list[int] = []
    chord_roots: list[int] = []
    chord_quals: list[int] = []
    positions: list[int] = []

    beats_per_bar = 4.0

    for step in range(steps):
        t = step * GRID
        bar = int(t // beats_per_bar)
        beat_in_bar = t % beats_per_bar

        active = [n for n in notes if n.start <= t < n.end]
        if active:
            top = max(active, key=lambda n: n.pitch)
            token = top.pitch % 12
        else:
            token = REST

        bar_start = bar * beats_per_bar
        bar_notes = [n for n in notes if n.start < bar_start + beats_per_bar and n.end > bar_start]
        pcs = sorted({n.pitch % 12 for n in bar_notes})
        chord = detect_chord(pcs)
        root, qual = chord if chord else (0, 0)

        melody_tokens.append(token)
        chord_roots.append(root)
        chord_quals.append(qual)
        positions.append(min(POSITIONS - 1, int((beat_in_bar / beats_per_bar) * POSITIONS)))

    pairs = []
    for i in range(1, len(melody_tokens)):
        pairs.append(
            (
                melody_tokens[i - 1],
                melody_tokens[i],
                chord_roots[i],
                chord_quals[i],
                positions[i],
            )
        )
    return pairs, melody_tokens


class MelodyDataset(Dataset):
    def __init__(self, midi_paths: list[Path], max_files: int | None = None):
        self.samples: list[tuple[int, int, int, int, int]] = []
        paths = midi_paths[: max_files or len(midi_paths)]
        for path in tqdm(paths, desc="Parsing MIDI"):
            try:
                pm = pretty_midi.PrettyMIDI(str(path))
                pairs, _ = extract_melody_and_chords(pm)
                self.samples.extend(pairs)
            except Exception:
                continue

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        prev_t, next_t, root, qual, pos = self.samples[idx]
        root_oh = np.zeros(12, dtype=np.float32)
        root_oh[root] = 1.0
        qual_oh = np.zeros(6, dtype=np.float32)
        qual_oh[qual] = 1.0
        return (
            torch.tensor(prev_t, dtype=torch.long),
            torch.tensor(next_t, dtype=torch.long),
            torch.from_numpy(root_oh),
            torch.from_numpy(qual_oh),
            torch.tensor(pos, dtype=torch.long),
        )


class MelodyStepModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.token_embed = nn.Embedding(VOCAB, 32)
        self.pos_embed = nn.Embedding(POSITIONS, 32)
        self.chord_proj = nn.Linear(18, 32)
        self.gru = nn.GRU(32, HIDDEN, batch_first=True)
        self.head = nn.Linear(HIDDEN, VOCAB)

    def forward(self, prev_token, chord_root, chord_quality, position, h_in):
        # Shapes: [B,1], [B,12], [B,6], [B,1], [B,1,H]
        tok = self.token_embed(prev_token)
        pos = self.pos_embed(position)
        chord = self.chord_proj(torch.cat([chord_root, chord_quality], dim=-1)).unsqueeze(1)
        x = tok + pos + chord
        out, h = self.gru(x, h_in)
        logits = self.head(out.squeeze(1))
        return logits, h


def export_onnx(model: MelodyStepModel, out_path: Path) -> None:
    model.eval()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    prev_token = torch.zeros(1, 1, dtype=torch.long)
    chord_root = torch.zeros(1, 12)
    chord_quality = torch.zeros(1, 6)
    chord_quality[0, 0] = 1.0
    position = torch.zeros(1, 1, dtype=torch.long)
    h_in = torch.zeros(1, 1, HIDDEN)

    torch.onnx.export(
        model,
        (prev_token, chord_root, chord_quality, position, h_in),
        str(out_path),
        input_names=["prev_token", "chord_root", "chord_quality", "position", "h_in"],
        output_names=["logits", "h_out"],
        dynamic_axes={
            "prev_token": {0: "batch"},
            "chord_root": {0: "batch"},
            "chord_quality": {0: "batch"},
            "position": {0: "batch"},
            "h_in": {0: "batch"},
            "logits": {0: "batch"},
            "h_out": {0: "batch"},
        },
        opset_version=17,
    )
    print(f"Exported ONNX → {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("training/data/midi"))
    parser.add_argument("--out", type=Path, default=Path("models/melody-v1.onnx"))
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--max-files", type=int, default=200)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    midi_paths = sorted(args.data_dir.glob("*.mid*"))
    if not midi_paths:
        raise SystemExit(
            f"No MIDI in {args.data_dir}. Run: python training/download_data.py"
        )

    random.shuffle(midi_paths)
    dataset = MelodyDataset(midi_paths, max_files=args.max_files)
    if len(dataset) < 100:
        raise SystemExit(f"Too few training samples: {len(dataset)}")

    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, drop_last=True)
    model = MelodyStepModel()
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    loss_fn = nn.CrossEntropyLoss()

    for epoch in range(args.epochs):
        model.train()
        total_loss = 0.0
        count = 0
        for prev_t, next_t, root, qual, pos in loader:
            h0 = torch.zeros(1, prev_t.size(0), HIDDEN)
            logits, _ = model(prev_t.unsqueeze(1), root, qual, pos.unsqueeze(1), h0)
            loss = loss_fn(logits, next_t)
            opt.zero_grad()
            loss.backward()
            opt.step()
            total_loss += loss.item()
            count += 1
        print(f"epoch {epoch + 1}/{args.epochs} loss={total_loss / max(count, 1):.4f} samples={len(dataset)}")

    export_onnx(model, args.out)


if __name__ == "__main__":
    main()
