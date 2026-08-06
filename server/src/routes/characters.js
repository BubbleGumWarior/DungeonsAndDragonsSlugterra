import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  validateCharacterPayload,
  validateKnockoutPips,
  validateCurrentGrit,
  computeMaxGrit,
} from "../characterRules.js";
import { broadcastAll } from "../ws.js";

const router = Router();

router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

function toClientCharacter(row) {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    portrait: row.portrait,
    stats: row.stats,
    proficiencies: row.proficiencies,
    knockoutPips: row.knockout_pips,
    currentGrit: row.current_grit,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, name, portrait, knockout_pips, stats, current_grit FROM characters ORDER BY created_at ASC"
    );
    res.json({
      characters: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        portrait: row.portrait,
        knockoutPips: row.knockout_pips,
        currentGrit: row.current_grit,
        maxGrit: computeMaxGrit(row.stats),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load characters." });
  }
});

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [req.user.sub]);
    res.json({ character: rows[0] ? toClientCharacter(rows[0]) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load character." });
  }
});

router.post("/", async (req, res) => {
  const { name, age, portrait, stats, proficiencies } = req.body || {};

  const validation = validateCharacterPayload({ name, age, portrait, stats, proficiencies });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO characters (user_id, name, age, portrait, stats, proficiencies, current_grit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [
        req.user.sub,
        name.trim(),
        age ?? null,
        portrait ?? null,
        JSON.stringify(stats),
        JSON.stringify(proficiencies),
        computeMaxGrit(stats),
      ]
    );

    if (!rows[0]) {
      return res.status(409).json({ error: "Character already exists." });
    }

    res.status(201).json({ character: toClientCharacter(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create character." });
  }
});

router.get("/:userId", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  try {
    const { rows } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [userId]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }
    res.json({ character: toClientCharacter(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load character." });
  }
});

router.patch("/:userId", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { name, age, portrait, stats, proficiencies } = req.body || {};

  const validation = validateCharacterPayload({ name, age, portrait, stats, proficiencies }, { unrestricted: true });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const newMax = computeMaxGrit(stats);
    const { rows } = await pool.query(
      `UPDATE characters SET name = $1, age = $2, portrait = $3, stats = $4, proficiencies = $5,
        current_grit = LEAST(current_grit, $6)
       WHERE user_id = $7
       RETURNING *`,
      [name.trim(), age ?? null, portrait ?? null, JSON.stringify(stats), JSON.stringify(proficiencies), newMax, userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }

    const character = toClientCharacter(rows[0]);
    broadcastAll({ type: "character-updated", userId, character });
    res.json({ character });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update character." });
  }
});

router.patch("/:userId/knockout", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { knockoutPips } = req.body || {};

  const validation = validateKnockoutPips(knockoutPips);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE characters SET knockout_pips = $1 WHERE user_id = $2 RETURNING *`,
      [JSON.stringify(knockoutPips), userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }

    const character = toClientCharacter(rows[0]);
    broadcastAll({ type: "character-updated", userId, character });
    res.json({ character });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update knockout pips." });
  }
});

router.patch("/:userId/grit", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { currentGrit } = req.body || {};

  try {
    const existing = await pool.query("SELECT stats FROM characters WHERE user_id = $1", [userId]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }

    const validation = validateCurrentGrit(currentGrit, existing.rows[0].stats);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { rows } = await pool.query(
      "UPDATE characters SET current_grit = $1 WHERE user_id = $2 RETURNING *",
      [currentGrit, userId]
    );

    const character = toClientCharacter(rows[0]);
    broadcastAll({ type: "character-updated", userId, character });
    res.json({ character });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update current Grit." });
  }
});

export default router;
