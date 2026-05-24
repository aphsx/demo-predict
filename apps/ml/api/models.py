"""
SQLAlchemy 2.0 ORM models — single source of truth for the schema.
Alembic autogenerates migrations by diffing this file against the DB.
"""
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger, Boolean, Date, ForeignKey, Integer, Numeric,
    Text, TIMESTAMP, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


# ── Model Versions ────────────────────────────────────────────────
class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (UniqueConstraint("model_type", "version"),)

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    model_type:      Mapped[str]  = mapped_column(Text, nullable=False)
    version:         Mapped[str]  = mapped_column(Text, nullable=False)
    trained_at:      Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"),
    )
    metrics_json:    Mapped[dict | None] = mapped_column(JSONB)
    model_file_path: Mapped[str | None]  = mapped_column(Text)
    is_active:       Mapped[bool] = mapped_column(Boolean, server_default=text("FALSE"))


# ── Prediction Runs ──────────────────────────────────────────────
class PredictionRun(Base):
    __tablename__ = "prediction_runs"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    name:             Mapped[str]  = mapped_column(Text, nullable=False)
    status:           Mapped[str]  = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    cutoff_date:      Mapped[date] = mapped_column(Date, nullable=False)
    total_customers:  Mapped[int | None]  = mapped_column(Integer)
    active_customers: Mapped[int | None]  = mapped_column(Integer)
    error_message:    Mapped[str | None]  = mapped_column(Text)
    model_version_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("model_versions.id"),
    )
    user_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("user.id", ondelete="SET NULL"), index=True,
    )
    created_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"),
    )


# ── Raw Data (uploaded per run) ───────────────────────────────────
class RawCustomer(Base):
    __tablename__ = "raw_customers"

    id:           Mapped[int]  = mapped_column(BigInteger, primary_key=True)
    run_id:       Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prediction_runs.id", ondelete="CASCADE"),
        index=True,
    )
    acc_id:       Mapped[int]  = mapped_column(Integer, nullable=False)
    status_sms:   Mapped[str | None]    = mapped_column(Text)
    credit_sms:   Mapped[float | None]  = mapped_column(Numeric)
    credit_email: Mapped[float | None]  = mapped_column(Numeric)
    expire_sms:   Mapped[date | None]   = mapped_column(Date)
    expire_email: Mapped[date | None]   = mapped_column(Date)
    status_email: Mapped[str | None]    = mapped_column(Text)
    join_date:    Mapped[date | None]   = mapped_column(Date)
    last_access:  Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    last_send:    Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class RawPayment(Base):
    __tablename__ = "raw_payments"

    id:           Mapped[int]  = mapped_column(BigInteger, primary_key=True)
    run_id:       Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prediction_runs.id", ondelete="CASCADE"),
        index=True,
    )
    acc_id:       Mapped[int]  = mapped_column(Integer, nullable=False)
    payment_date: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    amount:       Mapped[float | None] = mapped_column(Numeric)
    credit_add:   Mapped[float | None] = mapped_column(Numeric)
    credit_type:  Mapped[str | None]   = mapped_column(Text)


class RawUsage(Base):
    __tablename__ = "raw_usage"

    id:      Mapped[int]  = mapped_column(BigInteger, primary_key=True)
    run_id:  Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prediction_runs.id", ondelete="CASCADE"),
        index=True,
    )
    acc_id:  Mapped[int]  = mapped_column(Integer, nullable=False)
    year:    Mapped[int | None]   = mapped_column(Integer)
    month:   Mapped[int | None]   = mapped_column(Integer)
    usage:   Mapped[float | None] = mapped_column(Numeric)
    channel: Mapped[str | None]   = mapped_column(Text)
    source:  Mapped[str | None]   = mapped_column(Text)


# ── Predictions V2 (ML output) ────────────────────────────────────
class Prediction(Base):
    __tablename__ = "predictions"

    id:     Mapped[int]  = mapped_column(BigInteger, primary_key=True)
    run_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prediction_runs.id", ondelete="CASCADE"),
        index=True,
    )
    acc_id: Mapped[int]  = mapped_column(Integer, nullable=False, index=True)

    # Lifecycle
    lifecycle_stage: Mapped[str | None] = mapped_column(Text, index=True)
    sub_stage:       Mapped[str | None] = mapped_column(Text)

    # Churn
    churn_probability: Mapped[float | None] = mapped_column(Numeric(5, 4))

    # CLV
    predicted_clv_6m: Mapped[float | None] = mapped_column(Numeric(14, 2))
    clv_ci95_lo:      Mapped[float | None] = mapped_column(Numeric(14, 2))
    clv_ci95_hi:      Mapped[float | None] = mapped_column(Numeric(14, 2))
    clv_ci80_lo:      Mapped[float | None] = mapped_column(Numeric(14, 2))
    clv_ci80_hi:      Mapped[float | None] = mapped_column(Numeric(14, 2))
    p_alive:          Mapped[float | None] = mapped_column(Numeric(5, 4))

    # Credit forecast
    credit_p10:          Mapped[float | None] = mapped_column(Numeric(8, 2))
    credit_p25:          Mapped[float | None] = mapped_column(Numeric(8, 2))
    credit_p50:          Mapped[float | None] = mapped_column(Numeric(8, 2))
    credit_p75:          Mapped[float | None] = mapped_column(Numeric(8, 2))
    credit_p90:          Mapped[float | None] = mapped_column(Numeric(8, 2))
    n_purchases:         Mapped[int | None]   = mapped_column(Integer)
    forecast_confidence: Mapped[float | None] = mapped_column(Numeric(4, 2))

    # Win-back
    comeback_probability: Mapped[float | None] = mapped_column(Numeric(5, 4))

    # Conversion
    conversion_probability: Mapped[float | None] = mapped_column(Numeric(5, 4))

    # Base metrics
    is_active:                Mapped[int | None]   = mapped_column(Integer)
    total_revenue:            Mapped[float | None] = mapped_column(Numeric(14, 2))
    days_since_last_activity: Mapped[int | None]   = mapped_column(Integer)
    ever_paid:                Mapped[bool | None]  = mapped_column(Boolean, server_default=text("FALSE"))

    # Derived
    revenue_at_risk:       Mapped[float | None] = mapped_column(Numeric(14, 2))
    avg_transaction_value: Mapped[float | None] = mapped_column(Numeric(14, 2))

    created_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"),
    )


# ── better-auth tables ────────────────────────────────────────────
# Column names use camelCase to match better-auth's expected schema.

class User(Base):
    __tablename__ = "user"

    id:             Mapped[str]  = mapped_column(Text, primary_key=True)
    name:           Mapped[str]  = mapped_column(Text, nullable=False)
    email:          Mapped[str]  = mapped_column(Text, nullable=False, unique=True)
    emailVerified:  Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("FALSE"))
    image:          Mapped[str | None] = mapped_column(Text)
    createdAt:      Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )
    updatedAt:      Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )


class Session(Base):
    __tablename__ = "session"

    id:        Mapped[str] = mapped_column(Text, primary_key=True)
    userId:    Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    token:     Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    expiresAt: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    ipAddress: Mapped[str | None] = mapped_column(Text)
    userAgent: Mapped[str | None] = mapped_column(Text)
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )


class Account(Base):
    __tablename__ = "account"
    __table_args__ = (UniqueConstraint("providerId", "accountId"),)

    id:                    Mapped[str] = mapped_column(Text, primary_key=True)
    userId:                Mapped[str] = mapped_column(
        Text, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    accountId:             Mapped[str] = mapped_column(Text, nullable=False)
    providerId:            Mapped[str] = mapped_column(Text, nullable=False)
    accessToken:           Mapped[str | None] = mapped_column(Text)
    refreshToken:          Mapped[str | None] = mapped_column(Text)
    idToken:               Mapped[str | None] = mapped_column(Text)
    accessTokenExpiresAt:  Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    refreshTokenExpiresAt: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    scope:                 Mapped[str | None] = mapped_column(Text)
    password:              Mapped[str | None] = mapped_column(Text)
    createdAt:             Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )
    updatedAt:             Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )


class Verification(Base):
    __tablename__ = "verification"

    id:         Mapped[str] = mapped_column(Text, primary_key=True)
    identifier: Mapped[str] = mapped_column(Text, nullable=False)
    value:      Mapped[str] = mapped_column(Text, nullable=False)
    expiresAt:  Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    createdAt:  Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )
    updatedAt:  Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()"),
    )
