"""
Backend API tests against real generated sample Parquet outputs.

Run with: pytest backend/tests/test_api.py -v
"""
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

client = TestClient(app)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert "message" in data


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "parquet_logs_ready" in data


def test_summary():
    r = client.get("/api/summary")
    assert r.status_code == 200
    data = r.json()
    assert "data_ready" in data
    # If data is ready (sample generated), check fields
    if data["data_ready"]:
        assert "total_records" in data
        assert data["total_records"] > 0


def test_trends():
    r = client.get("/api/trends")
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert isinstance(data["data"], list)


def test_trends_with_date_filter():
    r = client.get("/api/trends?date_from=2008-11-09&date_to=2008-11-11")
    assert r.status_code == 200
    data = r.json()
    assert "data" in data


def test_components():
    r = client.get("/api/components")
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    if data["data_ready"]:
        assert len(data["data"]) > 0
        for comp in data["data"]:
            assert "component" in comp
            assert "errors" in comp


def test_components_order_by():
    r = client.get("/api/components?order_by=total&limit=5")
    assert r.status_code == 200
    data = r.json()
    assert "data" in data


def test_components_invalid_order():
    r = client.get("/api/components?order_by=invalid_field")
    # Should default to 'errors' and not crash
    assert r.status_code == 200


def test_events():
    r = client.get("/api/events")
    assert r.status_code == 200
    data = r.json()
    assert "data" in data


def test_events_filter_level():
    r = client.get("/api/events?level=INFO")
    assert r.status_code == 200


def test_events_rare():
    r = client.get("/api/events?is_rare=true")
    assert r.status_code == 200


def test_logs_pagination():
    r = client.get("/api/logs?page=1&page_size=10")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "records" in data
    assert isinstance(data["records"], list)
    if data["data_ready"]:
        assert len(data["records"]) <= 10


def test_logs_filter_level():
    r = client.get("/api/logs?level=ERROR&page_size=5")
    assert r.status_code == 200
    data = r.json()
    if data["data_ready"]:
        for rec in data["records"]:
            assert rec["level"] == "ERROR"


def test_logs_search():
    r = client.get("/api/logs?search=block&page_size=5")
    assert r.status_code == 200


def test_logs_page_size_limit():
    """page_size is accepted up to 10000; server caps result to MAX_PAGE_SIZE"""
    r = client.get("/api/logs?page_size=1000")
    assert r.status_code == 200
    data = r.json()
    # Server caps at MAX_PAGE_SIZE (500), actual records will be ≤ 500
    assert len(data["records"]) <= 500


def test_anomalies():
    r = client.get("/api/anomalies")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "records" in data


def test_anomalies_type_filter():
    r = client.get("/api/anomalies?anomaly_type=spike")
    assert r.status_code == 200
    r2 = client.get("/api/anomalies?anomaly_type=block")
    assert r2.status_code == 200


def test_anomalies_pagination():
    r = client.get("/api/anomalies?page=1&page_size=5")
    assert r.status_code == 200
    data = r.json()
    assert len(data["records"]) <= 5


def test_metrics():
    r = client.get("/api/metrics")
    assert r.status_code == 200
    data = r.json()
    assert "data_ready" in data
    # Without ground truth, should return data_ready=False (no crash)
    if not data["data_ready"]:
        assert data.get("precision") is None
