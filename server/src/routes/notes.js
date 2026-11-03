import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Notes are a private journal: every query is scoped to the caller, and nothing
// is broadcast. The DM keeps their own book the same way.
router.use(requireAuth);

export const MAX_TITLE = 120;
export const MAX_BODY = 20000;
const MAX_NOTES = 200;

function toClientNote(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validate({ title, body }) {
  if (title !== undefined && (typeof title !== "string" || title.length > MAX_TITLE)) {
    return `A title can be at most ${MAX_TITLE} characters.`;
  }
  if (body !== undefined && (typeof body !== "string" || body.length > MAX_BODY)) {
    return `A note can be at most ${MAX_BODY.toLocaleString()} characters.`;
  }
  return null;
}

// The Dungeon Master reads every player's book (`?scope=all`), each note tagged
// with who wrote it: their character's name, or their username until they have
// one. Players only ever get their own. Editing and deleting stay author-only.
router.get("/", async (req, res) => {
  try {
    if (req.query.scope === "all" && req.user.role === "Dungeon Master") {
      const { rows } = await pool.query(
        `SELECT n.*, u.username, c.name AS character_name
         FROM notes n
         JOIN users u ON u.id = n.user_id
         LEFT JOIN characters c ON c.user_id = n.user_id
         ORDER BY n.updated_at DESC, n.id DESC`
      );
      return res.json({
        notes: rows.map((row) => ({
          ...toClientNote(row),
          userId: row.user_id,
          authorName: row.character_name || row.username,
        })),
      });
    }
    const { rows } = await pool.query("SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC, id DESC", [
      req.user.sub,
    ]);
    res.json({ notes: rows.map((row) => ({ ...toClientNote(row), userId: row.user_id })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load your notes." });
  }
});

router.post("/", async (req, res) => {
  const { title = "", body = "" } = req.body || {};
  const error = validate({ title, body });
  if (error) return res.status(400).json({ error });
  try {
    const { rows: counted } = await pool.query("SELECT COUNT(*)::int AS n FROM notes WHERE user_id = $1", [req.user.sub]);
    if (counted[0].n >= MAX_NOTES) {
      return res.status(400).json({ error: `Your book is full (${MAX_NOTES} notes). Delete one first.` });
    }
    const { rows } = await pool.query("INSERT INTO notes (user_id, title, body) VALUES ($1, $2, $3) RETURNING *", [
      req.user.sub,
      title,
      body,
    ]);
    res.status(201).json({ note: toClientNote(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the note." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid note id." });
  const { title, body } = req.body || {};
  if (title === undefined && body === undefined) return res.status(400).json({ error: "Nothing to save." });
  const error = validate({ title, body });
  if (error) return res.status(400).json({ error });
  try {
    const { rows } = await pool.query(
      `UPDATE notes
       SET title = COALESCE($3, title), body = COALESCE($4, body), updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.sub, title ?? null, body ?? null]
    );
    if (rows.length === 0) return res.status(404).json({ error: "That note no longer exists." });
    res.json({ note: toClientNote(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save the note." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid note id." });
  try {
    await pool.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [id, req.user.sub]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the note." });
  }
});

export default router;
