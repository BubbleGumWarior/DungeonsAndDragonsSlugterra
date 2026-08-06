import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateModFields } from "../itemRules.js";

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
    accuracyBonus: row.accuracy_bonus,
    reloadApBonus: row.reload_ap_bonus,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mod_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mod templates." });
  }
});

router.post("/", async (req, res) => {
  const { name, effect, accuracyBonus, reloadApBonus } = req.body || {};

  const validation = validateModFields({ name, effect, accuracyBonus, reloadApBonus });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO mod_templates (name, effect, accuracy_bonus, reload_ap_bonus)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), effect ?? null, accuracyBonus, reloadApBonus]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create mod template." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, effect, accuracyBonus, reloadApBonus } = req.body || {};

  const validation = validateModFields({ name, effect, accuracyBonus, reloadApBonus });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE mod_templates SET name = $1, effect = $2, accuracy_bonus = $3, reload_ap_bonus = $4
       WHERE id = $5
       RETURNING *`,
      [name.trim(), effect ?? null, accuracyBonus, reloadApBonus, id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update mod template." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM mod_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete mod template." });
  }
});

export default router;
