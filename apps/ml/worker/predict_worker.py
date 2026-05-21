"""
Background Prediction Worker V2 (ARQ task queue)
DB → ML pipeline (all 5 models + lifecycle) → save results back to DB
Progress via Redis Streams (persistent + real-time)
"""
import os, sys
from pathlib import Path
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://moby:moby1234@db:5432/moby")
ASYNC_URL    = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

REDIS_SETTINGS = RedisSettings(host=REDIS_HOST, port=REDIS_PORT)


async def run_prediction_pipeline(ctx, run_id: str, model_dir: str):
    await _pipeline(run_id, model_dir)


async def _stream_progress(redis, run_id: str, progress: int, step: str):
    """Write progress to Redis Stream (persistent)"""
    stream_key = f"progress:{run_id}"
    await redis.xadd(stream_key, {"progress": str(progress), "step": step}, maxlen=100)


async def _pipeline(run_id: str, model_dir: str):
    import redis.asyncio as aioredis

    engine = create_async_engine(ASYNC_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    redis = await aioredis.from_url(f"redis://{REDIS_HOST}:{REDIS_PORT}")

    try:
        # Stream: 10% - loading data
        await _stream_progress(redis, run_id, 10, "loading_data")
        print(f"[Worker] Run {run_id}: loading data from DB...")
        users, payments, usage = await _load_from_db(Session, run_id)

        run_row = await Session().execute(
            text("SELECT cutoff_date FROM prediction_runs WHERE id = :id"),
            {"id": run_id}
        )
        r = run_row.mappings().first()
        from src.config import CUTOFF
        cutoff = pd.Timestamp(r["cutoff_date"]).tz_localize(None) if r else pd.Timestamp(CUTOFF).tz_localize(None)

        # Stream: 25% - building features
        await _stream_progress(redis, run_id, 25, "building_features")
        print(f"[Worker] Run {run_id}: building features...")
        from src.features import build_features
        feat_df = build_features(users, payments, usage, cutoff)

        # Stream: 40% - predicting all models
        await _stream_progress(redis, run_id, 40, "predicting_all")
        print(f"[Worker] Run {run_id}: running V2 pipeline (5 models + lifecycle)...")
        from src.predictor import MobyPredictor
        predictor = MobyPredictor(Path(model_dir), cutoff)
        predictor.load_data(users, feat_df, payments, usage)
        predictor.run_all_predictions()

        batch = predictor.predict_batch()

        # Stream: 85% - saving results
        await _stream_progress(redis, run_id, 85, "saving_results")
        print(f"[Worker] Run {run_id}: saving {len(batch):,} predictions to DB...")
        async with Session() as db:
            await _save_predictions(db, run_id, batch)

            active_count = int((batch["lifecycle_stage"].isin(["Active Paid", "Active Free"])).sum())
            await db.execute(text("""
                UPDATE prediction_runs
                SET status = 'done',
                    total_customers  = :total,
                    active_customers = :active,
                    updated_at = NOW()
                WHERE id = :id
            """), {"id": run_id, "total": len(batch), "active": active_count})
            await db.commit()

        # Stream: 100% - done
        await _stream_progress(redis, run_id, 100, "done")
        print(f"[Worker] Run {run_id}: DONE")

    except Exception as e:
        import traceback
        print(f"[Worker] Run {run_id} FAILED: {e}")
        traceback.print_exc()
        await _stream_progress(redis, run_id, -1, f"failed: {str(e)[:100]}")
        async with Session() as db:
            await db.execute(text("""
                UPDATE prediction_runs
                SET status = 'failed', error_message = :err, updated_at = NOW()
                WHERE id = :id
            """), {"id": run_id, "err": str(e)[:500]})
            await db.commit()
    finally:
        await engine.dispose()
        await redis.close()


async def _load_from_db(Session, run_id: str):
    async with Session() as db:
        def _to_naive(series):
            dt = pd.to_datetime(series, errors="coerce", utc=True)
            return dt.dt.tz_convert(None)

        u = await db.execute(text("""
            SELECT acc_id,status_sms,credit_sms,credit_email,
                   expire_sms,expire_email,status_email,join_date,last_access,last_send
            FROM raw_customers WHERE run_id = :r
        """), {"r": run_id})
        users = pd.DataFrame([dict(row._mapping) for row in u])
        for col in ["expire_sms","expire_email","join_date","last_access","last_send"]:
            if col in users.columns:
                users[col] = _to_naive(users[col])
        for col in ["credit_sms", "credit_email"]:
            if col in users.columns:
                users[col] = pd.to_numeric(users[col], errors="coerce")

        p = await db.execute(text("""
            SELECT acc_id,payment_date,amount,credit_add,credit_type
            FROM raw_payments WHERE run_id = :r
        """), {"r": run_id})
        payments = pd.DataFrame([dict(row._mapping) for row in p])
        if len(payments) > 0:
            payments["payment_date"] = _to_naive(payments["payment_date"])
            for col in ["amount", "credit_add"]:
                payments[col] = pd.to_numeric(payments[col], errors="coerce")

        u2 = await db.execute(text("""
            SELECT acc_id,year,month,usage,channel,source FROM raw_usage WHERE run_id = :r
        """), {"r": run_id})
        usage = pd.DataFrame([dict(row._mapping) for row in u2])
        if len(usage) > 0:
            for col in ["usage", "year", "month"]:
                usage[col] = pd.to_numeric(usage[col], errors="coerce")
            usage["period"] = pd.to_datetime(
                usage["year"].astype(str) + "-" + usage["month"].astype(str).str.zfill(2) + "-01"
            )
        return users, payments, usage


async def _save_predictions(db, run_id, batch):
    await db.execute(text("DELETE FROM predictions WHERE run_id = :r"), {"r": run_id})

    INSERT = text("""
        INSERT INTO predictions (
          run_id, acc_id,
          lifecycle_stage, sub_stage,
          churn_probability,
          predicted_clv_6m, clv_ci95_lo, clv_ci95_hi,
          clv_ci80_lo, clv_ci80_hi, p_alive,
          credit_p10, credit_p25, credit_p50, credit_p75, credit_p90,
          n_purchases, forecast_confidence,
          comeback_probability,
          conversion_probability,
          is_active, total_revenue, days_since_last_activity, ever_paid,
          revenue_at_risk, avg_transaction_value
        ) VALUES (
          :run_id, :acc_id,
          :lifecycle, :sub_stage,
          :churn_prob,
          :clv, :ci95_lo, :ci95_hi,
          :ci80_lo, :ci80_hi, :p_alive,
          :p10, :p25, :p50, :p75, :p90,
          :n_purch, :conf,
          :comeback_prob,
          :conv_prob,
          :is_active, :total_rev, :days_since, :ever_paid,
          :revenue_at_risk, :avg_txn_value
        )
    """)

    BATCH_SIZE = 1000
    buf = []
    for _, row in batch.iterrows():
        acc = int(row.get("acc_id", 0))
        is_active = 1 if row.get("lifecycle_stage") in ("Active Paid", "Active Free") else 0
        buf.append({
            "run_id": run_id, "acc_id": acc,
            "lifecycle": _sv(row, "lifecycle_stage"),
            "sub_stage": _sv(row, "sub_stage"),
            "churn_prob": _fv(row, "churn_probability"),
            "clv": _fv(row, "predicted_clv_6m"),
            "ci95_lo": _fv(row, "ci_95_lo"), "ci95_hi": _fv(row, "ci_95_hi"),
            "ci80_lo": _fv(row, "ci_80_lo"), "ci80_hi": _fv(row, "ci_80_hi"),
            "p_alive": _fv(row, "p_alive"),
            "p10": _fv(row, "p10"), "p25": _fv(row, "p25"),
            "p50": _fv(row, "p50"), "p75": _fv(row, "p75"), "p90": _fv(row, "p90"),
            "n_purch": int(row["n_purchases"]) if "n_purchases" in row.index and pd.notna(row.get("n_purchases")) else None,
            "conf": _fv(row, "forecast_confidence"),
            "comeback_prob": _fv(row, "comeback_probability"),
            "conv_prob": _fv(row, "conversion_probability"),
            "is_active": is_active,
            "total_rev": _fv(row, "total_revenue"),
            "days_since": int(row["days_since_last_activity"]) if pd.notna(row.get("days_since_last_activity")) else None,
            "ever_paid": bool(row.get("ever_paid", False)),
            "revenue_at_risk": _fv(row, "revenue_at_risk"),
            "avg_txn_value": _fv(row, "avg_transaction_value"),
        })
        if len(buf) >= BATCH_SIZE:
            await db.execute(INSERT, buf)
            buf = []
    if buf:
        await db.execute(INSERT, buf)
    await db.commit()


def _fv(row, col):
    v = row.get(col) if hasattr(row, "get") else (row[col] if col in row.index else None)
    if v is None: return None
    try:
        import math
        if isinstance(v, float) and math.isnan(v): return None
        return float(v)
    except Exception:
        return None

def _sv(row, col):
    v = row.get(col) if hasattr(row, "get") else (row[col] if col in row.index else None)
    return str(v) if v is not None and str(v) not in ("None","nan","NaT") else None


class WorkerSettings:
    functions      = [run_prediction_pipeline]
    redis_settings = REDIS_SETTINGS
    max_jobs       = 2
    job_timeout    = 3600
    keep_result    = 3600