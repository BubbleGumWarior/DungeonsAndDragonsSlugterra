import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";

const router = Router();

router.use(requireAuth);

const HISTORY_LIMIT = 100;
const MAX_BODY_LENGTH = 1000;

function serialize(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    body: row.body,
    meta: row.meta ?? null,
    createdAt: row.created_at,
  };
}

router.get("/messages", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, username, role, body, meta, created_at
       FROM messages
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [HISTORY_LIMIT]
    );
    res.json({ messages: rows.reverse().map(serialize) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load messages." });
  }
});

router.post("/messages", async (req, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }
  if (body.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message cannot exceed ${MAX_BODY_LENGTH} characters.` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO messages (user_id, username, role, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, username, role, body, meta, created_at`,
      [req.user.sub, req.user.username, req.user.role, body]
    );
    const message = serialize(rows[0]);
    broadcastAll({ type: "chat-message", message });
    res.status(201).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send message." });
  }
});

export default router;
