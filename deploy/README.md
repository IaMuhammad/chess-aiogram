# Deployment

The app runs on **178.105.193.47** at **https://chess.iamuhammad.uz**, from
`/opt/projects/chess` on the server.

`http://chess.iamuhammad.uz` redirects to HTTPS. Telegram will not load a Mini App
over plain HTTP, so HTTPS is not optional here.

## How it fits together

```
Telegram  ──https──>  nginx :443  ──http──>  docker container :8000  (uvicorn)
                      (TLS, certbot)          FastAPI + aiogram bot + React dist
```

Everything is one container: the API, the WebSockets, the Telegram bot, and the
built React frontend (served same-origin, so the frontend uses relative `/api`
and `/ws` URLs and needs no build-time backend URL).

## Files on the server

| Path | What |
|---|---|
| `/opt/projects/chess/` | Project source + `docker-compose.yml` |
| `/opt/projects/chess/.env` | Production env, **holds the bot token**, mode `600`, not in git |
| `/etc/nginx/sites-available/chess` | Reverse proxy (certbot edits this) |
| `chess-data` volume | SQLite DB at `/data/chess.db` — survives rebuilds |
| `chess-logs` volume | `logs/back-error.logs`, `logs/front-error.logs` |

The DB lives in a Docker **volume**, not in the image, so rebuilding never drops
games or ratings. The compose project name comes from the directory basename
(`chess`), which is why the volumes stayed attached when the project moved from
`/opt/chess` to `/opt/projects/chess` — renaming that directory would orphan the
database.

## Redeploying after a code change

From the project root:

```bash
tar czf /tmp/chess.tar.gz --exclude='.venv' --exclude='node_modules' \
    --exclude='__pycache__' --exclude='*.db' --exclude='.env' \
    --exclude='frontend/dist' --exclude='frontend/.env' --exclude='frontend/.env.local' \
    app frontend main.py requirements.txt Dockerfile .dockerignore static
scp /tmp/chess.tar.gz root@178.105.193.47:/opt/projects/chess/
ssh root@178.105.193.47 'cd /opt/projects/chess && tar xzf chess.tar.gz && rm chess.tar.gz \
    && docker compose up -d --build'
```

Never upload the local `.env` — it would overwrite the production one (different
URLs, `DEV_MODE=true`).

## Operating it

```bash
ssh root@178.105.193.47
cd /opt/projects/chess
docker compose logs -f          # live logs
docker compose ps               # status + health
docker compose restart          # restart (e.g. after editing .env)
docker compose down             # stop
```

## Config notes

- **`DEV_MODE=false` in production, always.** `true` skips Telegram signature
  verification, which lets anyone impersonate any user.
- **One poller per bot token.** Production currently runs **@test123lkmbot**
  (a test bot — swap `BOT_TOKEN` in `/opt/projects/chess/.env` and restart to
  change it). aiogram long-polls, so running the same token locally *and* here
  makes the two steal each other's updates. Use a separate dev bot.
- The bot registers its own Mini App menu button on startup from `WEBAPP_URL`,
  so changing the domain means updating `WEBAPP_URL` + `CORS_ORIGINS` and
  restarting — no manual BotFather step needed for the button.
- Port 8000 is published on `127.0.0.1` only. Docker's port publishing writes
  its own iptables rules and bypasses ufw, so a `0.0.0.0` bind would expose
  plain HTTP on :8000 regardless of the firewall.

## TLS

certbot auto-renews via `certbot.timer` (verified with `certbot renew --dry-run`).
Renewal uses the HTTP-01 challenge over port 80 — keep port 80 open and nginx running.
Current cert expires 2026-10-14 and renews automatically.

## Changing the domain

1. Point an A record at `178.105.193.47`.
2. Update `server_name` in `deploy/nginx.conf`, upload to
   `/etc/nginx/sites-available/chess`, `nginx -t && systemctl reload nginx`.
3. `certbot --nginx -d new.domain --redirect`
   (and `certbot delete --cert-name old.domain` so renewals stop chasing it).
4. Update `WEBAPP_URL` and `CORS_ORIGINS` in `/opt/projects/chess/.env`.
5. `docker compose restart` — the bot re-registers the menu button on boot.
