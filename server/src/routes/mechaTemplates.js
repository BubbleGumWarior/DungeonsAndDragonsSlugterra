import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateMechaFields } from "../mechaRules.js";

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
    frameType: row.frame_type,
    image: row.image,
    speed: row.speed,
    handling: row.handling,
    armor: row.armor,
    rammingPower: row.ramming_power,
    passengerCapacity: row.passenger_capacity,
    modSlots: row.mod_slots,
    tier: row.tier,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mecha_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mecha templates." });
  }
});

router.post("/", async (req, res) => {
  const { name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier } = req.body || {};

  const validation = validateMechaFields({ name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO mecha_templates
        (name, frame_type, image, speed, handling, armor, ramming_power, passenger_capacity, mod_slots, tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name.trim(), frameType, image ?? null, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create mecha template." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier } = req.body || {};

  const validation = validateMechaFields({ name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE mecha_templates SET
        name = $1, frame_type = $2, image = $3, speed = $4, handling = $5,
        armor = $6, ramming_power = $7, passenger_capacity = $8, mod_slots = $9, tier = $10
       WHERE id = $11
       RETURNING *`,
      [name.trim(), frameType, image ?? null, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier, id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update mecha template." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM mecha_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete mecha template." });
  }
});

export default router;
