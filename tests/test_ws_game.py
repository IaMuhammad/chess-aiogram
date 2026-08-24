"""WebSocket integration tests via starlette TestClient.websocket_connect.

Everything here runs single-threaded/synchronously (NOT via pytest-asyncio):
TestClient.websocket_connect() drives the ASGI app in a background thread and
is safe to nest multiple `with` blocks in one test, as long as each socket is
driven explicitly (send_json/receive_json) rather than awaited concurrently
from independent asyncio clients. See project memory: two concurrent
awaited-in-process WebSocket clients against TestClient can deadlock; nesting
`with` blocks and alternating sync calls does not.
"""
from __future__ import annotations

from app import auth as auth_module

from conftest import dev_headers


def recv_state(ws, want_plies=None, predicate=None, limit=60):
    """Loop receive_json() until a `state` message matches, skipping any
    interleaved clock-tick / other messages, and any *stale* `state` message
    already superseded by a later broadcast this same socket also queued
    (e.g. the room broadcasts to every connection on every state change, so a
    socket that triggered an update also gets its own copy of it)."""
    for _ in range(limit):
        msg = ws.receive_json()
        if msg.get("type") != "state":
            continue
        if want_plies is not None and len(msg["game"]["sans"]) != want_plies:
            continue
        if predicate is not None and not predicate(msg):
            continue
        return msg
    raise AssertionError("no expected state message received")


def create_friend_game(client, dev_id, tc="5+0") -> str:
    resp = client.post("/api/games/friend", json={"tc": tc}, headers=dev_headers(dev_id))
    assert resp.status_code == 200, resp.text
    return resp.json()["gameId"]


def test_full_two_player_game_fools_mate_and_chat(client):
    game_id = create_friend_game(client, 101)

    with client.websocket_connect(f"/ws/game/{game_id}?dev_id=101") as w1:
        s1 = recv_state(w1)
        assert s1["you"]["color"] == "white"
        assert s1["game"]["status"] == "waiting"

        with client.websocket_connect(f"/ws/game/{game_id}?dev_id=202") as w2:
            s2 = recv_state(w2)
            assert s2["you"]["color"] == "black"

            active = recv_state(w1, want_plies=0)
            assert active["game"]["status"] == "active"

            # illegal move rejected
            w1.send_json({"type": "move", "uci": "e2e5"})
            err = w1.receive_json()
            assert err["type"] == "error", err

            state = None
            moves = [(w1, "f2f3"), (w2, "e7e5"), (w1, "g2g4"), (w2, "d8h4")]
            for i, (w, uci) in enumerate(moves, start=1):
                w.send_json({"type": "move", "uci": uci})
                state = recv_state(w1, want_plies=i)

            game = state["game"]
            assert game["status"] == "finished", game
            assert game["result"]["winner"] == "black", game["result"]
            assert game["result"]["reason"] == "by checkmate"
            assert game["sans"][-1] == "Qh4#", game["sans"]
            assert game["result"]["whiteDelta"] < 0 < game["result"]["blackDelta"]

            # chat round trip
            w2.send_json({"type": "chat", "text": "gg"})
            chat_state = recv_state(
                w1, predicate=lambda m: any(x["text"] == "gg" for x in m["game"]["messages"])
            )
            assert any(m["text"] == "gg" for m in chat_state["game"]["messages"])

    recent = client.get("/api/recent", headers=dev_headers(202)).json()
    assert len(recent) == 1
    assert recent[0]["result"] == "W", recent


def test_resign_flow(client):
    game_id = create_friend_game(client, 111)

    with client.websocket_connect(f"/ws/game/{game_id}?dev_id=111") as w1:
        recv_state(w1)
        with client.websocket_connect(f"/ws/game/{game_id}?dev_id=222") as w2:
            recv_state(w2)
            recv_state(w1, want_plies=0)  # active

            w1.send_json({"type": "resign"})
            state = recv_state(w2, predicate=lambda m: m["game"]["status"] == "finished")
            game = state["game"]
            assert game["status"] == "finished"
            assert game["result"]["winner"] == "black"
            assert "resigned" in game["result"]["reason"], game["result"]


def test_draw_offer_accept_flow(client):
    game_id = create_friend_game(client, 131)

    with client.websocket_connect(f"/ws/game/{game_id}?dev_id=131") as w1:
        recv_state(w1)
        with client.websocket_connect(f"/ws/game/{game_id}?dev_id=232") as w2:
            recv_state(w2)
            recv_state(w1, want_plies=0)  # active

            w1.send_json({"type": "offer_draw"})
            offered = recv_state(w2, predicate=lambda m: m["game"]["drawOffer"] == "white")
            assert offered["game"]["drawOffer"] == "white"

            w2.send_json({"type": "accept_draw"})
            state = recv_state(w1, predicate=lambda m: m["game"]["status"] == "finished")
            game = state["game"]
            assert game["status"] == "finished"
            assert game["result"]["result"] == "draw"


def test_draw_offer_decline_does_not_finish_game(client):
    game_id = create_friend_game(client, 141)

    with client.websocket_connect(f"/ws/game/{game_id}?dev_id=141") as w1:
        recv_state(w1)
        with client.websocket_connect(f"/ws/game/{game_id}?dev_id=242") as w2:
            recv_state(w2)
            recv_state(w1, want_plies=0)  # active

            w1.send_json({"type": "offer_draw"})
            offered = recv_state(w2, predicate=lambda m: m["game"]["drawOffer"] == "white")
            assert offered["game"]["drawOffer"] == "white"

            w2.send_json({"type": "decline_draw"})
            state = recv_state(w1, predicate=lambda m: m["game"]["drawOffer"] is None)
            assert state["game"]["drawOffer"] is None
            assert state["game"]["status"] == "active"


def test_ws_auth_failure_when_dev_mode_off(client, monkeypatch):
    game_id = create_friend_game(client, 151)
    monkeypatch.setattr(auth_module.settings, "dev_mode", False)
    try:
        with client.websocket_connect(f"/ws/game/{game_id}?dev_id=999") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "error"
            assert "auth" in msg["message"].lower(), msg
    finally:
        monkeypatch.setattr(auth_module.settings, "dev_mode", True)


def test_ws_unknown_game_returns_error(client):
    with client.websocket_connect("/ws/game/does-not-exist?dev_id=161") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "not found" in msg["message"].lower(), msg


def test_ws_spectator_when_seats_full(client):
    game_id = create_friend_game(client, 171)

    with client.websocket_connect(f"/ws/game/{game_id}?dev_id=171") as w1:
        recv_state(w1)
        with client.websocket_connect(f"/ws/game/{game_id}?dev_id=272") as w2:
            recv_state(w2)
            recv_state(w1, want_plies=0)  # active

            with client.websocket_connect(f"/ws/game/{game_id}?dev_id=373") as w3:
                s3 = recv_state(w3)
                assert s3["you"]["color"] == "spectator", s3
