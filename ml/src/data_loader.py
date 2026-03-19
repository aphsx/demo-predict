"""
1Moby Analytics — Data Loader
load_data() อ่าน Excel 8 sheets → คืน 3 DataFrames สะอาด
"""

import pandas as pd
import numpy as np
from pathlib import Path


def load_data(path: str | Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    อ่าน Excel ไฟล์เดียว คืน (users, payments, usage)

    Returns
    -------
    users    : 1 row ต่อ customer  — acc_id, status, credit, expire, dates
    payments : 1 row ต่อ transaction — acc_id, payment_date, amount, credit_type
    usage    : 1 row ต่อ (acc_id, period, channel, source) — รวมทุก channel แล้ว
    """
    xl = pd.read_excel(path, sheet_name=None)

    # ── Users ─────────────────────────────────────────────────────
    users = xl["Users+User_profile"].copy()
    users.columns = [c.strip() for c in users.columns]
    users = users.rename(columns={
        "status (SMS)":                        "status_sms",
        "user.credit + user.credit_premium":   "credit_sms",
        "credit_email":                        "credit_email",
        "expire":                              "expire_sms",
        "expire_email":                        "expire_email",
        "status (Email)":                      "status_email",
        "join_date":                           "join_date",
        "last_access":                         "last_access",
        "last_send":                           "last_send",
    })
    date_cols = ["expire_sms", "expire_email", "join_date", "last_access", "last_send"]
    for col in date_cols:
        users[col] = pd.to_datetime(users[col], errors="coerce")
    users["credit_sms"]   = pd.to_numeric(users["credit_sms"],   errors="coerce").fillna(0)
    users["credit_email"] = pd.to_numeric(users["credit_email"], errors="coerce").fillna(0)

    # ── Payments ──────────────────────────────────────────────────
    payments = xl["Backend_payment"].copy()
    payments.columns = [c.strip() for c in payments.columns]
    payments["payment_date"] = pd.to_datetime(payments["payment_date"], errors="coerce")
    payments["amount"]       = pd.to_numeric(payments["amount"],     errors="coerce")
    payments["credit_add"]   = pd.to_numeric(payments["credit_add"], errors="coerce")
    payments = payments.dropna(subset=["payment_date"])

    # ── Usage — stack ทุก sheet ─────────────────────────────────
    usage_sheets = {
        "SMS_usage (BC)":    ("sms",   "bc"),
        "SMS_usage (API)":   ("sms",   "api"),
        "SMS_usage (OTP)":   ("sms",   "otp"),   # ⚠️ ซ้ำกับ API — ตรวจ vendor ก่อน
        "Email_usage (BC)":  ("email", "bc"),
        "Email_usage (API)": ("email", "api"),
        "Email_usage (OTP)": ("email", "otp"),
    }
    parts = []
    for sheet, (channel, source) in usage_sheets.items():
        if sheet not in xl:
            continue
        df = xl[sheet].copy()
        df.columns = [c.strip() for c in df.columns]
        df["channel"] = channel
        df["source"]  = source
        df["period"]  = pd.to_datetime(
            df["year"].astype(str) + "-" + df["month"].astype(str).str.zfill(2) + "-01"
        )
        parts.append(df[["acc_id", "period", "usage", "channel", "source"]])
    usage = pd.concat(parts, ignore_index=True)
    usage["usage"] = pd.to_numeric(usage["usage"], errors="coerce").fillna(0)

    print(f"  Loaded: users={len(users):,}  payments={len(payments):,}  usage_rows={len(usage):,}")
    return users, payments, usage


def define_active(usage: pd.DataFrame, payments: pd.DataFrame,
                   cutoff: pd.Timestamp, months: int = 6) -> set:
    """
    คืน set ของ acc_id ที่ถือว่า active
    Active = มี usage > 0 หรือ payment ใน [cutoff - months, cutoff)
    """
    since = cutoff - pd.DateOffset(months=months)
    active_usage = set(
        usage[(usage["period"] >= since) & (usage["period"] < cutoff) & (usage["usage"] > 0)]["acc_id"]
    )
    active_pay = set(
        payments[(payments["payment_date"] >= since) & (payments["payment_date"] < cutoff)]["acc_id"]
    )
    return active_usage | active_pay


def build_churn_labels(usage: pd.DataFrame, payments: pd.DataFrame,
                        cutoff: pd.Timestamp, months: int = 6) -> set:
    """
    คืน set ของ acc_id ที่ยัง active ในช่วงหลัง cutoff
    ลูกค้าที่ไม่อยู่ใน set นี้ = churn (label=1)
    """
    label_end = cutoff + pd.DateOffset(months=months)
    post_usage = set(
        usage[(usage["period"] >= cutoff) & (usage["period"] < label_end) & (usage["usage"] > 0)]["acc_id"]
    )
    post_pay = set(
        payments[(payments["payment_date"] >= cutoff) & (payments["payment_date"] < label_end)]["acc_id"]
    )
    return post_usage | post_pay
