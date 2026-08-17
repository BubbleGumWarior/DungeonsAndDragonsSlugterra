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

// Personal display/audio preferences -- every signed-in user tunes their
// own, no DM gate. See index.css's [data-theme] blocks for what each theme
// id maps to and CombatMap.jsx for where sound_volume gets applied.
const THEMES = ["burgundy", "navy", "green", "purple"];

router.post("/preferences", async (req, res) => {
  const { theme, soundVolume } = req.body ?? {};
  const updates = [];
  const values = [];

  if (theme !== undefined) {
    if (!THEMES.includes(theme)) {
      return res.status(400).json({ error: "Unknown theme." });
    }
    values.push(theme);
    updates.push(`theme = $${values.length}`);
  }

  if (soundVolume !== undefined) {
    const volume = Number(soundVolume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      return res.status(400).json({ error: "Sound volume must be between 0 and 1." });
    }
    values.push(volume);
    updates.push(`sound_volume = $${values.length}`);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  values.push(req.user.sub);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING theme, sound_volume`,
      values
    );
    const row = rows[0];
    res.json({ theme: row.theme, soundVolume: row.sound_volume });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update preferences." });
  }
});

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
