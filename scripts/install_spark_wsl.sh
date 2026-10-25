#!/bin/bash
set -e

if [ -d /usr/local/spark ]; then
  echo "Spark already installed at /usr/local/spark"
  ls /usr/local/spark/bin/spark-submit
  exit 0
fi

echo "[1/4] Downloading Apache Spark 3.5.3..."
cd /tmp
wget -q --show-progress https://archive.apache.org/dist/spark/spark-3.5.3/spark-3.5.3-bin-hadoop3.tgz

echo "[2/4] Extracting..."
tar -xzf spark-3.5.3-bin-hadoop3.tgz -C /usr/local/
mv /usr/local/spark-3.5.3-bin-hadoop3 /usr/local/spark
chown -R hadoop:hadoop /usr/local/spark
rm spark-3.5.3-bin-hadoop3.tgz

echo "[3/4] Writing environment to /home/hadoop/.bashrc..."
if ! grep -q 'SPARK_HOME' /home/hadoop/.bashrc; then
  echo '' >> /home/hadoop/.bashrc
  echo '# Apache Spark' >> /home/hadoop/.bashrc
  echo 'export SPARK_HOME=/usr/local/spark' >> /home/hadoop/.bashrc
  echo 'export PATH=$PATH:$SPARK_HOME/bin:$SPARK_HOME/sbin' >> /home/hadoop/.bashrc
  echo 'export PYTHONPATH=$SPARK_HOME/python:$SPARK_HOME/python/lib/py4j-0.10.9.7-src.zip:$PYTHONPATH' >> /home/hadoop/.bashrc
  echo 'export PYSPARK_PYTHON=python3' >> /home/hadoop/.bashrc
fi

echo "[4/4] Configuring Spark to use Hadoop..."
cp /usr/local/spark/conf/spark-env.sh.template /usr/local/spark/conf/spark-env.sh
echo 'export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64' >> /usr/local/spark/conf/spark-env.sh
echo 'export HADOOP_CONF_DIR=/usr/local/hadoop/etc/hadoop' >> /usr/local/spark/conf/spark-env.sh
echo 'export SPARK_DIST_CLASSPATH=$(/usr/local/hadoop/bin/hadoop classpath)' >> /usr/local/spark/conf/spark-env.sh

echo ""
echo "=== Apache Spark 3.5.3 installed successfully! ==="
/usr/local/spark/bin/spark-submit --version 2>&1 | head -5
