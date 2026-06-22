#!/usr/bin/env python3
"""Download multi-source MIDI datasets for melody training.

Supported datasets (--datasets comma-separated):
  maestro      — MAESTRO v3.0.0 piano (CC BY-NC-SA 4.0)
  pop909       — POP909 pop songs with chords (research use)
  jsb          — Bach JSB chorales (public domain)
  lmd          — Lakh clean MIDI subset with genre keyword routing
  giantmidi    — GiantMIDI-Piano curated subset (Google Drive mirror)
  nottingham   — Nottingham folk melody MIDI (folk leads)
  guitarset    — GuitarSet lead-guitar JAMS → MIDI (R&B / soul leads)
  egmd         — alias for guitarset (legacy flag)

Example:
  python training/download_data.py --datasets maestro,pop909,jsb,giantmidi,nottingham,lmd,guitarset --max-per-dataset 2000
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import tarfile
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

from genre_map import genre_for_source

MAESTRO_ZIP_URL = (
    "https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/"
    "maestro-v3.0.0-midi.zip"
)
POP909_ZIP_URL = (
    "https://github.com/music-x-lab/POP909-Dataset/archive/refs/heads/master.zip"
)
JSB_ZIP_URL = (
    "https://web.archive.org/web/20150514143826/http://www.jsbchorales.net/down/sets/jsb403.zip"
)
LMD_CLEAN_TAR_URL = "http://hog.ee.columbia.edu/craffel/lmd/clean_midi.tar.gz"
# GiantMIDI stable release (Magenta GCS mirror removed; use official Google Drive)
GIANTMIDI_GDRIVE_FOLDER = (
    "https://drive.google.com/drive/folders/1Stz3CAvMoplo79LR5I3onMWRelCugBYS"
)
GIANTMIDI_ZIP_NAME = "surname_checked_midis_v1.2.zip"
NOTTINGHAM_ZIP_URL = (
    "https://github.com/jukedeck/nottingham-dataset/archive/refs/heads/master.zip"
)
GUITARSET_ANNOTATION_URL = "https://zenodo.org/records/3371780/files/annotation.zip"

# Filename keyword → source prefix (must match genre_map.SOURCE_TO_GENRE keys)
LMD_GENRE_RULES: list[tuple[str, list[str]]] = [
    ("drill", ["drill", "pop smoke", "chief keef", "uk drill", "slide", "wooski"]),
    ("trap", ["trap", "808", "migos", "travis scott", "future", "young thug", "gucci mane"]),
    ("house", ["house", "deep house", "tech house", "disco house", "afro house"]),
    ("edm", ["edm", "electro", "trance", "dubstep", "techno", "avicii", "skrillex", "deadmau5"]),
    ("rnb", ["rnb", "r&b", "r and b", "soul", "neo soul", "neosoul", "usher", "beyonce"]),
]

SAFE_STEM = re.compile(r"[^A-Za-z0-9._-]+")


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return
    print(f"Downloading {url} ...")
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        with open(dest, "wb") as f, tqdm(total=total, unit="B", unit_scale=True) as pbar:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
                    pbar.update(len(chunk))


def safe_copy(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copy2(src, dest)


def copy_tree_midi(src: Path, dest: Path, max_files: int, prefix: str) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(src.rglob("*")):
        if count >= max_files:
            break
        if path.suffix.lower() not in {".mid", ".midi"}:
            continue
        stem = SAFE_STEM.sub("_", path.stem)[:80]
        target = dest / f"{prefix}_{stem}.mid"
        if target.exists():
            count += 1
            continue
        shutil.copy2(path, target)
        count += 1
    return count


def classify_lmd_filename(name: str) -> str:
    lower = name.lower()
    for prefix, keywords in LMD_GENRE_RULES:
        if any(kw in lower for kw in keywords):
            return prefix
    return "lmd"


def fetch_maestro(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    zip_path = raw_dir / "maestro-v3.0.0-midi.zip"
    download(MAESTRO_ZIP_URL, zip_path)
    count = 0
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = sorted(n for n in zf.namelist() if n.endswith((".midi", ".mid")))
        for name in names[:max_files]:
            target = midi_dir / f"maestro_{Path(name).name}"
            if target.exists():
                count += 1
                continue
            with zf.open(name) as src, open(target, "wb") as dst:
                dst.write(src.read())
            count += 1
    return count


def fetch_pop909(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    zip_path = raw_dir / "pop909-master.zip"
    download(POP909_ZIP_URL, zip_path)
    if not (raw_dir / "pop909").exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(raw_dir)
    root = raw_dir / "POP909-Dataset-master"
    if not root.exists():
        root = next(raw_dir.glob("POP909*"), raw_dir)
    return copy_tree_midi(root, midi_dir, max_files, "pop909")


def fetch_jsb(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    zip_path = raw_dir / "bach-chorales-midi.zip"
    download(JSB_ZIP_URL, zip_path)
    extract_dir = raw_dir / "jsb"
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    return copy_tree_midi(extract_dir, midi_dir, max_files, "jsb")


def fetch_lmd_clean(raw_dir: Path, midi_dir: Path, max_per_genre: int) -> dict[str, int]:
    """Lakh clean MIDI tar with filename keyword routing into genre prefixes."""
    tar_path = raw_dir / "clean_midi.tar.gz"
    download(LMD_CLEAN_TAR_URL, tar_path)
    extract_dir = raw_dir / "clean_midi"
    marker = extract_dir / ".extracted"
    if not marker.exists():
        extract_dir.mkdir(parents=True, exist_ok=True)
        print("  lmd: extracting clean_midi.tar.gz (may take a minute) ...")
        with tarfile.open(tar_path, "r:gz") as tf:
            tf.extractall(extract_dir)
        marker.touch()

    counts: dict[str, int] = {prefix: 0 for prefix, _ in LMD_GENRE_RULES}
    counts["lmd"] = 0

    midi_files = sorted(extract_dir.rglob("*.mid")) + sorted(extract_dir.rglob("*.midi"))
    for path in tqdm(midi_files, desc="LMD genre routing"):
        prefix = classify_lmd_filename(path.name)
        if counts[prefix] >= max_per_genre:
            continue
        stem = SAFE_STEM.sub("_", path.stem)[:80]
        target = midi_dir / f"{prefix}_{stem}.mid"
        if target.exists():
            counts[prefix] += 1
            continue
        safe_copy(path, target)
        counts[prefix] += 1

    return counts


def fetch_giantmidi(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    """GiantMIDI-Piano curated subset via official Google Drive mirror."""
    try:
        import gdown
    except ImportError:
        print("  giantmidi: install gdown (`pip install gdown`) — skipped")
        return 0

    gdrive_dir = raw_dir / "giantmidi_gdrive"
    zip_path = gdrive_dir / GIANTMIDI_ZIP_NAME
    if not zip_path.exists():
        gdrive_dir.mkdir(parents=True, exist_ok=True)
        print("  giantmidi: fetching from Google Drive ...")
        try:
            gdown.download_folder(
                GIANTMIDI_GDRIVE_FOLDER,
                output=str(gdrive_dir),
                quiet=False,
                remaining_ok=True,
            )
        except Exception as err:
            print(f"  giantmidi: Google Drive download failed ({err}) — skipped")
            return 0

    if not zip_path.exists():
        alt = gdrive_dir / "midis_v1.2.zip"
        zip_path = alt if alt.exists() else zip_path
    if not zip_path.exists():
        print("  giantmidi: zip not found after download — skipped")
        return 0

    extract_dir = raw_dir / "giantmidi"
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    return copy_tree_midi(extract_dir, midi_dir, max_files, "giantmidi")


def fetch_nottingham(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    zip_path = raw_dir / "nottingham-master.zip"
    try:
        download(NOTTINGHAM_ZIP_URL, zip_path)
    except Exception as err:
        print(f"  nottingham: download failed ({err}) — skipped")
        return 0
    extract_dir = raw_dir / "nottingham"
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    root = extract_dir / "nottingham-dataset-master"
    if not root.exists():
        root = next(extract_dir.glob("nottingham*"), extract_dir)
    midi_sub = root / "MIDI"
    if midi_sub.exists():
        root = midi_sub
    return copy_tree_midi(root, midi_dir, max_files, "nottingham")


def jams_to_lead_midi(jams_path: Path, out_path: Path) -> bool:
    """Convert GuitarSet midi_note annotations to a monophonic lead MIDI."""
    import jams
    import numpy as np
    import pretty_midi

    try:
        jam = jams.load(str(jams_path))
    except Exception:
        return False

    events: list[tuple[float, float, int, int]] = []
    for ann in jam.annotations:
        if ann.namespace != "note_midi":
            continue
        for obs in ann.data:
            pitch = int(round(float(obs.value)))
            if pitch <= 0:
                continue
            start = float(obs.time)
            end = start + float(obs.duration)
            conf = float(getattr(obs, "confidence", 1.0) or 1.0)
            events.append((start, end, pitch, int(conf * 100)))

    if len(events) < 8:
        return False

    events.sort(key=lambda e: (e[0], -e[2]))
    # Collapse to highest active pitch per onset for a lead line
    notes: list[pretty_midi.Note] = []
    for start, end, pitch, vel in events:
        if end <= start:
            end = start + 0.05
        notes.append(
            pretty_midi.Note(velocity=max(1, min(127, vel)), pitch=pitch, start=start, end=end)
        )

    inst = pretty_midi.Instrument(program=25, is_drum=False, name="lead")
    inst.notes = notes
    pm = pretty_midi.PrettyMIDI()
    pm.instruments.append(inst)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pm.write(str(out_path))
    return True


def fetch_guitarset(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    """GuitarSet annotations (Zenodo) — expressive guitar leads for R&B conditioning."""
    zip_path = raw_dir / "guitarset_annotation.zip"
    try:
        download(GUITARSET_ANNOTATION_URL, zip_path)
    except Exception as err:
        print(f"  guitarset: download failed ({err}) — skipped")
        return 0

    extract_dir = raw_dir / "guitarset"
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

    count = 0
    for jams_path in sorted(extract_dir.rglob("*.jams")):
        if count >= max_files:
            break
        stem = SAFE_STEM.sub("_", jams_path.stem)[:80]
        target = midi_dir / f"guitarset_{stem}.mid"
        if target.exists():
            count += 1
            continue
        if jams_to_lead_midi(jams_path, target):
            count += 1
    return count


def write_manifest(midi_dir: Path, data_dir: Path) -> None:
    manifest = data_dir / "manifest.csv"
    genre_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    with open(manifest, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["midi_path", "source", "genre"])
        for path in sorted(midi_dir.glob("*.mid*")):
            source = path.name.split("_", 1)[0]
            genre = genre_for_source(source)
            genre_counts[genre] = genre_counts.get(genre, 0) + 1
            source_counts[source] = source_counts.get(source, 0) + 1
            writer.writerow([str(path), source, genre])
    print(f"Manifest: {manifest} ({len(list(midi_dir.glob('*.mid*')))} files)")
    print("Source file counts:", dict(sorted(source_counts.items())))
    print("Genre file counts:", dict(sorted(genre_counts.items())))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("training/data"))
    parser.add_argument(
        "--datasets",
        type=str,
        default="maestro,pop909,jsb",
        help="Comma-separated: maestro,pop909,jsb,lmd,giantmidi,nottingham,guitarset,egmd",
    )
    parser.add_argument("--max-per-dataset", type=int, default=2000)
    args = parser.parse_args()

    raw_dir = args.data_dir / "raw"
    midi_dir = args.data_dir / "midi"
    midi_dir.mkdir(parents=True, exist_ok=True)

    datasets = [d.strip().lower() for d in args.datasets.split(",") if d.strip()]
    totals: dict[str, int] = {}

    if "maestro" in datasets:
        try:
            totals["maestro"] = fetch_maestro(raw_dir, midi_dir, args.max_per_dataset)
        except Exception as err:
            print(f"  maestro: failed ({err})")
    if "pop909" in datasets:
        try:
            totals["pop909"] = fetch_pop909(raw_dir, midi_dir, args.max_per_dataset)
        except Exception as err:
            print(f"  pop909: failed ({err})")
    if "jsb" in datasets:
        try:
            totals["jsb"] = fetch_jsb(raw_dir, midi_dir, min(args.max_per_dataset, 400))
        except Exception as err:
            print(f"  jsb: failed ({err})")
    if "lmd" in datasets:
        try:
            lmd_counts = fetch_lmd_clean(raw_dir, midi_dir, args.max_per_dataset)
            totals.update({f"lmd:{k}": v for k, v in lmd_counts.items()})
        except Exception as err:
            print(f"  lmd: failed ({err})")
    if "giantmidi" in datasets:
        try:
            totals["giantmidi"] = fetch_giantmidi(raw_dir, midi_dir, args.max_per_dataset)
        except Exception as err:
            print(f"  giantmidi: failed ({err})")
    if "nottingham" in datasets:
        try:
            totals["nottingham"] = fetch_nottingham(
                raw_dir, midi_dir, min(args.max_per_dataset, 800)
            )
        except Exception as err:
            print(f"  nottingham: failed ({err})")
    if "guitarset" in datasets or "egmd" in datasets:
        try:
            totals["guitarset"] = fetch_guitarset(
                raw_dir, midi_dir, min(args.max_per_dataset, 360)
            )
        except Exception as err:
            print(f"  guitarset: failed ({err})")

    write_manifest(midi_dir, args.data_dir)
    print("Downloaded:", totals)
    print(f"Total MIDI files: {len(list(midi_dir.glob('*.mid*')))} in {midi_dir}")


if __name__ == "__main__":
    main()
