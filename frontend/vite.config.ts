import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
 * Dev server configuration.
 *
 * The extra settings exist so the application can be opened from a second
 * device — a phone acting as the patient while the desktop acts as the
 * clinician — which is the only way to test a two-party consultation without
 * a second person.
 *
 * getUserMedia() is refused outside a secure context, so the phone must reach
 * the app over HTTPS or through localhost. Two routes work:
 *
 *   Android, no public exposure (preferred):
 *     chrome://inspect/#devices -> Port forwarding -> 5173 : localhost:5173
 *     then open http://localhost:5173 on the phone.
 *
 *   Any phone, via a temporary public HTTPS tunnel:
 *     cloudflared tunnel --url http://localhost:5173
 *
 * The tunnel publishes this dev server, and through the proxy below the
 * backend as well, on a public address. Change the seeded demo passwords
 * before opening one and stop the tunnel as soon as the test ends.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Listen on the LAN interface, not only loopback.
    host: '0.0.0.0',

    /*
     * Vite rejects requests whose Host header it does not recognise. Without
     * this a tunnel URL answers "Blocked request. This host is not allowed."
     * instead of serving the app.
     */
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],

    /*
     * Same-origin API calls. The browser talks only to this dev server, which
     * forwards to Spring, so the phone needs no reachable backend address and
     * no CORS origin has to be whitelisted for the tunnel domain.
     *
     * Requires VITE_API_BASE_URL=/api in .env.local.
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8091',
        changeOrigin: true,
      },
    },
  },
})
