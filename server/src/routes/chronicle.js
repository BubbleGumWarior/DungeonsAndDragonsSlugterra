import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeMaxGrit } from "../characterRules.js";
import { toClientSlug } from "./slugs.js";

const router = Router();

// The Chronicle's "Party" segment. Every player character shows up as a card
// sourced live from its sheet, with its full slug loadout visible to the whole
// table so players can plan combos. Read-only and party knowledge, so every
// approved user can hit it -- there is no DM gating here.
router.use(requireAuth);

router.get("/party", async (req, res) => {
  try {
    const { rows: characters } = await pool.query(
      "SELECT id, user_id, name, age, portrait, stats FROM characters ORDER BY created_at ASC"
    );
    if (characters.length === 0) return res.json({ party: [] });

    const { rows: slugs } = await pool.query(
      "SELECT * FROM slugs WHERE user_id = ANY($1::int[]) ORDER BY created_at ASC",
      [characters.map((c) => c.user_id)]
    );
    const slugsByUser = new Map();
    for (const row of slugs) {
      const list = slugsByUser.get(row.user_id) || [];
      list.push(toClientSlug(row));
      slugsByUser.set(row.user_id, list);
    }

    res.json({
      party: characters.map((c) => ({
        id: c.id,
        userId: c.user_id,
        name: c.name,
        age: c.age,
        portrait: c.portrait,
        maxGrit: computeMaxGrit(c.stats),
        stats: c.stats,
        slugs: slugsByUser.get(c.user_id) || [],
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the party." });
  }
});

export default router;
