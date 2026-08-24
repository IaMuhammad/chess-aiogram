// REST + WebSocket client. All requests carry Telegram auth (initData) or a
// dev id. URLs are same-origin relative; Vite proxies them to the backend in
// dev, and FastAPI serves them directly in production.
import { Telegram } from './telegram.js'
import { reportError } from './logger.js'

// Absolute API base when the frontend is hosted separately from the backend.
// Empty (the default) → same-origin relative URLs, proxied by Vite in dev and
// served by FastAPI in production.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
const url = (path) => API_BASE + path

async function get(path) {
  try {
    const res = await fetch(url(path), { headers: Telegram.authHeaders() })
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
    return await res.json()
  } catch (e) {
    reportError(e, `GET ${path}`)
    throw e
  }
}

async function post(path, body) {
  try {
    const res = await fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...Telegram.authHeaders() },
      body: JSON.stringify(body || {}),
    })
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
    return await res.json()
  } catch (e) {
    reportError(e, `POST ${path}`)
    throw e
  }
}

export const api = {
  config: () => get('/api/config'),
  me: () => get('/api/me'),
  recent: () => get('/api/recent'),
  clockPresets: () => get('/api/clock/presets'),
  createFriendGame: (tc) => post('/api/games/friend', { tc }),
  gameInfo: (id) => get(`/api/games/${id}`),
}

function wsBase() {
  // When API_BASE points at a separate backend, derive the ws origin from it;
  // otherwise use the current page origin (same-origin / Vite-proxied).
  if (API_BASE) return API_BASE.replace(/^http/, 'ws')
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}`
}

// Open the live-game socket for a given game id.
export function openGameSocket(gameId) {
  return new WebSocket(`${wsBase()}/ws/game/${gameId}?${Telegram.authParams()}`)
}

// Open the matchmaking queue socket for a time control.
export function openQueueSocket(tcId) {
  const params = new URLSearchParams(Telegram.authParams())
  params.set('tc', tcId)
  return new WebSocket(`${wsBase()}/ws/queue?${params.toString()}`)
}
