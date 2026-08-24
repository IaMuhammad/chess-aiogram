"""In-memory live game rooms + matchmaking.

A `GameRoom` holds the authoritative board, the server-side clocks and every
connected WebSocket. The DB row (models.Game) is the durable record; the room
is the live, in-flight state. Rooms are kept in memory, so a server restart
ends in-progress games (acceptable for this project's scope).
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import chess
from sqlalchemy import or_, select

from . import chess_engine as ce
from .db import SessionLocal
from .models import Game, GameResult, GameStatus, User
from .rating import elo_delta
from .timecontrols import TimeControl, get_tc

CLOCK_BROADCAST_INTERVAL = 1.0   # seconds between clock-sync pushes
TICK_INTERVAL = 0.25             # how often the ticker checks for a flag
MAX_MESSAGES = 80                # chat scrollback kept per room

log = logging.getLogger("chess.game")


def new_game_id() -> str:
    return secrets.token_urlsafe(6).replace("-", "x").replace("_", "y")[:8]


@dataclass
class Connection:
    ws: object              # starlette WebSocket
    user_id: int
    color: str              # "white" | "black" | "spectator"


@dataclass
class PlayerSlot:
    user_id: int
    name: str
    rating: int
    photo_url: str | None = None


@dataclass
class GameRoom:
    id: str
    tc: TimeControl
    board: chess.Board = field(default_factory=ce.new_board)
    white: PlayerSlot | None = None
    black: PlayerSlot | None = None
    status: str = GameStatus.waiting.value
    result: str | None = None           # "white"|"black"|"draw"
    reason: str | None = None
    white_delta: int | None = None
    black_delta: int | None = None

    clocks_ms: dict[str, float] = field(default_factory=dict)
    active_color: str = "white"
    _last_tick: float = 0.0             # monotonic seconds when active clock started

    draw_offer: str | None = None       # color that offered a draw
    messages: list[dict] = field(default_factory=list)
    connections: list[Connection] = field(default_factory=list)
    _ticker: asyncio.Task | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    # ── helpers ──────────────────────────────────────────────────────
    def __post_init__(self):
        self.clocks_ms = {"white": self.tc.base * 1000.0, "black": self.tc.base * 1000.0}

    def slot(self, color: str) -> PlayerSlot | None:
        return self.white if color == "white" else self.black

    def color_of(self, user_id: int) -> str | None:
        if self.white and self.white.user_id == user_id:
            return "white"
        if self.black and self.black.user_id == user_id:
            return "black"
        return None

    def open_slot(self) -> str | None:
        if self.white is None:
            return "white"
        if self.black is None:
            return "black"
        return None

    def is_online(self, color: str) -> bool:
        return any(c.color == color for c in self.connections)

    def live_clocks(self) -> dict[str, float]:
        c = dict(self.clocks_ms)
        if self.status == GameStatus.active.value and self._last_tick:
            elapsed = (time.monotonic() - self._last_tick) * 1000.0
            c[self.active_color] = max(0.0, c[self.active_color] - elapsed)
        return c

    # ── lifecycle ────────────────────────────────────────────────────
    def seat(self, color: str, slot: PlayerSlot) -> None:
        if color == "white":
            self.white = slot
        else:
            self.black = slot

    def maybe_start(self) -> bool:
        """Start the game once both seats are filled. Returns True if it just started."""
        if self.status == GameStatus.waiting.value and self.white and self.black:
            self.status = GameStatus.active.value
            self.active_color = "white"
            self._last_tick = time.monotonic()
            self._add_sys(f"{self.tc.name} {self.tc.id} · game started")
            return True
        return False

    def _add_sys(self, text: str) -> None:
        self.messages.append({"from": "sys", "text": text, "time": ""})
        self._trim_messages()

    def _trim_messages(self) -> None:
        if len(self.messages) > MAX_MESSAGES:
            self.messages = self.messages[-MAX_MESSAGES:]

    # ── moves ────────────────────────────────────────────────────────
    def apply_move(self, color: str, uci: str) -> str:
        """Validate + apply a move for `color`. Returns SAN. Raises ValueError."""
        if self.status != GameStatus.active.value:
            raise ValueError("Game is not active")
        if color != self.active_color:
            raise ValueError("Not your turn")
        # commit the time spent by the mover, then add the increment
        now = time.monotonic()
        elapsed = (now - self._last_tick) * 1000.0
        self.clocks_ms[color] = max(0.0, self.clocks_ms[color] - elapsed)

        san = ce.push_uci(self.board, uci)  # raises ValueError if illegal

        self.clocks_ms[color] += self.tc.inc * 1000.0
        self.active_color = "black" if color == "white" else "white"
        self._last_tick = now
        self.draw_offer = None

        res, reason = ce.outcome(self.board)
        if res is not None:
            self._finish(res, reason or "game over")
        return san

    def flag(self, color: str) -> None:
        """`color` ran out of time."""
        if self.status != GameStatus.active.value:
            return
        winner = "black" if color == "white" else "white"
        # losing on time is a draw if the winner has insufficient mating material
        if self.board.has_insufficient_material(
            chess.WHITE if winner == "white" else chess.BLACK
        ):
            self._finish("draw", "timeout vs insufficient material")
        else:
            self._finish(winner, "on time")

    def resign(self, color: str) -> None:
        if self.status != GameStatus.active.value:
            return
        winner = "black" if color == "white" else "white"
        self._finish(winner, f"{color} resigned")

    def agree_draw(self) -> None:
        if self.status == GameStatus.active.value:
            self._finish("draw", "by agreement")

    def abort(self) -> None:
        if self.status != GameStatus.finished.value:
            self.status = GameStatus.finished.value
            self.result = None
            self.reason = "aborted"

    def _finish(self, result: str, reason: str) -> None:
        self.status = GameStatus.finished.value
        self.result = result
        self.reason = reason
        self.clocks_ms = self.live_clocks()  # freeze
        self._last_tick = 0.0
        self._add_sys(f"Game over · {reason}")

    # ── serialisation ────────────────────────────────────────────────
    def _player_json(self, color: str) -> dict | None:
        s = self.slot(color)
        if s is None:
            return None
        return {
            "userId": s.user_id,
            "name": s.name,
            "rating": s.rating,
            "color": color,
            "photoUrl": s.photo_url,
            "online": self.is_online(color),
        }

    def state_json(self, you_color: str = "spectator") -> dict:
        last = self.board.move_stack[-1].uci() if self.board.move_stack else None
        result_json = None
        if self.status == GameStatus.finished.value:
            result_json = {
                "result": self.result,           # "white"|"black"|"draw"|None(abort)
                "reason": self.reason,
                "winner": self.result if self.result in ("white", "black") else None,
                "whiteDelta": self.white_delta,
                "blackDelta": self.black_delta,
            }
        return {
            "type": "state",
            "you": {"color": you_color},
            "game": {
                "id": self.id,
                "tc": {"id": self.tc.id, "base": self.tc.base, "inc": self.tc.inc,
                       "name": self.tc.name, "icon": self.tc.icon},
                "status": self.status,
                "players": {"white": self._player_json("white"), "black": self._player_json("black")},
                "fen": self.board.fen(),
                "sans": ce.san_list(self.board),
                "lastMove": last,
                "activeColor": self.active_color if self.status == GameStatus.active.value else None,
                "check": self.board.is_check(),
                "clocks": self.live_clocks(),
                "serverTs": time.time() * 1000.0,
                "result": result_json,
                "drawOffer": self.draw_offer,
                "messages": self.messages,
            },
        }

    def clock_json(self) -> dict:
        return {
            "type": "clock",
            "clocks": self.live_clocks(),
            "activeColor": self.active_color if self.status == GameStatus.active.value else None,
            "serverTs": time.time() * 1000.0,
        }

    # ── networking ───────────────────────────────────────────────────
    async def broadcast(self, message: dict) -> None:
        dead: list[Connection] = []
        for conn in list(self.connections):
            try:
                await conn.ws.send_json(message)
            except Exception:
                dead.append(conn)
        for d in dead:
            if d in self.connections:
                self.connections.remove(d)

    async def broadcast_state(self) -> None:
        # each connection may have a different `you` perspective
        for conn in list(self.connections):
            try:
                await conn.ws.send_json(self.state_json(conn.color))
            except Exception:
                if conn in self.connections:
                    self.connections.remove(conn)

    def add_message(self, color: str, text: str) -> dict:
        slot = self.slot(color)
        name = slot.name if slot else "?"
        msg = {
            "from": color, "name": name, "text": text[:200],
            "time": datetime.now(timezone.utc).strftime("%H:%M"),
        }
        self.messages.append(msg)
        self._trim_messages()
        return msg

    # ── server-side ticker (clock + flag detection) ──────────────────
    def ensure_ticker(self, manager: "GameManager") -> None:
        if self._ticker is None or self._ticker.done():
            self._ticker = asyncio.create_task(self._run_ticker(manager))

    async def _run_ticker(self, manager: "GameManager") -> None:
        last_broadcast = 0.0
        try:
            while True:
                await asyncio.sleep(TICK_INTERVAL)
                if self.status != GameStatus.active.value:
                    if self.status == GameStatus.finished.value:
                        break
                    continue
                live = self.live_clocks()
                if live[self.active_color] <= 0:
                    async with self._lock:
                        self.flag(self.active_color)
                    await manager.on_game_finished(self)
                    await self.broadcast_state()
                    break
                now = time.monotonic()
                if now - last_broadcast >= CLOCK_BROADCAST_INTERVAL:
                    last_broadcast = now
                    await self.broadcast(self.clock_json())
        except asyncio.CancelledError:  # pragma: no cover
            pass
        except Exception:
            log.error("Clock ticker crashed (game_id=%s)", self.id, exc_info=True)


class GameManager:
    def __init__(self) -> None:
        self.rooms: dict[str, GameRoom] = {}
        # one waiting connection per time-control id, for quick matchmaking
        self._queue: dict[str, tuple[Connection, PlayerSlot]] = {}
        self._queue_lock = asyncio.Lock()

    # ── room access ─────────────────────────────────────────────────
    def get(self, game_id: str) -> GameRoom | None:
        return self.rooms.get(game_id)

    def create_room(self, game_id: str, tc: TimeControl) -> GameRoom:
        room = GameRoom(id=game_id, tc=tc)
        self.rooms[game_id] = room
        return room

    # ── DB-backed creation ──────────────────────────────────────────
    async def create_friend_game(self, creator: PlayerSlot, tc_id: str) -> GameRoom:
        tc = get_tc(tc_id)
        gid = new_game_id()
        async with SessionLocal() as session:
            game = Game(id=gid, tc_id=tc.id, base_seconds=tc.base, increment=tc.inc,
                        white_id=creator.user_id, status=GameStatus.waiting)
            session.add(game)
            await session.commit()
        room = self.create_room(gid, tc)
        room.seat("white", creator)
        return room

    async def create_matched_game(self, a: PlayerSlot, b: PlayerSlot, tc: TimeControl) -> GameRoom:
        gid = new_game_id()
        # random colors
        white, black = (a, b) if secrets.randbelow(2) == 0 else (b, a)
        async with SessionLocal() as session:
            game = Game(id=gid, tc_id=tc.id, base_seconds=tc.base, increment=tc.inc,
                        white_id=white.user_id, black_id=black.user_id, status=GameStatus.active)
            session.add(game)
            await session.commit()
        room = self.create_room(gid, tc)
        room.seat("white", white)
        room.seat("black", black)
        room.maybe_start()
        return room

    # ── matchmaking ─────────────────────────────────────────────────
    async def enqueue(self, conn: Connection, slot: PlayerSlot, tc_id: str) -> GameRoom | None:
        """Add to the queue; if an opponent is waiting, create + return a game."""
        tc = get_tc(tc_id)
        async with self._queue_lock:
            waiting = self._queue.get(tc.id)
            if waiting and waiting[1].user_id != slot.user_id:
                self._queue.pop(tc.id, None)
                opp_conn, opp_slot = waiting
                room = await self.create_matched_game(slot, opp_slot, tc)
                # tell the waiting opponent
                opp_color = room.color_of(opp_slot.user_id)
                try:
                    await opp_conn.ws.send_json({"type": "matched", "gameId": room.id, "color": opp_color})
                except Exception:
                    pass
                return room
            self._queue[tc.id] = (conn, slot)
            return None

    async def dequeue(self, conn: Connection) -> None:
        async with self._queue_lock:
            for tc_id, (c, _slot) in list(self._queue.items()):
                if c is conn:
                    self._queue.pop(tc_id, None)

    # ── persistence on finish ───────────────────────────────────────
    async def on_game_finished(self, room: GameRoom) -> None:
        if room.status != GameStatus.finished.value:
            return
        async with SessionLocal() as session:
            game = await session.get(Game, room.id)
            if game is None:
                return
            if game.status == GameStatus.finished:
                return  # already persisted (idempotent)

            game.status = GameStatus.finished
            game.moves_san = " ".join(ce.san_list(room.board))
            game.fen = room.board.fen()
            game.finished_at = datetime.now(timezone.utc)
            game.result_reason = room.reason

            if room.result == "white":
                game.result = GameResult.white
            elif room.result == "black":
                game.result = GameResult.black
            elif room.result == "draw":
                game.result = GameResult.draw
            else:
                game.result = GameResult.aborted

            # ratings (only for real, started games with two players)
            if room.white and room.black and game.result in (
                GameResult.white, GameResult.black, GameResult.draw
            ):
                w = await session.get(User, room.white.user_id)
                b = await session.get(User, room.black.user_id)
                if w and b:
                    if game.result == GameResult.white:
                        sw, sb = 1.0, 0.0
                    elif game.result == GameResult.black:
                        sw, sb = 0.0, 1.0
                    else:
                        sw, sb = 0.5, 0.5
                    dw = elo_delta(w.rating, b.rating, sw)
                    db_ = elo_delta(b.rating, w.rating, sb)
                    room.white_delta, room.black_delta = dw, db_
                    game.white_delta, game.black_delta = dw, db_
                    w.rating += dw
                    b.rating += db_
                    _apply_record(w, sw)
                    _apply_record(b, sb)
            await session.commit()


def _apply_record(user: User, score: float) -> None:
    if score == 1.0:
        user.wins += 1
        user.streak += 1
    elif score == 0.0:
        user.losses += 1
        user.streak = 0
    else:
        user.draws += 1
        user.streak = 0


# module-level singleton
manager = GameManager()
