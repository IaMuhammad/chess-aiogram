# API Reference

Complete reference for the backend's **REST** endpoints and **WebSocket** message
types. For how these are used, see [BACKEND.md](BACKEND.md) and
[FRONTEND.md](FRONTEND.md).

- **Base URL:** same origin as the app (e.g. `https://chess.example.com`). In dev,
  the Vite server proxies `/api`, `/ws`, and `/health` to the backend on `:8000`.
- **Content type:** JSON for all REST request/response bodies.

---

## Authentication

Every authenticated REST endpoint and both WebSockets identify the caller from
Telegram `initData` (production) or a dev id (browser testing).

| Transport | Telegram | Dev mode |
|---|---|---|
| **REST** | header `X-Init-Data: <initData>` (or `?initData=`) | header `X-Dev-Id: <id>` (or `?dev_id=`) |
| **WebSocket** | query `?initData=<initData>` | query `?dev_id=<id>` |

The server verifies `initData` with HMAC-SHA256 against `BOT_TOKEN` and rejects
data older than 24 hours. When `DEV_MODE=true`, an invalid/missing `initData` falls
back to a synthetic guest user (negative `tg_id`); when `DEV_MODE=false`, it's
rejected (`401` for REST, socket close for WebSockets). See
[ARCHITECTURE.md](ARCHITECTURE.md#authentication-flow).

---

## REST API

### `POST /api/client-log`

Record a browser-side error. **Auth:** none.

Request:
```json
{
  "message": "TypeError: x is undefined",
  "source": "https://app/.../main.js:10:5",
  "stack": "…",
  "url": "https://app/...",
  "userAgent": "Mozilla/5.0 …"
}
```
All fields except `message` are optional/nullable. Response: `{"ok": true}`.

---

### `GET /api/config`

App configuration. **Auth:** none.

Response:
```json
{
  "devMode": true,
  "botUsername": "MyChessBot",
  "webappShortName": "play",
  "timeControls": [
    { "id": "10+0", "base": 600, "inc": 0, "name": "Rapid", "icon": "clock" }
  ]
}
```

---

### `GET /api/me`

Current user's profile. **Auth:** required.

Response:
```json
{
  "id": 42,
  "name": "Alice",
  "rating": 1200,
  "wins": 3,
  "losses": 1,
  "draws": 0,
  "streak": 2,
  "photoUrl": "https://…/photo.jpg"
}
```
`photoUrl` may be `null`. `401` if authentication fails.

---

### `GET /api/timecontrols`

The available time-control presets. **Auth:** none.

Response:
```json
[
  { "id": "1+0",   "base": 60,   "inc": 0,  "name": "Bullet",    "icon": "bolt" },
  { "id": "3+2",   "base": 180,  "inc": 2,  "name": "Blitz",     "icon": "bolt" },
  { "id": "5+0",   "base": 300,  "inc": 0,  "name": "Blitz",     "icon": "bolt" },
  { "id": "10+0",  "base": 600,  "inc": 0,  "name": "Rapid",     "icon": "clock" },
  { "id": "15+10", "base": 900,  "inc": 10, "name": "Rapid",     "icon": "clock" },
  { "id": "30+0",  "base": 1800, "inc": 0,  "name": "Classical", "icon": "rabbit" }
]
```

---

### `GET /api/recent`

The user's 10 most recent finished games (newest first). **Auth:** required.

Response:
```json
[
  { "id": "Ab3xYz9q", "name": "Bob", "tc": "Blitz 5+0", "moves": 41, "result": "W" }
]
```
`result` is `"W"`, `"L"`, or `"D"` from the caller's perspective.

---

### `POST /api/games/friend`

Create a private friend game; the caller is seated as **white**. **Auth:** required.

Request:
```json
{ "tc": "10+0" }
```
`tc` is a time-control id (defaults to `10+0` if omitted/unknown).

Response:
```json
{
  "gameId": "Ab3xYz9q",
  "color": "white",
  "inviteLink": "https://t.me/MyChessBot/play?startapp=Ab3xYz9q",
  "tc": { "id": "10+0", "base": 600, "inc": 0, "name": "Rapid", "icon": "clock" }
}
```
Open `/ws/game/{gameId}` to enter the room and wait for the opponent.

---

### `GET /api/games/{game_id}`

Info about a game — the live room if present, otherwise the persisted record.
**Auth:** none.

Response:
```json
{
  "gameId": "Ab3xYz9q",
  "status": "waiting",
  "openSlot": "black",
  "tc": { "id": "10+0", "base": 600, "inc": 0, "name": "Rapid", "icon": "clock" },
  "players": {
    "white": {
      "id": 42, "name": "Alice", "rating": 1200,
      "wins": 3, "losses": 1, "draws": 0, "streak": 2, "photoUrl": null
    },
    "black": null
  },
  "inviteLink": "https://t.me/MyChessBot/play?startapp=Ab3xYz9q"
}
```
`status` ∈ `waiting`/`active`/`finished`; `openSlot` ∈ `white`/`black`/`null`; a
player entry is `null` when that seat is empty.

---

### `GET /health`

Liveness check. **Auth:** none. Response: `{"ok": true}`.

### `GET /`

In production (when `frontend/dist/` exists) serves the SPA; all unknown non-API
routes fall back to `index.html`. In dev, returns a short message pointing at
`/docs`.

---

## WebSocket API

Both sockets exchange **JSON text frames**. Connect with auth in the query string
(`?initData=…` or `?dev_id=…`).

---

### `GET /ws/game/{game_id}` — live game

Joins a game room as a player (seated in the open color) or, if both seats are
taken, as a **spectator**. The server pushes a full `state` on join and after every
change, plus a periodic `clock` tick. Spectators may receive state but cannot send
game actions.

#### Client → server

| `type` | Payload | Effect |
|---|---|---|
| `move` | `{ "uci": "e2e4" }` | Apply a move (UCI; promotions like `"e7e8q"`). Must be your color and a legal move, else an `error` is returned. Clock is deducted; increment added. |
| `chat` | `{ "text": "good luck" }` | Send a chat message (white/black only; trimmed; stored truncated to 200 chars; empty ignored). |
| `resign` | `{}` | Resign; opponent wins (`"<color> resigned"`). |
| `offer_draw` | `{}` | Offer a draw to the opponent. |
| `accept_draw` | `{}` | Accept the opponent's pending draw offer → draw "by agreement". |
| `decline_draw` | `{}` | Decline the opponent's pending draw offer. |

#### Server → client

**`state`** — full game state (on join, after each move, and on any change):
```json
{
  "type": "state",
  "you": { "color": "white" },
  "game": {
    "id": "Ab3xYz9q",
    "tc": { "id": "10+0", "base": 600, "inc": 0, "name": "Rapid", "icon": "clock" },
    "status": "active",
    "players": {
      "white": {
        "userId": 42, "name": "Alice", "rating": 1200, "color": "white",
        "photoUrl": null, "online": true
      },
      "black": { "userId": 43, "name": "Bob", "rating": 1190, "color": "black", "photoUrl": null, "online": true }
    },
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "sans": ["e4"],
    "lastMove": "e2e4",
    "activeColor": "black",
    "check": false,
    "clocks": { "white": 600000.0, "black": 600000.0 },
    "serverTs": 1733940000000.0,
    "result": null,
    "drawOffer": null,
    "messages": [
      { "from": "white", "name": "Alice", "text": "hi", "time": "14:03" },
      { "from": "sys",   "name": null,    "text": "Game started", "time": "" }
    ]
  }
}
```

Field notes:
- `you.color` — `white` / `black` / `spectator` (the recipient's seat).
- `clocks` — milliseconds remaining; `serverTs` — server time (ms epoch) the
  snapshot was taken, used by the client to interpolate the countdown.
- `activeColor` — whose clock is running (`null` when not active).
- A player entry is `null` while its seat is empty; `online` reflects an active
  socket.
- `result` is `null` until the game ends, then:
  ```json
  {
    "result": "white",          // "white"/"black"/"draw"/null(abort)
    "reason": "by checkmate",
    "winner": "white",          // "white"/"black"/null(draw)
    "whiteDelta": 12,
    "blackDelta": -12
  }
  ```
- `drawOffer` — `white`/`black`/`null` (which color currently has an offer out).
- `messages[].from` — `white`/`black`/`sys`; `time` is `HH:MM` (empty for system).

**`clock`** — lightweight periodic tick (~every 1 s while active):
```json
{
  "type": "clock",
  "clocks": { "white": 598200.0, "black": 600000.0 },
  "activeColor": "white",
  "serverTs": 1733940001800.0
}
```

**`error`** — on auth failure, illegal/out-of-turn move, etc.:
```json
{ "type": "error", "message": "Illegal move" }
```

---

### `GET /ws/queue` — matchmaking

Connect with `?tc=<id>&initData=…` (or `&dev_id=…`). If a player is already waiting
for the same time control, you're matched immediately and the socket closes;
otherwise you wait until someone is. Colors are assigned at random on match.

#### Client → server

Any text frame keeps the connection alive. Disconnect to leave the queue.

#### Server → client

**`searching`** — enqueued, no immediate match:
```json
{ "type": "searching", "tc": "10+0" }
```

**`matched`** — paired (immediately or when an opponent arrives); the socket then
closes. Open `/ws/game/{gameId}` to play:
```json
{ "type": "matched", "gameId": "Ab3xYz9q", "color": "white" }
```

**`error`** — authentication failed:
```json
{ "type": "error", "message": "Authentication failed" }
```

---

## Quick type glossary

- **UCI** — a move as `from`+`to` squares (+ promotion piece), e.g. `e2e4`,
  `e7e8q`. Used in `move` messages and `lastMove`.
- **SAN** — Standard Algebraic Notation, e.g. `Nf3`, `O-O`, `exd5+`. Used in
  `sans` and persisted `moves_san`.
- **FEN** — full board position string. Used in `state.game.fen` and the client's
  local board.
- **color** — `white` / `black` (and `spectator` for `you.color`).
- **tc id** — a time-control identifier like `10+0` (`base+increment`).
