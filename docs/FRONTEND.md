# Frontend Reference

The Mini App UI: a **Vite + React 18** single-page app. It's a thin, reactive view
over server state — it renders the board, gives instant local feedback on moves,
and speaks REST + WebSocket to the backend. All authoritative game logic lives on
the server (see [ARCHITECTURE.md](ARCHITECTURE.md)).

- **Stack:** React 18.3, Vite 5.4, `chess.js` 1.0 (client-side hints/review only)
- **Location:** `frontend/`

---

## Project layout

```
frontend/
├── index.html              # loads Telegram SDK + fonts, mounts #root
├── vite.config.js          # dev server + /api,/ws,/health proxy
├── package.json
├── .env.example
└── src/
    ├── main.jsx            # entry: install error logging, render <App/>
    ├── App.jsx             # the brain: state machine, sockets, move flow, clocks
    ├── styles.css          # theme (CSS variables: --accent, --bg, --panel, …)
    ├── components/
    │   ├── screens.jsx     # HomeScreen, MatchmakingScreen, LobbyScreen, ResultSheet, TIME_CONTROLS
    │   ├── game.jsx        # GameScreen, PlayerRow, MovesList, ChatPanel
    │   ├── board.jsx       # BoardView — interactive 8×8 grid + promotion modal
    │   └── ui.jsx          # Icon, Avatar, TgHeader, Piece, fmtClock, computeCaptured
    └── lib/
        ├── api.js          # REST calls + WebSocket URL building + auth injection
        ├── chesslib.js     # chess.js wrapper (FEN ↔ board, legal moves, review)
        ├── telegram.js     # Telegram WebApp SDK wrapper
        └── logger.js       # global error capture → POST /api/client-log
```

---

## Build & dev

| Command | What it does |
|---|---|
| `npm install` | install deps (first time) |
| `npm run dev` | Vite dev server on `0.0.0.0:5173`, hot reload |
| `npm run build` | production build → `frontend/dist/` |
| `npm run preview` | serve the built `dist/` locally |

In **dev**, `vite.config.js` proxies API/socket traffic to the backend so the app
can use same-origin relative URLs:

- `/api/*` → `VITE_BACKEND_URL` (default `http://localhost:8000`)
- `/ws/*` → the `ws://` variant of that backend
- `/health` → backend

In **production**, you run `npm run build` and the FastAPI backend serves
`dist/` directly, so the Mini App, REST, and WebSockets share one origin.

### Environment variables (`frontend/.env`)

| Var | Purpose |
|---|---|
| `VITE_BACKEND_URL` | where the dev proxy forwards `/api`, `/ws`, `/health` (default `http://localhost:8000`) |
| `VITE_API_BASE` | optional absolute base for API/WS when the frontend is hosted **separately** from the backend; empty ⇒ same-origin relative URLs (the normal case) |
| `VITE_ALLOWED_HOSTS` | comma-separated hostnames the dev server accepts (for tunnels like cloudflared/ngrok); `*` allows any |

---

## Entry point

**`index.html`** loads the Telegram WebApp SDK
(`https://telegram.org/js/telegram-web-app.js`) and the *Noto Sans Symbols 2* font
(used for the ♚♛♜♝♞♟ piece glyphs), locks the viewport for a native feel, and
mounts React into `#root`.

**`main.jsx`** installs global error logging (`installErrorLogging()`), then
renders `<App/>` in `React.StrictMode`.

---

## App state machine (`App.jsx`)

`App.jsx` is the only stateful component. It drives a **phase** through the app:

```
loading → home ─┬─ (Play a friend) → lobby ──────────▶ game
                ├─ (Find opponent)  → match ──────────▶ game
                └─ (opened via deep link) → connecting ▶ game
                                                  └────▶ error (fatal)
```

| Phase | Screen |
|---|---|
| `loading` / `connecting` | spinner ("Loading…" / "Joining game…") |
| `home` | `HomeScreen` |
| `match` | `MatchmakingScreen` |
| `lobby` | `LobbyScreen` |
| `game` | `GameScreen` |
| `error` | fatal message + Reload |

It also holds: the user profile (`me`) and `recent` games; the selected time
control (`tc`, default `10+0`); the live `game` object and `youColor`; review state
(`viewPly`); board UI state (`sel`, `promo`, `flipped`); chat (`draft`,
`messages`); matchmaking/lobby state; and clock state (`clockBase` snapshot +
`forceTick` re-render driver). WebSocket handles live in refs (`wsRef`,
`queueRef`).

### Boot sequence (on mount)

1. `Telegram.init()` — expand the Mini App, set header/background colors, disable
   vertical swipes.
2. `loadProfile()` — `GET /api/me` + `GET /api/recent`.
3. If `Telegram.startParam()` returns a game id (opened from an invite/deep link)
   → phase `connecting`, open the game socket. Otherwise → `home`.

A `setInterval` (~120 ms) bumps `forceTick` so clocks count down smoothly between
server snapshots.

### Handling server messages

The game socket's `onmessage` dispatches on `type`:

- `state` → replace `game`, set `youColor` and board orientation, refresh the clock
  snapshot, and advance `connecting`/`lobby` → `game`.
- `clock` → update the clock snapshot (server-authoritative timing).
- `error` → a move was rejected; revert the optimistic FEN.

### Move flow

1. Tap a piece → `legalMovesFrom()` (chess.js) computes destinations (dots).
2. Tap a destination → if it's a promotion, open the promotion modal; otherwise
   `doMove(uci)`.
3. `doMove` applies the UCI to the current FEN **optimistically** (instant board
   update), fires a light haptic, and sends `{type:'move', uci}` over the socket.
4. The server replies with a fresh `state` (accepted) or `error` (reverted).

### Actions

| User action | Effect |
|---|---|
| Play a friend | `POST /api/games/friend?tc` → invite link → phase `lobby` + open game socket |
| Find an opponent | open `/ws/queue?tc=…`, await `{type:'matched', gameId}` → open game socket |
| Resign | `Telegram.confirm()` → send `{type:'resign'}` |
| Offer / accept / decline draw | send `offer_draw` / `accept_draw` / `decline_draw` |
| Chat | send `{type:'chat', text}` (input capped at 140 chars) |
| Flip board | toggle orientation |
| Review | `selectPly` / `stepPly` / `goLive` replay the SAN list locally |
| Rematch | create a new friend game with the same time control |
| Home | close sockets, reset game state, reload profile |

---

## Components

### `screens.jsx`

Exports the non-game screens and the shared `TIME_CONTROLS` constant (the same six
presets the backend defines — see [BACKEND.md](BACKEND.md#time-controls-apptimecontrolspy)).

- **`HomeScreen`** — profile card (avatar, name, rating, W/L, streak), time-control
  chips, "Play a friend" / "Find an opponent" buttons, recent-games list.
  Props: `me, tc, setTc, recent, onPlayFriend, onFindOpponent`.
- **`MatchmakingScreen`** — radar animation, elapsed timer, opponent reveal on
  match, Cancel. Props: `tc, elapsed, found, opponent, onCancel`.
- **`LobbyScreen`** — "You vs (waiting…)" comparison, invite link with Copy/Share,
  status text, disabled "Waiting…" button until the opponent joins.
  Props: `tc, link, joined, opponent, me, onCopy, onShare, onBack, toast`.
- **`ResultSheet`** — end-of-game overlay: outcome icon, title, reason, rating box,
  Rematch / Review / Home. Props: `result, title, reason, delta, newRating,
  onRematch, onHome, onReview`.

### `game.jsx`

- **`GameScreen`** — the in-game layout: header, opponent row, board, your row,
  draw-offer banner, review bar, Moves/Chat panel, controls. Presentational — all
  data and callbacks come from `App.jsx` via props.
- **`PlayerRow`** — avatar, name, rating, captured pieces, clock; "Waiting…" if the
  seat is empty; online dot.
- **`MovesList`** — numbered SAN grid; click to review that position.
- **`ChatPanel`** — scrollable messages grouped by sender + input form (`maxLength
  140`).

### `board.jsx`

**`BoardView`** — an 8×8 CSS grid. Renders piece glyphs, rank/file coordinates, and
highlights: last move, selected square, check (red), and legal-target dots (a
larger ring for captures). Includes the promotion modal (Q/R/N/B) positioned at the
target square. Coordinate convention: row 0 = rank 8 (top), col 0 = file a (left);
flipping reverses both axes. Props include `board, flipped, selected, legalTargets,
lastMove, checkSquare, interactive, onSquareTap, promo, onPromo, onPromoCancel`.

### `ui.jsx`

Reusable atoms and helpers:

- **`Piece`** / `pieceCSS` — Unicode glyph pieces with fill/stroke/shadow per color
  and style (`flat` / `d3`); `SOLID` glyph map; `PIECE_VALUE` material values.
- **`Icon`** — 24×24 stroke SVG icon set (back, close, copy, share, flip, flag,
  draw, send, search, clock, trophy, bolt, home, eye, …).
- **`Avatar`** — initials or photo, stable gradient per name, optional online dot.
- **`TgHeader`** — Telegram-style header (back button, title, subtitle, menu).
- **`fmtClock(ms)`** — `m:ss`, or `m:ss.t` (tenths) under 20 s.
- **`computeCaptured(board)`** — captured pieces per side + material advantage.

---

## Client libraries (`src/lib/`)

### `api.js`

REST + WebSocket client. `API_BASE = VITE_API_BASE` (trimmed of a trailing slash);
empty means same-origin relative URLs. Every request carries Telegram auth: header
`X-Init-Data` (in Telegram) or `X-Dev-Id` (browser dev), and the same as query
params on WebSocket URLs. The WS origin is derived from `API_BASE` (swapping
`http`→`ws`) or the page origin.

REST helpers cover: `GET /api/me`, `GET /api/recent`, `GET /api/config`,
`POST /api/games/friend`, `GET /api/games/:id`, `POST /api/client-log`. WebSocket
helpers build the `/ws/game/:id` and `/ws/queue` URLs. Exact shapes:
[API_REFERENCE.md](API_REFERENCE.md).

### `chesslib.js`

Wraps `chess.js` for **UI feedback only** (the server re-validates everything):

| Export | Purpose |
|---|---|
| `boardFromFen(fen)` | FEN → 8×8 array of `'wp'`-style strings |
| `rcToSquare(r,c)` / `squareToRc(sq)` | grid ↔ algebraic |
| `legalMovesFrom(fen,r,c)` | legal moves from a square (`{to, from, uci, promotion, capture}`) |
| `turnColor(fen)` | side to move |
| `kingSquare(fen,color)` | king square (for check highlight) |
| `positionAtPly(sans,ply)` | replay to move `ply` for review (`{fen, lastMove}`) |
| `applyUci(fen,uci)` | optimistic move application → new FEN or `null` |

### `telegram.js`

Wrapper over `window.Telegram.WebApp`:

| Member | Purpose |
|---|---|
| `available` / `raw` / `initData` | SDK presence, raw object, signed auth string |
| `devId()` | stable per-browser guest id (localStorage) for dev mode |
| `init()` | `ready()`, `expand()`, set colors, disable vertical swipes |
| `startParam()` | the `?startapp=…` launch parameter (a game id) |
| `user()` | `initDataUnsafe.user` or null |
| `authParams()` / `authHeaders()` | `initData=…`/`X-Init-Data` or `dev_id=…`/`X-Dev-Id` |
| `confirm(msg, cb)` | native confirm dialog (falls back to `window.confirm`) |
| `haptic(style)` | impact feedback (safely ignored if unavailable) |
| `shareGame(link, text)` | Telegram share (falls back to `navigator.share`) |

### `logger.js`

`installErrorLogging()` registers `window` `error` + `unhandledrejection` handlers
that POST to `/api/client-log` (`{message, source, stack, url, userAgent}`).
`reportError(error, context)` does the same for explicit try/catch reporting;
reporting failures are swallowed to avoid loops. These land in
`logs/front-error.logs` server-side.

---

## Screen flow recap

```
Open app
  ├─ deep link?  yes → connecting → game
  └─ no → home
            ├─ Play a friend → lobby → (friend joins) → game
            └─ Find opponent → match → (matched) → game
                                   game → (ends) → ResultSheet
                                           ├─ Rematch → game
                                           ├─ Review  → scrub moves
                                           └─ Home    → home
```
