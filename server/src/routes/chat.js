import { Router } from "express";
import sharp from "sharp";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";

const router = Router();

router.use(requireAuth);

const HISTORY_LIMIT = 150;
const MAX_BODY_LENGTH = 2000;
const MAX_IMAGES = 3;
const MAX_IMAGE_INPUT_LENGTH = 2_400_000; // base64 chars per uploaded image
const IMAGE_MAX_EDGE = 1280;

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
    images: row.images ?? [],
    createdAt: row.created_at,
  };
}

// Players paste whatever their phone camera produced. Every image is decoded
// and re-encoded here, so metadata is stripped, the size is bounded, and a
// file that merely claims to be an image never reaches other players' pages.
async function normalizeImage(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!match || dataUrl.length > MAX_IMAGE_INPUT_LENGTH) throw new Error("bad-image");
  const input = Buffer.from(match[2], "base64");
  const out = await sharp(input, { animated: true, limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

const MESSAGE_COLUMNS = "m.id, m.user_id, m.username, m.role, m.body, m.meta, m.images, m.created_at";

// `after` returns only rows newer than that id, oldest first -- the live feed
// uses it to catch up on whatever a single-slot socket event may have dropped.
router.get("/messages", async (req, res) => {
  const after = Number.parseInt(req.query.after, 10);
  try {
    if (Number.isInteger(after)) {
      const { rows } = await pool.query(
        `SELECT ${MESSAGE_COLUMNS}, c.name AS character_name
         FROM messages m LEFT JOIN characters c ON c.user_id = m.user_id
         WHERE m.id > $1
         ORDER BY m.id ASC
         LIMIT $2`,
        [after, HISTORY_LIMIT]
      );
      return res.json({ messages: rows.map(serialize) });
    }
    const { rows } = await pool.query(
      `SELECT ${MESSAGE_COLUMNS}, c.name AS character_name
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
  const rawImages = Array.isArray(req.body?.images) ? req.body.images : [];
  if (!body && rawImages.length === 0) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }
  if (body.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message cannot exceed ${MAX_BODY_LENGTH} characters.` });
  }
  if (rawImages.length > MAX_IMAGES) {
    return res.status(400).json({ error: `You can attach up to ${MAX_IMAGES} images.` });
  }

  let images = [];
  try {
    images = await Promise.all(rawImages.map(normalizeImage));
  } catch {
    return res.status(400).json({ error: "One of the images could not be read. Use a PNG, JPEG, WebP or GIF." });
  }

  try {
    const { rows } = await pool.query(
      `WITH ins AS (
         INSERT INTO messages (user_id, username, role, body, images)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, username, role, body, meta, images, created_at
       )
       SELECT ins.*, c.name AS character_name
       FROM ins LEFT JOIN characters c ON c.user_id = ins.user_id`,
      [req.user.sub, req.user.username, req.user.role, body, images.length ? JSON.stringify(images) : null]
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
