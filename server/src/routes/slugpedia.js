import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { toClientSlugpediaEntry } from "../slugpediaStore.js";

const router = Router();

// The slugpedia is party knowledge, not DM-only prep -- every approved user
// (player or DM) can read it.
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM slugpedia_entries ORDER BY name ASC, first_seen_at ASC");
    res.json({ entries: rows.map(toClientSlugpediaEntry) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the slugpedia." });
  }
});

// Which slug *templates* have ever shown up in the slugpedia -- used to
// restrict the NPC-guessing gallery to slugs the party has actually seen
// before (see routes/npcTemplates.js). A one-off slug with no template
// (template_id null) can't be guessed against since guessing works by
// template id, so those never appear here.
router.get("/known-template-ids", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT template_id FROM slugpedia_entries WHERE template_id IS NOT NULL"
    );
    res.json({ templateIds: rows.map((r) => r.template_id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load known slugs." });
  }
});

export default router;
