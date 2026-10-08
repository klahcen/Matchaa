import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Inside Docker the backend is reachable by service name, not localhost.
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000'
const httpsKeyPath = process.env.VITE_HTTPS_KEY
const httpsCertPath = process.env.VITE_HTTPS_CERT
const https =
  httpsKeyPath &&
  httpsCertPath &&
  existsSync(httpsKeyPath) &&
  existsSync(httpsCertPath)
    ? {
        key: readFileSync(httpsKeyPath),
        cert: readFileSync(httpsCertPath),
      }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    https,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      // Uploaded profile photos are served by Express at /uploads
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
      // Real-time chat, notifications and call signaling (WebSocket upgrade)
      '/socket.io': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
