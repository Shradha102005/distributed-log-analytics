"""
Pipeline management routes — upload logs & trigger processing.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])
logger = logging.getLogger(__name__)

# ── In-memory job store (single process, no Redis needed) ────────────────────

_jobs: dict[str, dict] = {}


class JobStatus(BaseModel):
    job_id: str
    status: str          # queued | running | done | failed
    message: str
    progress: int        # 0-100
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    error: Optional[str] = None
    filename: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _project_root() -> Path:
    """Return the project root (two levels above backend/)."""
    return Path(__file__).resolve().parents[4]


def _data_raw_dir() -> Path:
    d = _project_root() / "data" / "raw"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _run_pipeline_bg(job_id: str, log_path: str):
    """Run the pipeline in a background thread and update job state."""
    job = _jobs[job_id]
    job["status"] = "running"
    job["started_at"] = time.time()
    job["message"] = "Starting Spark pipeline…"
    job["progress"] = 5

    project_root = _project_root()
    pipeline_script = project_root / "pipeline" / "run_pipeline.py"

    # Use same Python interpreter (works on Windows & WSL)
    python_exec = sys.executable

    cmd = [
        python_exec, str(pipeline_script),
        "--sample",
        "--no-download",
        "--output", str(project_root / "outputs" / "parquet"),
        "--skip-anomaly",  # fast first pass; anomaly is a second step
    ]

    # Pass the uploaded file path via env override trick:
    # We copy the file to the standard location so ingestion picks it up.
    env = os.environ.copy()
    env["PIPELINE_CUSTOM_LOG"] = log_path

    logger.info("Launching pipeline: %s", " ".join(cmd))

    try:
        job["message"] = "Running Spark pipeline (this takes 2-5 min)…"
        job["progress"] = 15

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(project_root),
            env=env,
        )

        # Stream output and update progress
        progress_markers = {
            "Stage 1": 20,
            "Stage 2": 35,
            "Stage 3": 50,
            "Stage 4": 75,
            "anomaly": 80,
            "complete": 95,
            "pipeline complete": 95,
        }

        output_lines = []
        for line in proc.stdout:
            line = line.rstrip()
            output_lines.append(line)
            logger.debug("[pipeline] %s", line)
            for marker, pct in progress_markers.items():
                if marker.lower() in line.lower() and job["progress"] < pct:
                    job["progress"] = pct
                    job["message"] = line.strip()

        proc.wait()

        if proc.returncode == 0:
            job["status"] = "done"
            job["progress"] = 100
            job["message"] = "Pipeline complete! Refresh the dashboard to see results."
        else:
            job["status"] = "failed"
            job["progress"] = 0
            tail = "\n".join(output_lines[-20:])
            job["error"] = tail
            job["message"] = "Pipeline failed. See error details."

    except Exception as exc:
        job["status"] = "failed"
        job["error"] = str(exc)
        job["message"] = f"Unexpected error: {exc}"

    finally:
        job["finished_at"] = time.time()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/upload", summary="Upload a log file and queue the pipeline")
async def upload_and_run(file: UploadFile = File(...)):
    """
    Accept a .log / .txt log file, save it locally, and trigger
    the Spark pipeline in a background thread.
    """
    filename = file.filename or "uploaded.log"
    if not filename.endswith((".log", ".txt", ".gz")):
        raise HTTPException(
            status_code=400,
            detail="Only .log, .txt, or .gz files are supported.",
        )

    # Save to data/raw/
    dest = _data_raw_dir() / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    logger.info("Saved uploaded file to %s", dest)

    # Create job record
    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "message": f"File '{filename}' uploaded. Queued for processing…",
        "progress": 0,
        "started_at": None,
        "finished_at": None,
        "error": None,
        "filename": filename,
    }

    # Launch pipeline in background thread (non-blocking)
    t = threading.Thread(
        target=_run_pipeline_bg,
        args=(job_id, str(dest)),
        daemon=True,
    )
    t.start()

    return {"job_id": job_id, "filename": filename, "status": "queued"}


@router.get("/status/{job_id}", response_model=JobStatus, summary="Poll pipeline job status")
def job_status(job_id: str):
    """Poll the status of a pipeline job."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatus(**job)


@router.get("/jobs", summary="List all pipeline jobs")
def list_jobs():
    """List all recent pipeline jobs."""
    return list(reversed(list(_jobs.values())))
