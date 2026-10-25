#!/bin/bash
set -e

# Setup environment
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export SPARK_HOME=/usr/local/spark
export PATH=/home/hadoop/spark-env/bin:$SPARK_HOME/bin:$SPARK_HOME/sbin:$JAVA_HOME/bin:$PATH
export PYTHONPATH=$SPARK_HOME/python:$SPARK_HOME/python/lib/py4j-0.10.9.7-src.zip:$PYTHONPATH
export PYSPARK_PYTHON=/home/hadoop/spark-env/bin/python
export PYSPARK_DRIVER_PYTHON=/home/hadoop/spark-env/bin/python

echo "=== Running Distributed Log Analytics Pipeline in WSL ==="
echo "User: $(whoami)"
echo "Python: $(/home/hadoop/spark-env/bin/python --version)"
echo "Spark Home: $SPARK_HOME"
echo "=========================================================="

/home/hadoop/spark-env/bin/python /mnt/d/BDA_CC/distributed-log-analytics/pipeline/run_pipeline.py "$@"
