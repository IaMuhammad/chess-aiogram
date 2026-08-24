"""Database models: users and games."""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GameStatus(str, enum.Enum):
    waiting = "waiting"      # created, waiting for a second player (friend lobby / queue)
    active = "active"        # in progress
    finished = "finished"


class GameResult(str, enum.Enum):
    white = "white"          # white won
    black = "black"          # black won
    draw = "draw"
    aborted = "aborted"      # never started / cancelled


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Telegram user id (unique). For dev users we synthesise a negative id.
    tg_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(128), default="Player")
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    rating: Mapped[int] = mapped_column(Integer, default=1200)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    # current win streak (resets on loss/draw)
    streak: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    @property
    def display_name(self) -> str:
        return self.first_name or self.username or "Player"


class Game(Base):
    __tablename__ = "games"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # short shareable id
    status: Mapped[GameStatus] = mapped_column(Enum(GameStatus), default=GameStatus.waiting)
    result: Mapped[GameResult | None] = mapped_column(Enum(GameResult), nullable=True)
    # human readable, e.g. "by checkmate", "white resigned", "on time"
    result_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # time control
    tc_id: Mapped[str] = mapped_column(String(16), default="10+0")   # e.g. "5+0"
    base_seconds: Mapped[int] = mapped_column(Integer, default=600)
    increment: Mapped[int] = mapped_column(Integer, default=0)

    white_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    black_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # SAN move list joined by spaces, e.g. "e4 e5 Nf3"
    moves_san: Mapped[str] = mapped_column(Text, default="")
    # final position FEN (for reconnection / review)
    fen: Mapped[str] = mapped_column(Text, default="")

    # rating deltas applied at game end
    white_delta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    black_delta: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    white: Mapped[User | None] = relationship("User", foreign_keys=[white_id], lazy="joined")
    black: Mapped[User | None] = relationship("User", foreign_keys=[black_id], lazy="joined")

    @property
    def move_count(self) -> int:
        return len(self.moves_san.split()) if self.moves_san else 0
