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
        "message": "Legacy ML runtime removed; ML v2 training pipeline is being rebuilt.",
    }


# ── Internal Explain ───────────────────────────────────────────────
@app.get("/internal/explain")
async def internal_explain(
    run_id: str,
    acc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Placeholder until explanations are rebuilt on top of ml_prediction_outputs."""
    _require_internal_token(request)
    _ = (run_id, acc_id, db)
    raise HTTPException(
        503,
        "Explain unavailable until the ML v2 prediction output flow is implemented.",
    )


# ── Internal Train ─────────────────────────────────────────────────
@app.post("/internal/train")
async def internal_train(request: Request):
    """Placeholder until training is rebuilt on top of train_clean_*."""
    _require_internal_token(request)
    raise HTTPException(
        503,
        "Training unavailable until the ML v2 train_clean_* pipeline is implemented.",
    )
