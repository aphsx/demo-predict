"""
seed_db.py — Import CSV data + ML predictions into PostgreSQL

Run once after starting Docker:
    python api/seed_db.py

Re-run anytime to refresh predictions from the latest model.
"""

import asyncio
import sys
from pathlib import Path

import asyncpg
import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

# ── Paths ──────────────────────────────────────────────────
BASE_DIR  = Path(__file__).parent.parent
TRAIN_DIR = BASE_DIR / "train"
USERS_CSV = TRAIN_DIR / "data" / "sample_users.csv"
PAY_CSV   = TRAIN_DIR / "data" / "sample_payments.csv"
MODEL_PKL = TRAIN_DIR / "output" / "churn_model.pkl"

# ── DB config (matches docker-compose.yml) ─────────────────
import os
DB_DSN = os.getenv(
    "DATABASE_URL_ASYNCPG",
    "postgresql://crm_user:crm_secret@localhost:5432/churn_crm",
)

REFERENCE_DATE = pd.Timestamp("2026-03-06")
CHURN_DAYS     = 90

FEATURE_COLS = [
    "status_enc", "credit_enc",
    "days_since_last_access", "days_since_last_send",
    "days_until_expire", "account_age_days",
    "total_payments", "total_amount_paid", "avg_amount_per_tx",
    "total_sms_volume", "avg_sms_volume", "unique_products",
    "last_payment_recency", "avg_payment_gap_days",
    "last_payment_amount", "downgraded", "dom_credit_enc",
]


# ── Feature engineering (mirrors main.py) ──────────────────
def _rfm_segment(days_inactive: float, total_payments: float, total_amount: float) -> str:
    r = 5 if days_inactive < 30 else 4 if days_inactive < 60 else 3 if days_inactive < 90 else 2 if days_inactive < 180 else 1
    f = 5 if total_payments > 20 else 4 if total_payments > 10 else 3 if total_payments > 5 else 2 if total_payments > 1 else 1
    m = 5 if total_amount > 100_000 else 4 if total_amount > 50_000 else 3 if total_amount > 10_000 else 2 if total_amount > 1_000 else 1
    score = r + f + m
    if score >= 13: return "Champions"
    if score >= 10: return "Loyal"
    if r >= 3:      return "Potential"
    if r <= 2 and f >= 3: return "At Risk"
    if r <= 1 and f <= 2: return "Lost"
    return "Low Spender"


def _risk_factor(row: pd.Series) -> str:
    reasons = []
    days_expire   = row.get("days_until_expire", 0)
    days_inactive = row.get("days_since_last_access", 0)
    last_pay      = row.get("last_payment_recency", 0)
    total_pay     = row.get("total_payments", 0)
    downgraded    = row.get("downgraded", 0)

    if days_expire < 0:
        reasons.append("เครดิตหมดอายุแล้ว")
    elif days_expire < 7:
        reasons.append(f"เครดิตจะหมดใน {int(days_expire)} วัน")
    if days_inactive > 90:
        reasons.append(f"ไม่ใช้งาน {int(days_inactive)} วัน")
    elif days_inactive > 30:
        reasons.append(f"ใช้งานน้อยลง ({int(days_inactive)} วัน)")
    if downgraded == 1:
        reasons.append("Downgrade Package")
    if last_pay > 90:
        reasons.append("ไม่เติมเครดิต > 90 วัน")
    elif last_pay > 60:
        reasons.append("ไม่เติมเครดิต > 60 วัน")
    if total_pay == 0:
        reasons.append("ยังไม่เคยซื้อเครดิต")
    return " · ".join(reasons) if reasons else "ปกติ"


def _recommended_action(prob: float, rfm_seg: str) -> str:
    if prob >= 0.6:
        if rfm_seg in ("Champions", "Loyal"):
            return "โทรสอบถามปัญหาการใช้งานทันที"
        return "โทรสอบถาม / Call Retention"
    if prob >= 0.3:
        return "ส่ง SMS/Email ข้อเสนอพิเศษ"
    return "ติดตาม Newsletter รายเดือน"


def build_features() -> pd.DataFrame:
    users = pd.read_csv(USERS_CSV, parse_dates=["expire", "join_date", "last_access", "last_send"])
    pays  = pd.read_csv(PAY_CSV,   parse_dates=["payment_date"])

    df = users.copy()
    df["days_since_last_access"] = (REFERENCE_DATE - df["last_access"]).dt.days
    df["days_since_last_send"]   = (REFERENCE_DATE - df["last_send"]).dt.days
    df["days_until_expire"]      = (df["expire"] - REFERENCE_DATE).dt.days
    df["account_age_days"]       = (REFERENCE_DATE - df["join_date"]).dt.days

    expired       = df["expire"] < REFERENCE_DATE
    long_inactive = df["days_since_last_access"] > CHURN_DAYS
    df["churned"] = (expired & long_inactive).astype(int)

    pf = pays.copy()
    pf["payment_recency_days"] = (REFERENCE_DATE - pf["payment_date"]).dt.days

    agg = pf.groupby("acc_id").agg(
        total_payments        =("payment_date",        "count"),
        total_amount_paid     =("amount",               "sum"),
        avg_amount_per_tx     =("amount",               "mean"),
        total_sms_volume      =("sms_volume",           "sum"),
        avg_sms_volume        =("sms_volume",           "mean"),
        unique_products       =("product_name",         "nunique"),
        last_payment_recency  =("payment_recency_days", "min"),
        first_payment_recency =("payment_recency_days", "max"),
        payment_span_days     =("payment_recency_days", lambda x: x.max() - x.min()),
    ).reset_index()

    agg["avg_payment_gap_days"] = agg.apply(
        lambda r: r["payment_span_days"] / max(r["total_payments"] - 1, 1), axis=1
    )
    last_amt = pf.sort_values("payment_date").groupby("acc_id").last()["amount"]
    agg = agg.merge(last_amt.rename("last_payment_amount"), on="acc_id", how="left")
    agg["downgraded"] = (agg["last_payment_amount"] < agg["avg_amount_per_tx"]).astype(int)

    dom_credit = pf.groupby("acc_id")["credit_type"].agg(
        lambda x: x.mode()[0] if not x.empty else "Unknown"
    ).rename("dominant_credit_type")
    agg = agg.merge(dom_credit, on="acc_id", how="left")

    df = df.merge(agg, on="acc_id", how="left")
    pay_numeric = [
        "total_payments", "total_amount_paid", "avg_amount_per_tx",
        "total_sms_volume", "avg_sms_volume", "unique_products",
        "last_payment_recency", "first_payment_recency", "payment_span_days",
        "avg_payment_gap_days", "last_payment_amount", "downgraded",
    ]
    df[pay_numeric] = df[pay_numeric].fillna(0)
    df["dominant_credit_type"] = df["dominant_credit_type"].fillna("None")

    le = LabelEncoder()
    df["status_enc"]     = le.fit_transform(df["status"])
    df["credit_enc"]     = le.fit_transform(df["credit"])
    df["dom_credit_enc"] = le.fit_transform(df["dominant_credit_type"])
    return df


# ── Main seed routine ───────────────────────────────────────
async def seed():
    print("Connecting to PostgreSQL …")
    conn = await asyncpg.connect(DB_DSN)

    # ── Load model & build features ──
    if not MODEL_PKL.exists():
        print("ERROR: model not found. Run train/churn_model.py first.")
        sys.exit(1)

    model = joblib.load(MODEL_PKL)
    df    = build_features()
    X     = df[FEATURE_COLS]
    df["churn_probability"] = model.predict_proba(X)[:, 1]
    df["churn_predicted"]   = (df["churn_probability"] >= 0.5).astype(int)
    df["risk_tier"] = df["churn_probability"].apply(
        lambda p: "High" if p >= 0.6 else ("Medium" if p >= 0.3 else "Low")
    )
    df["ltv"]             = df["total_amount_paid"]
    df["rfm_segment"]     = df.apply(
        lambda r: _rfm_segment(r["days_since_last_access"], r["total_payments"], r["total_amount_paid"]), axis=1
    )
    df["risk_factor"]         = df.apply(_risk_factor, axis=1)
    df["recommended_action"]  = df.apply(
        lambda r: _recommended_action(r["churn_probability"], r["rfm_segment"]), axis=1
    )

    # ── Reload raw users for DB insert ──
    users = pd.read_csv(USERS_CSV, parse_dates=["expire", "join_date", "last_access", "last_send"])
    pays  = pd.read_csv(PAY_CSV,   parse_dates=["payment_date"])

    # ── Upsert customers ──────────────────────────────────────
    print(f"Upserting {len(users)} customers …")
    customer_rows = [
        (
            str(row.acc_id),
            str(row.status),
            int(row.credit or 0),
            int(row.credit_premium if hasattr(row, "credit_premium") else 0),
            int(row.credit_email   if hasattr(row, "credit_email")   else 0),
            row.expire.date()      if pd.notna(row.expire)      else None,
            row.join_date.date()   if pd.notna(row.join_date)   else None,
            row.last_access.to_pydatetime() if pd.notna(row.last_access) else None,
            row.last_send.to_pydatetime()   if pd.notna(row.last_send)   else None,
            str(row.paid_email)    if hasattr(row, "paid_email") and pd.notna(row.paid_email) else None,
        )
        for _, row in users.iterrows()
    ]
    await conn.executemany(
        """
        INSERT INTO customers (acc_id, status, credit, credit_premium, credit_email,
                               expire, join_date, last_access, last_send, paid_email)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (acc_id) DO UPDATE SET
            status         = EXCLUDED.status,
            credit         = EXCLUDED.credit,
            credit_premium = EXCLUDED.credit_premium,
            credit_email   = EXCLUDED.credit_email,
            expire         = EXCLUDED.expire,
            last_access    = EXCLUDED.last_access,
            last_send      = EXCLUDED.last_send,
            updated_at     = NOW()
        """,
        customer_rows,
    )
    print("  ✓ customers done")

    # ── Upsert payments ───────────────────────────────────────
    print(f"Upserting {len(pays)} payments …")
    # Clear and reload to avoid duplicates on re-run
    await conn.execute("DELETE FROM payments")
    payment_rows = [
        (
            str(row.acc_id),
            row.payment_date.to_pydatetime(),
            float(row.amount or 0),
            int(row.sms_volume or 0),
            str(row.product_name) if pd.notna(row.product_name) else None,
            str(row.credit_type)  if pd.notna(row.credit_type)  else None,
        )
        for _, row in pays.iterrows()
        if str(row.acc_id) in set(users["acc_id"])
    ]
    await conn.executemany(
        """
        INSERT INTO payments (acc_id, payment_date, amount, sms_volume, product_name, credit_type)
        VALUES ($1,$2,$3,$4,$5,$6)
        """,
        payment_rows,
    )
    print("  ✓ payments done")

    # ── Upsert predictions ────────────────────────────────────
    print(f"Upserting {len(df)} predictions …")
    def _f(v):
        """Convert numpy/nan float to Python float or None."""
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return float(v)

    pred_rows = [
        (
            str(row.acc_id),
            _f(row.churn_probability),
            bool(row.churn_predicted),
            str(row.risk_tier),
            str(row.rfm_segment),
            str(row.risk_factor),
            str(row.recommended_action),
            _f(row.days_since_last_access),
            _f(row.days_until_expire),
            _f(row.account_age_days),
            _f(row.total_payments),
            _f(row.total_amount_paid),
            _f(row.ltv),
            _f(row.avg_amount_per_tx),
            _f(row.last_payment_recency),
            _f(row.avg_payment_gap_days),
            _f(row.total_sms_volume),
            _f(row.avg_sms_volume),
            _f(row.unique_products),
            int(row.downgraded or 0),
            int(row.churned or 0),
        )
        for _, row in df.iterrows()
    ]
    await conn.executemany(
        """
        INSERT INTO predictions (
            acc_id, churn_probability, churn_predicted, risk_tier, rfm_segment,
            risk_factor, recommended_action, days_since_last_access, days_until_expire,
            account_age_days, total_payments, total_amount_paid, ltv, avg_amount_per_tx,
            last_payment_recency, avg_payment_gap_days, total_sms_volume, avg_sms_volume,
            unique_products, downgraded, churned
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (acc_id) DO UPDATE SET
            churn_probability      = EXCLUDED.churn_probability,
            churn_predicted        = EXCLUDED.churn_predicted,
            risk_tier              = EXCLUDED.risk_tier,
            rfm_segment            = EXCLUDED.rfm_segment,
            risk_factor            = EXCLUDED.risk_factor,
            recommended_action     = EXCLUDED.recommended_action,
            days_since_last_access = EXCLUDED.days_since_last_access,
            days_until_expire      = EXCLUDED.days_until_expire,
            account_age_days       = EXCLUDED.account_age_days,
            total_payments         = EXCLUDED.total_payments,
            total_amount_paid      = EXCLUDED.total_amount_paid,
            ltv                    = EXCLUDED.ltv,
            avg_amount_per_tx      = EXCLUDED.avg_amount_per_tx,
            last_payment_recency   = EXCLUDED.last_payment_recency,
            avg_payment_gap_days   = EXCLUDED.avg_payment_gap_days,
            total_sms_volume       = EXCLUDED.total_sms_volume,
            avg_sms_volume         = EXCLUDED.avg_sms_volume,
            unique_products        = EXCLUDED.unique_products,
            downgraded             = EXCLUDED.downgraded,
            churned                = EXCLUDED.churned,
            computed_at            = NOW()
        """,
        pred_rows,
    )
    print("  ✓ predictions done")

    await conn.close()
    print("\n✅ Seed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
