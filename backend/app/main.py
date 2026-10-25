"""
FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .api.routes import router
from .api.pipeline_routes import router as pipeline_router

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
