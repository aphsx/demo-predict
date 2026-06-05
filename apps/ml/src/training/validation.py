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
    validation_type: Literal["profile", "schema"]
    status: ReportStatus
    row_count: int
    stats: dict[str, Any]
    anomalies: list[dict[str, Any]]
    checks: list[ValidationCheck]

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
            "drift_json": None,
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


def _check_source_readiness(source_id: str, tables: CleanTableSet) -> ValidationReport:
    with create_engine(database_url()).connect() as conn:
        table_checks = _readiness_table_checks(conn, tables)
        source = _load_source(conn, tables.source_table, source_id) if _table_exists(conn, tables.source_table) else None
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
        severity="warning",
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
            else "Orphan activity acc_id rate exceeds threshold."
        ),
        details={
            "orphan_acc_id_count": len(orphan_ids),
            "activity_acc_id_count": len(activity_ids),
            "orphan_rate": orphan_rate,
            "threshold": ORPHAN_ACTIVITY_RATE_WARNING_THRESHOLD,
            "orphan_acc_ids_sample": orphan_ids[:20],
        },
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
