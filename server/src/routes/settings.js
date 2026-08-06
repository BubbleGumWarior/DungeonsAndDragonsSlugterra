import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";

const router = Router();

router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT slugterra_revealed FROM campaign_settings WHERE id = 1");
    res.json({ slugterraRevealed: rows[0]?.slugterra_revealed ?? false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load settings." });
  }
});

router.post("/slugterra", requireDungeonMaster, async (req, res) => {
  const revealed = Boolean(req.body?.revealed);
  try {
    await pool.query("UPDATE campaign_settings SET slugterra_revealed = $1 WHERE id = 1", [revealed]);
    broadcastAll({ type: "slugterra-revealed", revealed });
    res.json({ slugterraRevealed: revealed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update settings." });
  }
});

export default router;
