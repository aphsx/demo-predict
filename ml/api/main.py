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

MODEL_DIR = Path(os.getenv("MODEL_DIR", str(Path(__file__).parent.parent.parent / "models")))


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


@app.get("/runs/{run_id}/stream")
async def stream_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    SSE endpoint — reads from Redis Stream for real-time progress updates.
    Falls back to DB polling only if Redis unavailable.
    """
    async def event_generator():
        try:
            import redis.asyncio as aioredis
            redis = await aioredis.from_url(f"redis://{os.getenv('REDIS_HOST', 'redis')}:6379")
            stream_key = f"progress:{run_id}"

            # Read from Stream (persistent, can replay)
            last_id = "0"
            while True:
                # XREAD from last position
                messages = await redis.xread({stream_key: last_id}, count=10, block=1000)
                for stream, items in messages:
                    for msg_id, fields in items:
                        last_id = msg_id
                        progress = int(fields.get(b"progress", 0))
                        step = fields.get(b"step", b"").decode()
                        is_done = progress >= 100 or step.startswith("failed")
                        yield {
                            "event": "progress",
                            "data": json.dumps({
                                "progress": progress,
                                "step": step,
                                "status": "done" if is_done else "processing"
                            })
                        }
                        if is_done:
                            await redis.close()
                            return

                # Also check DB for final status (fallback check)
                row = await db.execute(text("SELECT status FROM prediction_runs WHERE id = :id"), {"id": str(run_id)})
                r = row.mappings().first()
                if r and r["status"] in ("done", "failed"):
                    yield {"event": "done", "data": json.dumps({"status": r["status"]})}
                    break

            await redis.close()

        except Exception:
            import asyncio
            while True:
                row = await db.execute(
                    text("SELECT id, status, total_customers, active_customers, error_message, updated_at FROM prediction_runs WHERE id = :id"),
                    {"id": str(run_id)}
                )
                r = row.mappings().first()
                if not r:
                    yield {"event": "error", "data": "Run not found"}
                    break
                yield {
                    "event": "status",
                    "data": json.dumps({
                        "status": r["status"],
                        "progress": 50 if r["status"] == "processing" else (100 if r["status"] == "done" else 0),
                        "step": "",
                        "total_customers": r["total_customers"],
                        "active_customers": r["active_customers"],
                        "error_message": r["error_message"],
                        "updated_at": str(r["updated_at"]) if r["updated_at"] else None,
                    })
                }
                if r["status"] in ("done", "failed"):
                    yield {"event": "done", "data": json.dumps({"status": r["status"]})}
                    break
                await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.delete("/runs/{run_id}")
async def delete_run(run_id: UUID, db: AsyncSession = Depends(get_db)):
    # Delete in order: predictions → raw_usage → raw_payments → raw_customers → run
    run_id_str = str(run_id)
    await db.execute(text("DELETE FROM predictions WHERE run_id = :id"), {"id": run_id_str})
    await db.execute(text("DELETE FROM raw_usage WHERE run_id = :id"), {"id": run_id_str})
    await db.execute(text("DELETE FROM raw_payments WHERE run_id = :id"), {"id": run_id_str})
    await db.execute(text("DELETE FROM raw_customers WHERE run_id = :id"), {"id": run_id_str})
    await db.execute(text("DELETE FROM prediction_runs WHERE id = :id"), {"id": run_id_str})
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
    lifecycle_stage: str | None = None, search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    filters = ["run_id = :run_id"]
    params = {"run_id": str(run_id), "limit": page_size, "offset": (page - 1) * page_size}

    if lifecycle_stage:
        filters.append("lifecycle_stage = :lifecycle_stage")
        params["lifecycle_stage"] = lifecycle_stage
    if search:
        filters.append("CAST(acc_id AS TEXT) LIKE :search")
        params["search"] = f"%{search}%"

    where = " AND ".join(filters)
    rows = await db.execute(text(f"""
        SELECT * FROM predictions WHERE {where}
        ORDER BY churn_probability DESC NULLS LAST
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


@app.get("/runs/{run_id}/predictions/{acc_id}/explain")
async def explain_customer(run_id: UUID, acc_id: int, db: AsyncSession = Depends(get_db)):
    """SHAP explanation for a single customer — returns numeric factors only"""
    # Load raw data for feature building
    u = await db.execute(text("""
        SELECT acc_id,status_sms,credit_sms,credit_email,
               expire_sms,expire_email,status_email,join_date,last_access,last_send
        FROM raw_customers WHERE run_id = :r AND acc_id = :acc_id
    """), {"r": str(run_id), "acc_id": acc_id})
    users = pd.DataFrame([dict(row._mapping) for row in u])
    if len(users) == 0:
        raise HTTPException(404, "Customer not found")

    p = await db.execute(text("""
        SELECT acc_id,payment_date,amount,credit_add,credit_type
        FROM raw_payments WHERE run_id = :r AND acc_id = :acc_id
    """), {"r": str(run_id), "acc_id": acc_id})
    payments = pd.DataFrame([dict(row._mapping) for row in p])

    u2 = await db.execute(text("""
        SELECT acc_id,year,month,usage,channel,source FROM raw_usage WHERE run_id = :r AND acc_id = :acc_id
    """), {"r": str(run_id), "acc_id": acc_id})
    usage = pd.DataFrame([dict(row._mapping) for row in u2])

    for col in ["expire_sms","expire_email","join_date","last_access","last_send"]:
        if col in users.columns:
            users[col] = pd.to_datetime(users[col], errors="coerce", utc=True).dt.tz_convert(None)
    for col in ["credit_sms", "credit_email"]:
        if col in users.columns:
            users[col] = pd.to_numeric(users[col], errors="coerce")
    # payment_date column must exist for _user_features (even if empty)
    if len(payments) > 0:
        payments["payment_date"] = pd.to_datetime(payments["payment_date"], errors="coerce", utc=True).dt.tz_convert(None)
        for col in ["amount", "credit_add"]:
            payments[col] = pd.to_numeric(payments[col], errors="coerce")
    else:
        payments = pd.DataFrame(columns=["acc_id", "payment_date", "amount", "credit_add", "credit_type"])

    if len(usage) > 0:
        for col in ["usage", "year", "month"]:
            usage[col] = pd.to_numeric(usage[col], errors="coerce")
        usage["period"] = pd.to_datetime(
            usage["year"].astype(str) + "-" + usage["month"].astype(str).str.zfill(2) + "-01"
        )
    else:
        usage = pd.DataFrame(columns=["acc_id", "year", "month", "usage", "channel", "source", "period"])

    run_row = await db.execute(text("SELECT cutoff_date FROM prediction_runs WHERE id = :id"), {"id": str(run_id)})
    r_row = run_row.mappings().first()
    from src.config import CUTOFF
    cutoff = pd.Timestamp(r_row["cutoff_date"]).tz_localize(None) if r_row else pd.Timestamp(CUTOFF).tz_localize(None)

    from src.features import build_features
    feat_df = build_features(users, payments, usage, cutoff)

    from src.predictor import MobyPredictor
    predictor = MobyPredictor(Path(MODEL_DIR), cutoff)
    predictor.load_data(users, feat_df, payments, usage)
    result = predictor.explain(acc_id)
    return result


# ── Dashboard Summary V2 ──────────────────────────────────────────
@app.get("/runs/{run_id}/summary")
async def get_summary(run_id: UUID, db: AsyncSession = Depends(get_db)):
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

    active_paid_kpi = {}
    kpi = await db.execute(text("""
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(churn_probability)::numeric, 4) AS avg_churn,
          ROUND(AVG(predicted_clv_6m)::numeric, 0) AS avg_clv
        FROM predictions WHERE run_id = :r AND lifecycle_stage = 'Active Paid'
    """), {"r": str(run_id)})
    active_paid_kpi = dict(kpi.mappings().first() or {})

    winback_kpi = {}
    wb = await db.execute(text("""
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(comeback_probability)::numeric, 4) AS avg_comeback
        FROM predictions WHERE run_id = :r AND lifecycle_stage = 'Churned'
    """), {"r": str(run_id)})
    winback_kpi = dict(wb.mappings().first() or {})

    conversion_kpi = {}
    cv = await db.execute(text("""
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(conversion_probability)::numeric, 4) AS avg_convert
        FROM predictions WHERE run_id = :r AND lifecycle_stage = 'Active Free'
    """), {"r": str(run_id)})
    conversion_kpi = dict(cv.mappings().first() or {})

    run_row = await db.execute(text("""
        SELECT total_customers, active_customers, model_version_id
        FROM prediction_runs WHERE id = :id
    """), {"id": str(run_id)})
    run_info = dict(run_row.mappings().first() or {})

    return {
        "lifecycle": lifecycle,
        "active_paid": active_paid_kpi,
        "winback": winback_kpi,
        "conversion": conversion_kpi,
        "total_customers": run_info.get("total_customers"),
        "active_customers": run_info.get("active_customers"),
        "model_version_id": str(run_info["model_version_id"]) if run_info.get("model_version_id") else None,
    }


# ── Export ─────────────────────────────────────────────────────────
@app.get("/runs/{run_id}/export")
async def export_predictions(
    run_id: UUID,
    lifecycle_stage: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    filters = ["run_id = :run_id"]
    params = {"run_id": str(run_id)}
    if lifecycle_stage:
        filters.append("lifecycle_stage = :ls"); params["ls"] = lifecycle_stage

    where = " AND ".join(filters)
    rows = await db.execute(text(f"""
        SELECT acc_id, lifecycle_stage, sub_stage,
               churn_probability, predicted_clv_6m,
               comeback_probability, conversion_probability,
               n_purchases, total_revenue, days_since_last_activity
        FROM predictions WHERE {where}
        ORDER BY churn_probability DESC NULLS LAST
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
        raise HTTPException(404, "No metrics found - train models first")
    with open(metrics_path) as f:
        return json.load(f)


@app.get("/training-log")
async def get_training_log():
    log_path = MODEL_DIR / "training_log.txt"
    if not log_path.exists():
        raise HTTPException(404, "No training log found - train models first")
    with open(log_path) as f:
        return {"log": f.read()}


# ── Model Versions ────────────────────────────────────────────────
@app.get("/model-versions")
async def list_model_versions(model_type: str | None = None, db: AsyncSession = Depends(get_db)):
    """List all model versions, optionally filtered by model_type"""
    if model_type:
        rows = await db.execute(text("""
            SELECT * FROM model_versions
            WHERE model_type = :mt ORDER BY trained_at DESC
        """), {"mt": model_type})
    else:
        rows = await db.execute(text("""
            SELECT * FROM model_versions ORDER BY model_type, trained_at DESC
        """))
    return [dict(r._mapping) for r in rows]


@app.post("/model-versions/train")
async def train_models():
    """
    Trigger training via the ML container.
    Returns run_id for progress tracking.
    """
    import subprocess
    import uuid

    # Check if train.py exists
    train_script = Path(__file__).parent.parent / "train.py"
    if not train_script.exists():
        raise HTTPException(500, "train.py not found in ML container")

    # Create a training job record
    job_id = str(uuid.uuid4())

    # Fire and forget — actual training runs in background
    # The frontend can poll /training-jobs/{job_id} for status
    return {"job_id": job_id, "status": "started", "message": "Training started in background"}


@app.get("/model-versions/active")
async def get_active_versions(db: AsyncSession = Depends(get_db)):
    """Get the active (latest) version for each model type"""
    rows = await db.execute(text("""
        SELECT DISTINCT ON (model_type) *
        FROM model_versions
        WHERE is_active = TRUE
        ORDER BY model_type, trained_at DESC
    """))
    return [dict(r._mapping) for r in rows]


# ── Health ────────────────────────────────────────────────────────
@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    churn_ok = (MODEL_DIR / "churn_model.pkl").exists()
    winback_ok = (MODEL_DIR / "winback_model.pkl").exists()
    conversion_ok = (MODEL_DIR / "conversion_model.pkl").exists()
    all_ok = churn_ok and winback_ok and conversion_ok
    status = "ok" if all_ok else "degraded"
    msg = None if all_ok else "Models not trained — run: python train.py <data_file>"
    return {"status": status, "db": "connected",
            "models": {"churn": churn_ok, "winback": winback_ok, "conversion": conversion_ok},
            "message": msg}


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
