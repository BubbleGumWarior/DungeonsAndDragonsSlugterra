import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";

const router = Router();

router.use(requireAuth);

const HISTORY_LIMIT = 100;
const MAX_BODY_LENGTH = 1000;

// Who the message is shown as: the sender's character name, never their
// login username. Rows with no real sender (user_id NULL, or the "System"
// dice-roll lines) carry their own label ("Slug Hunt", "Dice Roll") in the
// username column, which is kept as-is.
function authorName(row) {
  if (row.user_id == null || row.role === "System") return row.username;
  if (row.character_name) return row.character_name;
  return row.role === "Dungeon Master" ? "Dungeon Master" : row.username;
}

function serialize(row) {
  return {
    id: row.id,
    userId: row.user_id,
    author: authorName(row),
    role: row.role,
    body: row.body,
    meta: row.meta ?? null,
    createdAt: row.created_at,
  };
}

router.get("/messages", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.user_id, m.username, m.role, m.body, m.meta, m.created_at, c.name AS character_name
       FROM messages m LEFT JOIN characters c ON c.user_id = m.user_id
       ORDER BY m.created_at DESC, m.id DESC
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
      `WITH ins AS (
         INSERT INTO messages (user_id, username, role, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, username, role, body, meta, created_at
       )
       SELECT ins.*, c.name AS character_name
       FROM ins LEFT JOIN characters c ON c.user_id = ins.user_id`,
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
