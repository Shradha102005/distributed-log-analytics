# -*- coding: utf-8 -*-
"""
load_to_bigquery.py
───────────────────
One-time script to load all local Parquet outputs into BigQuery tables.

Usage (from project root):
    python scripts/load_to_bigquery.py

Requirements:
    pip install google-cloud-bigquery google-cloud-bigquery-storage pyarrow

Set in .env or environment:
    GCP_PROJECT=gen-lang-client-0718589348
    BQ_DATASET=log_analytics           # will be created if missing
    PARQUET_BASE=./outputs/parquet     # root of your pipeline outputs
"""
import os
import sys
from pathlib import Path

import sys
import io
from dotenv import load_dotenv

# Force UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ── Config ─────────────────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_ROOT / ".env", override=False)

PROJECT   = os.getenv("GCP_PROJECT",  "gen-lang-client-0718589348")
DATASET   = os.getenv("BQ_DATASET",   "log_analytics")
BASE      = Path(os.getenv("PARQUET_BASE", str(_ROOT / "outputs" / "parquet")))
LOCATION  = os.getenv("BQ_LOCATION",  "US")

# Map: BigQuery table name → local parquet sub-path (relative to BASE)
TABLES = {
    "logs":              "logs",
    "anomaly_spikes":    "anomalies/spikes",
    "anomaly_blocks":    "anomalies/block_predictions",
    "stats_summary":     "stats/summary",
    "stats_components":  "stats/components",
    "stats_trends":      "stats/trends",
    "stats_events":      "stats/events",
    "metrics":           "metrics",
}


def get_parquet_files(subpath: str) -> list[Path]:
    p = BASE / subpath
    if not p.exists():
        return []
    if p.is_dir():
        return sorted(p.rglob("*.parquet"))
    return [p] if p.suffix == ".parquet" else []


def load_all():
    try:
        from google.cloud import bigquery
        import pyarrow.parquet as pq
    except ImportError:
        print("ERROR: Install dependencies first:")
        print("  pip install google-cloud-bigquery pyarrow")
        sys.exit(1)

    client = bigquery.Client(project=PROJECT)

    # ── Create dataset if needed ───────────────────────────────────────────────
    dataset_ref = f"{PROJECT}.{DATASET}"
    try:
        client.get_dataset(dataset_ref)
        print(f"[OK] Dataset {DATASET} already exists")
    except Exception:
        ds = bigquery.Dataset(dataset_ref)
        ds.location = LOCATION
        client.create_dataset(ds)
        print(f"[OK] Created dataset: {DATASET}")

    # ── Load each table ────────────────────────────────────────────────────────
    for table_name, subpath in TABLES.items():
        files = get_parquet_files(subpath)
        if not files:
            print(f"[SKIP] {table_name} - no parquet files at {BASE / subpath}")
            continue

        table_ref = f"{PROJECT}.{DATASET}.{table_name}"
        print(f"\n→ Loading {table_name} ({len(files)} file(s))...")

        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.PARQUET,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,  # replace on re-run
            autodetect=True,
        )

        # Load file by file (BQ client handles pyarrow parquet natively)
        for i, f in enumerate(files):
            print(f"   [{i+1}/{len(files)}] {f.name}")
            with open(f, "rb") as fh:
                job = client.load_table_from_file(fh, table_ref, job_config=job_config)
                job.result()  # wait for completion
                # After first file, append subsequent parts
                job_config.write_disposition = bigquery.WriteDisposition.WRITE_APPEND

        tbl = client.get_table(table_ref)
        print(f"   [OK] {table_name}: {tbl.num_rows:,} rows loaded")

    print("\n\n[DONE] All tables loaded into BigQuery!")
    print(f"   Project : {PROJECT}")
    print(f"   Dataset : {DATASET}")
    print(f"   Console : https://console.cloud.google.com/bigquery?project={PROJECT}")


if __name__ == "__main__":
    load_all()
