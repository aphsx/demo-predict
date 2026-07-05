"""Validation reports for the rebuilt ML training/prediction pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from src.training.data import (
    PREDICT_TABLES,
    TRAIN_TABLES,
    CleanDataset,
    CleanTableSet,
    SourceKind,
    database_url,
    load_clean_dataset,
)
from src.training.features import CREDIT_TIER_A_FEATURES, build_all_features
from src.training.labels import LabelConfig, build_label_set


CheckSeverity = Literal["blocker", "warning", "info"]
ReportStatus = Literal["passed", "warning", "failed"]

CUSTOMER_REQUIRED_COLUMNS = [
    "acc_id",
    "status_sms",
    "credit_sms",
    "credit_email",
    "expire_sms",
    "expire_email",
    "status_email",
    "join_date",
    "last_access",
    "last_send",
]
PAYMENT_REQUIRED_COLUMNS = ["acc_id", "payment_date", "amount", "credit_add", "credit_type"]
USAGE_REQUIRED_COLUMNS = ["acc_id", "year", "month", "usage", "channel", "usage_source"]
CUSTOMER_DB_REQUIRED_COLUMNS = ["source_id", *CUSTOMER_REQUIRED_COLUMNS]
PAYMENT_DB_REQUIRED_COLUMNS = ["source_id", *PAYMENT_REQUIRED_COLUMNS]
USAGE_DB_REQUIRED_COLUMNS = ["source_id", *USAGE_REQUIRED_COLUMNS]

ALLOWED_STATUS_VALUES = {"paid", "free", "active", "inactive", "trial", "suspended", ""}
ALLOWED_CREDIT_TYPES = {"sms", "email", ""}
ALLOWED_CHANNELS = {"sms", "email"}
ALLOWED_USAGE_SOURCES = {"bc", "api", "otp"}

INVALID_DATE_RATE_THRESHOLD = 0.005
ORPHAN_ACTIVITY_RATE_WARNING_THRESHOLD = 0.01
HIGH_NULL_RATE_WARNING_THRESHOLD = 0.50
CHURN_ELIGIBLE_MIN = 500
CHURN_POSITIVE_MIN = 100
CHURN_NEGATIVE_MIN = 100
CHURN_POSITIVE_RATE_MIN = 0.05
CHURN_POSITIVE_RATE_MAX = 0.80
CLV_ELIGIBLE_MIN = 500
CLV_NONZERO_MIN = 100
CREDIT_USAGE_NONZERO_MIN = 500
TOPUP_OBSERVED_MIN = 500
CLV_TOP_1_SHARE_WARNING_MAX = 0.50
TOPUP_CENSORING_WARNING_MAX = 0.90
# TRAINING-PIPELINE §3: ≥365d history is recommended so 180d/6m features have
# real depth; the hard blocker stays at the 180d active window (Gate 3).
MIN_HISTORY_DAYS_WARNING = 365


@dataclass(frozen=True)
class ValidationCheck:
    name: str
    severity: CheckSeverity
    passed: bool
    message: str
    details: dict[str, Any] | None = None


@dataclass(frozen=True)
class ValidationReport:
    source_id: str
    source_kind: SourceKind
    validation_type: Literal[
        "profile", "schema", "label_viability", "leakage", "drift", "realized_outcome"
    ]
    status: ReportStatus
    row_count: int
    stats: dict[str, Any]
    anomalies: list[dict[str, Any]]
    checks: list[ValidationCheck]
    drift: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_validation_report_row(self) -> dict[str, Any]:
        """Shape this report for a later `ml_data_validation_reports` insert."""

        return {
            "source_id": self.source_id,
            "source_kind": self.source_kind,
            "validation_type": self.validation_type,
            "status": self.status,
            "row_count": self.row_count,
            "stats_json": self.stats,
            "anomalies_json": self.anomalies,
            "drift_json": self.drift,
        }


def check_train_source_readiness(source_id: str) -> ValidationReport:
    """Gate 1 readiness checks for a train source."""

    return _check_source_readiness(source_id=source_id, tables=TRAIN_TABLES)


def check_predict_source_readiness(source_id: str) -> ValidationReport:
    """Gate 1 readiness checks for a predict source."""

    return _check_source_readiness(source_id=source_id, tables=PREDICT_TABLES)


def check_train_schema_quality(source_id: str) -> ValidationReport:
    """Gate 2 schema/data quality checks for a train source."""

    return _check_schema_quality(source_id=source_id, tables=TRAIN_TABLES)


def check_predict_schema_quality(source_id: str) -> ValidationReport:
    """Gate 2 schema/data quality checks for a predict source."""

    return _check_schema_quality(source_id=source_id, tables=PREDICT_TABLES)


def check_train_feature_leakage(
    source_id: str,
    cutoff_date: pd.Timestamp,
) -> ValidationReport:
    """Gate 5 PIT/leakage checks for train features."""

    return _check_feature_leakage(source_id=source_id, tables=TRAIN_TABLES, cutoff_date=cutoff_date)


def check_predict_feature_leakage(
    source_id: str,
    cutoff_date: pd.Timestamp,
) -> ValidationReport:
    """Gate 5 PIT/leakage checks for predict features."""

    return _check_feature_leakage(source_id=source_id, tables=PREDICT_TABLES, cutoff_date=cutoff_date)


def check_train_cutoff_feasibility(
    source_id: str,
    config: LabelConfig,
) -> ValidationReport:
    """Gate 3 cutoff/horizon feasibility checks for a train source."""

    dataset = load_clean_dataset(source_id=source_id, tables=TRAIN_TABLES)
    checks = _cutoff_feasibility_checks(dataset, config)

    return ValidationReport(
        source_id=source_id,
        source_kind="train",
        validation_type="profile",
        status=_report_status(checks),
        row_count=len(dataset.customers),
        stats=_cutoff_feasibility_stats(dataset, config),
        anomalies=_anomalies_from_checks(checks),
        checks=checks,
    )


def check_train_label_viability(
    source_id: str,
    config: LabelConfig,
) -> ValidationReport:
    """Gate 4 label viability checks for train labels."""

    dataset = load_clean_dataset(source_id=source_id, tables=TRAIN_TABLES)
    label_set = build_label_set(
        dataset.customers,
        dataset.payments,
        dataset.usage,
        config,
    )
    checks = _label_viability_checks(label_set)

    return ValidationReport(
        source_id=source_id,
        source_kind="train",
        validation_type="label_viability",
        status=_report_status(checks),
        row_count=len(dataset.customers),
        stats=_label_viability_stats(label_set),
        anomalies=_anomalies_from_checks(checks),
        checks=checks,
    )


def _check_source_readiness(source_id: str, tables: CleanTableSet) -> ValidationReport:
    with create_engine(database_url()).connect() as conn:
        table_checks = _readiness_table_checks(conn, tables)
        source = (
            _load_source(conn, tables.source_table, source_id)
            if _table_exists(conn, tables.source_table)
            else None
        )
        row_counts = (
            _load_clean_row_counts(conn, tables, source_id)
            if _clean_tables_exist(conn, tables)
            else {"customers": 0, "payments": 0, "usage": 0}
        )

    checks = table_checks + _common_readiness_checks(
        source=source,
        row_counts=row_counts,
        source_id=source_id,
        source_table=tables.source_table,
    )
    if tables.source_kind == "train":
        checks.extend(_train_readiness_checks(row_counts))
    else:
        checks.extend(_predict_readiness_checks(row_counts))

    return ValidationReport(
        source_id=source_id,
        source_kind=tables.source_kind,
        validation_type="profile",
        status=_report_status(checks),
        row_count=row_counts["customers"],
        stats={"row_counts": row_counts},
        anomalies=_anomalies_from_checks(checks),
        checks=checks,
    )


def _check_schema_quality(source_id: str, tables: CleanTableSet) -> ValidationReport:
    with create_engine(database_url()).connect() as conn:
        structure_checks = _schema_structure_checks(conn, tables)

    if any(check.severity == "blocker" and not check.passed for check in structure_checks):
        return ValidationReport(
            source_id=source_id,
            source_kind=tables.source_kind,
            validation_type="schema",
            status="failed",
            row_count=0,
            stats={"table_structure": _table_structure_stats(structure_checks)},
            anomalies=_anomalies_from_checks(structure_checks),
            checks=structure_checks,
        )

    dataset = load_clean_dataset(source_id=source_id, tables=tables)
    checks = structure_checks + _schema_quality_checks(dataset)

    return ValidationReport(
        source_id=source_id,
        source_kind=tables.source_kind,
        validation_type="schema",
        status=_report_status(checks),
        row_count=len(dataset.customers),
        stats=_schema_quality_stats(dataset),
        anomalies=_anomalies_from_checks(checks),
        checks=checks,
    )


def _check_feature_leakage(
    source_id: str,
    tables: CleanTableSet,
    cutoff_date: pd.Timestamp,
) -> ValidationReport:
    dataset = load_clean_dataset(source_id=source_id, tables=tables)
    feature_result = build_all_features(
        dataset.customers,
        dataset.payments,
        dataset.usage,
        cutoff_date,
    )
    checks = _feature_leakage_checks(
        feature_result.feature_stats,
        feature_result.feature_names,
        cutoff_date,
    )

    return ValidationReport(
        source_id=source_id,
        source_kind=tables.source_kind,
        validation_type="leakage",
        status=_report_status(checks),
        row_count=len(feature_result.feature_df),
        stats={
            "gate": "point_in_time_leakage",
            "cutoff_date": _timestamp(pd.Timestamp(cutoff_date)).date().isoformat(),
            "feature_count": len(feature_result.feature_names),
            "feature_names": feature_result.feature_names,
            "pit": feature_result.feature_stats["pit"],
        },
        anomalies=_anomalies_from_checks(checks),
        checks=checks,
    )


def _schema_quality_checks(dataset: CleanDataset) -> list[ValidationCheck]:
    customers = dataset.customers
    payments = dataset.payments
    usage = dataset.usage

    checks: list[ValidationCheck] = []
    checks.extend(_required_column_checks("customers", customers, CUSTOMER_REQUIRED_COLUMNS))
    checks.extend(_required_column_checks("payments", payments, PAYMENT_REQUIRED_COLUMNS))
    checks.extend(_required_column_checks("usage", usage, USAGE_REQUIRED_COLUMNS))

    if checks and any(not check.passed and check.severity == "blocker" for check in checks):
        return checks

    checks.extend(
        [
            _invalid_required_value_check("customers_acc_id_valid", customers["acc_id"]),
            _invalid_required_value_check("payments_acc_id_valid", payments["acc_id"]),
            _invalid_required_value_check("usage_acc_id_valid", usage["acc_id"]),
            _invalid_date_rate_check("payment_date_valid", payments["payment_date"]),
            _invalid_date_rate_check("usage_period_valid", usage["period"]),
            _non_negative_check("usage_non_negative", usage["usage"], severity="blocker"),
            _non_negative_check("payment_amount_non_negative", payments["amount"], severity="warning"),
            _non_negative_check("payment_credit_add_non_negative", payments["credit_add"], severity="warning"),
        ]
    )

    checks.extend(
        [
            _allowed_values_check("status_sms_values", customers["status_sms"], ALLOWED_STATUS_VALUES),
            _allowed_values_check("status_email_values", customers["status_email"], ALLOWED_STATUS_VALUES),
            _allowed_values_check("credit_type_values", payments["credit_type"], ALLOWED_CREDIT_TYPES),
            _allowed_values_check("channel_values", usage["channel"], ALLOWED_CHANNELS),
            _allowed_values_check("usage_source_values", usage["usage_source"], ALLOWED_USAGE_SOURCES),
            _duplicate_customer_check(customers),
            _orphan_activity_check(customers, payments, usage),
            _duplicate_usage_source_check(usage),
        ]
    )

    for column in ("status_sms", "status_email", "credit_sms", "credit_email", "expire_sms", "expire_email", "join_date", "last_access", "last_send"):
        checks.append(_high_null_rate_check("customers", customers, column))

    return checks


def _schema_quality_stats(dataset: CleanDataset) -> dict[str, Any]:
    customers = dataset.customers
    payments = dataset.payments
    usage = dataset.usage

    return {
        "row_counts": {
            "customers": int(len(customers)),
            "payments": int(len(payments)),
            "usage": int(len(usage)),
        },
        "distinct_acc_id": {
            "customers": int(customers["acc_id"].nunique(dropna=True)),
            "payments": int(payments["acc_id"].nunique(dropna=True)),
            "usage": int(usage["acc_id"].nunique(dropna=True)),
        },
        "invalid_rates": {
            "customers_acc_id": _null_rate(customers["acc_id"]),
            "payments_acc_id": _null_rate(payments["acc_id"]),
            "usage_acc_id": _null_rate(usage["acc_id"]),
            "payment_date": _null_rate(payments["payment_date"]),
            "usage_period": _null_rate(usage["period"]),
        },
        "negative_counts": {
            "payment_amount": int((payments["amount"] < 0).sum()) if len(payments) else 0,
            "payment_credit_add": int((payments["credit_add"] < 0).sum()) if len(payments) else 0,
            "usage": int((usage["usage"] < 0).sum()) if len(usage) else 0,
        },
        "category_values": {
            "status_sms": _series_values(customers["status_sms"]),
            "status_email": _series_values(customers["status_email"]),
            "credit_type": _series_values(payments["credit_type"]),
            "channel": _series_values(usage["channel"]),
            "usage_source": _series_values(usage["usage_source"]),
        },
    }


def _cutoff_feasibility_checks(
    dataset: CleanDataset,
    config: LabelConfig,
) -> list[ValidationCheck]:
    cutoff = _timestamp(config.cutoff_date)
    active_start = cutoff - pd.Timedelta(days=config.active_window_days)
    horizon_end = cutoff + pd.Timedelta(days=config.horizon_days)
    min_activity, max_activity = _activity_date_range(dataset.payments, dataset.usage)
    has_activity = min_activity is not None and max_activity is not None
    history_days = (cutoff - min_activity).days if min_activity is not None else 0

    return [
        ValidationCheck(
            name="active_window_positive",
            severity="blocker",
            passed=config.active_window_days > 0,
            message=(
                "active_window_days is positive."
                if config.active_window_days > 0
                else "active_window_days must be positive."
            ),
            details={"active_window_days": config.active_window_days},
        ),
        ValidationCheck(
            name="horizon_days_positive",
            severity="blocker",
            passed=config.horizon_days > 0,
            message=(
                "horizon_days is positive."
                if config.horizon_days > 0
                else "horizon_days must be positive."
            ),
            details={"horizon_days": config.horizon_days},
        ),
        ValidationCheck(
            name="activity_exists",
            severity="blocker",
            passed=has_activity,
            message="Activity data exists." if has_activity else "No payment or usage activity found.",
        ),
        ValidationCheck(
            name="history_before_cutoff",
            severity="blocker",
            passed=bool(has_activity and min_activity < active_start),
            message=(
                "Historical activity covers the active lookback window."
                if has_activity and min_activity < active_start
                else "Historical activity does not cover the active lookback window."
            ),
            details={
                "min_activity_date": min_activity.isoformat() if min_activity is not None else None,
                "required_before": active_start.isoformat(),
            },
        ),
        ValidationCheck(
            name="future_label_window",
            severity="blocker",
            passed=bool(has_activity and max_activity >= horizon_end),
            message=(
                "Future activity covers the label horizon."
                if has_activity and max_activity >= horizon_end
                else "Future activity does not cover the label horizon."
            ),
            details={
                "max_activity_date": max_activity.isoformat() if max_activity is not None else None,
                "required_at_or_after": horizon_end.isoformat(),
            },
        ),
        ValidationCheck(
            name="history_depth_warning",
            severity="warning",
            passed=history_days >= MIN_HISTORY_DAYS_WARNING,
            message=(
                "History depth before cutoff is sufficient."
                if history_days >= MIN_HISTORY_DAYS_WARNING
                else "History depth before cutoff is shallow."
            ),
            details={"history_days": history_days, "threshold": MIN_HISTORY_DAYS_WARNING},
        ),
    ]


def _cutoff_feasibility_stats(
    dataset: CleanDataset,
    config: LabelConfig,
) -> dict[str, Any]:
    cutoff = _timestamp(config.cutoff_date)
    horizon_end = cutoff + pd.Timedelta(days=config.horizon_days)
    active_start = cutoff - pd.Timedelta(days=config.active_window_days)
    min_activity, max_activity = _activity_date_range(dataset.payments, dataset.usage)

    return {
        "gate": "cutoff_horizon_feasibility",
        "cutoff_date": cutoff.date().isoformat(),
        "horizon_days": config.horizon_days,
        "active_window_days": config.active_window_days,
        "active_start": active_start.date().isoformat(),
        "horizon_end": horizon_end.date().isoformat(),
        "min_activity_date": min_activity.isoformat() if min_activity is not None else None,
        "max_activity_date": max_activity.isoformat() if max_activity is not None else None,
    }


def _feature_leakage_checks(
    feature_stats: dict[str, Any],
    feature_names: list[str],
    cutoff_date: pd.Timestamp,
) -> list[ValidationCheck]:
    cutoff = _timestamp(cutoff_date)
    pit_stats = feature_stats["pit"]
    max_payment_date = _optional_timestamp(pit_stats["max_feature_payment_date"])
    max_usage_period = _optional_timestamp(pit_stats["max_feature_usage_period"])
    forbidden_snapshot_fields = {
        "last_access",
        "last_send",
        "credit_sms",
        "credit_email",
        "expire_sms",
        "expire_email",
    }
    forbidden_features = sorted(forbidden_snapshot_fields & set(feature_names))

    return [
        ValidationCheck(
            name="feature_payment_dates_pre_cutoff",
            severity="blocker",
            passed=max_payment_date is None or max_payment_date < cutoff,
            message=(
                "Feature payment dates are strictly before cutoff."
                if max_payment_date is None or max_payment_date < cutoff
                else "Feature payment dates include cutoff-or-future rows."
            ),
            details={
                "max_feature_payment_date": pit_stats["max_feature_payment_date"],
                "cutoff_date": cutoff.date().isoformat(),
            },
        ),
        ValidationCheck(
            name="feature_usage_periods_pre_cutoff",
            severity="blocker",
            passed=max_usage_period is None or max_usage_period < cutoff,
            message=(
                "Feature usage periods are strictly before cutoff."
                if max_usage_period is None or max_usage_period < cutoff
                else "Feature usage periods include cutoff-or-future rows."
            ),
            details={
                "max_feature_usage_period": pit_stats["max_feature_usage_period"],
                "cutoff_date": cutoff.date().isoformat(),
            },
        ),
        ValidationCheck(
            # The builder emits the full Tier A superset (base 24 + credit 3);
            # each model then selects its own contract subset downstream.
            name="tier_a_feature_superset_only",
            severity="blocker",
            passed=feature_names == CREDIT_TIER_A_FEATURES,
            message=(
                "Feature names match the Tier A builder contract."
                if feature_names == CREDIT_TIER_A_FEATURES
                else "Feature names differ from the Tier A builder contract."
            ),
            details={
                "expected": CREDIT_TIER_A_FEATURES,
                "actual": feature_names,
            },
        ),
        ValidationCheck(
            name="snapshot_leakage_fields_excluded",
            severity="blocker",
            passed=not forbidden_features,
            message=(
                "Snapshot leakage-prone fields are excluded."
                if not forbidden_features
                else "Snapshot leakage-prone fields are present in feature names."
            ),
            details={"forbidden_features": forbidden_features},
        ),
    ]


def _label_viability_checks(label_set: dict[str, pd.DataFrame]) -> list[ValidationCheck]:
    churn = label_set["churn"]
    clv = label_set["clv"]
    credit_usage = label_set["credit_usage"]
    topup_timing = label_set["topup_timing"]

    churn_positive = int((churn["churn_label"] == 1).sum()) if len(churn) else 0
    churn_negative = int((churn["churn_label"] == 0).sum()) if len(churn) else 0
    churn_rate = _rate(churn_positive, len(churn))

    clv_nonzero = int((clv["future_revenue_6m"] > 0).sum()) if len(clv) else 0
    clv_top_1_share = _top_share(clv["future_revenue_6m"], 0.01)
    credit_30_nonzero = int((credit_usage["future_credit_usage_30d"] > 0).sum())
    credit_90_nonzero = int((credit_usage["future_credit_usage_90d"] > 0).sum())
    topup_observed = int(topup_timing["topup_observed"].sum())
    topup_censoring_rate = 1.0 - _rate(topup_observed, len(topup_timing))

    return [
        _minimum_count_check(
            "churn_eligible_count",
            len(churn),
            CHURN_ELIGIBLE_MIN,
            severity="blocker",
        ),
        _minimum_count_check(
            "churn_positive_count",
            churn_positive,
            CHURN_POSITIVE_MIN,
            severity="blocker",
        ),
        _minimum_count_check(
            "churn_negative_count",
            churn_negative,
            CHURN_NEGATIVE_MIN,
            severity="blocker",
        ),
        ValidationCheck(
            name="churn_positive_rate",
            severity="blocker",
            passed=CHURN_POSITIVE_RATE_MIN <= churn_rate <= CHURN_POSITIVE_RATE_MAX,
            message=(
                "Churn positive rate is within viability range."
                if CHURN_POSITIVE_RATE_MIN <= churn_rate <= CHURN_POSITIVE_RATE_MAX
                else "Churn positive rate is outside viability range."
            ),
            details={
                "positive_rate": churn_rate,
                "min": CHURN_POSITIVE_RATE_MIN,
                "max": CHURN_POSITIVE_RATE_MAX,
            },
        ),
        _minimum_count_check("clv_eligible_count", len(clv), CLV_ELIGIBLE_MIN, "blocker"),
        _minimum_count_check("clv_future_revenue_nonzero", clv_nonzero, CLV_NONZERO_MIN, "blocker"),
        _variance_check("clv_future_revenue_variance", clv["future_revenue_6m"], "blocker"),
        ValidationCheck(
            name="clv_top_1_percent_revenue_share",
            severity="warning",
            passed=clv_top_1_share <= CLV_TOP_1_SHARE_WARNING_MAX,
            message=(
                "CLV top 1% revenue share is within warning threshold."
                if clv_top_1_share <= CLV_TOP_1_SHARE_WARNING_MAX
                else "CLV top 1% revenue share is high."
            ),
            details={
                "top_1_share": clv_top_1_share,
                "threshold": CLV_TOP_1_SHARE_WARNING_MAX,
            },
        ),
        _minimum_count_check(
            "credit_future_usage_30d_nonzero",
            credit_30_nonzero,
            CREDIT_USAGE_NONZERO_MIN,
            "blocker",
        ),
        _minimum_count_check(
            "credit_future_usage_90d_nonzero",
            credit_90_nonzero,
            CREDIT_USAGE_NONZERO_MIN,
            "blocker",
        ),
        _variance_check(
            "credit_future_usage_30d_variance",
            credit_usage["future_credit_usage_30d"],
            "blocker",
        ),
        _variance_check(
            "credit_future_usage_90d_variance",
            credit_usage["future_credit_usage_90d"],
            "blocker",
        ),
        _minimum_count_check(
            "topup_timing_observed",
            topup_observed,
            TOPUP_OBSERVED_MIN,
            "warning",
        ),
        ValidationCheck(
            name="topup_censoring_rate",
            severity="warning",
            passed=topup_censoring_rate <= TOPUP_CENSORING_WARNING_MAX,
            message=(
                "Top-up censoring rate is within warning threshold."
                if topup_censoring_rate <= TOPUP_CENSORING_WARNING_MAX
                else "Top-up censoring rate is high."
            ),
            details={
                "censoring_rate": topup_censoring_rate,
                "threshold": TOPUP_CENSORING_WARNING_MAX,
            },
        ),
    ]


def _label_viability_stats(label_set: dict[str, pd.DataFrame]) -> dict[str, Any]:
    churn = label_set["churn"]
    clv = label_set["clv"]
    credit_usage = label_set["credit_usage"]
    topup_timing = label_set["topup_timing"]

    churn_positive = int((churn["churn_label"] == 1).sum()) if len(churn) else 0
    churn_negative = int((churn["churn_label"] == 0).sum()) if len(churn) else 0

    return {
        "churn": {
            "eligible_count": int(len(churn)),
            "positive_count": churn_positive,
            "negative_count": churn_negative,
            "positive_rate": _rate(churn_positive, len(churn)),
        },
        "clv": {
            "eligible_count": int(len(clv)),
            "future_revenue_nonzero_count": int((clv["future_revenue_6m"] > 0).sum())
            if len(clv)
            else 0,
            "future_revenue_total": float(clv["future_revenue_6m"].sum()) if len(clv) else 0.0,
            "future_revenue_variance": _variance(clv["future_revenue_6m"]),
            "top_1_percent_revenue_share": _top_share(clv["future_revenue_6m"], 0.01),
        },
        "credit": {
            "customers": int(len(credit_usage)),
            "future_usage_30d_nonzero_count": int(
                (credit_usage["future_credit_usage_30d"] > 0).sum()
            ),
            "future_usage_90d_nonzero_count": int(
                (credit_usage["future_credit_usage_90d"] > 0).sum()
            ),
            "future_usage_30d_variance": _variance(credit_usage["future_credit_usage_30d"]),
            "future_usage_90d_variance": _variance(credit_usage["future_credit_usage_90d"]),
        },
        "topup_timing": {
            "customers": int(len(topup_timing)),
            "observed_count": int(topup_timing["topup_observed"].sum()),
            "observed_rate": _rate(int(topup_timing["topup_observed"].sum()), len(topup_timing)),
            "censoring_rate": 1.0
            - _rate(int(topup_timing["topup_observed"].sum()), len(topup_timing)),
            "days_until_next_topup_quantiles": _quantiles(
                topup_timing["days_until_next_topup"],
                [0.5, 0.9],
            ),
        },
    }


def _minimum_count_check(
    name: str,
    count: int,
    threshold: int,
    severity: CheckSeverity,
) -> ValidationCheck:
    return ValidationCheck(
        name=name,
        severity=severity,
        passed=count >= threshold,
        message=(
            "Count meets viability threshold."
            if count >= threshold
            else "Count is below viability threshold."
        ),
        details={"count": int(count), "threshold": threshold},
    )


def _variance_check(
    name: str,
    series: pd.Series,
    severity: CheckSeverity,
) -> ValidationCheck:
    variance = _variance(series)
    return ValidationCheck(
        name=name,
        severity=severity,
        passed=variance > 0,
        message=(
            "Target has variance."
            if variance > 0
            else "Target has no variance."
        ),
        details={"variance": variance},
    )


def _required_column_checks(
    frame_name: str,
    frame: pd.DataFrame,
    required_columns: list[str],
) -> list[ValidationCheck]:
    return [
        ValidationCheck(
            name=f"{frame_name}_{column}_exists",
            severity="blocker",
            passed=column in frame.columns,
            message=(
                f"{frame_name}.{column} exists."
                if column in frame.columns
                else f"{frame_name}.{column} is missing."
            ),
        )
        for column in required_columns
    ]


def _invalid_required_value_check(name: str, series: pd.Series) -> ValidationCheck:
    invalid_count = int(series.isna().sum())
    total = int(len(series))
    return ValidationCheck(
        name=name,
        severity="blocker",
        passed=invalid_count == 0,
        message=(
            "Required identifier values are valid."
            if invalid_count == 0
            else "Required identifier values contain null/unparseable rows."
        ),
        details={
            "invalid_count": invalid_count,
            "row_count": total,
            "invalid_rate": _rate(invalid_count, total),
        },
    )


def _invalid_date_rate_check(name: str, series: pd.Series) -> ValidationCheck:
    invalid_count = int(series.isna().sum())
    total = int(len(series))
    invalid_rate = _rate(invalid_count, total)
    return ValidationCheck(
        name=name,
        severity="blocker",
        passed=invalid_rate <= INVALID_DATE_RATE_THRESHOLD,
        message=(
            "Date values are parseable within threshold."
            if invalid_rate <= INVALID_DATE_RATE_THRESHOLD
            else "Date values exceed invalid parse threshold."
        ),
        details={
            "invalid_count": invalid_count,
            "row_count": total,
            "invalid_rate": invalid_rate,
            "threshold": INVALID_DATE_RATE_THRESHOLD,
        },
    )


def _non_negative_check(
    name: str,
    series: pd.Series,
    severity: CheckSeverity,
) -> ValidationCheck:
    negative_count = int((series < 0).sum())
    return ValidationCheck(
        name=name,
        severity=severity,
        passed=negative_count == 0,
        message=(
            "Values are non-negative."
            if negative_count == 0
            else "Negative values found."
        ),
        details={"negative_count": negative_count, "row_count": int(len(series))},
    )


def _allowed_values_check(
    name: str,
    series: pd.Series,
    allowed_values: set[str],
) -> ValidationCheck:
    values = series.fillna("").astype("string")
    unexpected = sorted(
        str(value) for value in values.dropna().unique() if str(value) not in allowed_values
    )
    return ValidationCheck(
        name=name,
        severity="warning",
        passed=len(unexpected) == 0,
        message=(
            "Category values are expected."
            if len(unexpected) == 0
            else "Unexpected category values found."
        ),
        details={"unexpected_values": unexpected, "allowed_values": sorted(allowed_values)},
    )


def _duplicate_customer_check(customers: pd.DataFrame) -> ValidationCheck:
    duplicated = customers["acc_id"].duplicated(keep=False)
    duplicate_ids = (
        customers.loc[duplicated, "acc_id"].dropna().astype("Int64").unique().tolist()
    )
    duplicate_count = int(duplicated.sum())
    return ValidationCheck(
        name="duplicate_customer_acc_id",
        severity="blocker",
        passed=duplicate_count == 0,
        message=(
            "Customer acc_id values are unique."
            if duplicate_count == 0
            else "Duplicate customer acc_id rows found."
        ),
        details={
            "duplicate_row_count": duplicate_count,
            "duplicate_acc_ids_sample": duplicate_ids[:20],
        },
    )


def _orphan_activity_check(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
) -> ValidationCheck:
    customer_ids = set(customers["acc_id"].dropna().astype(int).tolist())
    payment_ids = set(payments["acc_id"].dropna().astype(int).tolist())
    usage_ids = set(usage["acc_id"].dropna().astype(int).tolist())
    activity_ids = payment_ids | usage_ids
    orphan_ids = sorted(activity_ids - customer_ids)
    orphan_rate = _rate(len(orphan_ids), len(activity_ids))

    return ValidationCheck(
        name="orphan_activity_acc_id",
        severity="warning",
        passed=orphan_rate <= ORPHAN_ACTIVITY_RATE_WARNING_THRESHOLD,
        message=(
            "Orphan activity acc_id rate is within threshold."
            if orphan_rate <= ORPHAN_ACTIVITY_RATE_WARNING_THRESHOLD
            else "Customer sheet does not cover all active accounts. Orphan accounts "
            "are still included in training/prediction populations (activity-based "
            "spine) but have no profile fields."
        ),
        details={
            "orphan_acc_id_count": len(orphan_ids),
            "activity_acc_id_count": len(activity_ids),
            "orphan_rate": orphan_rate,
            "threshold": ORPHAN_ACTIVITY_RATE_WARNING_THRESHOLD,
            "orphan_acc_ids_sample": orphan_ids[:20],
        },
    )


def _duplicate_usage_source_check(usage: pd.DataFrame) -> ValidationCheck:
    """Warn when two usage-source sheets in the same channel are exact copies.

    Distinct sources legitimately coexist in real exports, so rows are never
    dropped — but a sheet duplicated by an export bug (e.g. OTP = copy of API)
    double-counts usage in every feature and credit label, so the run must be
    interpreted with that in mind."""

    key_columns = ["acc_id", "year", "month", "usage"]
    duplicated_pairs: list[dict[str, Any]] = []
    if len(usage) and all(column in usage.columns for column in [*key_columns, "channel", "usage_source"]):
        for channel, channel_rows in usage.groupby("channel"):
            sources = {
                source: rows[key_columns].sort_values(key_columns).reset_index(drop=True)
                for source, rows in channel_rows.groupby("usage_source")
            }
            names = sorted(sources)
            for index, first in enumerate(names):
                for second in names[index + 1 :]:
                    if len(sources[first]) and sources[first].equals(sources[second]):
                        duplicated_pairs.append(
                            {
                                "channel": str(channel),
                                "sources": [str(first), str(second)],
                                "rows": int(len(sources[first])),
                            }
                        )

    return ValidationCheck(
        name="usage_source_sheet_duplication",
        severity="warning",
        passed=not duplicated_pairs,
        message=(
            "No usage-source sheets are exact duplicates."
            if not duplicated_pairs
            else "Usage-source sheets contain exact duplicates — usage volume is "
            "double-counted in features/labels until the export is fixed."
        ),
        details={"duplicated_pairs": duplicated_pairs},
    )


def _high_null_rate_check(frame_name: str, frame: pd.DataFrame, column: str) -> ValidationCheck:
    null_rate = _null_rate(frame[column])
    return ValidationCheck(
        name=f"{frame_name}_{column}_null_rate",
        severity="warning",
        passed=null_rate <= HIGH_NULL_RATE_WARNING_THRESHOLD,
        message=(
            f"{frame_name}.{column} null rate is within threshold."
            if null_rate <= HIGH_NULL_RATE_WARNING_THRESHOLD
            else f"{frame_name}.{column} null rate is high."
        ),
        details={"null_rate": null_rate, "threshold": HIGH_NULL_RATE_WARNING_THRESHOLD},
    )


def _series_values(series: pd.Series) -> list[str]:
    return sorted(str(value) for value in series.dropna().unique())


def _activity_date_range(
    payments: pd.DataFrame,
    usage: pd.DataFrame,
) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    dates = pd.concat(
        [
            payments["payment_date"].dropna(),
            usage.loc[usage["usage"] > 0, "period"].dropna(),
        ],
        ignore_index=True,
    )
    if dates.empty:
        return None, None
    return pd.Timestamp(dates.min()), pd.Timestamp(dates.max())


def _timestamp(value: pd.Timestamp) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    return timestamp.tz_localize(None) if timestamp.tzinfo else timestamp


def _optional_timestamp(value: str | None) -> pd.Timestamp | None:
    if value is None:
        return None
    return _timestamp(pd.Timestamp(value))


def _variance(series: pd.Series) -> float:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return 0.0
    return float(clean.var(ddof=0))


def _top_share(series: pd.Series, share: float) -> float:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    total = float(clean.sum())
    if clean.empty or total <= 0:
        return 0.0
    top_n = max(1, int(len(clean) * share))
    return float(clean.nlargest(top_n).sum() / total)


def _quantiles(series: pd.Series, quantiles: list[float]) -> dict[str, float | None]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return {f"p{int(q * 100)}": None for q in quantiles}
    return {f"p{int(q * 100)}": float(clean.quantile(q)) for q in quantiles}


def _null_rate(series: pd.Series) -> float:
    return _rate(int(series.isna().sum()), int(len(series)))


def _rate(count: int, total: int) -> float:
    if total == 0:
        return 0.0
    return float(count / total)


def _readiness_table_checks(conn: Connection, tables: CleanTableSet) -> list[ValidationCheck]:
    return [
        _table_exists_check(conn, tables.source_table),
        _table_exists_check(conn, tables.customers_table),
        _table_exists_check(conn, tables.payments_table),
        _table_exists_check(conn, tables.usage_table),
    ]


def _schema_structure_checks(conn: Connection, tables: CleanTableSet) -> list[ValidationCheck]:
    checks = _readiness_table_checks(conn, tables)
    if any(check.severity == "blocker" and not check.passed for check in checks):
        return checks

    checks.extend(
        _table_column_checks(conn, tables.customers_table, CUSTOMER_DB_REQUIRED_COLUMNS)
    )
    checks.extend(
        _table_column_checks(conn, tables.payments_table, PAYMENT_DB_REQUIRED_COLUMNS)
    )
    checks.extend(_table_column_checks(conn, tables.usage_table, USAGE_DB_REQUIRED_COLUMNS))
    return checks


def _table_exists_check(conn: Connection, table_name: str) -> ValidationCheck:
    exists = _table_exists(conn, table_name)
    return ValidationCheck(
        name=f"{table_name}_exists",
        severity="blocker",
        passed=exists,
        message=f"{table_name} exists." if exists else f"{table_name} is missing.",
    )


def _table_column_checks(
    conn: Connection,
    table_name: str,
    required_columns: list[str],
) -> list[ValidationCheck]:
    columns = _table_columns(conn, table_name)
    return [
        ValidationCheck(
            name=f"{table_name}_{column}_column_exists",
            severity="blocker",
            passed=column in columns,
            message=(
                f"{table_name}.{column} column exists."
                if column in columns
                else f"{table_name}.{column} column is missing."
            ),
        )
        for column in required_columns
    ]


def _table_structure_stats(checks: list[ValidationCheck]) -> dict[str, Any]:
    return {
        "missing": [
            {"name": check.name, "message": check.message}
            for check in checks
            if not check.passed
        ]
    }


def _clean_tables_exist(conn: Connection, tables: CleanTableSet) -> bool:
    return all(
        _table_exists(conn, table_name)
        for table_name in (tables.customers_table, tables.payments_table, tables.usage_table)
    )


def _table_exists(conn: Connection, table_name: str) -> bool:
    return conn.execute(
        text("SELECT to_regclass(:table_name) IS NOT NULL"),
        {"table_name": f"public.{table_name}"},
    ).scalar_one()


def _table_columns(conn: Connection, table_name: str) -> set[str]:
    rows = conn.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalars()
    return {str(row) for row in rows}


def _load_source(conn: Connection, source_table: str, source_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        text(
            f"""
            SELECT
              id::text AS id,
              import_status,
              clean_manifest
            FROM {source_table}
            WHERE id = :source_id
            """
        ),
        {"source_id": source_id},
    ).mappings().first()

    return dict(row) if row is not None else None


def _load_clean_row_counts(
    conn: Connection,
    tables: CleanTableSet,
    source_id: str,
) -> dict[str, int]:
    return {
        "customers": _count_rows(conn, tables.customers_table, source_id),
        "payments": _count_rows(conn, tables.payments_table, source_id),
        "usage": _count_rows(conn, tables.usage_table, source_id),
    }


def _count_rows(conn: Connection, table_name: str, source_id: str) -> int:
    row_count = conn.execute(
        text(f"SELECT COUNT(*) FROM {table_name} WHERE source_id = :source_id"),
        {"source_id": source_id},
    ).scalar_one()
    return int(row_count)


def _common_readiness_checks(
    source: dict[str, Any] | None,
    row_counts: dict[str, int],
    source_id: str,
    source_table: str,
) -> list[ValidationCheck]:
    if source is None:
        return [
            ValidationCheck(
                name="source_exists",
                severity="blocker",
                passed=False,
                message=f"{source_table} row not found: {source_id}",
            )
        ]

    import_status = source.get("import_status")
    clean_manifest = source.get("clean_manifest")
    manifest_warnings = _manifest_warnings(clean_manifest)

    return [
        ValidationCheck(
            name="source_exists",
            severity="blocker",
            passed=True,
            message=f"{source_table} row found.",
        ),
        ValidationCheck(
            name="source_ready",
            severity="blocker",
            passed=import_status == "ready",
            message=(
                "Source import_status is ready."
                if import_status == "ready"
                else f"Source import_status is {import_status!r}, expected 'ready'."
            ),
            details={"import_status": import_status},
        ),
        ValidationCheck(
            name="clean_manifest_exists",
            severity="blocker",
            passed=clean_manifest is not None,
            message=(
                "clean_manifest exists."
                if clean_manifest is not None
                else "clean_manifest is missing."
            ),
        ),
        ValidationCheck(
            name="clean_manifest_warnings",
            severity="warning",
            passed=len(manifest_warnings) == 0,
            message=(
                "clean_manifest has no warnings."
                if len(manifest_warnings) == 0
                else "clean_manifest contains warnings."
            ),
            details={"warnings": manifest_warnings},
        ),
        ValidationCheck(
            name="customers_non_empty",
            severity="blocker",
            passed=row_counts["customers"] > 0,
            message=(
                "Clean customers table has rows."
                if row_counts["customers"] > 0
                else "Clean customers table is empty."
            ),
            details={"row_count": row_counts["customers"]},
        ),
    ]


def _train_readiness_checks(row_counts: dict[str, int]) -> list[ValidationCheck]:
    return [
        ValidationCheck(
            name="payments_non_empty",
            severity="blocker",
            passed=row_counts["payments"] > 0,
            message=(
                "Clean payments table has rows."
                if row_counts["payments"] > 0
                else "Training requires clean payments rows."
            ),
            details={"row_count": row_counts["payments"]},
        ),
        ValidationCheck(
            name="usage_non_empty",
            severity="blocker",
            passed=row_counts["usage"] > 0,
            message=(
                "Clean usage table has rows."
                if row_counts["usage"] > 0
                else "Training requires clean usage rows."
            ),
            details={"row_count": row_counts["usage"]},
        ),
    ]


def _predict_readiness_checks(row_counts: dict[str, int]) -> list[ValidationCheck]:
    return [
        ValidationCheck(
            name="payments_optional",
            severity="warning",
            passed=row_counts["payments"] > 0,
            message=(
                "Clean payments table has rows."
                if row_counts["payments"] > 0
                else "Predict source has no payments rows; prediction can continue with fallback eligibility."
            ),
            details={"row_count": row_counts["payments"]},
        ),
        ValidationCheck(
            name="usage_optional",
            severity="warning",
            passed=row_counts["usage"] > 0,
            message=(
                "Clean usage table has rows."
                if row_counts["usage"] > 0
                else "Predict source has no usage rows; prediction can continue with fallback eligibility."
            ),
            details={"row_count": row_counts["usage"]},
        ),
    ]


def _manifest_warnings(clean_manifest: Any) -> list[Any]:
    if not isinstance(clean_manifest, dict):
        return []

    warnings = clean_manifest.get("warnings")
    if warnings is None:
        return []
    if isinstance(warnings, list):
        return warnings
    return [warnings]


def _report_status(checks: list[ValidationCheck]) -> ReportStatus:
    if any(check.severity == "blocker" and not check.passed for check in checks):
        return "failed"
    if any(check.severity == "warning" and not check.passed for check in checks):
        return "warning"
    return "passed"


def _anomalies_from_checks(checks: list[ValidationCheck]) -> list[dict[str, Any]]:
    return [
        {
            "name": check.name,
            "severity": check.severity,
            "message": check.message,
            "details": check.details,
        }
        for check in checks
        if not check.passed
    ]
