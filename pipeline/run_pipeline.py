#!/usr/bin/env python3
"""
Main pipeline runner script.

Usage:
  # Sample run (50k lines) — fast, good for development
  python run_pipeline.py --sample

  # Full dataset run
  python run_pipeline.py --full

  # Skip download (dataset already present)
  python run_pipeline.py --sample --no-download

  # Use HDFS input instead of local file
  python run_pipeline.py --full --use-hdfs

Options:
  --sample          Process only SAMPLE_SIZE lines (default: True)
  --full            Process all lines
  --no-download     Skip download step
  --use-hdfs        Read from HDFS after uploading
  --sample-size N   Override SAMPLE_SIZE env var
  --output DIR      Override OUTPUT_DIR env var
"""

import argparse
import logging
import sys
import time
from pathlib import Path

# Add pipeline/src to path
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE / "src"))

from config import cfg
import ingestion
import processor
import anomaly

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("run_pipeline")


def _to_spark_uri(p) -> str:
    s = str(p).replace("\\", "/")
    if not s.startswith("/"):
        s = "/" + s
    return f"file://{s}"


def parse_args():
    p = argparse.ArgumentParser(description="Log Analytics Pipeline")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--sample", action="store_true", default=True,
                      help="Process only first SAMPLE_SIZE lines (default)")
    mode.add_argument("--full",   action="store_true", default=False,
                      help="Process all lines")
    p.add_argument("--no-download", action="store_true",
                   help="Skip download (assume data already present)")
    p.add_argument("--use-hdfs", action="store_true",
                   help="Upload to HDFS and read from there")
    p.add_argument("--sample-size", type=int, default=None,
                   help="Override SAMPLE_SIZE")
    p.add_argument("--output", type=str, default=None,
                   help="Override output base directory")
    p.add_argument("--skip-anomaly", action="store_true",
                   help="Skip anomaly detection step")
    return p.parse_args()


def main():
    args = parse_args()
    t_start = time.time()

    sample_mode = not args.full
    sample_size = args.sample_size or cfg.SAMPLE_SIZE
    output_base = str(Path(args.output) if args.output else cfg.OUTPUT_DIR / "parquet")
    local_data_dir = cfg.LOCAL_DATA_DIR

    logger.info("╔══════════════════════════════════════════════════════╗")
    logger.info("║   Distributed Log Analytics Pipeline                 ║")
    logger.info("╚══════════════════════════════════════════════════════╝")
    logger.info("Mode:        %s", "SAMPLE" if sample_mode else "FULL")
    logger.info("Sample size: %s", sample_size if sample_mode else "N/A")
    logger.info("Output:      %s", output_base)
    logger.info("HDFS:        %s", "yes" if args.use_hdfs else "no (local file://)")

    # ── Stage 1: Data ingestion ───────────────────────────────────────────────
    logger.info("── Stage 1: Data ingestion ──")
    dataset = ingestion.ensure_dataset(
        local_dir=local_data_dir,
        url=cfg.RAW_LOG_URL,
        sample_mode=sample_mode,
        sample_size=sample_size,
        force_download=False,
    )
    log_path    = dataset["log_path"]
    label_path  = dataset["label_path"]
    total_lines = dataset["total_lines"]

    logger.info("Log file:  %s", log_path)
    logger.info("Label CSV: %s", label_path)
    logger.info("Total lines in full dataset: %d", total_lines)

    # ── Stage 2: Optionally upload to HDFS ───────────────────────────────────
    spark_input_path = _to_spark_uri(log_path)

    if args.use_hdfs:
        logger.info("── Stage 2a: Upload to HDFS ──")
        hdfs_log_path = f"{cfg.HDFS_NAMENODE}{cfg.HDFS_LOG_PATH}/{'sample' if sample_mode else 'full'}/HDFS.log"
        ok = ingestion.upload_to_hdfs(
            local_path=log_path,
            hdfs_path=hdfs_log_path,
            hadoop_bin=f"{cfg.HADOOP_HOME}/bin/hdfs",
            overwrite=False,
        )
        if ok:
            spark_input_path = hdfs_log_path
            logger.info("Spark will read from HDFS: %s", spark_input_path)
        else:
            logger.warning("HDFS upload failed — falling back to local file")

    # ── Stage 3: Spark processing ─────────────────────────────────────────────
    logger.info("── Stage 3: Spark processing ──")
    spark = processor.create_spark_session(
        app_name="LogAnalytics-Pipeline",
        master=cfg.SPARK_MASTER,
        driver_memory=cfg.SPARK_DRIVER_MEMORY,
        executor_memory=cfg.SPARK_EXECUTOR_MEMORY,
        hadoop_home=cfg.HADOOP_HOME,
        java_home=cfg.JAVA_HOME,
    )

    pipeline_result = processor.run_pipeline(
        spark=spark,
        input_path=spark_input_path,
        output_base=output_base,
        sample_mode=sample_mode,
    )
    logger.info("Pipeline result: %s", pipeline_result)

    # ── Stage 4: Anomaly detection ────────────────────────────────────────────
    if not args.skip_anomaly:
        logger.info("── Stage 4: Anomaly detection ──")
        label_csv_spark_path = None
        if label_path:
            label_csv_spark_path = _to_spark_uri(label_path)

        anomaly_result = anomaly.run_anomaly_pipeline(
            spark=spark,
            logs_parquet=f"{output_base}/logs",
            trends_parquet=f"{output_base}/stats/trends",
            events_parquet=f"{output_base}/stats/events",
            output_base=str(cfg.OUTPUT_DIR),
            label_csv_path=label_csv_spark_path,
            z_threshold=cfg.ERROR_SPIKE_THRESHOLD,
            rare_threshold=cfg.RARE_EVENT_THRESHOLD,
        )
        logger.info("Anomaly result: %s", anomaly_result)

    spark.stop()

    elapsed = time.time() - t_start
    logger.info("═" * 56)
    logger.info("✓ Full pipeline complete in %.1f seconds", elapsed)
    logger.info("  Records processed : %d", pipeline_result["total_records"])
    logger.info("  Parsed OK         : %d", pipeline_result["parsed_ok"])
    logger.info("  Parse failed      : %d", pipeline_result["parse_failed"])
    logger.info("  Errors            : %d", pipeline_result["error_count"])
    logger.info("  Warnings          : %d", pipeline_result["warn_count"])
    logger.info("  Output directory  : %s", output_base)
    logger.info("═" * 56)


if __name__ == "__main__":
    main()
