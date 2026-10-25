"""
Data ingestion pipeline for LogHub HDFS v1 dataset.

Downloads the dataset if not present, uploads to HDFS, and returns
a local path for Spark to consume.

LogHub HDFS v1 format (space-delimited):
  Date Time PID Level Component - Content
  e.g.: 081109 203518 143 INFO dfs.DataNode$DataXceiver: ... blk_-1608999687919862906 ...

Ground truth file: anomaly_label.csv — columns: BlockId, Label (Normal/Anomaly)
"""

import logging
import os
import re
import shutil
import time
import zipfile
from pathlib import Path
from typing import Optional
import requests

logger = logging.getLogger(__name__)

# LogHub HDFS v1 — primary Zenodo URL (public, no auth needed)
DATASET_URL = "https://zenodo.org/records/8196385/files/HDFS_v1.zip"
# Fallback: direct log file (some mirrors host only the log)
FALLBACK_LOG_URL = "https://raw.githubusercontent.com/logpai/loghub/master/HDFS/HDFS_v1/HDFS.log"

# Column info documented here for reference
# Date       : 6-digit YYMMDD  (e.g. 081109)
# Time       : 6-digit HHMMSS  (e.g. 203518)
# PID        : process id
# Level      : INFO|WARN|ERROR|FATAL
# Component  : dotted Java class name
# Content    : free-text message (may contain "blk_<id>")
BLOCK_ID_RE = re.compile(r"blk_-?\d+")


def ensure_dataset(
    local_dir: Path,
    url: str = DATASET_URL,
    sample_mode: bool = True,
    sample_size: int = 50_000,
    force_download: bool = False,
) -> dict:
    """
    Ensure the dataset is present locally.

    Returns a dict with:
      log_path       : Path to HDFS.log (full or sample)
      label_path     : Path to anomaly_label.csv or None
      total_lines    : int
      sample_mode    : bool
    """
    local_dir = Path(local_dir)
    local_dir.mkdir(parents=True, exist_ok=True)

    zip_path = local_dir / "HDFS_v1.zip"
    log_path = local_dir / "HDFS.log"
    label_path = local_dir / "anomaly_label.csv"
    sample_path = local_dir / "HDFS_sample.log"

    # ── Download ───────────────────────────────────────────────────────────────
    if force_download or not log_path.exists():
        if not zip_path.exists() or force_download:
            logger.info("Downloading HDFS_v1 dataset from %s ...", url)
            _download_with_progress(url, zip_path)
        
        # Try to extract
        if zip_path.exists():
            logger.info("Extracting %s ...", zip_path)
            _extract_zip(zip_path, local_dir)
        
        # If extraction didn't produce HDFS.log, try direct log download
        if not log_path.exists():
            logger.warning("ZIP extraction did not produce HDFS.log; trying direct URL ...")
            _download_with_progress(FALLBACK_LOG_URL, log_path)

    if not log_path.exists():
        raise FileNotFoundError(
            f"Could not locate HDFS.log in {local_dir}. "
            f"Download manually from {url} and extract."
        )

    # ── Count lines (streaming, no full load) ─────────────────────────────────
    logger.info("Counting lines in %s ...", log_path)
    total_lines = _count_lines(log_path)
    logger.info("Total lines: %d", total_lines)

    # ── Sample ────────────────────────────────────────────────────────────────
    if sample_mode and total_lines > sample_size:
        logger.info("Sample mode: writing first %d lines to %s", sample_size, sample_path)
        _write_sample(log_path, sample_path, sample_size)
        active_path = sample_path
    else:
        active_path = log_path
        if sample_mode:
            logger.info("File has %d lines ≤ sample_size %d — using full file", total_lines, sample_size)

    return {
        "log_path": active_path,
        "label_path": label_path if label_path.exists() else None,
        "total_lines": total_lines,
        "sample_mode": sample_mode and (total_lines > sample_size),
    }


def upload_to_hdfs(
    local_path: Path,
    hdfs_path: str,
    hadoop_bin: str = "/usr/local/hadoop/bin/hdfs",
    overwrite: bool = False,
) -> bool:
    """
    Upload a local file to HDFS using the hdfs dfs -put command via subprocess.
    Returns True on success. Does NOT load data into memory.
    """
    import subprocess

    local_path = Path(local_path)
    if not local_path.exists():
        logger.error("Local file not found: %s", local_path)
        return False

    # Check if already uploaded
    check = subprocess.run(
        [hadoop_bin, "dfs", "-test", "-e", hdfs_path],
        capture_output=True,
    )
    if check.returncode == 0 and not overwrite:
        logger.info("HDFS path already exists (skipping upload): %s", hdfs_path)
        return True

    # Ensure parent directory exists
    hdfs_parent = str(Path(hdfs_path).parent)
    subprocess.run([hadoop_bin, "dfs", "-mkdir", "-p", hdfs_parent], capture_output=True)

    logger.info("Uploading %s → %s ...", local_path, hdfs_path)
    t0 = time.time()
    cmd = [hadoop_bin, "dfs", "-put"]
    if overwrite:
        cmd.append("-f")
    cmd += [str(local_path), hdfs_path]

    result = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - t0

    if result.returncode == 0:
        logger.info("Upload succeeded in %.1fs", elapsed)
        return True
    else:
        logger.error("Upload failed: %s", result.stderr)
        return False


# ── Private helpers ────────────────────────────────────────────────────────────

def _download_with_progress(url: str, dest: Path, chunk_size: int = 1024 * 1024) -> None:
    """Stream-download url → dest, printing progress."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        downloaded = 0
        t0 = time.time()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=chunk_size):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded / total * 100
                    elapsed = time.time() - t0
                    speed = downloaded / elapsed / 1024 / 1024 if elapsed > 0 else 0
                    print(f"\r  {pct:.1f}%  {downloaded/1024/1024:.1f}/{total/1024/1024:.1f} MB  {speed:.1f} MB/s", end="", flush=True)
    print()  # newline after progress


def _extract_zip(zip_path: Path, dest_dir: Path) -> None:
    """Extract zip, flattening any top-level directory."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        members = zf.namelist()
        logger.info("ZIP contains: %s", members[:10])
        for member in members:
            # Flatten: strip leading directories
            filename = Path(member).name
            if not filename:
                continue
            target = dest_dir / filename
            with zf.open(member) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    logger.info("Extraction complete → %s", dest_dir)


def _count_lines(path: Path) -> int:
    count = 0
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for _ in f:
            count += 1
    return count


def _write_sample(src: Path, dest: Path, n: int) -> None:
    with open(src, "r", encoding="utf-8", errors="replace") as fi, \
         open(dest, "w", encoding="utf-8") as fo:
        for i, line in enumerate(fi):
            if i >= n:
                break
            fo.write(line)
