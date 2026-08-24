"""Telegram bot (aiogram 3.x).

Responsibilities:
  * /start — greet the user and give them a button that opens the Mini App.
  * Set the chat "menu button" to launch the Mini App too.
  * Handle classic deep links (t.me/bot?start=<game_id>) by opening the app
    on that game — the modern t.me/bot/app?startapp=<id> link is handled by
    Telegram + the frontend directly.

The bot runs as a long-polling background task started from FastAPI's
lifespan (see main.py). If BOT_TOKEN is unset, the bot simply doesn't run and
the API/frontend still work in DEV_MODE.
"""
from __future__ import annotations

import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from .config import settings

log = logging.getLogger("chess.bot")


def _webapp_url(start_param: str | None = None) -> str:
    url = settings.webapp_url
    if start_param:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}startapp={start_param}"
    return url


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def on_start(message: Message, command: CommandObject):
        start_param = command.args  # e.g. a game id from t.me/bot?start=<id>
        url = _webapp_url(start_param)
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="♟ Play Chess", web_app=WebAppInfo(url=url))
        ]])
        if start_param:
            text = (
                "You've been invited to a game of chess! ♟\n\n"
                "Tap below to open the board and join."
            )
        else:
            text = (
                "<b>Chess</b> ♟\n\n"
                "Play live chess against a friend or a matched opponent — "
                "right inside Telegram. Tap below to start."
            )
        await message.answer(text, reply_markup=kb)

    @dp.message()
    async def fallback(message: Message):
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="♟ Open Chess", web_app=WebAppInfo(url=_webapp_url()))
        ]])
        await message.answer("Tap below to open the chess app.", reply_markup=kb)

    return dp


async def run_bot(stop_event) -> None:
    """Run the bot until `stop_event` is set. Safe to call only when a token exists."""
    bot = Bot(token=settings.bot_token,
              default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = build_dispatcher()

    # set the persistent menu button to launch the app
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Play", web_app=WebAppInfo(url=_webapp_url()))
        )
    except Exception as exc:  # non-fatal
        log.warning("Could not set menu button: %s", exc)

    log.info("Bot starting (long polling)…")
    try:
        # run polling concurrently; cancel when the app shuts down
        polling = dp.start_polling(bot, handle_signals=False)
        import asyncio
        poll_task = asyncio.create_task(polling)
        await stop_event.wait()
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass
    finally:
        await bot.session.close()
        log.info("Bot stopped.")
