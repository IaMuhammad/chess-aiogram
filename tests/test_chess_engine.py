"""Unit tests for app.chess_engine — the authoritative move/legality layer."""
from __future__ import annotations

import chess
import pytest

from app import chess_engine as ce


def test_new_board_is_starting_position():
    board = ce.new_board()
    assert board.fen() == chess.STARTING_FEN
    assert ce.turn_color(board) == "white"


def test_push_uci_applies_legal_move_and_returns_san():
    board = ce.new_board()
    san = ce.push_uci(board, "e2e4")
    assert san == "e4", san
    assert board.piece_at(chess.E4) is not None
    assert ce.turn_color(board) == "black"


def test_push_uci_illegal_move_raises_value_error():
    board = ce.new_board()
    with pytest.raises(ValueError):
        ce.push_uci(board, "e2e5")  # not a legal pawn jump


def test_parse_move_malformed_uci_raises_value_error():
    board = ce.new_board()
    with pytest.raises(ValueError):
        ce.parse_move(board, "zz99")


def test_legal_moves_uci_starting_position_has_20_moves():
    board = ce.new_board()
    moves = ce.legal_moves_uci(board)
    assert len(moves) == 20, moves
    assert "e2e4" in moves
    assert "g1f3" in moves


def test_outcome_none_mid_game():
    board = ce.new_board()
    ce.push_uci(board, "e2e4")
    result, reason = ce.outcome(board)
    assert result is None
    assert reason is None


def test_outcome_detects_checkmate_fools_mate():
    board = ce.new_board()
    for uci in ["f2f3", "e7e5", "g2g4", "d8h4"]:
        ce.push_uci(board, uci)
    result, reason = ce.outcome(board)
    assert (result, reason) == ("black", "by checkmate"), (result, reason)
    assert ce.is_check(board) is True


def test_outcome_detects_stalemate():
    # Classic stalemate: black king a8, white king a6, white queen b6 — black
    # to move has no legal moves and is not in check.
    board = chess.Board("k7/8/1Q6/1K6/8/8/8/8 b - - 0 1")
    assert board.is_stalemate()
    result, reason = ce.outcome(board)
    assert (result, reason) == ("draw", "by stalemate"), (result, reason)


def test_is_check_true_and_false():
    board = ce.new_board()
    assert ce.is_check(board) is False
    for uci in ["f2f3", "e7e5", "g2g4", "d8h4"]:
        ce.push_uci(board, uci)
    assert ce.is_check(board) is True


def test_san_list_reconstructs_moves():
    board = ce.new_board()
    moves = ["e2e4", "e7e5", "g1f3", "b8c6"]
    for uci in moves:
        ce.push_uci(board, uci)
    assert ce.san_list(board) == ["e4", "e5", "Nf3", "Nc6"], ce.san_list(board)
