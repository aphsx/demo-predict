"""
1Moby Analytics — Customer Lifecycle Engine
จัดทุกลูกค้าเข้า 5 stages อัตโนมัติ (rule-based ไม่ใช้ ML)

Stages:
  1. Ghost          — สมัครแล้วไม่เคยทำอะไรเลย
  2. Churned        — เคยใช้/จ่าย แต่หยุดไปแล้ว (> active_window)
  3. Active Free    — ใช้งานอยู่แต่ไม่เคยจ่ายเงิน
  4. Active Paid    — ใช้งานอยู่และเคยจ่ายเงิน
  5. (sub) Healthy / At-Risk — แยกย่อยจาก churn model

แต่ละ stage ได้ sub_stage เพิ่มเพื่อ prioritize action
"""

import pandas as pd
import numpy as np
from src.config import GHOST_NEW_DAYS, GHOST_WARM_DAYS, FREE_USAGE_QUANTILE


def assign_lifecycle_stage(
    users: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff: pd.Timestamp,
    active_window_months: int = 6,
) -> pd.DataFrame:
    """
    จัด stage ให้ทุก acc_id ที่อยู่ใน users table

    Returns
    -------
    DataFrame: acc_id, lifecycle_stage, sub_stage, days_since_last_activity,
               ever_paid, total_revenue, last_payment_date
    """
    all_ids = set(users["acc_id"])
    p_pre = payments[payments["payment_date"] < cutoff]
    u_pre = usage[(usage["period"] < cutoff) & (usage["usage"] > 0)]

    pay_accs = set(p_pre["acc_id"])
    use_accs = set(u_pre["acc_id"])
    ever_active = pay_accs | use_accs

    # Active = had activity within active_window before cutoff
    since = cutoff - pd.DateOffset(months=active_window_months)
    active_usage = set(
        u_pre[(u_pre["period"] >= since)]["acc_id"]
    )
    active_pay = set(
        p_pre[(p_pre["payment_date"] >= since)]["acc_id"]
    )
    active_set = active_usage | active_pay

    # Last activity per customer
    last_pay = p_pre.groupby("acc_id")["payment_date"].max().rename("last_pay")
    last_use = u_pre.groupby("acc_id")["period"].max().rename("last_use")
    last_act = pd.concat([last_pay, last_use], axis=1)
    last_act["last_activity"] = last_act[["last_pay", "last_use"]].max(axis=1)

    # Total revenue per customer
    total_rev = p_pre.groupby("acc_id")["amount"].sum().rename("total_revenue")
    n_purchases = p_pre.groupby("acc_id").size().rename("n_purchases")

    # Build result
    rows = []
    for _, u in users.iterrows():
        acc = u["acc_id"]
        ep = acc in pay_accs
        ea = acc in ever_active
        ia = acc in active_set

        if not ea:
            # GHOST — never did anything
            days_j = (cutoff - u["join_date"]).days if pd.notna(u["join_date"]) else 9999
            if days_j <= GHOST_NEW_DAYS:
                sub = "New Signup"
            elif days_j <= GHOST_WARM_DAYS:
                sub = "Warm Ghost"
            else:
                sub = "Dead Ghost"
            rows.append({
                "acc_id": acc,
                "lifecycle_stage": "Ghost",
                "sub_stage": sub,
                "days_since_last_activity": None,
                "ever_paid": False,
                "total_revenue": 0,
                "last_payment_date": None,
                "n_purchases": 0,
            })
        elif not ia:
            # CHURNED — used to be active, not anymore
            la = last_act.loc[acc, "last_activity"] if acc in last_act.index else None
            days_since = (cutoff - la).days if pd.notna(la) else 9999
            if ep:
                sub = "Churned Paid"
            else:
                sub = "Churned Free"
            rows.append({
                "acc_id": acc,
                "lifecycle_stage": "Churned",
                "sub_stage": sub,
                "days_since_last_activity": days_since,
                "ever_paid": ep,
                "total_revenue": float(total_rev.get(acc, 0)),
                "last_payment_date": last_pay.get(acc, None),
                "n_purchases": int(n_purchases.get(acc, 0)),
            })
        elif not ep:
            # ACTIVE FREE — using but never paid
            la = last_act.loc[acc, "last_activity"] if acc in last_act.index else None
            days_since = (cutoff - la).days if pd.notna(la) else 0
            # Sub-stage by usage level
            acc_use = u_pre[u_pre["acc_id"] == acc]["usage"].sum()
            if acc_use > u_pre.groupby("acc_id")["usage"].sum().quantile(FREE_USAGE_QUANTILE):
                sub = "High Usage Free"
            else:
                sub = "Low Usage Free"
            rows.append({
                "acc_id": acc,
                "lifecycle_stage": "Active Free",
                "sub_stage": sub,
                "days_since_last_activity": days_since,
                "ever_paid": False,
                "total_revenue": 0,
                "last_payment_date": None,
                "n_purchases": 0,
            })
        else:
            # ACTIVE PAID — using and has paid
            la = last_act.loc[acc, "last_activity"] if acc in last_act.index else None
            days_since = (cutoff - la).days if pd.notna(la) else 0
            rows.append({
                "acc_id": acc,
                "lifecycle_stage": "Active Paid",
                "sub_stage": "Active Paid",   # churn model จะแยก healthy/at-risk ทีหลัง
                "days_since_last_activity": days_since,
                "ever_paid": True,
                "total_revenue": float(total_rev.get(acc, 0)),
                "last_payment_date": last_pay.get(acc, None),
                "n_purchases": int(n_purchases.get(acc, 0)),
            })

    result = pd.DataFrame(rows)
    _print_summary(result)
    return result


def _print_summary(df: pd.DataFrame) -> None:
    print("\n[Lifecycle] Stage distribution:")
    for stage in ["Ghost", "Churned", "Active Free", "Active Paid"]:
        sub = df[df["lifecycle_stage"] == stage]
        subs = sub["sub_stage"].value_counts().to_dict()
        subs_str = ", ".join(f"{k}={v:,}" for k, v in subs.items())
        print(f"  {stage}: {len(sub):,} ({subs_str})")
