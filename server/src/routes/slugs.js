import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSlugFields, validateEnergyPips } from "../slugRules.js";
import { broadcastAll } from "../ws.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

export function toClientSlug(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    protoformImage: row.protoform_image,
    velocityImage: row.velocity_image,
    clashPower: row.clash_power,
    clashDefense: row.clash_defense,
    apCost: row.ap_cost,
    maxEnergyPips: row.max_energy_pips,
    energyPips: row.energy_pips,
    loyaltyTier: row.loyalty_tier,
    velocityAbility: row.velocity_ability,
    protoformUtility: row.protoform_utility,
    breaksWalls: row.breaks_walls,
    causesKnockback: row.causes_knockback,
    ownerCombatantId: row.owner_combatant_id,
    equippedBlasterId: row.equipped_blaster_id,
    magazineSlot: row.magazine_slot,
    cooldownTurnsLeft: row.cooldown_turns_left,
    createdAt: row.created_at,
  };
}

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM slugs WHERE user_id = $1 ORDER BY created_at ASC",
      [req.user.sub]
    );
    res.json({ slugs: rows.map(toClientSlug) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slugs." });
  }
});

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM slugs ORDER BY created_at ASC");
    res.json({ slugs: rows.map(toClientSlug) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slugs." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const {
    userId,
    templateId,
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  } = req.body || {};

  const validation = validateSlugFields({
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A target player is required." });
  }

  const energyPips = Array(maxEnergyPips).fill(true);

  try {
    const { rows } = await pool.query(
      `INSERT INTO slugs
        (template_id, user_id, name, type, protoform_image, velocity_image, clash_power, clash_defense, ap_cost, max_energy_pips, energy_pips, loyalty_tier, velocity_ability, protoform_utility, breaks_walls, causes_knockback)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        Number.isInteger(templateId) ? templateId : null,
        userId,
        name.trim(),
        type,
        protoformImage ?? null,
        velocityImage ?? null,
        clashPower,
        clashDefense,
        apCost,
        maxEnergyPips,
        JSON.stringify(energyPips),
        loyaltyTier,
        velocityAbility ?? null,
        protoformUtility ?? null,
        Boolean(breaksWalls),
        Boolean(causesKnockback),
      ]
    );

    const slug = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId, slug });
    res.status(201).json({ slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not assign slug." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const {
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  } = req.body || {};

  const validation = validateSlugFields({
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const existing = await pool.query("SELECT energy_pips, max_energy_pips FROM slugs WHERE id = $1", [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Slug not found." });
    }

    let energyPips = existing.rows[0].energy_pips;
    if (maxEnergyPips !== existing.rows[0].max_energy_pips) {
      energyPips = Array(maxEnergyPips).fill(true);
    }

    const { rows } = await pool.query(
      `UPDATE slugs SET
        name = $1, type = $2, protoform_image = $3, velocity_image = $4,
        clash_power = $5, clash_defense = $6, ap_cost = $7, max_energy_pips = $8, energy_pips = $9,
        loyalty_tier = $10, velocity_ability = $11, protoform_utility = $12,
        breaks_walls = $13, causes_knockback = $14
       WHERE id = $15
       RETURNING *`,
      [
        name.trim(),
        type,
        protoformImage ?? null,
        velocityImage ?? null,
        clashPower,
        clashDefense,
        apCost,
        maxEnergyPips,
        JSON.stringify(energyPips),
        loyaltyTier,
        velocityAbility ?? null,
        protoformUtility ?? null,
        Boolean(breaksWalls),
        Boolean(causesKnockback),
        id,
      ]
    );

    const slug = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: slug.userId, slug });
    res.json({ slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update slug." });
  }
});

router.patch("/:id/energy", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { energyPips } = req.body || {};

  try {
    const existing = await pool.query("SELECT max_energy_pips FROM slugs WHERE id = $1", [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Slug not found." });
    }

    const validation = validateEnergyPips(energyPips, existing.rows[0].max_energy_pips);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { rows } = await pool.query(
      "UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *",
      [JSON.stringify(energyPips), id]
    );

    const slug = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: slug.userId, slug });
    res.json({ slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update energy pips." });
  }
});

router.patch("/:id/load", async (req, res) => {
  const id = Number(req.params.id);
  const { blasterId, slot } = req.body || {};

  if (!Number.isInteger(blasterId) || !Number.isInteger(slot) || slot < 0) {
    return res.status(400).json({ error: "A target weapon and magazine slot are required." });
  }

  try {
    const slugResult = await pool.query("SELECT * FROM slugs WHERE id = $1", [id]);
    const slug = slugResult.rows[0];
    if (!slug) {
      return res.status(404).json({ error: "Slug not found." });
    }
    if (slug.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      return res.status(403).json({ error: "You do not own this slug." });
    }

    const blasterResult = await pool.query("SELECT * FROM blasters WHERE id = $1", [blasterId]);
    const blaster = blasterResult.rows[0];
    if (!blaster) {
      return res.status(404).json({ error: "Weapon not found." });
    }
    if (blaster.user_id !== slug.user_id) {
      return res.status(400).json({ error: "The weapon must belong to the same player." });
    }
    if (blaster.equip_slot === null) {
      return res.status(400).json({ error: "That weapon is not equipped." });
    }
    if (slot >= blaster.magazine_size) {
      return res.status(400).json({ error: "That magazine slot does not exist." });
    }

    const conflict = await pool.query(
      "SELECT id FROM slugs WHERE equipped_blaster_id = $1 AND magazine_slot = $2 AND id != $3",
      [blasterId, slot, id]
    );
    if (conflict.rows[0]) {
      return res.status(400).json({ error: "That magazine slot is already occupied." });
    }

    const { rows } = await pool.query(
      "UPDATE slugs SET equipped_blaster_id = $1, magazine_slot = $2 WHERE id = $3 RETURNING *",
      [blasterId, slot, id]
    );
    const updated = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: updated.userId, slug: updated });
    res.json({ slug: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slug." });
  }
});

router.patch("/:id/unload", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const slugResult = await pool.query("SELECT * FROM slugs WHERE id = $1", [id]);
    const slug = slugResult.rows[0];
    if (!slug) {
      return res.status(404).json({ error: "Slug not found." });
    }
    if (slug.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      return res.status(403).json({ error: "You do not own this slug." });
    }

    const { rows } = await pool.query(
      "UPDATE slugs SET equipped_blaster_id = NULL, magazine_slot = NULL WHERE id = $1 RETURNING *",
      [id]
    );
    const updated = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: updated.userId, slug: updated });
    res.json({ slug: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not unload slug." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM slugs WHERE id = $1 RETURNING id, user_id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Slug not found." });
    }
    broadcastAll({ type: "slug-updated", userId: rows[0].user_id, slug: null, slugId: id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete slug." });
  }
});

export default router;
