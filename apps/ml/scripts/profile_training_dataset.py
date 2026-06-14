#!/usr/bin/env python3
"""
Profile train_clean_* data and estimate label viability before model training.

This script is intentionally read-only. It answers:
- What data is available for a train_data_sources row?
- Which cutoff dates have enough before/after data?
- Are churn, CLV, and credit labels viable for training?
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import create_engine


@dataclass(frozen=True)
class ProfileConfig:
    source_id: str | None
    horizon_days: int
    active_window_days: int
    output_json: Path | None


def parse_args() -> ProfileConfig:
    parser = argparse.ArgumentParser(
        description="Profile train_clean_* data for ML label viability."
    )
    parser.add_argument(
        "--source-id",
        help="train_data_sources.id to profile. Defaults to latest ready source.",
    )
    parser.add_argument(
        "--horizon-days",
        type=int,
        default=180,
        help="Future label horizon in days. Default: 180.",
    )
    parser.add_argument(
        "--active-window-days",
        type=int,
        default=180,
        help="Lookback window for active customer definition. Default: 180.",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        help="Optional path to write the full report JSON.",
    )
    args = parser.parse_args()
    return ProfileConfig(
        source_id=args.source_id,
        horizon_days=args.horizon_days,
        active_window_days=args.active_window_days,
        output_json=args.output_json,
    )


def db_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required.")
    return url


def connect():
    # SQLAlchemy connection keeps pandas read_sql on the supported path.
    return create_engine(db_url()).connect()


def read_sql(conn, query: str, params: tuple[Any, ...] = ()) -> pd.DataFrame:
    return pd.read_sql_query(query, conn, params=params)


def latest_ready_source(conn) -> str:
    rows = read_sql(
        conn,
        """
        SELECT id
        FROM train_data_sources
        WHERE import_status = 'ready'
        ORDER BY created_at DESC
        LIMIT 1
        """,
    )
    if rows.empty:
        raise RuntimeError("No ready train_data_sources row found.")
    return str(rows.iloc[0]["id"])


def load_source_metadata(conn, source_id: str) -> dict[str, Any]:
    rows = read_sql(
        conn,
        """
        SELECT
          id::text,
          name,
          client_label,
          original_filename,
          import_status,
          imported_at,
          cleaned_at,
          sheet_manifest,
          clean_manifest
        FROM train_data_sources
        WHERE id = %s
        """,
        (source_id,),
    )
    if rows.empty:
        raise RuntimeError(f"train_data_sources row not found: {source_id}")
    row = rows.iloc[0].to_dict()
    for key in ("imported_at", "cleaned_at"):
        if pd.notna(row.get(key)):
            row[key] = row[key].isoformat()
        else:
            row[key] = None
    return row


def load_clean_data(conn, source_id: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    customers = read_sql(
        conn,
        """
        SELECT
          acc_id,
          status_sms,
          credit_sms,
          credit_email,
          expire_sms,
          expire_email,
          status_email,
          join_date,
          last_access,
          last_send
        FROM train_clean_customers
        WHERE source_id = %s
        """,
        (source_id,),
    )
    payments = read_sql(
        conn,
        """
        SELECT
          acc_id,
          payment_uid,
          payment_date,
          amount,
          credit_add,
          credit_type
        FROM train_clean_payments
        WHERE source_id = %s
        """,
        (source_id,),
    )
    usage = read_sql(
        conn,
        """
        SELECT
          acc_id,
          year,
          month,
          usage,
          channel,
          usage_source
        FROM train_clean_usage
        WHERE source_id = %s
        """,
        (source_id,),
    )

    customers["acc_id"] = customers["acc_id"].astype("int64")
    for col in ("join_date", "expire_sms", "expire_email"):
        customers[col] = pd.to_datetime(customers[col], errors="coerce")
    for col in ("last_access", "last_send"):
        customers[col] = pd.to_datetime(customers[col], errors="coerce", utc=True).dt.tz_localize(None)

    payments["acc_id"] = payments["acc_id"].astype("int64")
    payments["payment_date"] = pd.to_datetime(
        payments["payment_date"], errors="coerce", utc=True
    ).dt.tz_localize(None)
    payments["amount"] = pd.to_numeric(payments["amount"], errors="coerce").fillna(0)
    payments["credit_add"] = pd.to_numeric(payments["credit_add"], errors="coerce").fillna(0)

    usage["acc_id"] = usage["acc_id"].astype("int64")
    usage["usage"] = pd.to_numeric(usage["usage"], errors="coerce").fillna(0)
    usage["period"] = pd.to_datetime(
        usage["year"].astype(str) + "-" + usage["month"].astype(str).str.zfill(2) + "-01",
        errors="coerce",
    )

    return customers, payments, usage


def to_jsonable(value: Any) -> Any:
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if np.isnan(value):
            return None
        return float(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        if pd.isna(value):
            return None
        return value.isoformat()
    if isinstance(value, np.ndarray):
        return [to_jsonable(v) for v in value.tolist()]
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if pd.isna(value) if not isinstance(value, (dict, list, tuple, set)) else False:
        return None
    return value


def quantiles(series: pd.Series, qs: list[float]) -> dict[str, float | None]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return {f"p{int(q * 100)}": None for q in qs}
    return {f"p{int(q * 100)}": float(clean.quantile(q)) for q in qs}


def basic_summary(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
) -> dict[str, Any]:
    usage_period = usage["period"].dropna()
    payment_date = payments["payment_date"].dropna()

    paying = payments.groupby("acc_id").agg(
        n_payments=("payment_date", "count"),
        total_revenue=("amount", "sum"),
        total_credit=("credit_add", "sum"),
    )
    using = usage.groupby("acc_id").agg(
        usage_rows=("usage", "count"),
        usage_months=("period", "nunique"),
        total_usage=("usage", "sum"),
    )

    customer_ids = set(customers["acc_id"])
    paying_ids = set(paying.index) & customer_ids
    using_ids = set(using.index) & customer_ids
    paying_in_customers = paying.loc[paying.index.isin(customer_ids)]
    using_in_customers = using.loc[using.index.isin(customer_ids)]

    return {
        "row_counts": {
            "customers": int(len(customers)),
            "payments": int(len(payments)),
            "usage": int(len(usage)),
        },
        "distinct_customers": {
            "customers": int(customers["acc_id"].nunique()),
            "with_payment": int(len(paying_ids)),
            "with_usage": int(len(using_ids)),
            "with_any_activity": int(len((paying_ids | using_ids) & customer_ids)),
            "with_payment_and_usage": int(len((paying_ids & using_ids) & customer_ids)),
            "with_2plus_payments": int((paying_in_customers["n_payments"] >= 2).sum()),
            "with_3plus_usage_months": int((using_in_customers["usage_months"] >= 3).sum()),
            "with_6plus_usage_months": int((using_in_customers["usage_months"] >= 6).sum()),
            "with_12plus_usage_months": int((using_in_customers["usage_months"] >= 12).sum()),
        },
        "date_ranges": {
            "join_date_min": customers["join_date"].min(),
            "join_date_max": customers["join_date"].max(),
            "payment_date_min": payment_date.min() if not payment_date.empty else None,
            "payment_date_max": payment_date.max() if not payment_date.empty else None,
            "usage_period_min": usage_period.min() if not usage_period.empty else None,
            "usage_period_max": usage_period.max() if not usage_period.empty else None,
        },
        "payment_distribution": {
            "payment_count": quantiles(paying["n_payments"], [0.25, 0.5, 0.75, 0.9, 0.95]),
            "total_revenue": quantiles(paying["total_revenue"], [0.25, 0.5, 0.75, 0.9, 0.95]),
        },
        "usage_distribution": {
            "usage_months": quantiles(using["usage_months"], [0.25, 0.5, 0.75, 0.9, 0.95]),
            "total_usage": quantiles(using["total_usage"], [0.25, 0.5, 0.75, 0.9, 0.95]),
        },
        "channel_mix": usage.groupby(["channel", "usage_source"])
        .agg(rows=("usage", "count"), customers=("acc_id", "nunique"), total_usage=("usage", "sum"))
        .reset_index()
        .to_dict(orient="records"),
        "credit_type_mix": payments.groupby("credit_type", dropna=False)
        .agg(rows=("amount", "count"), customers=("acc_id", "nunique"), amount=("amount", "sum"), credit_add=("credit_add", "sum"))
        .reset_index()
        .to_dict(orient="records"),
    }


def candidate_cutoffs(payments: pd.DataFrame, usage: pd.DataFrame, horizon_days: int) -> list[pd.Timestamp]:
    activity_min = min(payments["payment_date"].min(), usage["period"].min())
    activity_max = max(payments["payment_date"].max(), usage["period"].max())
    if pd.isna(activity_min) or pd.isna(activity_max):
        return []

    earliest = (activity_min + pd.DateOffset(months=6)).to_period("Q").start_time
    latest = activity_max - pd.Timedelta(days=horizon_days)
    if earliest > latest:
        return []

    cutoffs = pd.date_range(earliest, latest, freq="QS")
    return [pd.Timestamp(c) for c in cutoffs]


def build_activity(payments: pd.DataFrame, usage: pd.DataFrame) -> pd.DataFrame:
    payment_activity = payments[["acc_id", "payment_date"]].rename(
        columns={"payment_date": "activity_date"}
    )
    usage_activity = usage.loc[usage["usage"] > 0, ["acc_id", "period"]].rename(
        columns={"period": "activity_date"}
    )
    activity = pd.concat([payment_activity, usage_activity], ignore_index=True)
    return activity.dropna(subset=["activity_date"])


def profile_cutoff(
    cutoff: pd.Timestamp,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    activity: pd.DataFrame,
    horizon_days: int,
    active_window_days: int,
) -> dict[str, Any]:
    horizon_end = cutoff + pd.Timedelta(days=horizon_days)
    active_start = cutoff - pd.Timedelta(days=active_window_days)

    customer_ids = set(customers["acc_id"])
    pre_active_ids = set(
        activity.loc[
            (activity["activity_date"] >= active_start)
            & (activity["activity_date"] < cutoff),
            "acc_id",
        ]
    ) & customer_ids
    future_active_ids = set(
        activity.loc[
            (activity["activity_date"] >= cutoff)
            & (activity["activity_date"] < horizon_end),
            "acc_id",
        ]
    ) & customer_ids
    ever_paid_before_ids = set(
        payments.loc[payments["payment_date"] < cutoff, "acc_id"]
    ) & customer_ids
    target_ids = pre_active_ids & ever_paid_before_ids
    churn_positive_ids = target_ids - future_active_ids
    churn_negative_ids = target_ids & future_active_ids

    future_payments = payments[
        (payments["payment_date"] >= cutoff) & (payments["payment_date"] < horizon_end)
    ]
    future_revenue = future_payments.groupby("acc_id")["amount"].sum()

    future_usage_30 = usage[
        (usage["period"] >= cutoff) & (usage["period"] < cutoff + pd.Timedelta(days=30))
    ].groupby("acc_id")["usage"].sum()
    future_usage_90 = usage[
        (usage["period"] >= cutoff) & (usage["period"] < cutoff + pd.Timedelta(days=90))
    ].groupby("acc_id")["usage"].sum()

    next_payments = (
        payments.loc[payments["payment_date"] >= cutoff]
        .groupby("acc_id")["payment_date"]
        .min()
    )
    days_to_next_topup = (next_payments.loc[next_payments.index.isin(customer_ids)] - cutoff).dt.days

    target_future_revenue = pd.Series(index=list(target_ids), dtype=float)
    target_future_revenue.loc[:] = 0
    target_future_revenue.update(future_revenue)

    return {
        "cutoff_date": cutoff.date().isoformat(),
        "horizon_days": horizon_days,
        "active_window_days": active_window_days,
        "customers": int(len(customers)),
        "active_before": int(len(pre_active_ids)),
        "active_paid_before": int(len(target_ids)),
        "churn_positive": int(len(churn_positive_ids)),
        "churn_negative": int(len(churn_negative_ids)),
        "churn_positive_rate": (
            float(len(churn_positive_ids) / len(target_ids)) if target_ids else None
        ),
        "clv_target": {
            "target_customers": int(len(target_ids)),
            "future_revenue_nonzero": int((target_future_revenue > 0).sum()),
            "future_revenue_nonzero_rate": (
                float((target_future_revenue > 0).mean()) if len(target_future_revenue) else None
            ),
            "future_revenue_quantiles": quantiles(
                target_future_revenue, [0.25, 0.5, 0.75, 0.9, 0.95]
            ),
        },
        "credit_targets": {
            "future_usage_30d_customers": int(
                (future_usage_30.loc[future_usage_30.index.isin(customer_ids)] > 0).sum()
            ),
            "future_usage_90d_customers": int(
                (future_usage_90.loc[future_usage_90.index.isin(customer_ids)] > 0).sum()
            ),
            "next_topup_customers": int(days_to_next_topup.notna().sum()),
            "days_until_next_topup_quantiles": quantiles(
                days_to_next_topup, [0.1, 0.25, 0.5, 0.75, 0.9]
            ),
        },
    }


def choose_recommended_cutoff(cutoff_profiles: list[dict[str, Any]]) -> dict[str, Any] | None:
    viable = [
        row
        for row in cutoff_profiles
        if row["active_paid_before"] >= 500
        and row["churn_positive"] >= 100
        and row["churn_negative"] >= 100
    ]
    if not viable:
        return None
    return sorted(viable, key=lambda r: (r["active_paid_before"], r["cutoff_date"]), reverse=True)[0]


def build_report(config: ProfileConfig) -> dict[str, Any]:
    with connect() as conn:
        source_id = config.source_id or latest_ready_source(conn)
        source = load_source_metadata(conn, source_id)
        customers, payments, usage = load_clean_data(conn, source_id)

    activity = build_activity(payments, usage)
    summary = basic_summary(customers, payments, usage)
    cutoffs = candidate_cutoffs(payments, usage, config.horizon_days)
    cutoff_profiles = [
        profile_cutoff(
            cutoff,
            customers,
            payments,
            usage,
            activity,
            config.horizon_days,
            config.active_window_days,
        )
        for cutoff in cutoffs
    ]
    recommended = choose_recommended_cutoff(cutoff_profiles)

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source": source,
        "config": {
            "horizon_days": config.horizon_days,
            "active_window_days": config.active_window_days,
        },
        "summary": summary,
        "cutoff_profiles": cutoff_profiles,
        "recommended_cutoff": recommended,
        "next_step": {
            "if_recommended_cutoff_exists": "Build churn training dataframe for the recommended cutoff.",
            "if_not": "Try shorter horizon_days or inspect activity sparsity before training.",
        },
    }


def print_report(report: dict[str, Any]) -> None:
    source = report["source"]
    summary = report["summary"]

    print("=" * 80)
    print("Training Dataset Profile")
    print("=" * 80)
    print(f"source_id: {source['id']}")
    print(f"name: {source['name']}")
    print(f"status: {source['import_status']}")
    print(f"cleaned_at: {source['cleaned_at']}")
    print()

    rows = summary["row_counts"]
    distinct = summary["distinct_customers"]
    print("Data volume")
    print(f"  customers: {rows['customers']:,}")
    print(f"  payments:  {rows['payments']:,}")
    print(f"  usage:     {rows['usage']:,}")
    print()
    print("Customer coverage")
    print(f"  with payment:              {distinct['with_payment']:,}")
    print(f"  with usage:                {distinct['with_usage']:,}")
    print(f"  with any activity:         {distinct['with_any_activity']:,}")
    print(f"  with payment and usage:    {distinct['with_payment_and_usage']:,}")
    print(f"  with 2+ payments:          {distinct['with_2plus_payments']:,}")
    print(f"  with 6+ usage months:      {distinct['with_6plus_usage_months']:,}")
    print(f"  with 12+ usage months:     {distinct['with_12plus_usage_months']:,}")
    print()

    dates = summary["date_ranges"]
    print("Date ranges")
    print(f"  join_date:    {dates['join_date_min']} -> {dates['join_date_max']}")
    print(f"  payment_date: {dates['payment_date_min']} -> {dates['payment_date_max']}")
    print(f"  usage_period: {dates['usage_period_min']} -> {dates['usage_period_max']}")
    print()

    print("Cutoff viability")
    print(
        "  cutoff      active_paid  churn_pos  churn_neg  pos_rate  "
        "future_rev>0  usage30>0  usage90>0  next_topup"
    )
    for row in report["cutoff_profiles"]:
        clv = row["clv_target"]
        credit = row["credit_targets"]
        pos_rate = row["churn_positive_rate"]
        pos_rate_s = f"{pos_rate:.1%}" if pos_rate is not None else "n/a"
        print(
            f"  {row['cutoff_date']}  "
            f"{row['active_paid_before']:>11,}  "
            f"{row['churn_positive']:>9,}  "
            f"{row['churn_negative']:>9,}  "
            f"{pos_rate_s:>8}  "
            f"{clv['future_revenue_nonzero']:>12,}  "
            f"{credit['future_usage_30d_customers']:>9,}  "
            f"{credit['future_usage_90d_customers']:>9,}  "
            f"{credit['next_topup_customers']:>10,}"
        )
    print()

    recommended = report["recommended_cutoff"]
    if recommended:
        print("Recommended first cutoff")
        print(f"  cutoff_date: {recommended['cutoff_date']}")
        print(f"  active_paid_before: {recommended['active_paid_before']:,}")
        print(f"  churn_positive_rate: {recommended['churn_positive_rate']:.1%}")
        print("  next: build churn training dataframe for this cutoff")
    else:
        print("Recommended first cutoff")
        print("  none found with enough positive and negative churn labels")
        print("  next: try a shorter horizon or profile custom cutoffs")
    print("=" * 80)


def main() -> None:
    config = parse_args()
    report = build_report(config)
    print_report(report)
    if config.output_json:
        config.output_json.parent.mkdir(parents=True, exist_ok=True)
        config.output_json.write_text(
            json.dumps(to_jsonable(report), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"Wrote JSON report: {config.output_json}")


if __name__ == "__main__":
    main()
