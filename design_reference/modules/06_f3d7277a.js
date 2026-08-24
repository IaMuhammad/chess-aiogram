/* ui.jsx — shared building blocks: piece glyphs, icons, avatars, header, clock. */

const SOLID = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Two-tone piece rendering. Both colors use the SOLID glyph (always legible),
// differentiated by fill + stroke. style: 'flat' | 'd3'
function pieceCSS(piece, style) {
  const isWhite = piece[0] === 'w';
  const base = {
    fontFamily: 'var(--piece-glyph)',
    WebkitFontSmoothing: 'antialiased',
  };
  if (isWhite) {
    base.color = '#f4f7fb';
    base.WebkitTextStroke = '1.1px rgba(22,30,44,0.62)';
    base.filter = style === 'd3'
      ? 'drop-shadow(0 2.5px 1.5px rgba(0,0,0,.45))'
      : 'drop-shadow(0 1px 0.5px rgba(0,0,0,.28))';
  } else {
    base.color = style === 'd3' ? '#222b36' : '#2a3340';
    base.WebkitTextStroke = '1px rgba(255,255,255,0.30)';
    base.filter = style === 'd3'
      ? 'drop-shadow(0 2.5px 1.5px rgba(0,0,0,.5))'
      : 'drop-shadow(0 1px 0.5px rgba(0,0,0,.35))';
  }
  return base;
}

function Piece({ piece, style, className, extraStyle }) {
  if (!piece) return null;
  return (
    <span className={'piece ' + (className || '')} style={{ ...pieceCSS(piece, style), ...(extraStyle || {}) }}>
      {SOLID[piece[1]]}
    </span>
  );
}

// ── Icons (24x24 stroke) ─────────────────────────────────────────
const ICON_PATHS = {
  back:    <path d="M15 5l-7 7 7 7" />,
  close:   <path d="M6 6l12 12M18 6L6 18" />,
  menu:    <g><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></g>,
  copy:    <g><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></g>,
  share:   <g><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v13M7 8l5-5 5 5" /></g>,
  link:    <g><path d="M10 13a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-6-6l-1 1" /><path d="M14 11a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 6 6l1-1" /></g>,
  flip:    <g><path d="M4 8h13l-3-3M20 16H7l3 3" /></g>,
  flag:    <g><path d="M6 21V4M6 4h11l-2 4 2 4H6" /></g>,
  draw:    <g><path d="M8 13l2.5 2.5a2 2 0 0 0 2.8 0L20 9" /><path d="M4 9l3.5-3.5a2 2 0 0 1 2.8 0L12 7" /><path d="M12 7l2-2a2 2 0 0 1 2.8 0L20 8.5" /></g>,
  send:    <path d="M4 12l16-7-7 16-2.5-6.5L4 12z" />,
  search:  <g><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></g>,
  plus:    <path d="M12 5v14M5 12h14" />,
  clock:   <g><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>,
  users:   <g><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6a3 3 0 0 1 0 6M15.5 14.5a5.5 5.5 0 0 1 4 4.5" /></g>,
  trophy:  <g><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" /><path d="M12 13v4M9 20h6M10 17h4" /></g>,
  bolt:    <path d="M13 3L5 13h5l-1 8 8-11h-5l1-7z" />,
  message: <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4V6z" />,
  rabbit:  <g><circle cx="12" cy="14" r="5.5" /><path d="M9 9C8 5 6.5 4 6.5 4S9 4.5 10 8M15 9c1-4 2.5-5 2.5-5S15 4.5 14 8" /></g>,
  check:   <path d="M5 12.5l4.5 4.5L19 7.5" />,
  redo:    <g><path d="M20 11a8 8 0 1 0-2 5.3" /><path d="M20 5v6h-6" /></g>,
  home:    <g><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /></g>,
  qr:      <g><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2M20 14v2M16 18v2h-2M18 16h2v4" /></g>,
  eye:     <g><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></g>,
};

function Icon({ name, size = 22, color = 'currentColor', stroke = 2, fill = 'none', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
         strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {ICON_PATHS[name]}
    </svg>
  );
}

// ── Avatar ───────────────────────────────────────────────────────
const AV_GRADIENTS = {
  blue:   ['#5eb5f7', '#2a7fd6'],
  pink:   ['#ff8aa8', '#e8527d'],
  green:  ['#69d28a', '#2fa05c'],
  orange: ['#ffb86b', '#f08a32'],
  purple: ['#b18cf0', '#7b54d6'],
  cyan:   ['#5fd6d0', '#27a8a0'],
};
function Avatar({ name, size = 40, color = 'blue', online, you }) {
  const g = AV_GRADIENTS[color] || AV_GRADIENTS.blue;
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div className="avatar" style={{
        width: size, height: size, fontSize: size * 0.4,
        background: `linear-gradient(145deg, ${g[0]}, ${g[1]})`,
      }}>{initials}</div>
      {online && (
        <span style={{
          position: 'absolute', right: -1, bottom: -1, width: size * 0.28, height: size * 0.28,
          minWidth: 9, minHeight: 9, borderRadius: '50%', background: 'var(--good)',
          border: '2px solid var(--bg)',
        }} />
      )}
    </div>
  );
}

// ── Telegram header ──────────────────────────────────────────────
function TgHeader({ title, subtitle, onBack, onMenu, right, accentSub }) {
  return (
    <div className="tg-header">
      {onBack && (
        <button className="tg-hbtn" onClick={onBack} aria-label="Back"><Icon name="back" size={24} /></button>
      )}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: onBack ? 0 : 12 }}>
        <div className="tg-htitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle && <div className="tg-hsub" style={accentSub ? { color: 'var(--accent)' } : null}>{subtitle}</div>}
      </div>
      {right}
      {onMenu && (
        <button className="tg-hbtn" onClick={onMenu} aria-label="Menu" style={{ color: 'var(--sub)' }}><Icon name="menu" size={22} /></button>
      )}
    </div>
  );
}

// ── Clock formatting ─────────────────────────────────────────────
function fmtClock(ms) {
  if (ms < 0) ms = 0;
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (ms < 20000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// captured material from a board, returns { w:[types], b:[types], adv:number }
function computeCaptured(board) {
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const live = { w: { p:0,n:0,b:0,r:0,q:0 }, b: { p:0,n:0,b:0,r:0,q:0 } };
  for (const row of board) for (const p of row) if (p && p[1] !== 'k') live[p[0]][p[1]]++;
  const capByWhite = [], capByBlack = []; // pieces each side has captured
  let scoreW = 0, scoreB = 0;
  for (const t of ['q','r','b','n','p']) {
    for (let i = 0; i < start[t] - live.b[t]; i++) capByWhite.push('b' + t);
    for (let i = 0; i < start[t] - live.w[t]; i++) capByBlack.push('w' + t);
  }
  for (const row of board) for (const p of row) if (p && p[1] !== 'k') (p[0] === 'w' ? (scoreW += PIECE_VALUE[p[1]]) : (scoreB += PIECE_VALUE[p[1]]));
  return { capByWhite, capByBlack, adv: scoreW - scoreB };
}

Object.assign(window, {
  SOLID, PIECE_VALUE, Piece, pieceCSS, Icon, Avatar, TgHeader, fmtClock, computeCaptured,
});
