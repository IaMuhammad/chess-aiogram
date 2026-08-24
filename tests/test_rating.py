"""Unit tests for app.rating — the Elo implementation."""
from __future__ import annotations

from app.rating import K_FACTOR, elo_delta, expected_score


def test_expected_score_equal_ratings_is_half():
    assert expected_score(1200, 1200) == 0.5


def test_expected_score_higher_for_stronger_side():
    strong = expected_score(1400, 1200)
    weak = expected_score(1200, 1400)
    assert strong > 0.5 > weak, (strong, weak)
    assert round(strong + weak, 6) == 1.0


def test_elo_delta_win_against_equal_is_positive():
    assert elo_delta(1200, 1200, 1.0) > 0


def test_elo_delta_loss_against_equal_is_negative():
    assert elo_delta(1200, 1200, 0.0) < 0


def test_elo_delta_draw_between_equals_is_zero():
    assert elo_delta(1200, 1200, 0.5) == 0


def test_elo_delta_k_factor_is_24():
    assert K_FACTOR == 24


def test_elo_delta_exact_values_equal_ratings():
    # expected_score(1200, 1200) == 0.5, so delta = 24 * (score - 0.5)
    assert elo_delta(1200, 1200, 1.0) == 12
    assert elo_delta(1200, 1200, 0.0) == -12
    assert elo_delta(1200, 1200, 0.5) == 0


def test_elo_delta_exact_values_unequal_ratings():
    # expected_score(1200, 1400) = 1 / (1 + 10**(200/400)) ~= 0.24025307335
    exp = expected_score(1200, 1400)
    assert round(exp, 6) == 0.240253, exp
    # win as the underdog gives a bigger-than-K/2 boost
    assert elo_delta(1200, 1400, 1.0) == round(24 * (1.0 - exp))
    assert elo_delta(1200, 1400, 1.0) == 18
    # loss as the favourite costs close to a full K
    assert elo_delta(1400, 1200, 0.0) == round(24 * (0.0 - (1 - exp)))
    assert elo_delta(1400, 1200, 0.0) == -18
