import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// Proxies Metered's TURN credential endpoint server-side so the API key
// lives only in this process's environment (server/.env, gitignored) and
// never reaches the browser bundle -- the client only ever sees the
// iceServers array this hands back, never the key itself. See
// VoiceChatContext.jsx's fetchIceServers for the client side of this.
router.get("/turn-credentials", async (req, res) => {
  const url = process.env.METERED_TURN_CREDENTIALS_URL;
  if (!url) {
    return res.status(500).json({ error: "Voice chat TURN server is not configured." });
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      throw new Error(`Metered request failed: ${upstream.status}`);
    }
    const iceServers = await upstream.json();
    res.json({ iceServers });
  } catch (err) {
    console.error("Could not fetch TURN credentials:", err);
    res.status(502).json({ error: "Could not fetch TURN credentials." });
  }
});

export default router;
