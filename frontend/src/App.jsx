// Root component: navigation, live game state over WebSocket, server-driven
// clocks, matchmaking, friend invites, chat. The server is authoritative — we
// render its state and send intents (move/chat/resign/draw).
import React from 'react'
import { api, openGameSocket, openQueueSocket } from './lib/api.js'
import { Telegram } from './lib/telegram.js'
import {
  applyUci, boardFromFen, kingSquare,
  legalMovesFrom, positionAtPly, squareToRc, turnColor,
} from './lib/chesslib.js'
import { computeCaptured } from './components/ui.jsx'
import { BoardView } from './components/board.jsx'
import { GameScreen } from './components/game.jsx'
import { ClockApp } from './components/clock.jsx'
import { HomeScreen, LobbyScreen, MatchmakingScreen, ResultSheet, TIME_CONTROLS } from './components/screens.jsx'

const other = (c) => (c === 'white' ? 'black' : 'white')
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export default function App() {
  const [phase, setPhase] = React.useState('loading')   // loading|home|clock|match|lobby|connecting|game|error
  const [fatal, setFatal] = React.useState(null)
  const [me, setMe] = React.useState(null)
  const [recent, setRecent] = React.useState([])
  const [tc, setTc] = React.useState(TIME_CONTROLS[3])
  const [clockPresets, setClockPresets] = React.useState(null) // backend clock catalog (null → use built-in)

  // live game
  const [game, setGame] = React.useState(null)           // server game object
  const [youColor, setYouColor] = React.useState('spectator')
  const [optimisticFen, setOptimisticFen] = React.useState(null)
  // null = not yet set; set to your colour's orientation on first game state
  const [flipped, setFlipped] = React.useState(null)
  const [sel, setSel] = React.useState(null)
  const [promo, setPromo] = React.useState(null)
  const [tab, setTab] = React.useState('moves')
  const [draft, setDraft] = React.useState('')
  const [viewPly, setViewPly] = React.useState(null)     // null = live
  const [toast, setToast] = React.useState(null)
  const [seenChat, setSeenChat] = React.useState(0)
  const [resultDismissed, setResultDismissed] = React.useState(false)

  // matchmaking / lobby
  const [mmElapsed, setMmElapsed] = React.useState(0)
  const [mmFound, setMmFound] = React.useState(null)
  const [lobby, setLobby] = React.useState(null)

  // clocks
  const [clockBase, setClockBase] = React.useState(null) // {clocks, activeColor, recvAt}
  const [, forceTick] = React.useState(0)

  const wsRef = React.useRef(null)
  const queueRef = React.useRef(null)
  const movesRef = React.useRef(null)
  const chatRef = React.useRef(null)

  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(showToast._t)
    showToast._t = setTimeout(() => setToast(null), 1900)
  }

  // ── boot ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    Telegram.init()
    ;(async () => {
      try {
        await loadProfile()
        const sp = Telegram.startParam()
        if (sp) {
          setPhase('connecting')
          connectGame(sp)
        } else {
          setPhase('home')
        }
      } catch (e) {
        setFatal('Could not reach the server. Is the backend running?')
        setPhase('error')
      }
    })()
    return () => closeSockets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile() {
    const [profile, rec] = await Promise.all([api.me(), api.recent().catch(() => [])])
    setMe(profile)
    setRecent(rec)
    // best-effort: the standalone clock works offline, but prefer the server catalog
    api.clockPresets().then((p) => { if (Array.isArray(p) && p.length) setClockPresets(p) }).catch(() => {})
  }

  function closeSockets() {
    try { wsRef.current?.close() } catch (e) {}
    try { queueRef.current?.close() } catch (e) {}
    wsRef.current = null
    queueRef.current = null
  }

  // ── clock ticker ─────────────────────────────────────────────────
  React.useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 120)
    return () => clearInterval(id)
  }, [])

  function displayedClock(color) {
    if (!clockBase) return 0
    let ms = clockBase.clocks[color] ?? 0
    if (clockBase.activeColor === color) {
      ms -= Date.now() - clockBase.recvAt
    }
    return Math.max(0, ms)
  }

  // ── game socket ──────────────────────────────────────────────────
  function connectGame(gameId) {
    closeSockets()
    setResultDismissed(false)
    setViewPly(null)
    setSel(null)
    setPromo(null)
    setOptimisticFen(null)
    const ws = openGameSocket(gameId)
    wsRef.current = ws
    ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      handleServerMessage(msg)
    }
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null
    }
    ws.onerror = () => {}
  }

  function handleServerMessage(msg) {
    if (msg.type === 'state') {
      const g = msg.game
      setGame(g)
      setYouColor(msg.you.color)
      setOptimisticFen(null) // server is now the truth
      setClockBase({ clocks: g.clocks, activeColor: g.activeColor, recvAt: Date.now() })
      // orientation defaults to your colour the first time
      setFlipped((prev) => (prev === null ? msg.you.color === 'black' : prev))
      // phase upgrades
      setPhase((p) => {
        if (p === 'connecting') return 'game'
        if (p === 'lobby' && g.status === 'active') return 'game'
        return p
      })
      // lobby opponent indicator
      setLobby((l) => (l ? { ...l, joined: !!(g.players.white && g.players.black) } : l))
    } else if (msg.type === 'clock') {
      setClockBase({ clocks: msg.clocks, activeColor: msg.activeColor, recvAt: Date.now() })
    } else if (msg.type === 'error') {
      showToast(msg.message || 'Move rejected')
      setOptimisticFen(null) // revert optimistic
    }
  }

  function send(obj) {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }

  // ── navigation ───────────────────────────────────────────────────
  function gotoHome() {
    closeSockets()
    setGame(null)
    setLobby(null)
    setMmFound(null)
    setPhase('home')
    loadProfile().catch(() => {})
  }

  async function onPlayFriend() {
    try {
      const res = await api.createFriendGame(tc.id)
      setLobby({ link: res.inviteLink, joined: false })
      setPhase('lobby')
      connectGame(res.gameId)
    } catch (e) {
      showToast('Could not create game')
    }
  }

  function onFindOpponent() {
    setMmFound(null)
    setMmElapsed(0)
    setPhase('match')
    const qws = openQueueSocket(tc.id)
    queueRef.current = qws
    qws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.type === 'matched') {
        setMmFound({ name: 'Opponent', rating: '' })
        try { qws.close() } catch (e) {}
        queueRef.current = null
        setTimeout(() => { setPhase('game'); connectGame(msg.gameId) }, 700)
      }
    }
    qws.onclose = () => { if (queueRef.current === qws) queueRef.current = null }
  }

  // matchmaking elapsed timer
  React.useEffect(() => {
    if (phase !== 'match' || mmFound) return
    const id = setInterval(() => setMmElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [phase, mmFound])

  // ── derived game view ────────────────────────────────────────────
  const liveFen = game ? game.fen : null
  const sans = game ? game.sans : []
  const isLive = viewPly === null || viewPly >= sans.length
  const playing = game && game.status === 'active'

  // the position currently shown (live, optimistic, or review)
  const shown = React.useMemo(() => {
    if (!game) return null
    if (!isLive) {
      const { fen, lastMove } = positionAtPly(sans, viewPly)
      return { fen, lastMove }
    }
    const fen = optimisticFen || liveFen
    let lastMove = null
    if (optimisticFen) {
      // can't easily know from/to; skip highlight for the optimistic frame
      lastMove = null
    } else if (game.lastMove) {
      lastMove = { from: squareToRc(game.lastMove.slice(0, 2)), to: squareToRc(game.lastMove.slice(2, 4)) }
    }
    return { fen, lastMove }
  }, [game, optimisticFen, viewPly, isLive, sans, liveFen])

  const interactive =
    !!playing && isLive && !optimisticFen && youColor !== 'spectator' &&
    game && game.activeColor === youColor

  function legalTargetsFor(s) {
    if (!s || !shown) return []
    return legalMovesFrom(shown.fen, s[0], s[1]).map((m) => m.to)
  }

  function onSquareTap(r, c) {
    if (!interactive || !shown) return
    const board = boardFromFen(shown.fen)
    const piece = board[r][c]
    const myPrefix = youColor === 'white' ? 'w' : 'b'
    if (sel) {
      const moves = legalMovesFrom(shown.fen, sel[0], sel[1]).filter((m) => m.to[0] === r && m.to[1] === c)
      if (moves.length) {
        if (moves[0].promotion) { setPromo({ from: sel, sq: [r, c], color: youColor }); return }
        doMove(moves[0].uci); return
      }
      if (piece && piece[0] === myPrefix) { selectSquare(r, c); return }
      setSel(null)
    } else if (piece && piece[0] === myPrefix) {
      selectSquare(r, c)
    }
  }

  function selectSquare(r, c) {
    const targets = legalMovesFrom(shown.fen, r, c)
    setSel(targets.length ? [r, c] : null)
  }

  function doMove(uci) {
    const next = applyUci(shown.fen, uci)
    if (next) setOptimisticFen(next)
    send({ type: 'move', uci })
    Telegram.haptic('light')
    setSel(null)
    setPromo(null)
  }

  function onPromo(type) {
    const m = legalMovesFrom(shown.fen, promo.from[0], promo.from[1])
      .find((x) => x.to[0] === promo.sq[0] && x.to[1] === promo.sq[1] && x.promotion === type)
    if (m) doMove(m.uci)
  }

  // ── controls ─────────────────────────────────────────────────────
  const onFlip = () => setFlipped((f) => !f)
  const onResign = () => Telegram.confirm('Resign this game?', (ok) => { if (ok) send({ type: 'resign' }) })
  const onDraw = () => { send({ type: 'offer_draw' }); showToast('Draw offer sent') }
  const onAcceptDraw = () => send({ type: 'accept_draw' })
  const onDeclineDraw = () => send({ type: 'decline_draw' })

  const selectPly = (p) => { setViewPly(p >= sans.length ? null : p); setSel(null) }
  const stepPly = (d) => {
    const cur = viewPly === null ? sans.length : viewPly
    const nv = Math.max(0, Math.min(sans.length, cur + d))
    setViewPly(nv >= sans.length ? null : nv)
    setSel(null)
  }
  const goLive = () => { setViewPly(null); setSel(null) }

  function sendChat() {
    const text = draft.trim()
    if (!text) return
    send({ type: 'chat', text })
    setDraft('')
  }

  function rematch() {
    // start a fresh invite lobby with the same time control
    onPlayFriend()
  }

  // copy / share invite
  const onCopy = () => {
    if (lobby?.link) {
      navigator.clipboard?.writeText(lobby.link).catch(() => {})
      showToast('Link copied to clipboard')
    }
  }
  const onShare = () => { if (lobby?.link) Telegram.shareGame(lobby.link) }

  // chat unread badge
  const oppChatCount = game ? game.messages.filter((m) => m.from !== 'sys' && m.from !== youColor).length : 0
  const unread = Math.max(0, oppChatCount - seenChat)
  React.useEffect(() => { if (tab === 'chat') setSeenChat(oppChatCount) }, [tab, oppChatCount])

  // auto-scroll
  React.useEffect(() => { if (movesRef.current) movesRef.current.scrollTop = movesRef.current.scrollHeight }, [sans.length, tab])
  React.useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [game?.messages.length, tab])

  // ── render ───────────────────────────────────────────────────────
  let content = null

  if (phase === 'loading' || phase === 'connecting') {
    content = (
      <div className="tg-app"><div className="status-screen">
        <span className="spinner" style={{ width: 30, height: 30 }} />
        <div>{phase === 'connecting' ? 'Joining game…' : 'Loading…'}</div>
      </div></div>
    )
  } else if (phase === 'error') {
    content = (
      <div className="tg-app"><div className="status-screen">
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Something went wrong</div>
        <div>{fatal}</div>
        <button className="btn btn-ghost" onClick={() => location.reload()}>Reload</button>
      </div></div>
    )
  } else if (phase === 'home' && me) {
    content = (
      <HomeScreen me={me} tc={tc} setTc={setTc} recent={recent}
        onPlayFriend={onPlayFriend} onFindOpponent={onFindOpponent}
        onOpenClock={() => setPhase('clock')} />
    )
  } else if (phase === 'clock') {
    content = <ClockApp onExit={gotoHome} presets={clockPresets} />
  } else if (phase === 'match') {
    content = (
      <MatchmakingScreen tc={tc} elapsed={mmElapsed} found={!!mmFound}
        opponent={mmFound || {}} onCancel={gotoHome} />
    )
  } else if (phase === 'lobby' && lobby) {
    content = (
      <LobbyScreen tc={tc} link={lobby.link} joined={lobby.joined}
        opponent={game?.players ? (game.players.white && game.players.black ? game.players.black : {}) : {}}
        me={me} toast={toast} onCopy={onCopy} onShare={onShare} onBack={gotoHome} />
    )
  } else if (phase === 'game' && game && shown) {
    content = renderGame()
  }

  function renderGame() {
    const board = boardFromFen(shown.fen)
    const capInfo = computeCaptured(board)
    const bottomColor = flipped ? 'black' : 'white'
    const topColor = other(bottomColor)
    const sideToMove = turnColor(shown.fen)
    const checkSq = (() => {
      // highlight king in check (live position only)
      if (!isLive || !game.check) return null
      return kingSquare(shown.fen, sideToMove)
    })()

    const annotate = (color) => {
      const p = game.players[color]
      if (!p) return null
      return { ...p, you: youColor !== 'spectator' && color === youColor }
    }
    const capturedFor = (color) => (color === 'white' ? capInfo.capByWhite : capInfo.capByBlack)
    const advFor = (color) => (color === 'white' ? Math.max(capInfo.adv, 0) : Math.max(-capInfo.adv, 0))

    const boardEl = (
      <BoardView
        board={board} flipped={flipped}
        selected={interactive ? sel : null}
        legalTargets={interactive ? legalTargetsFor(sel) : []}
        lastMove={shown.lastMove} checkSquare={checkSq}
        pieceStyle="flat" showCoords interactive={interactive}
        onSquareTap={onSquareTap}
        promo={promo} onPromo={onPromo} onPromoCancel={() => setPromo(null)}
      />
    )

    const spectator = youColor === 'spectator'
    const oppColor = spectator ? null : other(youColor)
    const subtitle = spectator
      ? `${game.players.white?.name || 'White'} vs ${game.players.black?.name || 'Black'}`
      : (playing
          ? (game.activeColor === youColor ? 'Your move' : `${game.players[oppColor]?.name || 'Opponent'} is thinking…`)
          : 'Game over')

    return (
      <GameScreen
        title={spectator ? 'Spectating' : `${game.tc.name} ${game.tc.id}`}
        subtitle={subtitle}
        statusNote={playing && game.activeColor === youColor && !spectator}
        onExit={gotoHome}
        topPlayer={annotate(topColor)} bottomPlayer={annotate(bottomColor)}
        topClock={displayedClock(topColor)} bottomClock={displayedClock(bottomColor)}
        activeSide={game.activeColor}
        topCaptured={capturedFor(topColor)} bottomCaptured={capturedFor(bottomColor)}
        topAdv={advFor(topColor)} bottomAdv={advFor(bottomColor)}
        lowAt={Math.min(20000, game.tc.base * 1000 * 0.1)}
        board={boardEl}
        tab={tab} setTab={setTab}
        sans={sans} viewPly={viewPly === null ? sans.length : viewPly} onSelectPly={selectPly} movesRef={movesRef}
        messages={game.messages} draft={draft} setDraft={setDraft} onSend={sendChat} chatRef={chatRef} unread={unread} youColor={youColor}
        isLive={isLive} atStart={(viewPly === null ? sans.length : viewPly) === 0} atEnd={isLive} onStep={stepPly} onLive={goLive}
        canControl={!spectator} playing={playing}
        onFlip={onFlip} onResign={onResign} onDraw={onDraw}
        drawBanner={!spectator && game.drawOffer && game.drawOffer !== youColor}
        onAcceptDraw={onAcceptDraw} onDeclineDraw={onDeclineDraw}
      />
    )
  }

  // result sheet overlay
  const resultSheet = (() => {
    if (phase !== 'game' || !game || game.status !== 'finished' || !game.result || resultDismissed) return null
    const r = game.result
    const spectator = youColor === 'spectator'
    let outcome, title, delta, newRating
    if (spectator) {
      outcome = r.winner ? 'win' : 'draw'
      title = r.winner ? `${game.players[r.winner]?.name || cap(r.winner)} wins` : 'Draw'
    } else {
      outcome = !r.winner ? 'draw' : (r.winner === youColor ? 'win' : 'loss')
      delta = youColor === 'white' ? r.whiteDelta : r.blackDelta
      const startRating = game.players[youColor]?.rating
      if (delta != null && startRating != null) newRating = startRating + delta
    }
    return (
      <ResultSheet
        result={outcome} title={spectator ? title : undefined}
        reason={cap(r.reason || 'Game over')}
        delta={delta} newRating={newRating}
        onRematch={spectator ? null : rematch}
        onHome={gotoHome}
        onReview={() => { setResultDismissed(true); setViewPly(0); setTab('moves') }}
      />
    )
  })()

  return (
    <div className="app-root">
      {content}
      {toast && phase !== 'lobby' && <div className="toast">{toast}</div>}
      {resultSheet}
    </div>
  )
}
