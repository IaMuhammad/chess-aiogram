/* app.jsx — root: routing, game state, clocks, opponent AI, chat, tweaks. */

const E = window.ChessEngine;
const other = (c) => (c === 'w' ? 'b' : 'w');

// ── Static data ──────────────────────────────────────────────────
const ME = { name: 'You', rating: 1482, color: 'blue', wins: 128, losses: 97, streak: 3, online: true };
const OPP_POOL = [
  { name: 'Alex Volkov',   rating: 1503, color: 'orange' },
  { name: 'Mira Petrova',  rating: 1471, color: 'pink' },
  { name: 'Kenji Sato',    rating: 1455, color: 'green' },
  { name: 'Lina Hoffmann', rating: 1519, color: 'purple' },
  { name: 'Diego Ramos',   rating: 1490, color: 'cyan' },
];
const RECENT = [
  { name: 'Mira Petrova', color: 'pink',   tc: 'Blitz 5+0',  moves: 41, result: 'W' },
  { name: 'Kenji Sato',   color: 'green',  tc: 'Rapid 10+0', moves: 58, result: 'L' },
  { name: 'Diego Ramos',  color: 'cyan',   tc: 'Blitz 3+2',  moves: 33, result: 'D' },
];
const CHAT_REPLIES = ['Good luck!', 'Nice move 👍', 'Hmm, tricky.', 'Well played.', 'I saw that coming 😄', 'Your turn!', 'Close one.'];

// ── Theme maps ───────────────────────────────────────────────────
const THEMES = {
  night:    { bg: '#17212b', panel: '#232e3c', panel2: '#1d2733', header: '#17212b' },
  midnight: { bg: '#0e1621', panel: '#18222e', panel2: '#131c27', header: '#0e1621' },
  arctic:   { bg: '#1b2733', panel: '#27343f', panel2: '#222e39', header: '#1b2733' },
};
const BOARDS = {
  blue:   { light: '#cdd7e3', dark: '#5b7290' },
  slate:  { light: '#b9c1cc', dark: '#5c6674' },
  walnut: { light: '#e7d2ad', dark: '#9a6a44' },
  forest: { light: '#e7ebcf', dark: '#6f8f57' },
};

// ── Pure game helpers ────────────────────────────────────────────
function buildGame({ tc, myColor, opponent, role }) {
  const init = E.newGame();
  const players = {};
  if (role === 'spectator') {
    players.w = { ...OPP_POOL[0], side: 'w', online: true };
    players.b = { ...opponent, side: 'b', online: true };
  } else {
    players[myColor] = { name: ME.name, rating: ME.rating, color: ME.color, side: myColor, you: true, online: true };
    players[other(myColor)] = { ...opponent, side: other(myColor), online: true };
  }
  return {
    timeline: [init], moves: [], sans: [], viewPly: 0,
    myColor, opponent, role, tc, players,
    clocks: { w: tc.base * 1000, b: tc.base * 1000 },
    activeSide: 'w', playing: true, result: null,
    flipped: role === 'spectator' ? false : myColor === 'b',
    messages: role === 'spectator'
      ? [{ from: 'sys', text: `${tc.name} ${tc.id} · spectating` }]
      : [{ from: 'sys', text: `${tc.name} ${tc.id} · game started` },
         { from: 'them', text: 'Hey! Good luck 🙂', time: '' }],
    drawByOpp: false, unread: role === 'spectator' ? 0 : 1,
  };
}

function endGame(g, resultForMe, reason, winnerSide) {
  const delta = resultForMe === 'win' ? 8 : resultForMe === 'loss' ? -7 : 2;
  return {
    ...g, playing: false, activeSide: null,
    result: {
      result: resultForMe, reason, winnerSide,
      delta: g.role === 'spectator' ? null : delta,
      newRating: g.role === 'spectator' ? null : ME.rating + delta,
    },
    messages: [...g.messages, { from: 'sys', text: 'Game over · ' + reason }],
  };
}

function applyMove(g, move) {
  const live = g.timeline[g.timeline.length - 1];
  const mover = live.turn;
  const san = E.toSAN(live, move, E.legalMoves(live, mover));
  const next = E.makeMove(live, move);
  const clocks = { ...g.clocks };
  clocks[mover] += g.tc.inc * 1000;

  const wasLive = g.viewPly === g.timeline.length - 1;
  let ng = {
    ...g,
    timeline: [...g.timeline, next],
    moves: [...g.moves, move],
    sans: [...g.sans, san],
    clocks, activeSide: next.turn,
    viewPly: wasLive ? g.timeline.length : g.viewPly,
  };

  const st = E.status(next);
  if (st === 'checkmate') ng = endGame(ng, g.role === 'spectator' ? 'win' : (mover === g.myColor ? 'win' : 'loss'), 'by checkmate', mover);
  else if (st === 'stalemate') ng = endGame(ng, 'draw', 'by stalemate', null);
  else if (st === 'draw-material') ng = endGame(ng, 'draw', 'insufficient material', null);
  else if (st === 'draw-fifty') ng = endGame(ng, 'draw', 'fifty-move rule', null);
  return ng;
}

// ── Opponent AI ──────────────────────────────────────────────────
function pickAIMove(state) {
  const legal = E.legalMoves(state, state.turn);
  if (!legal.length) return null;
  if (Math.random() < 0.16) return legal[Math.floor(Math.random() * legal.length)]; // human-like slip
  const me = state.turn, foe = other(me);
  let best = null, bestScore = -Infinity;
  for (const m of legal) {
    let score = Math.random() * 0.6;
    if (m.capture) score += (PIECE_VALUE[m.capture] || 0) * 1.1;
    if (m.promotion) score += m.promotion === 'q' ? 9 : 2;
    const after = E.makeMove(state, m);
    const st = E.status(after);
    if (st === 'checkmate') score += 1000;
    else if (st === 'check') score += 0.6;
    // discourage hanging the moved piece
    const [tr, tc] = m.to;
    const attacked = E.isAttacked(after.board, tr, tc, foe);
    const defended = E.isAttacked(after.board, tr, tc, me);
    if (attacked && !defended) score -= (PIECE_VALUE[m.piece] || 0) * 0.75;
    if (m.piece === 'p') score += 0.15; // nudge development/pawns
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ── Root component ───────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "night",
  "accent": "#2ea6ff",
  "board": "blue",
  "pieces": "flat",
  "showCoords": true,
  "highlight": true,
  "role": "player"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('home');
  const [tc, setTc] = React.useState(TIME_CONTROLS[3]);
  const [game, setGame] = React.useState(null);
  const [sel, setSel] = React.useState(null);
  const [promo, setPromo] = React.useState(null);
  const [tab, setTab] = React.useState('moves');
  const [draft, setDraft] = React.useState('');
  const [toast, setToast] = React.useState(null);
  // matchmaking / lobby transient
  const [mmElapsed, setMmElapsed] = React.useState(0);
  const [mmFound, setMmFound] = React.useState(null);
  const [lobby, setLobby] = React.useState(null);

  const gameRef = React.useRef(null); gameRef.current = game;
  const movesRef = React.useRef(null);
  const chatRef = React.useRef(null);
  const lastTickRef = React.useRef(0);

  const showToast = (msg) => { setToast(msg); clearTimeout(showToast._t); showToast._t = setTimeout(() => setToast(null), 1900); };

  // ── apply theme tokens ──
  React.useEffect(() => {
    const root = document.documentElement.style;
    const th = THEMES[t.theme] || THEMES.night;
    root.setProperty('--bg', th.bg);
    root.setProperty('--panel', th.panel);
    root.setProperty('--panel2', th.panel2);
    root.setProperty('--header', th.header);
    root.setProperty('--accent', t.accent);
    root.setProperty('--accent-press', `color-mix(in srgb, ${t.accent} 82%, #000)`);
    const bd = BOARDS[t.board] || BOARDS.blue;
    root.setProperty('--sq-light', bd.light);
    root.setProperty('--sq-dark', bd.dark);
  }, [t.theme, t.accent, t.board]);

  // ── clock tick ──
  React.useEffect(() => {
    lastTickRef.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - lastTickRef.current, 300);
      lastTickRef.current = now;
      setGame((g) => {
        if (!g || !g.playing || !g.activeSide) return g;
        const clocks = { ...g.clocks };
        clocks[g.activeSide] = Math.max(0, clocks[g.activeSide] - dt);
        if (clocks[g.activeSide] <= 0) {
          const loser = g.activeSide;
          const rfm = g.role === 'spectator' ? 'win' : (loser === g.myColor ? 'loss' : 'win');
          return endGame({ ...g, clocks }, rfm, loser === g.myColor ? 'you ran out of time' : 'opponent flagged', other(loser));
        }
        return { ...g, clocks };
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  // ── opponent / spectator AI scheduling ──
  const liveLen = game ? game.timeline.length : 0;
  const activeSide = game ? game.activeSide : null;
  React.useEffect(() => {
    const g = gameRef.current;
    if (!g || !g.playing || !g.activeSide || screen !== 'game') return;
    const botTurn = g.role === 'spectator' || g.activeSide === other(g.myColor);
    if (!botTurn) return;
    const fast = g.tc.base <= 120;
    const delay = (fast ? 350 : 650) + Math.random() * (fast ? 350 : 800);
    const id = setTimeout(() => {
      const gg = gameRef.current;
      if (!gg || !gg.playing || gg.activeSide !== g.activeSide || gg.timeline.length !== g.timeline.length) return;
      const mv = pickAIMove(gg.timeline[gg.timeline.length - 1]);
      if (mv) {
        setGame((cur) => applyMove(cur, mv));
        if (g.role !== 'spectator' && Math.random() < 0.18) {
          setTimeout(() => addThemMessage(CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)]), 600);
        }
      }
    }, delay);
    return () => clearTimeout(id);
  }, [liveLen, activeSide, screen]);

  // ── auto-scroll moves + chat ──
  React.useEffect(() => { if (movesRef.current) movesRef.current.scrollTop = movesRef.current.scrollHeight; }, [liveLen, tab]);
  React.useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [game && game.messages.length, tab]);

  // ── chat helpers ──
  function addThemMessage(text) {
    setGame((g) => g ? { ...g, messages: [...g.messages, { from: 'them', text, time: nowTime() }], unread: g.unread + 1 } : g);
  }
  const nowTime = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  React.useEffect(() => { if (tab === 'chat' && game && game.unread) setGame((g) => ({ ...g, unread: 0 })); }, [tab]);

  // ── navigation ──
  function gotoHome() { setScreen('home'); setGame(null); setSel(null); setPromo(null); }

  function startGame({ myColor, opponent, role }) {
    const g = buildGame({ tc, myColor, opponent, role });
    setGame(g); setSel(null); setPromo(null); setTab('moves'); setDraft('');
    setScreen('game'); lastTickRef.current = performance.now();
  }

  function onPlayFriend() {
    setLobby({ link: 't.me/ChessBot?startapp=g7F2x9', joined: false, opponent: null });
    setScreen('lobby');
    const opp = OPP_POOL[Math.floor(Math.random() * OPP_POOL.length)];
    setTimeout(() => setLobby((l) => l ? { ...l, joined: true, opponent: opp } : l), 3400);
  }
  function onFindOpponent() {
    setMmFound(null); setMmElapsed(0); setScreen('match');
  }
  function onWatch() {
    const a = OPP_POOL[1];
    startGame({ myColor: 'w', opponent: a, role: 'spectator' });
  }

  // matchmaking timers
  React.useEffect(() => {
    if (screen !== 'match') return;
    const tick = setInterval(() => setMmElapsed((e) => e + 1), 1000);
    const found = setTimeout(() => {
      const opp = OPP_POOL[Math.floor(Math.random() * OPP_POOL.length)];
      setMmFound(opp);
      setTimeout(() => startGame({ myColor: Math.random() < 0.5 ? 'w' : 'b', opponent: opp, role: t.role }), 1200);
    }, 2600);
    return () => { clearInterval(tick); clearTimeout(found); };
  }, [screen]);

  // ── board interaction ──
  const live = game ? game.timeline[game.timeline.length - 1] : null;
  const isLive = game ? game.viewPly === game.timeline.length - 1 : true;
  const shown = game ? game.timeline[game.viewPly] : null;
  const interactive = !!(game && game.playing && isLive && game.role === 'player' && game.activeSide === game.myColor);

  function selectSquare(r, c) {
    const targets = E.legalMovesFrom(live, r, c);
    if (targets.length) { setSel([r, c]); }
    else setSel(null);
  }
  function legalTargetsFor(s) { return s ? E.legalMovesFrom(live, s[0], s[1]).map((m) => m.to) : []; }

  function onSquareTap(r, c) {
    if (!interactive) return;
    const piece = live.board[r][c];
    if (sel) {
      const matching = E.legalMovesFrom(live, sel[0], sel[1]).filter((m) => m.to[0] === r && m.to[1] === c);
      if (matching.length) {
        if (matching[0].promotion) { setPromo({ from: sel, sq: [r, c], color: game.myColor }); return; }
        doMove(matching[0]); return;
      }
      if (piece && piece[0] === game.myColor) { selectSquare(r, c); return; }
      setSel(null);
    } else if (piece && piece[0] === game.myColor) {
      selectSquare(r, c);
    }
  }
  function doMove(move) { setGame((g) => applyMove(g, move)); setSel(null); setPromo(null); }
  function onPromo(type) {
    const m = E.legalMovesFrom(live, promo.from[0], promo.from[1])
      .find((x) => x.to[0] === promo.sq[0] && x.to[1] === promo.sq[1] && x.promotion === type);
    if (m) doMove(m);
  }

  // ── controls ──
  function onFlip() { setGame((g) => ({ ...g, flipped: !g.flipped })); }
  function onResign() { setGame((g) => endGame(g, 'loss', 'you resigned', other(g.myColor))); }
  function onDraw() {
    showToast('Draw offer sent');
    setTimeout(() => {
      setGame((g) => {
        if (!g || !g.playing) return g;
        if (Math.random() < 0.4) return endGame(g, 'draw', 'by agreement', null);
        return { ...g, messages: [...g.messages, { from: 'them', text: 'No thanks, let\u2019s play on.', time: nowTime() }], unread: g.unread + (tab === 'chat' ? 0 : 1) };
      });
    }, 1400);
  }
  function onAcceptDraw() { setGame((g) => endGame({ ...g, drawByOpp: false }, 'draw', 'by agreement', null)); }
  function onDeclineDraw() { setGame((g) => ({ ...g, drawByOpp: false })); }

  function selectPly(p) { setGame((g) => ({ ...g, viewPly: p })); setSel(null); }
  function stepPly(d) { setGame((g) => ({ ...g, viewPly: Math.max(0, Math.min(g.timeline.length - 1, g.viewPly + d)) })); }
  function goLive() { setGame((g) => ({ ...g, viewPly: g.timeline.length - 1 })); }

  function sendChat() {
    const text = draft.trim(); if (!text) return;
    setGame((g) => ({ ...g, messages: [...g.messages, { from: 'me', text, time: nowTime() }] }));
    setDraft('');
    if (Math.random() < 0.6) setTimeout(() => addThemMessage(CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)]), 1100 + Math.random() * 900);
  }

  function rematch() {
    const newColor = game.role === 'spectator' ? 'w' : other(game.myColor);
    startGame({ myColor: newColor, opponent: game.opponent, role: game.role });
  }

  // ── render ──
  let content;
  if (screen === 'home') {
    content = <HomeScreen me={ME} tc={tc} setTc={setTc} recent={RECENT}
      onPlayFriend={onPlayFriend} onFindOpponent={onFindOpponent} onWatch={onWatch} />;
  } else if (screen === 'match') {
    content = <MatchmakingScreen tc={tc} elapsed={mmElapsed} found={!!mmFound} opponent={mmFound || {}} onCancel={gotoHome} />;
  } else if (screen === 'lobby' && lobby) {
    content = <LobbyScreen tc={tc} link={lobby.link} joined={lobby.joined} opponent={lobby.opponent || {}}
      me={ME} toast={toast}
      onCopy={() => showToast('Link copied to clipboard')}
      onShare={() => showToast('Sharing to a Telegram chat\u2026')}
      onStart={() => startGame({ myColor: 'w', opponent: lobby.opponent, role: t.role })}
      onBack={gotoHome} />;
  } else if (screen === 'game' && game) {
    const cap = computeCaptured(shown.board);
    const bottomSide = game.flipped ? 'b' : 'w';
    const topSide = other(bottomSide);
    const checkSq = E.inCheck(shown, shown.turn) ? E.kingPos(shown.board, shown.turn) : null;
    const lastMove = game.viewPly > 0 ? game.moves[game.viewPly - 1] : null;
    const capturedFor = (side) => (side === 'w' ? cap.capByWhite : cap.capByBlack);
    const advFor = (side) => (side === 'w' ? Math.max(cap.adv, 0) : Math.max(-cap.adv, 0));

    const boardEl = (
      <BoardView
        state={shown} flipped={game.flipped}
        selected={interactive ? sel : null}
        legalTargets={interactive && t.highlight ? legalTargetsFor(sel) : []}
        lastMove={lastMove} checkSquare={checkSq}
        pieceStyle={t.pieces} showCoords={t.showCoords} interactive={interactive}
        onSquareTap={onSquareTap}
        promo={promo} onPromo={onPromo} onPromoCancel={() => setPromo(null)}
      />
    );

    content = (
      <GameScreen
        title={game.role === 'spectator' ? 'Spectating' : `${game.tc.name} ${game.tc.id}`}
        subtitle={game.role === 'spectator' ? `${game.players.w.name} vs ${game.players.b.name}` : (game.playing ? (game.activeSide === game.myColor ? 'Your move' : `${game.players[other(game.myColor)].name} is thinking\u2026`) : 'Game over')}
        statusNote={game.playing && game.activeSide === game.myColor && game.role === 'player'}
        onExit={gotoHome}
        topPlayer={game.players[topSide]} bottomPlayer={game.players[bottomSide]}
        topClock={game.clocks[topSide]} bottomClock={game.clocks[bottomSide]}
        activeSide={game.activeSide}
        topCaptured={capturedFor(topSide)} bottomCaptured={capturedFor(bottomSide)}
        topAdv={advFor(topSide)} bottomAdv={advFor(bottomSide)}
        lowAt={Math.min(20000, game.tc.base * 1000 * 0.1)}
        board={boardEl}
        tab={tab} setTab={setTab}
        sans={game.sans} viewPly={game.viewPly} onSelectPly={selectPly} movesRef={movesRef}
        messages={game.messages} draft={draft} setDraft={setDraft} onSend={sendChat} chatRef={chatRef} unread={game.unread}
        isLive={isLive} atStart={game.viewPly === 0} atEnd={isLive} onStep={stepPly} onLive={goLive}
        role={game.role} playing={game.playing}
        onFlip={onFlip} onResign={onResign} onDraw={onDraw}
        drawBanner={game.drawByOpp} onAcceptDraw={onAcceptDraw} onDeclineDraw={onDeclineDraw}
      />
    );
  }

  const stageRef = React.useRef(null);
  React.useEffect(() => {
    const fit = () => {
      if (!stageRef.current) return;
      const W = 402, H = 874, pad = 20;
      const s = Math.min((window.innerWidth - pad) / W, (window.innerHeight - pad) / H, 1.06);
      stageRef.current.style.transform = `scale(${s})`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <React.Fragment>
      <div ref={stageRef} style={{ width: 402, height: 874, transformOrigin: 'center center', flexShrink: 0 }}>
        <IOSDevice dark>
          <div style={{ position: 'relative', height: '100%', paddingTop: 50, paddingBottom: 20, display: 'flex', background: 'var(--bg)' }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {content}
            </div>
            {toast && screen !== 'lobby' && <div className="toast" style={{ bottom: 70 }}>{toast}</div>}
            {game && game.result && screen === 'game' && (
              <ResultSheet
                result={game.role === 'spectator' ? (game.result.winnerSide === 'w' ? 'win' : game.result.winnerSide === 'b' ? 'loss' : 'draw') : game.result.result}
                title={game.role === 'spectator' ? resultTitleSpectator(game) : undefined}
                reason={(game.role === 'spectator' ? spectatorReason(game) : capitalize(game.result.reason))}
                delta={game.result.delta} newRating={game.result.newRating}
                onRematch={rematch} onHome={gotoHome} onReview={() => { setGame((g) => ({ ...g, result: null, viewPly: 0 })); setTab('moves'); }}
              />
            )}
          </div>
        </IOSDevice>
      </div>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio label="Background" value={t.theme} options={['night', 'midnight', 'arctic']} onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="Accent" value={t.accent} options={['#2ea6ff', '#38bdf8', '#7c8cf8', '#2dd4bf', '#f0883e']} onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Board" />
        <TweakSelect label="Squares" value={t.board} options={['blue', 'slate', 'walnut', 'forest']} onChange={(v) => setTweak('board', v)} />
        <TweakRadio label="Pieces" value={t.pieces} options={['flat', 'd3']} onChange={(v) => setTweak('pieces', v)} />
        <TweakToggle label="Coordinates" value={t.showCoords} onChange={(v) => setTweak('showCoords', v)} />
        <TweakToggle label="Move hints" value={t.highlight} onChange={(v) => setTweak('highlight', v)} />
        <TweakSection label="Session" />
        <TweakRadio label="Your role" value={t.role} options={['player', 'spectator']} onChange={(v) => setTweak('role', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function resultTitleSpectator(g) {
  if (!g.result.winnerSide) return 'Draw';
  return (g.players[g.result.winnerSide].name) + ' wins';
}
function spectatorReason(g) { return capitalize(g.result.reason); }

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
