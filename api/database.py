"""
Async PostgreSQL connection — SQLAlchemy 2.0 + asyncpg

DATABASE_URL env var (default points to Docker Compose service):
  postgresql+asyncpg://crm_user:crm_secret@localhost:5432/churn_crm
"""

import os
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://crm_user:crm_secret@localhost:5432/churn_crm",
)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency — yields an AsyncSession per request."""
    async with AsyncSessionLocal() as session:
        yield session
