"""MSD tagtraum LFMGD + LMD match_scores → genre routing for thin LMD genres.

Uses tagtraum msd_lastfm_map.cls (Last.fm tags inferred to seed genres) and
LMD match_scores.json (MSD track id ↔ MIDI MD5). Tag matching is exact on
normalized alphanumeric tags to avoid false positives (e.g. trapeze ≠ trap).

Trap supplement: MSD seed genre ``hiphop`` when no higher-priority genre matched.
"""

from __future__ import annotations

import hashlib
import json
import re
import tarfile
from pathlib import Path

import requests
from tqdm import tqdm

MATCH_SCORES_URL = "http://hog.ee.columbia.edu/craffel/lmd/match_scores.json"
TAGTRAUM_LFMGD_URL = "https://tagtraum.com/genres/msd_lastfm_map.cls.zip"
LMD_MATCHED_TAR_URL = "http://hog.ee.columbia.edu/craffel/lmd/lmd_matched.tar.gz"

GENRE_PREFIXES = ("trap", "drill", "house", "edm", "rnb", "lmd")

# Exact normalized Last.fm / seed tags → training genre (checked in priority order).
GENRE_TAG_RULES: list[tuple[str, frozenset[str]]] = [
    (
        "drill",
        frozenset(
            {
                "drill",
                "ukdrill",
                "chicagodrill",
                "drillrap",
                "grime",
                "ukgrime",
                "grimeuk",
                "ukhiphop",
            }
        ),
    ),
    (
        "trap",
        frozenset(
            {
                "trap",
                "trapmusic",
                "southerntrap",
                "traprap",
                "trapmuzik",
                "southernrap",
                "crunk",
                "snapmusic",
                "dirtysouth",
                "phonk",
            }
        ),
    ),
    (
        "house",
        frozenset(
            {
                "house",
                "deephouse",
                "techhouse",
                "progressivehouse",
                "electrohouse",
                "funkyhouse",
                "afrohouse",
                "discohouse",
                "minimalhouse",
                "tropicalhouse",
                "housemusic",
            }
        ),
    ),
    (
        "edm",
        frozenset(
            {
                "edm",
                "trance",
                "dubstep",
                "techno",
                "electro",
                "electronica",
                "bigroom",
                "progressivetrance",
                "psytrance",
                "hardstyle",
                "drumandbass",
                "dnb",
                "breakbeat",
                "rave",
                "eurodance",
                "electropop",
            }
        ),
    ),
    (
        "rnb",
        frozenset(
            {
                "rnb",
                "randb",
                "neosoul",
                "contemporaryrnb",
                "rhythmandblues",
                "soul",
            }
        ),
    ),
]

DRILL_EXCLUDE_TAGS = frozenset({"drillnbass", "drillandbass", "drillbass"})

# Filename keyword fallback when MD5 is not in LMD-matched (or lacks MSD tags).
FILENAME_KEYWORD_RULES: list[tuple[str, list[str]]] = [
    ("drill", ["drill", "pop smoke", "chief keef", "uk drill", "slide", "wooski", "grime"]),
    ("trap", ["trap", "808", "migos", "travis scott", "future", "young thug", "gucci mane"]),
    ("house", ["house", "deep house", "tech house", "disco house", "afro house"]),
    ("edm", ["edm", "electro", "trance", "dubstep", "techno", "avicii", "skrillex", "deadmau5"]),
    ("rnb", ["rnb", "r&b", "r and b", "soul", "neo soul", "neosoul", "usher", "beyonce"]),
]


def norm_tag(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return
    print(f"  msd: downloading {url} ...")
    with requests.get(url, stream=True, timeout=600) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        with open(dest, "wb") as handle, tqdm(total=total, unit="B", unit_scale=True) as bar:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                if chunk:
                    handle.write(chunk)
                    bar.update(len(chunk))


def parse_lfmgd_tags(parts: list[str]) -> tuple[str | None, set[str]]:
    """Return (seed_genre, all_tags) from one msd_lastfm_map.cls row."""
    if len(parts) < 3:
        return None, set()
    seed = norm_tag(parts[1])
    tags = {seed}
    for idx in range(2, len(parts), 2):
        tags.add(norm_tag(parts[idx]))
    return seed, tags


def classify_msd_tags(seed: str | None, tags: set[str]) -> str | None:
    if tags & DRILL_EXCLUDE_TAGS:
        tags = tags - DRILL_EXCLUDE_TAGS
    for genre, rule_tags in GENRE_TAG_RULES:
        if tags & rule_tags:
            return genre
    if seed == "hiphop":
        return "trap"
    return None


def ensure_msd_assets(raw_dir: Path) -> tuple[Path, Path]:
    msd_dir = raw_dir / "msd_labels"
    msd_dir.mkdir(parents=True, exist_ok=True)

    scores_path = msd_dir / "match_scores.json"
    download(MATCH_SCORES_URL, scores_path)

    cls_path = msd_dir / "msd_lastfm_map.cls"
    if not cls_path.exists():
        zip_path = msd_dir / "msd_lastfm_map.cls.zip"
        download(TAGTRAUM_LFMGD_URL, zip_path)
        import zipfile

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(msd_dir)

    return scores_path, cls_path


def build_md5_genre_index(scores_path: Path, cls_path: Path) -> dict[str, str]:
    """Map LMD MIDI MD5 → training genre via MSD Last.fm tags."""
    msd_genre: dict[str, str] = {}
    with open(cls_path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            seed, tags = parse_lfmgd_tags(parts)
            genre = classify_msd_tags(seed, tags)
            if genre:
                msd_genre[parts[0]] = genre

    with open(scores_path, encoding="utf-8") as handle:
        scores: dict[str, dict[str, float]] = json.load(handle)

    md5_genre: dict[str, str] = {}
    best_score: dict[str, float] = {}
    for msd_id, midis in scores.items():
        genre = msd_genre.get(msd_id)
        if not genre:
            continue
        for md5, score in midis.items():
            prev = best_score.get(md5)
            if prev is None or score > prev:
                best_score[md5] = score
                md5_genre[md5] = genre

    print(
        "  msd: md5 genre index",
        {g: sum(1 for v in md5_genre.values() if v == g) for g in GENRE_PREFIXES if g != "lmd"},
    )
    return md5_genre


def classify_filename(name: str) -> str | None:
    lower = name.lower()
    for prefix, keywords in FILENAME_KEYWORD_RULES:
        if any(kw in lower for kw in keywords):
            return prefix
    return None


def md5_of_file(path: Path) -> str:
    digest = hashlib.md5()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_lmd_matched_index(raw_dir: Path) -> dict[str, Path]:
    """Extract lmd_matched.tar.gz once and index MIDI paths by MD5."""
    tar_path = raw_dir / "lmd_matched.tar.gz"
    extract_dir = raw_dir / "lmd_matched"
    marker = extract_dir / ".indexed"

    if not extract_dir.exists() or not marker.exists():
        download(LMD_MATCHED_TAR_URL, tar_path)
        extract_dir.mkdir(parents=True, exist_ok=True)
        print("  lmd: extracting lmd_matched.tar.gz (~1.3 GB, one-time) ...")
        with tarfile.open(tar_path, "r:gz") as tf:
            tf.extractall(extract_dir)

    index_path = raw_dir / "lmd_matched_md5_index.json"
    if index_path.exists() and marker.exists():
        with open(index_path, encoding="utf-8") as handle:
            return {k: Path(v) for k, v in json.load(handle).items()}

    print("  lmd: indexing lmd_matched by MD5 ...")
    md5_index: dict[str, str] = {}
    for path in tqdm(extract_dir.rglob("*.mid"), desc="Index LMD-matched"):
        md5 = path.stem.lower()
        if len(md5) == 32 and md5 not in md5_index:
            md5_index[md5] = str(path)

    index_path.write_text(json.dumps(md5_index), encoding="utf-8")
    marker.touch()
    return {k: Path(v) for k, v in md5_index.items()}
