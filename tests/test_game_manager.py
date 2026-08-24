"""Tests for app.game_manager — pure GameRoom logic + GameManager persistence.

No HTTP/WS involved here; GameRoom/PlayerSlot are constructed directly. DB
fixtures (from conftest.py) are used only where persistence is exercised.
"""
from __future__ import annotations

import time

import chess
import pytest
from sqlalchemy import select

from app.db import SessionLocal
from app.game_manager import GameManager, GameRoom, PlayerSlot, manager
from app.models import GameStatus, User
from app.timecontrols import get_tc


def make_room(tc_id: str = "10+0", game_id: str = "room1") -> GameRoom:
    return GameRoom(id=game_id, tc=get_tc(tc_id))


def test_seat_and_open_slot():
    room = make_room()
    assert room.open_slot() == "white"
    room.seat("white", PlayerSlot(user_id=1, name="A", rating=1200))
    assert room.open_slot() == "black"
    room.seat("black", PlayerSlot(user_id=2, name="B", rating=1200))
    assert room.open_slot() is None


def test_maybe_start_flips_status_once():
    room = make_room()
    room.seat("white", PlayerSlot(user_id=1, name="A", rating=1200))
    assert room.maybe_start() is False  # only one seat filled
    assert room.status == GameStatus.waiting.value

    room.seat("black", PlayerSlot(user_id=2, name="B", rating=1200))
    assert room.maybe_start() is True
    assert room.status == GameStatus.active.value
    assert room.maybe_start() is False  # already started


def _seated_active_room(tc_id: str = "10+0") -> GameRoom:
    room = make_room(tc_id)
    room.seat("white", PlayerSlot(user_id=1, name="A", rating=1200))
    room.seat("black", PlayerSlot(user_id=2, name="B", rating=1200))
    room.maybe_start()
    return room


def test_apply_move_rejected_when_not_active():
    room = make_room()
    room.seat("white", PlayerSlot(user_id=1, name="A", rating=1200))
    with pytest.raises(ValueError, match="Game is not active"):
        room.apply_move("white", "e2e4")


def test_apply_move_rejected_wrong_turn():
    room = _seated_active_room()
    with pytest.raises(ValueError, match="Not your turn"):
        room.apply_move("black", "e7e5")


def test_apply_move_applies_increment():
    room = _seated_active_room("3+2")  # base 180s, inc 2s
    before = room.clocks_ms["white"]
    room.apply_move("white", "e2e4")
    after = room.clocks_ms["white"]
    # elapsed time is subtracted then +2000ms increment added; net should be
    # very close to +2000ms since almost no wall time passed in-test.
    assert after > before, (before, after)
    assert after <= before + 2000, (before, after)
    assert after > before + 1900, (before, after)  # allow generous test slack


def test_apply_move_flips_active_color():
    room = _seated_active_room()
    assert room.active_color == "white"
    room.apply_move("white", "e2e4")
    assert room.active_color == "black"
    room.apply_move("black", "e7e5")
    assert room.active_color == "white"


def test_fools_mate_finishes_game():
    room = _seated_active_room()
    for color, uci in [("white", "f2f3"), ("black", "e7e5"),
                        ("white", "g2g4"), ("black", "d8h4")]:
        room.apply_move(color, uci)
    assert room.status == GameStatus.finished.value
    assert room.result == "black"
    assert room.reason == "by checkmate"


def test_flag_ends_game_on_time():
    room = _seated_active_room()
    room.apply_move("white", "e2e4")  # black to move
    room.flag("black")
    assert room.status == GameStatus.finished.value
    assert room.result == "white"
    assert room.reason == "on time"


def test_flag_insufficient_material_is_draw():
    room = make_room()
    room.seat("white", PlayerSlot(user_id=1, name="A", rating=1200))
    room.seat("black", PlayerSlot(user_id=2, name="B", rating=1200))
    room.maybe_start()
    # bare kings only: neither side can ever deliver mate
    room.board = chess.Board("8/8/4k3/8/8/4K3/8/8 w - - 0 1")
    room.active_color = "white"
    room.flag("white")  # white flags; black would "win" but has no mating material
    assert room.status == GameStatus.finished.value
    assert room.result == "draw"
    assert "insufficient material" in room.reason, room.reason


def test_resign_ends_game_for_opponent():
    room = _seated_active_room()
    room.resign("white")
    assert room.status == GameStatus.finished.value
    assert room.result == "black"
    assert "resigned" in room.reason, room.reason


def test_agree_draw_only_when_active():
    room = _seated_active_room()
    room.agree_draw()
    assert room.status == GameStatus.finished.value
    assert room.result == "draw"

    # calling again after finished must not raise / not re-finish differently
    room.reason = "by agreement"
    room.agree_draw()
    assert room.reason == "by agreement"  # unchanged, no-op since not active


def test_state_json_shape():
    room = _seated_active_room()
    state = room.state_json("white")
    game = state["game"]
    assert game["id"] == room.id
    assert game["tc"]["id"] == room.tc.id
    assert game["status"] == "active"
    assert game["players"]["white"]["userId"] == 1
    assert game["players"]["black"]["userId"] == 2
    assert game["fen"] == room.board.fen()
    assert game["sans"] == []
    assert game["lastMove"] is None
    assert game["activeColor"] == "white"
    assert game["check"] is False
    assert "white" in game["clocks"] and "black" in game["clocks"]
    assert game["result"] is None

    room.apply_move("white", "e2e4")
    state2 = room.state_json("black")
    assert state2["game"]["sans"] == ["e4"]
    assert state2["game"]["lastMove"] == "e2e4"


def test_state_json_result_present_only_when_finished():
    room = _seated_active_room()
    room.resign("black")
    state = room.state_json("white")
    result = state["game"]["result"]
    assert result is not None
    assert result["winner"] == "white"
    assert result["reason"].endswith("resigned")


def test_game_manager_create_room_and_get():
    gm = GameManager()
    tc = get_tc("5+0")
    room = gm.create_room("abc123", tc)
    assert gm.get("abc123") is room
    assert gm.get("does-not-exist") is None


# ── persistence: GameManager.on_game_finished ───────────────────────────

async def _make_user(session, tg_id: int, rating: int = 1200) -> User:
    user = User(tg_id=tg_id, first_name=f"User{tg_id}", rating=rating)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_on_game_finished_persists_ratings_and_record():
    async with SessionLocal() as session:
        white_user = await _make_user(session, tg_id=-101, rating=1200)
        black_user = await _make_user(session, tg_id=-102, rating=1200)
        white_id, black_id = white_user.id, black_user.id

    slot_w = PlayerSlot(user_id=white_id, name="W", rating=1200)
    slot_b = PlayerSlot(user_id=black_id, name="B", rating=1200)

    room = await manager.create_friend_game(slot_w, "10+0")
    room.seat("black", slot_b)
    room.maybe_start()

    for color, uci in [("white", "f2f3"), ("black", "e7e5"),
                        ("white", "g2g4"), ("black", "d8h4")]:
        room.apply_move(color, uci)
    assert room.status == GameStatus.finished.value

    await manager.on_game_finished(room)

    async with SessionLocal() as session:
        w = await session.get(User, white_id)
        b = await session.get(User, black_id)
        assert w.losses == 1, w.losses
        assert w.streak == 0
        assert w.rating < 1200, w.rating
        assert b.wins == 1, b.wins
        assert b.streak == 1
        assert b.rating > 1200, b.rating


@pytest.mark.asyncio
async def test_on_game_finished_is_idempotent():
    async with SessionLocal() as session:
        white_user = await _make_user(session, tg_id=-201, rating=1200)
        black_user = await _make_user(session, tg_id=-202, rating=1200)
        white_id, black_id = white_user.id, black_user.id

    slot_w = PlayerSlot(user_id=white_id, name="W", rating=1200)
    slot_b = PlayerSlot(user_id=black_id, name="B", rating=1200)

    room = await manager.create_friend_game(slot_w, "10+0")
    room.seat("black", slot_b)
    room.maybe_start()
    room.resign("white")

    await manager.on_game_finished(room)
    async with SessionLocal() as session:
        b_after_first = (await session.get(User, black_id)).rating

    await manager.on_game_finished(room)  # should be a no-op the 2nd time
    async with SessionLocal() as session:
        b_after_second = (await session.get(User, black_id)).rating

    assert b_after_first == b_after_second, (b_after_first, b_after_second)
