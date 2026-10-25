"""
BigQuery data access layer.

Queries BigQuery tables instead of local Parquet files.
Used when BQ_DATASET is set in environment.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

GCP_PROJECT = os.getenv("GCP_PROJECT", "gen-lang-client-0718589348")
BQ_DATASET  = os.getenv("BQ_DATASET",  "log_analytics")


def _table(name: str) -> str:
    return f"`{GCP_PROJECT}.{BQ_DATASET}.{name}`"


def _serialize_row(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, pd.Timestamp):
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


_last_error: Optional[str] = None


def _get_client():
    from google.cloud import bigquery
    import json

    # 1. Direct JSON string from env var
    creds_json = (os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON") or "").strip()
    if creds_json:
        if (creds_json.startswith("'") and creds_json.endswith("'")) or \
           (creds_json.startswith('"') and creds_json.endswith('"')):
            creds_json = creds_json[1:-1].strip()
        try:
            info = json.loads(creds_json)
            cred_type = info.get("type")
            if cred_type == "service_account":
                from google.oauth2 import service_account
                credentials = service_account.Credentials.from_service_account_info(info)
                return bigquery.Client(project=GCP_PROJECT or info.get("project_id"), credentials=credentials)
            elif cred_type == "authorized_user":
                from google.oauth2.credentials import Credentials as UserCredentials
                credentials = UserCredentials.from_authorized_user_info(info)
                return bigquery.Client(project=GCP_PROJECT or info.get("quota_project_id"), credentials=credentials)
        except Exception as e:
            logger.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON: %s", e)

    # 2. File path in GOOGLE_APPLICATION_CREDENTIALS
    creds_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_file and os.path.exists(creds_file):
        try:
            with open(creds_file, "r") as f:
                info = json.load(f)
            cred_type = info.get("type")
            if cred_type == "service_account":
                from google.oauth2 import service_account
                credentials = service_account.Credentials.from_service_account_info(info)
                return bigquery.Client(project=GCP_PROJECT or info.get("project_id"), credentials=credentials)
            elif cred_type == "authorized_user":
                from google.oauth2.credentials import Credentials as UserCredentials
                credentials = UserCredentials.from_authorized_user_info(info)
                return bigquery.Client(project=GCP_PROJECT or info.get("quota_project_id"), credentials=credentials)
        except Exception as e:
            logger.error("Failed to read GOOGLE_APPLICATION_CREDENTIALS file: %s", e)

    # 3. Standard fallback (ADC / metadata service)
    return bigquery.Client(project=GCP_PROJECT)


def _query(sql: str, params: list = None) -> list[dict]:
    global _last_error
    try:
        from google.cloud import bigquery
    except ImportError:
        _last_error = "google-cloud-bigquery not installed"
        logger.error(_last_error)
        return []
    try:
        client = _get_client()
        if params:
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter(None, "STRING", p) for p in params
                ]
            )
            df = client.query(sql, job_config=job_config).to_dataframe()
        else:
            df = client.query(sql).to_dataframe()
        _last_error = None
        return [_serialize_row(r) for r in df.to_dict(orient="records")]
    except Exception as exc:
        _last_error = str(exc)
        logger.error("BigQuery query failed: %s\nSQL: %s", exc, sql)
        return []


# ── Public functions (same signatures as data_service.py) ─────────────────────

def get_summary() -> dict:
    rows = _query(f"SELECT * FROM {_table('stats_summary')} LIMIT 1")
    return rows[0] if rows else {}


def get_component_stats(limit: int = 20, order_by: str = "errors") -> list[dict]:
    allowed = {"errors", "warnings", "total", "infos"}
    if order_by not in allowed:
        order_by = "errors"
    return _query(f"SELECT * FROM {_table('stats_components')} ORDER BY {order_by} DESC LIMIT {limit}")


def get_trends(date_from: Optional[str] = None, date_to: Optional[str] = None) -> list[dict]:
    where = "WHERE 1=1"
    if date_from:
        where += f" AND date_parsed >= '{date_from}'"
    if date_to:
        where += f" AND date_parsed <= '{date_to}'"
    return _query(f"SELECT * FROM {_table('stats_trends')} {where} ORDER BY date_parsed, hour")


def get_events(level: Optional[str] = None, is_rare: Optional[bool] = None, limit: int = 50) -> list[dict]:
    where = "WHERE 1=1"
    if level:
        where += f" AND level = '{level.upper()}'"
    if is_rare is not None:
        where += f" AND is_rare = {'true' if is_rare else 'false'}"
    return _query(f"SELECT * FROM {_table('stats_events')} {where} ORDER BY count DESC LIMIT {limit}")


def get_logs(
    page: int = 1,
    page_size: int = 50,
    level: Optional[str] = None,
    component: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> dict:
    offset = (page - 1) * page_size
    where = "WHERE 1=1"
    if level:
        where += f" AND level = '{level.upper()}'"
    if component:
        where += f" AND component LIKE '%{component}%'"
    if search:
        where += f" AND content LIKE '%{search}%'"
    if date_from:
        where += f" AND date_parsed >= '{date_from}'"
    if date_to:
        where += f" AND date_parsed <= '{date_to}'"

    count_rows = _query(f"SELECT COUNT(*) as cnt FROM {_table('logs')} {where}")
    total = count_rows[0]["cnt"] if count_rows else 0

    data = _query(
        f"SELECT date_str, time_str, pid, level, component, content, block_id, ts_raw "
        f"FROM {_table('logs')} {where} "
        f"ORDER BY ts_raw NULLS LAST "
        f"LIMIT {page_size} OFFSET {offset}"
    )

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, (total + page_size - 1) // page_size),
        "records":   data,
    }


def get_anomalies(
    page: int = 1,
    page_size: int = 50,
    anomaly_type: Optional[str] = None,
    is_confirmed: Optional[bool] = None,
) -> dict:
    results = []

    if anomaly_type in (None, "spike"):
        results.extend(_query(
            f"SELECT *, 'spike' as anomaly_type FROM {_table('anomaly_spikes')} WHERE is_spike = true"
        ))

    if anomaly_type in (None, "block"):
        where = "WHERE predicted_label = 'Anomaly'"
        if is_confirmed is True:
            where += " AND gt_label = 'Anomaly'"
        elif is_confirmed is False:
            where += " AND gt_label = 'Normal'"
        results.extend(_query(
            f"SELECT *, 'block' as anomaly_type FROM {_table('anomaly_blocks')} {where}"
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


def get_metrics() -> dict:
    rows = _query(f"SELECT * FROM {_table('metrics')} LIMIT 1")
    return rows[0] if rows else {}
