"""Application settings, loaded from environment / .env file.

Everything you need to change for your own deployment lives here. The only
*required* value is BOT_TOKEN (get one from @BotFather on Telegram).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Telegram ---------------------------------------------------------
    # Token from @BotFather. Required to run the bot; the API still works
    # without it (auth validation is skipped in dev mode — see DEV_MODE).
    bot_token: str = ""
    # The public https URL where the frontend (Mini App) is served. Used in
    # the "Open" button and friend-invite deep links. In local dev this is a
    # tunnel URL (ngrok / cloudflared). e.g. https://abc123.ngrok-free.app
    webapp_url: str = "https://frontend.jprq.live"
    # The bot username (without @) — used to build friend-invite links like
    # https://t.me/<bot_username>/<short_name>?startapp=<game_id>
    bot_username: str = ""
    # The Mini App short name configured in BotFather (/newapp). Optional.
    webapp_short_name: str = "play"

    # --- Server -----------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8000
    # Comma-separated list of allowed CORS origins for the frontend dev server.
    cors_origins: str = "https://frontend.jprq.live"

    # --- Database ---------------------------------------------------------
    database_url: str = "sqlite+aiosqlite:///./chess.db"

    # --- Behaviour --------------------------------------------------------
    # When True, Telegram initData signatures are NOT verified and a fake
    # local user is accepted. Lets you open the frontend in a normal browser
    # for development. NEVER enable in production.
    dev_mode: bool = True
    # Whether the bot should run (long-polling) inside the API process.
    run_bot: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
