#!/bin/bash
# Verify Spark installation and run the pipeline via WSL
source /home/hadoop/.bashrc 2>/dev/null || true
export SPARK_HOME=/usr/local/spark
export PATH=$PATH:$SPARK_HOME/bin:$SPARK_HOME/sbin
export PYTHONPATH=$SPARK_HOME/python:$SPARK_HOME/python/lib/py4j-0.10.9.7-src.zip:$PYTHONPATH
export PYSPARK_PYTHON=python3
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64

echo "=== Spark version ==="
spark-submit --version 2>&1 | head -4

echo ""
echo "=== Python + PySpark check ==="
python3 -c "import pyspark; print('PySpark version:', pyspark.__version__)"

echo ""
echo "=== Starting pipeline (sample mode) ==="
cd /mnt/d/BDA_CC/distributed-log-analytics
python3 pipeline/run_pipeline.py --sample --no-download 2>&1
