// Thin wrapper around the Telegram Mini App SDK (window.Telegram.WebApp).
// Falls back gracefully when opened in a normal browser (development).

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined

// A stable per-browser dev id so two browser tabs are two different players
// when running outside Telegram (DEV_MODE on the backend).
function devId() {
  let id = localStorage.getItem('chess_dev_id')
  if (!id) {
    id = String(Math.floor(Math.random() * 1e9))
    localStorage.setItem('chess_dev_id', id)
  }
  return id
}

export const Telegram = {
  available: !!tg,
  raw: tg,

  // The signed initData string used to authenticate API/WS calls.
  initData: tg?.initData || '',
  devId: devId(),

  // start_param from a t.me/bot/app?startapp=<x> launch, or the ?startapp=
  // query param when opened directly in a browser.
  startParam() {
    const p = tg?.initDataUnsafe?.start_param
    if (p) return p
    const url = new URL(window.location.href)
    return url.searchParams.get('startapp') || url.searchParams.get('tgWebAppStartParam') || null
  },

  user() {
    return tg?.initDataUnsafe?.user || null
  },

  // Query params appended to every request so the backend can authenticate.
  authParams() {
    const params = new URLSearchParams()
    if (this.initData) params.set('initData', this.initData)
    else params.set('dev_id', this.devId)
    return params.toString()
  },

  authHeaders() {
    const h = {}
    if (this.initData) h['X-Init-Data'] = this.initData
    else h['X-Dev-Id'] = this.devId
    return h
  },

  init() {
    if (!tg) return
    try {
      tg.ready()
      tg.expand()
      tg.setHeaderColor?.('#17212b')
      tg.setBackgroundColor?.('#17212b')
      tg.disableVerticalSwipes?.()
    } catch (e) {
      /* no-op */
    }
  },

  // Confirmation dialog — uses Telegram's native popup inside Telegram,
  // falls back to window.confirm in a browser. Calls cb(true/false).
  confirm(message, cb) {
    if (tg?.showConfirm) tg.showConfirm(message, (ok) => cb(!!ok))
    else cb(window.confirm(message))
  },

  haptic(style = 'light') {
    try {
      tg?.HapticFeedback?.impactOccurred(style)
    } catch (e) {
      /* no-op */
    }
  },

  shareGame(link, text = 'Join my chess game!') {
    if (tg?.openTelegramLink) {
      const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
      tg.openTelegramLink(url)
    } else if (navigator.share) {
      navigator.share({ text, url: link }).catch(() => {})
    }
  },
}
