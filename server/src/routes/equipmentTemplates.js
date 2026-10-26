import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateEquipmentFields } from "../equipmentRules.js";
import { fieldsFrom } from "./equipment.js";

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
    kind: row.kind,
    name: row.name,
    damage: row.damage,
    accuracy: row.accuracy,
    apCost: row.ap_cost,
    reach: row.reach,
    extraSlots: row.extra_slots,
    meleeType: row.melee_type,
    absorb: row.absorb,
    gritBonus: row.grit_bonus,
    basePrice: row.base_price,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM equipment_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load equipment templates." });
  }
});

router.post("/", async (req, res) => {
  const fields = fieldsFrom(req.body);
  const validation = validateEquipmentFields(fields);
  if (!validation.valid) return res.status(400).json({ error: validation.error });
  try {
    const { rows } = await pool.query(
      `INSERT INTO equipment_templates (kind, name, image, damage, accuracy, ap_cost, reach, extra_slots, melee_type, absorb, grit_bonus)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        fields.kind,
        fields.name.trim(),
        fields.image,
        fields.damage,
        fields.accuracy,
        fields.apCost,
        fields.reach,
        fields.extraSlots,
        fields.meleeType,
        fields.absorb,
        fields.gritBonus,
      ]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the equipment template." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = fieldsFrom(req.body);
  const validation = validateEquipmentFields(fields);
  if (!validation.valid) return res.status(400).json({ error: validation.error });
  try {
    const { rows } = await pool.query(
      `UPDATE equipment_templates SET kind = $1, name = $2, image = $3, damage = $4, accuracy = $5, ap_cost = $6, reach = $7,
         extra_slots = $8, melee_type = $9, absorb = $10, grit_bonus = $11
       WHERE id = $12 RETURNING *`,
      [
        fields.kind,
        fields.name.trim(),
        fields.image,
        fields.damage,
        fields.accuracy,
        fields.apCost,
        fields.reach,
        fields.extraSlots,
        fields.meleeType,
        fields.absorb,
        fields.gritBonus,
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Template not found." });
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the equipment template." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rowCount } = await pool.query("DELETE FROM equipment_templates WHERE id = $1", [id]);
    if (!rowCount) return res.status(404).json({ error: "Template not found." });
    // Any market listing of it points at a missing template and quietly drops out of the shop.
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the equipment template." });
  }
});

export default router;
