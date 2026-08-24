# Architecture

How the system fits together: the moving parts, the data model, the lifecycle of a
game, and the clock model. Read this before diving into
[BACKEND.md](BACKEND.md) or [FRONTEND.md](FRONTEND.md).

---

## High-level picture

```
┌─────────────────────────────────────────────────────────────────┐
│ Telegram client (phone / desktop / web)                         │
│   └─ opens Mini App ─────────────────────────────────────────┐  │
└──────────────────────────────────────────────────────────────┼──┘
                                                                │
                          ┌─────────────────────────────────────▼─────────┐
                          │ Frontend — React + Vite (frontend/)           │
                          │   App.jsx  = state machine + socket wiring     │
                          │   chesslib = chess.js (client-side hints only) │
                          │   telegram = WebApp SDK wrapper                 │
                          └───────────┬───────────────────┬───────────────┘
                            REST /api │                   │ WS /ws
                                      ▼                   ▼
                          ┌───────────────────────────────────────────────┐
                          │ Backend — FastAPI (app/)                       │
                          │                                                │
                          │  api.py ──── REST: profile, recent, config,    │
                          │              create friend game, game info     │
                          │  ws.py  ──── /ws/game/{id}  live game socket    │
                          │              /ws/queue      matchmaking socket  │
                          │                                                │
                          │  game_manager.py ─ in-memory GameRoom registry │
                          │     ├─ board (python-chess)  authoritative      │
                          │     ├─ clocks, ticker (flag detection)          │
                          │     ├─ connections (players + spectators)       │
                          │     └─ matchmaking queue (one waiter per TC)    │
                          │                                                │
                          │  chess_engine.py ─ python-chess wrapper         │
                          │  auth.py ──────── Telegram initData HMAC verify │
                          │  rating.py ────── Elo (K=24)                    │
                          │  bot.py ───────── aiogram bot (long-polling)    │
                          │  models.py/db.py ─ SQLAlchemy async (users,     │
                          │                    games)                       │
                          └───────────┬───────────────────────────────────┘
                                      ▼
                          ┌───────────────────────────────────────────────┐
                          │ Database (SQLite by default, Postgres optional)│
                          │   users   — identity, rating, record           │
                          │   games   — finished-game history + deltas     │
                          └───────────────────────────────────────────────┘
```

One process runs the FastAPI app **and** the Telegram bot (the bot is launched as
a background task in the app's lifespan). In production the same process also
serves the built frontend, so the Mini App, REST, WebSockets, and bot all live on
**one port (8000)**.

---

## Source-of-truth principle

The **server owns the game**. The browser holds a copy of the position only to
render the board and show legal-move hints. Every move a player makes is:

1. Applied **optimistically** on the client for instant feedback.
2. Sent to the server over the game WebSocket.
3. Re-validated by `python-chess` on the server.
4. Either accepted (server broadcasts the new authoritative state) or rejected
   (server sends an `error`; the client reverts its optimistic position).

Because legality, turn order, clocks, results, and ratings are all decided
server-side, a modified client cannot cheat — the worst it can do is get its own
illegal move rejected.

---

## Component responsibilities

| Layer | Module | Responsibility |
|---|---|---|
| **Frontend** | `App.jsx` | Phase/navigation state machine, WebSocket lifecycle, optimistic moves, clock ticking |
| | `components/` | Pure presentational screens (home, lobby, matchmaking, game, board, UI atoms) |
| | `lib/chesslib.js` | Local move generation/validation via `chess.js` (hints + review only) |
| | `lib/api.js` | REST calls + WebSocket URL building + auth header/param injection |
| | `lib/telegram.js` | Telegram WebApp SDK wrapper (init, auth, haptics, share, confirm) |
| **Backend** | `api.py` | REST endpoints under `/api` |
| | `ws.py` | Game and queue WebSocket endpoints |
| | `game_manager.py` | `GameRoom` (live state, clocks, connections) + `GameManager` (registry + queue) |
| | `chess_engine.py` | Thin `python-chess` wrapper: parse/apply moves, SAN, legal moves, outcomes |
| | `auth.py` | Verify Telegram `initData`; create/fetch the `User` |
| | `rating.py` | Elo expected-score and delta |
| | `timecontrols.py` | The fixed set of time-control presets |
| | `bot.py` | aiogram bot: `/start`, deep links, menu button |
| | `models.py` / `db.py` | ORM models and async session/engine |
| | `config.py` | Env-driven `Settings` |

---

## Data model

Two tables (created automatically on startup; no migrations).

### `users`

Identity + lifetime stats. Created lazily the first time someone authenticates.

| Field | Type | Notes |
|---|---|---|
| `id` | int PK | internal id |
| `tg_id` | bigint, unique | Telegram user id (negative for dev/guest users) |
| `first_name`, `username`, `photo_url` | text | profile, refreshed on each login |
| `rating` | int | Elo, starts at **1200** |
| `wins`, `losses`, `draws`, `streak` | int | record; streak resets on non-win |
| `created_at` | datetime | |

### `games`

A persisted **finished** game (live games live only in memory until they end).

| Field | Type | Notes |
|---|---|---|
| `id` | str(8) PK | short shareable id, used in invite links |
| `status` | enum | `waiting` → `active` → `finished` |
| `result` | enum / null | `white` / `black` / `draw` / `aborted` |
| `result_reason` | text | e.g. "by checkmate", "white resigned", "on time" |
| `tc_id`, `base_seconds`, `increment` | str/int | time control |
| `white_id`, `black_id` | FK users | the two players |
| `moves_san` | text | space-separated SAN move list |
| `fen` | text | final position |
| `white_delta`, `black_delta` | int / null | rating change applied at finish |
| `created_at`, `finished_at` | datetime | |

See [BACKEND.md](BACKEND.md#database) for the full column reference.

---

## Game lifecycle

```
            create friend game            enqueue (both pick same TC)
                  │                                  │
                  ▼                                  ▼
        ┌──────────────────┐  match found  ┌──────────────────┐
        │  status=waiting  │──────────────▶│  status=active   │
        │  (one seat free) │  both seated  │  clocks running  │
        └──────────────────┘               └────────┬─────────┘
                  │                                  │
                  │ abort (nobody joined)            │  checkmate / stalemate /
                  ▼                                  │  resign / draw agreed /
        ┌──────────────────┐                         │  flag (time out)
        │ status=finished  │◀────────────────────────┘
        │ result=aborted   │   ┌──────────────────────────────┐
        └──────────────────┘   │ status=finished              │
                               │ result + reason + Elo deltas │
                               │ persisted to `games`,        │
                               │ users' ratings/record updated│
                               └──────────────────────────────┘
```

- A **friend game** is created via REST (`POST /api/games/friend`); the creator is
  seated as White and gets an invite link. The second player joins by opening the
  game socket.
- A **matched game** is created when two players are waiting on `/ws/queue` for the
  same time control; colors are random.
- Connecting to `/ws/game/{id}` seats you in an open color, or — if both seats are
  taken — makes you a **spectator**.
- When the game ends, `GameManager.on_game_finished()` persists the `Game` row and
  applies Elo deltas to both `users` in one commit.

---

## Clock model

Clocks are **server-authoritative**:

- Each room keeps `clocks_ms = {white, black}` and the `active_color`.
- A background ticker runs every **0.25 s** (`TICK_INTERVAL`). It computes elapsed
  time for the active player and, if their clock reaches 0, calls `flag()` to end
  the game on time.
- Every **1 s** (`CLOCK_BROADCAST_INTERVAL`) the server sends a lightweight
  `clock` message (`{clocks, activeColor, serverTs}`) so clients stay in sync.
- The full `state` message (sent on join and after every move/event) also carries
  the clocks and a `serverTs` timestamp.
- The **client** ticks down locally (re-rendering ~every 120 ms) from the last
  server snapshot, so the displayed clock is smooth without spamming the network.
  The server's value always wins on the next snapshot.

Increment is added to a player's clock after they complete a move.

---

## Authentication flow

```
Telegram client ─▶ Mini App receives signed `initData`
                        │
   REST: header  X-Init-Data: <initData>   (or ?initData= on WS)
   dev:  header  X-Dev-Id:   <random id>   (or ?dev_id= on WS)
                        ▼
   auth.parse_tg_user()  ── HMAC-SHA256 verify against BOT_TOKEN,
                            reject if older than 24h
                        ▼
   auth.resolve_user()  ── valid → real TgUser
                            invalid + DEV_MODE → synthetic guest (negative tg_id)
                            invalid + prod     → PermissionError (401 / WS close)
                        ▼
   get_or_create_user() ── upsert into `users`, refresh profile fields
```

In **dev mode** (`DEV_MODE=true`) signature verification is skipped and each
browser is handed a stable random guest id (kept in `localStorage`), which is how
you can play against yourself in two windows. Never enable dev mode in production.

See [BACKEND.md](BACKEND.md#authentication-appauthpy) and
[API_REFERENCE.md](API_REFERENCE.md#authentication) for details.

---

## Known limits & scaling notes

- **Live games are in-memory.** A backend restart ends games in progress (finished
  games and ratings are already saved). For horizontal scaling you'd move room
  state into a shared store (e.g. Redis) and use a pub/sub fan-out instead of the
  in-process `connections` list.
- **Matchmaking** keeps at most one waiting player per time control and pairs the
  next two who pick the same one — simple FIFO, no rating bands.
- **No Alembic migrations** — `init_db()` calls `create_all()`. Schema changes need
  manual handling on an existing database.
- **SQLite by default.** Fine for a single instance; switch `DATABASE_URL` to
  Postgres (`postgresql+asyncpg://…`) for durability/concurrency.
