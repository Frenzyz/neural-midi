#!/usr/bin/env python3
"""Download MAESTRO v3.0.0 MIDI subset for melody training.

Dataset: MAESTRO (MIDI and Audio Edited for Synchronous TRacks and Organization)
License: Creative Commons Attribution Non-Commercial Share-Alike 4.0
Source: https://magenta.tensorflow.org/datasets/maestro
"""

from __future__ import annotations

import argparse
import csv
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

MAESTRO_ZIP_URL = (
    "https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/"
    "maestro-v3.0.0-midi.zip"
)
MAESTRO_CSV_URL = (
    "https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/"
    "maestro-v3.0.0.csv"
)


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return
    print(f"Downloading {url} ...")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        with open(dest, "wb") as f, tqdm(total=total, unit="B", unit_scale=True) as pbar:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
                    pbar.update(len(chunk))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("training/data"))
    parser.add_argument("--max-files", type=int, default=200)
    args = parser.parse_args()

    raw_dir = args.data_dir / "maestro_raw"
    midi_dir = args.data_dir / "midi"
    midi_dir.mkdir(parents=True, exist_ok=True)

    zip_path = raw_dir / "maestro-v3.0.0-midi.zip"
    csv_path = raw_dir / "maestro-v3.0.0.csv"

    download(MAESTRO_ZIP_URL, zip_path)
    download(MAESTRO_CSV_URL, csv_path)

    with zipfile.ZipFile(zip_path, "r") as zf:
        midi_names = [n for n in zf.namelist() if n.endswith(".midi") or n.endswith(".mid")]
        midi_names.sort()
        midi_names = midi_names[: args.max_files]
        for name in tqdm(midi_names, desc="Extracting MIDI"):
            target = midi_dir / Path(name).name
            if target.exists():
                continue
            with zf.open(name) as src, open(target, "wb") as dst:
                dst.write(src.read())

    # Write manifest for training script
    manifest = args.data_dir / "manifest.csv"
    with open(manifest, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["midi_path"])
        for path in sorted(midi_dir.glob("*.mid*")):
            writer.writerow([str(path)])

    print(f"Ready: {len(list(midi_dir.glob('*.mid*')))} files in {midi_dir}")


if __name__ == "__main__":
    main()
