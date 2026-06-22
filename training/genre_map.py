"""Genre labels shared with src/ml/tokenizer.ts — keep in sync."""

from __future__ import annotations

GENRES: list[str] = [
    "pop",
    "trap",
    "house",
    "lofi",
    "edm",
    "rnb",
    "drill",
    "ambient",
]

GENRE_TO_IDX: dict[str, int] = {g: i for i, g in enumerate(GENRES)}
NUM_GENRES = len(GENRES)

# Dataset source prefix → training genre (balanced creative conditioning).
SOURCE_TO_GENRE: dict[str, str] = {
    "pop909": "pop",
    "lmd": "pop",
    "maestro": "ambient",
    "jsb": "ambient",
    "giantmidi": "ambient",
    "nottingham": "lofi",
    "guitarset": "rnb",
    "egmd": "rnb",  # legacy alias → guitarset
    "rnb": "rnb",
    "trap": "trap",
    "house": "house",
    "edm": "edm",
    "drill": "drill",
}


def genre_for_source(source: str) -> str:
    return SOURCE_TO_GENRE.get(source.lower(), "pop")


def genre_id_for_path(path: str) -> int:
    stem = path.rsplit("/", 1)[-1]
    source = stem.split("_", 1)[0].lower()
    return GENRE_TO_IDX[genre_for_source(source)]
