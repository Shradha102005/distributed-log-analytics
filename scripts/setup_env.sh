#!/bin/bash
set -e

# Update ~/.bashrc for hadoop user
sed -i '/# Apache Spark/,$d' /home/hadoop/.bashrc

cat << 'EOF' >> /home/hadoop/.bashrc

# Apache Spark
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export SPARK_HOME=/usr/local/spark
export PATH=$SPARK_HOME/bin:$SPARK_HOME/sbin:$JAVA_HOME/bin:$PATH
export PYTHONPATH=$SPARK_HOME/python:$SPARK_HOME/python/lib/py4j-0.10.9.7-src.zip:$PYTHONPATH
export PYSPARK_PYTHON=python3
export PYSPARK_DRIVER_PYTHON=python3
EOF

echo "Updated /home/hadoop/.bashrc successfully."
