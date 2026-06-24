"""Point-in-time feature builders for the rebuilt ML pipeline."""

from __future__ import annotations

import hashlib
import inspect
import json
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd


FeatureSchema = dict[str, dict[str, Any]]

EPSILON = 1e-9
BASE_TIER_A_FEATURES = [
    "customer_age_days",
    "days_since_last_activity",
    "days_since_last_payment",
    "days_since_last_usage",
    "payment_count_all",
    "payment_count_180d",
    "total_revenue_all",
    "total_revenue_180d",
    "avg_transaction_value",
    "payment_interval_mean_days",
    "payment_overdue_ratio",
    "usage_total_180d",
    "usage_recent_90d",
    "usage_prev_90d",
    "usage_change_90d_pct",
    "usage_decay_ratio",
    "usage_slope_6m",
    "usage_active_months_180d",
    "usage_consistency_ratio",
    "sms_usage_share",
    "email_usage_share",
    "bc_usage_share",
    "api_usage_share",
    "otp_usage_share",
]
CREDIT_TIER_A_FEATURES = [
    *BASE_TIER_A_FEATURES,
    "credit_added_180d",
    "credit_balance_proxy",
    "credit_runway_months",
    "credit_usage_decel",
]
# Churn/CLV intentionally keep the original compact Tier A contract. Credit
# uses the extended contract because balance/runway features are directly tied
# to future usage but add avoidable noise to churn and CLV backtests.
MINIMUM_TIER_A_FEATURES = BASE_TIER_A_FEATURES

ZERO_DEFAULT_FEATURES = {
    "payment_count_all",
    "payment_count_180d",
    "total_revenue_all",
    "total_revenue_180d",
    "usage_total_180d",
    "usage_recent_90d",
    "usage_prev_90d",
    "usage_change_90d_pct",
    "usage_decay_ratio",
    "usage_slope_6m",
    "usage_active_months_180d",
    "usage_consistency_ratio",
    "sms_usage_share",
    "email_usage_share",
    "bc_usage_share",
    "api_usage_share",
    "otp_usage_share",
    "credit_added_180d",
    "credit_balance_proxy",
    "credit_runway_months",
    "credit_usage_decel",
}

NULLABLE_CONTRACT_FEATURES = {
    "customer_age_days",
    "days_since_last_activity",
    "days_since_last_payment",
    "days_since_last_usage",
    "avg_transaction_value",
    "payment_interval_mean_days",
    "payment_overdue_ratio",
}

FEATURE_METADATA: FeatureSchema = {
    "customer_age_days": {
        "source": "customers.join_date",
        "lookback_window": "static_before_cutoff",
        "formula": "cutoff_date - join_date",
        "null_handling": "nullable when join_date is missing",
    },
    "days_since_last_activity": {
        "source": "payments.payment_date + positive usage.period",
        "lookback_window": "all_history_before_cutoff",
        "formula": "cutoff_date - max(activity_date)",
        "null_handling": "nullable when no prior activity exists",
    },
    "days_since_last_payment": {
        "source": "payments.payment_date",
        "lookback_window": "all_history_before_cutoff",
        "formula": "cutoff_date - max(payment_date)",
        "null_handling": "nullable when no prior payment exists",
    },
    "days_since_last_usage": {
        "source": "positive usage.period",
        "lookback_window": "all_history_before_cutoff",
        "formula": "cutoff_date - max(positive usage period)",
        "null_handling": "nullable when no prior positive usage exists",
    },
    "payment_count_all": {
        "source": "payments.payment_date",
        "lookback_window": "all_history_before_cutoff",
        "formula": "count(payments)",
        "null_handling": "0 when no prior payment exists",
    },
    "payment_count_180d": {
        "source": "payments.payment_date",
        "lookback_window": "180d_before_cutoff",
        "formula": "count(payments in last 180 days)",
        "null_handling": "0 when no payment exists in window",
    },
    "total_revenue_all": {
        "source": "payments.amount",
        "lookback_window": "all_history_before_cutoff",
        "formula": "sum(amount)",
        "null_handling": "0 when no prior payment exists",
    },
    "total_revenue_180d": {
        "source": "payments.amount",
        "lookback_window": "180d_before_cutoff",
        "formula": "sum(amount in last 180 days)",
        "null_handling": "0 when no payment exists in window",
    },
    "avg_transaction_value": {
        "source": "payments.amount",
        "lookback_window": "all_history_before_cutoff",
        "formula": "mean(amount)",
        "null_handling": "nullable when no prior payment exists",
    },
    "payment_interval_mean_days": {
        "source": "payments.payment_date",
        "lookback_window": "all_history_before_cutoff",
        "formula": "mean(days between consecutive payments)",
        "null_handling": "nullable when fewer than 2 payments exist",
    },
    "payment_overdue_ratio": {
        "source": "payments.payment_date",
        "lookback_window": "all_history_before_cutoff",
        "formula": "days_since_last_payment / payment_interval_mean_days",
        "null_handling": "nullable when payment cadence is unknown",
    },
    "usage_total_180d": {
        "source": "usage.usage",
        "lookback_window": "180d_before_cutoff",
        "formula": "sum(usage in last 180 days)",
        "null_handling": "0 when no usage exists in window",
    },
    "usage_recent_90d": {
        "source": "usage.usage",
        "lookback_window": "90d_before_cutoff",
        "formula": "sum(usage in recent 90 days)",
        "null_handling": "0 when no usage exists in window",
    },
    "usage_prev_90d": {
        "source": "usage.usage",
        "lookback_window": "90_to_180d_before_cutoff",
        "formula": "sum(usage in previous 90 days)",
        "null_handling": "0 when no usage exists in window",
    },
    "usage_change_90d_pct": {
        "source": "usage.usage",
        "lookback_window": "180d_before_cutoff",
        "formula": "signed_log1p((usage_recent_90d - usage_prev_90d) / usage_prev_90d)",
        "null_handling": "0 for no usage, 1 for new recent usage without previous usage",
    },
    "usage_decay_ratio": {
        "source": "usage.usage",
        "lookback_window": "180d_before_cutoff",
        "formula": "signed_log1p(usage_recent_90d / usage_prev_90d)",
        "null_handling": "0 for no usage, 1 for new recent usage without previous usage",
    },
    "usage_slope_6m": {
        "source": "usage.usage",
        "lookback_window": "6 calendar months before cutoff",
        "formula": "linear slope of monthly usage over six months",
        "null_handling": "0 when no usage exists in window",
    },
    "usage_active_months_180d": {
        "source": "positive usage.period",
        "lookback_window": "180d_before_cutoff",
        "formula": "count(distinct positive usage months)",
        "null_handling": "0 when no positive usage exists in window",
    },
    "usage_consistency_ratio": {
        "source": "positive usage.period",
        "lookback_window": "180d_before_cutoff",
        "formula": "usage_active_months_180d / 6",
        "null_handling": "0 when no positive usage exists in window",
    },
    "sms_usage_share": {
        "source": "usage.channel + usage.usage",
        "lookback_window": "all_history_before_cutoff",
        "formula": "sms usage / total usage",
        "null_handling": "0 when total usage is zero",
    },
    "email_usage_share": {
        "source": "usage.channel + usage.usage",
        "lookback_window": "all_history_before_cutoff",
        "formula": "email usage / total usage",
        "null_handling": "0 when total usage is zero",
    },
    "bc_usage_share": {
        "source": "usage.usage_source + usage.usage",
        "lookback_window": "all_history_before_cutoff",
        "formula": "broadcast campaign usage / total usage",
        "null_handling": "0 when total usage is zero",
    },
    "api_usage_share": {
        "source": "usage.usage_source + usage.usage",
        "lookback_window": "all_history_before_cutoff",
        "formula": "api usage / total usage",
        "null_handling": "0 when total usage is zero",
    },
    "otp_usage_share": {
        "source": "usage.usage_source + usage.usage",
        "lookback_window": "all_history_before_cutoff",
        "formula": "otp usage / total usage",
        "null_handling": "0 when total usage is zero",
    },
    "credit_added_180d": {
        "source": "payments.credit_add",
        "lookback_window": "180d_before_cutoff",
        "formula": "sum(credit_add in last 180 days)",
        "null_handling": "0 when no top-up exists in window",
    },
    "credit_balance_proxy": {
        "source": "payments.credit_add + usage.usage",
        "lookback_window": "all_history_before_cutoff",
        "formula": "sum(credit_add) - sum(usage), both before cutoff (PIT-safe; snapshot credit_sms/credit_email are NOT used because they reflect export time)",
        "null_handling": "0 when no prior activity exists",
    },
    "credit_runway_months": {
        "source": "payments.credit_add + usage.usage",
        "lookback_window": "all_history_before_cutoff",
        "formula": "credit_balance_proxy / (usage_recent_90d / 3), clipped to [0, 24]; 24 when balance > 0 with no recent usage",
        "null_handling": "0 when no prior activity or non-positive balance",
    },
    "credit_usage_decel": {
        "source": "usage.usage",
        "lookback_window": "180d_before_cutoff",
        "formula": "signed_log1p((usage_recent_90d/3 - usage_prev_90d/3) / (usage_prev_90d/3 + ε)) — second-order usage trend (acceleration/deceleration)",
        "null_handling": "0 when no prior usage exists",
    },
}


@dataclass(frozen=True)
class FeatureBuildResult:
    feature_df: pd.DataFrame
    feature_names: list[str]
    feature_schema: FeatureSchema
    feature_stats: dict[str, Any]
    eligibility_df: pd.DataFrame
    lifecycle_df: pd.DataFrame


@dataclass(frozen=True)
class FeatureSetContract:
    name: str
    version: str
    model_type: str
    feature_names: list[str]
    feature_schema: FeatureSchema
    transform_config: dict[str, Any]
    feature_code_hash: str
    lifecycle_code_hash: str
    status: str = "candidate"


def build_feature_set_contract(
    result: FeatureBuildResult,
    *,
    name: str = "churn_A_safe_history",
    version: str = "v1",
    model_type: str = "churn",
    feature_names: list[str] | None = None,
    status: str = "candidate",
) -> FeatureSetContract:
    """Build a persistable feature set contract for model training/prediction."""

    contract_features = list(feature_names or result.feature_names)
    feature_schema = _schema_for_features(result.feature_schema, contract_features)
    feature_hash = feature_code_hash(contract_features)
    lifecycle_hash = lifecycle_code_hash()
    return FeatureSetContract(
        name=name,
        version=version,
        model_type=model_type,
        feature_names=contract_features,
        feature_schema=feature_schema,
        transform_config=build_transform_config(
            feature_schema,
            feature_code_hash=feature_hash,
            lifecycle_code_hash=lifecycle_hash,
        ),
        feature_code_hash=feature_hash,
        lifecycle_code_hash=lifecycle_hash,
        status=status,
    )


def build_transform_config(
    feature_schema: FeatureSchema,
    *,
    feature_code_hash: str | None = None,
    lifecycle_code_hash: str | None = None,
) -> dict[str, Any]:
    """Describe deterministic preprocessing defaults without fitting on data."""

    return {
        "numeric_features": list(feature_schema.keys()),
        "categorical_features": [],
        "imputation": {
            feature_name: metadata["default"]
            for feature_name, metadata in feature_schema.items()
            if metadata.get("default") is not None
        },
        "nullable_features": [
            feature_name
            for feature_name, metadata in feature_schema.items()
            if metadata.get("nullable")
        ],
        "metadata": {
            "feature_code_hash": feature_code_hash,
            "lifecycle_code_hash": lifecycle_code_hash,
        },
    }


def _schema_for_features(feature_schema: FeatureSchema, feature_names: list[str]) -> FeatureSchema:
    return {feature_name: feature_schema[feature_name] for feature_name in feature_names}


def feature_names_for_model(model_type: str) -> list[str]:
    """Return the feature contract used by each model family."""

    return list(CREDIT_TIER_A_FEATURES if model_type == "credit" else BASE_TIER_A_FEATURES)


def feature_code_hash(feature_names: list[str] | None = None) -> str:
    """Hash only source that affects the model feature matrix contract."""

    contract_features = list(feature_names or MINIMUM_TIER_A_FEATURES)
    uses_credit_features = any(name in CREDIT_TIER_A_FEATURES[len(BASE_TIER_A_FEATURES):] for name in contract_features)
    builders = {
        "feature_df": inspect.getsource(_build_feature_df),
        "profile": inspect.getsource(build_profile_features),
        "payment": inspect.getsource(build_payment_features),
        "usage": inspect.getsource(build_usage_features),
        "channel": inspect.getsource(build_channel_features),
        "source": inspect.getsource(build_source_features),
        "activity": inspect.getsource(build_activity_features),
        "interaction": inspect.getsource(build_interaction_features),
        "feature_schema": inspect.getsource(build_feature_schema),
        "feature_stats": inspect.getsource(build_feature_stats),
    }
    if uses_credit_features:
        builders["credit"] = inspect.getsource(build_credit_features)

    payload = {
        "minimum_tier_a_features": contract_features,
        "zero_default_features": sorted(set(contract_features) & ZERO_DEFAULT_FEATURES),
        "nullable_contract_features": sorted(NULLABLE_CONTRACT_FEATURES),
        "feature_metadata": _schema_for_features(FEATURE_METADATA, contract_features),
        "builders": builders,
        "helpers": {
            "base_customer_frame": inspect.getsource(_base_customer_frame),
            "known_account_ids": inspect.getsource(_known_account_ids),
            "payment_history": inspect.getsource(_payment_history),
            "usage_history": inspect.getsource(_usage_history),
            "payment_interval_features": inspect.getsource(_payment_interval_features),
            "usage_slope_6m": inspect.getsource(_usage_slope_6m),
            "share_features": inspect.getsource(_share_features),
            "ensure_feature_columns": inspect.getsource(_ensure_feature_columns),
            "apply_feature_defaults": inspect.getsource(_apply_feature_defaults),
            "safe_pct_change": inspect.getsource(_safe_pct_change),
            "signed_log1p": inspect.getsource(_signed_log1p),
            "activity_ratio": inspect.getsource(_activity_ratio),
            "safe_ratio": inspect.getsource(_safe_ratio),
            "nullable_ratio": inspect.getsource(_nullable_ratio),
            "numeric_feature_stats": inspect.getsource(_numeric_feature_stats),
            "pit_stats": inspect.getsource(_pit_stats),
            "empty_feature_frame": inspect.getsource(_empty_feature_frame),
            "customer_ids": inspect.getsource(_customer_ids),
            "timestamp": inspect.getsource(_timestamp),
            "date_string": inspect.getsource(_date_string),
            "float": inspect.getsource(_float),
        },
    }
    return _hash_payload(payload)


def lifecycle_code_hash() -> str:
    """Hash source that affects observed lifecycle/status outputs."""

    payload = {
        "builders": {
            "eligibility": inspect.getsource(build_eligibility),
            "lifecycle_outputs": inspect.getsource(build_lifecycle_outputs),
        },
        "helpers": {
            "payment_history": inspect.getsource(_payment_history),
            "usage_history": inspect.getsource(_usage_history),
            "customer_ids": inspect.getsource(_customer_ids),
            "lifecycle_stage": inspect.getsource(_lifecycle_stage),
            "lifecycle_sub_stage": inspect.getsource(_lifecycle_sub_stage),
            "model_eligibility": inspect.getsource(_model_eligibility),
            "timestamp": inspect.getsource(_timestamp),
        },
    }
    return _hash_payload(payload)


def build_profile_features(customers: pd.DataFrame, cutoff_date: pd.Timestamp) -> pd.DataFrame:
    """Build low-leakage profile features from stable account fields."""

    cutoff = _timestamp(cutoff_date)
    rows = customers[["acc_id", "join_date"]].copy()
    rows["customer_age_days"] = (cutoff - rows["join_date"]).dt.days
    rows = rows.sort_values("acc_id").drop_duplicates("acc_id", keep="last")
    return rows[["acc_id", "customer_age_days"]]


def build_payment_features(payments: pd.DataFrame, cutoff_date: pd.Timestamp) -> pd.DataFrame:
    """Build payment RFM and cadence features using payment_date < cutoff."""

    cutoff = _timestamp(cutoff_date)
    history = _payment_history(payments, cutoff)
    if history.empty:
        return _empty_feature_frame(
            [
                "days_since_last_payment",
                "payment_count_all",
                "payment_count_180d",
                "total_revenue_all",
                "total_revenue_180d",
                "avg_transaction_value",
                "payment_interval_mean_days",
                "payment_overdue_ratio",
            ]
        )

    grouped = history.groupby("acc_id", dropna=True)
    features = grouped.agg(
        last_payment_date=("payment_date", "max"),
        payment_count_all=("payment_date", "size"),
        total_revenue_all=("amount", "sum"),
        avg_transaction_value=("amount", "mean"),
    ).reset_index()
    features["days_since_last_payment"] = (cutoff - features["last_payment_date"]).dt.days

    recent = history[history["payment_date"] >= cutoff - pd.Timedelta(days=180)]
    recent_grouped = recent.groupby("acc_id", dropna=True)
    features = features.merge(
        recent_grouped.agg(
            payment_count_180d=("payment_date", "size"),
            total_revenue_180d=("amount", "sum"),
        ).reset_index(),
        on="acc_id",
        how="left",
    )

    intervals = _payment_interval_features(history)
    features = features.merge(intervals, on="acc_id", how="left")
    features["payment_overdue_ratio"] = _nullable_ratio(
        features["days_since_last_payment"],
        features["payment_interval_mean_days"],
    )

    return features[
        [
            "acc_id",
            "days_since_last_payment",
            "payment_count_all",
            "payment_count_180d",
            "total_revenue_all",
            "total_revenue_180d",
            "avg_transaction_value",
            "payment_interval_mean_days",
            "payment_overdue_ratio",
        ]
    ]


def build_usage_features(usage: pd.DataFrame, cutoff_date: pd.Timestamp) -> pd.DataFrame:
    """Build usage volume, trend, and consistency features using period < cutoff."""

    cutoff = _timestamp(cutoff_date)
    history = _usage_history(usage, cutoff)
    if history.empty:
        return _empty_feature_frame(
            [
                "days_since_last_usage",
                "usage_total_180d",
                "usage_recent_90d",
                "usage_prev_90d",
                "usage_change_90d_pct",
                "usage_decay_ratio",
                "usage_slope_6m",
                "usage_active_months_180d",
                "usage_consistency_ratio",
            ]
        )

    positive_history = history[history["usage"] > 0]
    last_usage = positive_history.groupby("acc_id", dropna=True)["period"].max()
    rows = pd.DataFrame({"acc_id": sorted(history["acc_id"].dropna().unique())})
    rows["days_since_last_usage"] = rows["acc_id"].map((cutoff - last_usage).dt.days)

    recent_180 = history[history["period"] >= cutoff - pd.Timedelta(days=180)]
    recent_90 = history[history["period"] >= cutoff - pd.Timedelta(days=90)]
    prev_90 = history[
        (history["period"] >= cutoff - pd.Timedelta(days=180))
        & (history["period"] < cutoff - pd.Timedelta(days=90))
    ]

    rows["usage_total_180d"] = rows["acc_id"].map(recent_180.groupby("acc_id")["usage"].sum())
    rows["usage_recent_90d"] = rows["acc_id"].map(recent_90.groupby("acc_id")["usage"].sum())
    rows["usage_prev_90d"] = rows["acc_id"].map(prev_90.groupby("acc_id")["usage"].sum())
    # Signed log1p compression: these ratios explode when the prior-90d usage is
    # tiny (a customer ramping from ~0 yields values in the tens of thousands),
    # which dominates a linear model and falsely flags fast-growing customers as
    # high churn. log1p tames the tail with no dataset-dependent cap (parameter
    # free, scale-robust) and preserves ordering. Validated: OOF AUC unchanged.
    rows["usage_change_90d_pct"] = _signed_log1p(
        _safe_pct_change(rows["usage_recent_90d"], rows["usage_prev_90d"])
    )
    rows["usage_decay_ratio"] = _signed_log1p(
        _activity_ratio(rows["usage_recent_90d"], rows["usage_prev_90d"])
    )
    rows["usage_active_months_180d"] = rows["acc_id"].map(
        recent_180[recent_180["usage"] > 0].groupby("acc_id")["period"].nunique()
    )
    rows["usage_consistency_ratio"] = rows["usage_active_months_180d"] / 6.0
    rows["usage_slope_6m"] = rows["acc_id"].map(_usage_slope_6m(history, cutoff))

    return rows[
        [
            "acc_id",
            "days_since_last_usage",
            "usage_total_180d",
            "usage_recent_90d",
            "usage_prev_90d",
            "usage_change_90d_pct",
            "usage_decay_ratio",
            "usage_slope_6m",
            "usage_active_months_180d",
            "usage_consistency_ratio",
        ]
    ]


def build_channel_features(usage: pd.DataFrame, cutoff_date: pd.Timestamp) -> pd.DataFrame:
    """Build SMS/email usage share features from pre-cutoff usage."""

    history = _usage_history(usage, _timestamp(cutoff_date))
    return _share_features(
        history,
        category_column="channel",
        categories=["sms", "email"],
        feature_suffix="usage_share",
    )


def build_source_features(usage: pd.DataFrame, cutoff_date: pd.Timestamp) -> pd.DataFrame:
    """Build broadcast/API/OTP usage share features from pre-cutoff usage."""

    history = _usage_history(usage, _timestamp(cutoff_date))
    return _share_features(
        history,
        category_column="usage_source",
        categories=["bc", "api", "otp"],
        feature_suffix="usage_share",
    )


def build_credit_features(
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
) -> pd.DataFrame:
    """Build point-in-time credit balance/runway features.

    The snapshot columns on customers (credit_sms/credit_email/expire_*)
    reflect the export date, not the cutoff, so the balance is reconstructed
    from pre-cutoff top-ups minus pre-cutoff usage instead.
    """

    cutoff = _timestamp(cutoff_date)
    payment_history = _payment_history(payments, cutoff)
    usage_history = _usage_history(usage, cutoff)

    acc_ids = sorted(
        set(payment_history["acc_id"].dropna().astype(int))
        | set(usage_history["acc_id"].dropna().astype(int))
    )
    if not acc_ids:
        return _empty_feature_frame(
            ["credit_added_180d", "credit_balance_proxy", "credit_runway_months", "credit_usage_decel"]
        )

    credit_add = pd.to_numeric(payment_history["credit_add"], errors="coerce").fillna(0.0)
    payment_history = payment_history.assign(credit_add_clean=credit_add)
    recent_topups = payment_history[
        payment_history["payment_date"] >= cutoff - pd.Timedelta(days=180)
    ]
    recent_usage_90 = usage_history[usage_history["period"] >= cutoff - pd.Timedelta(days=90)]
    prev_usage_90 = usage_history[
        (usage_history["period"] >= cutoff - pd.Timedelta(days=180))
        & (usage_history["period"] < cutoff - pd.Timedelta(days=90))
    ]

    rows = pd.DataFrame({"acc_id": acc_ids})
    rows["credit_added_180d"] = (
        rows["acc_id"].map(recent_topups.groupby("acc_id")["credit_add_clean"].sum()).fillna(0.0)
    )
    added_all = rows["acc_id"].map(
        payment_history.groupby("acc_id")["credit_add_clean"].sum()
    ).fillna(0.0)
    used_all = rows["acc_id"].map(usage_history.groupby("acc_id")["usage"].sum()).fillna(0.0)
    rows["credit_balance_proxy"] = added_all - used_all

    monthly_usage = (
        rows["acc_id"].map(recent_usage_90.groupby("acc_id")["usage"].sum()).fillna(0.0) / 3.0
    )
    runway = np.where(
        monthly_usage > 0,
        rows["credit_balance_proxy"] / monthly_usage,
        np.where(rows["credit_balance_proxy"] > 0, 24.0, 0.0),
    )
    rows["credit_runway_months"] = np.clip(runway, 0.0, 24.0)

    # Second-order usage trend: signed log1p of the monthly-rate change between the
    # two 90d windows. Captures acceleration/deceleration not visible in the first-
    # order usage_change_90d_pct feature (which lives in the base feature set).
    recent_mo = rows["acc_id"].map(
        recent_usage_90.groupby("acc_id")["usage"].sum()
    ).fillna(0.0) / 3.0
    prev_mo = rows["acc_id"].map(
        prev_usage_90.groupby("acc_id")["usage"].sum()
    ).fillna(0.0) / 3.0
    rows["credit_usage_decel"] = _signed_log1p((recent_mo - prev_mo) / (prev_mo + EPSILON))

    return rows[["acc_id", "credit_added_180d", "credit_balance_proxy", "credit_runway_months", "credit_usage_decel"]]


def build_activity_features(
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
) -> pd.DataFrame:
    """Build cross-source activity recency using payment and positive usage events."""

    cutoff = _timestamp(cutoff_date)
    payment_activity = _payment_history(payments, cutoff)[["acc_id", "payment_date"]].rename(
        columns={"payment_date": "activity_date"}
    )
    usage_activity = _usage_history(usage, cutoff)
    usage_activity = usage_activity.loc[usage_activity["usage"] > 0, ["acc_id", "period"]].rename(
        columns={"period": "activity_date"}
    )
    activity = pd.concat([payment_activity, usage_activity], ignore_index=True).dropna(
        subset=["acc_id", "activity_date"]
    )
    if activity.empty:
        return _empty_feature_frame(["days_since_last_activity"])

    last_activity = activity.groupby("acc_id", dropna=True)["activity_date"].max()
    rows = pd.DataFrame({"acc_id": sorted(activity["acc_id"].dropna().unique())})
    rows["days_since_last_activity"] = rows["acc_id"].map((cutoff - last_activity).dt.days)
    return rows[["acc_id", "days_since_last_activity"]]


def build_interaction_features(feature_df: pd.DataFrame) -> pd.DataFrame:
    """Reserved hook for deterministic interaction features.

    Task 4.1 keeps the minimum Tier A baseline compact, so no extra interaction
    columns are added yet.
    """

    return feature_df.copy()


def build_all_features(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
) -> FeatureBuildResult:
    """Build the first deterministic Tier A feature set for every customer."""

    cutoff = _timestamp(cutoff_date)
    feature_df = _build_feature_df(customers, payments, usage, cutoff)
    lifecycle_df = build_lifecycle_outputs(customers, payments, usage, cutoff)
    eligibility_df = lifecycle_df[
        ["acc_id", "eligible_for_churn", "eligible_for_clv", "eligible_for_credit"]
    ].copy()

    return FeatureBuildResult(
        feature_df=feature_df.reset_index(drop=True),
        feature_names=list(CREDIT_TIER_A_FEATURES),
        feature_schema=build_feature_schema(feature_df, CREDIT_TIER_A_FEATURES),
        feature_stats=build_feature_stats(
            feature_df,
            CREDIT_TIER_A_FEATURES,
            cutoff,
            payments,
            usage,
        ),
        eligibility_df=eligibility_df,
        lifecycle_df=lifecycle_df,
    )


def _build_feature_df(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
) -> pd.DataFrame:
    cutoff = _timestamp(cutoff_date)
    feature_df = _base_customer_frame(customers, payments, usage, cutoff)
    for part in [
        build_profile_features(customers, cutoff),
        build_payment_features(payments, cutoff),
        build_usage_features(usage, cutoff),
        build_channel_features(usage, cutoff),
        build_source_features(usage, cutoff),
        build_activity_features(payments, usage, cutoff),
        build_credit_features(payments, usage, cutoff),
    ]:
        feature_df = feature_df.merge(part, on="acc_id", how="left")

    feature_df = build_interaction_features(feature_df)
    feature_df = _ensure_feature_columns(feature_df, CREDIT_TIER_A_FEATURES)
    feature_df = feature_df[["acc_id", *CREDIT_TIER_A_FEATURES]].sort_values("acc_id")
    feature_df = _apply_feature_defaults(feature_df)
    return feature_df.reset_index(drop=True)


def build_eligibility(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
    active_window_days: int = 180,
) -> pd.DataFrame:
    """Build model eligibility flags without removing customer output rows."""

    lifecycle = build_lifecycle_outputs(
        customers,
        payments,
        usage,
        cutoff_date,
        active_window_days=active_window_days,
    )
    return lifecycle[["acc_id", "eligible_for_churn", "eligible_for_clv", "eligible_for_credit"]]


def build_lifecycle_outputs(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
    active_window_days: int = 180,
) -> pd.DataFrame:
    """Assign observed lifecycle/state fields from pre-cutoff activity.

    Lifecycle is not a model prediction. It is a rule-based state that decides
    which predictive models are eligible for each customer.
    """

    cutoff = _timestamp(cutoff_date)
    active_start = cutoff - pd.Timedelta(days=active_window_days)
    customer_ids = _known_account_ids(customers, payments, usage, cutoff)
    payment_history = _payment_history(payments, cutoff)
    usage_history = _usage_history(usage, cutoff)
    activity = pd.concat(
        [
            payment_history[["acc_id", "payment_date"]].rename(columns={"payment_date": "date"}),
            usage_history.loc[usage_history["usage"] > 0, ["acc_id", "period"]].rename(
                columns={"period": "date"}
            ),
        ],
        ignore_index=True,
    ).dropna(subset=["acc_id", "date"])

    active_ids = set(
        activity.loc[
            (activity["date"] >= active_start) & (activity["date"] < cutoff),
            "acc_id",
        ]
        .dropna()
        .astype(int)
    )
    ever_paid_ids = set(payment_history["acc_id"].dropna().astype(int))
    has_history_ids = set(activity["acc_id"].dropna().astype(int))
    last_activity = activity.groupby("acc_id", dropna=True)["date"].max()

    rows = pd.DataFrame({"acc_id": sorted(customer_ids)})
    rows["ever_paid"] = rows["acc_id"].isin(ever_paid_ids)
    rows["has_activity_history"] = rows["acc_id"].isin(has_history_ids)
    rows["active_in_window"] = rows["acc_id"].isin(active_ids)
    rows["days_since_last_activity"] = rows["acc_id"].map((cutoff - last_activity).dt.days)
    rows["lifecycle_stage"] = rows.apply(_lifecycle_stage, axis=1)
    rows["sub_stage"] = rows.apply(_lifecycle_sub_stage, axis=1)
    rows["eligible_for_churn"] = rows["active_in_window"] & rows["ever_paid"]
    rows["eligible_for_clv"] = rows["active_in_window"]
    rows["eligible_for_credit"] = rows["has_activity_history"]
    rows["model_eligibility_json"] = rows.apply(_model_eligibility, axis=1)
    rows["output_status"] = rows["model_eligibility_json"].map(
        lambda eligibility: "predicted"
        if all(model["eligible"] for model in eligibility.values())
        else "partial"
    )
    rows["output_notes"] = rows["model_eligibility_json"].map(
        lambda eligibility: "; ".join(
            f"{model_type}: {model['reason']}"
            for model_type, model in eligibility.items()
            if not model["eligible"]
        )
        or None
    )
    return rows


def build_feature_schema(feature_df: pd.DataFrame, feature_names: list[str]) -> FeatureSchema:
    return {
        feature_name: {
            **FEATURE_METADATA[feature_name],
            "dtype": str(feature_df[feature_name].dtype),
            "nullable": feature_name in NULLABLE_CONTRACT_FEATURES,
            "observed_nullable": bool(feature_df[feature_name].isna().any()),
            "default": 0.0 if feature_name in ZERO_DEFAULT_FEATURES else None,
            "tier": "A",
        }
        for feature_name in feature_names
    }


def build_feature_stats(
    feature_df: pd.DataFrame,
    feature_names: list[str],
    cutoff_date: pd.Timestamp,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
) -> dict[str, Any]:
    numeric = feature_df[feature_names].apply(pd.to_numeric, errors="coerce")
    return {
        "row_count": int(len(feature_df)),
        "feature_count": len(feature_names),
        "feature_names": list(feature_names),
        "cutoff_date": _timestamp(cutoff_date).date().isoformat(),
        "missing_rate": {
            column: _float(numeric[column].isna().mean()) for column in feature_names
        },
        "zero_rate": {
            column: _float((numeric[column] == 0).mean()) for column in feature_names
        },
        "numeric": {
            column: _numeric_feature_stats(numeric[column]) for column in feature_names
        },
        "pit": _pit_stats(payments, usage, _timestamp(cutoff_date)),
    }


def _base_customer_frame(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff: pd.Timestamp,
) -> pd.DataFrame:
    return pd.DataFrame(
        {"acc_id": sorted(_known_account_ids(customers, payments, usage, cutoff))}
    )


def _known_account_ids(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff: pd.Timestamp,
) -> set[int]:
    """Account spine: the customer sheet plus any account with pre-cutoff
    activity. Uploaded profile sheets are not guaranteed to cover every
    account that pays or sends — activity-only (orphan) accounts still carry
    full Tier A signal and must not be dropped from features or labels."""

    payment_history = _payment_history(payments, cutoff)
    usage_history = _usage_history(usage, cutoff)
    active_usage = usage_history[usage_history["usage"] > 0]
    return (
        _customer_ids(customers)
        | set(payment_history["acc_id"].dropna().astype(int).tolist())
        | set(active_usage["acc_id"].dropna().astype(int).tolist())
    )


def _hash_payload(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _payment_history(payments: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    history = payments[
        payments["acc_id"].notna()
        & payments["payment_date"].notna()
        & (payments["payment_date"] < cutoff)
    ].copy()
    history["amount"] = pd.to_numeric(history["amount"], errors="coerce")
    return history


def _usage_history(usage: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    history = usage[
        usage["acc_id"].notna()
        & usage["period"].notna()
        & (usage["period"] < cutoff)
    ].copy()
    history["usage"] = pd.to_numeric(history["usage"], errors="coerce").fillna(0.0)
    return history


def _payment_interval_features(history: pd.DataFrame) -> pd.DataFrame:
    sorted_history = history.sort_values(["acc_id", "payment_date"])
    sorted_history["interval_days"] = (
        sorted_history.groupby("acc_id")["payment_date"].diff().dt.days
    )
    intervals = sorted_history.dropna(subset=["interval_days"])
    if intervals.empty:
        return _empty_feature_frame(["payment_interval_mean_days"])
    return intervals.groupby("acc_id", dropna=True).agg(
        payment_interval_mean_days=("interval_days", "mean")
    ).reset_index()


def _usage_slope_6m(history: pd.DataFrame, cutoff: pd.Timestamp) -> pd.Series:
    window_start = (cutoff.to_period("M") - 6).to_timestamp()
    months = pd.period_range(start=window_start, periods=6, freq="M").to_timestamp()
    recent = history[(history["period"] >= months.min()) & (history["period"] < cutoff)]
    monthly = (
        recent.groupby(["acc_id", "period"], dropna=True)["usage"]
        .sum()
        .reset_index()
    )

    slopes: dict[int, float] = {}
    x_values = pd.Series(range(len(months)), dtype="float64")
    x_mean = float(x_values.mean())
    denominator = float(((x_values - x_mean) ** 2).sum())
    for acc_id, group in monthly.groupby("acc_id", dropna=True):
        y_values = group.set_index("period")["usage"].reindex(months, fill_value=0.0)
        y_values = pd.to_numeric(y_values, errors="coerce").fillna(0.0).astype("float64")
        y_mean = float(y_values.mean())
        slopes[int(acc_id)] = _float(
            ((x_values - x_mean) * (y_values.reset_index(drop=True) - y_mean)).sum()
            / denominator
        )
    return pd.Series(slopes)


def _share_features(
    history: pd.DataFrame,
    *,
    category_column: str,
    categories: list[str],
    feature_suffix: str,
) -> pd.DataFrame:
    columns = [f"{category}_{feature_suffix}" for category in categories]
    if history.empty:
        return _empty_feature_frame(columns)

    totals = history.groupby("acc_id", dropna=True)["usage"].sum()
    rows = pd.DataFrame({"acc_id": sorted(history["acc_id"].dropna().unique())})
    for category in categories:
        category_usage = history.loc[
            history[category_column] == category
        ].groupby("acc_id", dropna=True)["usage"].sum()
        rows[f"{category}_{feature_suffix}"] = _safe_ratio(
            rows["acc_id"].map(category_usage),
            rows["acc_id"].map(totals),
        )
    return rows[["acc_id", *columns]]


def _ensure_feature_columns(feature_df: pd.DataFrame, feature_names: list[str]) -> pd.DataFrame:
    feature_df = feature_df.copy()
    for feature_name in feature_names:
        if feature_name not in feature_df.columns:
            feature_df[feature_name] = pd.NA
    return feature_df


def _apply_feature_defaults(feature_df: pd.DataFrame) -> pd.DataFrame:
    feature_df = feature_df.copy()
    for feature_name in ZERO_DEFAULT_FEATURES:
        if feature_name in feature_df.columns:
            feature_df[feature_name] = feature_df[feature_name].fillna(0.0)
    return feature_df


def _signed_log1p(series: pd.Series) -> pd.Series:
    """Compress a heavy-tailed ratio while keeping sign and order: sign·log1p|x|."""
    values = pd.to_numeric(series, errors="coerce").fillna(0.0)
    return np.sign(values) * np.log1p(values.abs())


def _safe_pct_change(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    numerator = pd.to_numeric(numerator, errors="coerce").fillna(0.0)
    denominator = pd.to_numeric(denominator, errors="coerce").fillna(0.0)
    ratio = (numerator - denominator) / denominator.abs().clip(lower=EPSILON)
    new_activity_flag = (numerator > 0).astype("float64")
    return ratio.where(denominator.abs() > 0, new_activity_flag)


def _activity_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    numerator = pd.to_numeric(numerator, errors="coerce").fillna(0.0)
    denominator = pd.to_numeric(denominator, errors="coerce").fillna(0.0)
    ratio = numerator / denominator.abs().clip(lower=EPSILON)
    new_activity_flag = (numerator > 0).astype("float64")
    return ratio.where(denominator.abs() > 0, new_activity_flag)


def _safe_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    numerator = pd.to_numeric(numerator, errors="coerce").fillna(0.0)
    denominator = pd.to_numeric(denominator, errors="coerce").fillna(0.0)
    ratio = numerator / denominator.abs().clip(lower=EPSILON)
    return ratio.where(denominator.abs() > 0, 0.0)


def _nullable_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    numerator = pd.to_numeric(numerator, errors="coerce")
    denominator = pd.to_numeric(denominator, errors="coerce")
    ratio = numerator / denominator.abs().clip(lower=EPSILON)
    return ratio.where(denominator.notna() & (denominator.abs() > 0))


def _numeric_feature_stats(series: pd.Series) -> dict[str, float | None]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return {
            "min": None,
            "max": None,
            "mean": None,
            "std": None,
            "p01": None,
            "p05": None,
            "p25": None,
            "p50": None,
            "p75": None,
            "p95": None,
            "p99": None,
        }
    return {
        "min": _float(clean.min()),
        "max": _float(clean.max()),
        "mean": _float(clean.mean()),
        "std": _float(clean.std(ddof=0)),
        "p01": _float(clean.quantile(0.01)),
        "p05": _float(clean.quantile(0.05)),
        "p25": _float(clean.quantile(0.25)),
        "p50": _float(clean.quantile(0.50)),
        "p75": _float(clean.quantile(0.75)),
        "p95": _float(clean.quantile(0.95)),
        "p99": _float(clean.quantile(0.99)),
    }


def _pit_stats(
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff: pd.Timestamp,
) -> dict[str, Any]:
    payment_history = _payment_history(payments, cutoff)
    usage_history = _usage_history(usage, cutoff)
    max_payment_date = payment_history["payment_date"].max() if not payment_history.empty else None
    max_usage_period = usage_history["period"].max() if not usage_history.empty else None
    return {
        "max_feature_payment_date": _date_string(max_payment_date),
        "max_feature_usage_period": _date_string(max_usage_period),
        "payment_rows_after_cutoff_excluded": int(
            (payments["payment_date"] >= cutoff).sum()
        ) if "payment_date" in payments else 0,
        "usage_rows_after_cutoff_excluded": int(
            (usage["period"] >= cutoff).sum()
        ) if "period" in usage else 0,
    }


def _empty_feature_frame(feature_names: list[str]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "acc_id": pd.Series(dtype="Int64"),
            **{name: pd.Series(dtype="float64") for name in feature_names},
        }
    )


def _customer_ids(customers: pd.DataFrame) -> set[int]:
    return set(customers["acc_id"].dropna().astype(int).tolist())


def _lifecycle_stage(row: pd.Series) -> str:
    if not row["has_activity_history"]:
        return "Ghost"
    if not row["active_in_window"]:
        return "Churned"
    if row["ever_paid"]:
        return "Active Paid"
    return "Active Free"


def _lifecycle_sub_stage(row: pd.Series) -> str:
    stage = row["lifecycle_stage"]
    if stage == "Ghost":
        return "Ghost"
    if stage == "Churned":
        return "Churned Paid" if row["ever_paid"] else "Churned Free"
    if stage == "Active Free":
        return "Active Free"
    return "Active Paid"


def _model_eligibility(row: pd.Series) -> dict[str, dict[str, Any]]:
    return {
        "churn": {
            "eligible": bool(row["eligible_for_churn"]),
            "status": "eligible" if row["eligible_for_churn"] else "not_eligible",
            "reason": (
                "Active paid customer."
                if row["eligible_for_churn"]
                else "Requires active customer with payment history."
            ),
        },
        "clv": {
            "eligible": bool(row["eligible_for_clv"]),
            "status": "eligible" if row["eligible_for_clv"] else "fallback",
            "reason": (
                "Active customer."
                if row["eligible_for_clv"]
                else "Requires activity in the active window."
            ),
        },
        "credit": {
            "eligible": bool(row["eligible_for_credit"]),
            "status": "eligible" if row["eligible_for_credit"] else "insufficient_data",
            "reason": (
                "Has payment or usage history."
                if row["eligible_for_credit"]
                else "Requires payment or usage history."
            ),
        },
    }


def _timestamp(value: pd.Timestamp) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    return timestamp.tz_localize(None) if timestamp.tzinfo else timestamp


def _date_string(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value).date().isoformat()


def _float(value: Any) -> float:
    return float(value)
