#!/usr/bin/env python3
"""Download multi-source MIDI datasets for melody training.

Supported datasets (--datasets comma-separated):
  maestro      — MAESTRO v3.0.0 piano (CC BY-NC-SA 4.0)
  pop909       — POP909 pop songs with chords (research use)
  jsb          — Bach JSB chorales (public domain)
  lmd          — Lakh clean MIDI + LMD-matched via MSD tagtraum LFMGD routing
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
from msd_genre import (
    GENRE_PREFIXES,
    build_md5_genre_index,
    classify_filename,
    ensure_lmd_matched_index,
    ensure_msd_assets,
    md5_of_file,
)

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


def purge_prior_lmd_genre_files(midi_dir: Path) -> None:
    """Remove prior LMD genre-routed copies before a fresh MSD routing pass."""
    for path in midi_dir.glob("*.mid*"):
        prefix = path.name.split("_", 1)[0]
        if prefix in GENRE_PREFIXES:
            path.unlink()


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
    """Lakh MIDI routed by MSD tagtraum LFMGD tags (with filename fallback)."""
    purge_prior_lmd_genre_files(midi_dir)

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

    scores_path, cls_path = ensure_msd_assets(raw_dir)
    md5_genre = build_md5_genre_index(scores_path, cls_path)

    genre_keys = [g for g in GENRE_PREFIXES if g != "lmd"]
    counts: dict[str, int] = {prefix: 0 for prefix in genre_keys}
    counts["lmd"] = 0
    used_md5: set[str] = set()

    def try_copy(src: Path, prefix: str, stem: str, md5: str | None = None) -> bool:
        if counts[prefix] >= max_per_genre:
            return False
        if md5 and md5 in used_md5:
            return False
        target = midi_dir / f"{prefix}_{stem}.mid"
        if target.exists():
            counts[prefix] += 1
            if md5:
                used_md5.add(md5)
            return True
        safe_copy(src, target)
        counts[prefix] += 1
        if md5:
            used_md5.add(md5)
        return True

    # Pass 1: clean_midi — MSD MD5 lookup, then filename keyword fallback.
    midi_files = sorted(extract_dir.rglob("*.mid")) + sorted(extract_dir.rglob("*.midi"))
    for path in tqdm(midi_files, desc="LMD clean MSD routing"):
        md5 = md5_of_file(path)
        prefix = md5_genre.get(md5)
        if prefix is None:
            prefix = classify_filename(path.name)
        if prefix is None:
            if counts["lmd"] >= max_per_genre:
                continue
            prefix = "lmd"
        stem = SAFE_STEM.sub("_", path.stem)[:80]
        try_copy(path, prefix, stem, md5 if prefix != "lmd" else None)

    # Pass 2: supplement thin genres from LMD-matched when below cap.
    need_supplement = any(counts[g] < max_per_genre for g in genre_keys)
    if need_supplement:
        matched_index = ensure_lmd_matched_index(raw_dir)
        for md5, genre in tqdm(md5_genre.items(), desc="LMD-matched MSD supplement"):
            if counts[genre] >= max_per_genre:
                continue
            if md5 in used_md5:
                continue
            src = matched_index.get(md5)
            if src is None:
                continue
            stem = md5[:16]
            try_copy(src, genre, stem, md5)

    print("  lmd: MSD routing counts:", {k: counts[k] for k in genre_keys})
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
