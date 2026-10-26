import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { EQUIPMENT_SLOT, slotForKind, validateEquipmentFields, DEFAULT_MELEE_TYPE } from "../equipmentRules.js";
import { syncAmmoBelt, announceEquipmentChange } from "../ammoBelt.js";
import { unequipBlasterRow } from "./blasters.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

export function toClientEquipment(row) {
  return {
    id: row.id,
    userId: row.user_id,
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
    equipSlot: row.equip_slot,
    equipped: row.equip_slot !== null,
    createdAt: row.created_at,
  };
}

// Pulls the clean field set out of a request body, so a DM can't smuggle a
// melee stat onto a belt (or the reverse) -- every stat the kind doesn't use is
// reset to its default.
export function fieldsFrom(body) {
  const { kind, name, image, damage, accuracy, apCost, reach, extraSlots, meleeType, absorb, gritBonus } = body || {};
  return {
    kind,
    name,
    image: null, // equipment is shown as an icon, never a picture -- only blasters get art
    damage: kind === "melee" ? damage : 0,
    accuracy: kind === "melee" ? accuracy : 0,
    apCost: kind === "melee" ? apCost : 2,
    reach: kind === "melee" ? reach : 80,
    meleeType: kind === "melee" ? meleeType : DEFAULT_MELEE_TYPE,
    extraSlots: kind === "ammo_belt" ? extraSlots : 0,
    absorb: kind === "shield" ? absorb : 0,
    gritBonus: kind === "armor" ? gritBonus : 0,
  };
}

// Armor sets max Grit, which a fight snapshots when it starts -- so armor stays
// on (or off) until the fight is over.
async function assertNotInCombat(db, userId) {
  const { rows } = await db.query(
    `SELECT 1 FROM combatants c JOIN encounters e ON e.id = c.encounter_id
     WHERE e.status = 'active' AND c.kind = 'character' AND c.ref_user_id = $1 LIMIT 1`,
    [userId]
  );
  if (rows[0]) {
    const err = new Error("You can't change armor in the middle of a fight.");
    err.status = 400;
    throw err;
  }
}

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM equipment WHERE user_id = $1 ORDER BY created_at ASC", [req.user.sub]);
    res.json({ equipment: rows.map(toClientEquipment) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load equipment." });
  }
});

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM equipment ORDER BY created_at ASC");
    res.json({ equipment: rows.map(toClientEquipment) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load equipment." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const fields = fieldsFrom(req.body);
  const userId = req.body?.userId;
  const validation = validateEquipmentFields(fields);
  if (!validation.valid) return res.status(400).json({ error: validation.error });
  if (!Number.isInteger(userId)) return res.status(400).json({ error: "A target player is required." });

  try {
    const { rows } = await pool.query(
      `INSERT INTO equipment (user_id, kind, name, image, damage, accuracy, ap_cost, reach, extra_slots, melee_type, absorb, grit_bonus, template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        userId,
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
        Number.isInteger(req.body?.templateId) ? req.body.templateId : null,
      ]
    );
    await announceEquipmentChange(userId);
    res.status(201).json({ equipment: toClientEquipment(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not assign equipment." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const fields = fieldsFrom(req.body);
  const validation = validateEquipmentFields(fields);
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE equipment SET kind = $1, name = $2, image = $3, damage = $4, accuracy = $5, ap_cost = $6, reach = $7,
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
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Equipment not found." });
    }
    // A kind change can leave an equipped item in the wrong slot -- put it back in the pack.
    if (rows[0].equip_slot !== null && rows[0].equip_slot !== slotForKind(rows[0].kind)) {
      await client.query("UPDATE equipment SET equip_slot = NULL WHERE id = $1", [id]);
      rows[0].equip_slot = null;
    }
    // A belt's size or armor's bonus may have changed under an equipped item.
    const sync = await syncAmmoBelt(client, rows[0].user_id);
    await client.query("COMMIT");
    await announceEquipmentChange(rows[0].user_id, sync);
    res.json({ equipment: toClientEquipment(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not update equipment." });
  } finally {
    client.release();
  }
});

// Each kind has one home: melee weapons, ammo belts and shields go in the
// Secondary slot (bumping whatever was there -- a blaster is unloaded as it
// comes out); armor goes in its own Armor slot, bumping any other armor.
router.patch("/:id/equip", async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM equipment WHERE id = $1 FOR UPDATE", [id]);
    const item = found.rows[0];
    if (!item) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Equipment not found." });
    }
    if (item.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You do not own this." });
    }
    if (item.kind === "armor") await assertNotInCombat(client, item.user_id);

    const slot = slotForKind(item.kind);
    if (slot === EQUIPMENT_SLOT) {
      const { rows: blasterOccupants } = await client.query(
        "SELECT id FROM blasters WHERE user_id = $1 AND owner_combatant_id IS NULL AND equip_slot = $2 FOR UPDATE",
        [item.user_id, EQUIPMENT_SLOT]
      );
      for (const occupant of blasterOccupants) await unequipBlasterRow(client, occupant.id);
    }
    await client.query("UPDATE equipment SET equip_slot = NULL WHERE user_id = $1 AND equip_slot = $2 AND id != $3", [
      item.user_id,
      slot,
      id,
    ]);
    const { rows } = await client.query("UPDATE equipment SET equip_slot = $1 WHERE id = $2 RETURNING *", [slot, id]);
    const sync = await syncAmmoBelt(client, item.user_id);
    await client.query("COMMIT");

    await announceEquipmentChange(item.user_id, sync);
    res.json({ equipment: toClientEquipment(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not equip that." });
  } finally {
    client.release();
  }
});

router.patch("/:id/unequip", async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM equipment WHERE id = $1 FOR UPDATE", [id]);
    const item = found.rows[0];
    if (!item) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Equipment not found." });
    }
    if (item.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You do not own this." });
    }
    if (item.kind === "armor") await assertNotInCombat(client, item.user_id);
    const { rows } = await client.query("UPDATE equipment SET equip_slot = NULL WHERE id = $1 RETURNING *", [id]);
    const sync = await syncAmmoBelt(client, item.user_id);
    await client.query("COMMIT");

    await announceEquipmentChange(item.user_id, sync);
    res.json({ equipment: toClientEquipment(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not unequip that." });
  } finally {
    client.release();
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("DELETE FROM equipment WHERE id = $1 RETURNING id, user_id", [id]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Equipment not found." });
    }
    const sync = await syncAmmoBelt(client, rows[0].user_id);
    await client.query("COMMIT");
    await announceEquipmentChange(rows[0].user_id, sync);
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not delete equipment." });
  } finally {
    client.release();
  }
});

export default router;
