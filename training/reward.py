"""Scalar melody rewards on 16th-grid pitch-class streams (REST=12).

Aligned with training/eval_generation.py metrics. Combined reward R in [0, 1]:

  R = w_rest·s_rest + w_div·s_div + w_ent·s_ent + w_int·s_int
      + w_sync·s_sync + w_rep·s_rep + w_scale·s_scale

Genre-specific rest targets (from dataset means): pop 0.18, ambient 0.05, etc.
Diversity target ~8 unique pitch classes; entropy target ~2.8 bits.
Mean interval target 2.5–3.0 semitones (penalize stasis < 1.0).
"""

from __future__ import annotations

from collections import Counter

import numpy as np

from genre_map import GENRES

REST = 12
MAJOR_SCALE = {0, 2, 4, 5, 7, 9, 11}

# Component weights (sum ≈ 1.0)
W_REST = 0.15
W_DIVERSITY = 0.18
W_ENTROPY = 0.22
W_INTERVAL = 0.15
W_SYNCOPATION = 0.15
W_ANTI_REPEAT = 0.10
W_SCALE = 0.05

GENRE_REST_TARGET: dict[str, float] = {
    "pop": 0.18,
    "trap": 0.12,
    "house": 0.10,
    "lofi": 0.10,
    "edm": 0.12,
    "rnb": 0.14,
    "drill": 0.10,
    "ambient": 0.05,
}

TARGET_UNIQUE_PITCHES = 8.0
TARGET_ENTROPY = 2.8
TARGET_INTERVAL = 2.75
TARGET_SYNCOPATION_PCT = 35.0
MAX_STREAK_OK = 8


def configure_reward_weights(
    *,
    diversity: float | None = None,
    entropy: float | None = None,
) -> None:
    """Override component weights (e.g. v9 reward pass emphasizing diversity)."""
    global W_DIVERSITY, W_ENTROPY
    if diversity is not None:
        W_DIVERSITY = diversity
    if entropy is not None:
        W_ENTROPY = entropy


def _clamp01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def stream_metrics(
    stream: list[int],
    key_pc: int = 0,
) -> dict[str, float]:
    """Mirror eval_generation.compute_metrics (subset used for reward)."""
    pitches = [t for t in stream if t != REST]
    active = len(pitches)
    rest_ratio = 1.0 - active / max(len(stream), 1)

    unique = float(len(set(pitches)))

    max_streak = 0
    streak = 0
    for t in stream:
        if t != REST:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    onsets: list[int] = []
    prev = REST
    for i, t in enumerate(stream):
        if t != REST and prev == REST:
            onsets.append(i % 16)
        prev = t if t != REST else REST
    sync = 100.0 * sum(1 for p in onsets if p % 2 == 1) / max(len(onsets), 1)

    intervals = [abs(pitches[i] - pitches[i - 1]) for i in range(1, len(pitches))]
    mean_interval = float(np.mean(intervals)) if intervals else 0.0

    if pitches:
        counts = Counter(pitches)
        total = sum(counts.values())
        entropy = -sum((c / total) * np.log2(c / total) for c in counts.values())
    else:
        entropy = 0.0

    allowed = {(key_pc + i) % 12 for i in MAJOR_SCALE}
    in_scale = sum(1 for p in pitches if p in allowed)
    scale_pct = 100.0 * in_scale / max(len(pitches), 1)

    return {
        "rest_ratio": rest_ratio,
        "unique_pitches": unique,
        "max_same_pitch_streak": float(max_streak),
        "syncopation_pct": sync,
        "mean_interval": mean_interval,
        "pitch_entropy": entropy,
        "scale_adherence_pct": scale_pct,
        "active_steps": float(active),
    }


def _rest_score(rest_ratio: float, genre: str) -> float:
    target = GENRE_REST_TARGET.get(genre, 0.12)
    # Tolerance ~0.15; full credit inside ±0.05
    dev = abs(rest_ratio - target)
    return _clamp01(1.0 - dev / 0.20)


def _interval_score(mean_interval: float) -> float:
    if mean_interval < 1.0:
        return _clamp01(mean_interval / 1.0) * 0.35
    if mean_interval <= 4.5:
        return _clamp01(1.0 - abs(mean_interval - TARGET_INTERVAL) / 2.0)
    return _clamp01(1.0 - (mean_interval - 4.5) / 4.0)


def _anti_repeat_score(max_streak: float) -> float:
    if max_streak <= MAX_STREAK_OK:
        return 1.0
    return _clamp01(1.0 - (max_streak - MAX_STREAK_OK) / 16.0)


def compute_melody_reward(
    stream: list[int],
    genre: str,
    key_pc: int = 0,
) -> float:
    """Scalar reward in [0, 1] for a monophonic token stream."""
    if genre not in GENRES:
        genre = "pop"

    m = stream_metrics(stream, key_pc)
    if m["active_steps"] < 4:
        return 0.0

    s_rest = _rest_score(m["rest_ratio"], genre)
    s_div = _clamp01(m["unique_pitches"] / TARGET_UNIQUE_PITCHES)
    s_ent = _clamp01(m["pitch_entropy"] / TARGET_ENTROPY)
    s_int = _interval_score(m["mean_interval"])
    s_sync = _clamp01(m["syncopation_pct"] / TARGET_SYNCOPATION_PCT)
    s_rep = _anti_repeat_score(m["max_same_pitch_streak"])
    s_scale = _clamp01(m["scale_adherence_pct"] / 85.0)

    return (
        W_REST * s_rest
        + W_DIVERSITY * s_div
        + W_ENTROPY * s_ent
        + W_INTERVAL * s_int
        + W_SYNCOPATION * s_sync
        + W_ANTI_REPEAT * s_rep
        + W_SCALE * s_scale
    )


def reward_breakdown(
    stream: list[int],
    genre: str,
    key_pc: int = 0,
) -> dict[str, float]:
    """Per-component scores for logging."""
    m = stream_metrics(stream, key_pc)
    return {
        "reward": compute_melody_reward(stream, genre, key_pc),
        "rest": _rest_score(m["rest_ratio"], genre),
        "diversity": _clamp01(m["unique_pitches"] / TARGET_UNIQUE_PITCHES),
        "entropy": _clamp01(m["pitch_entropy"] / TARGET_ENTROPY),
        "interval": _interval_score(m["mean_interval"]),
        "syncopation": _clamp01(m["syncopation_pct"] / TARGET_SYNCOPATION_PCT),
        "anti_repeat": _anti_repeat_score(m["max_same_pitch_streak"]),
        "scale": _clamp01(m["scale_adherence_pct"] / 85.0),
        **m,
    }
