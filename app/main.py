"""FastAPI application entry point.

Wires together:
  * the database (created on startup),
  * the REST API (app.api) and WebSocket endpoints (app.ws),
  * the aiogram bot (started as a background task in the lifespan), and
  * the built frontend (served as static files in production).

Run with:  python main.py   (or)   uvicorn app.main:app --reload
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import router as api_router
from .config import settings
from .db import init_db
from .logging_setup import setup_logging
from .ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
setup_logging()  # add file handlers → logs/back-error.logs and logs/front-error.logs
log = logging.getLogger("chess")

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    log.info("Database ready.")

    stop_event = asyncio.Event()
    bot_task: asyncio.Task | None = None
    if settings.run_bot and settings.bot_token:
        from .bot import run_bot
        bot_task = asyncio.create_task(run_bot(stop_event))

        def _log_bot_crash(task: asyncio.Task) -> None:
            if not task.cancelled() and task.exception() is not None:
                log.error("Telegram bot task crashed", exc_info=task.exception())

        bot_task.add_done_callback(_log_bot_crash)
        log.info("Telegram bot task launched.")
    else:
        log.warning("Bot not started (no BOT_TOKEN or RUN_BOT=false). API still available.")

    try:
        yield
    finally:
        stop_event.set()
        if bot_task:
            try:
                await asyncio.wait_for(bot_task, timeout=5)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                bot_task.cancel()


app = FastAPI(title="Chess — Telegram Mini App", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(ws_router)


@app.exception_handler(Exception)
async def log_unhandled(request: Request, exc: Exception):
    """Log every unhandled backend error (with traceback) to logs/back-error.logs."""
    log.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health():
    return {"ok": True}


# ── serve the built frontend (production) ────────────────────────────
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/")
    async def index():
        return FileResponse(FRONTEND_DIST / "index.html")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # serve real files if present, otherwise the SPA shell
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    async def index_dev():
        return {
            "message": "Chess API is running. The frontend dev server runs "
                       "separately on http://localhost:5173 (cd frontend && npm run dev).",
            "docs": "/docs",
        }
