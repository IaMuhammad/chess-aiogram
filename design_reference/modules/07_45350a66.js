/* board.jsx — the chess board view. Pure presentation + tap routing. */

const FILES_ARR = 'abcdefgh'.split('');

function BoardView({
  state, flipped, selected, legalTargets, lastMove, checkSquare,
  pieceStyle, showCoords, interactive, onSquareTap, promo, onPromo, onPromoCancel,
}) {
  const targetSet = new Set((legalTargets || []).map(([r, c]) => r * 8 + c));
  const cells = [];

  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      const r = flipped ? 7 - dr : dr;
      const c = flipped ? 7 - dc : dc;
      const light = (r + c) % 2 === 0;
      const piece = state.board[r][c];
      const idx = r * 8 + c;
      const isSel = selected && selected[0] === r && selected[1] === c;
      const isTarget = targetSet.has(idx);
      const isCapture = isTarget && (piece || (state.ep && state.ep[0] === r && state.ep[1] === c));
      const isLast = lastMove && (
        (lastMove.from[0] === r && lastMove.from[1] === c) ||
        (lastMove.to[0] === r && lastMove.to[1] === c)
      );
      const isCheck = checkSquare && checkSquare[0] === r && checkSquare[1] === c;
      const justMoved = lastMove && lastMove.to[0] === r && lastMove.to[1] === c;

      cells.push(
        <div key={idx} className="sq" data-light={light}
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
          {piece && <Piece piece={piece} style={pieceStyle} className={justMoved ? 'pc-place' : ''} />}
          {isTarget && <div className={'dot' + (isCapture ? ' dot-cap' : '')} />}

          {/* promotion picker anchored to its square */}
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
      );
    }
  }

  return (
    <div className="board-wrap" data-flip={!!flipped}>
      <div className="board">{cells}</div>
    </div>
  );
}

window.BoardView = BoardView;
