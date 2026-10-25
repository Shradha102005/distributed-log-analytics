"""
FastAPI application entry point.
"""
import os
import json
import tempfile

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .api.routes import router
from .api.pipeline_routes import router as pipeline_router

# ── GCP credentials bootstrap (for Render / cloud deployments) ────────────────
# On cloud hosts you can't use a file — paste the full JSON as an env var.
_creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "")
if _creds_json and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    try:
        _tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w")
        _tmp.write(_creds_json)
        _tmp.close()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _tmp.name
    except Exception as _e:
        print(f"[WARN] Could not write GCP credentials: {_e}")


app = FastAPI(
    title="Distributed Log Analytics API",
    description=(
        "REST API for querying processed HDFS log data, "
        "anomaly detection results, and evaluation metrics. "
        "Processes results from the PySpark pipeline stored as Parquet."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(pipeline_router)


@app.get("/", tags=["root"])
def root():
    return {
        "message": "Distributed Log Analytics API",
        "docs": "/docs",
        "health": "/api/health",
    }
