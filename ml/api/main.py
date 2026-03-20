"""
1Moby Analytics V2 — FastAPI
Full lifecycle: upload → validate → enqueue → worker → predict all stages
"""
import os, io, json, csv
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID
from datetime import date

import pandas as pd
from arq import create_pool
from fastapi import FastAPI, Request, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.database import get_db, engine
from worker.predict_worker import REDIS_SETTINGS

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[API] Starting up...")
    app.state.arq = await create_pool(REDIS_SETTINGS)
    yield
    print("[API] Shutting down...")
    await app.state.arq.aclose()
    await engine.dispose()


app = FastAPI(title="1Moby Analytics API", version="4.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class RunCreate(BaseModel):
    name: str
    cutoff_date: date


# ── Runs ──────────────────────────────────────────────────────────
@app.get("/runs")
async def list_runs(db: AsyncSession = Depends(get_db)):
    rows = await db.execute(text("""
        SELECT id, name, status, cutoff_date,
               total_customers, active_customers,
               error_message, created_at, updated_at
        FROM prediction_runs ORDER BY created_at DESC LIMIT 50
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
    row = await db.execute(text("SELECT * FROM prediction_runs WHERE id = :id"), {"id": str(run_id)})
    r = row.mappings().first()
    if not r: raise HTTPException(404, "Run not found")
    return dict(r)


@app.delete("/runs/{run_id}")
async def delete_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM prediction_runs WHERE id = :id"), {"id": str(run_id)})
    await db.commit()
    return {"deleted": True}


# ── Upload ────────────────────────────────────────────────────────
@app.post("/runs/{run_id}/upload")
async def upload_file(run_id: UUID, request: Request,
                      file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    row = await db.execute(text("SELECT id, status FROM prediction_runs WHERE id = :id"), {"id": str(run_id)})
    run = row.mappings().first()
    if not run: raise HTTPException(404, "Run not found")
    if run["status"] not in ("pending", "failed"):
        raise HTTPException(400, f"Run status is '{run['status']}' — cannot re-upload")

    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df_map = {"Users+User_profile": pd.read_csv(io.BytesIO(content))}
        else:
            df_map = pd.read_excel(io.BytesIO(content), sheet_name=None)
    except Exception as e:
        await _set_status(db, run_id, "failed", str(e))
        raise HTTPException(400, f"Cannot parse file: {e}")

    required = ["Users+User_profile", "Backend_payment"]
    missing = [s for s in required if s not in df_map]
    if missing:
        msg = f"Missing sheets: {missing}"
        await _set_status(db, run_id, "failed", msg)
        raise HTTPException(422, msg)

    await _set_status(db, run_id, "validating")
    try:
        await _insert_raw(db, run_id, df_map)
        await _set_status(db, run_id, "processing")
    except Exception as e:
        await _set_status(db, run_id, "failed", str(e))
        raise HTTPException(500, f"DB insert error: {e}")

    await request.app.state.arq.enqueue_job("run_prediction_pipeline", str(run_id), str(MODEL_DIR))
    return {"run_id": str(run_id), "status": "processing", "message": "Prediction queued"}


# ── Predictions V2 ────────────────────────────────────────────────
@app.get("/runs/{run_id}/predictions")
async def get_predictions(
    run_id: UUID, page: int = 1, page_size: int = 50,
    lifecycle_stage: str | None = None,
    churn_tier: str | None = None, rfm_segment: str | None = None,
    urgency: str | None = None, winback_tier: str | None = None,
    conversion_tier: str | None = None, search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    filters = ["run_id = :run_id"]
    params = {"run_id": str(run_id), "limit": page_size, "offset": (page - 1) * page_size}

    if lifecycle_stage:
        filters.append("lifecycle_stage = :lifecycle_stage")
        params["lifecycle_stage"] = lifecycle_stage
    if churn_tier:
        filters.append("churn_tier = :churn_tier")
        params["churn_tier"] = churn_tier
    if rfm_segment:
        filters.append("rfm_segment = :rfm_segment")
        params["rfm_segment"] = rfm_segment
    if urgency:
        filters.append("urgency = :urgency")
        params["urgency"] = urgency
    if winback_tier:
        filters.append("winback_tier = :winback_tier")
        params["winback_tier"] = winback_tier
    if conversion_tier:
        filters.append("conversion_tier = :conversion_tier")
        params["conversion_tier"] = conversion_tier
    if search:
        filters.append("CAST(acc_id AS TEXT) LIKE :search")
        params["search"] = f"%{search}%"

    where = " AND ".join(filters)
    rows = await db.execute(text(f"""
        SELECT * FROM predictions WHERE {where}
        ORDER BY priority_score DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """), params)

    count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
    count_row = await db.execute(text(f"SELECT COUNT(*) FROM predictions WHERE {where}"), count_params)
    total = count_row.scalar()

    return {"total": total, "page": page, "page_size": page_size,
            "data": [dict(r._mapping) for r in rows]}


@app.get("/runs/{run_id}/predictions/{acc_id}")
async def get_customer_prediction(run_id: UUID, acc_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.execute(text("""
        SELECT * FROM predictions WHERE run_id = :run_id AND acc_id = :acc_id
    """), {"run_id": str(run_id), "acc_id": acc_id})
    r = row.mappings().first()
    if not r: raise HTTPException(404, "Customer not found")
    return dict(r)


# ── Dashboard Summary V2 ──────────────────────────────────────────
@app.get("/runs/{run_id}/summary")
async def get_summary(run_id: UUID, db: AsyncSession = Depends(get_db)):
    # Lifecycle breakdown
    stages = await db.execute(text("""
        SELECT lifecycle_stage, sub_stage, COUNT(*) as count
        FROM predictions WHERE run_id = :r
        GROUP BY lifecycle_stage, sub_stage ORDER BY count DESC
    """), {"r": str(run_id)})
    lifecycle = {}
    for r in stages.mappings():
        stage = r["lifecycle_stage"] or "Unknown"
        if stage not in lifecycle:
            lifecycle[stage] = {"total": 0, "sub_stages": {}}
        lifecycle[stage]["total"] += r["count"]
        lifecycle[stage]["sub_stages"][r["sub_stage"] or ""] = r["count"]

    # Active Paid KPIs
    kpi = await db.execute(text("""
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN sub_stage = 'At Risk' THEN 1 ELSE 0 END) AS at_risk,
          SUM(CASE WHEN sub_stage = 'Healthy' THEN 1 ELSE 0 END) AS healthy,
          ROUND(AVG(predicted_clv_6m)::numeric, 0) AS avg_clv,
          ROUND(SUM(COALESCE(revenue_at_risk,0))::numeric, 0) AS revenue_at_risk,
          SUM(CASE WHEN urgency = 'Critical' THEN 1 ELSE 0 END) AS critical_topup
        FROM predictions WHERE run_id = :r AND lifecycle_stage = 'Active Paid'
    """), {"r": str(run_id)})
    active_paid_kpi = dict(kpi.mappings().first() or {})

    # Churned KPIs
    wb = await db.execute(text("""
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN winback_tier='High' THEN 1 ELSE 0 END) AS high,
          SUM(CASE WHEN winback_tier='Medium' THEN 1 ELSE 0 END) AS medium,
          ROUND(AVG(comeback_probability)::numeric, 4) AS avg_comeback
        FROM predictions WHERE run_id = :r AND lifecycle_stage = 'Churned'
    """), {"r": str(run_id)})
    winback_kpi = dict(wb.mappings().first() or {})

    # Active Free KPIs
    cv = await db.execute(text("""
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN conversion_tier='High' THEN 1 ELSE 0 END) AS high,
          ROUND(AVG(conversion_probability)::numeric, 4) AS avg_convert
        FROM predictions WHERE run_id = :r AND lifecycle_stage = 'Active Free'
    """), {"r": str(run_id)})
    conversion_kpi = dict(cv.mappings().first() or {})

    # Distributions
    churn_dist = await db.execute(text("""
        SELECT churn_tier, COUNT(*) as count FROM predictions
        WHERE run_id = :r AND lifecycle_stage = 'Active Paid'
        GROUP BY churn_tier
    """), {"r": str(run_id)})

    rfm_dist = await db.execute(text("""
        SELECT rfm_segment, COUNT(*) as count FROM predictions
        WHERE run_id = :r AND rfm_segment IS NOT NULL
        GROUP BY rfm_segment ORDER BY count DESC
    """), {"r": str(run_id)})

    urgency_dist = await db.execute(text("""
        SELECT urgency, COUNT(*) as count FROM predictions
        WHERE run_id = :r AND urgency IS NOT NULL
        GROUP BY urgency ORDER BY count DESC
    """), {"r": str(run_id)})

    return {
        "lifecycle": lifecycle,
        "active_paid": active_paid_kpi,
        "winback": winback_kpi,
        "conversion": conversion_kpi,
        "churn_distribution": {r["churn_tier"]: r["count"] for r in churn_dist.mappings()},
        "rfm_distribution": {r["rfm_segment"]: r["count"] for r in rfm_dist.mappings()},
        "urgency_distribution": {r["urgency"]: r["count"] for r in urgency_dist.mappings()},
    }


# ── Export ─────────────────────────────────────────────────────────
@app.get("/runs/{run_id}/export")
async def export_predictions(
    run_id: UUID,
    lifecycle_stage: str | None = None,
    churn_tier: str | None = None,
    winback_tier: str | None = None,
    conversion_tier: str | None = None,
    format: str = "csv",
    db: AsyncSession = Depends(get_db),
):
    filters = ["run_id = :run_id"]
    params = {"run_id": str(run_id)}
    if lifecycle_stage:
        filters.append("lifecycle_stage = :ls"); params["ls"] = lifecycle_stage
    if churn_tier:
        filters.append("churn_tier = :ct"); params["ct"] = churn_tier
    if winback_tier:
        filters.append("winback_tier = :wt"); params["wt"] = winback_tier
    if conversion_tier:
        filters.append("conversion_tier = :cvt"); params["cvt"] = conversion_tier

    where = " AND ".join(filters)
    rows = await db.execute(text(f"""
        SELECT acc_id, lifecycle_stage, sub_stage, recommended_action,
               churn_probability, churn_tier, predicted_clv_6m, rfm_segment,
               urgency, alert_date, comeback_probability, winback_tier,
               conversion_probability, conversion_tier,
               priority_score, revenue_at_risk, n_purchases
        FROM predictions WHERE {where}
        ORDER BY priority_score DESC NULLS LAST
    """), params)

    data = [dict(r._mapping) for r in rows]

    output = io.StringIO()
    if data:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

    output.seek(0)
    filename = f"1moby_export_{lifecycle_stage or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ── Model Metrics ──────────────────────────────────────────────────
@app.get("/model-metrics")
async def get_model_metrics():
    metrics_path = MODEL_DIR / "metrics.json"
    if not metrics_path.exists():
        raise HTTPException(404, "No metrics found — train models first")
    with open(metrics_path) as f:
        return json.load(f)


# ── Health ────────────────────────────────────────────────────────
@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    models_ok = (MODEL_DIR / "churn_model.pkl").exists()
    winback_ok = (MODEL_DIR / "winback_model.pkl").exists()
    conversion_ok = (MODEL_DIR / "conversion_model.pkl").exists()
    return {"status": "ok", "db": "connected",
            "models": {"churn": models_ok, "winback": winback_ok, "conversion": conversion_ok}}


# ── Helpers ───────────────────────────────────────────────────────
async def _set_status(db, run_id, status, error=None):
    await db.execute(text("""
        UPDATE prediction_runs SET status = :status, error_message = :error, updated_at = NOW()
        WHERE id = :id
    """), {"id": str(run_id), "status": status, "error": error})
    await db.commit()


async def _insert_raw(db, run_id, df_map):
    rid = str(run_id)
    for table in ("raw_usage", "raw_payments", "raw_customers"):
        await db.execute(text(f"DELETE FROM {table} WHERE run_id = :r"), {"r": rid})

    users = df_map["Users+User_profile"].copy()
    users.columns = [c.strip() for c in users.columns]
    users = users.rename(columns={
        "status (SMS)": "status_sms", "user.credit + user.credit_premium": "credit_sms",
        "credit_email": "credit_email", "expire": "expire_sms", "expire_email": "expire_email",
        "status (Email)": "status_email", "join_date": "join_date",
        "last_access": "last_access", "last_send": "last_send",
    })
    users["run_id"] = rid
    for _, row in users.iterrows():
        await db.execute(text("""
            INSERT INTO raw_customers (run_id,acc_id,status_sms,credit_sms,credit_email,
              expire_sms,expire_email,status_email,join_date,last_access,last_send)
            VALUES (:run_id,:acc_id,:status_sms,:credit_sms,:credit_email,
              :expire_sms,:expire_email,:status_email,:join_date,:last_access,:last_send)
        """), {
            "run_id": rid, "acc_id": _safe(row,"acc_id"),
            "status_sms": _safe(row,"status_sms"), "credit_sms": _safe(row,"credit_sms"),
            "credit_email": _safe(row,"credit_email"),
            "expire_sms": _safe_date(row,"expire_sms"), "expire_email": _safe_date(row,"expire_email"),
            "status_email": _safe(row,"status_email"), "join_date": _safe_date(row,"join_date"),
            "last_access": _safe_ts(row,"last_access"), "last_send": _safe_ts(row,"last_send"),
        })

    if "Backend_payment" in df_map:
        pay = df_map["Backend_payment"].copy()
        pay.columns = [c.strip() for c in pay.columns]
        for _, row in pay.iterrows():
            await db.execute(text("""
                INSERT INTO raw_payments (run_id,acc_id,payment_date,amount,credit_add,credit_type)
                VALUES (:run_id,:acc_id,:payment_date,:amount,:credit_add,:credit_type)
            """), {
                "run_id": rid, "acc_id": _safe(row,"acc_id"),
                "payment_date": _safe_ts(row,"payment_date"),
                "amount": _safe(row,"amount"), "credit_add": _safe(row,"credit_add"),
                "credit_type": _safe(row,"credit_type"),
            })

    usage_map = {
        "SMS_usage (BC)": ("sms","bc"), "SMS_usage (API)": ("sms","api"),
        "SMS_usage (OTP)": ("sms","otp"),
        "Email_usage (BC)": ("email","bc"), "Email_usage (API)": ("email","api"),
        "Email_usage (OTP)": ("email","otp"),
    }
    for sheet, (channel, source) in usage_map.items():
        if sheet not in df_map: continue
        df = df_map[sheet].copy()
        df.columns = [c.strip() for c in df.columns]
        for _, row in df.iterrows():
            await db.execute(text("""
                INSERT INTO raw_usage (run_id,acc_id,year,month,usage,channel,source)
                VALUES (:run_id,:acc_id,:year,:month,:usage,:channel,:source)
            """), {
                "run_id": rid, "acc_id": _safe(row,"acc_id"),
                "year": _safe(row,"year"), "month": _safe(row,"month"),
                "usage": _safe(row,"usage"), "channel": channel, "source": source,
            })
    await db.commit()


def _safe(row, col):
    v = row.get(col)
    if v is None: return None
    try:
        if pd.isna(v): return None
    except: pass
    try:
        if hasattr(v, "item"): return v.item()
    except: pass
    return v

def _safe_date(row, col):
    v = _safe(row, col)
    if v is None: return None
    try:
        ts = pd.Timestamp(v)
        return ts.date() if not pd.isna(ts) else None
    except: return None

def _safe_ts(row, col):
    v = _safe(row, col)
    if v is None: return None
    try:
        ts = pd.Timestamp(v)
        return ts.to_pydatetime() if not pd.isna(ts) else None
    except: return None
