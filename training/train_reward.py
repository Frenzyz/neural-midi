#!/usr/bin/env python3
"""Reward-weighted fine-tune of melody-v6 → melody-v7.

Method: hybrid RWR + lightweight REINFORCE
  1. RWR — teacher-forced CE on dataset transitions, weighted by
     exp(β·(R_stream − baseline)) where R_stream is the reward.py score
     of the source MIDI stream.
  2. REINFORCE — every N batches, sample K short rollouts from the current
     policy, score with reward.py, add −(R − b)·Σ log π(a_t|s_t).

Usage:
  python training/train_reward.py --checkpoint models/melody-v6.pt \\
      --epochs 15 --out models/melody-v7.onnx --save-checkpoint models/melody-v7.pt
"""

from __future__ import annotations

import argparse
import random
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pretty_midi
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

from genre_map import GENRES, NUM_GENRES, genre_for_source, genre_id_for_path, source_from_filename
from reward import REST, compute_melody_reward, configure_reward_weights
from train_melody import (
    GRID,
    HIDDEN,
    LEAD_ONLY_SOURCES,
    POSITIONS,
    MelodyStepModel,
    anti_repetition_loss,
    export_onnx,
    extract_lead_pairs,
    load_checkpoint_partial,
    stream_is_creative,
)

# RWR temperature β; rollout hyperparams
RWR_BETA = 5.0
REINFORCE_WEIGHT = 0.25
ROLLOUT_EVERY = 4
ROLLOUT_SAMPLES = 2
ROLLOUT_STEPS = 48
ROLLOUT_TEMPERATURE = 0.9


def source_from_path(path: str) -> str:
    return source_from_filename(path)


def extract_streams_with_rewards(pm: pretty_midi.PrettyMIDI, path: str, max_beats: float = 16.0):
    """Return (pairs, stream_reward) for each creative voice stream."""
    from train_melody import detect_chord, normalize_notes_to_grid, voices_at_time

    if not pm.instruments:
        return []

    raw_notes = sorted(
        (n for inst in pm.instruments for n in inst.notes if not inst.is_drum),
        key=lambda n: (n.start, -n.pitch),
    )
    if len(raw_notes) < 12:
        return []

    notes = normalize_notes_to_grid(raw_notes)
    end = min(max_beats, max(n.end for n in notes))
    if end < GRID * 12:
        return []

    steps = int(end / GRID) + 1
    beats_per_bar = 4.0
    genre = genre_for_source(source_from_path(path))

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

    out: list[tuple] = []
    source = source_from_path(path)
    if source in LEAD_ONLY_SOURCES:
        lead_pairs = extract_lead_pairs(pm, max_beats=max_beats)
        if lead_pairs:
            stream = []
            for p in lead_pairs:
                if not stream:
                    stream.append(p[0])
                stream.append(p[1])
            pitches = [t for t in stream if t != REST]
            key_pc = Counter(pitches).most_common(1)[0][0] if pitches else 0
            r = compute_melody_reward(stream, genre, key_pc)
            out.append((lead_pairs, r))
        return out

    for stream in streams:
        if not stream_is_creative(stream):
            continue
        pitches = [t for t in stream if t != REST]
        key_pc = Counter(pitches).most_common(1)[0][0] if pitches else 0
        r = compute_melody_reward(stream, genre, key_pc)
        pairs: list[tuple[int, int, int, int, int]] = []
        for i in range(1, len(stream)):
            prev_t, next_t = stream[i - 1], stream[i]
            if prev_t == REST and next_t == REST:
                continue
            pairs.append((prev_t, next_t, chord_roots[i], chord_quals[i], positions[i]))
        if pairs:
            out.append((pairs, r))
    return out


class RewardFinetuneDataset(Dataset):
    """Transitions with per-stream reward for RWR weighting."""

    def __init__(
        self,
        midi_paths: list[Path],
        max_files: int | None = None,
        balance_genres: bool = True,
        beta: float = RWR_BETA,
    ):
        self.beta = beta
        by_genre: dict[int, list[tuple]] = defaultdict(list)
        paths = midi_paths[: max_files or len(midi_paths)]
        skipped = 0
        reward_sum = 0.0
        n_streams = 0

        for path in tqdm(paths, desc="Parsing MIDI (reward)"):
            genre_id = genre_id_for_path(str(path))
            try:
                pm = pretty_midi.PrettyMIDI(str(path))
                for pairs, stream_r in extract_streams_with_rewards(pm, str(path)):
                    reward_sum += stream_r
                    n_streams += 1
                    for p in pairs:
                        by_genre[genre_id].append((*p, genre_id, stream_r))
            except Exception:
                skipped += 1
                continue

        self.samples: list[tuple] = []
        non_empty = {gid: rows for gid, rows in by_genre.items() if rows}
        if balance_genres and non_empty:
            cap = min(len(v) for v in non_empty.values())
            for gid, rows in non_empty.items():
                random.shuffle(rows)
                self.samples.extend(rows[:cap])
        else:
            for rows in by_genre.values():
                self.samples.extend(rows)

        random.shuffle(self.samples)
        mean_r = reward_sum / max(n_streams, 1)
        print(
            f"Reward dataset: {len(self.samples)} transitions, {n_streams} streams "
            f"({skipped} files skipped); mean stream reward={mean_r:.3f}"
        )
        self.mean_stream_reward = mean_r

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        prev_t, next_t, root, qual, pos, genre_id, stream_r = self.samples[idx]
        root_oh = np.zeros(12, dtype=np.float32)
        root_oh[root] = 1.0
        qual_oh = np.zeros(6, dtype=np.float32)
        qual_oh[qual] = 1.0
        genre_oh = np.zeros(NUM_GENRES, dtype=np.float32)
        genre_oh[genre_id] = 1.0
        weight = float(np.exp(self.beta * (stream_r - self.mean_stream_reward)))
        return (
            torch.tensor(prev_t, dtype=torch.long),
            torch.tensor(next_t, dtype=torch.long),
            torch.from_numpy(root_oh),
            torch.from_numpy(qual_oh),
            torch.tensor(pos, dtype=torch.long),
            torch.from_numpy(genre_oh),
            torch.tensor(stream_r, dtype=torch.float32),
            torch.tensor(weight, dtype=torch.float32),
            torch.tensor(genre_id, dtype=torch.long),
        )


def weighted_ce(logits: torch.Tensor, targets: torch.Tensor, weights: torch.Tensor) -> torch.Tensor:
    per = F.cross_entropy(logits, targets, reduction="none")
    w = weights / weights.mean().clamp(min=1e-6)
    return (per * w).mean()


def sample_token(logits: torch.Tensor, temperature: float) -> tuple[torch.Tensor, torch.Tensor]:
    scaled = logits / max(0.1, temperature)
    log_probs = F.log_softmax(scaled, dim=-1)
    probs = log_probs.exp()
    token = torch.multinomial(probs, 1).squeeze(-1)
    lp = log_probs.gather(1, token.unsqueeze(1)).squeeze(1)
    return token, lp


def reinforce_rollout(
    model: MelodyStepModel,
    prev_t: torch.Tensor,
    root: torch.Tensor,
    qual: torch.Tensor,
    pos: torch.Tensor,
    genre: torch.Tensor,
    genre_id: torch.Tensor,
    steps: int,
    temperature: float,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Sample one rollout per batch row; return (mean_reward, policy_loss)."""
    batch = prev_t.size(0)
    device = prev_t.device
    h = torch.zeros(2, batch, HIDDEN, device=device)
    token = prev_t
    log_prob_sum = torch.zeros(batch, device=device)
    tokens: list[list[int]] = [[] for _ in range(batch)]

    for step_i in range(steps):
        p = pos[:, step_i] if pos.dim() > 1 else pos
        logits, h = model(token.unsqueeze(1), root, qual, p.unsqueeze(1), genre, h)
        tok, lp = sample_token(logits, temperature)
        log_prob_sum = log_prob_sum + lp
        token = tok
        for b in range(batch):
            tokens[b].append(int(tok[b].item()))

    rewards = []
    for b in range(batch):
        gid = int(genre_id[b].item())
        gname = GENRES[gid]
        stream = tokens[b]
        pitches = [t for t in stream if t != REST]
        key_pc = Counter(pitches).most_common(1)[0][0] if pitches else 0
        rewards.append(compute_melody_reward(stream, gname, key_pc))

    r = torch.tensor(rewards, dtype=torch.float32, device=device)
    baseline = r.mean().detach()
    advantage = r - baseline
    policy_loss = -(advantage * log_prob_sum).mean()
    return r.mean(), policy_loss


def build_context_batch(
    dataset: RewardFinetuneDataset,
    batch_size: int,
    steps: int,
) -> tuple[torch.Tensor, ...] | None:
    """Pick random transitions and build aligned chord/position tensors for rollout."""
    if len(dataset) < batch_size:
        return None
    indices = random.sample(range(len(dataset)), batch_size)
    prev_list, root_list, qual_list, genre_list, gid_list = [], [], [], [], []
    pos_mat = []
    for idx in indices:
        prev_t, _, root, qual, pos, genre, _, _, gid = dataset[idx]
        prev_list.append(prev_t)
        root_list.append(root)
        qual_list.append(qual)
        genre_list.append(genre)
        gid_list.append(gid)
        pos_mat.append([(int(pos.item()) + s) % POSITIONS for s in range(steps)])

    return (
        torch.stack(prev_list),
        torch.stack(root_list),
        torch.stack(qual_list),
        torch.tensor(pos_mat, dtype=torch.long),
        torch.stack(genre_list),
        torch.stack(gid_list),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Reward fine-tune melody model")
    parser.add_argument("--data-dir", type=Path, default=Path("training/data/midi"))
    parser.add_argument("--checkpoint", type=Path, default=Path("models/melody-v6.pt"))
    parser.add_argument("--out", type=Path, default=Path("models/melody-v7.onnx"))
    parser.add_argument("--save-checkpoint", type=Path, default=Path("models/melody-v7.pt"))
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--max-files", type=int, default=10000)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--beta", type=float, default=RWR_BETA)
    parser.add_argument("--reinforce-weight", type=float, default=REINFORCE_WEIGHT)
    parser.add_argument("--anti-repeat-weight", type=float, default=0.35)
    parser.add_argument("--diversity-weight", type=float, default=None)
    parser.add_argument("--entropy-weight", type=float, default=None)
    parser.add_argument("--no-balance-genres", action="store_true")
    args = parser.parse_args()

    if args.diversity_weight is not None or args.entropy_weight is not None:
        configure_reward_weights(
            diversity=args.diversity_weight,
            entropy=args.entropy_weight,
        )

    midi_paths = sorted(args.data_dir.glob("*.mid*"))
    if not midi_paths:
        raise SystemExit(f"No MIDI in {args.data_dir}")

    random.shuffle(midi_paths)
    dataset = RewardFinetuneDataset(
        midi_paths,
        max_files=args.max_files,
        balance_genres=not args.no_balance_genres,
        beta=args.beta,
    )
    if len(dataset) < 100:
        raise SystemExit(f"Too few samples: {len(dataset)}")

    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, drop_last=True)
    model = MelodyStepModel()
    if args.checkpoint.exists():
        load_checkpoint_partial(model, args.checkpoint)
    else:
        raise SystemExit(f"Checkpoint not found: {args.checkpoint}")

    opt = torch.optim.Adam(model.parameters(), lr=args.lr)

    for epoch in range(args.epochs):
        model.train()
        total_loss = 0.0
        total_rwr = 0.0
        total_reward = 0.0
        rf_batches = 0
        count = 0

        for batch_idx, (prev_t, next_t, root, qual, pos, genre, _stream_r, weight, _genre_id) in enumerate(
            loader
        ):
            h0 = torch.zeros(2, prev_t.size(0), HIDDEN)
            logits, _ = model(prev_t.unsqueeze(1), root, qual, pos.unsqueeze(1), genre, h0)
            rwr = weighted_ce(logits, next_t, weight)
            ar = anti_repetition_loss(logits, prev_t)
            loss = rwr + args.anti_repeat_weight * ar

            if batch_idx % ROLLOUT_EVERY == 0:
                ctx = build_context_batch(dataset, min(8, args.batch_size), ROLLOUT_STEPS)
                if ctx is not None:
                    c_prev, c_root, c_qual, c_pos, c_genre, c_gid = ctx
                    for _ in range(ROLLOUT_SAMPLES):
                        mean_r, pg = reinforce_rollout(
                            model,
                            c_prev,
                            c_root,
                            c_qual,
                            c_pos,
                            c_genre,
                            c_gid,
                            ROLLOUT_STEPS,
                            ROLLOUT_TEMPERATURE,
                        )
                        loss = loss + args.reinforce_weight * pg
                        total_reward += mean_r.item()
                        rf_batches += 1

            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()

            total_loss += loss.item()
            total_rwr += rwr.item()
            count += 1

        mean_rf_r = total_reward / max(rf_batches, 1)
        print(
            f"epoch {epoch + 1}/{args.epochs} loss={total_loss / max(count, 1):.4f} "
            f"rwr={total_rwr / max(count, 1):.4f} rollout_reward={mean_rf_r:.3f} "
            f"samples={len(dataset)}"
        )

    export_onnx(model, args.out)
    if args.save_checkpoint:
        args.save_checkpoint.parent.mkdir(parents=True, exist_ok=True)
        torch.save(model.state_dict(), args.save_checkpoint)
        print(f"Saved checkpoint → {args.save_checkpoint}")


if __name__ == "__main__":
    main()
