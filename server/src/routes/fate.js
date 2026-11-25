import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireDmEdit } from "../roles.js";
import { broadcastAll } from "../ws.js";

// The Fate Ledger: four DM-kept tallies per character (Wish, Anti-Wish,
// Inspiration, Discouragement). Everyone can read the whole party's ledger;
// only the DM moves the numbers. No rules hang off these yet.

const router = Router();

// Client field name -> characters column. Doubles as the whitelist, so the
// column name interpolated into the UPDATE below can only ever be one of these.
const FATE_COLUMNS = {
  wish: "wish",
  antiWish: "anti_wish",
  inspiration: "inspiration",
  discouragement: "discouragement",
};

function toFateRow(row) {
  return {
    userId: row.user_id,
    name: row.name,
    portrait: row.portrait,
    wish: row.wish ?? 0,
    antiWish: row.anti_wish ?? 0,
    inspiration: row.inspiration ?? 0,
    discouragement: row.discouragement ?? 0,
  };
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT user_id, name, portrait, wish, anti_wish, inspiration, discouragement FROM characters ORDER BY created_at ASC"
    );
    res.json({ characters: rows.map(toFateRow) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the Fate Ledger." });
  }
});

// Takes a delta rather than an absolute value and applies it in SQL, so a DM
// tapping + quickly (or from two tabs) never loses a step to a stale read.
router.patch("/:userId", requireDmEdit, async (req, res) => {
  const userId = Number(req.params.userId);
  const { field, delta } = req.body || {};
  const column = FATE_COLUMNS[field];

  if (!column) {
    return res.status(400).json({ error: "Unknown Fate Ledger field." });
  }
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) {
    return res.status(400).json({ error: "Change must be a non-zero whole number." });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE characters SET ${column} = GREATEST(0, ${column} + $1) WHERE user_id = $2
       RETURNING user_id, name, portrait, wish, anti_wish, inspiration, discouragement`,
      [delta, userId]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }
    // A bare "it changed, refetch" nudge rather than the row itself: the
    // client's live-state slots only keep the latest message, so a burst of
    // taps across several characters would otherwise drop rows.
    broadcastAll({ type: "fate-changed", at: Date.now() });
    res.json({ character: toFateRow(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the Fate Ledger." });
  }
});

export default router;
