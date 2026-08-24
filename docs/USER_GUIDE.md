# User Guide — Playing Chess

This guide is for **players**. It walks through everything you can do in the app,
from opening it to finishing a game. No technical knowledge needed.

> Want to **run or host** the app instead of just playing it? See
> [How to run & deploy](../HOW_TO_RUN.md).

---

## Opening the game

There are two ways to start:

- **Inside Telegram (the normal way).** Open the chess bot, send `/start`, and tap
  the **♟ Play Chess** button (or use the bot's menu button). The game opens as a
  Mini App right inside Telegram and signs you in automatically using your Telegram
  account.
- **In a web browser (testing / local play).** If the app is running in development
  mode, just open its URL in a browser. Each browser window becomes a separate
  anonymous "guest" player — handy for playing against yourself in two windows.

When the app opens you land on the **Home** screen.

---

## The Home screen

The Home screen shows:

- **Your profile card** — your name, avatar, current **rating**, your win/loss
  record, and your current **streak**.
- **Time-control chips** — pick how fast the game is (see below). The selected one
  is highlighted.
- **Two buttons:**
  - **Play a friend** — create a private game and invite someone with a link.
  - **Find an opponent** — get matched with another player automatically.
- **Recent games** — your last games, showing the opponent, the time control, the
  number of moves, and whether you **W**on, **L**ost, or **D**rew.

### Time controls

Pick one before starting a game. The number is `base + increment`: the starting
clock in minutes, plus the seconds added to your clock after each move.

| Chip | Clock | Style |
|---|---|---|
| **1+0** | 1 min, no increment | Bullet |
| **3+2** | 3 min + 2 s/move | Blitz |
| **5+0** | 5 min, no increment | Blitz |
| **10+0** | 10 min, no increment | Rapid *(default)* |
| **15+10** | 15 min + 10 s/move | Rapid |
| **30+0** | 30 min, no increment | Classical |

---

## Starting a game

### Option A — Play a friend

1. On Home, choose a time control and tap **Play a friend**.
2. You land in a **lobby** showing *You* vs an empty opponent slot, plus an
   **invite link**.
3. Send the link to your friend:
   - **Copy link** copies it to your clipboard.
   - **Share** opens Telegram's share dialog (or your device's share sheet in a
     browser).
4. When your friend opens the link, they drop straight into the lobby. As soon as
   they're in, the game starts automatically. You play **White**; your friend plays
   **Black**.

> Invite links look like `https://t.me/<bot>/<app>?startapp=<gameId>`. Opening one
> joins that specific game.

### Option B — Find an opponent

1. On Home, choose a time control and tap **Find an opponent**.
2. The **matchmaking** screen shows a radar animation and a timer while it searches.
3. When someone else picks the **same time control**, you're matched instantly,
   colors are assigned at random, and the game begins.
4. Tap **Cancel** any time before a match is found to go back Home.

---

## Playing: the game screen

The game screen, top to bottom:

- **Header** — the time control (e.g. "10+0 Rapid") and a status line ("Your move",
  "White vs Black", or "Game over"). A back arrow exits.
- **Opponent row** — their avatar, name, rating, the pieces they've captured, and
  their clock. A green dot means they're online.
- **The board.**
- **Your row** — same details for you.
- **Moves / Chat panel** — switch tabs between the move list and chat.
- **Controls** — Flip board, Offer draw, Resign.

Your color is always shown at the **bottom**. The board flips automatically so your
pieces face you.

### Making a move

1. **Tap one of your pieces.** Its legal destinations appear as **dots** (a larger
   ring means a capture).
2. **Tap a destination.** The piece moves immediately.
3. **Promotion:** if a pawn reaches the last rank, a little menu pops up at that
   square — pick Queen, Rook, Knight, or Bishop.

You feel a light **haptic tap** when a move lands (in Telegram on a phone). You can
only move on your turn, and only legal moves are allowed — the server enforces the
rules.

### Clocks

Each player has a countdown clock. Only the player **to move** has their clock
running. Time added per move (the "increment") is applied after you move. Under 20
seconds the clock shows tenths of a second and turns into a warning color. If your
clock hits zero, you **lose on time** (flag).

### Captured pieces & material

Each player row shows the pieces you've captured and, if you're ahead in material,
a small **+N** advantage number.

---

## Chat

Tap the **Chat** tab to talk to your opponent during the game. Type a message and
send. Messages show whose turn it was sent and the time. There's a small unread
badge on the tab when new messages arrive while you're looking at the move list.
(Messages are limited in length.)

---

## Draws and resigning

In the controls row (while it's a live game):

- **Offer draw** — sends a draw offer. Your opponent sees a banner with **Accept**
  and **Decline**. If they accept, the game ends in a draw "by agreement".
- **Resign** — asks you to confirm, then ends the game; your opponent wins.

When the opponent offers *you* a draw, a banner appears above the board with
**Accept** / **Decline** buttons.

---

## When the game ends

A result sheet slides up showing:

- **Outcome** — "You won!", "You lost", or "Draw".
- **Reason** — e.g. checkmate, resignation, time, stalemate, or agreement.
- **Rating change** — your new rating and how much it moved (e.g. `1650 +15`).
- **Buttons:**
  - **Rematch** — start a fresh game with the same opponent and time control.
  - **Review** — step through the game move by move (see below).
  - **Home** — return to the Home screen.

### Reviewing a game

You can scrub through the moves at any time:

- Tap any move in the **Moves** list to jump to that position.
- Use the review bar's **Back / Forward** buttons to step one move at a time.
- Tap **Live** to jump back to the current position (in an ongoing game).

While reviewing you're just looking — the live game keeps going underneath.

---

## Ratings

Everyone starts at **1200**. After each decisive game your rating moves up or down
based on the **Elo** system: beating a higher-rated player gains you more; losing to
a lower-rated player costs you more. Draws nudge ratings toward each other. Your
record (wins / losses / draws) and **streak** (consecutive wins) update too.

---

## Spectating

If you open a game that's already full (both seats taken), you join as a
**spectator**: you see the board, clocks, moves, and result live, but you can't
move, chat, or offer draws.

---

## Tips & troubleshooting

| Situation | What's happening |
|---|---|
| "Not your turn" / a move snaps back | The server rejected an illegal or out-of-turn move — that's the rules being enforced. |
| "Game not found or has ended" | Live games live in the server's memory; if the server restarted, in-progress games end. Start a new one. (Finished games and ratings are saved.) |
| Blank screen when opening from Telegram | The app must be served over HTTPS and registered correctly with the bot — an operator issue, see [How to run](../HOW_TO_RUN.md). |
| Playing yourself for testing | Open the invite link in a second browser or an Incognito window so it counts as a different guest. |
