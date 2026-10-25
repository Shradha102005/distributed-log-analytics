from pyspark.sql import SparkSession
import sys

print("Initializing SparkSession...")
spark = SparkSession.builder \
    .appName("WSL-Spark-Verification") \
    .master("local[2]") \
    .config("spark.driver.bindAddress", "127.0.0.1") \
    .config("spark.driver.host", "localhost") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")

data = [("blk_-160899968791986290", "INFO", "Receiving block"),
        ("blk_-160899968791986290", "WARN", "PacketResponder 1 for block terminated"),
        ("blk_-3544583377289625738", "ERROR", "Verification failed")]

df = spark.createDataFrame(data, ["block_id", "level", "message"])
print("Spark DataFrame schema:")
df.printSchema()

print("DataFrame contents:")
df.show()

print("Aggregated counts by level:")
df.groupBy("level").count().show()

spark.stop()
print("PySpark verification SUCCESSFUL!")
