"""
1Moby Analytics — FastAPI
DB-backed: upload → validate → background predict → save results
"""
import os, io, json
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID
from datetime import date

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.database import get_db, engine
from worker.predict_worker import run_prediction_pipeline

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


# ── Lifespan ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[API] Starting up...")
    yield
    print("[API] Shutting down...")
    await engine.dispose()


app = FastAPI(title="1Moby Analytics API", version="3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────
class RunCreate(BaseModel):
    name:        str
    cutoff_date: date


# ── Runs ──────────────────────────────────────────────────────────
@app.get("/runs")
async def list_runs(db: AsyncSession = Depends(get_db)):
    rows = await db.execute(text("""
        SELECT id, name, status, cutoff_date,
               total_customers, active_customers,
               error_message, created_at, updated_at
        FROM prediction_runs
        ORDER BY created_at DESC
        LIMIT 50
    """))
    return [dict(r._mapping) for r in rows]


@app.post("/runs")
async def create_run(body: RunCreate, db: AsyncSession = Depends(get_db)):
    row = await db.execute(text("""
        INSERT INTO prediction_runs (name, cutoff_date, status)
        VALUES (:name, :cutoff, 'pending')
        RETURNING id, name, status, cutoff_date, created_at
    """), {"name": body.name, "cutoff": body.cutoff_date})
    await db.commit()
    return dict(row.mappings().first())


@app.get("/runs/{run_id}")
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await db.execute(text("""
        SELECT * FROM prediction_runs WHERE id = :id
    """), {"id": str(run_id)})
    r = row.mappings().first()
    if not r:
        raise HTTPException(404, "Run not found")
    return dict(r)


@app.delete("/runs/{run_id}")
async def delete_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM prediction_runs WHERE id = :id"),
                     {"id": str(run_id)})
    await db.commit()
    return {"deleted": True}


# ── Upload + Predict ──────────────────────────────────────────────
@app.post("/runs/{run_id}/upload")
async def upload_file(
    run_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    อัปโหลด Excel/CSV → validate → insert raw data → trigger background predict
    """
    # Check run exists
    row = await db.execute(text("SELECT id, status FROM prediction_runs WHERE id = :id"),
                           {"id": str(run_id)})
    run = row.mappings().first()
    if not run:
        raise HTTPException(404, "Run not found")
    if run["status"] not in ("pending", "failed"):
        raise HTTPException(400, f"Run status is '{run['status']}' — cannot re-upload")

    # Read file
    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            # CSV: สมมติว่า flat format จาก users sheet
            df_map = {"Users+User_profile": pd.read_csv(io.BytesIO(content))}
        else:
            df_map = pd.read_excel(io.BytesIO(content), sheet_name=None)
    except Exception as e:
        await _set_status(db, run_id, "failed", str(e))
        raise HTTPException(400, f"Cannot parse file: {e}")

    # Validate required sheets
    required = ["Users+User_profile", "Backend_payment"]
    missing  = [s for s in required if s not in df_map]
    if missing:
        msg = f"Missing sheets: {missing}"
        await _set_status(db, run_id, "failed", msg)
        raise HTTPException(422, msg)

    # Update status → validating
    await _set_status(db, run_id, "validating")

    # Insert raw data
    try:
        await _insert_raw(db, run_id, df_map)
        await _set_status(db, run_id, "processing")
    except Exception as e:
        await _set_status(db, run_id, "failed", str(e))
        raise HTTPException(500, f"DB insert error: {e}")

    # Fire background predict
    background_tasks.add_task(
        run_prediction_pipeline,
        str(run_id), str(MODEL_DIR)
    )

    return {"run_id": str(run_id), "status": "processing", "message": "Prediction started"}


# ── Predictions ───────────────────────────────────────────────────
@app.get("/runs/{run_id}/predictions")
async def get_predictions(
    run_id: UUID,
    page: int = 1,
    page_size: int = 50,
    churn_tier: str | None = None,
    rfm_segment: str | None = None,
    urgency: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    filters = ["run_id = :run_id"]
    params: dict = {"run_id": str(run_id), "limit": page_size, "offset": (page - 1) * page_size}

    if churn_tier:
        filters.append("churn_tier = :churn_tier")
        params["churn_tier"] = churn_tier
    if rfm_segment:
        filters.append("rfm_segment = :rfm_segment")
        params["rfm_segment"] = rfm_segment
    if urgency:
        filters.append("urgency = :urgency")
        params["urgency"] = urgency

    where = " AND ".join(filters)
    rows = await db.execute(text(f"""
        SELECT * FROM predictions WHERE {where}
        ORDER BY priority_score DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """), params)

    count_row = await db.execute(text(f"""
        SELECT COUNT(*) FROM predictions WHERE {where}
    """), {k: v for k, v in params.items() if k not in ("limit", "offset")})
    total = count_row.scalar()

    return {"total": total, "page": page, "page_size": page_size,
            "data": [dict(r._mapping) for r in rows]}


@app.get("/runs/{run_id}/predictions/{acc_id}")
async def get_customer_prediction(run_id: UUID, acc_id: int,
                                   db: AsyncSession = Depends(get_db)):
    row = await db.execute(text("""
        SELECT * FROM predictions WHERE run_id = :run_id AND acc_id = :acc_id
    """), {"run_id": str(run_id), "acc_id": acc_id})
    r = row.mappings().first()
    if not r:
        raise HTTPException(404, "Customer not found")
    return dict(r)


# ── Dashboard Summary ─────────────────────────────────────────────
@app.get("/runs/{run_id}/summary")
async def get_summary(run_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await db.execute(text("""
        SELECT
          COUNT(*)                                          AS total,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END)  AS active,
          SUM(CASE WHEN churn_tier = 'High' THEN 1 ELSE 0 END) AS high_churn,
          ROUND(AVG(CASE WHEN is_active=1 THEN predicted_clv_6m END)::numeric, 0) AS avg_clv,
          ROUND(SUM(revenue_at_risk)::numeric, 0)          AS revenue_at_risk,
          SUM(CASE WHEN urgency = 'Critical' THEN 1 ELSE 0 END) AS critical_topup
        FROM predictions WHERE run_id = :run_id
    """), {"run_id": str(run_id)})
    summary = dict(row.mappings().first() or {})

    tiers = await db.execute(text("""
        SELECT churn_tier, COUNT(*) as count
        FROM predictions WHERE run_id = :run_id
        GROUP BY churn_tier
    """), {"run_id": str(run_id)})
    summary["churn_tiers"] = {r["churn_tier"]: r["count"] for r in tiers.mappings()}

    segs = await db.execute(text("""
        SELECT rfm_segment, COUNT(*) as count
        FROM predictions WHERE run_id = :run_id AND rfm_segment IS NOT NULL
        GROUP BY rfm_segment ORDER BY count DESC
    """), {"run_id": str(run_id)})
    summary["rfm_segments"] = [dict(r._mapping) for r in segs]

    urg = await db.execute(text("""
        SELECT urgency, COUNT(*) as count
        FROM predictions WHERE run_id = :run_id AND urgency IS NOT NULL
        GROUP BY urgency ORDER BY count DESC
    """), {"run_id": str(run_id)})
    summary["urgency_dist"] = {r["urgency"]: r["count"] for r in urg.mappings()}

    return summary


# ── Health ────────────────────────────────────────────────────────
@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    models_ok = (MODEL_DIR / "churn_model.pkl").exists()
    return {"status": "ok", "db": "connected", "models_loaded": models_ok}


# ── Helpers ───────────────────────────────────────────────────────
async def _set_status(db: AsyncSession, run_id, status: str, error: str | None = None):
    await db.execute(text("""
        UPDATE prediction_runs
        SET status = :status, error_message = :error, updated_at = NOW()
        WHERE id = :id
    """), {"id": str(run_id), "status": status, "error": error})
    await db.commit()


async def _insert_raw(db: AsyncSession, run_id, df_map: dict):
    rid = str(run_id)

    # Delete old data for this run
    for table in ("raw_usage", "raw_payments", "raw_customers"):
        await db.execute(text(f"DELETE FROM {table} WHERE run_id = :r"), {"r": rid})

    # Users
    users = df_map["Users+User_profile"].copy()
    users.columns = [c.strip() for c in users.columns]
    users = users.rename(columns={
        "status (SMS)": "status_sms",
        "user.credit + user.credit_premium": "credit_sms",
        "credit_email": "credit_email",
        "expire": "expire_sms",
        "expire_email": "expire_email",
        "status (Email)": "status_email",
        "join_date": "join_date",
        "last_access": "last_access",
        "last_send": "last_send",
    })
    users["run_id"] = rid
    for _, row in users.iterrows():
        await db.execute(text("""
            INSERT INTO raw_customers
              (run_id,acc_id,status_sms,credit_sms,credit_email,
               expire_sms,expire_email,status_email,join_date,last_access,last_send)
            VALUES
              (:run_id,:acc_id,:status_sms,:credit_sms,:credit_email,
               :expire_sms,:expire_email,:status_email,:join_date,:last_access,:last_send)
        """), {
            "run_id": rid, "acc_id": _safe(row, "acc_id"),
            "status_sms": _safe(row, "status_sms"), "credit_sms": _safe(row, "credit_sms"),
            "credit_email": _safe(row, "credit_email"),
            "expire_sms": _safe_date(row, "expire_sms"),
            "expire_email": _safe_date(row, "expire_email"),
            "status_email": _safe(row, "status_email"),
            "join_date": _safe_date(row, "join_date"),
            "last_access": _safe_ts(row, "last_access"),
            "last_send": _safe_ts(row, "last_send"),
        })

    # Payments
    if "Backend_payment" in df_map:
        pay = df_map["Backend_payment"].copy()
        pay.columns = [c.strip() for c in pay.columns]
        for _, row in pay.iterrows():
            await db.execute(text("""
                INSERT INTO raw_payments (run_id,acc_id,payment_date,amount,credit_add,credit_type)
                VALUES (:run_id,:acc_id,:payment_date,:amount,:credit_add,:credit_type)
            """), {
                "run_id": rid, "acc_id": _safe(row, "acc_id"),
                "payment_date": _safe_ts(row, "payment_date"),
                "amount": _safe(row, "amount"), "credit_add": _safe(row, "credit_add"),
                "credit_type": _safe(row, "credit_type"),
            })

    # Usage sheets
    usage_map = {
        "SMS_usage (BC)": ("sms","bc"), "SMS_usage (API)": ("sms","api"),
        "Email_usage (BC)": ("email","bc"), "Email_usage (API)": ("email","api"),
        "Email_usage (OTP)": ("email","otp"),
    }
    for sheet, (channel, source) in usage_map.items():
        if sheet not in df_map:
            continue
        df = df_map[sheet].copy()
        df.columns = [c.strip() for c in df.columns]
        for _, row in df.iterrows():
            await db.execute(text("""
                INSERT INTO raw_usage (run_id,acc_id,year,month,usage,channel,source)
                VALUES (:run_id,:acc_id,:year,:month,:usage,:channel,:source)
            """), {
                "run_id": rid, "acc_id": _safe(row, "acc_id"),
                "year": _safe(row, "year"), "month": _safe(row, "month"),
                "usage": _safe(row, "usage"), "channel": channel, "source": source,
            })

    await db.commit()


def _safe(row, col):
    v = row.get(col)
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except:
        pass
    try:
        if hasattr(v, "item"):
            return v.item()
    except:
        pass
    return v

def _safe_date(row, col):
    v = _safe(row, col)
    if v is None:
        return None
    try:
        ts = pd.Timestamp(v)
        if pd.isna(ts):
            return None
        return ts.date()
    except:
        return None

def _safe_ts(row, col):
    v = _safe(row, col)
    if v is None:
        return None
    try:
        ts = pd.Timestamp(v)
        if pd.isna(ts):
            return None
        return ts.to_pydatetime()
    except:
        return None
