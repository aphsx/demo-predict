"""Validation reports for the rebuilt ML training/prediction pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from src.training.data import PREDICT_TABLES, TRAIN_TABLES, CleanTableSet, SourceKind, database_url


CheckSeverity = Literal["blocker", "warning", "info"]
ReportStatus = Literal["passed", "warning", "failed"]


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


def _check_source_readiness(source_id: str, tables: CleanTableSet) -> ValidationReport:
    with create_engine(database_url()).connect() as conn:
        source = _load_source(conn, tables.source_table, source_id)
        row_counts = _load_clean_row_counts(conn, tables, source_id)

    checks = _common_readiness_checks(
        source=source,
        row_counts=row_counts,
        source_id=source_id,
        source_table=tables.source_table,
    )
    if tables.source_kind == "train":
        checks.extend(_train_readiness_checks(row_counts))
    else:
        checks.extend(_predict_readiness_checks(row_counts))

    status = _report_status(checks)
    anomalies = _anomalies_from_checks(checks)
    return ValidationReport(
        source_id=source_id,
        source_kind=tables.source_kind,
        validation_type="profile",
        status=status,
        row_count=row_counts["customers"],
        stats={"row_counts": row_counts},
        anomalies=anomalies,
        checks=checks,
    )


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
