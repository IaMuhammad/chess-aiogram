"""Telegram Mini App authentication.

A Mini App receives `initData` — a signed query string proving which Telegram
user opened it. We verify the HMAC signature exactly as documented at
https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
and extract the user. In DEV_MODE we skip verification so you can open the app
in a normal browser (optionally passing ?dev_id=<n> to simulate distinct users).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import User

# initData older than this is rejected (replay protection).
MAX_AUTH_AGE_SECONDS = 24 * 60 * 60


@dataclass
class TgUser:
    tg_id: int
    first_name: str
    username: str | None = None
    photo_url: str | None = None


def _verify_signature(init_data: str) -> dict | None:
    """Return the parsed initData fields if the signature is valid, else None."""
    if not init_data or not settings.bot_token:
        return None
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        return None

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        return None

    # replay protection
    auth_date = int(pairs.get("auth_date", "0") or "0")
    if auth_date and time.time() - auth_date > MAX_AUTH_AGE_SECONDS:
        return None
    return pairs


def parse_tg_user(init_data: str) -> TgUser | None:
    """Verify initData and extract the Telegram user, or None if invalid."""
    pairs = _verify_signature(init_data)
    if pairs is None:
        return None
    raw_user = pairs.get("user")
    if not raw_user:
        return None
    try:
        u = json.loads(raw_user)
    except json.JSONDecodeError:
        return None
    return TgUser(
        tg_id=int(u["id"]),
        first_name=u.get("first_name") or u.get("username") or "Player",
        username=u.get("username"),
        photo_url=u.get("photo_url"),
    )


def resolve_user(init_data: str, dev_id: int | None) -> TgUser:
    """Resolve the calling user from initData, falling back to a dev user.

    Raises PermissionError if initData is invalid and we're not in dev mode.
    """
    tg = parse_tg_user(init_data)
    if tg is not None:
        return tg
    if settings.dev_mode:
        # Synthesise a stable local user. dev_id lets two browser tabs be two
        # different players. Negative ids never collide with real Telegram ids.
        did = dev_id if dev_id is not None else 1
        return TgUser(tg_id=-abs(int(did)), first_name=f"Guest {abs(int(did))}", username=None)
    raise PermissionError("Invalid Telegram authentication data")


async def get_or_create_user(session: AsyncSession, tg: TgUser) -> User:
    res = await session.execute(select(User).where(User.tg_id == tg.tg_id))
    user = res.scalar_one_or_none()
    if user is None:
        user = User(
            tg_id=tg.tg_id,
            first_name=tg.first_name,
            username=tg.username,
            photo_url=tg.photo_url,
        )
        session.add(user)
        try:
            await session.commit()
            await session.refresh(user)
        except IntegrityError:
            # concurrent first request for the same new user (e.g. /me and
            # /recent fired together) — another commit won the insert race.
            await session.rollback()
            res = await session.execute(select(User).where(User.tg_id == tg.tg_id))
            user = res.scalar_one()
    else:
        # keep profile fresh
        changed = False
        if tg.first_name and user.first_name != tg.first_name:
            user.first_name, changed = tg.first_name, True
        if tg.username and user.username != tg.username:
            user.username, changed = tg.username, True
        if tg.photo_url and user.photo_url != tg.photo_url:
            user.photo_url, changed = tg.photo_url, True
        if changed:
            await session.commit()
    return user
