import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

// This machine's LAN IP (for phone-on-the-same-WiFi testing) and current
// public IP (for run_public.bat + port-forwarded friends). The public one
// is a residential IP and can change -- if run_public.bat testing breaks
// again with the /ws socket specifically failing to connect for someone
// else while the page itself loads fine, check whatismyip.com and update
// PUBLIC_HOST here to match.
const LAN_HOST = '192.168.50.214'
const PUBLIC_HOST = '155.93.162.193'

// https://vite.dev/config/
export default defineConfig({
  // mkcert() generates a locally-trusted TLS cert so `npm run dev` serves
  // HTTPS -- a secure context is required for getUserMedia, so voice chat's
  // mic access silently fails over plain http:// from any device that isn't
  // localhost (e.g. testing from a phone on the LAN). Trust the CA it
  // prints on first run on any other device you test from; see
  // client/README.md.
  //
  // `hosts` REPLACES the plugin's default list (localhost + local IPs)
  // rather than adding to it, so every address anyone actually connects
  // through has to be listed explicitly. This matters beyond just avoiding
  // a browser warning: a cert that doesn't cover the address a client
  // connects through causes trust to apply inconsistently between the page
  // load and the separate wss:// handshake for /ws -- the page loads fine
  // (an accepted "proceed anyway" covers plain requests) but the
  // WebSocket carrying chat/presence/voice-signaling can fail silently --
  // which is exactly what broke run_public.bat testing with a friend on
  // another network before PUBLIC_HOST was added here.
  plugins: [
    react(),
    mkcert({ hosts: ['localhost', '127.0.0.1', LAN_HOST, PUBLIC_HOST] }),
  ],
  server: {
    https: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  // `vite preview` (serves the built dist/, one JS bundle instead of dev
  // mode's one-request-per-module) does NOT inherit `server.*` -- it needs
  // its own https/proxy config, kept identical to the dev block above so
  // `npm run build && npm run preview` is a fair comparison against dev
  // when diagnosing whether dev mode's many concurrent module requests are
  // what's starving the /ws upgrade over a slow connection.
  preview: {
    https: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
})
