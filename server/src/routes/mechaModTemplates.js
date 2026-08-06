import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateMechaModFields } from "../mechaRules.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth, requireDungeonMaster);

function toClientTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    effect: row.effect,
    speedBonus: row.speed_bonus,
    handlingBonus: row.handling_bonus,
    armorBonus: row.armor_bonus,
    rammingBonus: row.ramming_bonus,
    unlocksMode: row.unlocks_mode,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mecha_mod_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mecha mod templates." });
  }
});

router.post("/", async (req, res) => {
  const { name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode } = req.body || {};

  const validation = validateMechaModFields({ name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO mecha_mod_templates
        (name, effect, speed_bonus, handling_bonus, armor_bonus, ramming_bonus, unlocks_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name.trim(), effect ?? null, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode ?? null]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create mecha mod template." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode } = req.body || {};

  const validation = validateMechaModFields({ name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE mecha_mod_templates SET
        name = $1, effect = $2, speed_bonus = $3, handling_bonus = $4, armor_bonus = $5, ramming_bonus = $6, unlocks_mode = $7
       WHERE id = $8
       RETURNING *`,
      [name.trim(), effect ?? null, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode ?? null, id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update mecha mod template." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM mecha_mod_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete mecha mod template." });
  }
});

export default router;
