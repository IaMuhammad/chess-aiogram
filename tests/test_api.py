"""FastAPI TestClient tests for the REST API (app/api.py)."""
from __future__ import annotations

from app import auth as auth_module
from app.game_manager import manager
from app.timecontrols import as_dicts, clock_presets_as_dicts

from conftest import dev_headers


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_get_config(client):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["devMode"] is True
    assert len(body["timeControls"]) > 0
    assert len(body["clockPresets"]) > 0


def test_me_without_auth_in_dev_mode_creates_guest(client):
    resp = client.get("/api/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rating"] == 1200
    assert body["wins"] == 0
    assert body["losses"] == 0
    assert body["draws"] == 0
    assert body["streak"] == 0


def test_me_same_dev_id_returns_same_user(client):
    r1 = client.get("/api/me", headers=dev_headers(42)).json()
    r2 = client.get("/api/me", headers=dev_headers(42)).json()
    assert r1["id"] == r2["id"]


def test_me_different_dev_ids_return_different_users(client):
    r1 = client.get("/api/me", headers=dev_headers(1)).json()
    r2 = client.get("/api/me", headers=dev_headers(2)).json()
    assert r1["id"] != r2["id"]


def test_timecontrols_endpoint_matches_module(client):
    resp = client.get("/api/timecontrols")
    assert resp.status_code == 200
    assert resp.json() == as_dicts()


def test_clock_presets_endpoint_matches_module(client):
    resp = client.get("/api/clock/presets")
    assert resp.status_code == 200
    assert resp.json() == clock_presets_as_dicts()


def test_create_friend_game(client):
    resp = client.post("/api/games/friend", json={"tc": "5+0"}, headers=dev_headers(10))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["color"] == "white"
    assert "inviteLink" in body
    assert body["tc"]["id"] == "5+0"

    game_id = body["gameId"]
    room = manager.get(game_id)
    assert room is not None
    assert room.white is not None
    assert room.black is None
    assert room.status == "waiting"


def test_get_game_info_for_waiting_friend_game(client):
    created = client.post("/api/games/friend", json={"tc": "10+0"}, headers=dev_headers(11)).json()
    game_id = created["gameId"]

    resp = client.get(f"/api/games/{game_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["openSlot"] == "black"
    assert body["players"]["white"] is not None
    assert body["players"]["black"] is None


def test_get_game_info_404_for_unknown_game(client):
    resp = client.get("/api/games/does-not-exist")
    assert resp.status_code == 404


def test_recent_games_empty_for_fresh_user(client):
    client.get("/api/me", headers=dev_headers(77))  # ensure user exists
    resp = client.get("/api/recent", headers=dev_headers(77))
    assert resp.status_code == 200
    assert resp.json() == []


def test_client_log_no_auth_required(client):
    resp = client.post("/api/client-log", json={"message": "boom"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_me_401_when_dev_mode_off_and_no_init_data(client, monkeypatch):
    monkeypatch.setattr(auth_module.settings, "dev_mode", False)
    try:
        resp = client.get("/api/me")
        assert resp.status_code == 401, resp.text
    finally:
        monkeypatch.setattr(auth_module.settings, "dev_mode", True)
