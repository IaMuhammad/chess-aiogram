"""Centralised logging configuration.

Writes two separate error logs into the project's ``logs/`` directory:

  * ``logs/back-error.logs``  — errors raised on the backend (FastAPI / bot / DB).
  * ``logs/front-error.logs`` — errors reported by the browser frontend, sent
    to the ``POST /api/client-log`` endpoint.

The directory is created on import so the rest of the app can log freely.
"""
from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
BACK_ERROR_LOG = LOG_DIR / "back-error.logs"
FRONT_ERROR_LOG = LOG_DIR / "front-error.logs"

_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"

# Dedicated logger for browser-reported errors.
frontend_logger = logging.getLogger("chess.frontend")


def _file_handler(path: Path, level: int) -> RotatingFileHandler:
    handler = RotatingFileHandler(path, maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(_FORMAT))
    return handler


def setup_logging() -> None:
    """Configure file logging. Safe to call more than once."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()

    # Backend errors (ERROR and above) → logs/back-error.logs.
    if not any(getattr(h, "_chess_back", False) for h in root.handlers):
        back = _file_handler(BACK_ERROR_LOG, logging.ERROR)
        back._chess_back = True  # type: ignore[attr-defined]
        root.addHandler(back)

    # Frontend errors → logs/front-error.logs (own handler, not propagated to root).
    if not any(getattr(h, "_chess_front", False) for h in frontend_logger.handlers):
        front = _file_handler(FRONT_ERROR_LOG, logging.INFO)
        front._chess_front = True  # type: ignore[attr-defined]
        frontend_logger.addHandler(front)
        frontend_logger.setLevel(logging.INFO)
        frontend_logger.propagate = False
