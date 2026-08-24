import { describe, it, expect } from 'vitest'
import { fmtClk, initClock, clockReducer } from './clock.jsx'

describe('fmtClk', () => {
  it('shows tenths near zero (<10s)', () => {
    expect(fmtClk(500)).toEqual({ main: '0.5', sub: null, tenths: true })
    expect(fmtClk(9999)).toEqual({ main: '9.9', sub: null, tenths: true })
  })

  it('at exactly 0 or below, returns 0.0 with tenths true', () => {
    expect(fmtClk(0)).toEqual({ main: '0.0', sub: null, tenths: true })
    expect(fmtClk(-50)).toEqual({ main: '0.0', sub: null, tenths: true })
  })

  it('shows m:ss for >=10s', () => {
    const f = fmtClk(10000)
    expect(f.tenths).toBe(false)
    expect(f.main).toBe('0:10')
    expect(fmtClk(65000).main).toBe('1:05')
  })

  it('shows h:mm:ss for >=1hr', () => {
    expect(fmtClk(3665000).main).toBe('1:01:05')
  })
})

describe('initClock', () => {
  it('starts in setup status with both players at baseMs', () => {
    const config = { baseMs: 300000, incrementMs: 0, delayMs: 0, label: '5+0' }
    const state = initClock(config)
    expect(state.status).toBe('setup')
    expect(state.players.top.remainingMs).toBe(300000)
    expect(state.players.bottom.remainingMs).toBe(300000)
    expect(state.players.top.moveCount).toBe(0)
    expect(state.players.bottom.moveCount).toBe(0)
  })
})

const config = { baseMs: 60000, incrementMs: 1000, delayMs: 0, label: '1+1' }
const delayConfig = { baseMs: 60000, incrementMs: 0, delayMs: 2000, label: '1 d2' }

describe('clockReducer CONFIGURE', () => {
  it('moves to ready status with fresh players', () => {
    const state = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    expect(state.status).toBe('ready')
    expect(state.players.top.remainingMs).toBe(config.baseMs)
    expect(state.players.bottom.remainingMs).toBe(config.baseMs)
  })
})

describe('clockReducer START', () => {
  it('tapping a panel starts the OPPOSITE side\'s clock', () => {
    const ready = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    const started = clockReducer(ready, { type: 'START', panel: 'top' })
    expect(started.status).toBe('running')
    expect(started.active).toBe('bottom')
  })

  it('is a no-op unless status is ready', () => {
    const running = { status: 'running', config, players: initClock(config).players, active: 'top', delayRemainingMs: 0, winner: null }
    const result = clockReducer(running, { type: 'START', panel: 'bottom' })
    expect(result).toBe(running)
  })
})

describe('clockReducer SWITCH', () => {
  function runningState() {
    const ready = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    return clockReducer(ready, { type: 'START', panel: 'top' }) // active = bottom
  }

  it('applies increment + moveCount to the active panel and flips active', () => {
    const state = runningState()
    expect(state.active).toBe('bottom')
    const next = clockReducer(state, { type: 'SWITCH', panel: 'bottom' })
    expect(next.players.bottom.remainingMs).toBe(config.baseMs + config.incrementMs)
    expect(next.players.bottom.moveCount).toBe(1)
    expect(next.active).toBe('top')
    expect(next.delayRemainingMs).toBe(config.delayMs)
  })

  it('is a no-op when panel !== active', () => {
    const state = runningState() // active = bottom
    const next = clockReducer(state, { type: 'SWITCH', panel: 'top' })
    expect(next).toBe(state)
  })

  it('is a no-op when status is not running', () => {
    const ready = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    const next = clockReducer(ready, { type: 'SWITCH', panel: 'top' })
    expect(next).toBe(ready)
  })

  it('resets delayRemainingMs to config.delayMs on switch', () => {
    const ready = clockReducer(initClock(delayConfig), { type: 'CONFIGURE', config: delayConfig })
    const started = clockReducer(ready, { type: 'START', panel: 'top' }) // active bottom, delay 2000
    const ticked = clockReducer(started, { type: 'TICK', delta: 500 }) // eat into delay
    expect(ticked.delayRemainingMs).toBe(1500)
    const switched = clockReducer(ticked, { type: 'SWITCH', panel: 'bottom' })
    expect(switched.delayRemainingMs).toBe(delayConfig.delayMs)
  })
})

describe('clockReducer TICK', () => {
  function runningState(cfg) {
    const ready = clockReducer(initClock(cfg), { type: 'CONFIGURE', config: cfg })
    return clockReducer(ready, { type: 'START', panel: 'top' }) // active = bottom
  }

  it('consumes delay before deducting remainingMs', () => {
    const state = runningState(delayConfig) // delayRemainingMs = 2000
    const next = clockReducer(state, { type: 'TICK', delta: 1000 })
    expect(next.delayRemainingMs).toBe(1000)
    expect(next.players.bottom.remainingMs).toBe(delayConfig.baseMs) // untouched, still in delay
  })

  it('deducts remainingMs once delay is exhausted', () => {
    let state = runningState(delayConfig)
    state = clockReducer(state, { type: 'TICK', delta: 2000 }) // exhausts delay exactly
    expect(state.delayRemainingMs).toBe(0)
    expect(state.players.bottom.remainingMs).toBe(delayConfig.baseMs)
    state = clockReducer(state, { type: 'TICK', delta: 500 })
    expect(state.players.bottom.remainingMs).toBe(delayConfig.baseMs - 500)
  })

  it('flags the active side and ends the game when remainingMs would go <= 0', () => {
    const cfg = { baseMs: 1000, incrementMs: 0, delayMs: 0, label: 't' }
    let state = runningState(cfg) // active = bottom
    state = clockReducer(state, { type: 'TICK', delta: 1500 })
    expect(state.players.bottom.remainingMs).toBe(0)
    expect(state.players.bottom.flagged).toBe(true)
    expect(state.status).toBe('finished')
    expect(state.active).toBeNull()
    expect(state.winner).toBe('top')
  })

  it('is a no-op when not running', () => {
    const ready = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    const next = clockReducer(ready, { type: 'TICK', delta: 100 })
    expect(next).toBe(ready)
  })
})

describe('clockReducer PAUSE/RESUME', () => {
  it('PAUSE only transitions running -> paused', () => {
    const ready = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    const running = clockReducer(ready, { type: 'START', panel: 'top' })
    const paused = clockReducer(running, { type: 'PAUSE' })
    expect(paused.status).toBe('paused')
    // no-op from ready
    expect(clockReducer(ready, { type: 'PAUSE' })).toBe(ready)
  })

  it('RESUME only transitions paused -> running', () => {
    const ready = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    const running = clockReducer(ready, { type: 'START', panel: 'top' })
    const paused = clockReducer(running, { type: 'PAUSE' })
    const resumed = clockReducer(paused, { type: 'RESUME' })
    expect(resumed.status).toBe('running')
    // no-op from running
    expect(clockReducer(running, { type: 'RESUME' })).toBe(running)
  })
})

describe('clockReducer RESET', () => {
  it('returns to ready status with fresh players from state.config', () => {
    let state = clockReducer(initClock(config), { type: 'CONFIGURE', config })
    state = clockReducer(state, { type: 'START', panel: 'top' })
    state = clockReducer(state, { type: 'TICK', delta: 5000 })
    const reset = clockReducer(state, { type: 'RESET' })
    expect(reset.status).toBe('ready')
    expect(reset.players.top.remainingMs).toBe(config.baseMs)
    expect(reset.players.bottom.remainingMs).toBe(config.baseMs)
  })
})
