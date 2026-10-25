"""
FastAPI route definitions.

Auto-switches between BigQuery (when BQ_DATASET is set) and
local DuckDB+Parquet (default / local dev).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Query

from ..core.config import settings
from ..models.responses import (
    HealthResponse, SummaryResponse, TrendsResponse, TrendPoint,
    ComponentsResponse, ComponentStat, EventsResponse, EventPattern,
    LogsResponse, LogRecord, AnomaliesResponse, AnomalyRecord, MetricsResponse,
)

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# ── Service selection ──────────────────────────────────────────────────────────
_USE_BQ = bool(os.getenv("BQ_DATASET", ""))

if _USE_BQ:
    from ..services import bq_service as svc
    logger.info("Data backend: BigQuery (project=%s, dataset=%s)",
                os.getenv("GCP_PROJECT"), os.getenv("BQ_DATASET"))
else:
    from ..services import data_service as svc  # type: ignore[no-redef]
    logger.info("Data backend: local Parquet (DuckDB)")


def _data_ready() -> bool:
    """Quick check that data exists in the configured backend."""
    if _USE_BQ:
        return True  # assume BQ tables exist when BQ_DATASET is set
    return svc._parquet_exists(settings.PARQUET_LOGS)


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse, tags=["health"])
def health():
    """Check API and data readiness."""
    if _USE_BQ:
        return HealthResponse(
            status="ok",
            parquet_logs_ready=True,
            parquet_stats_ready=True,
            parquet_anomalies_ready=True,
            parquet_metrics_ready=True,
        )
    return HealthResponse(
        status="ok",
        parquet_logs_ready=      svc._parquet_exists(settings.PARQUET_LOGS),
        parquet_stats_ready=     svc._parquet_exists(settings.PARQUET_SUMMARY),
        parquet_anomalies_ready= svc._parquet_exists(settings.PARQUET_ANOMALY_SPIKES),
        parquet_metrics_ready=   svc._parquet_exists(settings.PARQUET_METRICS),
    )


@router.get("/diag", tags=["health"])
def diag():
    last_err = getattr(svc, "_last_error", None)
    return {
        "use_bq": _USE_BQ,
        "gcp_project": os.getenv("GCP_PROJECT"),
        "bq_dataset": os.getenv("BQ_DATASET"),
        "has_creds_json": bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")),
        "creds_json_length": len(os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "")),
        "creds_file": os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        "last_bq_error": last_err,
    }


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SummaryResponse, tags=["analytics"])
def summary():
    """Overall log processing statistics."""
    if _USE_BQ:
        row = svc.get_summary()
    else:
        if not svc._parquet_exists(settings.PARQUET_SUMMARY):
            return SummaryResponse(data_ready=False)
        row = svc.get_summary(settings.PARQUET_SUMMARY)

    if not row:
        return SummaryResponse(data_ready=False)
    int_fields = {k: int(v) for k, v in row.items() if v is not None and str(v).lstrip('-').isdigit()}
    return SummaryResponse(data_ready=True, **int_fields)


# ── Trends ────────────────────────────────────────────────────────────────────

@router.get("/trends", response_model=TrendsResponse, tags=["analytics"])
def trends(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to:   Optional[str] = Query(None, description="YYYY-MM-DD"),
):
    """Hourly log-volume and error trends."""
    if _USE_BQ:
        rows = svc.get_trends(date_from=date_from, date_to=date_to)
    else:
        if not svc._parquet_exists(settings.PARQUET_TRENDS):
            return TrendsResponse(data=[], data_ready=False)
        rows = svc.get_trends(settings.PARQUET_TRENDS, date_from=date_from, date_to=date_to)
    return TrendsResponse(data=[TrendPoint(**r) for r in rows], data_ready=True)


# ── Components ────────────────────────────────────────────────────────────────

@router.get("/components", response_model=ComponentsResponse, tags=["analytics"])
def components(
    limit:    int = Query(20, ge=1, le=100),
    order_by: str = Query("errors", description="errors|warnings|total"),
):
    """Component-level error and warning statistics."""
    if _USE_BQ:
        rows = svc.get_component_stats(limit=limit, order_by=order_by)
    else:
        if not svc._parquet_exists(settings.PARQUET_COMPONENTS):
            return ComponentsResponse(data=[], data_ready=False)
        rows = svc.get_component_stats(settings.PARQUET_COMPONENTS, limit=limit, order_by=order_by)
    return ComponentsResponse(data=[ComponentStat(**r) for r in rows], data_ready=True)


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/events", response_model=EventsResponse, tags=["analytics"])
def events(
    level:   Optional[str]  = Query(None, description="INFO|WARN|ERROR|FATAL"),
    is_rare: Optional[bool] = Query(None),
    limit:   int            = Query(50, ge=1, le=200),
):
    """Frequent and rare event patterns."""
    if _USE_BQ:
        rows = svc.get_events(level=level, is_rare=is_rare, limit=limit)
    else:
        if not svc._parquet_exists(settings.PARQUET_EVENTS):
            return EventsResponse(data=[], data_ready=False)
        rows = svc.get_events(settings.PARQUET_EVENTS, level=level, is_rare=is_rare, limit=limit)
    return EventsResponse(data=[EventPattern(**r) for r in rows], data_ready=True)


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=LogsResponse, tags=["logs"])
def logs(
    page:      int           = Query(1, ge=1),
    page_size: int           = Query(50, ge=1, le=10000),
    level:     Optional[str] = Query(None),
    component: Optional[str] = Query(None),
    search:    Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
):
    """Paginated, filtered log records."""
    page_size = min(page_size, settings.MAX_PAGE_SIZE)

    if _USE_BQ:
        result = svc.get_logs(
            page=page, page_size=page_size,
            level=level, component=component,
            search=search, date_from=date_from, date_to=date_to,
        )
    else:
        if not svc._parquet_exists(settings.PARQUET_LOGS):
            return LogsResponse(total=0, page=1, page_size=page_size, pages=0, records=[], data_ready=False)
        result = svc.get_logs(
            settings.PARQUET_LOGS,
            page=page, page_size=page_size,
            level=level, component=component,
            search=search, date_from=date_from, date_to=date_to,
        )

    return LogsResponse(
        total=result["total"], page=result["page"],
        page_size=result["page_size"], pages=result["pages"],
        records=[LogRecord(**r) for r in result["records"]],
        data_ready=True,
    )


# ── Anomalies ─────────────────────────────────────────────────────────────────

@router.get("/anomalies", response_model=AnomaliesResponse, tags=["anomalies"])
def anomalies(
    page:         int           = Query(1, ge=1),
    page_size:    int           = Query(50, ge=1, le=500),
    anomaly_type: Optional[str] = Query(None, description="spike|block"),
    is_confirmed: Optional[bool]= Query(None),
):
    """Detected anomalies: error spikes and anomalous blocks."""
    page_size = min(page_size, settings.MAX_PAGE_SIZE)

    if _USE_BQ:
        result = svc.get_anomalies(
            page=page, page_size=page_size,
            anomaly_type=anomaly_type, is_confirmed=is_confirmed,
        )
    else:
        result = svc.get_anomalies(
            settings.PARQUET_ANOMALY_SPIKES,
            settings.PARQUET_ANOMALY_RECORDS,
            page=page, page_size=page_size,
            anomaly_type=anomaly_type, is_confirmed=is_confirmed,
        )

    has_data = bool(result["total"]) or _data_ready()
    return AnomaliesResponse(
        total=result["total"], page=result["page"],
        page_size=result["page_size"], pages=result["pages"],
        records=[AnomalyRecord(**r) for r in result["records"]],
        data_ready=has_data,
    )


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.get("/metrics", response_model=MetricsResponse, tags=["evaluation"])
def metrics():
    """Evaluation metrics (precision, recall, F1)."""
    if _USE_BQ:
        row = svc.get_metrics()
    else:
        if not svc._parquet_exists(settings.PARQUET_METRICS):
            return MetricsResponse(data_ready=False)
        row = svc.get_metrics(settings.PARQUET_METRICS)

    if not row:
        return MetricsResponse(data_ready=False)
    return MetricsResponse(data_ready=True, **row)
