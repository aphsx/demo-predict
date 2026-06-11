"""Point-in-time label builders for the rebuilt ML pipeline."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class LabelConfig:
    cutoff_date: pd.Timestamp
    horizon_days: int = 180
    active_window_days: int = 180


def build_churn_labels(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    config: LabelConfig,
) -> pd.DataFrame:
    """Build churn labels for active paid customers at the cutoff.

    Positive churn means no payment and no usage in the post-cutoff horizon.
    """

    cutoff = _timestamp(config.cutoff_date)
    horizon_end = cutoff + pd.Timedelta(days=config.horizon_days)
    active_start = cutoff - pd.Timedelta(days=config.active_window_days)

    customer_ids = _customer_ids(customers)
    activity = _activity_events(payments, usage)
    pre_active_ids = _ids_in_window(activity, active_start, cutoff) & customer_ids
    future_active_ids = _ids_in_window(activity, cutoff, horizon_end) & customer_ids
    ever_paid_before_ids = _ids_before(payments, "payment_date", cutoff) & customer_ids

    eligible_ids = pre_active_ids & ever_paid_before_ids
    rows = pd.DataFrame({"acc_id": sorted(eligible_ids)})
    if rows.empty:
        rows["churn_label"] = pd.Series(dtype="Int64")
        rows["eligible_for_churn"] = pd.Series(dtype="bool")
        return rows

    rows["churn_label"] = (~rows["acc_id"].isin(future_active_ids)).astype("int64")
    rows["eligible_for_churn"] = True
    return rows


def build_clv_labels(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    config: LabelConfig,
) -> pd.DataFrame:
    """Build six-month future revenue labels for customers active before cutoff."""

    cutoff = _timestamp(config.cutoff_date)
    horizon_end = cutoff + pd.Timedelta(days=config.horizon_days)
    active_start = cutoff - pd.Timedelta(days=config.active_window_days)

    customer_ids = _customer_ids(customers)
    active_ids = _ids_in_window(_activity_events(payments, usage), active_start, cutoff) & customer_ids
    future_payments = payments[
        (payments["payment_date"] >= cutoff) & (payments["payment_date"] < horizon_end)
    ]
    future_revenue = future_payments.groupby("acc_id")["amount"].sum()

    rows = pd.DataFrame({"acc_id": sorted(active_ids)})
    rows["future_revenue_6m"] = rows["acc_id"].map(future_revenue).fillna(0.0)
    rows["future_purchase_flag"] = rows["future_revenue_6m"] > 0
    rows["eligible_for_clv"] = True
    return rows


def build_credit_usage_labels(
    customers: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
) -> pd.DataFrame:
    """Build future 30d/90d usage labels for all known customers."""

    cutoff = _timestamp(cutoff_date)
    customer_ids = sorted(_customer_ids(customers))
    future_usage_30d = _future_usage_sum(usage, cutoff, cutoff + pd.Timedelta(days=30))
    future_usage_90d = _future_usage_sum(usage, cutoff, cutoff + pd.Timedelta(days=90))

    rows = pd.DataFrame({"acc_id": customer_ids})
    rows["future_credit_usage_30d"] = rows["acc_id"].map(future_usage_30d).fillna(0.0)
    rows["future_credit_usage_90d"] = rows["acc_id"].map(future_usage_90d).fillna(0.0)
    rows["eligible_for_credit"] = True
    return rows


def build_topup_timing_labels(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    cutoff_date: pd.Timestamp,
) -> pd.DataFrame:
    """Build observed days-until-next-top-up labels after cutoff."""

    cutoff = _timestamp(cutoff_date)
    customer_ids = sorted(_customer_ids(customers))
    future_payments = payments[payments["payment_date"] >= cutoff]
    next_payment = future_payments.groupby("acc_id")["payment_date"].min()
    days_until_next = (next_payment - cutoff).dt.days

    rows = pd.DataFrame({"acc_id": customer_ids})
    rows["days_until_next_topup"] = rows["acc_id"].map(days_until_next)
    rows["topup_observed"] = rows["days_until_next_topup"].notna()
    return rows


def build_label_set(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    config: LabelConfig,
) -> dict[str, pd.DataFrame]:
    """Build all labels needed by the first training pipeline layers."""

    return {
        "churn": build_churn_labels(customers, payments, usage, config),
        "clv": build_clv_labels(customers, payments, usage, config),
        "credit_usage": build_credit_usage_labels(customers, usage, config.cutoff_date),
        "topup_timing": build_topup_timing_labels(customers, payments, config.cutoff_date),
    }


def _activity_events(payments: pd.DataFrame, usage: pd.DataFrame) -> pd.DataFrame:
    payment_activity = payments[["acc_id", "payment_date"]].rename(
        columns={"payment_date": "activity_date"}
    )
    usage_activity = usage.loc[usage["usage"] > 0, ["acc_id", "period"]].rename(
        columns={"period": "activity_date"}
    )
    return pd.concat([payment_activity, usage_activity], ignore_index=True).dropna(
        subset=["acc_id", "activity_date"]
    )


def _future_usage_sum(
    usage: pd.DataFrame,
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> pd.Series:
    future_usage = usage[(usage["period"] >= start) & (usage["period"] < end)]
    return future_usage.groupby("acc_id")["usage"].sum()


def _customer_ids(customers: pd.DataFrame) -> set[int]:
    return set(customers["acc_id"].dropna().astype(int).tolist())


def _ids_before(frame: pd.DataFrame, date_column: str, cutoff: pd.Timestamp) -> set[int]:
    return set(frame.loc[frame[date_column] < cutoff, "acc_id"].dropna().astype(int).tolist())


def _ids_in_window(
    activity: pd.DataFrame,
    start: pd.Timestamp,
    end: pd.Timestamp,
) -> set[int]:
    return set(
        activity.loc[
            (activity["activity_date"] >= start) & (activity["activity_date"] < end),
            "acc_id",
        ]
        .dropna()
        .astype(int)
        .tolist()
    )


def _timestamp(value: pd.Timestamp) -> pd.Timestamp:
    return pd.Timestamp(value).tz_localize(None) if pd.Timestamp(value).tzinfo else pd.Timestamp(value)
