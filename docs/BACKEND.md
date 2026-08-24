# Backend Reference

The Python backend: FastAPI app + aiogram bot + WebSocket live sync, with
`python-chess` as the rules authority and async SQLAlchemy for persistence.

- **Runtime:** Python ≥ 3.12
- **Entry point:** `main.py` → `app.main:app`
- **Package:** everything under `app/`

> For exact request/response shapes see [API_REFERENCE.md](API_REFERENCE.md). For
> the big picture see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Dependencies

| Package | Purpose |
|---|---|
| `fastapi` (≥0.115) | web framework |
| `uvicorn[standard]` (≥0.32) | ASGI server |
| `aiogram` (≥3.13) | Telegram bot |
| `chess` / python-chess (≥1.11) | move legality, SAN, game outcomes |
| `sqlalchemy[asyncio]` (≥2.0) | async ORM |
| `aiosqlite` (≥0.20) | async SQLite driver |
| `pydantic` (≥2.9) / `pydantic-settings` (≥2.5) | models + env settings |

Install with `uv pip install -r requirements.txt` (or `uv pip install -e .`).

---

## Running

```bash
python main.py                          # dev entry point (reads .env)
uvicorn app.main:app --reload           # with autoreload
uvicorn app.main:app --host 0.0.0.0 --port 8000   # production-ish
```

`main.py` simply calls `uvicorn.run("app.main:app", host=settings.host,
port=settings.port, reload=False)`.

---

## Application wiring (`app/main.py`)

Creates the FastAPI app and:

- **Lifespan startup:** `await init_db()` (create tables); if `RUN_BOT` and a
  `BOT_TOKEN` are set, launch `run_bot(stop_event)` as a background asyncio task.
- **Lifespan shutdown:** signal the bot's `stop_event` and await it (with a timeout,
  then cancel).
- **CORS middleware:** allows `settings.cors_origin_list`.
- **Global exception handler:** logs unhandled errors to `logs/back-error.logs`.
- **Routers:** `api_router` (`/api/*`, plus `/health`) and `ws_router` (`/ws/*`).
- **Static serving (production):** if `frontend/dist/` exists, serve the built SPA
  — assets plus an `index.html` fallback for client-side routes. Otherwise `/`
  returns a short dev message pointing at `/docs`.

---

## Configuration (`app/config.py`)

`Settings(BaseSettings)` reads from environment / `.env`. Access the cached
singleton via `from app.config import settings` (backed by
`get_settings()` with `lru_cache`).

| Env var | Attribute | Default | Purpose |
|---|---|---|---|
| `BOT_TOKEN` | `bot_token` | `""` | Telegram bot token; empty ⇒ bot not started |
| `BOT_USERNAME` | `bot_username` | `""` | bot username (no `@`) for invite deep links |
| `WEBAPP_SHORT_NAME` | `webapp_short_name` | `play` | Mini App short name from BotFather |
| `WEBAPP_URL` | `webapp_url` | `http://localhost:5173` | public HTTPS URL of the frontend |
| `HOST` | `host` | `0.0.0.0` | bind address |
| `PORT` | `port` | `8000` | bind port |
| `CORS_ORIGINS` | `cors_origins` | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated allowed origins |
| `DATABASE_URL` | `database_url` | `sqlite+aiosqlite:///./chess.db` | async SQLAlchemy URL |
| `DEV_MODE` | `dev_mode` | `true` | skip Telegram signature check; allow guest users |
| `RUN_BOT` | `run_bot` | `true` | launch the bot in-process |

`cors_origin_list` is a property that splits `cors_origins` on commas.

> **Production:** set `DEV_MODE=false`, a real `BOT_TOKEN`, and `WEBAPP_URL` to your
> HTTPS domain. See [.env.example](../.env.example) and
> [HOW_TO_RUN.md](../HOW_TO_RUN.md).

---

## Database (`app/db.py`, `app/models.py`)

Async SQLAlchemy 2.0. `db.py` exposes:

- `engine` — `AsyncEngine` from `settings.database_url`.
- `SessionLocal` — `async_sessionmaker` for request-scoped sessions.
- `Base` — `DeclarativeBase`.
- `init_db()` — `create_all()` at startup (no Alembic).
- `get_session()` — FastAPI dependency yielding an `AsyncSession`.

Swap databases purely via `DATABASE_URL`, e.g.
`postgresql+asyncpg://user:pass@host/db` (add `asyncpg` to deps).

### `User` (table `users`)

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | Integer PK | auto | |
| `tg_id` | BigInteger, unique, indexed | — | Telegram id; negative for dev/guest |
| `first_name` | String(128) | `"Player"` | |
| `username` | String(64), nullable | — | |
| `photo_url` | String(512), nullable | — | |
| `rating` | Integer | `1200` | Elo |
| `wins` / `losses` / `draws` | Integer | `0` | |
| `streak` | Integer | `0` | consecutive wins; resets otherwise |
| `created_at` | DateTime(tz) | now (UTC) | |

`display_name` → `first_name` or `username` or `"Player"`.

### `Game` (table `games`)

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | String(16) PK | — | 8-char shareable id |
| `status` | Enum `GameStatus` | `waiting` | `waiting` / `active` / `finished` |
| `result` | Enum `GameResult`, nullable | — | `white` / `black` / `draw` / `aborted` |
| `result_reason` | String(64), nullable | — | human-readable |
| `tc_id` | String(16) | `"10+0"` | |
| `base_seconds` | Integer | `600` | |
| `increment` | Integer | `0` | |
| `white_id` / `black_id` | FK→users.id, nullable | — | `white` / `black` relationships, lazy-joined |
| `moves_san` | Text | `""` | space-separated SAN |
| `fen` | Text | `""` | final position |
| `white_delta` / `black_delta` | Integer, nullable | — | rating change at finish |
| `created_at` | DateTime(tz) | now | |
| `finished_at` | DateTime(tz), nullable | — | |

`move_count` → number of SAN tokens in `moves_san`.

```python
class GameStatus(str, Enum):  waiting / active / finished
class GameResult(str, Enum):  white / black / draw / aborted
```

---

## REST API (`app/api.py`)

Mounted under `/api` (plus a top-level `/health` and `/`). Full shapes in
[API_REFERENCE.md](API_REFERENCE.md#rest-api).

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/client-log` | none | record a browser error to `logs/front-error.logs` |
| `GET /api/config` | none | dev flag, bot username, short name, time controls |
| `GET /api/me` | required | current user's profile + record |
| `GET /api/timecontrols` | none | list of time-control presets |
| `GET /api/recent` | required | user's 10 most recent finished games |
| `POST /api/games/friend` | required | create a friend game (creator = white), returns invite link |
| `GET /api/games/{game_id}` | none | live or persisted game info |
| `GET /health` | none | `{"ok": true}` |
| `GET /` | none | SPA in prod, dev message otherwise |

### The `current_user` dependency

Authenticated endpoints depend on `current_user`, which:

1. Reads `initData` from header `X-Init-Data` **or** query `initData`, and a dev id
   from header `X-Dev-Id` **or** query `dev_id`.
2. Calls `auth.resolve_user(init_data, dev_id)`.
3. Upserts and returns the `User`, or raises `HTTPException(401)`.

---

## WebSockets (`app/ws.py`)

Two endpoints; both authenticate via **query params** (`?initData=…` or
`?dev_id=…`) using `_authenticate_ws()`, which returns a `PlayerSlot(user_id, name,
rating, photo_url)` or closes the socket.

### `GET /ws/game/{game_id}` — live game

The room socket for both players and spectators. On connect you're seated in the
open color, or marked spectator if the game is full. The server broadcasts a full
`state` after every change and a periodic `clock` tick.

**Client → server** messages: `move` (`{uci}`), `chat` (`{text}`, trimmed, stored
truncated to 200 chars), `resign`, `offer_draw`, `accept_draw`, `decline_draw`.

**Server → client** messages: `state` (full game), `clock` (periodic), `error`.

### `GET /ws/queue` — matchmaking

Connect with `?tc=<id>&initData=…`. If someone is already waiting for that time
control you're matched immediately; otherwise you wait. Server sends `searching`
then `matched` (`{gameId, color}`), or `error`.

See [API_REFERENCE.md](API_REFERENCE.md#websocket-api) for every payload.

---

## Game manager (`app/game_manager.py`)

In-memory rooms and the matchmaking queue. Tunables at the top of the module:

```python
CLOCK_BROADCAST_INTERVAL = 1.0   # seconds between clock pushes
TICK_INTERVAL            = 0.25  # ticker granularity (flag detection)
MAX_MESSAGES             = 80    # chat scrollback kept per room
```

`new_game_id()` returns an 8-char URL-safe id (with `-`/`_` replaced) used as the
game id and in invite links.

### `GameRoom`

Holds the authoritative `python-chess` board plus everything about a live game:
seats (`white`/`black` `PlayerSlot`s), `status`, `result`/`reason`, rating deltas,
`clocks_ms`, `active_color`, `draw_offer`, `messages`, and `connections`. A
`_lock` (asyncio) serializes move application; a `_ticker` task drives the clocks.

Key methods:

| Method | Purpose |
|---|---|
| `open_slot()` | next free color or `None` |
| `seat(color, slot)` / `color_of(user_id)` | seating / lookup |
| `maybe_start()` | flips to `active` when both seats filled |
| `apply_move(color, uci) -> san` | validate + apply; deduct/increment clock; raises `ValueError` if illegal/out of turn |
| `flag(color)` / `resign(color)` / `agree_draw()` / `abort()` | end-of-game transitions |
| `state_json(you_color)` / `clock_json()` | serialize for the socket |
| `broadcast()` / `broadcast_state()` | fan-out to all connections |
| `add_message(color, text)` | append chat (text stored truncated to 200) |
| `ensure_ticker(manager)` | start the background clock task |

### `GameManager` (singleton `manager`)

Registry of rooms (`rooms: dict[id, GameRoom]`) plus the queue
(`_queue: dict[tc_id, (Connection, PlayerSlot)]`).

| Method | Purpose |
|---|---|
| `get(id)` / `create_room(id, tc)` | room lookup / creation |
| `create_friend_game(creator, tc_id)` | create + persist a friend game (creator = white) |
| `create_matched_game(a, b, tc)` | create + persist a matched game (random colors) |
| `enqueue(conn, slot, tc_id)` | add to queue; returns a room if it matches an existing waiter |
| `dequeue(conn)` | remove from queue |
| `on_game_finished(room)` | persist the `Game`, compute + apply Elo deltas in one commit |

---

## Chess engine (`app/chess_engine.py`)

Thin wrapper over `python-chess`. The server is the rules authority.

| Function | Returns |
|---|---|
| `new_board()` / `board_from_fen(fen)` | a `chess.Board` |
| `parse_move(board, uci)` | a `chess.Move`; raises `ValueError` if illegal |
| `push_uci(board, uci)` | applies the move, returns **SAN**; raises on illegal |
| `legal_moves_uci(board)` | list of legal moves in UCI |
| `turn_color(board)` | `"white"` / `"black"` |
| `outcome(board)` | `(result, reason)` — result is `white`/`black`/`draw`/`None`; reason like "by checkmate", "by stalemate", "fivefold repetition", "fifty-move rule"… |
| `is_check(board)` | bool |
| `san_list(board)` | full move list in SAN from the move stack |

---

## Authentication (`app/auth.py`)

Implements the standard Telegram Mini App `initData` check.

- `MAX_AUTH_AGE_SECONDS = 24*60*60` — `initData` older than 24 h is rejected
  (replay protection).
- `TgUser` dataclass: `tg_id`, `first_name`, `username?`, `photo_url?`.
- `_verify_signature(init_data)` — parse the query string, pull out `hash`, build
  the data-check-string from the remaining sorted fields, compute HMAC-SHA256 with
  a secret key derived from `BOT_TOKEN`, compare, and check `auth_date` freshness.
- `parse_tg_user(init_data)` — verified `TgUser` or `None`.
- `resolve_user(init_data, dev_id)` — real user if valid; else a stable synthetic
  guest (negative `tg_id`) when `DEV_MODE=true`; else `PermissionError`.
- `get_or_create_user(session, tg)` — upsert into `users`, refreshing
  `first_name`/`username`/`photo_url`; handles concurrent-insert races. New users
  start at rating 1200 with a zeroed record.

---

## Rating (`app/rating.py`)

Standard Elo, `K_FACTOR = 24`.

```python
expected_score(rating, opponent) = 1 / (1 + 10 ** ((opponent - rating) / 400))
elo_delta(rating, opponent, score) = round(K * (score - expected_score(...)))
# score: 1.0 win, 0.5 draw, 0.0 loss
```

Deltas are computed in `GameManager.on_game_finished()`, applied to both players'
`rating`, and stored on the game as `white_delta` / `black_delta`.

---

## Time controls (`app/timecontrols.py`)

`TimeControl(id, base, inc, name, icon)`. Fixed presets:

| id | base (s) | inc (s) | name | icon |
|---|---|---|---|---|
| `1+0` | 60 | 0 | Bullet | bolt |
| `3+2` | 180 | 2 | Blitz | bolt |
| `5+0` | 300 | 0 | Blitz | bolt |
| `10+0` | 600 | 0 | Rapid | clock |
| `15+10` | 900 | 10 | Rapid | clock |
| `30+0` | 1800 | 0 | Classical | rabbit |

`get_tc(id)` returns the preset (defaults to `10+0` if unknown); `as_dicts()`
serializes them all.

---

## Telegram bot (`app/bot.py`)

aiogram 3.x, **long-polling**, started as a background task by the app lifespan.

- `/start` **with** a `start_param` (a game id from a deep link) → invite message +
  an "Open" button that launches the Mini App at `WEBAPP_URL?startapp=<param>`.
- `/start` **without** a param → greeting + Open button.
- **Menu button** set to a persistent "Play" button opening the Mini App (failure
  is logged, non-fatal).
- **Fallback** handler → suggests opening the app.
- `run_bot(stop_event)` builds the bot + dispatcher, sets the menu button, polls
  until `stop_event` is set, then closes the session.

---

## Logging (`app/logging_setup.py`)

Two rotating error logs (2 MB × 5 backups) under `logs/`:

| File | Level | Source |
|---|---|---|
| `logs/back-error.logs` | ERROR+ | backend (FastAPI, bot, DB) via the global handler |
| `logs/front-error.logs` | INFO+ | browser errors posted to `POST /api/client-log` (`frontend_logger`) |

`setup_logging()` is called on startup and installs the handlers idempotently.

---

## Tests

`tests/test_e2e.py` is an end-to-end smoke test: it starts a game, joins as two
players over the WebSocket, plays Fool's mate, and asserts move validation, SAN,
clocks, checkmate detection, and rating updates.

```bash
# terminal 1 — a throwaway server
DATABASE_URL="sqlite+aiosqlite:///./test.db" DEV_MODE=true RUN_BOT=false \
  .venv/bin/uvicorn app.main:app --port 8078

# terminal 2
.venv/bin/python tests/test_e2e.py
```
