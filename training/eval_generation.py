#!/usr/bin/env python3
"""Compare ONNX melody generation against curated training MIDI excerpts.

Usage:
  python training/eval_generation.py
  python training/eval_generation.py --samples 40 --model models/melody-v6.onnx
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pretty_midi

# Reuse training extraction / genre mapping
sys.path.insert(0, str(Path(__file__).resolve().parent))
from genre_map import GENRES, genre_for_source, genre_id_for_path, source_from_filename  # noqa: E402
from train_melody import (  # noqa: E402
    GRID,
    POSITIONS,
    REST,
    VOCAB,
    detect_chord,
    extract_polyphonic_pairs,
    normalize_notes_to_grid,
    stream_is_creative,
    voices_at_time,
)

HIDDEN = 320
GRU_LAYERS = 2
BEATS_PER_BAR = 4.0
MAJOR_SCALE = {0, 2, 4, 5, 7, 9, 11}


@dataclass
class Excerpt:
    path: str
    source: str
    genre: str
    genre_id: int
    bars: int
    stream: list[int]
    chord_roots: list[int]
    chord_quals: list[int]
    positions: list[int]
    estimated_key_pc: int


@dataclass
class StreamMetrics:
    density_per_bar: float
    rest_ratio: float
    unique_pitches: int
    max_same_pitch_streak: int
    mean_phrase_len: float
    max_phrase_len: int
    scale_adherence_pct: float
    syncopation_pct: float
    mean_interval: float
    large_leap_pct: float
    pitch_entropy: float
    active_steps: int


def mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def rng() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng


def source_from_path(path: str) -> str:
    return source_from_filename(path)


def extract_excerpt(path: Path, bars: int = 4, start_bar: int = 0) -> Excerpt | None:
    try:
        pm = pretty_midi.PrettyMIDI(str(path))
    except Exception:
        return None

    if not pm.instruments:
        return None

    raw_notes = sorted(
        (n for inst in pm.instruments for n in inst.notes if not inst.is_drum),
        key=lambda n: (n.start, -n.pitch),
    )
    if len(raw_notes) < 12:
        return None

    notes = normalize_notes_to_grid(raw_notes)
    start_beat = start_bar * BEATS_PER_BAR
    end_beat = start_beat + bars * BEATS_PER_BAR
    segment = [n for n in notes if n.start < end_beat and n.end > start_beat]
    if len(segment) < 8:
        return None

    local_notes: list[pretty_midi.Note] = []
    for n in segment:
        local_notes.append(
            pretty_midi.Note(
                velocity=int(n.velocity),
                pitch=int(n.pitch),
                start=max(0.0, float(n.start) - start_beat),
                end=min(bars * BEATS_PER_BAR, float(n.end) - start_beat),
            )
        )

    steps = int(bars * BEATS_PER_BAR / GRID)
    stream: list[int] = []
    chord_roots: list[int] = []
    chord_quals: list[int] = []
    positions: list[int] = []

    for step in range(steps):
        t = step * GRID
        bar = int(t // BEATS_PER_BAR)
        beat_in_bar = t % BEATS_PER_BAR
        voices = voices_at_time(local_notes, t)
        top = voices[0] if voices else REST
        stream.append(top if top != REST else REST)

        bar_start = bar * BEATS_PER_BAR
        bar_notes = [
            n
            for n in local_notes
            if n.start < bar_start + BEATS_PER_BAR and n.end > bar_start
        ]
        pcs = sorted({n.pitch % 12 for n in bar_notes})
        chord = detect_chord(pcs)
        root, qual = chord if chord else (0, 0)
        chord_roots.append(root)
        chord_quals.append(qual)
        positions.append(min(POSITIONS - 1, int((beat_in_bar / BEATS_PER_BAR) * POSITIONS)))

    if not stream_is_creative(stream):
        return None

    pitch_counts = Counter(t for t in stream if t != REST)
    estimated_key_pc = pitch_counts.most_common(1)[0][0] if pitch_counts else 0
    source = source_from_path(str(path))
    genre = genre_for_source(source)

    return Excerpt(
        path=str(path),
        source=source,
        genre=genre,
        genre_id=genre_id_for_path(str(path)),
        bars=bars,
        stream=stream,
        chord_roots=chord_roots,
        chord_quals=chord_quals,
        positions=positions,
        estimated_key_pc=estimated_key_pc,
    )


def chord_quality_one_hot(qual_idx: int) -> np.ndarray:
    v = np.zeros(6, dtype=np.float32)
    v[min(5, max(0, qual_idx))] = 1.0
    return v


def chord_root_one_hot(root: int) -> np.ndarray:
    v = np.zeros(12, dtype=np.float32)
    v[root % 12] = 1.0
    return v


def genre_one_hot(genre_id: int) -> np.ndarray:
    v = np.zeros(len(GENRES), dtype=np.float32)
    v[min(len(GENRES) - 1, max(0, genre_id))] = 1.0
    return v


def sample_nucleus(logits: np.ndarray, temperature: float, top_p: float, rng) -> int:
    scaled = logits / max(0.1, temperature)
    max_v = float(scaled.max())
    probs = np.exp(scaled - max_v)
    probs /= probs.sum()
    order = np.argsort(-probs)
    cumulative = 0.0
    cutoff: list[tuple[int, float]] = []
    for idx in order:
        cumulative += float(probs[idx])
        cutoff.append((int(idx), float(probs[idx])))
        if cumulative >= top_p:
            break
    total = sum(p for _, p in cutoff)
    r = rng() * total
    for idx, p in cutoff:
        r -= p
        if r <= 0:
            return idx
    return cutoff[-1][0] if cutoff else REST


def apply_repeat_penalty(logits: np.ndarray, recent: list[int], penalty: float, sustain: float, streak: int) -> None:
    if len(recent) < 2:
        return
    last, prev = recent[-1], recent[-2]
    if last == REST or last != prev:
        return
    p = penalty
    if streak > 4:
        p += sustain
    if streak > 8:
        p += sustain * 0.75
    logits[last] -= p


def apply_scale_mask(logits: np.ndarray, key_pc: int, strength: float) -> None:
    if strength <= 0:
        return
    allowed = {(key_pc + i) % 12 for i in MAJOR_SCALE}
    penalty = 4 + strength * 10
    for token in range(12):
        if token not in allowed:
            logits[token] -= penalty


def generate_stream(
    session: ort.InferenceSession,
    excerpt: Excerpt,
    seed: int,
    temperature: float = 0.7,
    top_p: float = 0.92,
    rest_resample: float = 0.15,
    repeat_penalty: float = 3.0,
    sustain_penalty: float = 3.5,
    scale_lock: float = 0.55,
    raw: bool = False,
) -> list[int]:
    if raw:
        rest_resample = 0.0
        repeat_penalty = 0.0
        sustain_penalty = 0.0
        scale_lock = 0.0
    rng = mulberry32(seed)
    h = np.zeros((GRU_LAYERS, 1, HIDDEN), dtype=np.float32)
    prev = REST
    out: list[int] = []
    recent: list[int] = []
    streak = 0

    for step in range(len(excerpt.chord_roots)):
        feeds = {
            "prev_token": np.array([[prev]], dtype=np.int64),
            "chord_root": chord_root_one_hot(excerpt.chord_roots[step]).reshape(1, 12),
            "chord_quality": chord_quality_one_hot(excerpt.chord_quals[step]).reshape(1, 6),
            "position": np.array([[excerpt.positions[step]]], dtype=np.int64),
            "genre": genre_one_hot(excerpt.genre_id).reshape(1, len(GENRES)),
            "h_in": h,
        }
        logits, h_out = session.run(None, feeds)
        logits = logits[0].astype(np.float64).copy()
        h = h_out

        apply_repeat_penalty(logits, recent, repeat_penalty, sustain_penalty, streak)
        apply_scale_mask(logits, excerpt.estimated_key_pc, scale_lock)
        token = sample_nucleus(logits, temperature, top_p, rng)

        if token == REST and rng() < rest_resample:
            apply_repeat_penalty(logits, recent, repeat_penalty, sustain_penalty, streak)
            apply_scale_mask(logits, excerpt.estimated_key_pc, scale_lock)
            token = sample_nucleus(logits, max(0.2, temperature * 0.9), top_p, rng)

        out.append(token)
        prev = token

        if token == REST:
            streak = 0
        else:
            if recent and recent[-1] == token:
                streak += 1
            else:
                streak = 1
            recent.append(token)
            if len(recent) > 4:
                recent.pop(0)

    return out


def compute_metrics(stream: list[int], bars: int, key_pc: int) -> StreamMetrics:
    pitches = [t for t in stream if t != REST]
    active = len(pitches)
    rest_ratio = 1.0 - active / max(len(stream), 1)
    density = active / max(bars, 1)

    unique = len(set(pitches))

    max_streak = 0
    streak = 0
    for t in stream:
        if t != REST:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    phrases: list[int] = []
    cur = 0
    for t in stream:
        if t != REST:
            cur += 1
        elif cur:
            phrases.append(cur)
            cur = 0
    if cur:
        phrases.append(cur)
    mean_phrase = float(np.mean(phrases)) if phrases else 0.0
    max_phrase = max(phrases) if phrases else 0

    allowed = {(key_pc + i) % 12 for i in MAJOR_SCALE}
    in_scale = sum(1 for p in pitches if p in allowed)
    scale_pct = 100.0 * in_scale / max(len(pitches), 1)

    # Syncopation: onsets on weak 16th positions (odd indices within bar)
    onsets = []
    prev = REST
    for i, t in enumerate(stream):
        if t != REST and prev == REST:
            onsets.append(i % 16)
        prev = t if t != REST else REST
    sync = 100.0 * sum(1 for p in onsets if p % 2 == 1) / max(len(onsets), 1)

    intervals = [abs(pitches[i] - pitches[i - 1]) for i in range(1, len(pitches))]
    mean_interval = float(np.mean(intervals)) if intervals else 0.0
    large_leap = 100.0 * sum(1 for d in intervals if d > 5) / max(len(intervals), 1)

    if pitches:
        counts = Counter(pitches)
        total = sum(counts.values())
        entropy = -sum((c / total) * np.log2(c / total) for c in counts.values())
    else:
        entropy = 0.0

    return StreamMetrics(
        density_per_bar=density,
        rest_ratio=rest_ratio,
        unique_pitches=unique,
        max_same_pitch_streak=max_streak,
        mean_phrase_len=mean_phrase,
        max_phrase_len=max_phrase,
        scale_adherence_pct=scale_pct,
        syncopation_pct=sync,
        mean_interval=mean_interval,
        large_leap_pct=large_leap,
        pitch_entropy=entropy,
        active_steps=active,
    )


def load_curated_excerpts(
    midi_dir: Path,
    manifest: Path | None,
    per_genre: int,
    bars: int,
    seed: int,
) -> list[Excerpt]:
    rng = random.Random(seed)
    by_genre: dict[str, list[Path]] = defaultdict(list)

    for p in sorted(midi_dir.glob("*.mid*")):
        genre = genre_for_source(source_from_path(str(p)))
        by_genre[genre].append(p)

    excerpts: list[Excerpt] = []
    for genre, paths in sorted(by_genre.items()):
        rng.shuffle(paths)
        picked = 0
        attempts = 0
        max_attempts = max(len(paths) * 5, 200)
        while picked < per_genre and attempts < max_attempts:
            path = paths[attempts % len(paths)]
            attempts += 1
            start_bar = rng.randint(0, 4)
            ex = extract_excerpt(path, bars=bars, start_bar=start_bar)
            if ex and ex.genre == genre:
                excerpts.append(ex)
                picked += 1
        if picked < per_genre:
            print(f"  warning: only {picked}/{per_genre} excerpts for genre={genre}")
    return excerpts


def aggregate(rows: list[tuple[str, str, StreamMetrics]]) -> dict[str, dict[str, float]]:
    buckets: dict[str, list[StreamMetrics]] = defaultdict(list)
    for genre, kind, m in rows:
        buckets[f"{genre}|{kind}"].append(m)

    out: dict[str, dict[str, float]] = {}
    fields = [
        "density_per_bar",
        "rest_ratio",
        "unique_pitches",
        "max_same_pitch_streak",
        "mean_phrase_len",
        "max_phrase_len",
        "scale_adherence_pct",
        "syncopation_pct",
        "mean_interval",
        "large_leap_pct",
        "pitch_entropy",
    ]
    for key, metrics in buckets.items():
        out[key] = {f: float(np.mean([getattr(m, f) for m in metrics])) for f in fields}
        out[key]["n"] = len(metrics)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate melody ONNX vs dataset excerpts")
    parser.add_argument("--model", type=Path, default=Path("models/melody-v6.onnx"))
    parser.add_argument("--midi-dir", type=Path, default=Path("training/data/midi"))
    parser.add_argument("--manifest", type=Path, default=Path("training/data/manifest.csv"))
    parser.add_argument("--samples-per-genre", type=int, default=6)
    parser.add_argument("--bars", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--raw-model", action="store_true", help="Skip inference penalties (scale/repeat)")
    parser.add_argument("--out", type=Path, default=Path("training/eval_results.json"))
    args = parser.parse_args()

    if not args.model.exists():
        raise SystemExit(f"Model not found: {args.model}")

    print(f"Loading ONNX: {args.model}")
    session = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])

    excerpts = load_curated_excerpts(
        args.midi_dir,
        args.manifest if args.manifest.exists() else None,
        per_genre=args.samples_per_genre,
        bars=args.bars,
        seed=args.seed,
    )
    print(f"Curated excerpts: {len(excerpts)} across {len({e.genre for e in excerpts})} genres")

    rows: list[tuple[str, str, StreamMetrics]] = []
    pairs: list[dict] = []

    for i, ex in enumerate(excerpts):
        ds_m = compute_metrics(ex.stream, ex.bars, ex.estimated_key_pc)
        rows.append((ex.genre, "dataset", ds_m))

        gen_stream = generate_stream(
            session, ex, seed=args.seed + i * 997, raw=args.raw_model
        )
        gen_m = compute_metrics(gen_stream, ex.bars, ex.estimated_key_pc)
        rows.append((ex.genre, "generated", gen_m))

        pairs.append(
            {
                "path": ex.path,
                "genre": ex.genre,
                "key_pc": ex.estimated_key_pc,
                "dataset": ds_m.__dict__,
                "generated": gen_m.__dict__,
            }
        )

    agg = aggregate(rows)

    print("\n=== METRICS (mean per genre) ===")
    genres = sorted({g for g, _ in [(k.split("|")[0], k.split("|")[1]) for k in agg]})
    metrics = [
        "density_per_bar",
        "rest_ratio",
        "unique_pitches",
        "max_same_pitch_streak",
        "scale_adherence_pct",
        "syncopation_pct",
        "mean_interval",
        "large_leap_pct",
        "pitch_entropy",
        "mean_phrase_len",
    ]
    header = f"{'genre':<10} {'metric':<22} {'dataset':>10} {'generated':>10} {'delta':>10}"
    print(header)
    print("-" * len(header))
    for genre in genres:
        ds_key = f"{genre}|dataset"
        gen_key = f"{genre}|generated"
        if ds_key not in agg or gen_key not in agg:
            continue
        for m in metrics:
            ds_v = agg[ds_key][m]
            gen_v = agg[gen_key][m]
            delta = gen_v - ds_v
            print(f"{genre:<10} {m:<22} {ds_v:10.2f} {gen_v:10.2f} {delta:+10.2f}")

    overall_ds = [m for _, k, m in rows if k == "dataset"]
    overall_gen = [m for _, k, m in rows if k == "generated"]
    print("\n=== OVERALL ===")
    for m in metrics:
        ds_v = float(np.mean([getattr(x, m) for x in overall_ds]))
        gen_v = float(np.mean([getattr(x, m) for x in overall_gen]))
        print(f"{m:<22} dataset={ds_v:.2f}  generated={gen_v:.2f}  delta={gen_v - ds_v:+.2f}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model": str(args.model),
        "samples": len(excerpts),
        "bars": args.bars,
        "aggregate": agg,
        "pairs": pairs,
    }
    args.out.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
