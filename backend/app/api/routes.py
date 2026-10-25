"""
FastAPI route definitions.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from ..core.config import settings
from ..services import data_service as ds
from ..models.responses import (
    HealthResponse, SummaryResponse, TrendsResponse, TrendPoint,
    ComponentsResponse, ComponentStat, EventsResponse, EventPattern,
    LogsResponse, LogRecord, AnomaliesResponse, AnomalyRecord, MetricsResponse,
)

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse, tags=["health"])
def health():
    """Check API and Parquet data readiness."""
    return HealthResponse(
        status="ok",
        parquet_logs_ready=      ds._parquet_exists(settings.PARQUET_LOGS),
        parquet_stats_ready=     ds._parquet_exists(settings.PARQUET_SUMMARY),
        parquet_anomalies_ready= ds._parquet_exists(settings.PARQUET_ANOMALY_SPIKES),
        parquet_metrics_ready=   ds._parquet_exists(settings.PARQUET_METRICS),
    )


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SummaryResponse, tags=["analytics"])
def summary():
    """Overall log processing statistics."""
    if not ds._parquet_exists(settings.PARQUET_SUMMARY):
        return SummaryResponse(data_ready=False)
    row = ds.get_summary(settings.PARQUET_SUMMARY)
    int_fields = {k: int(v) for k, v in row.items() if v is not None and str(v).lstrip('-').isdigit()}
    return SummaryResponse(data_ready=True, **int_fields)


# ── Trends ────────────────────────────────────────────────────────────────────

@router.get("/trends", response_model=TrendsResponse, tags=["analytics"])
def trends(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to:   Optional[str] = Query(None, description="YYYY-MM-DD"),
):
    """Hourly log-volume and error trends."""
    if not ds._parquet_exists(settings.PARQUET_TRENDS):
        return TrendsResponse(data=[], data_ready=False)
    rows = ds.get_trends(settings.PARQUET_TRENDS, date_from=date_from, date_to=date_to)
    points = [TrendPoint(**r) for r in rows]
    return TrendsResponse(data=points, data_ready=True)


# ── Components ────────────────────────────────────────────────────────────────

@router.get("/components", response_model=ComponentsResponse, tags=["analytics"])
def components(
    limit:    int = Query(20, ge=1, le=100),
    order_by: str = Query("errors", description="errors|warnings|total"),
):
    """Component-level error and warning statistics."""
    if not ds._parquet_exists(settings.PARQUET_COMPONENTS):
        return ComponentsResponse(data=[], data_ready=False)
    rows = ds.get_component_stats(settings.PARQUET_COMPONENTS, limit=limit, order_by=order_by)
    return ComponentsResponse(
        data=[ComponentStat(**r) for r in rows],
        data_ready=True,
    )


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/events", response_model=EventsResponse, tags=["analytics"])
def events(
    level:   Optional[str] = Query(None, description="INFO|WARN|ERROR|FATAL"),
    is_rare: Optional[bool] = Query(None, description="Filter rare events only"),
    limit:   int = Query(50, ge=1, le=200),
):
    """Frequent and rare event patterns."""
    if not ds._parquet_exists(settings.PARQUET_EVENTS):
        return EventsResponse(data=[], data_ready=False)
    rows = ds.get_events(settings.PARQUET_EVENTS, level=level, is_rare=is_rare, limit=limit)
    return EventsResponse(
        data=[EventPattern(**r) for r in rows],
        data_ready=True,
    )


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=LogsResponse, tags=["logs"])
def logs(
    page:      int          = Query(1, ge=1),
    page_size: int          = Query(50, ge=1, le=10000),
    level:     Optional[str]= Query(None),
    component: Optional[str]= Query(None),
    search:    Optional[str]= Query(None, description="Search in content"),
    date_from: Optional[str]= Query(None),
    date_to:   Optional[str]= Query(None),
):
    """Paginated, filtered log records."""
    if not ds._parquet_exists(settings.PARQUET_LOGS):
        return LogsResponse(total=0, page=1, page_size=page_size, pages=0, records=[], data_ready=False)

    page_size = min(page_size, settings.MAX_PAGE_SIZE)
    result = ds.get_logs(
        settings.PARQUET_LOGS,
        page=page, page_size=page_size,
        level=level, component=component,
        search=search, date_from=date_from, date_to=date_to,
    )
    records = [LogRecord(**r) for r in result["records"]]
    return LogsResponse(
        total=result["total"], page=result["page"],
        page_size=result["page_size"], pages=result["pages"],
        records=records, data_ready=True,
    )


# ── Anomalies ─────────────────────────────────────────────────────────────────

@router.get("/anomalies", response_model=AnomaliesResponse, tags=["anomalies"])
def anomalies(
    page:         int           = Query(1, ge=1),
    page_size:    int           = Query(50, ge=1, le=500),
    anomaly_type: Optional[str] = Query(None, description="spike|block"),
    is_confirmed: Optional[bool]= Query(None, description="Filter by ground-truth confirmation"),
):
    """Detected anomalies: error spikes and anomalous blocks."""
    page_size = min(page_size, settings.MAX_PAGE_SIZE)
    result = ds.get_anomalies(
        settings.PARQUET_ANOMALY_SPIKES,
        settings.PARQUET_ANOMALY_RECORDS,
        page=page, page_size=page_size,
        anomaly_type=anomaly_type,
        is_confirmed=is_confirmed,
    )
    has_data = (
        ds._parquet_exists(settings.PARQUET_ANOMALY_SPIKES) or
        ds._parquet_exists(settings.PARQUET_ANOMALY_RECORDS)
    )
    records = [AnomalyRecord(**r) for r in result["records"]]
    return AnomaliesResponse(
        total=result["total"], page=result["page"],
        page_size=result["page_size"], pages=result["pages"],
        records=records, data_ready=has_data,
    )


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.get("/metrics", response_model=MetricsResponse, tags=["evaluation"])
def metrics():
    """Evaluation metrics (precision, recall, F1) when ground truth is available."""
    if not ds._parquet_exists(settings.PARQUET_METRICS):
        return MetricsResponse(data_ready=False)
    row = ds.get_metrics(settings.PARQUET_METRICS)
    if not row:
        return MetricsResponse(data_ready=False)
    return MetricsResponse(data_ready=True, **row)
