import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BoardView } from './board.jsx'
import { boardFromFen } from '../lib/chesslib.js'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null))
}

describe('BoardView interaction', () => {
  it('calls onSquareTap with [r,c] for the clicked square when interactive', () => {
    const board = boardFromFen(START_FEN)
    const onSquareTap = vi.fn()
    const { container } = render(
      <BoardView board={board} interactive onSquareTap={onSquareTap} />
    )
    const squares = container.querySelectorAll('.sq')
    expect(squares).toHaveLength(64)
    // Non-flipped: DOM order dr,dc directly maps to r,c. Index 0 -> [0,0].
    fireEvent.click(squares[0])
    expect(onSquareTap).toHaveBeenCalledWith(0, 0)

    onSquareTap.mockClear()
    // index for r=6,c=4 (e2) -> dr*8+dc = 6*8+4 = 52
    fireEvent.click(squares[52])
    expect(onSquareTap).toHaveBeenCalledWith(6, 4)
  })

  it('does not throw and does not call a tap handler when not interactive', () => {
    const board = boardFromFen(START_FEN)
    const onSquareTap = vi.fn()
    const { container } = render(
      <BoardView board={board} interactive={false} onSquareTap={onSquareTap} />
    )
    const squares = container.querySelectorAll('.sq')
    expect(() => fireEvent.click(squares[10])).not.toThrow()
    expect(onSquareTap).not.toHaveBeenCalled()
  })

  it('bubbles a click on the piece glyph up to the square handler', () => {
    const board = boardFromFen(START_FEN)
    const onSquareTap = vi.fn()
    const { container } = render(
      <BoardView board={board} interactive onSquareTap={onSquareTap} />
    )
    // e1 white king is board[7][4] -> dr=7,dc=4 -> index 7*8+4=60
    const squares = container.querySelectorAll('.sq')
    const kingSquareEl = squares[60]
    const pieceEl = kingSquareEl.querySelector('.piece')
    expect(pieceEl).toBeTruthy()
    fireEvent.click(pieceEl)
    expect(onSquareTap).toHaveBeenCalledWith(7, 4)
  })
})

describe('BoardView flipped rendering', () => {
  it('reverses square/coordinate order when flipped', () => {
    const board = boardFromFen(START_FEN)

    const normal = render(<BoardView board={board} showCoords />)
    const normalRankLabels = normal.container.querySelectorAll('.sq-coordr')
    expect(normalRankLabels[0].textContent).toBe('8') // r=0 -> rank label 8-0

    const flipped = render(<BoardView board={board} flipped showCoords />)
    const flippedRankLabels = flipped.container.querySelectorAll('.sq-coordr')
    expect(flippedRankLabels[0].textContent).toBe('1') // r=7 -> rank label 8-7

    const normalFileLabels = normal.container.querySelectorAll('.sq-coordf')
    expect(normalFileLabels[0].textContent).toBe('a')
    const flippedFileLabels = flipped.container.querySelectorAll('.sq-coordf')
    expect(flippedFileLabels[0].textContent).toBe('h')
  })
})

describe('BoardView selection + legal target markers', () => {
  it('renders hl-sel on the selected square and dot on legal targets', () => {
    const board = boardFromFen(START_FEN)
    const { container } = render(
      <BoardView board={board} selected={[6, 4]} legalTargets={[[4, 4], [5, 4]]} />
    )
    const squares = container.querySelectorAll('.sq')
    // selected [6,4] -> index 52
    expect(squares[52].querySelector('.hl-sel')).toBeTruthy()
    // targets [4,4] -> index 36, [5,4] -> index 44
    expect(squares[36].querySelector('.dot')).toBeTruthy()
    expect(squares[44].querySelector('.dot')).toBeTruthy()
    // a square that is neither selected nor a target has no markers
    expect(squares[0].querySelector('.hl-sel')).toBeNull()
    expect(squares[0].querySelector('.dot')).toBeNull()
  })
})

describe('BoardView promotion picker', () => {
  it('renders 4 promotion buttons and a cancel button, wiring onPromo/onPromoCancel', () => {
    const board = emptyBoard()
    const onPromo = vi.fn()
    const onPromoCancel = vi.fn()
    const promo = { sq: [0, 0], color: 'w' }
    const { container } = render(
      <BoardView
        board={board}
        promo={promo}
        onPromo={onPromo}
        onPromoCancel={onPromoCancel}
      />
    )
    const promoBox = container.querySelector('.promo')
    expect(promoBox).toBeTruthy()
    const buttons = promoBox.querySelectorAll('button')
    // 4 piece choices + 1 cancel
    expect(buttons).toHaveLength(5)

    fireEvent.click(buttons[0]) // q
    expect(onPromo).toHaveBeenCalledWith('q')

    fireEvent.click(buttons[4]) // cancel (✕)
    expect(onPromoCancel).toHaveBeenCalled()
  })
})
