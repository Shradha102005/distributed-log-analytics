"""
Generate synthetic sample Parquet outputs for development and testing.
Run this when you don't have the full pipeline output yet.
Data is clearly marked as SYNTHETIC / SAMPLE.
"""
import os
import sys
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import random
from datetime import date, datetime, timedelta

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs"

COMPONENTS = [
    "dfs.DataNode$DataXceiver",
    "dfs.DataNode$PacketResponder",
    "dfs.FSNamesystem.audit",
    "dfs.DataBlockScanner",
    "dfs.DataNode",
    "hadoop.hdfs.server.namenode.NameNode",
]
LEVELS = ["INFO", "WARN", "ERROR", "FATAL"]
LEVEL_WEIGHTS = [0.75, 0.15, 0.09, 0.01]

random.seed(42)

def write_pq(df: pd.DataFrame, path: Path, **kwargs):
    path.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(table, path / "data.parquet", **kwargs)
    print(f"  Wrote {len(df)} rows -> {path}")


def generate():
    print("Generating SYNTHETIC sample Parquet data...")
    print("(This is development test data — NOT real pipeline output)")

    n = 10_000
    base_date = date(2008, 11, 9)
    dates = [base_date + timedelta(days=d) for d in range(3)]

    # ── Logs ──────────────────────────────────────────────────────────────────
    levels   = random.choices(LEVELS, weights=LEVEL_WEIGHTS, k=n)
    comps    = [random.choice(COMPONENTS) for _ in range(n)]
    hours    = [random.randint(0, 23) for _ in range(n)]
    log_dates= [random.choice(dates) for _ in range(n)]

    block_ids = [f"blk_{random.randint(-9999999999999999, 9999999999999999)}" for _ in range(n)]
    for i in range(n):
        if levels[i] == "INFO" and random.random() > 0.4:
            block_ids[i] = None

    contents = {
        "INFO":  ["Receiving block {b} src /10.250.10.6:52037 dest /10.250.10.6:50010",
                  "Served block {b} to /10.250.10.6",
                  "Starting thread to transfer block {b} to datanode"],
        "WARN":  ["Exception in receiveBlock for block {b}",
                  "Slow BlockReceiver write packet to mirror took 1234ms"],
        "ERROR": ["IOException in receiveBlock for block {b}: Connection refused",
                  "Error reading client {b}"],
        "FATAL": ["FATAL: NameNode health check failed for block {b}"],
    }

    rows = []
    for i in range(n):
        lvl = levels[i]
        tmpl = random.choice(contents[lvl])
        bid = block_ids[i] or "blk_N/A"
        content = tmpl.replace("{b}", bid)
        h = hours[i]
        d = log_dates[i]
        rows.append({
            "date_str":  d.strftime("%y%m%d"),
            "time_str":  f"{h:02d}{random.randint(0,59):02d}{random.randint(0,59):02d}",
            "pid":       str(random.randint(100, 999)),
            "level":     lvl,
            "component": comps[i],
            "content":   content,
            "block_id":  block_ids[i],
            "ts_raw":    f"{d.strftime('%y%m%d')} {h:02d}{random.randint(0,59):02d}{random.randint(0,59):02d}",
            "parse_ok":  "ok",
            "date_parsed": str(d),
            "hour":      h,
        })

    logs_df = pd.DataFrame(rows)
    write_pq(logs_df, OUTPUT / "parquet" / "logs" / "level=INFO",)
    # Simplified: write all to one parquet for dev
    write_pq(logs_df, OUTPUT / "parquet" / "logs")

    # ── Summary ───────────────────────────────────────────────────────────────
    summary_df = pd.DataFrame([{
        "total_records":  n,
        "parsed_ok":      n,
        "parse_failed":   0,
        "parse_empty":    0,
        "info_count":     sum(1 for l in levels if l == "INFO"),
        "warn_count":     sum(1 for l in levels if l in ("WARN","WARNING")),
        "error_count":    sum(1 for l in levels if l == "ERROR"),
        "fatal_count":    sum(1 for l in levels if l == "FATAL"),
        "_note":          "SYNTHETIC SAMPLE DATA — run pipeline for real results",
    }])
    write_pq(summary_df, OUTPUT / "parquet" / "stats" / "summary")

    # ── Components ────────────────────────────────────────────────────────────
    comp_rows = []
    for comp in COMPONENTS:
        idxs = [i for i, c in enumerate(comps) if c == comp]
        comp_rows.append({
            "component": comp,
            "total":     len(idxs),
            "errors":    sum(1 for i in idxs if levels[i] == "ERROR"),
            "warnings":  sum(1 for i in idxs if levels[i] in ("WARN","WARNING")),
            "infos":     sum(1 for i in idxs if levels[i] == "INFO"),
        })
    write_pq(pd.DataFrame(comp_rows), OUTPUT / "parquet" / "stats" / "components")

    # ── Trends ────────────────────────────────────────────────────────────────
    trend_rows = []
    for d_ in dates:
        for h in range(24):
            idxs = [i for i, (ld, lh) in enumerate(zip(log_dates, hours)) if ld == d_ and lh == h]
            if not idxs:
                continue
            trend_rows.append({
                "date_parsed": str(d_),
                "hour":        h,
                "total":       len(idxs),
                "errors":      sum(1 for i in idxs if levels[i] == "ERROR"),
                "warnings":    sum(1 for i in idxs if levels[i] in ("WARN","WARNING")),
            })
    write_pq(pd.DataFrame(trend_rows), OUTPUT / "parquet" / "stats" / "trends")

    # ── Events ────────────────────────────────────────────────────────────────
    event_patterns = [
        ("Receiving block", "INFO", 3200, 0.320),
        ("Served block",    "INFO", 2100, 0.210),
        ("Starting thread to transfer block", "INFO", 1100, 0.110),
        ("Exception in receiveBlock", "WARN", 890, 0.089),
        ("Slow BlockReceiver write packet", "WARN", 310, 0.031),
        ("IOException in receiveBlock", "ERROR", 205, 0.0205),
        ("Error reading client", "ERROR", 160, 0.016),
        ("FATAL: NameNode health check failed", "FATAL", 35, 0.0035),
    ]
    events_df = pd.DataFrame([
        {"event_pattern": ep, "level": lv, "count": cnt,
         "fraction": fr, "is_rare": "true" if fr < 0.001 else "false"}
        for ep, lv, cnt, fr in event_patterns
    ])
    write_pq(events_df, OUTPUT / "parquet" / "stats" / "events")

    # ── Anomaly spikes ────────────────────────────────────────────────────────
    spikes = []
    for row in trend_rows:
        spikes.append({
            **row,
            "mean_errors": 3.0,
            "std_errors":  2.5,
            "z_score":     round((row["errors"] - 3.0) / 2.5, 4),
            "is_spike":    "true" if (row["errors"] - 3.0) / 2.5 > 3.0 else "false",
        })
    write_pq(pd.DataFrame(spikes), OUTPUT / "parquet" / "anomalies" / "spikes")

    # ── Block predictions ─────────────────────────────────────────────────────
    block_ids_unique = list({b for b in block_ids if b})
    block_preds = []
    for bid in block_ids_unique[:500]:
        idxs = [i for i, b in enumerate(block_ids) if b == bid]
        err_cnt = sum(1 for i in idxs if levels[i] in ("ERROR","FATAL"))
        block_preds.append({
            "block_id":        bid,
            "total_count":     len(idxs),
            "error_count":     err_cnt,
            "predicted_label": "Anomaly" if err_cnt > 0 else "Normal",
            "gt_label":        None,
        })
    write_pq(pd.DataFrame(block_preds), OUTPUT / "parquet" / "anomalies" / "block_predictions")

    print("\n✓ Synthetic sample data written to outputs/parquet/")
    print("  Run the full pipeline to replace with real processed data.")


if __name__ == "__main__":
    generate()
