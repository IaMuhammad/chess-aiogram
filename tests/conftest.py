"""Shared pytest fixtures for the backend test suite.

IMPORTANT: environment variables that control app.config.Settings must be set
BEFORE any `app.*` module is imported anywhere in the process, because
`app.config.settings` is a module-level singleton (backed by `lru_cache`) and
`app.db.engine` is built from `settings.database_url` at import time. We do
that here, at the very top of conftest.py, since pytest imports conftest.py
before collecting/importing any test module in this directory.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from pathlib import Path

# ── isolated test DB, created once per test *session* ──────────────────
# Using a dedicated tmp directory (not the repo root) keeps this suite from
# ever touching the real chess.db, and keeps a rerun from starting out with
# stale data left over from a previous run.
_TMP_DIR = tempfile.mkdtemp(prefix="chess-aiogram-tests-")
_DB_PATH = Path(_TMP_DIR) / "test_chess.db"

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"
os.environ["DEV_MODE"] = "true"
os.environ["RUN_BOT"] = "false"
os.environ["BOT_TOKEN"] = ""

import pytest

from app.config import settings  # noqa: E402  (import after env setup, by design)
from app.db import Base, engine
from app.game_manager import manager
from app.main import app
from starlette.testclient import TestClient

# Sanity: fail loudly (not just silently misbehave) if settings didn't pick
# up the env vars above, since pydantic-settings + lru_cache ordering is easy
# to get wrong.
assert str(settings.database_url) == f"sqlite+aiosqlite:///{_DB_PATH}", settings.database_url
assert settings.dev_mode is True, settings.dev_mode


def _sync_reset_db() -> None:
    async def _reset() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_reset())


@pytest.fixture(autouse=True)
def _fresh_db():
    """Drop + recreate every table before each test, and reset the in-memory
    GameManager singleton, so tests never leak state into one another."""
    _sync_reset_db()
    manager.rooms.clear()
    manager._queue.clear()
    yield
    manager.rooms.clear()
    manager._queue.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def dev_headers(dev_id) -> dict:
    return {"X-Dev-Id": str(dev_id)}


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMP_DIR, ignore_errors=True)
