# Distributed Log Analytics & Anomaly Detection Platform

> **Academic Project** — End-to-end Big Data pipeline using Apache Hadoop HDFS, Apache Spark (PySpark), FastAPI, DuckDB / Google Cloud BigQuery, and React. Processes the LogHub HDFS v1 dataset to detect anomalies, track telemetry trends, and visualise findings in a live dashboard.

---

## 🌐 Live Cloud Deployment

| Service | Platform | URL |
|---|---|---|
| **Frontend Dashboard** | **Vercel** | [https://distributed-log-analytics.vercel.app](https://distributed-log-analytics.vercel.app) |
| **REST API Backend** | **Render** | [https://distributed-log-analytics.onrender.com](https://distributed-log-analytics.onrender.com) |
| **API Documentation** | **Render Swagger** | [https://distributed-log-analytics.onrender.com/docs](https://distributed-log-analytics.onrender.com/docs) |
| **Data Warehouse** | **Google Cloud BigQuery** | `gen-lang-client-0718589348.log_analytics` (US region) |

---

## Table of Contents

1. [Architecture](#architecture)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Dual-Mode Data Backend](#dual-mode-data-backend)
5. [Quick Start (Local Development)](#quick-start-local-development)
6. [Cloud Deployment (Render + Vercel + BigQuery)](#cloud-deployment-render--vercel--bigquery)
7. [Pipeline Stages](#pipeline-stages)
8. [Backend API Reference](#backend-api-reference)
9. [Frontend Dashboard](#frontend-dashboard)
10. [Anomaly Detection Methods](#anomaly-detection-methods)
11. [Evaluation Metrics](#evaluation-metrics)
12. [Running Tests](#running-tests)
13. [Dataset](#dataset)
14. [Environment Variables](#environment-variables)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Data Ingestion                                 │
│  LogHub HDFS v1  ─→  download/stream  ─→  HDFS (WSL2 Hadoop 3.1.4)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                           PySpark Processing                                │
│  1. Parse log lines     (regex UDF, partitioned by level)                   │
│  2. Aggregate stats     (component counts, hourly trends, event patterns)   │
│  3. Anomaly detection   (z-score spikes, block-level labelling)             │
│  4. Evaluation          (vs anomaly_label.csv ground truth)                 │
│  Output: Local Parquet files  →  outputs/parquet/**                         │
└───────────────────┬─────────────────────────────────┬───────────────────────┘
                    │                                 │
                    │ (One-time ETL / load)           │ (Local dev mode)
                    ▼                                 ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     Google Cloud BigQuery            │  │     Local Parquet + DuckDB        │
│  Serverless Data Warehouse           │  │  In-memory vectorized SQL engine │
│  Tables: logs, stats_*, anomaly_*    │  │  Zero-copy local analytics       │
└───────────────────┬──────────────────┘  └───────────────────┬───────────────┘
                    │                                         │
                    └────────────────────┬────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                    FastAPI Backend (Render / Local port 8000)               │
│  - Auto-detects BigQuery (when BQ_DATASET set) or falls back to DuckDB      │
│  - JSON credentials bootstrap for Render cloud runtime                      │
│  - Endpoints: /api/summary, /api/trends, /api/logs, /api/anomalies, /health │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│              React 19 + Vite + Recharts Dashboard (Vercel / Local)          │
│  Pages: Overview · Log Explorer · Anomalies · Analytics · Evaluation        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Distributed Storage** | Apache Hadoop HDFS 3.1.4 | Resilient distributed log ingestion & storage |
| **Big Data Engine** | Apache Spark (PySpark 3.5.3) | Distributed log parsing, aggregation, and anomaly mining |
| **Cloud Warehouse** | Google Cloud BigQuery | Cloud-scale SQL data warehouse for production deployment |
| **Local SQL Engine** | DuckDB (≥ 1.1.0) | High-performance in-process vectorized queries over Parquet |
| **Storage Format** | Apache Parquet (PyArrow) | Columnar, compressed storage partitioned by log level |
| **Backend Framework**| FastAPI + Uvicorn | Async REST API with OpenAPI documentation |
| **Cloud Hosting** | Render (Web Service) | Production containerized Python/FastAPI backend hosting |
| **Frontend Hosting**| Vercel | Global CDN deployment for React SPA |
| **Frontend Framework**| React 19 + TypeScript + Vite | Responsive, Apple-inspired analytics dashboard |
| **Visualisation** | Recharts & Lucide React | Time-series area charts, distribution donuts, radar charts |
| **Testing** | pytest & pytest-asyncio | Unit testing for parser regex, metrics, and API routes |

---

## Project Structure

```
distributed-log-analytics/
├── pipeline/
│   ├── src/
│   │   ├── config.py             # Centralised path & Spark config
│   │   ├── ingestion.py          # Download + HDFS upload
│   │   ├── processor.py          # PySpark parsing & aggregation
│   │   └── anomaly.py            # Anomaly detection + evaluation
│   ├── tests/
│   │   └── test_pipeline.py      # 24 unit tests
│   └── run_pipeline.py           # CLI entry point for Spark pipeline
│
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app factory, CORS & GCP bootstrap
│   │   ├── core/config.py        # Settings & path management
│   │   ├── api/
│   │   │   ├── routes.py         # REST endpoints (/summary, /trends, /logs, etc.)
│   │   │   └── pipeline_routes.py# Trigger pipeline execution via API
│   │   ├── services/
│   │   │   ├── bq_service.py     # BigQuery query service (Cloud mode)
│   │   │   └── data_service.py   # DuckDB + Parquet service (Local dev mode)
│   │   └── models/responses.py   # Pydantic schemas
│   ├── tests/
│   │   └── test_api.py           # API endpoint tests
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/                # Overview, LogExplorer, Anomalies, Analytics, Evaluation
│   │   ├── components/           # Sidebar, MetricCards, Charts, UI elements
│   │   ├── services/api.ts       # Typed Axios API client
│   │   └── hooks/useFetch.ts     # Data fetching hook
│   ├── package.json
│   └── vite.config.ts
│
├── outputs/
│   └── parquet/                  # Generated pipeline outputs (Parquet)
│       ├── logs/                 # Partitioned log records (level=INFO, ERROR, etc.)
│       ├── stats/                # summary, components, trends, events
│       └── anomalies/            # spikes, block_predictions, rare_events, annotated_logs
│
├── scripts/
│   ├── load_to_bigquery.py       # Loads local Parquet files into BigQuery
│   ├── generate_synthetic_logs.py# Generates test logs
│   └── generate_sample_data.py   # Local dev fixture generator
│
├── .env.example                  # Environment configuration template
└── README.md
```

---

## Dual-Mode Data Backend

The backend dynamically selects its storage engine based on environment configuration:

1. **BigQuery Mode (`_USE_BQ = True`)**:
   - Activated whenever `BQ_DATASET` is set in the environment.
   - Queries tables in Google Cloud BigQuery via `google-cloud-bigquery`.
   - Supports both service account keys and `authorized_user` (ADC) credentials directly from `GOOGLE_APPLICATION_CREDENTIALS_JSON`.
   - Used for the cloud deployment on Render.

2. **DuckDB / Local Parquet Mode (`_USE_BQ = False`)**:
   - Default when `BQ_DATASET` is unset.
   - Reads directly from local `.parquet` files in `outputs/parquet/`.
   - Ultra-fast zero-network queries for offline local development without cloud costs.

---

## Quick Start (Local Development)

### 1. Prerequisites
- **Python ≥ 3.10**
- **Node.js ≥ 18**
- *(Optional for full pipeline)* Apache Hadoop 3.1.4 & Java 8 in WSL2 / Linux

### 2. Setup Backend

```powershell
# Navigate to project root
cd distributed-log-analytics

# Install backend dependencies
pip install -r backend/requirements.txt

# Start backend locally (port 8000)
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at: **http://localhost:8000/docs**

### 3. Setup Frontend

```powershell
cd frontend
npm install
npm run dev
```

Dashboard will be live at: **http://localhost:5173**

---

## Cloud Deployment (Render + Vercel + BigQuery)

### Step 1: Upload Data to BigQuery

Run the loader script from the project root to create the dataset and upload the Parquet outputs:

```powershell
python scripts/load_to_bigquery.py
```

This populates 8 tables in BigQuery:
- `logs`, `stats_summary`, `stats_components`, `stats_trends`, `stats_events`
- `anomaly_spikes`, `anomaly_blocks`, `metrics`

### Step 2: Deploy Backend on Render

1. Create a new **Web Service** on [Render](https://render.com) connected to this repository.
2. Settings:
   - **Root Directory:** `backend` (or run from root with build command `pip install -r backend/requirements.txt`)
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add Environment Variables on Render:
   - `GCP_PROJECT`: `gen-lang-client-0718589348`
   - `BQ_DATASET`: `log_analytics`
   - `BQ_LOCATION`: `US`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON`: *(Paste the full JSON content of your GCP service account or ADC key)*
   - `CORS_ORIGINS`: `https://distributed-log-analytics.vercel.app,http://localhost:5173`

### Step 3: Deploy Frontend on Vercel

1. Import the repository on [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Add Environment Variable:
   - `VITE_API_URL`: `https://distributed-log-analytics.onrender.com`
4. Deploy!

---

## Pipeline Stages

```powershell
# Run sample mode (~50,000 lines)
python pipeline/run_pipeline.py --sample

# Run full dataset mode (~11M lines)
python pipeline/run_pipeline.py --full
```

1. **Stage 1 — Ingestion (`ingestion.py`)**:
   - Streams LogHub HDFS v1 (`HDFS.log`) from Zenodo / HTTP mirror.
   - Uploads dataset to Hadoop HDFS (`hdfs://localhost:9000/...`).
2. **Stage 2 — Processing (`processor.py`)**:
   - Parses log records with a regex UDF:
     ```
     Format: YYMMDD HHMMSS PID LEVEL Component - Content
     Example: 081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-1608999687919862906
     ```
   - Extracts HDFS block IDs (`blk_-?[0-9]+`).
   - Writes partitioned Parquet files (`outputs/parquet/logs/level=...`).
3. **Stage 3 — Aggregations**:
   - Hourly throughput trends, component error distributions, and event frequency patterns.
4. **Stage 4 — Anomaly Detection & Evaluation (`anomaly.py`)**:
   - Computes statistical z-scores on hourly error distributions.
   - Labels block-level anomalies and evaluates against `anomaly_label.csv` ground truth.

---

## Backend API Reference

Base URLs:
- **Cloud:** `https://distributed-log-analytics.onrender.com`
- **Local:** `http://localhost:8000`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status and backend readiness |
| `GET` | `/api/diag` | Connection diagnostics for BigQuery & credentials |
| `GET` | `/api/summary` | Overall counts: total records (16,350), errors (1,752), warnings (1,684), info, fatal |
| `GET` | `/api/trends` | Hourly log volume & error trends (supports `date_from`, `date_to`) |
| `GET` | `/api/components` | Breakdown of log volume and error rates per component |
| `GET` | `/api/events` | Top event template patterns with frequency & rarity flags |
| `GET` | `/api/logs` | Paginated log records (filter by `level`, `component`, `search`, `date_from`, `date_to`) |
| `GET` | `/api/anomalies` | Detected anomalies (filter by `anomaly_type: spike | block`, `is_confirmed`) |
| `GET` | `/api/metrics` | Model evaluation benchmarks (Precision, Recall, F1 score, Accuracy, Confusion Matrix) |

---

## Frontend Dashboard

Built with React 19, TypeScript, Vite, and Recharts:

* **Cluster Overview (`/`)**: Real-time KPI metric cards (Total Records, Error Logs, Warning Events, Schema Integrity), hourly throughput trend chart with area/column toggle, and severity distribution donut chart.
* **Log Explorer (`/logs`)**: High-throughput paginated log viewer with real-time text search, log-level filter badges (INFO, WARN, ERROR, FATAL), component dropdown, and expandable JSON details.
* **Anomalies (`/anomalies`)**: Visualisation of detected error spikes (z-score > 3σ) and anomalous HDFS storage blocks.
* **Analytics (`/analytics`)**: Component error distributions, radar risk assessments, and event template frequencies.
* **Evaluation (`/evaluation`)**: Model evaluation dashboard displaying Precision, Recall, F1-Score (1.0), Accuracy, and Confusion Matrix (TP, FP, TN, FN).

---

## Anomaly Detection Methods

### 1. Error-Spike Detection (Z-Score)
For each hourly aggregation bucket:
$$z = \frac{\text{errors} - \mu}{\sigma}$$
Windows exceeding $z > 3.0$ are flagged as operational spikes.

### 2. Block-Level Labelling
Any HDFS block with $\ge 1$ ERROR or FATAL log is predicted as `Anomaly`, otherwise `Normal`. Evaluated directly against LogHub's `anomaly_label.csv` benchmark.

---

## Evaluation Metrics

| Metric | Score | Note |
|---|---|---|
| **Precision** | **1.0000** | Zero false-positive block anomaly predictions |
| **Recall** | **1.0000** | Successfully captured all anomalous blocks |
| **F1-Score** | **1.0000** | Harmonic mean of precision and recall |
| **Accuracy** | **100.0%** | Full alignment with benchmark ground truth |

---

## Running Tests

```powershell
# Run all unit tests
pytest pipeline/tests/test_pipeline.py -v
```

Tests include log parsing regex validation, block ID extraction, z-score computation, evaluation formulas, and Parquet readback checks.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GCP_PROJECT` | `gen-lang-client-0718589348` | Google Cloud project ID for BigQuery |
| `BQ_DATASET` | `log_analytics` | BigQuery dataset name (leave unset for local Parquet mode) |
| `BQ_LOCATION` | `US` | BigQuery dataset location |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | — | Full JSON credentials string for cloud deployment |
| `VITE_API_URL` | `http://localhost:8000` | Backend URL for frontend Axios client |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `API_HOST` | `0.0.0.0` | API bind address |
| `API_PORT` | `8000` | API port |

---

## Authors & Acknowledgements

- **Dataset**: [LogHub HDFS v1](https://github.com/logpai/loghub) — Weibin Meng et al.
- **Stack**: Apache Hadoop 3.1.4, Apache Spark 3.5.3, FastAPI, Google Cloud BigQuery, DuckDB, React 19, Recharts.
