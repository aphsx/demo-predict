"""
Background Prediction Worker  (ARQ task queue)
ดึงข้อมูลจาก DB → run ML pipeline → save results กลับ DB
Worker รันเป็น process แยกจาก API server ผ่าน ARQ + Redis
"""
import os, sys
from pathlib import Path
import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://moby:moby1234@db:5432/moby")
ASYNC_URL    = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

REDIS_SETTINGS = RedisSettings(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", 6379)),
)


async def run_prediction_pipeline(ctx, run_id: str, model_dir: str):
    """ARQ task — รันใน worker process แยก ไม่กระทบ API server"""
    await _pipeline(run_id, model_dir)


async def _pipeline(run_id: str, model_dir: str):
    engine = create_async_engine(ASYNC_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        try:
            print(f"[Worker] Run {run_id}: loading data from DB...")
            users, payments, usage = await _load_from_db(db, run_id)

            print(f"[Worker] Run {run_id}: building features...")
            from src.config import CUTOFF
            run_row = await db.execute(
                text("SELECT cutoff_date FROM prediction_runs WHERE id = :id"),
                {"id": run_id}
            )
            r = run_row.mappings().first()
            cutoff = pd.Timestamp(r["cutoff_date"]) if r else CUTOFF

            from src.data_loader import define_active, build_churn_labels
            from src.features import build_features

            feat_df = build_features(users, payments, usage, cutoff)
            active_set      = define_active(usage, payments, cutoff)
            active_post_set = build_churn_labels(usage, payments, cutoff)

            print(f"[Worker] Run {run_id}: running models...")
            from src.predictor import MobyPredictor
            predictor = MobyPredictor(Path(model_dir), cutoff)
            predictor.load_data(feat_df, payments, usage)
            predictor.run_all_predictions()

            batch = predictor.predict_batch()

            # Get SHAP explanations for active customers
            print(f"[Worker] Run {run_id}: computing SHAP for active customers...")
            active_ids = batch[batch["is_active"] == 1]["acc_id"].tolist()

            print(f"[Worker] Run {run_id}: saving {len(batch):,} predictions to DB...")
            await _save_predictions(db, run_id, batch, predictor, active_ids[:500])

            # Update run stats
            await db.execute(text("""
                UPDATE prediction_runs
                SET status = 'done',
                    total_customers  = :total,
                    active_customers = :active,
                    updated_at = NOW()
                WHERE id = :id
            """), {
                "id": run_id,
                "total":  len(batch),
                "active": int(batch["is_active"].sum()) if "is_active" in batch else 0,
            })
            await db.commit()
            print(f"[Worker] Run {run_id}: DONE")

        except Exception as e:
            import traceback
            print(f"[Worker] Run {run_id} FAILED: {e}")
            traceback.print_exc()
            await db.execute(text("""
                UPDATE prediction_runs
                SET status = 'failed', error_message = :err, updated_at = NOW()
                WHERE id = :id
            """), {"id": run_id, "err": str(e)[:500]})
            await db.commit()
        finally:
            await engine.dispose()


async def _load_from_db(db: AsyncSession, run_id: str):
    """โหลดข้อมูลดิบจาก DB → pandas DataFrames"""

    def _to_naive_datetime(series: pd.Series) -> pd.Series:
        # Force UTC parse then drop tz to keep comparisons consistent with naive cutoff timestamps.
        dt = pd.to_datetime(series, errors="coerce", utc=True)
        return dt.dt.tz_convert(None)

    # Users
    u = await db.execute(text("""
        SELECT acc_id,status_sms,credit_sms,credit_email,
               expire_sms,expire_email,status_email,join_date,last_access,last_send
        FROM raw_customers WHERE run_id = :r
    """), {"r": run_id})
    users = pd.DataFrame([dict(row._mapping) for row in u])
    for col in ["expire_sms","expire_email","join_date","last_access","last_send"]:
        if col in users.columns:
            users[col] = _to_naive_datetime(users[col])
    for col in ["credit_sms", "credit_email"]:
        if col in users.columns:
            users[col] = pd.to_numeric(users[col], errors="coerce")

    # Payments
    p = await db.execute(text("""
        SELECT acc_id,payment_date,amount,credit_add,credit_type
        FROM raw_payments WHERE run_id = :r
    """), {"r": run_id})
    payments = pd.DataFrame([dict(row._mapping) for row in p])
    payments["payment_date"] = _to_naive_datetime(payments["payment_date"])
    for col in ["amount", "credit_add"]:
        if col in payments.columns:
            payments[col] = pd.to_numeric(payments[col], errors="coerce")

    # Usage
    u2 = await db.execute(text("""
        SELECT acc_id,year,month,usage,channel,source FROM raw_usage WHERE run_id = :r
    """), {"r": run_id})
    usage = pd.DataFrame([dict(row._mapping) for row in u2])
    if len(usage) > 0:
        for col in ["usage", "year", "month"]:
            if col in usage.columns:
                usage[col] = pd.to_numeric(usage[col], errors="coerce")
        usage["period"] = pd.to_datetime(
            usage["year"].astype(str) + "-" + usage["month"].astype(str).str.zfill(2) + "-01"
        )

    return users, payments, usage


async def _save_predictions(db: AsyncSession, run_id: str,
                             batch: pd.DataFrame,
                             predictor, shap_ids: list):
    """INSERT predictions ทีละ batch"""
    # precompute SHAP for first N active customers
    shap_cache = {}
    for acc_id in shap_ids:
        try:
            exp = predictor.explain(int(acc_id))
            factors = exp.get("top_risk_factors", [])
            shap_cache[int(acc_id)] = factors
        except Exception:
            pass

    await db.execute(text("DELETE FROM predictions WHERE run_id = :r"), {"r": run_id})

    INSERT_SQL = text("""
        INSERT INTO predictions (
          run_id, acc_id,
          churn_probability, churn_tier,
          predicted_clv_6m, clv_ci95_lo, clv_ci95_hi,
          clv_ci80_lo, clv_ci80_hi, p_alive, rfm_segment,
          credit_p10, credit_p25, credit_p50, credit_p75, credit_p90,
          urgency, alert_date, n_purchases, forecast_confidence,
          priority_score, revenue_at_risk, is_active,
          risk_factor_1, risk_factor_2, risk_factor_3
        ) VALUES (
          :run_id, :acc_id,
          :churn_prob, :churn_tier,
          :clv, :ci95_lo, :ci95_hi,
          :ci80_lo, :ci80_hi, :p_alive, :rfm,
          :p10, :p25, :p50, :p75, :p90,
          :urgency, :alert_date, :n_purch, :conf,
          :priority, :rev_risk, :is_active,
          :rf1, :rf2, :rf3
        )
    """)

    BATCH_SIZE = 1000
    rows_buf = []
    for _, row in batch.iterrows():
        acc  = int(row.get("acc_id", 0))
        shap = shap_cache.get(acc, [])
        rows_buf.append({
            "run_id": run_id, "acc_id": acc,
            "churn_prob": _fv(row, "churn_probability"),
            "churn_tier": _sv(row, "churn_tier"),
            "clv":     _fv(row, "predicted_clv_6m"),
            "ci95_lo": _fv(row, "ci_95_lo"), "ci95_hi": _fv(row, "ci_95_hi"),
            "ci80_lo": _fv(row, "ci_80_lo"), "ci80_hi": _fv(row, "ci_80_hi"),
            "p_alive": _fv(row, "p_alive"),  "rfm": _sv(row, "rfm_segment"),
            "p10": _fv(row, "p10"), "p25": _fv(row, "p25"),
            "p50": _fv(row, "p50"), "p75": _fv(row, "p75"), "p90": _fv(row, "p90"),
            "urgency":    _sv(row, "urgency"),
            "alert_date": _dv(row, "alert_date"),
            "n_purch":    int(row["n_purchases"]) if "n_purchases" in row.index and pd.notna(row["n_purchases"]) else None,
            "conf":       _fv(row, "forecast_confidence"),
            "priority":   _fv(row, "priority_score"),
            "rev_risk":   _fv(row, "revenue_at_risk"),
            "is_active":  int(row["is_active"]) if "is_active" in row.index else 0,
            "rf1": shap[0] if len(shap) > 0 else None,
            "rf2": shap[1] if len(shap) > 1 else None,
            "rf3": shap[2] if len(shap) > 2 else None,
        })
        if len(rows_buf) >= BATCH_SIZE:
            await db.execute(INSERT_SQL, rows_buf)
            rows_buf = []

    if rows_buf:
        await db.execute(INSERT_SQL, rows_buf)

    await db.commit()


def _fv(row, col):
    v = row.get(col) if hasattr(row, "get") else row[col] if col in row.index else None
    if v is None: return None
    try:
        import math
        if isinstance(v, float) and math.isnan(v): return None
        return float(v)
    except: return None

def _sv(row, col):
    v = row.get(col) if hasattr(row, "get") else row[col] if col in row.index else None
    return str(v) if v is not None and str(v) not in ("None","nan","NaT") else None

def _dv(row, col):
    v = row.get(col) if hasattr(row, "get") else row[col] if col in row.index else None
    if v is None:
        return None
    try:
        ts = pd.Timestamp(v)
        if pd.isna(ts):
            return None
        return ts.date()
    except:
        return None


# ── ARQ Worker Settings ────────────────────────────────────────────
class WorkerSettings:
    """ARQ worker configuration — start with: python -m arq worker.predict_worker.WorkerSettings"""
    functions     = [run_prediction_pipeline]
    redis_settings = REDIS_SETTINGS
    max_jobs      = 2       # predict สองงานพร้อมกันสูงสุด
    job_timeout   = 3600    # 1 ชั่วโมง timeout ต่องาน
    keep_result   = 3600    # เก็บ result ใน Redis 1 ชั่วโมง
