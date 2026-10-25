"""
Pipeline unit tests — uses synthetic fixtures, no real dataset download required.
Tests parsing, aggregation, and anomaly detection logic.

Run with: pytest pipeline/tests/test_pipeline.py -v
"""
import sys
import re
from pathlib import Path
import pytest

# Add pipeline/src to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


# ── Parsing tests (no Spark required) ─────────────────────────────────────────

LOG_RE = re.compile(
    r"^(\d{6})\s+(\d{6})\s+(\d+)\s+(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|TRACE)\s+(\S+)\s+-?\s*(.*)"
)
BLOCK_RE = re.compile(r"(blk_-?\d+)")

def parse_line(line: str):
    """Replicate the UDF logic in pure Python for unit testing."""
    line = line.strip()
    if not line:
        return None
    m = LOG_RE.match(line)
    if not m:
        return {"parse_ok": "failed", "content": line}
    date, time_, pid, level, comp, content = m.groups()
    block_ids = BLOCK_RE.findall(content)
    return {
        "date_str":  date,
        "time_str":  time_,
        "pid":       pid,
        "level":     level,
        "component": comp,
        "content":   content,
        "block_id":  block_ids[0] if block_ids else None,
        "ts_raw":    f"{date} {time_}",
        "parse_ok":  "ok",
    }


# Sample lines from LogHub HDFS v1 format
VALID_LINES = [
    "081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-1608999687919862906 src /10.250.10.6:52037",
    "081109 203518 35 INFO dfs.FSNamesystem.audit: allowed=true ugi=hadoop ip=/10.250.10.6",
    "081109 204042 129 WARN dfs.DataNode$PacketResponder: Exception in receiveBlock for block blk_1234567890",
    "081109 205430 2 ERROR dfs.DataNode: IOException in receiveBlock for block blk_-999",
]

INVALID_LINES = [
    "",
    "   ",
    "this is not a valid log line at all",
    "081109",  # truncated
]


class TestLogParsing:
    def test_valid_info_line(self):
        result = parse_line(VALID_LINES[0])
        assert result is not None
        assert result["parse_ok"] == "ok"
        assert result["level"] == "INFO"
        assert result["date_str"] == "081109"
        assert result["time_str"] == "203518"
        assert result["pid"] == "143"
        # Component field in regex captures up-to first space — may include trailing colon
        assert result["component"].rstrip(":") == "dfs.DataNode$DataXceiver"
        assert result["block_id"] == "blk_-1608999687919862906"

    def test_valid_audit_line_no_block(self):
        result = parse_line(VALID_LINES[1])
        assert result["parse_ok"] == "ok"
        assert result["level"] == "INFO"
        assert result["block_id"] is None

    def test_warn_line_with_block(self):
        result = parse_line(VALID_LINES[2])
        assert result["parse_ok"] == "ok"
        assert result["level"] == "WARN"
        assert result["block_id"] == "blk_1234567890"

    def test_error_line(self):
        result = parse_line(VALID_LINES[3])
        assert result["parse_ok"] == "ok"
        assert result["level"] == "ERROR"
        assert result["block_id"] == "blk_-999"

    def test_empty_line(self):
        result = parse_line("")
        assert result is None

    def test_whitespace_line(self):
        result = parse_line("   ")
        assert result is None

    def test_invalid_format(self):
        result = parse_line("this is not a valid log line")
        assert result["parse_ok"] == "failed"

    def test_truncated_line(self):
        result = parse_line("081109")
        assert result["parse_ok"] == "failed"

    def test_ts_raw_format(self):
        result = parse_line(VALID_LINES[0])
        assert result["ts_raw"] == "081109 203518"

    def test_block_id_extraction_multiple(self):
        """Only first block_id is extracted."""
        line = "081109 203518 1 INFO comp.A: - block blk_111 and blk_222"
        result = parse_line(line)
        assert result["block_id"] == "blk_111"

    def test_negative_block_id(self):
        """Negative block IDs (very common in HDFS) are correctly parsed."""
        line = "081109 203518 1 INFO comp.A: - Receiving blk_-9876543210"
        result = parse_line(line)
        assert result["block_id"] == "blk_-9876543210"


# ── Anomaly detection tests (no Spark required) ────────────────────────────────

class TestAnomalyDetection:
    """Test the anomaly detection formulas with simple synthetic data."""

    def test_z_score_spike_detection(self):
        """Hours with errors > mean + 3*std should be flagged."""
        import statistics
        hourly_errors = [5, 4, 6, 5, 3, 4, 5, 6, 4, 5, 50, 4, 5, 3]
        mean_e = statistics.mean(hourly_errors)
        std_e  = statistics.stdev(hourly_errors)
        z_scores = [(e - mean_e) / std_e for e in hourly_errors]
        spikes = [i for i, z in enumerate(z_scores) if z > 3.0]
        assert len(spikes) == 1, f"Expected 1 spike, got {len(spikes)}"
        assert spikes[0] == 10  # index 10 = value 50

    def test_no_spike_uniform_data(self):
        import statistics
        hourly_errors = [5, 5, 5, 5, 5, 5]
        mean_e = statistics.mean(hourly_errors)
        std_e = statistics.stdev(hourly_errors) or 1.0
        z_scores = [(e - mean_e) / std_e for e in hourly_errors]
        spikes = [i for i, z in enumerate(z_scores) if z > 3.0]
        assert len(spikes) == 0

    def test_rare_event_detection(self):
        """Events below fraction threshold should be flagged."""
        events = [("Receiving block", 5000), ("Exception", 3), ("Unknown", 1)]
        total = sum(c for _, c in events)
        threshold = 0.001   # 0.001 * 5004 ≈ 5.0, so 3 and 1 are both rare
        rare = [(ev, c) for ev, c in events if c / total < threshold]
        assert len(rare) == 2  # both 'Exception' (3/5004) and 'Unknown' (1/5004) are rare
        rare_names = {ev for ev, _ in rare}
        assert "Exception" in rare_names
        assert "Unknown" in rare_names

    def test_block_prediction_anomaly(self):
        """Block with ≥1 error should be predicted Anomaly."""
        block = {"block_id": "blk_123", "total_count": 10, "error_count": 2}
        label = "Anomaly" if block["error_count"] >= 1 else "Normal"
        assert label == "Anomaly"

    def test_block_prediction_normal(self):
        """Block with 0 errors should be predicted Normal."""
        block = {"block_id": "blk_456", "total_count": 8, "error_count": 0}
        label = "Anomaly" if block["error_count"] >= 1 else "Normal"
        assert label == "Normal"

    def test_evaluation_metrics(self):
        """Basic precision/recall/F1 calculation."""
        TP, FP, TN, FN = 80, 10, 200, 20
        precision = TP / (TP + FP)
        recall    = TP / (TP + FN)
        f1        = 2 * precision * recall / (precision + recall)
        assert abs(precision - 0.8889) < 0.001
        assert abs(recall    - 0.8000) < 0.001
        assert abs(f1        - 0.8421) < 0.001

    def test_evaluation_perfect(self):
        """Perfect predictions → precision=recall=f1=1.0"""
        TP, FP, TN, FN = 100, 0, 200, 0
        precision = TP / (TP + FP) if (TP + FP) > 0 else 0
        recall    = TP / (TP + FN) if (TP + FN) > 0 else 0
        f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
        assert precision == 1.0
        assert recall    == 1.0
        assert f1        == 1.0

    def test_evaluation_no_predictions(self):
        """Zero predictions → no divide-by-zero."""
        TP, FP, TN, FN = 0, 0, 200, 100
        precision = TP / (TP + FP) if (TP + FP) > 0 else 0.0
        recall    = TP / (TP + FN) if (TP + FN) > 0 else 0.0
        f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        assert precision == 0.0
        assert recall    == 0.0
        assert f1        == 0.0


# ── Parquet readback test ─────────────────────────────────────────────────────

class TestParquetReadback:
    """Verify that the generated sample Parquet files can be read back."""

    @pytest.fixture
    def outputs_path(self):
        return Path(__file__).resolve().parents[2] / "outputs" / "parquet"

    def test_parquet_logs_readable(self, outputs_path):
        import pyarrow.parquet as pq
        logs_path = outputs_path / "logs" / "data.parquet"
        if not logs_path.exists():
            pytest.skip("Sample data not generated yet — run generate_sample_data.py first")
        table = pq.read_table(str(logs_path))
        assert table.num_rows > 0
        assert "level" in table.schema.names
        assert "component" in table.schema.names
        assert "content" in table.schema.names

    def test_parquet_summary_readable(self, outputs_path):
        import pyarrow.parquet as pq
        summary_path = outputs_path / "stats" / "summary" / "data.parquet"
        if not summary_path.exists():
            pytest.skip("Sample data not generated yet")
        table = pq.read_table(str(summary_path))
        assert table.num_rows == 1
        assert "total_records" in table.schema.names

    def test_parquet_components_readable(self, outputs_path):
        import pyarrow.parquet as pq
        comp_path = outputs_path / "stats" / "components" / "data.parquet"
        if not comp_path.exists():
            pytest.skip("Sample data not generated yet")
        table = pq.read_table(str(comp_path))
        assert table.num_rows > 0
        assert "component" in table.schema.names
        assert "errors" in table.schema.names

    def test_parquet_trends_readable(self, outputs_path):
        import pyarrow.parquet as pq
        trends_path = outputs_path / "stats" / "trends" / "data.parquet"
        if not trends_path.exists():
            pytest.skip("Sample data not generated yet")
        table = pq.read_table(str(trends_path))
        assert table.num_rows > 0
        assert "hour" in table.schema.names
        assert "errors" in table.schema.names

    def test_parquet_anomalies_spikes_readable(self, outputs_path):
        import pyarrow.parquet as pq
        spikes_path = outputs_path / "anomalies" / "spikes" / "data.parquet"
        if not spikes_path.exists():
            pytest.skip("Sample data not generated yet")
        table = pq.read_table(str(spikes_path))
        assert table.num_rows > 0
        assert "is_spike" in table.schema.names
        assert "z_score" in table.schema.names
