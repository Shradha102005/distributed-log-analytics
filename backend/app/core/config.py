"""
Backend configuration — reads from environment variables or .env file.

GCS mode: set GCS_BUCKET=your-bucket-name in .env or environment.
          Optionally set GCS_PARQUET_PREFIX (default: parquet).
          When set, all data is read from gs://<bucket>/<prefix>/...
          Leave unset for local file-based mode (development).
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Find project root and load .env
_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_ROOT / ".env", override=False)


class Settings:
    # ── API ────────────────────────────────────────────────────────────────
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    CORS_ORIGINS: list = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
    ).split(",")

    # ── GCS ────────────────────────────────────────────────────────────────
    # Set GCS_BUCKET to enable cloud mode, e.g. "my-log-analytics-bucket"
    GCS_BUCKET: str = os.getenv("GCS_BUCKET", "")
    GCS_PARQUET_PREFIX: str = os.getenv("GCS_PARQUET_PREFIX", "parquet")
    # Path to GCP service account JSON key (optional if using ADC / Cloud Run)
    GCS_KEY_FILE: str = os.getenv("GCS_KEY_FILE", "")

    @property
    def use_gcs(self) -> bool:
        return bool(self.GCS_BUCKET)

    def gcs_path(self, *parts: str) -> str:
        """Build a gs:// URI for a parquet sub-path."""
        sub = "/".join(parts)
        return f"gs://{self.GCS_BUCKET}/{self.GCS_PARQUET_PREFIX}/{sub}"

    # ── Local Parquet paths (used when GCS_BUCKET is not set) ─────────────
    _PROJECT_OUTPUTS = _ROOT / "outputs"
    _BASE = _PROJECT_OUTPUTS

    def local_path(self, *parts: str) -> Path:
        return self._BASE / "parquet" / Path(*parts)

    # ── Resolved paths (local Path or gs:// string) ───────────────────────
    @property
    def PARQUET_LOGS(self):
        return self.gcs_path("logs") if self.use_gcs else self.local_path("logs")

    @property
    def PARQUET_STATS(self):
        return self.gcs_path("stats") if self.use_gcs else self.local_path("stats")

    @property
    def PARQUET_ANOMALIES(self):
        return self.gcs_path("anomalies") if self.use_gcs else self.local_path("anomalies")

    @property
    def PARQUET_METRICS(self):
        return self.gcs_path("metrics") if self.use_gcs else self.local_path("metrics")

    # ── Derived sub-paths ─────────────────────────────────────────────────
    @property
    def PARQUET_SUMMARY(self):
        return self.gcs_path("stats/summary") if self.use_gcs else self.local_path("stats", "summary")

    @property
    def PARQUET_COMPONENTS(self):
        return self.gcs_path("stats/components") if self.use_gcs else self.local_path("stats", "components")

    @property
    def PARQUET_TRENDS(self):
        return self.gcs_path("stats/trends") if self.use_gcs else self.local_path("stats", "trends")

    @property
    def PARQUET_EVENTS(self):
        return self.gcs_path("stats/events") if self.use_gcs else self.local_path("stats", "events")

    @property
    def PARQUET_ANOMALY_SPIKES(self):
        return self.gcs_path("anomalies/spikes") if self.use_gcs else self.local_path("anomalies", "spikes")

    @property
    def PARQUET_ANOMALY_RECORDS(self):
        return self.gcs_path("anomalies/block_predictions") if self.use_gcs else self.local_path("anomalies", "block_predictions")

    # ── Pagination ─────────────────────────────────────────────────────────
    MAX_PAGE_SIZE: int = int(os.getenv("MAX_PAGE_SIZE", "500"))
    DEFAULT_PAGE_SIZE: int = int(os.getenv("DEFAULT_PAGE_SIZE", "50"))


settings = Settings()
