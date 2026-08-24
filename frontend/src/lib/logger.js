// Frontend error reporter. Captures uncaught errors / promise rejections and
// ships them to the backend (POST /api/client-log), which writes them to
// logs/front-error.logs. Failures to report are swallowed to avoid loops.

function send(payload) {
  try {
    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: location.href,
        userAgent: navigator.userAgent,
        ...payload,
      }),
      keepalive: true, // still delivered if the page is unloading
    }).catch(() => {})
  } catch (_) {
    /* never let logging throw */
  }
}

// Report an error explicitly (e.g. from a try/catch).
export function reportError(error, context) {
  const message = error?.message || String(error)
  send({
    message: context ? `${context}: ${message}` : message,
    stack: error?.stack || null,
  })
}

// Install global handlers. Call once at app startup.
export function installErrorLogging() {
  window.addEventListener('error', (e) => {
    send({
      message: e.message || 'Uncaught error',
      source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null,
      stack: e.error?.stack || null,
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    send({
      message: `Unhandled promise rejection: ${reason?.message || reason}`,
      stack: reason?.stack || null,
    })
  })
}
