import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
//
// `npm run dev`        -> http://localhost:5173 (desktop work)
// `npm run dev:device` -> https://<lan-ip>:5173 (phone testing)
//
// The camera APIs this app depends on (`navigator.mediaDevices`, and therefore
// every barcode scan) are gated behind a secure context. A LAN IP over plain
// HTTP is NOT a secure context, so `device` mode serves over HTTPS via a
// self-signed cert. The phone will show a certificate warning once; accept it.
export default defineConfig(({ mode }) => {
  const isDevice = mode === 'device'

  return {
    plugins: [react(), ...(isDevice ? [basicSsl()] : [])],
    server: {
      // Bind to 0.0.0.0 so the dev server is reachable from a phone on the
      // same network. Vite prints the LAN URL on startup.
      host: true,
      port: 5173,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
