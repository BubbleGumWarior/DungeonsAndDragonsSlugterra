import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSlugFields, validateEnergyPips } from "../slugRules.js";
import { broadcastAll } from "../ws.js";
import { recordSlugpediaEntry } from "../slugpediaStore.js";

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
    wallMaker: row.wall_maker,
    bridgeMaker: row.bridge_maker,
    aoeBlast: row.aoe_blast,
    hazardMaker: row.hazard_maker,
    causesBlind: row.causes_blind,
    causesSnare: row.causes_snare,
    causesShock: row.causes_shock,
    causesJam: row.causes_jam,
    piercesWalls: row.pierces_walls,
    causesChain: row.causes_chain,
    ricochets: row.ricochets,
    ultraFast: row.ultra_fast,
    causesInvisible: row.causes_invisible,
    causesFear: row.causes_fear,
    causesConfusion: row.causes_confusion,
    trailWall: row.trail_wall,
    clashTripled: row.clash_tripled,
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
    wallMaker,
    bridgeMaker,
    aoeBlast,
    hazardMaker,
    causesBlind,
    causesSnare,
    causesShock,
    causesJam,
    piercesWalls,
    causesChain,
    ricochets,
    ultraFast,
    causesInvisible,
    causesFear,
    causesConfusion,
    trailWall,
    clashTripled,
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
    wallMaker,
    bridgeMaker,
    aoeBlast,
    hazardMaker,
    causesBlind,
    causesSnare,
    causesShock,
    causesJam,
    piercesWalls,
    causesChain,
    ricochets,
    ultraFast,
    causesInvisible,
    causesFear,
    causesConfusion,
    trailWall,
    clashTripled,
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
        (template_id, user_id, name, type, protoform_image, velocity_image, clash_power, clash_defense, ap_cost, max_energy_pips, energy_pips, loyalty_tier, velocity_ability, protoform_utility, breaks_walls, causes_knockback, wall_maker, bridge_maker, aoe_blast, hazard_maker,
         causes_blind, causes_snare, causes_shock, causes_jam,
         pierces_walls, causes_chain, ricochets, ultra_fast, causes_invisible, causes_fear, causes_confusion, trail_wall, clash_tripled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
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
        Boolean(wallMaker),
        Boolean(bridgeMaker),
        Boolean(aoeBlast),
        Boolean(hazardMaker),
        Boolean(causesBlind),
        Boolean(causesSnare),
        Boolean(causesShock),
        Boolean(causesJam),
        Boolean(piercesWalls),
        Boolean(causesChain),
        Boolean(ricochets),
        Boolean(ultraFast),
        Boolean(causesInvisible),
        Boolean(causesFear),
        Boolean(causesConfusion),
        Boolean(trailWall),
        Boolean(clashTripled),
      ]
    );

    const slug = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId, slug });
    recordSlugpediaEntry(rows[0]);
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
    wallMaker,
    bridgeMaker,
    aoeBlast,
    hazardMaker,
    causesBlind,
    causesSnare,
    causesShock,
    causesJam,
    piercesWalls,
    causesChain,
    ricochets,
    ultraFast,
    causesInvisible,
    causesFear,
    causesConfusion,
    trailWall,
    clashTripled,
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
    wallMaker,
    bridgeMaker,
    aoeBlast,
    hazardMaker,
    causesBlind,
    causesSnare,
    causesShock,
    causesJam,
    piercesWalls,
    causesChain,
    ricochets,
    ultraFast,
    causesInvisible,
    causesFear,
    causesConfusion,
    trailWall,
    clashTripled,
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
        breaks_walls = $13, causes_knockback = $14, wall_maker = $15, bridge_maker = $16, aoe_blast = $17, hazard_maker = $18,
        causes_blind = $19, causes_snare = $20, causes_shock = $21, causes_jam = $22,
        pierces_walls = $23, causes_chain = $24, ricochets = $25, ultra_fast = $26,
        causes_invisible = $27, causes_fear = $28, causes_confusion = $29, trail_wall = $30, clash_tripled = $31
       WHERE id = $32
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
        Boolean(wallMaker),
        Boolean(bridgeMaker),
        Boolean(aoeBlast),
        Boolean(hazardMaker),
        Boolean(causesBlind),
        Boolean(causesSnare),
        Boolean(causesShock),
        Boolean(causesJam),
        Boolean(piercesWalls),
        Boolean(causesChain),
        Boolean(ricochets),
        Boolean(ultraFast),
        Boolean(causesInvisible),
        Boolean(causesFear),
        Boolean(causesConfusion),
        Boolean(trailWall),
        Boolean(clashTripled),
        id,
      ]
    );

    const slug = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: slug.userId, slug });
    recordSlugpediaEntry(rows[0]);
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
