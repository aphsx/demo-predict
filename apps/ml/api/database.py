"""
Async database connection — SQLAlchemy + asyncpg
"""
import os
from typing import Optional

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
from sqlalchemy.orm import DeclarativeBase


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required.")
    return url


_engine: Optional[AsyncEngine] = None
_session_local: Optional[async_sessionmaker] = None


def _init_db() -> tuple[AsyncEngine, async_sessionmaker]:
    global _engine, _session_local
    if _engine is None:
        url = get_database_url()
        async_url = url.replace("postgresql://", "postgresql+asyncpg://")
        _engine = create_async_engine(async_url, echo=False, pool_pre_ping=True)
        _session_local = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine, _session_local  # type: ignore[return-value]


class Base(DeclarativeBase):
    pass


async def get_db():
    _, session_local = _init_db()
    async with session_local() as session:
        yield session


class _LazyEngine:
    """Proxy that defers engine creation until DATABASE_URL is available."""

    def __getattr__(self, name: str):
        eng, _ = _init_db()
        return getattr(eng, name)


# Module-level `engine` stays importable; actual connection deferred to first use.
engine = _LazyEngine()
