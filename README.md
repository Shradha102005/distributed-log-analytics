# Distributed Log Analytics & Anomaly Detection Platform

> **Academic project** — End-to-end Big Data pipeline using Hadoop HDFS, Apache Spark (PySpark), FastAPI, DuckDB, and React. Processes the LogHub HDFS v1 dataset (~11 million log records) to detect anomalies and visualise findings in a live dashboard.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Quick Start](#quick-start)
5. [Pipeline Stages](#pipeline-stages)
6. [Backend API Reference](#backend-api-reference)
7. [Frontend Dashboard](#frontend-dashboard)
8. [Anomaly Detection Methods](#anomaly-detection-methods)
9. [Evaluation Metrics](#evaluation-metrics)
10. [Running Tests](#running-tests)
11. [AWS S3 Integration](#aws-s3-integration)
12. [Dataset](#dataset)
13. [Environment Variables](#environment-variables)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Data Ingestion                                │
│  LogHub HDFS v1  ─→  download/stream  ─→  HDFS (WSL2 Hadoop 3.1.4)│
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                    PySpark 3.5.3 Processing                          │
│  1. Parse log lines  (regex UDF, partitioned by level)               │
│  2. Aggregate stats  (component counts, hourly trends, events)       │
│  3. Anomaly detection (z-score spikes, block-level labelling)        │
│  4. Evaluation       (vs anomaly_label.csv ground truth)             │
│  Output: Parquet files  →  outputs/parquet/**                        │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                   FastAPI Backend  (port 8000)                       │
│  DuckDB SQL over Parquet — memory-safe, no pandas DataFrame loading  │
│  Endpoints: /api/summary  /api/trends  /api/logs  /api/anomalies …  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│               React + Vite + Recharts Dashboard  (port 5173)         │
│  Pages: Overview · Log Explorer · Anomalies · Analytics · Evaluation │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Distributed Storage | Apache Hadoop HDFS | 3.1.4 |
| Big Data Processing | Apache Spark (PySpark) | 3.5.3 |
| Backend API | FastAPI + Uvicorn | 0.115 / 0.32 |
| Query Engine | DuckDB | ≥ 1.1.0 |
| Data Format | Apache Parquet (PyArrow) | ≥ 17.0 |
| Cloud Storage | AWS S3 (boto3) | ≥ 1.26 |
| Frontend | React 19 + Vite 8 | latest |
| Charts | Recharts | latest |
| Runtime | Windows Python 3.13 + WSL2 | — |
| Testing | pytest | ≥ 9.0 |

---

## Project Structure

```
distributed-log-analytics/
├── pipeline/
│   ├── src/
│   │   ├── config.py       # Centralised path & Spark config
│   │   ├── ingestion.py    # Download + HDFS upload
│   │   ├── processor.py    # PySpark parsing & aggregation
│   │   └── anomaly.py      # Anomaly detection + evaluation
│   ├── tests/
│   │   └── test_pipeline.py
│   └── run_pipeline.py     # CLI entry point
│
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app factory + CORS
│   │   ├── core/config.py  # Settings (pydantic-settings)
│   │   ├── api/routes.py   # All API endpoints
│   │   ├── services/data_service.py  # DuckDB queries
│   │   └── models/responses.py       # Pydantic response models
│   ├── tests/
│   │   └── test_api.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Root router
│   │   ├── pages/          # Overview, LogExplorer, Anomalies, Analytics, Evaluation
│   │   ├── components/     # Sidebar, shared UI (Skeleton, Badge, Pagination)
│   │   ├── services/api.ts # Typed axios service layer
│   │   └── hooks/useFetch.ts
│   └── index.html
│
├── outputs/
│   └── parquet/            # Generated pipeline outputs (Parquet)
│       ├── logs/           # Parsed log records
│       ├── stats/          # summary, components, trends, events
│       └── anomalies/      # spikes, block_predictions, metrics
│
├── data/                   # Raw downloaded dataset (gitignored)
├── scripts/
│   └── generate_sample_data.py  # Dev fixture generator
├── docs/
├── .env.example
└── README.md
```

---

## Quick Start

### Prerequisites

- **WSL2** with Hadoop 3.1.4 installed at `/usr/local/hadoop` (configured for `hadoop` user)
- **Windows Python 3.13** at `C:\Users\ADMIN\AppData\Local\Programs\Python\Python313\`
- **Node.js ≥ 18**
- Java 8 (OpenJDK 1.8.0) in WSL2

### 1. Install Python dependencies

```powershell
pip install pyspark==3.5.3 duckdb fastapi uvicorn[standard] pyarrow pandas boto3 httpx pytest
```

### 2. Start Hadoop HDFS (WSL2)

```powershell
wsl -u hadoop bash -c "start-dfs.sh"
wsl -u hadoop bash -c "jps"        # verify NameNode, DataNode are running
```

### 3. Run the pipeline (sample mode — ~50 000 records, fast)

```powershell
cd distributed-log-analytics
python pipeline\run_pipeline.py --sample
```

Full dataset mode (downloads ~1.3 GB, takes ~10 min):

```powershell
python pipeline\run_pipeline.py --full
```

### 4. Start the backend API

```powershell
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs

### 5. Start the frontend dashboard

```powershell
cd frontend
npm install
npm run dev
```

Dashboard: http://localhost:5173

### Quick-start with synthetic data (no pipeline run required)

```powershell
python scripts\generate_sample_data.py   # generates 10 000 synthetic records
# Then start the backend + frontend as above
```

---

## Pipeline Stages

### Stage 1 — Ingestion (`ingestion.py`)

- Downloads LogHub HDFS v1 (`HDFS_v1.zip`) from Zenodo or configured URL via streaming HTTP
- Extracts `HDFS.log` (~1.3 GB)
- Uploads to HDFS at `hdfs://localhost:9000/user/hadoop/logs/hdfs.log`
- Generates a local sample file for development (`data/HDFS_sample.log`)

### Stage 2 — Processing (`processor.py`)

Runs a PySpark job that:

1. **Parses** each log line with a regex UDF:
   ```
   Format: YYMMDD HHMMSS PID LEVEL Component - Content
   Example: 081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-1608999687919862906
   ```
2. **Extracts** Block IDs from content (`blk_-?[0-9]+`)
3. **Writes** parsed records as Parquet to `outputs/parquet/logs/`
4. **Aggregates**:
   - Summary counts by level
   - Hourly error/warning trends
   - Per-component error distributions
   - Top event patterns with frequency & rarity flags

### Stage 3 — Anomaly Detection (`anomaly.py`)

Two complementary methods:

| Method | Description |
|---|---|
| **Error-spike detection** | For each hourly window, compute z-score of error count. Windows with z > 3σ flagged as anomalies |
| **Block-level labelling** | Any HDFS block with ≥ 1 ERROR or FATAL log is predicted `Anomaly`, else `Normal` |

Ground-truth evaluation is run automatically if `anomaly_label.csv` is present alongside `HDFS.log`.

---

## Backend API Reference

Base URL: `http://localhost:8000`

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service health + Parquet readiness flags |
| GET | `/api/summary` | Aggregate log counts (total, INFO, WARN, ERROR, FATAL) |
| GET | `/api/trends` | Hourly log volume & error counts (filterable by date range) |
| GET | `/api/components` | Per-component error/warning/info breakdown |
| GET | `/api/events` | Top event patterns with frequency and rarity flag |
| GET | `/api/logs` | Paginated log records (filter by level, component, content search) |
| GET | `/api/anomalies` | Paginated anomalies (filter by type: spike \| block) |
| GET | `/api/metrics` | Evaluation metrics (precision, recall, F1, confusion matrix) |

### Query Parameters — `/api/logs`

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number |
| `page_size` | int | 50 | Records per page (max 10 000) |
| `level` | string | — | Filter: INFO, WARN, ERROR, FATAL |
| `component` | string | — | Substring match on component name |
| `search` | string | — | Substring search in content |
| `date_from` | string | — | ISO date filter (YYYY-MM-DD) |
| `date_to` | string | — | ISO date filter (YYYY-MM-DD) |

### DuckDB Query Strategy

All queries use DuckDB `read_parquet()` directly — no full dataset is loaded into driver memory. Pagination is implemented via SQL `LIMIT`/`OFFSET`. This makes the backend memory-safe even against 11 million records.

---

## Frontend Dashboard

| Page | URL | What you see |
|---|---|---|
| **Overview** | `/` | KPI cards, hourly area chart, log-level pie chart |
| **Log Explorer** | `/logs` | Paginated table with search/level/component filters + expandable rows |
| **Anomalies** | `/anomalies` | Error spikes and block-anomaly table with z-score, GT comparison |
| **Analytics** | `/analytics` | Component error bar chart, radar chart, event-frequency table |
| **Evaluation** | `/evaluation` | Precision/Recall/F1/Accuracy gauges + confusion matrix |

---

## Anomaly Detection Methods

### 1. Error-Spike Detection (Z-Score)

For each date × hour bucket:

```
z = (errors_in_window - mean_errors) / std_errors

Flagged as anomaly if z > 3.0
```

**Why z-score?** It is distribution-free, self-calibrating, and handles varying baseline load automatically.

### 2. Block-Level Labelling

```
predicted_label = "Anomaly" if error_count >= 1 else "Normal"
```

Block IDs are extracted from log content via regex `blk_-?\d+`. Any block that appears in at least one ERROR or FATAL log entry is predicted anomalous.

**Alignment with ground truth:** The LogHub HDFS v1 dataset ships `anomaly_label.csv` which labels each BlockId. Our block-level predictions can be directly evaluated against this file.

---

## Evaluation Metrics

Evaluation is only valid at the **block level** — not at the individual log-record level. A single anomalous block typically contains many INFO messages, so record-level accuracy is misleading.

| Metric | Formula |
|---|---|
| Precision | TP / (TP + FP) |
| Recall | TP / (TP + FN) |
| F1 Score | 2 × P × R / (P + R) |
| Accuracy | (TP + TN) / Total |

Results are shown in the **Evaluation** page of the dashboard once `anomaly_label.csv` is detected.

---

## Running Tests

```powershell
# All tests (43 tests total)
python -m pytest backend/tests/ pipeline/tests/ -v

# Backend API tests only (19 tests)
python -m pytest backend/tests/test_api.py -v

# Pipeline unit tests only (24 tests)
python -m pytest pipeline/tests/test_pipeline.py -v
```

Test coverage:
- **Backend:** all 8 API endpoints, pagination, filtering, invalid params, empty-state handling
- **Pipeline:** log parsing regex, block-ID extraction, z-score anomaly detection, evaluation formulas, Parquet readback

---

## AWS S3 Integration

The pipeline supports uploading processed Parquet output to an S3 bucket.

### Configuration

Copy `.env.example` to `.env` and fill in:

```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-south-1
S3_BUCKET=your-bucket-name
S3_PREFIX=log-analytics/
```

### How it works

`ingestion.py` uses `boto3` to upload the raw dataset if an S3 bucket is configured.
`processor.py` can write Parquet directly to `s3a://` if `USE_HDFS=true` and the SparkContext is configured with `fs.s3a.*` credentials.

> **Note:** For local/WSL2 development the default output path is `outputs/parquet/` (Windows filesystem). Set `USE_S3=true` in `.env` to activate S3 output.

---

## Dataset

**LogHub HDFS v1** — collected from a Hadoop cluster running data analytics workloads.

| Property | Value |
|---|---|
| Source | HDFS distributed file system logs |
| Records | ~11 million log entries |
| Time span | Nov 9–11, 2008 |
| Format | `YYMMDD HHMMSS PID LEVEL Component - Content` |
| Labels | `anomaly_label.csv` — 575 061 anomalous blocks |
| Download | Zenodo / LogHub GitHub |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HDFS_URL` | `hdfs://localhost:9000` | HDFS NameNode address |
| `HDFS_LOG_PATH` | `/user/hadoop/logs/hdfs.log` | HDFS input path |
| `SPARK_MASTER` | `local[*]` | Spark master URL |
| `SAMPLE_SIZE` | `50000` | Lines to process in sample mode |
| `OUTPUT_BASE` | `outputs` | Parquet output base directory |
| `USE_HDFS` | `false` | Read from HDFS instead of local |
| `AWS_ACCESS_KEY_ID` | — | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | — | AWS credentials |
| `AWS_REGION` | `ap-south-1` | AWS region |
| `S3_BUCKET` | — | S3 bucket name |
| `S3_PREFIX` | `log-analytics/` | S3 key prefix |
| `CORS_ORIGINS` | `http://localhost:5173` | Backend CORS allowed origins |

---

## Authors & Acknowledgements

- Dataset: [LogHub](https://github.com/logpai/loghub) — Weibin Meng et al.
- Stack: Hadoop 3.1.4, PySpark 3.5.3, FastAPI, DuckDB, React 19, Recharts
