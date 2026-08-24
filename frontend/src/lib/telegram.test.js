import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Telegram.devId', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('generates and persists a dev id when none exists yet', async () => {
    expect(localStorage.getItem('chess_dev_id')).toBeNull()
    const { Telegram } = await import('./telegram.js')
    expect(Telegram.devId).toBeTruthy()
    expect(localStorage.getItem('chess_dev_id')).toBe(Telegram.devId)
  })

  it('reuses an existing dev id on a fresh module load', async () => {
    localStorage.setItem('chess_dev_id', '123456789')
    const { Telegram } = await import('./telegram.js')
    expect(Telegram.devId).toBe('123456789')
  })
})

describe('Telegram.startParam', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('reads ?startapp= from the URL when window.Telegram is undefined', async () => {
    window.history.pushState({}, '', '/?startapp=abc123')
    const { Telegram } = await import('./telegram.js')
    expect(Telegram.startParam()).toBe('abc123')
  })

  it('reads ?tgWebAppStartParam= as a fallback', async () => {
    window.history.pushState({}, '', '/?tgWebAppStartParam=xyz789')
    const { Telegram } = await import('./telegram.js')
    expect(Telegram.startParam()).toBe('xyz789')
  })

  it('returns null when no start param is present', async () => {
    window.history.pushState({}, '', '/')
    const { Telegram } = await import('./telegram.js')
    expect(Telegram.startParam()).toBeNull()
  })
})

describe('Telegram.authParams', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    window.history.pushState({}, '', '/')
  })

  it('falls back to dev_id when there is no initData (no window.Telegram in jsdom)', async () => {
    const { Telegram } = await import('./telegram.js')
    expect(Telegram.initData).toBe('')
    const params = new URLSearchParams(Telegram.authParams())
    expect(params.get('dev_id')).toBe(Telegram.devId)
    expect(params.has('initData')).toBe(false)
  })
})
