"""Standard Elo rating updates."""
from __future__ import annotations

K_FACTOR = 24


def expected_score(rating: int, opponent: int) -> float:
    return 1.0 / (1.0 + 10 ** ((opponent - rating) / 400.0))


def elo_delta(rating: int, opponent: int, score: float) -> int:
    """score: 1.0 win, 0.5 draw, 0.0 loss. Returns the integer rating change."""
    delta = K_FACTOR * (score - expected_score(rating, opponent))
    return round(delta)
