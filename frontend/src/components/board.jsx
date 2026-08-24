// The chess board view. Pure presentation + tap routing.
// `state.board` is an 8x8 array of 'wp'-style strings (r=0 is rank 8 / top).
import React from 'react'
import { Piece } from './ui.jsx'

const FILES_ARR = 'abcdefgh'.split('')

// Stringify a {from,to} move by value, for change-detection (the prop is a
// fresh object every render, so reference equality is useless here).
function moveKey(m) {
  return m ? `${m.from[0]},${m.from[1]}-${m.to[0]},${m.to[1]}` : null
}

// FLIP-slide the piece that just landed on `toRC` in from `fromRC`: snap it
// back to where it came from with no transition, then transition to zero —
// reads as the piece sliding across the board instead of popping into place.
function slidePiece(root, fromRC, toRC) {
  const fromSq = root.querySelector(`[data-idx="${fromRC[0] * 8 + fromRC[1]}"]`)
  const toSq = root.querySelector(`[data-idx="${toRC[0] * 8 + toRC[1]}"]`)
  const pieceEl = toSq && toSq.querySelector('.piece')
  if (!fromSq || !toSq || !pieceEl) return
  const fromRect = fromSq.getBoundingClientRect()
  const toRect = toSq.getBoundingClientRect()
  const dx = fromRect.left - toRect.left
  const dy = fromRect.top - toRect.top
  if (!dx && !dy) return
  pieceEl.style.transition = 'none'
  pieceEl.style.transform = `translate(${dx}px, ${dy}px) translateY(16%)`
  // eslint-disable-next-line no-unused-expressions
  pieceEl.offsetHeight // force reflow so the next transform is transitioned
  pieceEl.style.transition = 'transform .22s cubic-bezier(.22,.7,.32,1)'
  pieceEl.style.transform = 'translateY(16%)'
  const clear = () => {
    pieceEl.style.transition = ''
    pieceEl.style.transform = ''
    pieceEl.removeEventListener('transitionend', clear)
  }
  pieceEl.addEventListener('transitionend', clear)
}

// Animate lastMove's piece sliding from→to whenever it changes (by value).
// Also slides the rook on castling, inferred from a two-file king hop.
function useMoveAnimation(boardRef, lastMove) {
  const key = moveKey(lastMove)
  const prevKeyRef = React.useRef(key)

  React.useLayoutEffect(() => {
    const changed = key !== prevKeyRef.current
    prevKeyRef.current = key
    if (!changed || !lastMove || !boardRef.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    slidePiece(boardRef.current, lastMove.from, lastMove.to)

    const [fr, fc] = lastMove.from
    const [tr, tc] = lastMove.to
    if (fr === tr && Math.abs(fc - tc) === 2 && (fr === 0 || fr === 7)) {
      const rookFromC = tc > fc ? 7 : 0
      const rookToC = tc > fc ? tc - 1 : tc + 1
      slidePiece(boardRef.current, [fr, rookFromC], [fr, rookToC])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

export function BoardView({
  board, flipped, selected, legalTargets, lastMove, checkSquare,
  pieceStyle = 'flat', showCoords = true, interactive, onSquareTap,
  promo, onPromo, onPromoCancel, epSquare,
}) {
  const boardRef = React.useRef(null)
  useMoveAnimation(boardRef, lastMove)
  const targetSet = new Set((legalTargets || []).map(([r, c]) => r * 8 + c))
  const cells = []

  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      const r = flipped ? 7 - dr : dr
      const c = flipped ? 7 - dc : dc
      const light = (r + c) % 2 === 0
      const piece = board[r][c]
      const idx = r * 8 + c
      const isSel = selected && selected[0] === r && selected[1] === c
      const isTarget = targetSet.has(idx)
      const isCapture = isTarget && (piece || (epSquare && epSquare[0] === r && epSquare[1] === c))
      const isLast = lastMove && (
        (lastMove.from[0] === r && lastMove.from[1] === c) ||
        (lastMove.to[0] === r && lastMove.to[1] === c)
      )
      const isCheck = checkSquare && checkSquare[0] === r && checkSquare[1] === c

      cells.push(
        <div key={idx} className="sq" data-light={light} data-idx={idx}
          style={{ background: light ? 'var(--sq-light)' : 'var(--sq-dark)' }}
          onClick={interactive ? () => onSquareTap(r, c) : undefined}>
          {isLast && <div className="hl-last" />}
          {isSel && <div className="hl-sel" />}
          {isCheck && <div className="hl-check" />}
          {showCoords && dc === 0 && (
            <span className="sq-coordr" style={{ color: light ? 'var(--sq-dark)' : 'var(--sq-light)' }}>{8 - r}</span>
          )}
          {showCoords && dr === 7 && (
            <span className="sq-coordf" style={{ color: light ? 'var(--sq-dark)' : 'var(--sq-light)' }}>{FILES_ARR[c]}</span>
          )}
          {piece && <Piece piece={piece} style={pieceStyle} />}
          {isTarget && <div className={'dot' + (isCapture ? ' dot-cap' : '')} />}

          {promo && promo.sq[0] === r && promo.sq[1] === c && (
            <div className="promo" style={{
              top: flipped ? 'auto' : '2%', bottom: flipped ? '2%' : 'auto',
              left: c >= 6 ? 'auto' : '8%', right: c >= 6 ? '8%' : 'auto',
            }} onClick={(e) => e.stopPropagation()}>
              {['q', 'r', 'n', 'b'].map((t) => (
                <button key={t} onClick={() => onPromo(t)}>
                  <Piece piece={promo.color + t} style={pieceStyle} />
                </button>
              ))}
              <button onClick={onPromoCancel} style={{ fontFamily: 'inherit', fontSize: 18, color: 'var(--hint)' }}>✕</button>
            </div>
          )}
        </div>
      )
    }
  }

  return (
    <div className="board-wrap" data-flip={!!flipped}>
      <div className="board" ref={boardRef}>{cells}</div>
    </div>
  )
}
