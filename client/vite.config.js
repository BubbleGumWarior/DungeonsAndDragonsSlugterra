import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Public access now goes through a Cloudflare Tunnel (see run_tunnel.bat and
// %USERPROFILE%\.cloudflared\config.yml), which terminates HTTPS at
// Cloudflare's edge with a real trusted cert for the domain. Because of
// that, this dev server itself only ever needs to be reached over plain
// HTTP on localhost -- cloudflared connects to it over loopback regardless
// of --host, and getUserMedia's secure-context requirement is satisfied by
// the https://<yourdomain> origin everyone actually connects through. This
// is why there's no mkcert/https config here anymore: self-signed certs
// were the cause of voice chat's /ws socket silently failing for anyone who
// had to click through a "not trusted" warning (the page load tolerates an
// untrusted cert on a "proceed anyway", but the separate wss:// handshake
// doesn't reliably inherit that trust) -- routing everyone through
// Cloudflare's real cert removes that failure mode entirely.
//
// https://vite.dev/config/
// Vite rejects requests whose Host header isn't on this list (a DNS-rebinding
// guard) -- without it, the Cloudflare Tunnel's forwarded requests get a 403
// "Blocked request" since Cloudflare passes through the real Host header
// (play.dungeonlair.co.za, and eventually www.dungeonlair.co.za once the
// live campaign cuts over -- see CLOUDFLARE_TUNNEL_SETUP.md). The leading
// dot matches any subdomain of dungeonlair.co.za, so both work without
// listing each one.
const ALLOWED_HOSTS = ['.dungeonlair.co.za']

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ALLOWED_HOSTS,
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
  // `vite preview` (serves the built dist/) does NOT inherit `server.*` --
  // kept identical to the dev block above so `npm run build && npm run
  // preview` is a fair comparison against dev mode.
  preview: {
    allowedHosts: ALLOWED_HOSTS,
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
