import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSlugFields } from "../slugRules.js";
import { seedDefaultSlugTemplates } from "../seedDefaultSlugs.js";
import { broadcastAll } from "../ws.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// Player-visible "gallery": name and protoform art only, no stats -- this is
// what the NPC slug-guessing minigame picks from, so a guess is a real guess.
router.get("/gallery", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, protoform_image FROM slug_templates ORDER BY name ASC");
    res.json({ templates: rows.map((row) => ({ id: row.id, name: row.name, protoformImage: row.protoform_image })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the slug gallery." });
  }
});

router.use(requireAuth, requireDungeonMaster);

function toClientTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    protoformImage: row.protoform_image,
    velocityImage: row.velocity_image,
    clashPower: row.clash_power,
    clashDefense: row.clash_defense,
    apCost: row.ap_cost,
    maxEnergyPips: row.max_energy_pips,
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
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM slug_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slug templates." });
  }
});

// Re-runs the same startup seed on demand -- only inserts default slugs
// (see server/src/data/defaultSlugTemplates.json) whose name isn't already
// present, so this is safe to click repeatedly. Pairs with the bulk-delete
// route below: wipe, then re-import, for a clean reset after regenerating
// that JSON from an edited CSV.
router.post("/import-defaults", async (req, res) => {
  try {
    const result = await seedDefaultSlugTemplates();
    if (!result.available) {
      return res.status(400).json({
        error: "No default slug data found -- run server/scripts/generate-default-slug-templates.js first.",
      });
    }
    const templatesResult = await pool.query("SELECT * FROM slug_templates ORDER BY created_at ASC");
    res.json({
      seeded: result.seeded,
      total: result.total,
      templates: templatesResult.rows.map(toClientTemplate),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not import default slugs." });
  }
});

// Bulk-delete every template -- e.g. before re-importing a freshly
// regenerated default set. Doesn't touch slugs already assigned to players:
// slugs.template_id just goes null (ON DELETE SET NULL), the instances
// themselves are untouched. Wiping the whole roster like this is treated as
// a hard reset, though, so the party's slugpedia -- which is otherwise
// permanent, surviving individual template/slug deletes -- gets cleared
// with it rather than accumulating entries for a slug catalogue that no
// longer exists.
router.delete("/", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM slug_templates");
    await pool.query("DELETE FROM slugpedia_entries");
    broadcastAll({ type: "slugpedia-updated" });
    res.json({ ok: true, deletedCount: rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove templates." });
  }
});

router.post("/", async (req, res) => {
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
    const { rows } = await pool.query(
      `INSERT INTO slug_templates
        (name, type, protoform_image, velocity_image, clash_power, clash_defense, ap_cost, max_energy_pips, loyalty_tier, velocity_ability, protoform_utility, breaks_walls, causes_knockback, wall_maker, bridge_maker, aoe_blast, hazard_maker,
         causes_blind, causes_snare, causes_shock, causes_jam,
         pierces_walls, causes_chain, ricochets, ultra_fast, causes_invisible, causes_fear, causes_confusion, trail_wall, clash_tripled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
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
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create slug template." });
  }
});

router.patch("/:id", async (req, res) => {
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
    const { rows } = await pool.query(
      `UPDATE slug_templates SET
        name = $1, type = $2, protoform_image = $3, velocity_image = $4,
        clash_power = $5, clash_defense = $6, ap_cost = $7, max_energy_pips = $8, loyalty_tier = $9,
        velocity_ability = $10, protoform_utility = $11, breaks_walls = $12, causes_knockback = $13,
        wall_maker = $14, bridge_maker = $15, aoe_blast = $16, hazard_maker = $17,
        causes_blind = $18, causes_snare = $19, causes_shock = $20, causes_jam = $21,
        pierces_walls = $22, causes_chain = $23, ricochets = $24, ultra_fast = $25,
        causes_invisible = $26, causes_fear = $27, causes_confusion = $28, trail_wall = $29, clash_tripled = $30
       WHERE id = $31
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
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update slug template." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM slug_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete slug template." });
  }
});

export default router;
