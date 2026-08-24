/* engine.js — a compact but correct chess engine.
   Board: 8x8 array, board[r][c]. r=0 is rank 8 (black back rank, top),
   r=7 is rank 1 (white back rank, bottom). c=0 is file a ... c=7 is file h.
   Pieces are 2-char strings: color('w'|'b') + type('p','n','b','r','q','k'). Empty = null.
   Attaches window.ChessEngine. No dependencies. */
(function () {
  'use strict';

  const FILES = 'abcdefgh';
  const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const colorOf = (p) => (p ? p[0] : null);
  const typeOf = (p) => (p ? p[1] : null);
  const opp = (col) => (col === 'w' ? 'b' : 'w');
  const sq = (r, c) => FILES[c] + (8 - r);

  function initialBoard() {
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let c = 0; c < 8; c++) {
      b[0][c] = 'b' + back[c];
      b[1][c] = 'bp';
      b[6][c] = 'wp';
      b[7][c] = 'w' + back[c];
    }
    return b;
  }

  function newGame() {
    return {
      board: initialBoard(),
      turn: 'w',
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: null, // [r,c] target square of an en-passant capture
      half: 0,
      full: 1,
    };
  }

  function cloneState(s) {
    return {
      board: s.board.map((row) => row.slice()),
      turn: s.turn,
      castling: { ...s.castling },
      ep: s.ep ? [s.ep[0], s.ep[1]] : null,
      half: s.half,
      full: s.full,
    };
  }

  // ── Attack detection ─────────────────────────────────────────────
  function isAttacked(board, r, c, by) {
    // pawns
    const pdir = by === 'w' ? 1 : -1; // a white pawn on row r+1 attacks row r
    for (const dc of [-1, 1]) {
      const rr = r + pdir, cc = c + dc;
      if (inside(rr, cc) && board[rr][cc] === by + 'p') return true;
    }
    // knights
    const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of KN) {
      const rr = r + dr, cc = c + dc;
      if (inside(rr, cc) && board[rr][cc] === by + 'n') return true;
    }
    // king
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (inside(rr, cc) && board[rr][cc] === by + 'k') return true;
    }
    // sliding — rook/queen orthogonal
    const ORTHO = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of ORTHO) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr][cc];
        if (p) { if (colorOf(p) === by && (typeOf(p) === 'r' || typeOf(p) === 'q')) return true; break; }
        rr += dr; cc += dc;
      }
    }
    // sliding — bishop/queen diagonal
    const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of DIAG) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr][cc];
        if (p) { if (colorOf(p) === by && (typeOf(p) === 'b' || typeOf(p) === 'q')) return true; break; }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function kingPos(board, col) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === col + 'k') return [r, c];
    return null;
  }

  function inCheck(s, col) {
    const kp = kingPos(s.board, col);
    if (!kp) return false;
    return isAttacked(s.board, kp[0], kp[1], opp(col));
  }

  // ── Pseudo-legal move generation ─────────────────────────────────
  function pseudoMoves(s, col) {
    const board = s.board;
    const moves = [];
    const add = (fr, fc, tr, tc, extra) => moves.push({
      from: [fr, fc], to: [tr, tc], color: col,
      piece: typeOf(board[fr][fc]),
      capture: board[tr][tc] ? typeOf(board[tr][tc]) : null,
      promotion: null, flags: 'n', ...extra,
    });

    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || colorOf(p) !== col) continue;
      const t = typeOf(p);

      if (t === 'p') {
        const dir = col === 'w' ? -1 : 1;
        const startRow = col === 'w' ? 6 : 1;
        const promoRow = col === 'w' ? 0 : 7;
        const one = r + dir;
        // forward
        if (inside(one, c) && !board[one][c]) {
          if (one === promoRow) for (const pr of ['q','r','b','n']) add(r,c,one,c,{ promotion: pr });
          else add(r, c, one, c);
          // double
          if (r === startRow && !board[r + 2*dir][c]) add(r, c, r + 2*dir, c, { flags: 'b' });
        }
        // captures
        for (const dc of [-1, 1]) {
          const tr = r + dir, tc = c + dc;
          if (!inside(tr, tc)) continue;
          const target = board[tr][tc];
          if (target && colorOf(target) !== col) {
            if (tr === promoRow) for (const pr of ['q','r','b','n']) add(r,c,tr,tc,{ promotion: pr });
            else add(r, c, tr, tc);
          } else if (s.ep && s.ep[0] === tr && s.ep[1] === tc) {
            add(r, c, tr, tc, { flags: 'e', capture: 'p' });
          }
        }
      } else if (t === 'n') {
        const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of KN) {
          const tr = r + dr, tc = c + dc;
          if (inside(tr, tc) && colorOf(board[tr][tc]) !== col) add(r, c, tr, tc);
        }
      } else if (t === 'k') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const tr = r + dr, tc = c + dc;
          if (inside(tr, tc) && colorOf(board[tr][tc]) !== col) add(r, c, tr, tc);
        }
        // castling
        const homeRow = col === 'w' ? 7 : 0;
        if (r === homeRow && c === 4 && !isAttacked(board, r, 4, opp(col))) {
          const kSide = col === 'w' ? s.castling.wK : s.castling.bK;
          const qSide = col === 'w' ? s.castling.wQ : s.castling.bQ;
          if (kSide && !board[homeRow][5] && !board[homeRow][6] &&
              board[homeRow][7] === col + 'r' &&
              !isAttacked(board, homeRow, 5, opp(col)) && !isAttacked(board, homeRow, 6, opp(col))) {
            add(r, c, homeRow, 6, { flags: 'k' });
          }
          if (qSide && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1] &&
              board[homeRow][0] === col + 'r' &&
              !isAttacked(board, homeRow, 3, opp(col)) && !isAttacked(board, homeRow, 2, opp(col))) {
            add(r, c, homeRow, 2, { flags: 'q' });
          }
        }
      } else {
        // sliding pieces
        let dirs;
        if (t === 'b') dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        else if (t === 'r') dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        else dirs = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
          let tr = r + dr, tc = c + dc;
          while (inside(tr, tc)) {
            const target = board[tr][tc];
            if (!target) add(r, c, tr, tc);
            else { if (colorOf(target) !== col) add(r, c, tr, tc); break; }
            tr += dr; tc += dc;
          }
        }
      }
    }
    return moves;
  }

  // ── Apply a move (returns new state) ─────────────────────────────
  function makeMove(s, m) {
    const n = cloneState(s);
    const b = n.board;
    const [fr, fc] = m.from, [tr, tc] = m.to;
    const piece = b[fr][fc];
    const col = colorOf(piece);

    b[fr][fc] = null;
    b[tr][tc] = m.promotion ? col + m.promotion : piece;

    if (m.flags === 'e') b[fr][tc] = null; // captured pawn sits beside the mover
    if (m.flags === 'k') { b[tr][5] = b[tr][7]; b[tr][7] = null; }
    if (m.flags === 'q') { b[tr][3] = b[tr][0]; b[tr][0] = null; }

    // en-passant target
    n.ep = m.flags === 'b' ? [(fr + tr) / 2, fc] : null;

    // castling rights
    if (typeOf(piece) === 'k') { if (col === 'w') { n.castling.wK = n.castling.wQ = false; } else { n.castling.bK = n.castling.bQ = false; } }
    if (typeOf(piece) === 'r') {
      if (fr === 7 && fc === 0) n.castling.wQ = false;
      if (fr === 7 && fc === 7) n.castling.wK = false;
      if (fr === 0 && fc === 0) n.castling.bQ = false;
      if (fr === 0 && fc === 7) n.castling.bK = false;
    }
    // rook captured on its home square
    if (tr === 7 && tc === 0) n.castling.wQ = false;
    if (tr === 7 && tc === 7) n.castling.wK = false;
    if (tr === 0 && tc === 0) n.castling.bQ = false;
    if (tr === 0 && tc === 7) n.castling.bK = false;

    n.half = (m.capture || typeOf(piece) === 'p') ? 0 : n.half + 1;
    if (col === 'b') n.full += 1;
    n.turn = opp(col);
    return n;
  }

  function legalMoves(s, col) {
    col = col || s.turn;
    const out = [];
    for (const m of pseudoMoves(s, col)) {
      const n = makeMove(s, m);
      if (!inCheck(n, col)) out.push(m);
    }
    return out;
  }

  function legalMovesFrom(s, r, c) {
    return legalMoves(s, s.turn).filter((m) => m.from[0] === r && m.from[1] === c);
  }

  function insufficientMaterial(board) {
    const pieces = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && typeOf(p) !== 'k') pieces.push({ t: typeOf(p), col: colorOf(p), dark: (r + c) % 2 === 1 });
    }
    if (pieces.length === 0) return true; // K vs K
    if (pieces.length === 1 && (pieces[0].t === 'b' || pieces[0].t === 'n')) return true; // K+minor
    if (pieces.length === 2 && pieces.every((p) => p.t === 'b') && pieces[0].dark === pieces[1].dark) return true; // same-color bishops
    return false;
  }

  function status(s) {
    const moves = legalMoves(s, s.turn);
    const chk = inCheck(s, s.turn);
    if (moves.length === 0) return chk ? 'checkmate' : 'stalemate';
    if (insufficientMaterial(s.board)) return 'draw-material';
    if (s.half >= 100) return 'draw-fifty';
    return chk ? 'check' : 'playing';
  }

  // ── SAN notation ─────────────────────────────────────────────────
  function toSAN(s, m, legal) {
    if (m.flags === 'k') return withCheck(s, m, 'O-O');
    if (m.flags === 'q') return withCheck(s, m, 'O-O-O');
    const pieceLetter = m.piece === 'p' ? '' : m.piece.toUpperCase();
    const dest = sq(m.to[0], m.to[1]);
    const isCapture = !!m.capture;
    let str = '';

    if (m.piece === 'p') {
      if (isCapture) str = FILES[m.from[1]] + 'x' + dest;
      else str = dest;
      if (m.promotion) str += '=' + m.promotion.toUpperCase();
    } else {
      // disambiguation
      const rivals = (legal || legalMoves(s, s.turn)).filter(
        (x) => x.piece === m.piece && x.to[0] === m.to[0] && x.to[1] === m.to[1] &&
               !(x.from[0] === m.from[0] && x.from[1] === m.from[1])
      );
      let disamb = '';
      if (rivals.length) {
        const sameFile = rivals.some((x) => x.from[1] === m.from[1]);
        const sameRank = rivals.some((x) => x.from[0] === m.from[0]);
        if (!sameFile) disamb = FILES[m.from[1]];
        else if (!sameRank) disamb = String(8 - m.from[0]);
        else disamb = sq(m.from[0], m.from[1]);
      }
      str = pieceLetter + disamb + (isCapture ? 'x' : '') + dest;
    }
    return withCheck(s, m, str);
  }

  function withCheck(s, m, str) {
    const n = makeMove(s, m);
    const enemy = n.turn;
    if (inCheck(n, enemy)) {
      const hasMoves = legalMoves(n, enemy).length > 0;
      return str + (hasMoves ? '+' : '#');
    }
    return str;
  }

  window.ChessEngine = {
    newGame, cloneState, legalMoves, legalMovesFrom, makeMove,
    inCheck, status, toSAN, kingPos, sq, typeOf, colorOf, isAttacked,
  };
})();
