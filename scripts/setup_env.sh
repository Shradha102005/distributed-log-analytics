#!/bin/bash
set -e

# Update ~/.bashrc for hadoop user
sed -i '/# Apache Spark/,$d' /home/hadoop/.bashrc

cat << 'EOF' >> /home/hadoop/.bashrc

# Apache Spark & Python Environment
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export SPARK_HOME=/usr/local/spark
export PATH=/home/hadoop/spark-env/bin:$SPARK_HOME/bin:$SPARK_HOME/sbin:$JAVA_HOME/bin:$PATH
export PYTHONPATH=$SPARK_HOME/python:$SPARK_HOME/python/lib/py4j-0.10.9.7-src.zip:$PYTHONPATH
export PYSPARK_PYTHON=/home/hadoop/spark-env/bin/python
export PYSPARK_DRIVER_PYTHON=/home/hadoop/spark-env/bin/python
EOF

echo "Updated /home/hadoop/.bashrc with Python 3.11 environment."
