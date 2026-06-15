"""
1Moby Analytics ML API — internal-only.

All user-facing routes are now served by the Elysia API service (apps/api/).
FastAPI exists here for:
  - Docker healthcheck (GET /health)
  - Internal ML v2 endpoints once the new training/prediction logic is wired
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from api.database import get_db, engine

MODEL_DIR = Path(os.getenv("MODEL_DIR", str(Path(__file__).parent.parent.parent / "models")))

ALLOWED_ORIGINS = [
    o.strip() for o in
    os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]


def _require_internal_token(request: Request) -> None:
    import hmac as _hmac
    token    = request.headers.get("x-internal-token", "")
    expected = os.getenv("INTERNAL_SERVICE_TOKEN", "")
    if not expected or not _hmac.compare_digest(token, expected):
        raise HTTPException(403, "Invalid internal token")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[ML API] Starting up...")
    yield
    print("[ML API] Shutting down...")
    await engine.dispose()


app = FastAPI(title="1Moby ML API (internal)", version="6.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────
@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "db": "connected",
        "models_dir": str(MODEL_DIR),
        "message": "ML v2 internal API: health + training/prediction job triggers.",
    }


# ── Internal ML v2 job triggers ────────────────────────────────────
# Elysia creates the run row (status=pending) then POSTs here. The job runs
# as a detached subprocess so the HTTP call returns immediately; the runner
# itself owns all status/progress updates on the run row.

import subprocess
import sys

APP_ROOT = Path(__file__).resolve().parents[1]


def _spawn_job(module: str, flag: str, run_id: str) -> int:
    process = subprocess.Popen(
        [sys.executable, "-m", module, flag, run_id],
        cwd=str(APP_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return process.pid


@app.post("/internal/training-runs")
async def internal_training_run(request: Request):
    _require_internal_token(request)
    body = await request.json()
    training_run_id = body.get("training_run_id")
    if not training_run_id:
        raise HTTPException(400, "training_run_id is required")
    pid = _spawn_job("src.cli.train", "--training-run-id", training_run_id)
    return {"accepted": True, "training_run_id": training_run_id, "pid": pid}


@app.post("/internal/prediction-runs")
async def internal_prediction_run(request: Request):
    _require_internal_token(request)
    body = await request.json()
    prediction_run_id = body.get("prediction_run_id")
    if not prediction_run_id:
        raise HTTPException(400, "prediction_run_id is required")
    pid = _spawn_job("src.cli.predict", "--prediction-run-id", prediction_run_id)
    return {"accepted": True, "prediction_run_id": prediction_run_id, "pid": pid}
