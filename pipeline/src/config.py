"""
Pipeline configuration — reads from environment variables with sensible defaults.
Copy .env.example to .env and adjust before running.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (two levels up from pipeline/src/)
_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_ROOT / ".env", override=False)


class Config:
    # ── HDFS ──────────────────────────────────────────────────────────────────
    HADOOP_HOME: str = os.getenv("HADOOP_HOME", "/usr/local/hadoop")
    JAVA_HOME: str = os.getenv("JAVA_HOME", "/usr/lib/jvm/java-8-openjdk-amd64")
    HDFS_NAMENODE: str = os.getenv("HDFS_NAMENODE", "hdfs://localhost:9000")
    HDFS_LOG_PATH: str = os.getenv("HDFS_LOG_PATH", "/user/hadoop/logs/hdfs_logs")

    # ── Spark ─────────────────────────────────────────────────────────────────
    SPARK_MASTER: str = os.getenv("SPARK_MASTER", "local[*]")
    SPARK_DRIVER_MEMORY: str = os.getenv("SPARK_DRIVER_MEMORY", "2g")
    SPARK_EXECUTOR_MEMORY: str = os.getenv("SPARK_EXECUTOR_MEMORY", "2g")

    # ── Data source ───────────────────────────────────────────────────────────
    RAW_LOG_URL: str = os.getenv(
        "RAW_LOG_URL",
        "https://zenodo.org/records/8196385/files/HDFS_v1.zip",
    )
    LOCAL_DATA_DIR: Path = Path(os.getenv("LOCAL_DATA_DIR", str(_ROOT / "data" / "raw")))

    # ── Output paths ──────────────────────────────────────────────────────────
    OUTPUT_DIR: Path = Path(os.getenv("OUTPUT_DIR", str(_ROOT / "outputs")))
    PARQUET_LOGS: Path = Path(os.getenv("PARQUET_LOGS", str(_ROOT / "outputs" / "parquet" / "logs")))
    PARQUET_STATS: Path = Path(os.getenv("PARQUET_STATS", str(_ROOT / "outputs" / "parquet" / "stats")))
    PARQUET_ANOMALIES: Path = Path(os.getenv("PARQUET_ANOMALIES", str(_ROOT / "outputs" / "parquet" / "anomalies")))
    PARQUET_METRICS: Path = Path(os.getenv("PARQUET_METRICS", str(_ROOT / "outputs" / "parquet" / "metrics")))

    # ── Processing options ────────────────────────────────────────────────────
    SAMPLE_MODE: bool = os.getenv("SAMPLE_MODE", "true").lower() == "true"
    SAMPLE_SIZE: int = int(os.getenv("SAMPLE_SIZE", "50000"))

    # ── AWS (optional) ────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_DEFAULT_REGION: str = os.getenv("AWS_DEFAULT_REGION", "ap-south-1")
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "")
    S3_RAW_PREFIX: str = os.getenv("S3_RAW_PREFIX", "raw/")
    S3_OUTPUT_PREFIX: str = os.getenv("S3_OUTPUT_PREFIX", "outputs/")

    @property
    def aws_configured(self) -> bool:
        return bool(self.AWS_ACCESS_KEY_ID and self.AWS_SECRET_ACCESS_KEY and self.S3_BUCKET_NAME)

    # Anomaly detection thresholds
    ERROR_SPIKE_THRESHOLD: float = float(os.getenv("ERROR_SPIKE_THRESHOLD", "3.0"))   # z-score
    RARE_EVENT_THRESHOLD: float = float(os.getenv("RARE_EVENT_THRESHOLD", "0.001"))   # fraction of total


cfg = Config()
