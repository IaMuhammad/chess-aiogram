"""WebSocket endpoints: live game sync and matchmaking queue."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .auth import get_or_create_user, resolve_user
from .config import settings
from .db import SessionLocal
from .game_manager import Connection, GameRoom, PlayerSlot, manager
from .models import Game, GameStatus

log = logging.getLogger("chess.ws")
router = APIRouter()


async def _authenticate_ws(ws: WebSocket) -> PlayerSlot | None:
    """Resolve the connecting user from the query string. Returns None on failure."""
    init_data = ws.query_params.get("initData", "")
    dev_id = ws.query_params.get("dev_id")
    try:
        tg = resolve_user(init_data, int(dev_id) if dev_id else None)
    except (PermissionError, ValueError):
        return None
    async with SessionLocal() as session:
        user = await get_or_create_user(session, tg)
        return PlayerSlot(
            user_id=user.id, name=user.display_name, rating=user.rating, photo_url=user.photo_url
        )


@router.websocket("/ws/game/{game_id}")
async def game_ws(ws: WebSocket, game_id: str):
    await ws.accept()
    slot = await _authenticate_ws(ws)
    if slot is None:
        await ws.send_json({"type": "error", "message": "Authentication failed"})
        await ws.close()
        return

    room = manager.get(game_id)
    if room is None:
        await ws.send_json({"type": "error", "message": "Game not found or has ended"})
        await ws.close()
        return

    # decide this user's role
    color = room.color_of(slot.user_id)
    if color is None:
        open_slot = room.open_slot()
        if open_slot and room.status == GameStatus.waiting.value:
            room.seat(open_slot, slot)
            color = open_slot
            await _persist_join(room, open_slot, slot)
            started = room.maybe_start()
            if started:
                room.ensure_ticker(manager)
        else:
            color = "spectator"

    conn = Connection(ws=ws, user_id=slot.user_id, color=color)
    room.connections.append(conn)
    if room.status == GameStatus.active.value:
        room.ensure_ticker(manager)
    await room.broadcast_state()

    try:
        while True:
            try:
                data = await ws.receive_json()
            except (json.JSONDecodeError, ValueError):
                # Client sent a non-JSON frame: that's a client mistake, not a
                # server error. Tell them and keep the socket alive instead of
                # crashing the loop and spamming back-error.logs with a traceback.
                await ws.send_json({"type": "error", "message": "Malformed message (expected JSON)"})
                continue
            await _handle_message(room, conn, data)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.error("Error in game socket (game_id=%s, user_id=%s)",
                  game_id, slot.user_id, exc_info=True)
    finally:
        if conn in room.connections:
            room.connections.remove(conn)
        await room.broadcast_state()


async def _handle_message(room: GameRoom, conn: Connection, data: dict) -> None:
    mtype = data.get("type")
    color = conn.color

    if mtype == "move" and color in ("white", "black"):
        uci = data.get("uci", "")
        async with room._lock:
            try:
                room.apply_move(color, uci)
            except ValueError as exc:
                await conn.ws.send_json({"type": "error", "message": str(exc)})
                return
        if room.status == GameStatus.finished.value:
            await manager.on_game_finished(room)
        await room.broadcast_state()

    elif mtype == "chat" and color in ("white", "black"):
        text = (data.get("text") or "").strip()
        if text:
            room.add_message(color, text)
            await room.broadcast_state()

    elif mtype == "resign" and color in ("white", "black"):
        async with room._lock:
            room.resign(color)
        await manager.on_game_finished(room)
        await room.broadcast_state()

    elif mtype == "offer_draw" and color in ("white", "black"):
        room.draw_offer = color
        await room.broadcast_state()

    elif mtype == "accept_draw" and color in ("white", "black"):
        if room.draw_offer and room.draw_offer != color:
            async with room._lock:
                room.agree_draw()
            await manager.on_game_finished(room)
            await room.broadcast_state()

    elif mtype == "decline_draw" and color in ("white", "black"):
        if room.draw_offer and room.draw_offer != color:
            room.draw_offer = None
            await room.broadcast_state()


async def _persist_join(room: GameRoom, color: str, slot: PlayerSlot) -> None:
    async with SessionLocal() as session:
        game = await session.get(Game, room.id)
        if game is None:
            return
        if color == "white":
            game.white_id = slot.user_id
        else:
            game.black_id = slot.user_id
        if room.white and room.black:
            game.status = GameStatus.active
        await session.commit()


@router.websocket("/ws/queue")
async def queue_ws(ws: WebSocket):
    """Matchmaking. Connect with ?tc=5+0&initData=... ; receive {type:'matched',...}."""
    await ws.accept()
    slot = await _authenticate_ws(ws)
    if slot is None:
        await ws.send_json({"type": "error", "message": "Authentication failed"})
        await ws.close()
        return
    tc_id = ws.query_params.get("tc", "10+0")
    conn = Connection(ws=ws, user_id=slot.user_id, color="spectator")

    room = await manager.enqueue(conn, slot, tc_id)
    if room is not None:
        # matched immediately with a waiting opponent
        my_color = room.color_of(slot.user_id)
        room.ensure_ticker(manager)
        await ws.send_json({"type": "matched", "gameId": room.id, "color": my_color})
        await ws.close()
        return

    await ws.send_json({"type": "searching", "tc": tc_id})
    try:
        # hold the connection open until matched (by another player's enqueue)
        # or the client cancels / disconnects
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        log.error("Error in queue socket (user_id=%s, tc=%s)",
                  slot.user_id, tc_id, exc_info=True)
    finally:
        await manager.dequeue(conn)
