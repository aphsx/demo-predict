"""
1Moby Analytics — Feature Engineering
build_features() สร้าง 30 features แบบ Point-in-Time safe
"""

import numpy as np
import pandas as pd


def build_features(users: pd.DataFrame, payments: pd.DataFrame,
                   usage: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    """
    สร้าง 30 features ต่อ customer โดยใช้ข้อมูลก่อน cutoff เท่านั้น

    Returns
    -------
    DataFrame: acc_id + 30 feature columns
    """
    user_f   = _user_features(users, payments, usage, cutoff)
    pay_f    = _payment_features(payments, cutoff)
    usage_f  = _usage_features(usage, cutoff)

    feat = user_f.merge(pay_f,   on="acc_id", how="left")
    feat = feat.merge(usage_f,   on="acc_id", how="left")
    feat = feat.fillna(0)

    # Ensure numeric columns are float/int, not object (handles edge case of empty merge)
    for col in feat.columns:
        if col != "acc_id":
            feat[col] = pd.to_numeric(feat[col], errors="coerce").fillna(0)

    n_features = feat.shape[1] - 1
    print(f"  Features: {n_features} features × {len(feat):,} customers")
    return feat


# ─────────────────────────────────────────────────────────────────
# User Features (9)
# ─────────────────────────────────────────────────────────────────

def _user_features(users: pd.DataFrame, payments: pd.DataFrame,
                   usage: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    """
    FIX V3: last_send และ last_access คำนวณจาก activity data ก่อน cutoff
            ไม่ใช้ user profile columns โดยตรง (เพื่อ point-in-time correctness)
    """
    u_pre = usage[usage["period"] < cutoff]
    p_pre = payments[payments["payment_date"] < cutoff]

    # last_send: วันล่าสุดที่มี usage > 0 ก่อน cutoff
    last_send_pit = (
        u_pre[u_pre["usage"] > 0]
        .groupby("acc_id")["period"].max()
        .rename("last_send_pit")
    )
    # last_pay: วันซื้อล่าสุดก่อน cutoff
    last_pay_pit = (
        p_pre.groupby("acc_id")["payment_date"].max()
        .rename("last_pay_pit")
    )

    u = users.copy()
    u = u.merge(last_send_pit.reset_index(), on="acc_id", how="left")
    u = u.merge(last_pay_pit.reset_index(),  on="acc_id", how="left")

    # last_access = max(last_send_pit, last_pay_pit) — handle mixed NaT/float safely
    s = u["last_send_pit"].copy()
    p = u["last_pay_pit"].copy()
    s_ts = pd.to_datetime(s, errors="coerce")
    p_ts = pd.to_datetime(p, errors="coerce")
    u["last_access_pit"] = p_ts.combine_first(s_ts)

    def _to_days_delta(col, ref):
        ts = pd.to_datetime(col, errors="coerce")
        valid = ts.notna()
        result = pd.Series([np.nan] * len(col), index=col.index)
        result[valid] = (ref - ts[valid]).dt.days
        return result

    u["days_since_join"]         = _to_days_delta(u["join_date"], cutoff)
    u["days_since_last_send"]    = _to_days_delta(u["last_send_pit"], cutoff)
    u["days_since_last_access"]  = _to_days_delta(u["last_access_pit"], cutoff)
    u["days_until_sms_expire"]   = _to_days_delta(u["expire_sms"], cutoff)
    u["days_until_email_expire"] = _to_days_delta(u["expire_email"], cutoff)
    u["credit_sms_log"]          = np.log1p(u["credit_sms"].clip(lower=0))
    u["credit_email_log"]        = np.log1p(u["credit_email"].clip(lower=0))
    u["is_paid_sms"]             = (u["status_sms"]   == "PAID").astype(int)
    u["is_paid_email"]           = (u["status_email"] == "PAID").astype(int)

    cols = ["acc_id", "days_since_join", "days_since_last_access",
            "days_since_last_send", "days_until_sms_expire",
            "days_until_email_expire", "credit_sms_log",
            "credit_email_log", "is_paid_sms", "is_paid_email"]
    return u[cols].copy()


# ─────────────────────────────────────────────────────────────────
# Payment Features (10)
# ─────────────────────────────────────────────────────────────────

def _payment_features(payments: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    p = payments[payments["payment_date"] < cutoff].copy()
    if len(p) == 0:
        return pd.DataFrame(columns=[
            "acc_id",
            "pay_recency_days", "pay_frequency", "pay_monetary_log", "pay_avg_amount",
            "pay_total_credits", "pay_avg_interval", "pay_overdue_ratio",
            "pay_n_sms", "pay_n_email", "pay_tenure_days",
        ])

    def _agg(grp):
        dates     = grp["payment_date"].sort_values()
        amounts   = grp["amount"]
        intervals = dates.diff().dt.days.dropna()
        avg_int   = intervals.mean() if len(intervals) > 0 else np.nan
        recency   = (cutoff - dates.max()).days
        return pd.Series({
            "pay_recency_days":  recency,
            "pay_frequency":     len(grp),
            "pay_monetary_log":  np.log1p(amounts.sum()),
            "pay_avg_amount":    amounts.mean(),
            "pay_total_credits": grp["credit_add"].sum(),
            "pay_avg_interval":  avg_int,
            "pay_overdue_ratio": recency / avg_int if (avg_int and avg_int > 0) else np.nan,
            "pay_n_sms":         (grp["credit_type"] == "sms").sum(),
            "pay_n_email":       (grp["credit_type"] == "email").sum(),
            "pay_tenure_days":   (dates.max() - dates.min()).days,
        })

    return p.groupby("acc_id").apply(_agg).reset_index()


# ─────────────────────────────────────────────────────────────────
# Usage Features (11)
# ─────────────────────────────────────────────────────────────────

def _usage_features(usage: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    u_pre = usage[usage["period"] < cutoff].copy()
    if len(u_pre) == 0:
        return pd.DataFrame(columns=[
            "acc_id",
            "usage_total_log", "usage_months", "usage_avg", "usage_max", "usage_std",
            "usage_recent_3m", "usage_prev_3m", "usage_decay_ratio", "usage_slope",
            "usage_sms_total", "usage_email_total",
        ])

    recent_cutoff = cutoff - pd.DateOffset(months=3)
    prev_cutoff   = cutoff - pd.DateOffset(months=6)

    monthly = u_pre.groupby(["acc_id", "period"])["usage"].sum().reset_index()

    def _agg(grp):
        grp   = grp.sort_values("period")
        vals  = grp["usage"].values
        recent = grp[grp["period"] >= recent_cutoff]["usage"].sum()
        prev   = grp[(grp["period"] >= prev_cutoff) & (grp["period"] < recent_cutoff)]["usage"].sum()
        slope  = np.polyfit(np.arange(len(vals)), vals, 1)[0] if len(vals) >= 2 else 0.0
        return pd.Series({
            "usage_total_log":   np.log1p(vals.sum()),
            "usage_months":      len(vals),
            "usage_avg":         float(vals.mean()),
            "usage_max":         float(vals.max()),
            "usage_std":         float(vals.std()) if len(vals) > 1 else 0.0,
            "usage_recent_3m":   float(recent),
            "usage_prev_3m":     float(prev),
            "usage_decay_ratio": float(recent / prev) if prev > 0 else 0.0,
            "usage_slope":       float(slope),
        })

    base = monthly.groupby("acc_id").apply(_agg).reset_index()

    # SMS / Email totals แยก channel
    sms_total   = (u_pre[u_pre["channel"] == "sms"]
                   .groupby("acc_id")["usage"].sum()
                   .rename("usage_sms_total").reset_index())
    email_total = (u_pre[u_pre["channel"] == "email"]
                   .groupby("acc_id")["usage"].sum()
                   .rename("usage_email_total").reset_index())

    feat = base.merge(sms_total,   on="acc_id", how="left")
    feat = feat.merge(email_total, on="acc_id", how="left")
    feat["usage_sms_total"]   = feat["usage_sms_total"].fillna(0)
    feat["usage_email_total"] = feat["usage_email_total"].fillna(0)
    return feat


# ─────────────────────────────────────────────────────────────────
# Transaction Pairs (for Credit model)
# ─────────────────────────────────────────────────────────────────

def build_transaction_pairs(payments: pd.DataFrame, usage: pd.DataFrame,
                             cutoff: pd.Timestamp,
                             outlier_pctile: int = 99) -> pd.DataFrame:
    """
    สร้าง training pairs สำหรับ Credit Purchase Forecast model
    แต่ละ row = (ซื้อครั้งที่ i → ซื้อครั้งถัดไป) พร้อม 20 features
    """
    p = payments[payments["payment_date"] < cutoff].sort_values(["acc_id", "payment_date"])

    # precompute monthly usage per acc_id
    u_pre = usage[usage["period"] < cutoff]
    recent_cut = cutoff - pd.DateOffset(months=3)
    acc_usage  = {}
    for acc, g in u_pre.groupby("acc_id"):
        g    = g.sort_values("period")
        vals = g["usage"].values
        recent = g[g["period"] >= recent_cut]["usage"].sum()
        slope  = float(np.polyfit(np.arange(len(vals)), vals, 1)[0]) if len(vals) >= 2 else 0.0
        acc_usage[acc] = {
            "usage_total_log":    float(np.log1p(vals.sum())),
            "usage_avg_monthly":  float(vals.mean()),
            "usage_recent_avg":   float(g.tail(3)["usage"].mean()) if len(g) >= 3 else float(vals.mean()),
            "usage_slope":        slope,
            "usage_recent_total": float(recent),
        }

    rows = []
    for acc, grp in p.groupby("acc_id"):
        grp    = grp.sort_values("payment_date").reset_index(drop=True)
        dates  = grp["payment_date"].tolist()
        amts   = grp["amount"].tolist()
        creds  = grp["credit_add"].tolist()
        types  = grp["credit_type"].tolist()

        for i in range(len(dates) - 1):
            interval = (dates[i + 1] - dates[i]).days
            if interval <= 0:
                continue
            prev_amts  = amts[:i + 1]
            prev_dates = dates[:i + 1]
            intervals  = [(prev_dates[j + 1] - prev_dates[j]).days
                          for j in range(len(prev_dates) - 1)]
            avg_int = float(np.mean(intervals)) if intervals else 0.0
            uf      = acc_usage.get(acc, {})
            rows.append({
                "acc_id":               acc,
                "target_days":          interval,
                "current_amount_log":   np.log1p(amts[i]),
                "current_credits_log":  np.log1p(creds[i]),
                "credit_type_sms":      1 if types[i] == "sms" else 0,
                "n_prev":               i + 1,
                "avg_prev_amount_log":  np.log1p(np.mean(prev_amts)),
                "max_prev_amount_log":  np.log1p(np.max(prev_amts)),
                "total_prev_amount_log":np.log1p(np.sum(prev_amts)),
                "avg_interval":         avg_int,
                "std_interval":         float(np.std(intervals)) if len(intervals) > 1 else 0.0,
                "last_interval":        float(intervals[-1]) if intervals else 0.0,
                "days_since_prev":      (dates[i] - dates[i - 1]).days if i > 0 else 0,
                "cv_interval":          float(np.std(intervals) / avg_int)
                                        if (intervals and avg_int > 0) else 0.0,
                "min_interval":         float(np.min(intervals)) if intervals else 0.0,
                "max_interval":         float(np.max(intervals)) if intervals else 0.0,
                "amount_ratio":         float(amts[i] / np.mean(prev_amts))
                                        if np.mean(prev_amts) > 0 else 1.0,
                "usage_total_log":      uf.get("usage_total_log", 0.0),
                "usage_avg_monthly":    uf.get("usage_avg_monthly", 0.0),
                "usage_recent_avg":     uf.get("usage_recent_avg", 0.0),
                "usage_slope":          uf.get("usage_slope", 0.0),
                "usage_recent_total":   uf.get("usage_recent_total", 0.0),
            })

    pairs = pd.DataFrame(rows)
    if len(pairs) == 0:
        return pairs

    # remove outliers
    p99 = pairs["target_days"].quantile(outlier_pctile / 100)
    pairs = pairs[pairs["target_days"] <= p99].copy()
    pairs["target_log"] = np.log1p(pairs["target_days"])
    print(f"  Transaction pairs: {len(pairs):,} (outlier cutoff >{p99:.0f} days)")
    return pairs


def build_latest_transaction_features(payments: pd.DataFrame, usage: pd.DataFrame,
                                       cutoff: pd.Timestamp) -> pd.DataFrame:
    """
    สร้าง features จาก transaction ล่าสุดของแต่ละ customer
    ใช้สำหรับ predict next purchase (ไม่ใช่ training)
    """
    p = payments[payments["payment_date"] < cutoff].sort_values(["acc_id", "payment_date"])

    u_pre      = usage[usage["period"] < cutoff]
    recent_cut = cutoff - pd.DateOffset(months=3)
    acc_usage  = {}
    for acc, g in u_pre.groupby("acc_id"):
        g    = g.sort_values("period")
        vals = g["usage"].values
        recent = g[g["period"] >= recent_cut]["usage"].sum()
        slope  = float(np.polyfit(np.arange(len(vals)), vals, 1)[0]) if len(vals) >= 2 else 0.0
        acc_usage[acc] = {
            "usage_total_log":    float(np.log1p(vals.sum())),
            "usage_avg_monthly":  float(vals.mean()),
            "usage_recent_avg":   float(g.tail(3)["usage"].mean()) if len(g) >= 3 else float(vals.mean()),
            "usage_slope":        slope,
            "usage_recent_total": float(recent),
        }

    rows = []
    for acc, grp in p.groupby("acc_id"):
        grp   = grp.sort_values("payment_date").reset_index(drop=True)
        dates = grp["payment_date"].tolist()
        amts  = grp["amount"].tolist()
        creds = grp["credit_add"].tolist()
        types = grp["credit_type"].tolist()
        i     = len(dates) - 1

        prev_amts  = amts[:i] if i > 0 else [amts[0]]
        prev_dates = dates[:i] if i > 0 else [dates[0]]
        intervals  = [(prev_dates[j + 1] - prev_dates[j]).days
                      for j in range(len(prev_dates) - 1)]
        avg_int = float(np.mean(intervals)) if intervals else 0.0
        uf      = acc_usage.get(acc, {})
        rows.append({
            "acc_id":               acc,
            "current_amount_log":   np.log1p(amts[i]),
            "current_credits_log":  np.log1p(creds[i]),
            "credit_type_sms":      1 if types[i] == "sms" else 0,
            "n_prev":               i + 1,
            "avg_prev_amount_log":  np.log1p(np.mean(prev_amts)),
            "max_prev_amount_log":  np.log1p(np.max(prev_amts)),
            "total_prev_amount_log":np.log1p(np.sum(prev_amts)),
            "avg_interval":         avg_int,
            "std_interval":         float(np.std(intervals)) if len(intervals) > 1 else 0.0,
            "last_interval":        float(intervals[-1]) if intervals else 0.0,
            "days_since_prev":      (dates[i] - dates[i - 1]).days if i > 0 else 0,
            "cv_interval":          float(np.std(intervals) / avg_int)
                                    if (intervals and avg_int > 0) else 0.0,
            "min_interval":         float(np.min(intervals)) if intervals else 0.0,
            "max_interval":         float(np.max(intervals)) if intervals else 0.0,
            "amount_ratio":         float(amts[i] / np.mean(prev_amts))
                                    if np.mean(prev_amts) > 0 else 1.0,
            "usage_total_log":      uf.get("usage_total_log", 0.0),
            "usage_avg_monthly":    uf.get("usage_avg_monthly", 0.0),
            "usage_recent_avg":     uf.get("usage_recent_avg", 0.0),
            "usage_slope":          uf.get("usage_slope", 0.0),
            "usage_recent_total":   uf.get("usage_recent_total", 0.0),
        })

    return pd.DataFrame(rows)
