"""Authoritative chess logic, backed by the `python-chess` library.

The server NEVER trusts the client for legality — every move is validated
here. The frontend has its own lightweight engine only for instant move-hint
dots; this module is the source of truth.
"""
from __future__ import annotations

import chess


class GameOver(Exception):
    """Raised internally when a terminal position is reached."""


def new_board() -> chess.Board:
    return chess.Board()


def board_from_fen(fen: str) -> chess.Board:
    return chess.Board(fen)


def parse_move(board: chess.Board, uci: str) -> chess.Move:
    """Parse a UCI move string (e.g. 'e2e4', 'e7e8q'). Raises ValueError if illegal."""
    try:
        move = chess.Move.from_uci(uci)
    except (ValueError, chess.InvalidMoveError) as exc:
        raise ValueError(f"Malformed move: {uci}") from exc
    if move not in board.legal_moves:
        raise ValueError(f"Illegal move: {uci}")
    return move


def push_uci(board: chess.Board, uci: str) -> str:
    """Validate + apply a UCI move, returning its SAN notation."""
    move = parse_move(board, uci)
    san = board.san(move)
    board.push(move)
    return san


def legal_moves_uci(board: chess.Board) -> list[str]:
    return [m.uci() for m in board.legal_moves]


def turn_color(board: chess.Board) -> str:
    return "white" if board.turn == chess.WHITE else "black"


def outcome(board: chess.Board) -> tuple[str | None, str | None]:
    """Return (result, reason) where result is 'white'|'black'|'draw'|None.

    None means the game is still going.
    """
    if not board.is_game_over(claim_draw=True):
        return None, None
    oc = board.outcome(claim_draw=True)
    if oc is None:
        return None, None
    reason_map = {
        chess.Termination.CHECKMATE: "by checkmate",
        chess.Termination.STALEMATE: "by stalemate",
        chess.Termination.INSUFFICIENT_MATERIAL: "insufficient material",
        chess.Termination.SEVENTYFIVE_MOVES: "75-move rule",
        chess.Termination.FIVEFOLD_REPETITION: "fivefold repetition",
        chess.Termination.FIFTY_MOVES: "fifty-move rule",
        chess.Termination.THREEFOLD_REPETITION: "threefold repetition",
        chess.Termination.VARIANT_WIN: "variant win",
        chess.Termination.VARIANT_LOSS: "variant loss",
        chess.Termination.VARIANT_DRAW: "variant draw",
    }
    reason = reason_map.get(oc.termination, "game over")
    if oc.winner is None:
        return "draw", reason
    return ("white" if oc.winner == chess.WHITE else "black"), reason


def is_check(board: chess.Board) -> bool:
    return board.is_check()


def san_list(board: chess.Board) -> list[str]:
    """Reconstruct the SAN list from a board's move stack."""
    temp = chess.Board()
    out: list[str] = []
    for move in board.move_stack:
        out.append(temp.san(move))
        temp.push(move)
    return out
