import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";

const userSockets = new Map();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    let userId;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.sub;
    } catch {
      ws.close(4001, "Unauthorized");
      return;
    }

    const isFirstSocket = !userSockets.has(userId);
    if (isFirstSocket) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(ws);
    if (isFirstSocket) {
      broadcastAll({ type: "presence", userId, online: true });
    }

    ws.on("close", () => {
      const set = userSockets.get(userId);
      if (!set) return;
      set.delete(ws);
      if (set.size === 0) {
        userSockets.delete(userId);
        broadcastAll({ type: "presence", userId, online: false });
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
