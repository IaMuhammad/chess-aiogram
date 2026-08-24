import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// During development the Vite dev server (5173) proxies API + WebSocket calls
// to the FastAPI backend (8000), so the frontend can use same-origin relative
// URLs ("/api", "/ws") — exactly as it will in production when FastAPI serves
// the built files. The backend target is read from VITE_BACKEND_URL (.env).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL || 'http://localhost:8000'
  const wsBackend = backend.replace(/^http/, 'ws')
  // Comma-separated extra hostnames allowed to access the dev server (e.g. a
  // tunnel domain like frontend.jprq.live). Use "*" to allow any host.
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      allowedHosts: allowedHosts.includes('*') ? true : allowedHosts,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/ws': { target: wsBackend, ws: true },
        '/health': { target: backend, changeOrigin: true },
      },
    },
    build: { outDir: 'dist' },
  }
})
