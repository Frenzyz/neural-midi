#!/usr/bin/env python3
"""Download multi-source MIDI datasets for melody training.

Supported datasets (--datasets comma-separated):
  maestro      — MAESTRO v3.0.0 piano (CC BY-NC-SA 4.0)
  pop909       — POP909 pop songs with chords (research use)
  jsb          — Bach JSB chorales (public domain)
  lmd          — HuggingFace LMD melody subset (optional)
  giantmidi    — GiantMIDI-Piano repertoire subset (Google Magenta)
  nottingham   — Nottingham folk melody MIDI (folk leads)
  egmd         — E-GMD expressive guitar subset (melody lines)

Example:
  python training/download_data.py --datasets maestro,pop909,jsb,giantmidi,nottingham --max-per-dataset 2000
"""

from __future__ import annotations

import argparse
import csv
import io
import shutil
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

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
# HuggingFace LMD melody subset (≈2k files, research)
LMD_HF_DATASET = "mkorzeniowski/lmd_matched_melody"
GIANTMIDI_ZIP_URL = (
    "https://storage.googleapis.com/magentadata/datasets/giantmidi-piano/"
    "midi_transcription_policies_only968nbf0_89.zip"
)
NOTTINGHAM_ZIP_URL = (
    "https://github.com/danbrown/nottingham-dataset/raw/master/nottingham.zip"
)
EGMD_MANIFEST_URL = (
    "https://storage.googleapis.com/magentadata/datasets/egdb/egdb_midi.zip"
)


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


def copy_tree_midi(src: Path, dest: Path, max_files: int, prefix: str) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(src.rglob("*")):
        if count >= max_files:
            break
        if path.suffix.lower() not in {".mid", ".midi"}:
            continue
        target = dest / f"{prefix}_{path.stem}.mid"
        if target.exists():
            count += 1
            continue
        shutil.copy2(path, target)
        count += 1
    return count


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
    extract_dir = raw_dir / "pop909"
    if not extract_dir.exists():
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
    root = extract_dir
    return copy_tree_midi(root, midi_dir, max_files, "jsb")


def fetch_lmd_hf(midi_dir: Path, max_files: int) -> int:
    try:
        from huggingface_hub import hf_hub_download, list_repo_files
    except ImportError:
        print("  lmd: install huggingface_hub (`pip install huggingface_hub`) — skipped")
        return 0

    try:
        files = [
            f
            for f in list_repo_files(LMD_HF_DATASET, repo_type="dataset")
            if f.endswith((".mid", ".midi"))
        ]
    except Exception as err:
        print(f"  lmd: HuggingFace listing failed ({err}) — skipped")
        return 0

    count = 0
    for rel in tqdm(files[:max_files], desc="LMD subset"):
        try:
            local = hf_hub_download(LMD_HF_DATASET, rel, repo_type="dataset")
            target = midi_dir / f"lmd_{Path(rel).name}"
            if not target.exists():
                shutil.copy2(local, target)
            count += 1
        except Exception:
            continue
    return count


def fetch_giantmidi(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    zip_path = raw_dir / "giantmidi-piano.zip"
    try:
        download(GIANTMIDI_ZIP_URL, zip_path)
    except Exception as err:
        print(f"  giantmidi: download failed ({err}) — skipped")
        return 0
    extract_dir = raw_dir / "giantmidi"
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    return copy_tree_midi(extract_dir, midi_dir, max_files, "giantmidi")


def fetch_nottingham(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    zip_path = raw_dir / "nottingham.zip"
    try:
        download(NOTTINGHAM_ZIP_URL, zip_path)
    except Exception as err:
        print(f"  nottingham: download failed ({err}) — skipped")
        return 0
    extract_dir = raw_dir / "nottingham"
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    return copy_tree_midi(extract_dir, midi_dir, max_files, "nottingham")


def fetch_egmd(raw_dir: Path, midi_dir: Path, max_files: int) -> int:
    zip_path = raw_dir / "egmd.zip"
    try:
        download(EGMD_MANIFEST_URL, zip_path)
    except Exception as err:
        print(f"  egmd: download failed ({err}) — skipped")
        return 0
    extract_dir = raw_dir / "egmd"
    if not extract_dir.exists():
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    return copy_tree_midi(extract_dir, midi_dir, max_files, "egmd")


def write_manifest(midi_dir: Path, data_dir: Path) -> None:
    manifest = data_dir / "manifest.csv"
    with open(manifest, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["midi_path", "source"])
        for path in sorted(midi_dir.glob("*.mid*")):
            source = path.name.split("_", 1)[0]
            writer.writerow([str(path), source])
    print(f"Manifest: {manifest} ({len(list(midi_dir.glob('*.mid*')))} files)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("training/data"))
    parser.add_argument(
        "--datasets",
        type=str,
        default="maestro,pop909,jsb",
        help="Comma-separated: maestro,pop909,jsb,lmd,giantmidi,nottingham,egmd",
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
            totals["lmd"] = fetch_lmd_hf(midi_dir, args.max_per_dataset)
        except Exception as err:
            print(f"  lmd: failed ({err})")
    if "giantmidi" in datasets:
        try:
            totals["giantmidi"] = fetch_giantmidi(raw_dir, midi_dir, args.max_per_dataset)
        except Exception as err:
            print(f"  giantmidi: failed ({err})")
    if "nottingham" in datasets:
        try:
            totals["nottingham"] = fetch_nottingham(raw_dir, midi_dir, min(args.max_per_dataset, 800))
        except Exception as err:
            print(f"  nottingham: failed ({err})")
    if "egmd" in datasets:
        try:
            totals["egmd"] = fetch_egmd(raw_dir, midi_dir, min(args.max_per_dataset, 1200))
        except Exception as err:
            print(f"  egmd: failed ({err})")

    write_manifest(midi_dir, args.data_dir)
    print("Downloaded:", totals)
    print(f"Total MIDI files: {len(list(midi_dir.glob('*.mid*')))} in {midi_dir}")


if __name__ == "__main__":
    main()
