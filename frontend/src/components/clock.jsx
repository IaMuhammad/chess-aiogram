// Standalone two-player chess clock — a local mode inside the Mini App.
// One device, two players across the board: one clock runs while the other is
// frozen; tap your side to hand the running clock to your opponent.
//
// Self-contained: own reducer + interval loop (real wall-clock deltas, so
// background time is billed correctly), localStorage persistence, WebAudio +
// haptic feedback. Inherits the app's theme tokens from styles.css.
// Ported from the design (window globals → ES module, shared Icon/TgHeader).
import React from 'react'
import { Icon, TgHeader } from './ui.jsx'

// ── Presets ──────────────────────────────────────────────────────
// Built-in fallback; the backend (/api/clock/presets) is the source of truth
// when reachable and is passed in via the `presets` prop.
export const CLOCK_PRESETS = [
  { id: '1+0',   min: 1,  sec: 0,  mode: 'inc',   name: 'Bullet',    cat: 'Bullet' },
  { id: '1+1',   min: 1,  sec: 1,  mode: 'inc',   name: 'Bullet',    cat: 'Bullet' },
  { id: '3+0',   min: 3,  sec: 0,  mode: 'inc',   name: 'Blitz',     cat: 'Blitz' },
  { id: '3+2',   min: 3,  sec: 2,  mode: 'inc',   name: 'Blitz',     cat: 'Blitz' },
  { id: '5+0',   min: 5,  sec: 0,  mode: 'inc',   name: 'Blitz',     cat: 'Blitz' },
  { id: '5+3',   min: 5,  sec: 3,  mode: 'inc',   name: 'Blitz',     cat: 'Blitz' },
  { id: '10+0',  min: 10, sec: 0,  mode: 'inc',   name: 'Rapid',     cat: 'Rapid' },
  { id: '10+5',  min: 10, sec: 5,  mode: 'inc',   name: 'Rapid',     cat: 'Rapid' },
  { id: '15+10', min: 15, sec: 10, mode: 'inc',   name: 'Rapid',     cat: 'Rapid' },
  { id: '30+0',  min: 30, sec: 0,  mode: 'inc',   name: 'Classical', cat: 'Classical' },
  { id: '30+30', min: 30, sec: 30, mode: 'inc',   name: 'Classical', cat: 'Classical' },
]

function presetToConfig(p) {
  return {
    baseMs: p.min * 60000,
    incrementMs: p.mode === 'inc' ? p.sec * 1000 : 0,
    delayMs: p.mode === 'delay' ? p.sec * 1000 : 0,
    label: p.id + (p.mode === 'delay' ? ' d' : ''),
  }
}

// ── Display formatting ───────────────────────────────────────────
export function fmtClk(ms) {
  if (ms <= 0) return { main: '0.0', sub: null, tenths: true }
  if (ms < 10000) {
    const t = Math.floor(ms / 100) / 10
    return { main: t.toFixed(1), sub: null, tenths: true }
  }
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return { main: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, tenths: false }
  return { main: `${m}:${String(s).padStart(2, '0')}`, tenths: false }
}

const opp = (p) => (p === 'top' ? 'bottom' : 'top')

// ── State ────────────────────────────────────────────────────────
function freshPlayers(baseMs) {
  return {
    top: { remainingMs: baseMs, moveCount: 0, flagged: false },
    bottom: { remainingMs: baseMs, moveCount: 0, flagged: false },
  }
}
export function initClock(config) {
  return {
    status: 'setup', config,
    players: freshPlayers(config.baseMs),
    active: null, delayRemainingMs: 0, winner: null,
  }
}

export function clockReducer(state, a) {
  switch (a.type) {
    case 'CONFIGURE':
      return { ...initClock(a.config), status: 'ready' }
    case 'TO_SETUP':
      return { ...state, status: 'setup' }
    case 'START': {
      if (state.status !== 'ready') return state
      const active = opp(a.panel) // tapping your side starts the opponent's clock
      return { ...state, status: 'running', active, delayRemainingMs: state.config.delayMs }
    }
    case 'SWITCH': {
      if (state.status !== 'running' || state.active !== a.panel) return state
      const players = { ...state.players, [a.panel]: { ...state.players[a.panel] } }
      players[a.panel].remainingMs += state.config.incrementMs // increment on move completion
      players[a.panel].moveCount += 1
      return { ...state, players, active: opp(a.panel), delayRemainingMs: state.config.delayMs }
    }
    case 'TICK': {
      if (state.status !== 'running' || !state.active) return state
      let d = a.delta
      let delayRemainingMs = state.delayRemainingMs
      if (delayRemainingMs > 0) {
        const used = Math.min(delayRemainingMs, d)
        delayRemainingMs -= used; d -= used
      }
      if (d <= 0) return { ...state, delayRemainingMs }
      const side = state.active
      let rem = state.players[side].remainingMs - d
      if (rem <= 0) {
        const players = { ...state.players, [side]: { ...state.players[side], remainingMs: 0, flagged: true } }
        return { ...state, players, delayRemainingMs: 0, status: 'finished', active: null, winner: opp(side) }
      }
      const players = { ...state.players, [side]: { ...state.players[side], remainingMs: rem } }
      return { ...state, players, delayRemainingMs }
    }
    case 'PAUSE':  return state.status === 'running' ? { ...state, status: 'paused' } : state
    case 'RESUME': return state.status === 'paused' ? { ...state, status: 'running' } : state
    case 'RESET':
      return { ...initClock(state.config), status: 'ready' }
    default: return state
  }
}

// ── Audio + haptics ──────────────────────────────────────────────
let _actx = null
function ensureAudio() {
  try { if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)(); if (_actx.state === 'suspended') _actx.resume() } catch (e) {}
}
function beep(freq, dur, when, vol) {
  if (!_actx) return
  try {
    const o = _actx.createOscillator(), g = _actx.createGain()
    o.type = 'square'; o.frequency.value = freq
    const t0 = _actx.currentTime + (when || 0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(_actx.destination)
    o.start(t0); o.stop(t0 + dur + 0.02)
  } catch (e) {}
}
function tickSound() { ensureAudio(); beep(660, 0.05, 0, 0.05) }
function flagSound() { ensureAudio(); beep(330, 0.18, 0, 0.06); beep(247, 0.26, 0.16, 0.06) }
function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms) } catch (e) {} }

// safe storage
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v) } catch (e) { return fb } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} },
}

// ── Setup screen ─────────────────────────────────────────────────
function ClockSetup({ presets, cats, onStart, onExit, lastPresetId }) {
  const [sel, setSel] = React.useState(() => (presets.some((p) => p.id === lastPresetId) ? lastPresetId : (presets[0] && presets[0].id)))
  const [custom, setCustom] = React.useState(false)
  const [min, setMin] = React.useState(5)
  const [mode, setMode] = React.useState('inc')
  const [sec, setSec] = React.useState(3)

  const step = (v, d, lo, hi) => Math.max(lo, Math.min(hi, v + d))
  const customConfig = {
    baseMs: min * 60000,
    incrementMs: mode === 'inc' ? sec * 1000 : 0,
    delayMs: mode === 'delay' ? sec * 1000 : 0,
    label: `${min}:00 ${mode === 'inc' ? '+' : 'd'}${sec}`,
  }
  const canStart = custom ? min > 0 : true

  function start() {
    if (custom) { onStart(customConfig, null) }
    else { const p = presets.find((x) => x.id === sel); if (p) onStart(presetToConfig(p), p.id) }
  }

  return (
    <div className="tg-app">
      <TgHeader title="Chess clock" subtitle="Two players · one device" onBack={onExit} />
      <div className="tg-scroll" style={{ padding: '6px 12px 12px' }}>
        <div style={{ display: 'flex', gap: 8, padding: '8px 2px 14px' }}>
          <button className="btn btn-ghost" style={{ flex: 1, padding: '11px 0' }} data-seg={!custom} onClick={() => setCustom(false)}>Presets</button>
          <button className="btn btn-ghost" style={{ flex: 1, padding: '11px 0' }} data-seg={custom} onClick={() => setCustom(true)}>Custom</button>
        </div>

        {!custom ? (
          cats.map((cat) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.6px', padding: '0 2px 9px' }}>{cat}</div>
              <div className="chips">
                {presets.filter((p) => p.cat === cat).map((p) => (
                  <div key={p.id} className="chip" data-on={!custom && sel === p.id} onClick={() => setSel(p.id)}>
                    <div className="chip-time">{p.id}</div>
                    <div className="chip-name">{p.sec > 0 ? (p.mode === 'delay' ? 'delay' : '+' + p.sec) : 'sudden'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Stepper label="Base time" value={min} unit="min" onDec={() => setMin((v) => step(v, -1, 0, 180))} onInc={() => setMin((v) => step(v, 1, 0, 180))} display={`${min} min`} />
            <div>
              <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 9, fontWeight: 600 }}>Bonus type</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, padding: '10px 0' }} data-seg={mode === 'inc'} onClick={() => setMode('inc')}>Increment</button>
                <button className="btn btn-ghost" style={{ flex: 1, padding: '10px 0' }} data-seg={mode === 'delay'} onClick={() => setMode('delay')}>Delay</button>
              </div>
            </div>
            <Stepper label={mode === 'inc' ? 'Increment' : 'Delay'} value={sec} unit="sec" onDec={() => setSec((v) => step(v, -1, 0, 60))} onInc={() => setSec((v) => step(v, 1, 0, 60))} display={`${sec} sec`} />
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--hint)' }}>
              {min === 0 ? 'Base time must be above zero' : `${min} min ${mode === 'inc' ? `+ ${sec}s / move` : `with ${sec}s delay`}`}
            </div>
          </div>
        )}
      </div>
      <div className="controls" style={{ borderTop: 'none' }}>
        <button className="btn btn-primary btn-block" disabled={!canStart} onClick={start}>
          <Icon name="clock" size={20} /> Start clock
        </button>
      </div>
    </div>
  )
}

function Stepper({ label, display, onDec, onInc }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 9, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="stepper-btn" onClick={onDec} aria-label="Decrease">−</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 21, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{display}</div>
        <button className="stepper-btn" onClick={onInc} aria-label="Increase">+</button>
      </div>
    </div>
  )
}

// ── Running / clock screen ───────────────────────────────────────
function ClockPanel({ side, player, isActive, isWarn, status, winner, delayMs, reduceMotion, onTap }) {
  const f = fmtClk(player.remainingMs)
  let mood = 'idle'
  if (status === 'finished') mood = winner === side ? 'winner' : 'loser'
  else if (status === 'ready') mood = 'ready'
  else if (isActive) mood = isWarn ? 'warn' : 'active'

  const inDelay = isActive && delayMs > 0 && status === 'running'
  return (
    <div className="clk-panel" data-mood={mood} data-rm={reduceMotion} onClick={onTap}>
      <div className="clk-inner" style={{ transform: side === 'top' ? 'rotate(180deg)' : 'none' }}>
        {status === 'ready' && <div className="clk-hint">tap when ready</div>}
        {status === 'finished' && (
          <div className="clk-badge" data-win={winner === side}>
            {winner === side ? 'Winner' : 'Flag fell'}
          </div>
        )}
        <div className={'clk-time' + (f.tenths ? ' is-tenths' : '')}>{f.main}</div>
        <div className="clk-meta">
          {inDelay
            ? <span className="clk-delay">delay {Math.ceil(delayMs / 1000)}s</span>
            : <span>move {player.moveCount + 1}</span>}
        </div>
      </div>
    </div>
  )
}

export function ClockApp({ onExit, presets }) {
  const PRESETS = (presets && presets.length) ? presets : CLOCK_PRESETS
  const CATS = React.useMemo(() => [...new Set(PRESETS.map((p) => p.cat))], [PRESETS])
  const defaultPreset = React.useMemo(
    () => PRESETS.find((p) => p.id === '5+0') || PRESETS[0] || CLOCK_PRESETS[4],
    [PRESETS],
  )
  const reduceMotion = React.useMemo(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) { return false }
  }, [])

  const lastPreset = store.get('clk_preset', defaultPreset.id)
  const [state, dispatch] = React.useReducer(clockReducer, store.get('clk_config', presetToConfig(defaultPreset)), initClock)
  const [muted, setMuted] = React.useState(() => store.get('clk_muted', false))
  const lastSwitch = React.useRef(0)
  const mutedRef = React.useRef(muted); mutedRef.current = muted

  // tick loop — interval cadence, but time math from real wall-clock deltas.
  // setInterval survives background throttling (catches up via delta); no naive -=100.
  React.useEffect(() => {
    if (state.status !== 'running') return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const d = now - last; last = now
      if (d > 0) dispatch({ type: 'TICK', delta: d })
    }, 100)
    const onVis = () => { if (!document.hidden) { const now = performance.now(); const d = now - last; last = now; if (d > 0) dispatch({ type: 'TICK', delta: d }) } }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [state.status])

  // flag-fall sound
  const prevStatus = React.useRef(state.status)
  React.useEffect(() => {
    if (state.status === 'finished' && prevStatus.current !== 'finished') {
      if (!mutedRef.current) flagSound()
      haptic([40, 60, 120])
    }
    prevStatus.current = state.status
  }, [state.status])

  function feedback() { if (!mutedRef.current) tickSound(); haptic(18) }

  function tapPanel(panel) {
    if (state.status === 'ready') { ensureAudio(); dispatch({ type: 'START', panel }); feedback(); return }
    if (state.status === 'running' && state.active === panel) {
      const now = performance.now()
      if (now - lastSwitch.current < 130) return // debounce double-tap
      lastSwitch.current = now
      dispatch({ type: 'SWITCH', panel }); feedback()
    }
  }

  // keyboard (desktop): top = A/↑, bottom = L/↓, Space = pause/resume
  React.useEffect(() => {
    const onKey = (e) => {
      if (state.status === 'setup') return
      const k = e.key.toLowerCase()
      if (k === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (state.status === 'running') dispatch({ type: 'PAUSE' })
        else if (state.status === 'paused') dispatch({ type: 'RESUME' })
      } else if (k === 'a' || k === 'arrowup') { e.preventDefault(); tapPanel('top') }
      else if (k === 'l' || k === 'arrowdown') { e.preventDefault(); tapPanel('bottom') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.active])

  function configure(config, presetId) {
    if (presetId) store.set('clk_preset', presetId)
    store.set('clk_config', config)
    dispatch({ type: 'CONFIGURE', config })
  }
  function toggleMute() { setMuted((m) => { store.set('clk_muted', !m); return !m }) }

  if (state.status === 'setup') {
    return <ClockSetup presets={PRESETS} cats={CATS} onStart={configure} onExit={onExit} lastPresetId={lastPreset} />
  }

  const warnT = state.players.top.remainingMs < 10000
  const warnW = state.players.bottom.remainingMs < 10000
  const running = state.status === 'running'
  const paused = state.status === 'paused'
  const finished = state.status === 'finished'

  return (
    <div className="clk-root">
      <ClockPanel side="top" player={state.players.top} isActive={state.active === 'top'} isWarn={warnT}
        status={state.status} winner={state.winner} delayMs={state.active === 'top' ? state.delayRemainingMs : 0} reduceMotion={reduceMotion} onTap={() => tapPanel('top')} />

      <div className="clk-bar">
        <button className="clk-ctrl" onClick={onExit} aria-label="Exit"><Icon name="back" size={20} /></button>
        <button className="clk-ctrl" onClick={() => dispatch({ type: 'RESET' })} aria-label="Reset"><Icon name="redo" size={20} /></button>
        {!finished ? (
          <button className="clk-ctrl clk-ctrl-main" onClick={() => dispatch({ type: paused ? 'RESUME' : 'PAUSE' })} aria-label={paused ? 'Resume' : 'Pause'} disabled={state.status === 'ready'}>
            {running
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>}
          </button>
        ) : (
          <button className="clk-ctrl clk-ctrl-main" onClick={() => dispatch({ type: 'RESET' })} aria-label="Rematch">
            <Icon name="redo" size={20} color="#fff" />
          </button>
        )}
        <button className="clk-ctrl" onClick={toggleMute} aria-label="Mute" data-on={muted}>
          {muted
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M19 6a8 8 0 0 1 0 12" /></svg>}
        </button>
        <button className="clk-ctrl" onClick={() => dispatch({ type: 'TO_SETUP' })} aria-label="Time control"><Icon name="clock" size={19} /></button>
      </div>

      <ClockPanel side="bottom" player={state.players.bottom} isActive={state.active === 'bottom'} isWarn={warnW}
        status={state.status} winner={state.winner} delayMs={state.active === 'bottom' ? state.delayRemainingMs : 0} reduceMotion={reduceMotion} onTap={() => tapPanel('bottom')} />

      {paused && (
        <div className="clk-paused" onClick={() => dispatch({ type: 'RESUME' })}>
          <div className="clk-paused-card">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8z" /></svg>
            <div>Paused — tap to resume</div>
          </div>
        </div>
      )}
    </div>
  )
}
