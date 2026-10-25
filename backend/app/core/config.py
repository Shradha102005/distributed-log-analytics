"""
Backend configuration — reads from environment variables or .env file.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Find project root and load .env
_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_ROOT / ".env", override=False)


class Settings:
    # API
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    CORS_ORIGINS: list = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
    ).split(",")

    # Check parent workspace outputs (e.g. D:\BDA_CC\outputs) or project outputs
    _WORKSPACE_OUTPUTS = Path(__file__).resolve().parents[4] / "outputs"
    _PROJECT_OUTPUTS = _ROOT / "outputs"
    _BASE = _WORKSPACE_OUTPUTS if (_WORKSPACE_OUTPUTS / "parquet").exists() else _PROJECT_OUTPUTS
    PARQUET_LOGS:      Path = Path(os.getenv("PARQUET_LOGS",      str(_BASE / "parquet" / "logs")))
    PARQUET_STATS:     Path = Path(os.getenv("PARQUET_STATS",     str(_BASE / "parquet" / "stats")))
    @property
    def PARQUET_ANOMALIES(self) -> Path:
        custom = os.getenv("PARQUET_ANOMALIES")
        if custom:
            return Path(custom)
        p1 = self._BASE / "parquet" / "anomalies"
        return p1 if p1.exists() else (self._BASE / "anomalies")

    @property
    def PARQUET_METRICS(self) -> Path:
        custom = os.getenv("PARQUET_METRICS")
        if custom:
            return Path(custom)
        p1 = self._BASE / "parquet" / "metrics"
        return p1 if p1.exists() else (self._BASE / "metrics")

    # Derived Parquet sub-paths
    @property
    def PARQUET_SUMMARY(self) -> Path:
        return self.PARQUET_STATS / "summary"

    @property
    def PARQUET_COMPONENTS(self) -> Path:
        return self.PARQUET_STATS / "components"

    @property
    def PARQUET_TRENDS(self) -> Path:
        return self.PARQUET_STATS / "trends"

    @property
    def PARQUET_EVENTS(self) -> Path:
        return self.PARQUET_STATS / "events"

    @property
    def PARQUET_ANOMALY_SPIKES(self) -> Path:
        return self.PARQUET_ANOMALIES / "spikes"

    @property
    def PARQUET_ANOMALY_RECORDS(self) -> Path:
        return self.PARQUET_ANOMALIES / "block_predictions"

    # Pagination
    MAX_PAGE_SIZE: int = int(os.getenv("MAX_PAGE_SIZE", "500"))
    DEFAULT_PAGE_SIZE: int = int(os.getenv("DEFAULT_PAGE_SIZE", "50"))


settings = Settings()
