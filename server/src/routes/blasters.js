import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBlasterFields } from "../itemRules.js";
import { broadcastAll } from "../ws.js";
import { toClientSlug } from "./slugs.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

function toClientBlaster(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    name: row.name,
    baseType: row.base_type,
    image: row.image,
    accuracy: row.accuracy,
    reloadApCost: row.reload_ap_cost,
    range: row.range,
    modSlots: row.mod_slots,
    magazineSize: row.magazine_size,
    quality: row.quality,
    equipSlot: row.equip_slot,
    equipped: row.equip_slot !== null,
    createdAt: row.created_at,
  };
}

async function unequipBlasterRow(client, blasterId) {
  const { rows } = await client.query("UPDATE blasters SET equip_slot = NULL WHERE id = $1 RETURNING *", [blasterId]);
  const blaster = rows[0];
  if (!blaster) return null;

  const unloadedResult = await client.query(
    "UPDATE slugs SET equipped_blaster_id = NULL, magazine_slot = NULL WHERE equipped_blaster_id = $1 RETURNING *",
    [blasterId]
  );

  return { blaster, unloadedSlugRows: unloadedResult.rows };
}

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM blasters WHERE user_id = $1 ORDER BY created_at ASC", [req.user.sub]);
    res.json({ blasters: rows.map(toClientBlaster) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load blasters." });
  }
});

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM blasters ORDER BY created_at ASC");
    res.json({ blasters: rows.map(toClientBlaster) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load blasters." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const { userId, templateId, name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality } = req.body || {};

  const validation = validateBlasterFields({ name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A target player is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO blasters
        (template_id, user_id, name, base_type, image, accuracy, reload_ap_cost, range, mod_slots, magazine_size, quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        Number.isInteger(templateId) ? templateId : null,
        userId,
        name.trim(),
        baseType,
        image ?? null,
        accuracy,
        reloadApCost,
        range,
        modSlots,
        magazineSize,
        quality,
      ]
    );

    const blaster = toClientBlaster(rows[0]);
    broadcastAll({ type: "blaster-updated", userId, blaster });
    res.status(201).json({ blaster });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not assign blaster." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality } = req.body || {};

  const validation = validateBlasterFields({ name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE blasters SET
        name = $1, base_type = $2, image = $3, accuracy = $4, reload_ap_cost = $5,
        range = $6, mod_slots = $7, magazine_size = $8, quality = $9
       WHERE id = $10
       RETURNING *`,
      [name.trim(), baseType, image ?? null, accuracy, reloadApCost, range, modSlots, magazineSize, quality, id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Blaster not found." });
    }

    const blaster = toClientBlaster(rows[0]);
    broadcastAll({ type: "blaster-updated", userId: blaster.userId, blaster });
    res.json({ blaster });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update blaster." });
  }
});

router.patch("/:id/equip", async (req, res) => {
  const id = Number(req.params.id);
  const { slot } = req.body || {};

  if (slot !== 0 && slot !== 1) {
    return res.status(400).json({ error: "A weapon slot (0 = primary, 1 = secondary) is required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const blasterResult = await client.query("SELECT * FROM blasters WHERE id = $1 FOR UPDATE", [id]);
    const blaster = blasterResult.rows[0];
    if (!blaster) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Blaster not found." });
    }
    if (blaster.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You do not own this blaster." });
    }

    const broadcasts = [];

    // If another blaster already occupies that slot for this player, bump it out.
    const occupantResult = await client.query(
      "SELECT id FROM blasters WHERE user_id = $1 AND equip_slot = $2 AND id != $3 FOR UPDATE",
      [blaster.user_id, slot, id]
    );
    const occupant = occupantResult.rows[0];
    if (occupant) {
      const result = await unequipBlasterRow(client, occupant.id);
      broadcasts.push({ type: "blaster-updated", userId: result.blaster.user_id, blaster: toClientBlaster(result.blaster) });
      for (const slugRow of result.unloadedSlugRows) {
        broadcasts.push({ type: "slug-updated", userId: slugRow.user_id, slug: toClientSlug(slugRow) });
      }
    }

    const { rows } = await client.query("UPDATE blasters SET equip_slot = $1 WHERE id = $2 RETURNING *", [slot, id]);
    const updated = toClientBlaster(rows[0]);

    await client.query("COMMIT");

    broadcastAll({ type: "blaster-updated", userId: updated.userId, blaster: updated });
    for (const payload of broadcasts) broadcastAll(payload);

    res.json({ blaster: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not equip blaster." });
  } finally {
    client.release();
  }
});

router.patch("/:id/unequip", async (req, res) => {
  const id = Number(req.params.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const blasterResult = await client.query("SELECT * FROM blasters WHERE id = $1 FOR UPDATE", [id]);
    const blaster = blasterResult.rows[0];
    if (!blaster) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Blaster not found." });
    }
    if (blaster.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You do not own this blaster." });
    }

    const result = await unequipBlasterRow(client, id);
    await client.query("COMMIT");

    const updated = toClientBlaster(result.blaster);
    broadcastAll({ type: "blaster-updated", userId: updated.userId, blaster: updated });
    for (const slugRow of result.unloadedSlugRows) {
      const slug = toClientSlug(slugRow);
      broadcastAll({ type: "slug-updated", userId: slug.userId, slug });
    }
    res.json({ blaster: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not unequip blaster." });
  } finally {
    client.release();
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM blasters WHERE id = $1 RETURNING id, user_id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Blaster not found." });
    }
    broadcastAll({ type: "blaster-updated", userId: rows[0].user_id, blaster: null, blasterId: id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete blaster." });
  }
});

export default router;
