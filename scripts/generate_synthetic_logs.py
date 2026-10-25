#!/usr/bin/env python3
"""
Generate a synthetic HDFS log file in LogHub HDFS v1 format.

Format: Date Time PID Level Component - Content
Example: 081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-1608999687919862906

Generates ~20,000 log lines with ~15% anomalous blocks.
Also generates a matching anomaly_label.csv for evaluation.

Usage (WSL or Windows):
    python scripts/generate_synthetic_logs.py
"""

import random
import csv
import os
from pathlib import Path
from datetime import datetime, timedelta

random.seed(42)

# ── Config ────────────────────────────────────────────────────────────────────
TOTAL_BLOCKS        = 300        # number of HDFS blocks
ANOMALY_RATIO       = 0.15       # 15% anomalous blocks
LINES_PER_NORMAL    = 50         # log lines per normal block
LINES_PER_ANOMALY   = 80         # anomalous blocks generate more noise
START_DATE          = datetime(2008, 11, 9, 20, 0, 0)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
OUTPUT_LOG   = OUTPUT_DIR / "HDFS.log"          # replaces original (backed up)
OUTPUT_LABEL = OUTPUT_DIR / "anomaly_label.csv" # replaces original (backed up)
BACKUP_LOG   = OUTPUT_DIR / "HDFS_original.log.bak"
BACKUP_LABEL = OUTPUT_DIR / "anomaly_label_original.csv.bak"

# ── HDFS Components ───────────────────────────────────────────────────────────
COMPONENTS = [
    "dfs.DataNode$DataXceiver",
    "dfs.FSNamesystem",
    "dfs.DataNode$PacketResponder",
    "dfs.DataBlockScanner",
    "dfs.DataNode",
    "namenode.FSNamesystem",
    "hdfs.DFSClient",
    "dfs.DataNode$BlockReceiver",
]

# ── Normal message templates ──────────────────────────────────────────────────
NORMAL_TEMPLATES = [
    ("INFO",  "dfs.DataNode$DataXceiver",    "Receiving block {blk} src: /10.251.{a}.{b}:{p} dest: /10.251.{c}.{d}:{q}"),
    ("INFO",  "dfs.DataNode$PacketResponder","PacketResponder {n} for block {blk} terminating"),
    ("INFO",  "dfs.DataNode$DataXceiver",    "Received block {blk} src: /10.251.{a}.{b}:{p} dest: /10.251.{c}.{d}:{q} of size {sz}"),
    ("INFO",  "dfs.FSNamesystem",            "BLOCK* NameSystem.allocateBlock: /user/root/rand/_temporary/{blk}"),
    ("INFO",  "dfs.DataBlockScanner",        "Verification succeeded for {blk}"),
    ("INFO",  "dfs.DataNode",                "Served block {blk} to /10.251.{a}.{b}"),
    ("INFO",  "hdfs.DFSClient",              "Successfully completed write request for block {blk}"),
    ("WARN",  "dfs.FSNamesystem",            "Low disk space on DataNode /10.251.{a}.{b}: {sz} bytes remaining"),
    ("INFO",  "dfs.DataNode$BlockReceiver",  "Receiving empty packet for block {blk}"),
    ("INFO",  "namenode.FSNamesystem",       "BLOCK* ask 10.251.{a}.{b}:50010 to replicate {blk}"),
]

# ── Anomaly message templates ─────────────────────────────────────────────────
ANOMALY_TEMPLATES = [
    ("ERROR", "dfs.DataNode$DataXceiver",    "Exception in receiveBlock for block {blk} java.io.IOException: Broken pipe"),
    ("ERROR", "dfs.DataNode",                "Exception while serving block {blk} to /10.251.{a}.{b} java.net.SocketException: Connection reset"),
    ("ERROR", "dfs.FSNamesystem",            "BLOCK* NameSystem.addStoredBlock: Redundant addStoredBlock request received for {blk}"),
    ("FATAL", "dfs.DataNode$PacketResponder","PacketResponder {n} for block {blk} Interrupted"),
    ("ERROR", "dfs.DataBlockScanner",        "Verification failed for {blk}: checksum error"),
    ("ERROR", "hdfs.DFSClient",              "Failed to close file because of timeout; will retry for {blk}"),
    ("WARN",  "dfs.DataNode$DataXceiver",    "Slow BlockReceiver write packet to mirror took {ms}ms for block {blk}"),
    ("ERROR", "dfs.DataNode$BlockReceiver",  "IOException in BlockReceiver.receivePacket() for block {blk}"),
    ("FATAL", "dfs.FSNamesystem",            "DataNode /10.251.{a}.{b} is dead, and when we tried to process its heartbeat, it was not registered"),
    ("ERROR", "dfs.DataNode",                "DiskOutOfSpaceException while writing block {blk}: No space left on device"),
]


def rand_ip():
    return random.randint(1, 254), random.randint(1, 254)


def rand_port():
    return random.randint(40000, 65000)


def rand_size():
    return random.choice([67108864, 134217728, 268435456, 16384, 32768])


def make_block_id():
    sign = random.choice(["", "-"])
    return f"blk_{sign}{random.randint(10**15, 10**18)}"


def format_time(dt: datetime):
    return dt.strftime("%y%m%d"), dt.strftime("%H%M%S")


def fill_template(template: str, blk: str) -> str:
    a, b = rand_ip()
    c, d = rand_ip()
    return template.format(
        blk=blk, a=a, b=b, c=c, d=d,
        p=rand_port(), q=rand_port(),
        sz=rand_size(), n=random.randint(0, 5),
        ms=random.randint(500, 5000),
    )


def generate():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Back up originals if they exist
    if OUTPUT_LOG.exists() and not BACKUP_LOG.exists():
        print(f"Backing up original HDFS.log → {BACKUP_LOG.name}")
        import shutil
        shutil.copy2(OUTPUT_LOG, BACKUP_LOG)
    if OUTPUT_LABEL.exists() and not BACKUP_LABEL.exists():
        print(f"Backing up original anomaly_label.csv → {BACKUP_LABEL.name}")
        import shutil
        shutil.copy2(OUTPUT_LABEL, BACKUP_LABEL)

    # Decide which blocks are anomalous
    block_ids = [make_block_id() for _ in range(TOTAL_BLOCKS)]
    n_anomalous = int(TOTAL_BLOCKS * ANOMALY_RATIO)
    anomalous_set = set(random.sample(block_ids, n_anomalous))

    labels = {}
    for blk in block_ids:
        labels[blk] = "Anomaly" if blk in anomalous_set else "Normal"

    current_time = START_DATE
    pid_base = random.randint(100, 999)
    lines = []

    for blk in block_ids:
        is_anomaly = blk in anomalous_set
        n_lines = LINES_PER_ANOMALY if is_anomaly else LINES_PER_NORMAL

        # For anomalous blocks: first emit some normal lines then errors
        normal_count = n_lines // 3 if is_anomaly else n_lines
        error_count  = n_lines - normal_count if is_anomaly else 0

        for _ in range(normal_count):
            level, comp, tmpl = random.choice(NORMAL_TEMPLATES)
            content = fill_template(tmpl, blk)
            date_str, time_str = format_time(current_time)
            pid = pid_base + random.randint(0, 50)
            lines.append(f"{date_str} {time_str} {pid} {level} {comp} - {content}")
            current_time += timedelta(seconds=random.randint(1, 10))

        for _ in range(error_count):
            level, comp, tmpl = random.choice(ANOMALY_TEMPLATES)
            content = fill_template(tmpl, blk)
            date_str, time_str = format_time(current_time)
            pid = pid_base + random.randint(0, 50)
            lines.append(f"{date_str} {time_str} {pid} {level} {comp} - {content}")
            current_time += timedelta(seconds=random.randint(1, 5))

    # Shuffle to mix normal and anomalous lines (realistic)
    random.shuffle(lines)

    # Write log file
    with open(OUTPUT_LOG, "w") as f:
        f.write("\n".join(lines) + "\n")

    # Write label CSV
    with open(OUTPUT_LABEL, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["BlockId", "Label"])
        for blk, label in labels.items():
            writer.writerow([blk, label])

    n_normal   = sum(1 for l in labels.values() if l == "Normal")
    n_anomaly  = sum(1 for l in labels.values() if l == "Anomaly")

    print("=" * 56)
    print("✓ Synthetic HDFS log generated!")
    print(f"  Log file  : {OUTPUT_LOG}")
    print(f"  Label CSV : {OUTPUT_LABEL}")
    print(f"  Total lines: {len(lines):,}")
    print(f"  Blocks     : {TOTAL_BLOCKS} ({n_normal} normal, {n_anomaly} anomalous)")
    print(f"  Anomaly %  : {n_anomaly/TOTAL_BLOCKS*100:.0f}%")
    print("=" * 56)
    print()
    print("Now run the pipeline:")
    print("  python pipeline/run_pipeline.py --sample --no-download")
    print("  (Then update config to point at HDFS_synthetic.log)")


if __name__ == "__main__":
    generate()
