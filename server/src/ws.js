import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { imagifyPayload } from "./imageStore.js";
import { loadCharacterNames } from "./displayNames.js";

const userSockets = new Map();

// Party voice chat "room" -- who's currently in the call and whether
// they've self-muted. Purely in-memory: a call is inherently ephemeral, so
// unlike theme/sound_volume this never touches Postgres (see db.js for the
// durable per-user voice preferences instead). Keyed by userId, same as
// userSockets above.
const voiceRoom = new Map();

function voiceRosterPayload() {
  return {
    type: "voice-roster",
    participants: [...voiceRoom.entries()]
      .filter(([, state]) => state.name)
      .map(([userId, state]) => ({
        userId,
        name: state.name,
        muted: state.muted,
        camera: state.camera,
      })),
  };
}

function broadcastVoiceRoster() {
  broadcastAll(voiceRosterPayload());
}

// A player's last socket closing doesn't drop them from the call right away.
// Voice audio is browser-to-browser WebRTC and never rides this socket, so a
// tunnel/WiFi blip that kills only the WebSocket leaves the audio links
// perfectly healthy -- dropping the player instantly used to make every peer
// tear those links down (plus a leave+join chime) for a one-second hiccup.
// Within this window a reconnect's voice-join just resumes the existing entry.
// A real departure still lands immediately: the client sends voice-leave on
// pagehide, and Leave sends it too.
const VOICE_DISCONNECT_GRACE_MS = 15000;
const VOICE_PENDING_SIGNAL_LIMIT = 200; // an offer plus its ICE candidates is ~10-20 messages per peer

function clearVoiceDropTimer(entry) {
  if (entry?.dropTimer) {
    clearTimeout(entry.dropTimer);
    entry.dropTimer = null;
  }
}

// Cloudflare's proxy (both the regular CDN edge and Tunnel, now that
// run_tunnel.bat routes through one -- see CLOUDFLARE_TUNNEL_SETUP.md)
// drops a WebSocket that's gone quiet for roughly 100s. Pinging well under
// that keeps every connection alive indefinitely.
//
// This is a plain app-level {type:"ping"}/{type:"pong"} JSON exchange, not
// the WebSocket protocol's own ping/pong control frames -- tried that
// first, and it backfired: those control frames don't reliably survive
// Vite's dev proxy + Cloudflare Tunnel path, so pongs kept silently going
// missing, the "no pong = dead" check below kept firing on perfectly
// healthy connections, and each forced reconnect re-sent voice-join,
// producing a phantom leave+rejoin (and its sound effect) roughly every
// 30s. A plain JSON message is ordinary data traffic, not a control frame
// a proxy might reinterpret, so it doesn't have that failure mode -- at
// the cost of needing the small reply handler in AccessSocket.jsx below.
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_MESSAGE = JSON.stringify({ type: "ping" });

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      if (ws.readyState === ws.OPEN) ws.send(HEARTBEAT_MESSAGE);
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  // Fires for every attempted WS upgrade that reaches this process, before
  // any auth/app logic -- the fastest way to tell whether a failing
  // connection is even arriving here at all, versus being dropped further
  // upstream (Vite's proxy, the router's port forward, or an ISP).
  server.on("upgrade", (req) => {
    console.log(`[ws] upgrade request for ${req.url} from ${req.socket.remoteAddress}`);
  });

  wss.on("connection", (ws, req) => {
    console.log(`[ws] connection accepted from ${req.socket.remoteAddress}`);
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    let userId;
    let username;
    let role;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.sub;
      username = payload.username;
      role = payload.role;
    } catch (err) {
      console.warn(`[ws] rejected connection from ${req.socket.remoteAddress}: invalid token (${err.message})`);
      ws.close(4001, "Unauthorized");
      return;
    }

    ws.isAlive = true;

    const isFirstSocket = !userSockets.has(userId);
    if (isFirstSocket) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(ws);
    if (isFirstSocket) {
      broadcastAll({ type: "presence", userId, online: true });
    }

    // A fresh connection (page load, refresh mid-call) should immediately
    // see who's already talking rather than waiting for the next change.
    ws.send(JSON.stringify(voiceRosterPayload()));

    ws.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.type === "voice-join") {
        // Back within the grace window (see VOICE_DISCONNECT_GRACE_MS), or a
        // second socket for someone still in the call: keep the entry as-is.
        // Peers never saw them leave, so their audio links are still up --
        // the ack tells the client it can keep its own side of them too.
        ws.inVoice = true;
        const existing = voiceRoom.get(userId);
        if (existing) {
          clearVoiceDropTimer(existing);
          ws.send(JSON.stringify({ type: "voice-joined", resumed: true }));
          // Signals peers sent while we had no socket (e.g. an offer from
          // someone who joined during the blip), replayed in order.
          for (const message of existing.pendingSignals || []) ws.send(message);
          existing.pendingSignals = null;
          return;
        }
        ws.send(JSON.stringify({ type: "voice-joined", resumed: false }));
        // Shown to the table by character name, not login username. The
        // entry is registered immediately (so a mute-state sent right behind
        // this isn't dropped) but stays out of the roster until the name
        // lookup finishes, so a username never flashes up first.
        voiceRoom.set(userId, { name: null, muted: false, camera: false });
        loadCharacterNames([userId])
          .catch((err) => {
            console.warn(`[ws] could not load character name for user ${userId}: ${err.message}`);
            return new Map();
          })
          .then((names) => {
            const entry = voiceRoom.get(userId);
            if (!entry) return;
            entry.name = names.get(userId) || (role === "Dungeon Master" ? "Dungeon Master" : username);
            broadcastVoiceRoster();
          });
        return;
      }

      if (data.type === "voice-leave") {
        for (const socket of userSockets.get(userId) || []) socket.inVoice = false;
        clearVoiceDropTimer(voiceRoom.get(userId));
        if (voiceRoom.delete(userId)) {
          broadcastVoiceRoster();
        }
        return;
      }

      if (data.type === "voice-mute-state") {
        const entry = voiceRoom.get(userId);
        if (!entry) return;
        entry.muted = Boolean(data.muted);
        broadcastVoiceRoster();
        return;
      }

      // Camera on/off, so peers know whether to show this player's video or
      // their avatar. The video itself never comes near the server (it's
      // peer-to-peer like the audio); this is just the one-bit roster flag.
      if (data.type === "voice-camera-state") {
        const entry = voiceRoom.get(userId);
        if (!entry || entry.camera === Boolean(data.camera)) return;
        entry.camera = Boolean(data.camera);
        broadcastVoiceRoster();
        return;
      }

      if (data.type === "voice-signal") {
        const to = Number(data.to);
        if (!Number.isInteger(to) || !data.signal) return;
        const payload = { type: "voice-signal", from: userId, signal: data.signal };
        // Recipient is inside its reconnect grace window: hold the signal
        // for the resume instead of dropping it on the floor.
        const target = voiceRoom.get(to);
        if (target?.dropTimer) {
          target.pendingSignals ||= [];
          if (target.pendingSignals.length < VOICE_PENDING_SIGNAL_LIMIT) target.pendingSignals.push(JSON.stringify(payload));
          return;
        }
        notifyUser(to, payload);
        return;
      }

      if (data.type === "pong") {
        ws.isAlive = true;
      }
    });

    ws.on("close", () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          userSockets.delete(userId);
          broadcastAll({ type: "presence", userId, online: false });
        }
      }

      // Only the socket that actually joined voice matters: a second tab
      // closing must not boot someone still talking in their first, and the
      // call tab dropping must not be masked by an idle second tab. Once no
      // in-call socket is left, wait out the grace window -- a reconnect's
      // voice-join cancels the timer; if none comes, they really left (this
      // also catches a reload, where the fresh page never rejoins).
      const entry = voiceRoom.get(userId);
      const stillInVoice = [...(userSockets.get(userId) || [])].some((socket) => socket.inVoice);
      if (ws.inVoice && !stillInVoice && entry && !entry.dropTimer) {
        entry.dropTimer = setTimeout(() => {
          entry.dropTimer = null;
          if (voiceRoom.get(userId) === entry && voiceRoom.delete(userId)) {
            broadcastVoiceRoster();
          }
        }, VOICE_DISCONNECT_GRACE_MS);
      }
    });
  });
}

export function notifyUser(userId, payload) {
  const set = userSockets.get(userId);
  if (!set) return;
  // Big embedded images go out as cached /api/img URLs, not inline -- see imageStore.js.
  const message = JSON.stringify(imagifyPayload(payload));
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

export function broadcastAll(payload) {
  const message = JSON.stringify(imagifyPayload(payload));
  for (const set of userSockets.values()) {
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  }
}

export function getOnlineUserIds() {
  return [...userSockets.keys()];
}

export function disconnectUser(userId) {
  const set = userSockets.get(userId);
  if (!set) return;
  for (const ws of set) {
    ws.close(4000, "Account deleted");
  }
  userSockets.delete(userId);
}
