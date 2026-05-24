"""
1Moby Analytics ML API — internal-only after Phase 6 refactor.

All user-facing routes are now served by the Elysia API service (apps/api/).
FastAPI exists here for:
  - Docker healthcheck (GET /health)
  - SHAP explanation proxy from Elysia (GET /internal/explain)
  - Model training trigger from Elysia (POST /internal/train)
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
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
    churn_ok      = (MODEL_DIR / "churn_model.pkl").exists()
    winback_ok    = (MODEL_DIR / "winback_model.pkl").exists()
    conversion_ok = (MODEL_DIR / "conversion_model.pkl").exists()
    all_ok        = churn_ok and winback_ok and conversion_ok
    return {
        "status":  "ok" if all_ok else "degraded",
        "db":      "connected",
        "models":  {"churn": churn_ok, "winback": winback_ok, "conversion": conversion_ok},
        "message": None if all_ok else "Models not trained — run: python train.py <data_file>",
    }


# ── Internal Explain ───────────────────────────────────────────────
@app.get("/internal/explain")
async def internal_explain(
    run_id: str,
    acc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """SHAP explanation called by Elysia. Authenticated via X-Internal-Token."""
    _require_internal_token(request)
    raise HTTPException(
        503,
        "SHAP explain unavailable: legacy raw_* tables removed; wire predict_raw_* first.",
    )


# ── Internal Train ─────────────────────────────────────────────────
@app.post("/internal/train")
async def internal_train(request: Request):
    """Model training triggered by Elysia. Authenticated via X-Internal-Token."""
    _require_internal_token(request)
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    cutoff_date: str | None = body.get("cutoff_date")
    return await _do_train(cutoff_date=cutoff_date)


async def _do_train(cutoff_date: str | None = None):
    import asyncio, uuid

    train_script = Path(__file__).parent.parent / "train.py"
    if not train_script.exists():
        raise HTTPException(500, "train.py not found in ML container")

    data_dir   = Path(os.getenv("DATA_DIR", "/data"))
    xlsx_files = list(data_dir.glob("*.xlsx"))
    if not xlsx_files:
        raise HTTPException(400, "No .xlsx data file found in DATA_DIR — upload data first")

    data_file = str(sorted(xlsx_files)[-1])
    job_id    = str(uuid.uuid4())

    # Build the command — pass cutoff as second arg if provided
    cmd = ["python", str(train_script), data_file]
    if cutoff_date:
        cmd.append(cutoff_date)

    async def _run():
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        await proc.communicate()

    asyncio.create_task(_run())
    return {
        "job_id":       job_id,
        "status":       "started",
        "data_file":    data_file,
        "cutoff_date":  cutoff_date or os.getenv("TRAIN_CUTOFF_DATE", "2025-07-01"),
        "message":      "Training started — check /training-log for progress",
    }
