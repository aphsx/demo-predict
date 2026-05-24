"""
Run Alembic migrations, repairing partial-schema Docker volumes.

If ML tables exist but alembic_version is missing (failed mid-baseline),
reset the public schema when DOCKER_BUILD=1 and re-run from scratch.

After Alembic: apply [NEW] moby-data-prep SQL (train + predict raw) from
moby-data-prep/migrations (mounted at /app/train-migrations in Docker).
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ML_MARKERS = ("model_versions", "prediction_runs", "predictions")
AUTH_MARKER = "user"
TRAIN_RAW_MARKER = "train_data_sources"
PREDICT_RAW_MARKER = "predict_data_sources"
TRAIN_MIGRATIONS_DIR = os.environ.get(
    "TRAIN_MIGRATIONS_DIR", "/app/train-migrations"
)

# Per-file skip: apply only when marker table is missing (002 uses IF NOT EXISTS).
MIGRATION_MARKERS: dict[str, str | None] = {
    "001": TRAIN_RAW_MARKER,
    "002": None,  # additive ALTER on train_data_sources
    "003": PREDICT_RAW_MARKER,
}
LEGACY_RAW_MARKER = "raw_customers"
# Skip drop migration when legacy tables are already gone.
SKIP_MIGRATION_IF_TABLE_ABSENT: dict[str, str] = {
    "004": LEGACY_RAW_MARKER,
}


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


def _split_sql_statements(sql: str) -> list[str]:
    """Split a migration file into executable statements (skip empty / comment-only)."""
    parts = re.split(r";\s*\n", sql)
    out: list[str] = []
    for part in parts:
        stmt = part.strip()
        if not stmt:
            continue
        if all(line.strip().startswith("--") or not line.strip() for line in stmt.splitlines()):
            continue
        out.append(stmt if stmt.endswith(";") else f"{stmt};")
    return out


async def _table_exists(conn, table: str) -> bool:
    row = await conn.execute(
        text("SELECT to_regclass(:name)"),
        {"name": f"public.{table}"},
    )
    return row.scalar() is not None


def _migration_marker(filename: str) -> str | None:
    prefix = filename.split("_", 1)[0]
    return MIGRATION_MARKERS.get(prefix)


async def apply_moby_data_prep_migrations(database_url: str) -> None:
    """[NEW] moby-data-prep SQL (train + predict raw) — not in Alembic."""
    mig_dir = Path(TRAIN_MIGRATIONS_DIR)
    if not mig_dir.is_dir():
        print(
            f"=== moby-data-prep migrations skipped (no dir {mig_dir}) — "
            "run moby-data-prep/migrations/*.sql manually if needed ===",
            flush=True,
        )
        return

    sql_files = sorted(mig_dir.glob("*.sql"))
    if not sql_files:
        print(f"=== No .sql files in {mig_dir} ===", flush=True)
        return

    async_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(async_url)

    print("=== Applying [NEW] moby-data-prep migrations ===", flush=True)
    async with engine.begin() as conn:
        for path in sql_files:
            prefix = path.name.split("_", 1)[0]
            absent_marker = SKIP_MIGRATION_IF_TABLE_ABSENT.get(prefix)
            if absent_marker is not None:
                if not await _table_exists(conn, absent_marker):
                    print(f"  skip {path.name} ({absent_marker} already dropped)", flush=True)
                    continue
            marker = _migration_marker(path.name)
            if marker is not None:
                if await _table_exists(conn, marker):
                    print(f"  skip {path.name} ({marker} exists)", flush=True)
                    continue
            print(f"  -> {path.name}", flush=True)
            raw = path.read_text(encoding="utf-8")
            for stmt in _split_sql_statements(raw):
                await conn.execute(text(stmt))

    await engine.dispose()
    print("=== moby-data-prep migrations done ===", flush=True)


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
        await apply_moby_data_prep_migrations(database_url)
        sys.exit(0)

    print("=== Running Alembic migrations ===", flush=True)
    code = run_alembic_upgrade()
    if code != 0:
        sys.exit(code)

    await apply_moby_data_prep_migrations(database_url)


if __name__ == "__main__":
    asyncio.run(main())
