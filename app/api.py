"""REST API: profile, recent games, time controls, friend-game creation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import get_or_create_user, resolve_user
from .config import settings
from .db import get_session
from .game_manager import PlayerSlot, manager
from .logging_setup import frontend_logger
from .models import Game, GameResult, GameStatus, User
from .timecontrols import as_dicts, clock_presets_as_dicts, get_tc

router = APIRouter(prefix="/api")


# ── auth dependency ──────────────────────────────────────────────────
async def current_user(
    session: AsyncSession = Depends(get_session),
    x_init_data: str = Header(default=""),
    x_dev_id: str | None = Header(default=None),
    init_data_q: str = Query(default="", alias="initData"),
    dev_id_q: str | None = Query(default=None, alias="dev_id"),
) -> User:
    init_data = x_init_data or init_data_q
    dev_id = x_dev_id or dev_id_q
    try:
        tg = resolve_user(init_data, int(dev_id) if dev_id else None)
    except (PermissionError, ValueError):
        raise HTTPException(status_code=401, detail="Authentication failed")
    return await get_or_create_user(session, tg)


# ── schemas ──────────────────────────────────────────────────────────
class FriendGameRequest(BaseModel):
    tc: str = "10+0"


class ClientLog(BaseModel):
    message: str = ""
    source: str | None = None      # e.g. file/url where the error happened
    stack: str | None = None       # JS stack trace
    url: str | None = None         # page url at the time of error
    userAgent: str | None = None


def _user_json(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.display_name,
        "rating": u.rating,
        "wins": u.wins,
        "losses": u.losses,
        "draws": u.draws,
        "streak": u.streak,
        "photoUrl": u.photo_url,
    }


# ── endpoints ────────────────────────────────────────────────────────
@router.post("/client-log")
async def client_log(entry: ClientLog):
    """Record a browser-side error into logs/front-error.logs."""
    parts = [entry.message or "(no message)"]
    if entry.url:
        parts.append(f"url={entry.url}")
    if entry.source:
        parts.append(f"source={entry.source}")
    if entry.userAgent:
        parts.append(f"ua={entry.userAgent}")
    if entry.stack:
        parts.append(f"\n{entry.stack}")
    frontend_logger.error(" | ".join(parts))
    return {"ok": True}


@router.get("/config")
async def get_config():
    return {
        "devMode": settings.dev_mode,
        "botUsername": settings.bot_username,
        "webappShortName": settings.webapp_short_name,
        "timeControls": as_dicts(),
        "clockPresets": clock_presets_as_dicts(),
    }


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return _user_json(user)


@router.get("/timecontrols")
async def time_controls():
    return as_dicts()


@router.get("/clock/presets")
async def clock_presets():
    """Preset catalog for the standalone two-player chess clock (no auth)."""
    return clock_presets_as_dicts()


@router.get("/recent")
async def recent_games(user: User = Depends(current_user),
                       session: AsyncSession = Depends(get_session)):
    res = await session.execute(
        select(Game)
        .where(Game.status == GameStatus.finished)
        .where(or_(Game.white_id == user.id, Game.black_id == user.id))
        .order_by(desc(Game.finished_at))
        .limit(10)
    )
    games = res.scalars().all()
    out = []
    for g in games:
        i_am_white = g.white_id == user.id
        opp = g.black if i_am_white else g.white
        if g.result == GameResult.draw:
            result = "D"
        elif (g.result == GameResult.white) == i_am_white:
            result = "W"
        else:
            result = "L"
        out.append({
            "id": g.id,
            "name": opp.display_name if opp else "Opponent",
            "tc": f"{get_tc(g.tc_id).name} {g.tc_id}",
            "moves": g.move_count,
            "result": result,
        })
    return out


@router.post("/games/friend")
async def create_friend_game(req: FriendGameRequest, user: User = Depends(current_user)):
    slot = PlayerSlot(user_id=user.id, name=user.display_name, rating=user.rating,
                      photo_url=user.photo_url)
    room = await manager.create_friend_game(slot, req.tc)
    return {
        "gameId": room.id,
        "color": "white",
        "inviteLink": _invite_link(room.id),
        "tc": {"id": room.tc.id, "base": room.tc.base, "inc": room.tc.inc,
               "name": room.tc.name, "icon": room.tc.icon},
    }


@router.get("/games/{game_id}")
async def game_info(game_id: str, session: AsyncSession = Depends(get_session)):
    room = manager.get(game_id)
    if room is not None:
        tc = room.tc
        return {
            "gameId": room.id,
            "status": room.status,
            "openSlot": room.open_slot(),
            "tc": {"id": tc.id, "base": tc.base, "inc": tc.inc, "name": tc.name, "icon": tc.icon},
            "players": {
                "white": room._player_json("white"),
                "black": room._player_json("black"),
            },
            "inviteLink": _invite_link(room.id),
        }
    # fall back to a finished/persisted game
    game = await session.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    tc = get_tc(game.tc_id)
    return {
        "gameId": game.id,
        "status": game.status.value,
        "openSlot": None,
        "tc": {"id": tc.id, "base": tc.base, "inc": tc.inc, "name": tc.name, "icon": tc.icon},
        "players": {
            "white": _user_json(game.white) if game.white else None,
            "black": _user_json(game.black) if game.black else None,
        },
        "inviteLink": _invite_link(game.id),
    }


def _invite_link(game_id: str) -> str:
    if settings.bot_username:
        return (f"https://t.me/{settings.bot_username}/"
                f"{settings.webapp_short_name}?startapp={game_id}")
    # dev fallback: open the frontend directly with the game param
    sep = "&" if "?" in settings.webapp_url else "?"
    return f"{settings.webapp_url}{sep}startapp={game_id}"
