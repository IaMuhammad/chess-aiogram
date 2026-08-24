// Client-side chess helpers (chess.js). Used ONLY for instant UI feedback —
// legal-move dots, selection, optimistic rendering. The server (python-chess)
// is the authority; anything illegal is rejected there.
import { Chess } from 'chess.js'

const FILES = 'abcdefgh'

// chess.js board() → our 'wp'-style 8x8 (r=0 is rank 8 / top, c=0 is file a).
export function boardFromFen(fen) {
  const game = new Chess(fen)
  return game.board().map((row) =>
    row.map((cell) => (cell ? cell.color + cell.type : null))
  )
}

// [r,c] (r=0 top) → algebraic square like "e4"
export function rcToSquare(r, c) {
  return FILES[c] + (8 - r)
}

// "e4" → [r,c]
export function squareToRc(sq) {
  const c = FILES.indexOf(sq[0])
  const r = 8 - parseInt(sq[1], 10)
  return [r, c]
}

// Legal moves from a square, in the design's shape.
export function legalMovesFrom(fen, r, c) {
  const game = new Chess(fen)
  const from = rcToSquare(r, c)
  let moves
  try {
    moves = game.moves({ square: from, verbose: true })
  } catch {
    return []
  }
  return moves.map((m) => ({
    to: squareToRc(m.to),
    from: [r, c],
    uci: m.from + m.to + (m.promotion || ''),
    promotion: m.promotion || null,
    capture: m.flags.includes('c') || m.flags.includes('e'),
  }))
}

export function turnColor(fen) {
  return new Chess(fen).turn() === 'w' ? 'white' : 'black'
}

// King square [r,c] for a color, or null.
export function kingSquare(fen, color) {
  const board = boardFromFen(fen)
  const target = (color === 'white' ? 'w' : 'b') + 'k'
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) if (board[r][c] === target) return [r, c]
  return null
}

// Replay a SAN list up to `ply` half-moves. Returns { fen, lastMove } where
// lastMove is {from:[r,c], to:[r,c]} of the move that produced this position
// (or null at the start). Used by the review scrubber.
export function positionAtPly(sans, ply) {
  const game = new Chess()
  let lastMove = null
  for (let i = 0; i < ply && i < sans.length; i++) {
    try {
      const m = game.move(sans[i])
      lastMove = { from: squareToRc(m.from), to: squareToRc(m.to) }
    } catch {
      break
    }
  }
  return { fen: game.fen(), lastMove }
}

// Apply a UCI move to a FEN, returning the new FEN (for optimistic rendering).
// Returns null if illegal.
export function applyUci(fen, uci) {
  const game = new Chess(fen)
  const move = {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  }
  try {
    game.move(move)
    return game.fen()
  } catch {
    return null
  }
}
