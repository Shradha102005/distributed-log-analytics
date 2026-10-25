"""
PySpark processing pipeline for LogHub HDFS v1 logs.

LogHub HDFS v1 raw format (whitespace-separated):
    Date Time PID Level Component - Content
    081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-1608999687919862906

This module:
  1. Reads raw log lines from HDFS (or local file://)
  2. Parses and normalises each record
  3. Extracts block IDs, components, log levels, timestamps
  4. Computes aggregated statistics (level counts, component stats, time trends)
  5. Writes cleaned logs + aggregations as Parquet
"""

from __future__ import annotations
import logging
import os
import re
import time
from pathlib import Path
from typing import Optional

from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField,
    StringType, IntegerType, LongType, TimestampType
)

logger = logging.getLogger(__name__)

# ── Regex for the LogHub HDFS v1 format ───────────────────────────────────────
# Groups: date, time, pid, level, component, content
LOG_RE = re.compile(
    r"^(\d{6})\s+(\d{6})\s+(\d+)\s+(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|TRACE)\s+(\S+)\s+-?\s*(.*)"
)
BLOCK_ID_RE = re.compile(r"(blk_-?\d+)")


def create_spark_session(
    app_name: str = "LogAnalytics",
    master: str = "local[*]",
    driver_memory: str = "2g",
    executor_memory: str = "2g",
    hadoop_home: Optional[str] = None,
    java_home: Optional[str] = None,
) -> SparkSession:
    """Create and configure a SparkSession."""
    if java_home:
        os.environ["JAVA_HOME"] = java_home
    if hadoop_home:
        os.environ["HADOOP_HOME"] = hadoop_home
        os.environ["HADOOP_CONF_DIR"] = f"{hadoop_home}/etc/hadoop"

    builder = (
        SparkSession.builder
        .appName(app_name)
        .master(master)
        .config("spark.driver.memory", driver_memory)
        .config("spark.executor.memory", executor_memory)
        # Avoid warning spam
        .config("spark.sql.adaptive.enabled", "true")
        .config("spark.ui.showConsoleProgress", "false")
        # Use snappy for parquet
        .config("spark.sql.parquet.compression.codec", "snappy")
        # Don't write _SUCCESS files
        .config("spark.hadoop.mapreduce.fileoutputcommitter.marksuccessfuljobs", "false")
    )

    if hadoop_home:
        # Add Hadoop JARs so Spark can talk to HDFS
        hadoop_jars = f"{hadoop_home}/share/hadoop/common/*,{hadoop_home}/share/hadoop/common/lib/*,{hadoop_home}/share/hadoop/hdfs/*,{hadoop_home}/share/hadoop/hdfs/lib/*"
        builder = builder.config("spark.driver.extraClassPath", hadoop_jars)

    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel("WARN")
    logger.info("SparkSession created: %s", spark.version)
    return spark


# ── Schema ────────────────────────────────────────────────────────────────────

RAW_SCHEMA = StructType([
    StructField("raw_line", StringType(), True),
])

PARSED_SCHEMA = StructType([
    StructField("date_str",   StringType(),  True),
    StructField("time_str",   StringType(),  True),
    StructField("pid",        StringType(),  True),
    StructField("level",      StringType(),  True),
    StructField("component",  StringType(),  True),
    StructField("content",    StringType(),  True),
    StructField("block_id",   StringType(),  True),
    StructField("ts_raw",     StringType(),  True),   # "YYMMDD HHmmss"
    StructField("parse_ok",   StringType(),  True),   # "ok" | "failed"
])


def _parse_line_udf():
    """Return a UDF that parses one log line into a dict (all strings)."""
    import re as _re
    _LOG_RE = _re.compile(
        r"^(\d{6})\s+(\d{6})\s+(\d+)\s+(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|TRACE)\s+(\S+)\s+-?\s*(.*)"
    )
    _BLOCK_RE = _re.compile(r"(blk_-?\d+)")

    from pyspark.sql.functions import udf
    from pyspark.sql.types import StructType, StructField, StringType

    schema = StructType([
        StructField("date_str",  StringType(), True),
        StructField("time_str",  StringType(), True),
        StructField("pid",       StringType(), True),
        StructField("level",     StringType(), True),
        StructField("component", StringType(), True),
        StructField("content",   StringType(), True),
        StructField("block_id",  StringType(), True),
        StructField("ts_raw",    StringType(), True),
        StructField("parse_ok",  StringType(), True),
    ])

    def parse(line: str):
        if not line or not line.strip():
            return ("", "", "", "", "", "", None, "", "empty")
        m = _LOG_RE.match(line.strip())
        if not m:
            return ("", "", "", "", "", line.strip(), None, "", "failed")
        date, time_, pid, level, comp, content = m.groups()
        block_ids = _BLOCK_RE.findall(content)
        block_id = block_ids[0] if block_ids else None
        ts_raw = f"{date} {time_}"
        return (date, time_, pid, level, comp, content, block_id, ts_raw, "ok")

    return udf(parse, schema)


def read_raw_logs(spark: SparkSession, path: str, partitions: int = 8) -> DataFrame:
    """
    Read raw log file as a DataFrame of single-column 'raw_line'.
    Works with hdfs:// and file:// paths.
    """
    logger.info("Reading raw logs from: %s", path)
    df = spark.read.text(path)
    df = df.withColumnRenamed("value", "raw_line")
    # Filter blanks early to save work
    df = df.filter(F.length(F.trim(F.col("raw_line"))) > 0)
    df = df.repartition(partitions)
    return df


def parse_logs(df: DataFrame) -> DataFrame:
    """
    Parse raw log lines into structured columns.
    Returns a DataFrame with columns from PARSED_SCHEMA plus 'raw_line'.
    """
    parse_udf = _parse_line_udf()
    parsed = df.withColumn("p", parse_udf(F.col("raw_line")))
    result = (
        parsed
        .select(
            F.col("raw_line"),
            F.col("p.date_str").alias("date_str"),
            F.col("p.time_str").alias("time_str"),
            F.col("p.pid").alias("pid"),
            F.col("p.level").alias("level"),
            F.col("p.component").alias("component"),
            F.col("p.content").alias("content"),
            F.col("p.block_id").alias("block_id"),
            F.col("p.ts_raw").alias("ts_raw"),
            F.col("p.parse_ok").alias("parse_ok"),
        )
    )
    return result


def add_timestamp(df: DataFrame) -> DataFrame:
    """
    Convert ts_raw (YYMMDD HHmmss) to a proper timestamp column.
    Prefixes '20' to year for dates 2000-2099 (valid for 2008 HDFS dataset).
    """
    df = df.withColumn(
        "timestamp",
        F.when(
            F.col("parse_ok") == "ok",
            F.to_timestamp(
                F.concat(F.lit("20"), F.col("ts_raw")),
                "yyyyMMdd HHmmss"
            )
        ).otherwise(F.lit(None).cast(TimestampType()))
    )
    # Extract hour for trend analysis
    df = df.withColumn("hour", F.hour(F.col("timestamp")))
    df = df.withColumn("date_parsed", F.to_date(F.col("timestamp")))
    return df


def compute_summary_stats(df: DataFrame) -> DataFrame:
    """
    Compute overall counts: total, by-level, parse failures.
    Returns a single-row DataFrame.
    """
    total = df.count()
    parse_ok = df.filter(F.col("parse_ok") == "ok").count()
    parse_failed = df.filter(F.col("parse_ok") == "failed").count()
    parse_empty = df.filter(F.col("parse_ok") == "empty").count()

    level_counts = (
        df.filter(F.col("parse_ok") == "ok")
        .groupBy("level")
        .count()
        .collect()
    )
    level_dict = {row["level"]: row["count"] for row in level_counts}

    stats = spark_singleton = df.sparkSession.createDataFrame(
        [{
            "total_records":   total,
            "parsed_ok":       parse_ok,
            "parse_failed":    parse_failed,
            "parse_empty":     parse_empty,
            "info_count":      level_dict.get("INFO", 0),
            "warn_count":      level_dict.get("WARN", 0) + level_dict.get("WARNING", 0),
            "error_count":     level_dict.get("ERROR", 0),
            "fatal_count":     level_dict.get("FATAL", 0),
        }]
    )
    return stats


def compute_component_stats(df: DataFrame) -> DataFrame:
    """Per-component counts by log level."""
    return (
        df.filter((F.col("parse_ok") == "ok") & F.col("component").isNotNull())
        .groupBy("component")
        .agg(
            F.count("*").alias("total"),
            F.sum(F.when(F.col("level") == "ERROR", 1).otherwise(0)).alias("errors"),
            F.sum(F.when(F.col("level").isin("WARN","WARNING"), 1).otherwise(0)).alias("warnings"),
            F.sum(F.when(F.col("level") == "INFO", 1).otherwise(0)).alias("infos"),
        )
        .orderBy(F.col("errors").desc())
    )


def compute_time_trends(df: DataFrame) -> DataFrame:
    """Hourly log counts by level — only for successfully parsed records with timestamps."""
    return (
        df.filter((F.col("parse_ok") == "ok") & F.col("timestamp").isNotNull())
        .groupBy("date_parsed", "hour")
        .agg(
            F.count("*").alias("total"),
            F.sum(F.when(F.col("level") == "ERROR", 1).otherwise(0)).alias("errors"),
            F.sum(F.when(F.col("level").isin("WARN","WARNING"), 1).otherwise(0)).alias("warnings"),
        )
        .orderBy("date_parsed", "hour")
    )


def compute_event_patterns(df: DataFrame, top_n: int = 50) -> DataFrame:
    """
    Identify frequent event patterns by extracting the first clause of
    the content field (up to the first colon, bracket, or block reference).
    """
    event_df = df.filter(F.col("parse_ok") == "ok").withColumn(
        "event_pattern",
        F.regexp_replace(
            F.regexp_extract(F.col("content"), r"^([^:\[]+)", 1),
            r"\s+", " "
        )
    )
    return (
        event_df.groupBy("event_pattern", "level")
        .count()
        .orderBy(F.col("count").desc())
        .limit(top_n)
    )


def write_parquet(df: DataFrame, path: str, mode: str = "overwrite", partition_by: list = None) -> None:
    """Write DataFrame to Parquet, optionally partitioned."""
    logger.info("Writing Parquet → %s (mode=%s)", path, mode)
    writer = df.write.mode(mode).format("parquet")
    if partition_by:
        writer = writer.partitionBy(*partition_by)
    writer.save(path)
    logger.info("Write complete → %s", path)


def run_pipeline(
    spark: SparkSession,
    input_path: str,
    output_base: str,
    sample_mode: bool = True,
) -> dict:
    """
    Full end-to-end pipeline run.
    Returns timing and record statistics.
    """
    t0 = time.time()
    logger.info("=== Pipeline start | input=%s | sample=%s ===", input_path, sample_mode)

    # 1. Read
    raw_df = read_raw_logs(spark, input_path)

    # 2. Parse
    parsed_df = parse_logs(raw_df)
    parsed_df = add_timestamp(parsed_df)
    parsed_df.cache()

    # 3. Stats (actions trigger computation)
    summary = compute_summary_stats(parsed_df)
    component_stats = compute_component_stats(parsed_df)
    time_trends = compute_time_trends(parsed_df)
    event_patterns = compute_event_patterns(parsed_df)

    # 4. Write parsed logs (cleaned, without failed parses)
    clean_df = parsed_df.filter(F.col("parse_ok") == "ok")
    write_parquet(clean_df, f"{output_base}/logs", partition_by=["level"])

    # 5. Write aggregations
    write_parquet(summary,         f"{output_base}/stats/summary")
    write_parquet(component_stats, f"{output_base}/stats/components")
    write_parquet(time_trends,     f"{output_base}/stats/trends")
    write_parquet(event_patterns,  f"{output_base}/stats/events")

    parsed_df.unpersist()

    elapsed = time.time() - t0
    summary_row = summary.first()
    result = {
        "elapsed_seconds":  round(elapsed, 2),
        "total_records":    summary_row["total_records"],
        "parsed_ok":        summary_row["parsed_ok"],
        "parse_failed":     summary_row["parse_failed"],
        "error_count":      summary_row["error_count"],
        "warn_count":       summary_row["warn_count"],
    }
    logger.info("=== Pipeline complete in %.1fs | %s ===", elapsed, result)
    return result
