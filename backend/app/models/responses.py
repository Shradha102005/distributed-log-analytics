"""
Pydantic response models for the API.
"""
from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    parquet_logs_ready:      bool
    parquet_stats_ready:     bool
    parquet_anomalies_ready: bool
    parquet_metrics_ready:   bool


class SummaryResponse(BaseModel):
    total_records:   Optional[int] = None
    parsed_ok:       Optional[int] = None
    parse_failed:    Optional[int] = None
    info_count:      Optional[int] = None
    warn_count:      Optional[int] = None
    error_count:     Optional[int] = None
    fatal_count:     Optional[int] = None
    data_ready:      bool = False


class TrendPoint(BaseModel):
    date_parsed:  Optional[str] = None
    hour:         Optional[int] = None
    total:        int = 0
    errors:       int = 0
    warnings:     int = 0


class TrendsResponse(BaseModel):
    data:       list[TrendPoint]
    data_ready: bool


class ComponentStat(BaseModel):
    component: str
    total:     int = 0
    errors:    int = 0
    warnings:  int = 0
    infos:     int = 0


class ComponentsResponse(BaseModel):
    data:       list[ComponentStat]
    data_ready: bool


class EventPattern(BaseModel):
    event_pattern: str
    level:         str
    count:         int = 0
    fraction:      Optional[float] = None
    is_rare:       Optional[str]   = None


class EventsResponse(BaseModel):
    data:       list[EventPattern]
    data_ready: bool


class LogRecord(BaseModel):
    date_str:   Optional[str] = None
    time_str:   Optional[str] = None
    pid:        Optional[str] = None
    level:      Optional[str] = None
    component:  Optional[str] = None
    content:    Optional[str] = None
    block_id:   Optional[str] = None
    ts_raw:     Optional[str] = None


class LogsResponse(BaseModel):
    total:     int
    page:      int
    page_size: int
    pages:     int
    records:   list[LogRecord]
    data_ready: bool


class AnomalyRecord(BaseModel):
    anomaly_type:    Optional[str]  = None
    # Spike fields
    date_parsed:     Optional[str]  = None
    hour:            Optional[int]  = None
    errors:          Optional[int]  = None
    z_score:         Optional[float]= None
    is_spike:        Optional[str]  = None
    # Block fields
    block_id:        Optional[str]  = None
    error_count:     Optional[int]  = None
    total_count:     Optional[int]  = None
    predicted_label: Optional[str]  = None
    gt_label:        Optional[str]  = None


class AnomaliesResponse(BaseModel):
    total:     int
    page:      int
    page_size: int
    pages:     int
    records:   list[AnomalyRecord]
    data_ready: bool


class MetricsResponse(BaseModel):
    data_ready:        bool = False
    evaluation_level:  Optional[str]   = None
    note:              Optional[str]   = None
    TP:                Optional[int]   = None
    FP:                Optional[int]   = None
    TN:                Optional[int]   = None
    FN:                Optional[int]   = None
    precision:         Optional[float] = None
    recall:            Optional[float] = None
    f1_score:          Optional[float] = None
    accuracy:          Optional[float] = None
    evaluated_blocks:  Optional[int]   = None
    gt_anomaly_blocks: Optional[int]   = None
    gt_normal_blocks:  Optional[int]   = None
