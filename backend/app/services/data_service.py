"""
Data access layer — queries Parquet files using DuckDB.

Supports two modes:
  - Local:  path is a pathlib.Path  → reads from local filesystem
  - GCS:    path is a gs:// string  → reads via DuckDB httpfs extension
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional, Union

import duckdb
import pyarrow.parquet as pq
import pandas as pd
import numpy as np

from ..core.config import settings

logger = logging.getLogger(__name__)

# Type alias for either a local path or a GCS URI string
DataPath = Union[Path, str]


# ── Serialisation helpers ──────────────────────────────────────────────────────

import datetime

def _serialize_row(row: dict) -> dict:
    """Convert non-JSON-serializable types (Timestamps, numpy scalars) to plain Python."""
    out = {}
    for k, v in row.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            out[k] = v.isoformat()
        elif isinstance(v, pd.Timestamp):
            out[k] = v.date().isoformat()
        elif isinstance(v, np.integer):
            out[k] = int(v)
        elif isinstance(v, np.floating):
            out[k] = float(v)
        elif isinstance(v, np.bool_):
            out[k] = bool(v)
        elif not isinstance(v, (str, list, dict)) and pd.isna(v):
            out[k] = None
        else:
            out[k] = v
    return out


# ── Path helpers ───────────────────────────────────────────────────────────────

def _is_gcs(path: DataPath) -> bool:
    return isinstance(path, str) and path.startswith("gs://")


def _parquet_exists(path: DataPath) -> bool:
    """Check if a Parquet dataset exists (local only; GCS assumed to exist)."""
    if _is_gcs(path):
        return True  # assume bucket is populated; errors surface in query
    p = Path(path)
    if not p.exists():
        return False
    if p.is_dir():
        return len(list(p.rglob("*.parquet"))) > 0
    return p.suffix == ".parquet" and p.stat().st_size > 0


def _glob_pattern(path: DataPath) -> str:
    """Return a DuckDB-compatible glob for the given path."""
    if _is_gcs(path):
        # GCS path ends without trailing slash; append glob
        base = str(path).rstrip("/")
        return f"{base}/**/*.parquet"
    p = Path(path)
    if p.is_dir():
        return str(p / "**" / "*.parquet").replace("\\", "/")
    return str(p).replace("\\", "/")


def _make_connection() -> duckdb.DuckDBPyConnection:
    """Create a DuckDB in-memory connection, loading GCS credentials if needed."""
    conn = duckdb.connect(":memory:")
    if settings.use_gcs:
        conn.execute("INSTALL httpfs; LOAD httpfs;")
        conn.execute("SET enable_gcs_credential_chain = true;")
        if settings.GCS_KEY_FILE:
            # Service account key file path for environments without ADC
            conn.execute(f"SET gcs_service_account_key_file = '{settings.GCS_KEY_FILE}';")
    return conn


# ── Core query function ────────────────────────────────────────────────────────

def query_parquet(
    path: DataPath,
    sql: str,
    params: list = None,
) -> list[dict]:
    """
    Execute a SQL query against a Parquet file/directory via DuckDB.
    Works with both local paths and gs:// URIs.
    Returns a list of row dicts.
    """
    if not _parquet_exists(path):
        return []
    glob = _glob_pattern(path)
    sql = sql.replace(
        "__TABLE__",
        f"read_parquet('{glob}', union_by_name=true, hive_partitioning=true)"
    )
    conn = _make_connection()
    try:
        result = conn.execute(sql, params or []).fetchdf()
        return [_serialize_row(r) for r in result.to_dict(orient="records")]
    except Exception as exc:
        logger.error("DuckDB query failed on %s: %s\nSQL: %s", path, exc, sql)
        return []
    finally:
        conn.close()


# ── Public data access functions ───────────────────────────────────────────────

def get_summary(stats_path: DataPath) -> dict:
    rows = query_parquet(stats_path, "SELECT * FROM __TABLE__ LIMIT 1")
    return rows[0] if rows else {}


def get_component_stats(
    components_path: DataPath,
    limit: int = 20,
    order_by: str = "errors",
) -> list[dict]:
    allowed = {"errors", "warnings", "total", "infos"}
    if order_by not in allowed:
        order_by = "errors"
    return query_parquet(
        components_path,
        f"SELECT * FROM __TABLE__ ORDER BY {order_by} DESC LIMIT {limit}"
    )


def get_trends(
    trends_path: DataPath,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> list[dict]:
    where, params = "", []
    if date_from:
        where += " AND date_parsed >= ?"
        params.append(date_from)
    if date_to:
        where += " AND date_parsed <= ?"
        params.append(date_to)
    return query_parquet(
        trends_path,
        f"SELECT * FROM __TABLE__ WHERE 1=1 {where} ORDER BY date_parsed, hour",
        params,
    )


def get_events(
    events_path: DataPath,
    level: Optional[str] = None,
    is_rare: Optional[bool] = None,
    limit: int = 50,
) -> list[dict]:
    where, params = "", []
    if level:
        where += " AND level = ?"
        params.append(level.upper())
    if is_rare is not None:
        where += " AND is_rare = ?"
        params.append("true" if is_rare else "false")
    return query_parquet(
        events_path,
        f"SELECT * FROM __TABLE__ WHERE 1=1 {where} ORDER BY count DESC LIMIT {limit}",
        params,
    )


def get_logs(
    logs_path: DataPath,
    page: int = 1,
    page_size: int = 50,
    level: Optional[str] = None,
    component: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> dict:
    """Paginated, filtered log records via DuckDB LIMIT/OFFSET."""
    offset = (page - 1) * page_size
    where, params = "", []

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
    data_sql = (
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
    spikes_path: DataPath,
    block_preds_path: DataPath,
    page: int = 1,
    page_size: int = 50,
    anomaly_type: Optional[str] = None,
    is_confirmed: Optional[bool] = None,
) -> dict:
    """Unified anomaly results: error spikes + anomalous blocks."""
    results = []

    if anomaly_type in (None, "spike") and _parquet_exists(spikes_path):
        results.extend(query_parquet(
            spikes_path,
            "SELECT *, 'spike' as anomaly_type FROM __TABLE__ WHERE is_spike = 'true'"
        ))

    if anomaly_type in (None, "block") and _parquet_exists(block_preds_path):
        block_where = " AND predicted_label = 'Anomaly'"
        if is_confirmed is True:
            block_where += " AND gt_label = 'Anomaly'"
        elif is_confirmed is False:
            block_where += " AND gt_label = 'Normal'"
        results.extend(query_parquet(
            block_preds_path,
            f"SELECT *, 'block' as anomaly_type FROM __TABLE__ WHERE 1=1 {block_where}"
        ))

    total     = len(results)
    offset    = (page - 1) * page_size
    page_data = results[offset: offset + page_size]

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, (total + page_size - 1) // page_size),
        "records":   page_data,
    }


def get_metrics(metrics_path: DataPath) -> dict:
    rows = query_parquet(metrics_path, "SELECT * FROM __TABLE__ LIMIT 1")
    return rows[0] if rows else {}
