import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateMechaFields } from "../mechaRules.js";
import { broadcastAll } from "../ws.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

export function toClientMecha(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
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

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mechas WHERE user_id = $1 ORDER BY created_at ASC", [req.user.sub]);
    res.json({ mechas: rows.map(toClientMecha) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mechas." });
  }
});

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mechas ORDER BY created_at ASC");
    res.json({ mechas: rows.map(toClientMecha) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mechas." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const { userId, templateId, name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier } = req.body || {};

  const validation = validateMechaFields({ name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A target player is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO mechas
        (template_id, user_id, name, frame_type, image, speed, handling, armor, ramming_power, passenger_capacity, mod_slots, tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        Number.isInteger(templateId) ? templateId : null,
        userId,
        name.trim(),
        frameType,
        image ?? null,
        speed,
        handling,
        armor,
        rammingPower,
        passengerCapacity,
        modSlots,
        tier,
      ]
    );

    const mecha = toClientMecha(rows[0]);
    broadcastAll({ type: "mecha-updated", userId, mecha });
    res.status(201).json({ mecha });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not assign mecha." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier } = req.body || {};

  const validation = validateMechaFields({ name, frameType, image, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE mechas SET
        name = $1, frame_type = $2, image = $3, speed = $4, handling = $5,
        armor = $6, ramming_power = $7, passenger_capacity = $8, mod_slots = $9, tier = $10
       WHERE id = $11
       RETURNING *`,
      [name.trim(), frameType, image ?? null, speed, handling, armor, rammingPower, passengerCapacity, modSlots, tier, id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Mecha not found." });
    }

    const mecha = toClientMecha(rows[0]);
    broadcastAll({ type: "mecha-updated", userId: mecha.userId, mecha });
    res.json({ mecha });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update mecha." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM mechas WHERE id = $1 RETURNING id, user_id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Mecha not found." });
    }
    broadcastAll({ type: "mecha-updated", userId: rows[0].user_id, mecha: null, mechaId: id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete mecha." });
  }
});

export default router;
