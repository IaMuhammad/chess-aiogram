import { describe, it, expect } from 'vitest'
import {
  boardFromFen, rcToSquare, squareToRc, legalMovesFrom, turnColor,
  kingSquare, positionAtPly, applyUci,
} from './chesslib.js'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('boardFromFen', () => {
  it('produces an 8x8 array with the right piece placements', () => {
    const board = boardFromFen(START_FEN)
    expect(board).toHaveLength(8)
    board.forEach((row) => expect(row).toHaveLength(8))
    expect(board[0][0]).toBe('br') // a8 black rook
    expect(board[7][4]).toBe('wk') // e1 white king
    expect(board[0][4]).toBe('bk') // e8 black king
    expect(board[7][0]).toBe('wr') // a1 white rook
  })

  it('empty squares are null', () => {
    const board = boardFromFen(START_FEN)
    expect(board[3][3]).toBeNull()
    expect(board[4][4]).toBeNull()
  })
})

describe('rcToSquare / squareToRc', () => {
  it('rcToSquare converts corners correctly', () => {
    expect(rcToSquare(0, 0)).toBe('a8')
    expect(rcToSquare(7, 7)).toBe('h1')
  })

  it('squareToRc round-trips with rcToSquare', () => {
    const points = [[0, 0], [7, 7], [3, 4], [6, 1]]
    for (const [r, c] of points) {
      expect(squareToRc(rcToSquare(r, c))).toEqual([r, c])
    }
  })
})

describe('legalMovesFrom', () => {
  it('e2 pawn has e3 and e4 as legal, non-capture moves', () => {
    const moves = legalMovesFrom(START_FEN, 6, 4) // e2
    const uciList = moves.map((m) => m.uci)
    expect(uciList).toContain('e2e3')
    expect(uciList).toContain('e2e4')
    const e3 = moves.find((m) => m.uci === 'e2e3')
    const e4 = moves.find((m) => m.uci === 'e2e4')
    expect(e3.capture).toBe(false)
    expect(e4.capture).toBe(false)
  })

  it('returns [] for an empty square or a square with no legal moves for the side to move', () => {
    expect(legalMovesFrom(START_FEN, 4, 4)).toEqual([]) // empty e4
    expect(legalMovesFrom(START_FEN, 1, 4)).toEqual([]) // black pawn e7, not black's turn
  })
})

describe('turnColor', () => {
  it('start position is white to move', () => {
    expect(turnColor(START_FEN)).toBe('white')
  })

  it('after one move it is black to move', () => {
    const fenAfterE4 = applyUci(START_FEN, 'e2e4')
    expect(turnColor(fenAfterE4)).toBe('black')
  })
})

describe('kingSquare', () => {
  it('finds the white and black kings on the start position', () => {
    expect(kingSquare(START_FEN, 'white')).toEqual([7, 4])
    expect(kingSquare(START_FEN, 'black')).toEqual([0, 4])
  })
})

describe('positionAtPly', () => {
  const sans = ['e4', 'e5', 'Nf3']

  it('ply 0 is the start position with no lastMove', () => {
    const { fen, lastMove } = positionAtPly(sans, 0)
    expect(lastMove).toBeNull()
    expect(fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toBe(true)
  })

  it('ply 1 reflects 1.e4 with lastMove from e2 to e4', () => {
    const { fen, lastMove } = positionAtPly(sans, 1)
    expect(fen).toContain('4P3') // e4 pawn rank
    expect(lastMove).toEqual({ from: [6, 4], to: [4, 4] })
  })

  it('ply 2 reflects 1.e4 e5', () => {
    const { fen, lastMove } = positionAtPly(sans, 2)
    expect(lastMove).toEqual({ from: [1, 4], to: [3, 4] })
    expect(turnColor(fen)).toBe('white')
  })

  it('ply 3 reflects 1.e4 e5 2.Nf3', () => {
    const { fen, lastMove } = positionAtPly(sans, 3)
    expect(lastMove).toEqual({ from: [7, 6], to: [5, 5] })
    expect(turnColor(fen)).toBe('black')
  })

  it('stops early and gracefully on an invalid SAN entry', () => {
    const badSans = ['e4', 'not-a-move', 'Nf3']
    const { fen, lastMove } = positionAtPly(badSans, 3)
    // Should have stopped after the first valid move (e4) and not thrown.
    expect(lastMove).toEqual({ from: [6, 4], to: [4, 4] })
    expect(turnColor(fen)).toBe('black')
  })
})

describe('applyUci', () => {
  it('applies a legal move and returns a new FEN with the turn flipped', () => {
    const fen = applyUci(START_FEN, 'e2e4')
    expect(fen).not.toBeNull()
    expect(turnColor(fen)).toBe('black')
  })

  it('returns null for an illegal uci', () => {
    expect(applyUci(START_FEN, 'e2e5')).toBeNull()
  })
})
