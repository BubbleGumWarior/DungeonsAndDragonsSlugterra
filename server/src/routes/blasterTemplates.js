import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBlasterFields } from "../itemRules.js";

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
    baseType: row.base_type,
    image: row.image,
    accuracy: row.accuracy,
    reloadApCost: row.reload_ap_cost,
    range: row.range,
    modSlots: row.mod_slots,
    magazineSize: row.magazine_size,
    quality: row.quality,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM blaster_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load blaster templates." });
  }
});

router.post("/", async (req, res) => {
  const { name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality } = req.body || {};

  const validation = validateBlasterFields({ name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO blaster_templates
        (name, base_type, image, accuracy, reload_ap_cost, range, mod_slots, magazine_size, quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [name.trim(), baseType, image ?? null, accuracy, reloadApCost, range, modSlots, magazineSize, quality]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create blaster template." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality } = req.body || {};

  const validation = validateBlasterFields({ name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE blaster_templates SET
        name = $1, base_type = $2, image = $3, accuracy = $4, reload_ap_cost = $5,
        range = $6, mod_slots = $7, magazine_size = $8, quality = $9
       WHERE id = $10
       RETURNING *`,
      [name.trim(), baseType, image ?? null, accuracy, reloadApCost, range, modSlots, magazineSize, quality, id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update blaster template." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM blaster_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete blaster template." });
  }
});

export default router;
