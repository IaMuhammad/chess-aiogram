# ♟ Chess — Telegram Mini App

A **2-player live chess game** that runs inside Telegram. Players open the app
from a Telegram bot, invite a friend (or get matched with someone), and play in
real time with synced moves, chess clocks, chat, and ratings.

- **Frontend:** React (Vite) — a faithful build of the dark-navy Telegram design.
- **Backend:** FastAPI + aiogram (the Telegram bot) + WebSockets for live sync.
- **Chess rules:** validated server-side with [`python-chess`](https://python-chess.readthedocs.io/) — the server is the single source of truth, so cheating by a tampered client is impossible.

> 📚 **Full documentation lives in [`docs/`](docs/README.md):**
> [User Guide](docs/USER_GUIDE.md) ·
> [Architecture](docs/ARCHITECTURE.md) ·
> [Backend](docs/BACKEND.md) ·
> [Frontend](docs/FRONTEND.md) ·
> [API Reference](docs/API_REFERENCE.md) ·
> [How to run & deploy](HOW_TO_RUN.md)

---

## What's in the box

| Feature | Where |
|---|---|
| Home: profile, rating, time-control presets, recent games | `frontend/src/components/screens.jsx` |
| Play a friend (shareable invite link / deep link) | friend flow in `App.jsx` + `app/api.py` |
| Find an opponent (matchmaking queue) | `/ws/queue` in `app/ws.py` |
| Live board: tap-to-move, legal-move dots, last-move & check highlights, promotion | `frontend/src/components/board.jsx` |
| Server-authoritative chess clocks (with increment, flag detection) | `app/game_manager.py` |
| Moves list (SAN) + review scrubber, in-game chat | `frontend/src/components/game.jsx` |
| Resign / offer draw / accept-decline, rematch | `App.jsx` ↔ `app/ws.py` |
| Elo ratings, win/loss/streak, game history | `app/rating.py`, `app/models.py` |
| Telegram bot: `/start`, "Open" button, invite deep links | `app/bot.py` |

---

## Project layout

```
chess-aiogram/
├── app/                  # Python backend
│   ├── main.py           # FastAPI app; starts the bot; serves the built frontend
│   ├── config.py         # settings (reads .env)
│   ├── bot.py            # aiogram Telegram bot
│   ├── api.py            # REST endpoints (/api/...)
│   ├── ws.py             # WebSocket endpoints (/ws/game, /ws/queue)
│   ├── game_manager.py   # live game rooms, clocks, matchmaking
│   ├── chess_engine.py   # python-chess wrapper (move validation, SAN, results)
│   ├── models.py         # database tables (users, games)
│   ├── auth.py           # Telegram initData verification
│   ├── rating.py         # Elo
│   └── timecontrols.py   # the time-control presets
├── frontend/             # React (Vite) Mini App
│   └── src/
│       ├── App.jsx               # the brain: state, WebSocket wiring
│       ├── components/           # ui, board, screens, game
│       └── lib/                  # telegram.js, api.js, chesslib.js
├── tests/test_e2e.py     # end-to-end smoke test (two players play to mate)
├── design_reference/     # the original design (CSS + extracted source modules)
├── main.py               # `python main.py` → runs everything
└── .env.example          # copy to .env and fill in
```

---

## Quick start (local development)

You need **Python 3.12+** and **Node 18+**. Dependencies are already installed in
`.venv` and `frontend/node_modules`; the commands below re-install them if needed.

### 1. Backend

```bash
# from the project root
cp .env.example .env            # then open .env (see "Telegram setup" below)

# (only if the venv is missing) create it and install deps:
#   uv venv && uv pip install -e .

# run the API + bot
.venv/bin/python main.py        # or: .venv/bin/uvicorn app.main:app --reload
```

The backend listens on **http://localhost:8000**.

> In development, `DEV_MODE=true` (the default in `.env.example`) lets you open the
> app in a **normal browser** without Telegram — handy for testing. Turn it off in
> production.

### 2. Frontend

```bash
cd frontend
npm install        # first time only
npm run dev        # http://localhost:5173
```

Open **http://localhost:5173** in your browser. The Vite dev server automatically
forwards `/api` and `/ws` calls to the backend on port 8000.

### 3. Play against yourself (testing)

Each browser gets its own random "guest" id, so:

1. Open the app in your normal window → click **Play a friend** → copy the invite link.
2. Open that link in a **second browser** (or an Incognito/Private window so it's a
   different guest) → the game starts automatically. Play!

You can also click **Find an opponent** in two windows to get matched.

---

## Telegram setup (to run it as a real Mini App)

1. **Create a bot:** message [@BotFather](https://t.me/BotFather) → `/newbot` →
   copy the **token** and note the **username**.
2. **Host the frontend over HTTPS.** Telegram requires HTTPS. For local testing,
   tunnel the Vite dev server:
   ```bash
   # example with cloudflared (or use ngrok)
   cloudflared tunnel --url http://localhost:5173
   ```
   Copy the `https://…` URL it prints.
3. **Register the Mini App:** in BotFather → `/newapp` → pick your bot → set the
   **Web App URL** to the HTTPS URL from step 2, and give it a short name
   (e.g. `play`).
4. **Fill in `.env`:**
   ```ini
   BOT_TOKEN=123456:ABC-your-token
   BOT_USERNAME=YourBotName
   WEBAPP_SHORT_NAME=play
   WEBAPP_URL=https://your-tunnel-url.example
   DEV_MODE=false
   ```
5. **Restart the backend** (`python main.py`). Open your bot in Telegram, send
   `/start`, and tap **♟ Play Chess**.

Friend invites use links like
`https://t.me/YourBotName/play?startapp=<gameId>` — opening one drops your friend
straight into the game.

---

## Production (single server)

Build the frontend once; FastAPI will then serve it directly (same origin, no
separate dev server, no proxy needed):

```bash
cd frontend && npm run build      # creates frontend/dist
cd .. && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Now everything — the Mini App, the API, the WebSockets, and the bot — runs from
**one process on port 8000**. Point `WEBAPP_URL` at your public HTTPS address and
put it behind a reverse proxy (nginx/Caddy) with TLS.

By default games are stored in a local SQLite file (`chess.db`). To use Postgres,
set `DATABASE_URL` in `.env` (e.g.
`postgresql+asyncpg://user:pass@host/db`) and `uv pip install asyncpg`.

---

## Run the end-to-end test

```bash
# terminal 1 — start a server on port 8078
DATABASE_URL="sqlite+aiosqlite:///./test.db" DEV_MODE=true RUN_BOT=false \
  .venv/bin/uvicorn app.main:app --port 8078

# terminal 2
.venv/bin/python tests/test_e2e.py
```

It creates a game, joins as two players, plays Fool's mate, and asserts move
validation, SAN, clocks, checkmate detection and rating updates.

---

## Notes & limits

- Live games live in server memory, so a backend restart ends games in progress
  (finished games and ratings are saved in the database). For horizontal scaling
  you'd move room state into Redis.
- The matchmaking queue pairs the next two players who pick the **same** time
  control.
- Chess piece glyphs use the *Noto Sans Symbols 2* web font; swap in an SVG piece
  set in `frontend/src/components/ui.jsx` if you want art-directed pieces.
