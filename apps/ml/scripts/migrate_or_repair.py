"""
Run Alembic migrations, repairing partial-schema Docker volumes.

If ML tables exist but alembic_version is missing (failed mid-baseline),
reset the public schema when DOCKER_BUILD=1 and re-run from scratch.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ML_MARKERS = ("model_versions", "prediction_runs", "predictions")
AUTH_MARKER = "user"


async def schema_state(database_url: str) -> str:
    async_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(async_url)

    async def exists(conn, table: str) -> bool:
        row = await conn.execute(
            text("SELECT to_regclass(:name)"),
            {"name": f"public.{table}"},
        )
        return row.scalar() is not None

    async with engine.connect() as conn:
        has_alembic = await exists(conn, "alembic_version")
        has_auth = await exists(conn, AUTH_MARKER)
        has_ml = await exists(conn, ML_MARKERS[0])

    await engine.dispose()

    if has_alembic:
        return "tracked"
    if has_ml and not has_auth:
        return "partial_baseline"
    if has_ml and has_auth:
        return "untracked_complete"
    return "empty"


async def reset_public_schema(database_url: str) -> None:
    async_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(async_url)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
    await engine.dispose()


def run_alembic_upgrade() -> int:
    result = subprocess.run(["alembic", "upgrade", "head"], check=False)
    return result.returncode


async def main() -> None:
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://moby:moby1234@db:5432/moby"
    )
    state = await schema_state(database_url)

    if state == "partial_baseline":
        if os.environ.get("DOCKER_BUILD"):
            print(
                "=== Partial schema detected (ML tables without auth) — resetting ===",
                flush=True,
            )
            await reset_public_schema(database_url)
        else:
            print(
                "ERROR: Database has a partial schema. "
                "Run: docker compose down -v && docker compose up --build",
                file=sys.stderr,
            )
            sys.exit(1)
    elif state == "untracked_complete":
        print("=== Existing schema without alembic_version — stamping head ===", flush=True)
        stamp = subprocess.run(["alembic", "stamp", "head"], check=False)
        if stamp.returncode != 0:
            sys.exit(stamp.returncode)
        sys.exit(0)

    print("=== Running Alembic migrations ===", flush=True)
    code = run_alembic_upgrade()
    if code != 0:
        sys.exit(code)


if __name__ == "__main__":
    asyncio.run(main())
