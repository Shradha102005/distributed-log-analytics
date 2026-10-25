"""
Anomaly detection for LogHub HDFS v1 logs.

Strategy (baseline, explainable):
  1. Error-spike detection — z-score on hourly error rate.
     An hour with z-score > threshold is flagged as a spike.
  2. Rare event detection — events appearing in < threshold fraction of all logs
     are flagged as rare / unusual.
  3. Block-level anomaly labelling — if the ground-truth anomaly_label.csv is
     available, each parsed record is annotated with its ground-truth label.

Evaluation (when ground truth available):
  - Ground truth is at BLOCK level (BlockId → Normal/Anomaly).
  - We can evaluate block-level predictions vs ground truth.
  - Record-level evaluation is NOT valid because a single ANOMALY block
    can contain mostly INFO messages; treating all records in that block as
    anomalous would give misleading metrics.
  - We therefore produce BLOCK-level precision/recall/F1.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Optional

from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, LongType, IntegerType
)
from pyspark.sql.window import Window

logger = logging.getLogger(__name__)


# ── 1. Error-spike detection ──────────────────────────────────────────────────

def detect_error_spikes(
    trends_df: DataFrame,
    z_threshold: float = 3.0,
) -> DataFrame:
    """
    Flag time windows (date + hour) where the error count is statistically
    unusual (z-score above threshold across all observed windows).

    Input columns: date_parsed, hour, total, errors, warnings
    Returns augmented DataFrame with columns: mean_errors, std_errors,
      z_score, is_spike (boolean-as-string "true"/"false").
    """
    # Compute global mean and std of hourly error counts
    stats = trends_df.agg(
        F.mean("errors").alias("mean_errors"),
        F.stddev("errors").alias("std_errors"),
    ).first()

    mean_e = stats["mean_errors"] or 0.0
    std_e  = stats["std_errors"]  or 1.0   # avoid div-by-zero

    result = trends_df.withColumn(
        "mean_errors", F.lit(mean_e)
    ).withColumn(
        "std_errors", F.lit(std_e)
    ).withColumn(
        "z_score",
        F.round((F.col("errors") - F.lit(mean_e)) / F.lit(std_e), 4)
    ).withColumn(
        "is_spike",
        F.when(F.col("z_score") > z_threshold, F.lit("true")).otherwise(F.lit("false"))
    )
    return result


# ── 2. Rare event detection ───────────────────────────────────────────────────

def detect_rare_events(
    events_df: DataFrame,
    threshold_fraction: float = 0.001,
) -> DataFrame:
    """
    Flag event patterns that appear in < threshold_fraction of all log records.

    Input: event_pattern, level, count
    Returns augmented with: fraction, is_rare
    """
    total_events = events_df.agg(F.sum("count")).first()[0] or 1
    result = events_df.withColumn(
        "total_events", F.lit(total_events)
    ).withColumn(
        "fraction",
        F.round(F.col("count") / F.lit(total_events), 6)
    ).withColumn(
        "is_rare",
        F.when(F.col("fraction") < threshold_fraction, F.lit("true")).otherwise(F.lit("false"))
    )
    return result


# ── 3. Block-level anomaly annotation ────────────────────────────────────────

def load_ground_truth(spark: SparkSession, label_csv_path: str) -> Optional[DataFrame]:
    """
    Load the anomaly_label.csv ground-truth file.

    Expected columns: BlockId, Label  (Label is "Normal" or "Anomaly")
    Returns None if the file does not exist.
    """
    try:
        gt = spark.read.csv(label_csv_path, header=True, inferSchema=False)
        # Normalise column names
        if "BlockId" in gt.columns and "Label" in gt.columns:
            gt = gt.select(
                F.col("BlockId").alias("block_id"),
                F.col("Label").alias("gt_label"),
            )
        else:
            logger.warning("anomaly_label.csv has unexpected columns: %s", gt.columns)
            return None
        count = gt.count()
        logger.info("Ground truth loaded: %d blocks", count)
        return gt
    except Exception as exc:
        logger.warning("Could not load ground truth: %s", exc)
        return None


def annotate_with_ground_truth(logs_df: DataFrame, gt_df: DataFrame) -> DataFrame:
    """
    Left-join parsed logs with ground truth on block_id.
    Adds 'gt_label' column ("Normal", "Anomaly", or null if no block_id).
    """
    return logs_df.join(gt_df, on="block_id", how="left")


# ── 4. Block-level prediction + evaluation ────────────────────────────────────

def predict_block_anomalies(
    logs_df: DataFrame,
    error_threshold: int = 1,
) -> DataFrame:
    """
    Predict whether each BLOCK is anomalous based on whether it contains
    any ERROR or FATAL log records.

    Returns a DataFrame with: block_id, error_count, total_count, predicted_label
    """
    block_stats = (
        logs_df.filter(F.col("block_id").isNotNull())
        .groupBy("block_id")
        .agg(
            F.count("*").alias("total_count"),
            F.sum(F.when(F.col("level").isin("ERROR", "FATAL"), 1).otherwise(0)).alias("error_count"),
        )
    )
    block_predictions = block_stats.withColumn(
        "predicted_label",
        F.when(F.col("error_count") >= error_threshold, "Anomaly").otherwise("Normal")
    )
    return block_predictions


def evaluate_block_predictions(
    predictions_df: DataFrame,
    gt_df: DataFrame,
) -> dict:
    """
    Compare block-level predictions against ground truth.

    Returns a dict with: TP, FP, TN, FN, precision, recall, f1, accuracy,
      total_blocks, anomaly_blocks, normal_blocks.

    IMPORTANT: This is BLOCK-level evaluation, not record-level.
    The ground truth labels blocks, not individual log lines.
    """
    joined = predictions_df.join(gt_df, on="block_id", how="inner")

    # True/false positives/negatives
    tp = joined.filter((F.col("predicted_label") == "Anomaly") & (F.col("gt_label") == "Anomaly")).count()
    fp = joined.filter((F.col("predicted_label") == "Anomaly") & (F.col("gt_label") == "Normal")).count()
    tn = joined.filter((F.col("predicted_label") == "Normal")  & (F.col("gt_label") == "Normal")).count()
    fn = joined.filter((F.col("predicted_label") == "Normal")  & (F.col("gt_label") == "Anomaly")).count()

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy  = (tp + tn) / (tp + fp + tn + fn) if (tp + fp + tn + fn) > 0 else 0.0

    total_gt_anomalies = gt_df.filter(F.col("gt_label") == "Anomaly").count()
    total_gt_normal    = gt_df.filter(F.col("gt_label") == "Normal").count()

    return {
        "evaluation_level": "block",
        "note": (
            "Evaluation is at BLOCK level. Record-level evaluation is not valid "
            "because ground truth labels are per-block (BlockId), not per log line."
        ),
        "TP": tp, "FP": fp, "TN": tn, "FN": fn,
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1_score":  round(f1, 4),
        "accuracy":  round(accuracy, 4),
        "evaluated_blocks":   tp + fp + tn + fn,
        "gt_anomaly_blocks":  total_gt_anomalies,
        "gt_normal_blocks":   total_gt_normal,
    }


# ── 5. Full anomaly pipeline ──────────────────────────────────────────────────

def run_anomaly_pipeline(
    spark: SparkSession,
    logs_parquet: str,
    trends_parquet: str,
    events_parquet: str,
    output_base: str,
    label_csv_path: Optional[str] = None,
    z_threshold: float = 3.0,
    rare_threshold: float = 0.001,
) -> dict:
    """
    Orchestrates the full anomaly detection and evaluation pipeline.
    Writes results to Parquet and returns a summary dict.
    """
    t0 = time.time()
    logger.info("=== Anomaly pipeline start ===")

    try:
        from .processor import write_parquet
    except ImportError:
        from processor import write_parquet

    def _to_uri(p: str) -> str:
        if not (p.startswith("file://") or p.startswith("hdfs://") or p.startswith("s3a://")):
            s = str(p).replace("\\", "/")
            if not s.startswith("/"):
                s = "/" + s
            return f"file://{s}"
        return p

    # Load pre-computed Parquet data
    logs_df   = spark.read.parquet(_to_uri(logs_parquet))
    trends_df = spark.read.parquet(_to_uri(trends_parquet))
    events_df = spark.read.parquet(_to_uri(events_parquet))

    # 1. Error spikes
    spikes_df = detect_error_spikes(trends_df, z_threshold=z_threshold)
    write_parquet(spikes_df, f"{output_base}/anomalies/spikes")
    spike_count = spikes_df.filter(F.col("is_spike") == "true").count()

    # 2. Rare events
    rare_df = detect_rare_events(events_df, threshold_fraction=rare_threshold)
    write_parquet(rare_df, f"{output_base}/anomalies/rare_events")
    rare_count = rare_df.filter(F.col("is_rare") == "true").count()

    # 3. Block predictions
    block_preds = predict_block_anomalies(logs_df)
    write_parquet(block_preds, f"{output_base}/anomalies/block_predictions")
    pred_anomaly_count = block_preds.filter(F.col("predicted_label") == "Anomaly").count()

    # 4. Evaluation (if ground truth exists)
    metrics = None
    if label_csv_path:
        gt_df = load_ground_truth(spark, label_csv_path)
        if gt_df is not None:
            # Annotate logs and save
            annotated = annotate_with_ground_truth(logs_df, gt_df)
            write_parquet(annotated, f"{output_base}/anomalies/annotated_logs")

            # Evaluate block predictions
            metrics = evaluate_block_predictions(block_preds, gt_df)
            logger.info("Evaluation metrics: %s", metrics)

            # Save metrics as single-row Parquet
            metrics_df = spark.createDataFrame([metrics])
            write_parquet(metrics_df, f"{output_base}/metrics")

    elapsed = time.time() - t0
    result = {
        "elapsed_seconds":        round(elapsed, 2),
        "error_spike_windows":    spike_count,
        "rare_event_patterns":    rare_count,
        "predicted_anomaly_blocks": pred_anomaly_count,
        "evaluation":             metrics,
    }
    logger.info("=== Anomaly pipeline complete in %.1fs ===", elapsed)
    return result
