import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Inside Docker the backend is reachable by service name, not localhost.
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
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
    },
  },
})
