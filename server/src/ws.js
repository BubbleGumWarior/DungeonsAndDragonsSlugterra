import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";

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
    participants: [...voiceRoom.entries()].map(([userId, state]) => ({
      userId,
      username: state.username,
      muted: state.muted,
    })),
  };
}

function broadcastVoiceRoster() {
  broadcastAll(voiceRosterPayload());
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
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.sub;
      username = payload.username;
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
        voiceRoom.set(userId, { username, muted: false });
        broadcastVoiceRoster();
        return;
      }

      if (data.type === "voice-leave") {
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

      if (data.type === "voice-signal") {
        const to = Number(data.to);
        if (!Number.isInteger(to) || !data.signal) return;
        notifyUser(to, { type: "voice-signal", from: userId, signal: data.signal });
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

      // Only drop out of the call once every socket for this user is gone --
      // otherwise a second tab/device closing would silently boot someone
      // still on voice in their first tab.
      if (!userSockets.has(userId) && voiceRoom.delete(userId)) {
        broadcastVoiceRoster();
      }
    });
  });
}

export function notifyUser(userId, payload) {
  const set = userSockets.get(userId);
  if (!set) return;
  const message = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

export function broadcastAll(payload) {
  const message = JSON.stringify(payload);
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
