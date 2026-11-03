import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// Cloudflare Realtime TURN (https://developers.cloudflare.com/realtime/turn/)
// is the primary relay: STUN is free and unlimited and the first 1,000 GB/mo
// of TURN egress is free, versus the 500MB Metered trial this replaced. The
// TURN key's API token lives only in this process's environment (server/.env,
// gitignored) -- the client only ever sees the iceServers array handed back.
// Credentials are minted with a long TTL and cached here, so every player's
// join (and the client's periodic refresh) shares one Cloudflare call instead
// of minting a fresh credential each time.
const CLOUDFLARE_TTL_SECONDS = 24 * 60 * 60;
const CLOUDFLARE_CACHE_MS = 6 * 60 * 60 * 1000;
let cloudflareCache = null; // { iceServers, expiresAt }

async function fetchCloudflareIceServers() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) return null;

  if (cloudflareCache && cloudflareCache.expiresAt > Date.now()) return cloudflareCache.iceServers;

  const upstream = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: CLOUDFLARE_TTL_SECONDS }),
  });
  if (!upstream.ok) {
    throw new Error(`Cloudflare TURN request failed: ${upstream.status}`);
  }
  const data = await upstream.json();
  // Cloudflare documents that port-53 URLs time out in browsers unless trickle
  // ICE is used, so they're dropped rather than left to slow down gathering.
  const iceServers = (data.iceServers || [])
    .map((server) => ({ ...server, urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url)) }))
    .filter((server) => server.urls.length > 0);
  if (iceServers.length === 0) throw new Error("Cloudflare TURN response was empty");

  cloudflareCache = { iceServers, expiresAt: Date.now() + CLOUDFLARE_CACHE_MS };
  return iceServers;
}

// Legacy fallback: Metered's REST endpoint, used only when the Cloudflare
// variables above aren't set (e.g. an older server/.env).
async function fetchMeteredIceServers() {
  const url = process.env.METERED_TURN_CREDENTIALS_URL;
  if (!url) return null;
  const upstream = await fetch(url);
  if (!upstream.ok) {
    throw new Error(`Metered request failed: ${upstream.status}`);
  }
  return upstream.json();
}

// See VoiceChatContext.jsx's fetchIceServers for the client side of this.
router.get("/turn-credentials", async (req, res) => {
  try {
    const iceServers = (await fetchCloudflareIceServers()) ?? (await fetchMeteredIceServers());
    if (!iceServers) {
      return res.status(500).json({ error: "Voice chat TURN server is not configured." });
    }
    res.json({ iceServers });
  } catch (err) {
    console.error("Could not fetch TURN credentials:", err);
    res.status(502).json({ error: "Could not fetch TURN credentials." });
  }
});

export default router;
