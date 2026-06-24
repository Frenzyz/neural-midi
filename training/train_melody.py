#!/usr/bin/env python3
"""Train genre-conditioned melody step model and export ONNX (v6).

Pipeline:
  python training/download_data.py --datasets maestro,pop909,jsb,giantmidi,nottingham,egmd
  python training/train_melody.py --checkpoint models/melody-v5.pt --epochs 20 --out models/melody-v6.onnx
"""

from __future__ import annotations

import argparse
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
import pretty_midi
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

from genre_map import NUM_GENRES, genre_id_for_path, source_from_filename

VOCAB = 13  # 12 pitch classes + REST
REST = 12
HIDDEN = 320
EMBED = 64
POSITIONS = 16
GRID = 0.25
MIN_ACTIVE_STEPS = 12
MIN_UNIQUE_PITCHES = 3
MAX_SAME_PITCH_STREAK = 8
REST_TRANSITION_OVERSAMPLE = 3
REST_CLASS_WEIGHT = 2.5
ANTI_REPEAT_WEIGHT = 0.35
REGISTER_AUG_SHIFTS = (-2, -1, 1, 2)
# Classical sources: train on highest-voice (soprano / RH melody) only
LEAD_ONLY_SOURCES = frozenset({"jsb", "bach", "bach_wtc", "classical"})

CHORD_TEMPLATES = [
    ("major", [0, 4, 7]),
    ("minor", [0, 3, 7]),
    ("dom7", [0, 4, 7, 10]),
    ("min7", [0, 3, 7, 10]),
    ("dim", [0, 3, 6]),
    ("sus", [0, 5, 7]),
]
QUALITY_TO_IDX = {q: i for i, (q, _) in enumerate(CHORD_TEMPLATES)}


def quantize_time(t: float, grid: float = GRID) -> float:
    return round(t / grid) * grid


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


def normalize_notes_to_grid(notes: list, grid: float = GRID) -> list:
    """Snap note onsets and durations to 16th grid."""
    out = []
    for n in notes:
        start = quantize_time(float(n.start), grid)
        end = quantize_time(float(n.end), grid)
        if end <= start:
            end = start + grid
        q = pretty_midi.Note(
            velocity=int(n.velocity),
            pitch=int(n.pitch),
            start=start,
            end=end,
        )
        out.append(q)
    return out


def voices_at_time(notes: list, t: float) -> list[int]:
    active = sorted(
        [n for n in notes if n.start <= t < n.end],
        key=lambda n: -n.pitch,
    )
    tokens: list[int] = []
    for n in active[:3]:
        tokens.append(n.pitch % 12)
    return tokens


def stream_is_creative(stream: list[int]) -> bool:
    """Reject repetitive or too-short melodic streams."""
    pitches = [t for t in stream if t != REST]
    if len(pitches) < MIN_ACTIVE_STEPS:
        return False
    if len(set(pitches)) < MIN_UNIQUE_PITCHES:
        return False
    max_streak = 1
    streak = 1
    for i in range(1, len(stream)):
        if stream[i] == stream[i - 1] and stream[i] != REST:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 1
    return max_streak <= MAX_SAME_PITCH_STREAK


def extract_polyphonic_pairs(pm: pretty_midi.PrettyMIDI, max_beats: float = 16.0):
    """Melody + harmony streams quantized to 16th grid with quality filters."""
    if not pm.instruments:
        return []

    raw_notes = sorted(
        (n for inst in pm.instruments for n in inst.notes if not inst.is_drum),
        key=lambda n: (n.start, -n.pitch),
    )
    if len(raw_notes) < MIN_ACTIVE_STEPS:
        return []

    notes = normalize_notes_to_grid(raw_notes)
    end = min(max_beats, max(n.end for n in notes))
    if end < GRID * MIN_ACTIVE_STEPS:
        return []

    steps = int(end / GRID) + 1
    beats_per_bar = 4.0

    streams: list[list[int]] = [[], [], []]
    chord_roots: list[int] = []
    chord_quals: list[int] = []
    positions: list[int] = []

    for step in range(steps):
        t = step * GRID
        bar = int(t // beats_per_bar)
        beat_in_bar = t % beats_per_bar
        voices = voices_at_time(notes, t)
        while len(voices) < 3:
            voices.append(REST)

        for si in range(3):
            streams[si].append(voices[si] if voices[si] != REST else REST)

        bar_start = bar * beats_per_bar
        bar_notes = [n for n in notes if n.start < bar_start + beats_per_bar and n.end > bar_start]
        pcs = sorted({n.pitch % 12 for n in bar_notes})
        chord = detect_chord(pcs)
        root, qual = chord if chord else (0, 0)
        chord_roots.append(root)
        chord_quals.append(qual)
        positions.append(min(POSITIONS - 1, int((beat_in_bar / beats_per_bar) * POSITIONS)))

    pairs: list[tuple[int, int, int, int, int]] = []
    for stream in streams:
        if not stream_is_creative(stream):
            continue
        for i in range(1, len(stream)):
            prev_t, next_t = stream[i - 1], stream[i]
            if prev_t == REST and next_t == REST:
                continue
            pairs.append((prev_t, next_t, chord_roots[i], chord_quals[i], positions[i]))
    return pairs


def extract_lead_pairs(pm: pretty_midi.PrettyMIDI, max_beats: float = 16.0):
    """Top-voice (highest pitch) monophonic stream — for Bach/classical sources."""
    if not pm.instruments:
        return []

    raw_notes = sorted(
        (n for inst in pm.instruments for n in inst.notes if not inst.is_drum),
        key=lambda n: (n.start, -n.pitch),
    )
    if len(raw_notes) < MIN_ACTIVE_STEPS:
        return []

    notes = normalize_notes_to_grid(raw_notes)
    end = min(max_beats, max(n.end for n in notes))
    if end < GRID * MIN_ACTIVE_STEPS:
        return []

    steps = int(end / GRID) + 1
    beats_per_bar = 4.0
    stream: list[int] = []
    chord_roots: list[int] = []
    chord_quals: list[int] = []
    positions: list[int] = []

    for step in range(steps):
        t = step * GRID
        bar = int(t // beats_per_bar)
        beat_in_bar = t % beats_per_bar
        voices = voices_at_time(notes, t)
        top = voices[0] if voices else REST
        stream.append(top if top != REST else REST)

        bar_start = bar * beats_per_bar
        bar_notes = [n for n in notes if n.start < bar_start + beats_per_bar and n.end > bar_start]
        pcs = sorted({n.pitch % 12 for n in bar_notes})
        chord = detect_chord(pcs)
        root, qual = chord if chord else (0, 0)
        chord_roots.append(root)
        chord_quals.append(qual)
        positions.append(min(POSITIONS - 1, int((beat_in_bar / beats_per_bar) * POSITIONS)))

    if not stream_is_creative(stream):
        return []

    pairs: list[tuple[int, int, int, int, int]] = []
    for i in range(1, len(stream)):
        prev_t, next_t = stream[i - 1], stream[i]
        if prev_t == REST and next_t == REST:
            continue
        pairs.append((prev_t, next_t, chord_roots[i], chord_quals[i], positions[i]))
    return pairs


def source_prefix_from_path(path: str) -> str:
    return source_from_filename(path)


def _oversample_rest_transitions(
    pairs: list[tuple[int, int, int, int, int]],
) -> list[tuple[int, int, int, int, int]]:
    """Boost (pitch→REST) and (REST→pitch) transitions to counter REST starvation."""
    rest_pairs = [
        p
        for p in pairs
        if (p[0] != REST and p[1] == REST) or (p[0] == REST and p[1] != REST)
    ]
    if not rest_pairs:
        return pairs
    extra = random.choices(rest_pairs, k=len(rest_pairs) * (REST_TRANSITION_OVERSAMPLE - 1))
    return pairs + extra


class MelodyDataset(Dataset):
    def __init__(
        self,
        midi_paths: list[Path],
        max_files: int | None = None,
        balance_genres: bool = True,
        register_augment: bool = True,
    ):
        by_genre: dict[int, list[tuple[int, int, int, int, int]]] = defaultdict(list)
        paths = midi_paths[: max_files or len(midi_paths)]
        skipped = 0
        for path in tqdm(paths, desc="Parsing MIDI"):
            genre_id = genre_id_for_path(str(path))
            try:
                pm = pretty_midi.PrettyMIDI(str(path))
                source = source_prefix_from_path(str(path))
                if source in LEAD_ONLY_SOURCES:
                    pairs = extract_lead_pairs(pm)
                else:
                    pairs = extract_polyphonic_pairs(pm)
                if not pairs:
                    skipped += 1
                    continue
                pairs = _oversample_rest_transitions(pairs)
                by_genre[genre_id].extend(pairs)
            except Exception:
                skipped += 1
                continue

        self.register_augment = register_augment
        self.samples: list[tuple[int, int, int, int, int, int]] = []
        non_empty = {gid: pairs for gid, pairs in by_genre.items() if pairs}
        if balance_genres and non_empty:
            cap = min(len(v) for v in non_empty.values())
            for gid, pairs in non_empty.items():
                random.shuffle(pairs)
                for p in pairs[:cap]:
                    self.samples.append((*p, gid))
        else:
            for gid, pairs in by_genre.items():
                for p in pairs:
                    self.samples.append((*p, gid))

        random.shuffle(self.samples)
        rest_targets = sum(1 for s in self.samples if s[1] == REST)
        rest_trans = sum(
            1
            for s in self.samples
            if (s[0] != REST and s[1] == REST) or (s[0] == REST and s[1] != REST)
        )
        print(
            f"Dataset: {len(self.samples)} pairs from {len(paths) - skipped} files "
            f"({skipped} skipped); REST targets={rest_targets / max(len(self.samples), 1):.1%} "
            f"REST transitions={rest_trans / max(len(self.samples), 1):.1%}; per-genre: "
            f"{ {gid: sum(1 for s in self.samples if s[5] == gid) for gid in by_genre} }"
        )

    def __len__(self) -> int:
        return len(self.samples)

    def _maybe_transpose(
        self, prev_t: int, next_t: int, root: int
    ) -> tuple[int, int, int]:
        if not self.register_augment or random.random() > 0.5:
            return prev_t, next_t, root
        shift = random.choice(REGISTER_AUG_SHIFTS)
        new_root = (root + shift) % 12
        new_prev = prev_t if prev_t == REST else (prev_t + shift) % 12
        new_next = next_t if next_t == REST else (next_t + shift) % 12
        return new_prev, new_next, new_root

    def __getitem__(self, idx: int):
        prev_t, next_t, root, qual, pos, genre_id = self.samples[idx]
        prev_t, next_t, root = self._maybe_transpose(prev_t, next_t, root)
        root_oh = np.zeros(12, dtype=np.float32)
        root_oh[root] = 1.0
        qual_oh = np.zeros(6, dtype=np.float32)
        qual_oh[qual] = 1.0
        genre_oh = np.zeros(NUM_GENRES, dtype=np.float32)
        genre_oh[genre_id] = 1.0
        return (
            torch.tensor(prev_t, dtype=torch.long),
            torch.tensor(next_t, dtype=torch.long),
            torch.from_numpy(root_oh),
            torch.from_numpy(qual_oh),
            torch.tensor(pos, dtype=torch.long),
            torch.from_numpy(genre_oh),
        )


class MelodyStepModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.token_embed = nn.Embedding(VOCAB, EMBED)
        self.pos_embed = nn.Embedding(POSITIONS, EMBED)
        self.chord_proj = nn.Linear(18, EMBED)
        self.genre_proj = nn.Linear(NUM_GENRES, EMBED)
        self.gru = nn.GRU(EMBED, HIDDEN, num_layers=2, batch_first=True, dropout=0.1)
        self.head = nn.Linear(HIDDEN, VOCAB)

    def forward(self, prev_token, chord_root, chord_quality, position, genre, h_in):
        tok = self.token_embed(prev_token)
        pos = self.pos_embed(position)
        chord = self.chord_proj(torch.cat([chord_root, chord_quality], dim=-1)).unsqueeze(1)
        genre_vec = self.genre_proj(genre).unsqueeze(1)
        x = tok + pos + chord + genre_vec
        out, h = self.gru(x, h_in)
        logits = self.head(out.squeeze(1))
        return logits, h


def anti_repetition_loss(logits: torch.Tensor, prev_t: torch.Tensor) -> torch.Tensor:
    """Penalize P(same_pitch | prev_pitch) to reduce melodic stasis."""
    pitch_mask = prev_t != REST
    if not pitch_mask.any():
        return torch.zeros((), device=logits.device)
    pitch_logits = logits[pitch_mask]
    prev_pitch = prev_t[pitch_mask]
    probs = F.softmax(pitch_logits, dim=-1)
    same_prob = probs.gather(1, prev_pitch.unsqueeze(1)).squeeze(1)
    return same_prob.mean()


def build_class_weights(device: torch.device) -> torch.Tensor:
    weights = torch.ones(VOCAB, device=device)
    weights[REST] = REST_CLASS_WEIGHT
    return weights


def load_checkpoint_partial(model: MelodyStepModel, checkpoint: Path) -> None:
    state = torch.load(checkpoint, map_location="cpu")
    current = model.state_dict()
    loaded = 0
    for key, value in state.items():
        if key in current and current[key].shape == value.shape:
            current[key] = value
            loaded += 1
    model.load_state_dict(current)
    print(f"Loaded {loaded}/{len(current)} tensors from {checkpoint}")


def export_onnx(model: MelodyStepModel, out_path: Path) -> None:
    model.eval()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    prev_token = torch.zeros(1, 1, dtype=torch.long)
    chord_root = torch.zeros(1, 12)
    chord_quality = torch.zeros(1, 6)
    chord_quality[0, 0] = 1.0
    position = torch.zeros(1, 1, dtype=torch.long)
    genre = torch.zeros(1, NUM_GENRES)
    genre[0, 0] = 1.0
    h_in = torch.zeros(2, 1, HIDDEN)

    torch.onnx.export(
        model,
        (prev_token, chord_root, chord_quality, position, genre, h_in),
        str(out_path),
        input_names=["prev_token", "chord_root", "chord_quality", "position", "genre", "h_in"],
        output_names=["logits", "h_out"],
        dynamic_axes={
            "prev_token": {0: "batch"},
            "chord_root": {0: "batch"},
            "chord_quality": {0: "batch"},
            "position": {0: "batch"},
            "genre": {0: "batch"},
            "h_in": {1: "batch"},
            "logits": {0: "batch"},
            "h_out": {1: "batch"},
        },
        opset_version=17,
    )
    print(f"Exported ONNX → {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("training/data/midi"))
    parser.add_argument("--out", type=Path, default=Path("models/melody-v6.onnx"))
    parser.add_argument("--checkpoint", type=Path, default=Path("models/melody-v5.pt"))
    parser.add_argument("--save-checkpoint", type=Path, default=Path("models/melody-v6.pt"))
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--max-files", type=int, default=10000)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--no-balance-genres", action="store_true")
    parser.add_argument("--no-register-augment", action="store_true")
    parser.add_argument("--anti-repeat-weight", type=float, default=ANTI_REPEAT_WEIGHT)
    parser.add_argument("--rest-class-weight", type=float, default=REST_CLASS_WEIGHT)
    args = parser.parse_args()

    midi_paths = sorted(args.data_dir.glob("*.mid*"))
    if not midi_paths:
        raise SystemExit(f"No MIDI in {args.data_dir}. Run: python training/download_data.py")

    random.shuffle(midi_paths)
    dataset = MelodyDataset(
        midi_paths,
        max_files=args.max_files,
        balance_genres=not args.no_balance_genres,
        register_augment=not args.no_register_augment,
    )
    if len(dataset) < 100:
        raise SystemExit(f"Too few training samples: {len(dataset)}")

    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, drop_last=True)
    model = MelodyStepModel()
    if args.checkpoint and args.checkpoint.exists():
        load_checkpoint_partial(model, args.checkpoint)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    device = torch.device("cpu")
    class_weights = build_class_weights(device)
    class_weights[REST] = args.rest_class_weight
    loss_fn = nn.CrossEntropyLoss(weight=class_weights)

    for epoch in range(args.epochs):
        model.train()
        total_loss = 0.0
        total_ce = 0.0
        total_ar = 0.0
        count = 0
        for prev_t, next_t, root, qual, pos, genre in loader:
            h0 = torch.zeros(2, prev_t.size(0), HIDDEN)
            logits, _ = model(prev_t.unsqueeze(1), root, qual, pos.unsqueeze(1), genre, h0)
            ce = loss_fn(logits, next_t)
            ar = anti_repetition_loss(logits, prev_t)
            loss = ce + args.anti_repeat_weight * ar
            opt.zero_grad()
            loss.backward()
            opt.step()
            total_loss += loss.item()
            total_ce += ce.item()
            total_ar += ar.item()
            count += 1
        print(
            f"epoch {epoch + 1}/{args.epochs} loss={total_loss / max(count, 1):.4f} "
            f"(ce={total_ce / max(count, 1):.4f} ar={total_ar / max(count, 1):.4f}) "
            f"samples={len(dataset)}"
        )

    export_onnx(model, args.out)
    if args.save_checkpoint:
        args.save_checkpoint.parent.mkdir(parents=True, exist_ok=True)
        torch.save(model.state_dict(), args.save_checkpoint)
        print(f"Saved checkpoint → {args.save_checkpoint}")


if __name__ == "__main__":
    main()
