"""
SQLAlchemy 2.0 ORM models — single source of truth for the schema.
Alembic autogenerates migrations by diffing this file against the DB.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, ForeignKey, Text, TIMESTAMP, UniqueConstraint, text,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


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
