# Documentation

Full documentation for **Chess — Telegram Mini App**, a 2-player live chess game
that runs inside Telegram (FastAPI + aiogram backend, React/Vite frontend,
server-authoritative `python-chess` rules synced over WebSockets).

## Where to start

| If you are a… | Read |
|---|---|
| **Player** who just wants to play | [User Guide](USER_GUIDE.md) |
| **Operator** deploying the app | [How to run & deploy](../HOW_TO_RUN.md) |
| **Engineer** wanting the big picture | [Architecture](ARCHITECTURE.md) |
| **Backend developer** | [Backend Reference](BACKEND.md) |
| **Frontend developer** | [Frontend Reference](FRONTEND.md) |
| **API consumer** (REST + WebSocket) | [API Reference](API_REFERENCE.md) |

## The 30-second tour

```
Telegram client ──opens──▶ React Mini App (frontend/)
                                │
                  REST (/api)   │   WebSocket (/ws)
                                ▼
                         FastAPI backend (app/)
                          ├─ api.py          REST endpoints
                          ├─ ws.py           live game + matchmaking sockets
                          ├─ game_manager.py in-memory rooms, clocks, queue
                          ├─ chess_engine.py python-chess (rules, SAN, results)
                          ├─ auth.py         Telegram initData verification
                          ├─ rating.py       Elo
                          ├─ bot.py          aiogram bot (/start, deep links)
                          └─ models.py/db.py SQLAlchemy (users, games)
```

The **server is the single source of truth**. The client validates moves locally
only to give instant feedback (legal-move dots, optimistic piece movement); the
server re-validates every move with `python-chess`, so a tampered client cannot
cheat.

## Document map

- **[USER_GUIDE.md](USER_GUIDE.md)** — playing the game: starting, inviting a
  friend, matchmaking, the board, clocks, chat, draws/resign, ratings.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the pieces fit together, the data
  model, game lifecycle, clock model, and known limits.
- **[BACKEND.md](BACKEND.md)** — every module, class, and important function;
  configuration; database; rating math; the bot.
- **[FRONTEND.md](FRONTEND.md)** — component tree, state, screen flow, the
  client libraries, Telegram SDK usage, build/dev.
- **[API_REFERENCE.md](API_REFERENCE.md)** — exact REST endpoints and WebSocket
  message types with request/response shapes.
- **[../README.md](../README.md)** — short project overview + quick start.
- **[../HOW_TO_RUN.md](../HOW_TO_RUN.md)** — step-by-step local run + deployment
  (Docker, hosting platforms, VPS).
