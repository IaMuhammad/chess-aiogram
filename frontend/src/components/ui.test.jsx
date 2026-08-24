import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { pieceCSS, Piece, Icon, SOLID } from './ui.jsx'

describe('pieceCSS', () => {
  it('white and black pieces get different colors, both keep the glyph font', () => {
    const white = pieceCSS('wp', 'flat')
    const black = pieceCSS('bp', 'flat')
    expect(white.color).not.toBe(black.color)
    expect(white.fontFamily).toBe('var(--piece-glyph)')
    expect(black.fontFamily).toBe('var(--piece-glyph)')
  })

  it('d3 style uses a different filter/shadow than flat style', () => {
    const flat = pieceCSS('wp', 'flat')
    const d3 = pieceCSS('wp', 'd3')
    expect(flat.filter).not.toBe(d3.filter)
  })
})

describe('Piece', () => {
  it('renders the correct glyph for each piece type/color', () => {
    for (const [type, glyph] of Object.entries(SOLID)) {
      const { container, unmount } = render(<Piece piece={'w' + type} style="flat" />)
      expect(container.textContent).toBe(glyph)
      unmount()
    }
  })

  it('renders the white king glyph specifically', () => {
    const { container } = render(<Piece piece="wk" style="flat" />)
    expect(container.textContent).toBe('♚')
  })

  it('renders nothing when piece is null or undefined', () => {
    const { container: c1 } = render(<Piece piece={null} style="flat" />)
    expect(c1.innerHTML).toBe('')
    const { container: c2 } = render(<Piece piece={undefined} style="flat" />)
    expect(c2.innerHTML).toBe('')
  })
})

describe('Icon', () => {
  it('renders an svg for a known icon name without throwing', () => {
    const { container } = render(<Icon name="back" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.querySelector('path')).toBeTruthy()
  })

  it('renders an svg for another known icon name (check)', () => {
    const { container } = render(<Icon name="check" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders an empty svg (no children, no throw) for an unknown icon name', () => {
    expect(() => render(<Icon name="not-a-real-icon" />)).not.toThrow()
    const { container } = render(<Icon name="not-a-real-icon" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.children).toHaveLength(0)
  })
})
