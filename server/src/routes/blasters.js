import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBlasterFields } from "../itemRules.js";
import { broadcastAll } from "../ws.js";
import { toClientSlug } from "./slugs.js";
import { syncTempoAura } from "../slugAura.js";
import { syncAmmoBelt, announceEquipmentChange } from "../ammoBelt.js";
import { EQUIPMENT_SLOT } from "../equipmentRules.js";
import { skillModifier } from "../characterRules.js";
import { DURABILITY_MAX, REPAIR_DC, REPAIR_FAIL_DAMAGE } from "../careRules.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

export function toClientBlaster(row) {
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
    speed: row.speed,
    modSlots: row.mod_slots,
    // magazineSize is the blaster's own (DM-edited) size; an equipped ammo belt
    // adds magazineBonus on top of it (see ammoBelt.js). Combat and the slug
    // loader read totalMagazineSize.
    magazineSize: row.magazine_size,
    magazineBonus: row.magazine_bonus ?? 0,
    totalMagazineSize: row.magazine_size + (row.magazine_bonus ?? 0),
    quality: row.quality,
    durability: row.durability ?? DURABILITY_MAX,
    broken: (row.durability ?? DURABILITY_MAX) <= 0,
    equipSlot: row.equip_slot,
    equipped: row.equip_slot !== null,
    ownerCombatantId: row.owner_combatant_id,
    createdAt: row.created_at,
  };
}

export async function unequipBlasterRow(client, blasterId) {
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
  const { userId, templateId, name, baseType, image, accuracy, reloadApCost, range, speed, modSlots, magazineSize, quality } =
    req.body || {};

  const validation = validateBlasterFields({ name, baseType, image, accuracy, reloadApCost, range, speed, modSlots, magazineSize, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A target player is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO blasters
        (template_id, user_id, name, base_type, image, accuracy, reload_ap_cost, range, speed, mod_slots, magazine_size, quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        speed,
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
  const { name, baseType, image, accuracy, reloadApCost, range, speed, modSlots, magazineSize, quality } = req.body || {};

  const validation = validateBlasterFields({ name, baseType, image, accuracy, reloadApCost, range, speed, modSlots, magazineSize, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE blasters SET
        name = $1, base_type = $2, image = $3, accuracy = $4, reload_ap_cost = $5,
        range = $6, speed = $7, mod_slots = $8, magazine_size = $9, quality = $10
       WHERE id = $11
       RETURNING *`,
      [name.trim(), baseType, image ?? null, accuracy, reloadApCost, range, speed, modSlots, magazineSize, quality, id]
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

    // The Secondary slot also holds melee weapons / ammo belts (equipment.js) --
    // a blaster dropped there sends whatever was in it back to the pack.
    if (slot === EQUIPMENT_SLOT) {
      await client.query("UPDATE equipment SET equip_slot = NULL WHERE user_id = $1 AND equip_slot = $2", [blaster.user_id, slot]);
    }

    const { rows } = await client.query("UPDATE blasters SET equip_slot = $1 WHERE id = $2 RETURNING *", [slot, id]);
    // The ammo belt's extra slots follow whichever blaster is primary.
    const sync = await syncAmmoBelt(client, blaster.user_id);
    const { rows: fresh } = await client.query("SELECT * FROM blasters WHERE id = $1", [id]);
    const updated = toClientBlaster(fresh[0] ?? rows[0]);

    await client.query("COMMIT");

    broadcastAll({ type: "blaster-updated", userId: updated.userId, blaster: updated });
    for (const payload of broadcasts) broadcastAll(payload);
    await announceEquipmentChange(updated.userId, sync);
    // Bumping another weapon out of the slot unloads its slugs -- which may
    // have included a Tempo Aura carrier (see slugAura.js).
    if (occupant) await syncTempoAura({ userId: updated.userId });

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
    // A blaster leaving the primary slot takes the belt's extra slots with it.
    const sync = await syncAmmoBelt(client, result.blaster.user_id);
    const { rows: fresh } = await client.query("SELECT * FROM blasters WHERE id = $1", [id]);
    await client.query("COMMIT");

    const updated = toClientBlaster(fresh[0] ?? result.blaster);
    broadcastAll({ type: "blaster-updated", userId: updated.userId, blaster: updated });
    for (const slugRow of result.unloadedSlugRows) {
      const slug = toClientSlug(slugRow);
      broadcastAll({ type: "slug-updated", userId: slug.userId, slug });
    }
    await announceEquipmentChange(updated.userId, sync);
    // Unloading the whole magazine may have dropped a Tempo Aura carrier (see slugAura.js).
    await syncTempoAura({ userId: updated.userId });
    res.json({ blaster: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not unequip blaster." });
  } finally {
    client.release();
  }
});

// A player patches up their own blaster with a Repair Kit: d20 + Survival has
// to beat REPAIR_DC. Success restores it fully; failure still burns the kit and
// wears the weapon down further. A blaster at 0% is beyond a player's tools --
// only the DM can restore it (see /restore below).
router.post("/:id/repair", async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === "Dungeon Master") {
    return res.status(403).json({ error: "Only players repair with a kit -- use Restore instead." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: chars } = await client.query(
      "SELECT stats, proficiencies, repair_kits FROM characters WHERE user_id = $1 FOR UPDATE",
      [req.user.sub]
    );
    const character = chars[0];
    const { rows: found } = await client.query("SELECT * FROM blasters WHERE id = $1 FOR UPDATE", [id]);
    const blaster = found[0];
    if (!character || !blaster || blaster.user_id !== req.user.sub) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Blaster not found." });
    }
    const durability = blaster.durability ?? DURABILITY_MAX;
    if (durability <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This blaster is beyond what a kit can fix -- it needs an expert's workshop." });
    }
    if (durability >= DURABILITY_MAX) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This blaster is already in perfect condition." });
    }
    if (character.repair_kits < 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "You don't have a Repair Kit -- buy one at the Market." });
    }

    const die = 1 + Math.floor(Math.random() * 20);
    const modifier = skillModifier(character.stats, character.proficiencies, "survival");
    const total = die + modifier;
    const success = total > REPAIR_DC;
    const next = success ? DURABILITY_MAX : Math.max(0, durability - REPAIR_FAIL_DAMAGE);

    const { rows } = await client.query("UPDATE blasters SET durability = $1 WHERE id = $2 RETURNING *", [next, id]);
    const { rows: left } = await client.query(
      "UPDATE characters SET repair_kits = repair_kits - 1 WHERE user_id = $1 RETURNING repair_kits",
      [req.user.sub]
    );
    await client.query("COMMIT");

    const updated = toClientBlaster(rows[0]);
    broadcastAll({ type: "blaster-updated", userId: updated.userId, blaster: updated });
    res.json({
      blaster: updated,
      repairKits: left[0].repair_kits,
      roll: { die, modifier, total, dc: REPAIR_DC, success, before: durability, after: next },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not repair that blaster." });
  } finally {
    client.release();
  }
});

// DM only: restore a blaster to full durability -- the party visited an expert.
router.post("/:id/restore", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("UPDATE blasters SET durability = $1 WHERE id = $2 RETURNING *", [DURABILITY_MAX, id]);
    if (!rows[0]) return res.status(404).json({ error: "Blaster not found." });
    const blaster = toClientBlaster(rows[0]);
    broadcastAll({ type: "blaster-updated", userId: blaster.userId, blaster });
    res.json({ blaster });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not restore that blaster." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM blasters WHERE id = $1 RETURNING id, user_id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Blaster not found." });
    }
    // Losing the primary hands the belt's slots to nobody until a new one is equipped.
    if (rows[0].user_id != null) await syncAmmoBelt(pool, rows[0].user_id);
    broadcastAll({ type: "blaster-updated", userId: rows[0].user_id, blaster: null, blasterId: id });
    // Deleting the weapon unloads every slug in it (see slugAura.js).
    await syncTempoAura({ userId: rows[0].user_id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete blaster." });
  }
});

export default router;
