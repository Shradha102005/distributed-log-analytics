"""
Data access layer — queries Parquet files using DuckDB for efficient
filtered queries without loading everything into memory.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import duckdb
import pyarrow.parquet as pq
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


def _serialize_row(row: dict) -> dict:
    """Convert non-JSON-serializable types (Timestamps, numpy scalars) to plain Python types."""
    out = {}
    for k, v in row.items():
        if isinstance(v, (pd.Timestamp,)):
            out[k] = v.date().isoformat()  # "2008-11-09"
        elif isinstance(v, (np.integer,)):
            out[k] = int(v)
        elif isinstance(v, (np.floating,)):
            out[k] = float(v)
        elif isinstance(v, (np.bool_,)):
            out[k] = bool(v)
        elif pd.isna(v) if not isinstance(v, (str, list, dict)) else False:
            out[k] = None
        else:
            out[k] = v
    return out


def _parquet_exists(path: Path) -> bool:
    """Check whether a Parquet dataset (file or directory) exists and has data."""
    if not path.exists():
        return False
    # Directory-style Parquet (partitioned)
    if path.is_dir():
        parquet_files = list(path.rglob("*.parquet"))
        return len(parquet_files) > 0
    # Single file
    return path.suffix == ".parquet" and path.stat().st_size > 0


def _glob_pattern(path: Path) -> str:
    """Return a DuckDB-compatible glob for a Parquet dataset directory."""
    if path.is_dir():
        return str(path / "**" / "*.parquet").replace("\\", "/")
    return str(path).replace("\\", "/")


def query_parquet(
    path: Path,
    sql: str,
    params: list = None,
) -> list[dict]:
    """
    Execute a SQL query against a Parquet file/directory via DuckDB.
    Returns a list of row dicts.
    """
    if not _parquet_exists(path):
        return []
    glob = _glob_pattern(path)
    # Inject the table reference
    sql = sql.replace("__TABLE__", f"read_parquet('{glob}', union_by_name=true, hive_partitioning=true)")
    conn = duckdb.connect(":memory:")
    try:
        result = conn.execute(sql, params or []).fetchdf()
        return [_serialize_row(r) for r in result.to_dict(orient="records")]
    except Exception as exc:
        logger.error("DuckDB query failed on %s: %s\nSQL: %s", path, exc, sql)
        return []
    finally:
        conn.close()


def get_summary(stats_path: Path) -> dict:
    """Return the single-row summary statistics."""
    rows = query_parquet(
        stats_path,
        "SELECT * FROM __TABLE__ LIMIT 1"
    )
    if not rows:
        return {}
    return rows[0]


def get_component_stats(
    components_path: Path,
    limit: int = 20,
    order_by: str = "errors",
) -> list[dict]:
    allowed_orders = {"errors", "warnings", "total", "infos"}
    if order_by not in allowed_orders:
        order_by = "errors"
    return query_parquet(
        components_path,
        f"SELECT * FROM __TABLE__ ORDER BY {order_by} DESC LIMIT {limit}"
    )


def get_trends(
    trends_path: Path,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> list[dict]:
    where = ""
    params = []
    if date_from:
        where += " AND date_parsed >= ?"
        params.append(date_from)
    if date_to:
        where += " AND date_parsed <= ?"
        params.append(date_to)
    sql = f"SELECT * FROM __TABLE__ WHERE 1=1 {where} ORDER BY date_parsed, hour"
    return query_parquet(trends_path, sql, params)


def get_events(
    events_path: Path,
    level: Optional[str] = None,
    is_rare: Optional[bool] = None,
    limit: int = 50,
) -> list[dict]:
    where = ""
    params = []
    if level:
        where += " AND level = ?"
        params.append(level.upper())
    if is_rare is not None:
        where += " AND is_rare = ?"
        params.append("true" if is_rare else "false")
    sql = f"SELECT * FROM __TABLE__ WHERE 1=1 {where} ORDER BY count DESC LIMIT {limit}"
    return query_parquet(events_path, sql, params)


def get_logs(
    logs_path: Path,
    page: int = 1,
    page_size: int = 50,
    level: Optional[str] = None,
    component: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> dict:
    """
    Paginated, filtered log records.
    Never loads full dataset — uses SQL LIMIT/OFFSET via DuckDB.
    """
    offset = (page - 1) * page_size
    where = ""
    params = []

    if level:
        where += " AND level = ?"
        params.append(level.upper())
    if component:
        where += " AND component LIKE ?"
        params.append(f"%{component}%")
    if search:
        where += " AND content LIKE ?"
        params.append(f"%{search}%")
    if date_from:
        where += " AND date_parsed >= ?"
        params.append(date_from)
    if date_to:
        where += " AND date_parsed <= ?"
        params.append(date_to)

    count_sql = f"SELECT COUNT(*) as cnt FROM __TABLE__ WHERE 1=1 {where}"
    data_sql  = (
        f"SELECT date_str, time_str, pid, level, component, content, block_id, ts_raw "
        f"FROM __TABLE__ WHERE 1=1 {where} "
        f"ORDER BY ts_raw NULLS LAST "
        f"LIMIT {page_size} OFFSET {offset}"
    )

    count_rows = query_parquet(logs_path, count_sql, params[:])
    total = count_rows[0]["cnt"] if count_rows else 0
    data  = query_parquet(logs_path, data_sql, params[:])

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, (total + page_size - 1) // page_size),
        "records":   data,
    }


def get_anomalies(
    spikes_path: Path,
    block_preds_path: Path,
    page: int = 1,
    page_size: int = 50,
    anomaly_type: Optional[str] = None,
    is_confirmed: Optional[bool] = None,
) -> dict:
    """
    Unified anomaly results: error spikes + anomalous blocks.
    """
    results = []

    # 1. Error spikes
    if anomaly_type in (None, "spike") and _parquet_exists(spikes_path):
        spike_where = " AND is_spike = 'true'"
        spikes = query_parquet(
            spikes_path,
            f"SELECT *, 'spike' as anomaly_type FROM __TABLE__ WHERE 1=1 {spike_where}"
        )
        results.extend(spikes)

    # 2. Anomalous block predictions
    if anomaly_type in (None, "block") and _parquet_exists(block_preds_path):
        block_where = " AND predicted_label = 'Anomaly'"
        if is_confirmed is True:
            block_where += " AND gt_label = 'Anomaly'"
        elif is_confirmed is False:
            block_where += " AND gt_label = 'Normal'"
        blocks = query_parquet(
            block_preds_path,
            f"SELECT *, 'block' as anomaly_type FROM __TABLE__ WHERE 1=1 {block_where}"
        )
        results.extend(blocks)

    total = len(results)
    offset = (page - 1) * page_size
    page_data = results[offset: offset + page_size]

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, (total + page_size - 1) // page_size),
        "records":   page_data,
    }


def get_metrics(metrics_path: Path) -> dict:
    rows = query_parquet(metrics_path, "SELECT * FROM __TABLE__ LIMIT 1")
    if not rows:
        return {}
    return rows[0]
