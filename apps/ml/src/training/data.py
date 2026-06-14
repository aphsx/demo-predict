"""Clean data access for the rebuilt ML pipeline.

Train and predict imports are separate datasets. This module shares only the
table-reading and dtype-normalization code so feature building sees the same
schema shape in both flows.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection


SourceKind = Literal["train", "predict"]


@dataclass(frozen=True)
class CleanTableSet:
    source_kind: SourceKind
    source_table: str
    customers_table: str
    payments_table: str
    usage_table: str


@dataclass(frozen=True)
class CleanDataset:
    source_id: str
    source_kind: SourceKind
    customers: pd.DataFrame
    payments: pd.DataFrame
    usage: pd.DataFrame


TRAIN_TABLES = CleanTableSet(
    source_kind="train",
    source_table="train_data_sources",
    customers_table="train_clean_customers",
    payments_table="train_clean_payments",
    usage_table="train_clean_usage",
)

PREDICT_TABLES = CleanTableSet(
    source_kind="predict",
    source_table="predict_data_sources",
    customers_table="predict_clean_customers",
    payments_table="predict_clean_payments",
    usage_table="predict_clean_usage",
)


def database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required.")
    return url


def load_train_clean(source_id: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load `train_clean_*` rows for model training/retraining."""

    dataset = load_clean_dataset(source_id=source_id, tables=TRAIN_TABLES)
    return dataset.customers, dataset.payments, dataset.usage


def load_predict_clean(source_id: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load `predict_clean_*` rows for prediction only."""

    dataset = load_clean_dataset(source_id=source_id, tables=PREDICT_TABLES)
    return dataset.customers, dataset.payments, dataset.usage


def load_clean_dataset(source_id: str, tables: CleanTableSet) -> CleanDataset:
    with create_engine(database_url()).connect() as conn:
        customers = _load_customers(conn, tables.customers_table, source_id)
        payments = _load_payments(conn, tables.payments_table, source_id)
        usage = _load_usage(conn, tables.usage_table, source_id)

    return CleanDataset(
        source_id=source_id,
        source_kind=tables.source_kind,
        customers=_normalize_customers(customers),
        payments=_normalize_payments(payments),
        usage=_normalize_usage(usage),
    )


def _load_customers(conn: Connection, table_name: str, source_id: str) -> pd.DataFrame:
    return _read_sql(
        conn,
        f"""
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
        FROM {table_name}
        WHERE source_id = :source_id
        ORDER BY acc_id
        """,
        {"source_id": source_id},
    )


def _load_payments(conn: Connection, table_name: str, source_id: str) -> pd.DataFrame:
    return _read_sql(
        conn,
        f"""
        SELECT
          acc_id,
          payment_uid,
          payment_date,
          amount,
          credit_add,
          credit_type
        FROM {table_name}
        WHERE source_id = :source_id
        ORDER BY acc_id, payment_date, payment_uid
        """,
        {"source_id": source_id},
    )


def _load_usage(conn: Connection, table_name: str, source_id: str) -> pd.DataFrame:
    return _read_sql(
        conn,
        f"""
        SELECT
          acc_id,
          year,
          month,
          usage,
          channel,
          usage_source
        FROM {table_name}
        WHERE source_id = :source_id
        ORDER BY acc_id, year, month, channel, usage_source
        """,
        {"source_id": source_id},
    )


def _read_sql(conn: Connection, query: str, params: dict[str, Any]) -> pd.DataFrame:
    return pd.read_sql_query(text(query), conn, params=params)


def _normalize_customers(customers: pd.DataFrame) -> pd.DataFrame:
    customers = customers.copy()
    customers["acc_id"] = _to_nullable_int(customers["acc_id"])
    customers["status_sms"] = _normalize_text(customers["status_sms"])
    customers["status_email"] = _normalize_text(customers["status_email"])

    for column in ("credit_sms", "credit_email"):
        customers[column] = _to_numeric(customers[column])

    for column in ("expire_sms", "expire_email", "join_date"):
        customers[column] = _to_naive_datetime(customers[column])

    for column in ("last_access", "last_send"):
        customers[column] = _to_naive_datetime(customers[column])

    return customers


def _normalize_payments(payments: pd.DataFrame) -> pd.DataFrame:
    payments = payments.copy()
    payments["acc_id"] = _to_nullable_int(payments["acc_id"])
    payments["payment_uid"] = _to_nullable_int(payments["payment_uid"])
    payments["payment_date"] = _to_naive_datetime(payments["payment_date"])
    payments["amount"] = _to_numeric(payments["amount"])
    payments["credit_add"] = _to_numeric(payments["credit_add"])
    payments["credit_type"] = _normalize_text(payments["credit_type"])
    return payments


def _normalize_usage(usage: pd.DataFrame) -> pd.DataFrame:
    usage = usage.copy()
    usage["acc_id"] = _to_nullable_int(usage["acc_id"])
    usage["year"] = _to_nullable_int(usage["year"])
    usage["month"] = _to_nullable_int(usage["month"])
    usage["usage"] = _to_numeric(usage["usage"])
    usage["channel"] = _normalize_text(usage["channel"])
    usage["usage_source"] = _normalize_text(usage["usage_source"])
    usage["period"] = _build_usage_period(usage["year"], usage["month"])
    return usage


def _to_nullable_int(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").astype("Int64")


def _to_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _to_naive_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True).dt.tz_localize(None)


def _normalize_text(series: pd.Series) -> pd.Series:
    return series.astype("string").str.strip().str.lower()


def _build_usage_period(year: pd.Series, month: pd.Series) -> pd.Series:
    year_text = year.astype("string")
    month_text = month.astype("string").str.zfill(2)
    return pd.to_datetime(year_text + "-" + month_text + "-01", errors="coerce")
