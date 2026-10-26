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

export function toClientTemplate(row) {
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
    rarity: row.rarity,
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
    coneBlast: row.cone_blast,
    spawnsPods: row.spawns_pods,
    mirageDecoy: row.mirage_decoy,
    starWall: row.star_wall,
    anchorZone: row.anchor_zone,
    voidsFireClash: row.voids_fire_clash,
    clearsFireTerrain: row.clears_fire_terrain,
    causesDisarm: row.causes_disarm,
    disarmZone: row.disarm_zone,
    mindScramble: row.mind_scramble,
    swapsPosition: row.swaps_position,
    frictionShift: row.friction_shift,
    crosswindZone: row.crosswind_zone,
    skipsReload: row.skips_reload,
    emotionSurge: row.emotion_surge,
    uncounterable: row.uncounterable,
    damageTripled: row.damage_tripled,
    staticMark: row.static_mark,
    tempoAura: row.tempo_aura,
    powerSurge: row.power_surge,
    healOverTime: row.heal_over_time,
    grapple: row.grapple,
    causesStun: row.causes_stun,
    stallsSlugs: row.stalls_slugs,
    amplifiesPartner: row.amplifies_partner,
    pullsMetal: row.pulls_metal,
    phasesWalls: row.phases_walls,
    mirrorsClash: row.mirrors_clash,
    surroundsTarget: row.surrounds_target,
    ambushTripled: row.ambush_tripled,
    summonsPlant: row.summons_plant,
    causesBurn: row.causes_burn,
    massiveAoe: row.massive_aoe,
    randomStatuses: row.random_statuses,
    summonsGhost: row.summons_ghost,
    potentPoison: row.potent_poison,
    causesBleed: row.causes_bleed,
    lifeDrain: row.life_drain,
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

// NPC and grunt templates keep their slug loadouts as a plain id array (no FK),
// so deleting slug templates leaves dangling ids that silently spawn nothing
// when the NPC/grunt is pulled into a fight. Drop every id that no longer
// resolves to a slug template.
async function pruneDeletedSlugTemplateIds() {
  for (const table of ["npc_templates", "grunt_templates"]) {
    await pool.query(
      `UPDATE ${table} t
          SET slug_template_ids = COALESCE(
            (SELECT jsonb_agg(e) FROM jsonb_array_elements(t.slug_template_ids) e
              WHERE (e #>> '{}')::int IN (SELECT id FROM slug_templates)),
            '[]'::jsonb)
        WHERE jsonb_array_length(t.slug_template_ids) > 0`
    );
  }
}

// Bulk-delete every template -- e.g. before re-importing a freshly
// regenerated default set. Wiping the whole roster like this is treated as
// a hard reset: every slug assigned to a player goes too (NPC/combat-owned
// slugs, which have no user_id, are left alone), and the party's slugpedia --
// otherwise permanent, surviving individual template/slug deletes -- is
// cleared so it doesn't accumulate entries for a slug catalogue that no
// longer exists.
router.delete("/", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM slug_templates");
    await pruneDeletedSlugTemplateIds();
    const { rowCount: slugsDeleted } = await pool.query("DELETE FROM slugs WHERE user_id IS NOT NULL");
    await pool.query("DELETE FROM slugpedia_entries");
    broadcastAll({ type: "slugpedia-updated" });
    // One "everyone re-sync" signal rather than a slug-updated per row: those
    // arrive as a burst and get coalesced client-side (single-slot signals).
    // Slug views already refetch on party-healed.
    broadcastAll({ type: "party-healed", at: Date.now() });
    res.json({ ok: true, deletedCount: rowCount, slugsDeletedCount: slugsDeleted });
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
    rarity,
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
    coneBlast,
    spawnsPods,
    mirageDecoy,
    starWall,
    anchorZone,
    voidsFireClash,
    clearsFireTerrain,
    causesDisarm,
    disarmZone,
    mindScramble,
    swapsPosition,
    frictionShift,
    crosswindZone,
    skipsReload,
    emotionSurge,
    uncounterable,
    damageTripled,
    staticMark,
    tempoAura,
    powerSurge,
    healOverTime,
    grapple,
    causesStun,
    stallsSlugs,
    amplifiesPartner,
    pullsMetal,
    phasesWalls,
    mirrorsClash,
    surroundsTarget,
    ambushTripled,
    summonsPlant,
    causesBurn,
    massiveAoe,
    randomStatuses,
    summonsGhost,
    potentPoison,
    causesBleed,
    lifeDrain,
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
    rarity,
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
         pierces_walls, causes_chain, ricochets, ultra_fast, causes_invisible, causes_fear, causes_confusion, trail_wall, clash_tripled,
         cone_blast, spawns_pods, mirage_decoy, star_wall, anchor_zone, voids_fire_clash, clears_fire_terrain,
         causes_disarm, disarm_zone, mind_scramble, swaps_position, friction_shift, crosswind_zone, skips_reload,
         emotion_surge, uncounterable, damage_tripled, static_mark, tempo_aura, power_surge, heal_over_time, grapple, causes_stun, stalls_slugs, amplifies_partner, pulls_metal, phases_walls, mirrors_clash, surrounds_target, ambush_tripled, summons_plant, causes_burn, massive_aoe, random_statuses, summons_ghost, potent_poison, causes_bleed, life_drain, rarity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69)
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
        Boolean(coneBlast),
        Boolean(spawnsPods),
        Boolean(mirageDecoy),
        Boolean(starWall),
        Boolean(anchorZone),
        Boolean(voidsFireClash),
        Boolean(clearsFireTerrain),
        Boolean(causesDisarm),
        Boolean(disarmZone),
        Boolean(mindScramble),
        Boolean(swapsPosition),
        Boolean(frictionShift),
        Boolean(crosswindZone),
        Boolean(skipsReload),
        Boolean(emotionSurge),
        Boolean(uncounterable),
        Boolean(damageTripled),
        Boolean(staticMark),
        Boolean(tempoAura),
        Boolean(powerSurge),
        Boolean(healOverTime),
        Boolean(grapple),
        Boolean(causesStun),
        Boolean(stallsSlugs),
        Boolean(amplifiesPartner),
        Boolean(pullsMetal),
        Boolean(phasesWalls),
        Boolean(mirrorsClash),
        Boolean(surroundsTarget),
        Boolean(ambushTripled),
        Boolean(summonsPlant),
        Boolean(causesBurn),
        Boolean(massiveAoe),
        Boolean(randomStatuses),
        Boolean(summonsGhost),
        Boolean(potentPoison),
        Boolean(causesBleed),
        Boolean(lifeDrain),
        rarity ?? null,
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
    rarity,
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
    coneBlast,
    spawnsPods,
    mirageDecoy,
    starWall,
    anchorZone,
    voidsFireClash,
    clearsFireTerrain,
    causesDisarm,
    disarmZone,
    mindScramble,
    swapsPosition,
    frictionShift,
    crosswindZone,
    skipsReload,
    emotionSurge,
    uncounterable,
    damageTripled,
    staticMark,
    tempoAura,
    powerSurge,
    healOverTime,
    grapple,
    causesStun,
    stallsSlugs,
    amplifiesPartner,
    pullsMetal,
    phasesWalls,
    mirrorsClash,
    surroundsTarget,
    ambushTripled,
    summonsPlant,
    causesBurn,
    massiveAoe,
    randomStatuses,
    summonsGhost,
    potentPoison,
    causesBleed,
    lifeDrain,
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
    rarity,
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
        causes_invisible = $26, causes_fear = $27, causes_confusion = $28, trail_wall = $29, clash_tripled = $30,
        cone_blast = $31, spawns_pods = $32, mirage_decoy = $33, star_wall = $34, anchor_zone = $35,
        voids_fire_clash = $36, clears_fire_terrain = $37, causes_disarm = $38, disarm_zone = $39,
        mind_scramble = $40, swaps_position = $41, friction_shift = $42, crosswind_zone = $43, skips_reload = $44,
        emotion_surge = $45, uncounterable = $46, damage_tripled = $47, static_mark = $48, tempo_aura = $49, power_surge = $50,
        heal_over_time = $51, grapple = $52,
        causes_stun = $53, stalls_slugs = $54, amplifies_partner = $55, pulls_metal = $56, phases_walls = $57, mirrors_clash = $58, surrounds_target = $59, ambush_tripled = $60, summons_plant = $61, causes_burn = $62, massive_aoe = $63, random_statuses = $64, summons_ghost = $65, potent_poison = $66, causes_bleed = $67, life_drain = $68, rarity = $69
       WHERE id = $70
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
        Boolean(coneBlast),
        Boolean(spawnsPods),
        Boolean(mirageDecoy),
        Boolean(starWall),
        Boolean(anchorZone),
        Boolean(voidsFireClash),
        Boolean(clearsFireTerrain),
        Boolean(causesDisarm),
        Boolean(disarmZone),
        Boolean(mindScramble),
        Boolean(swapsPosition),
        Boolean(frictionShift),
        Boolean(crosswindZone),
        Boolean(skipsReload),
        Boolean(emotionSurge),
        Boolean(uncounterable),
        Boolean(damageTripled),
        Boolean(staticMark),
        Boolean(tempoAura),
        Boolean(powerSurge),
        Boolean(healOverTime),
        Boolean(grapple),
        Boolean(causesStun),
        Boolean(stallsSlugs),
        Boolean(amplifiesPartner),
        Boolean(pullsMetal),
        Boolean(phasesWalls),
        Boolean(mirrorsClash),
        Boolean(surroundsTarget),
        Boolean(ambushTripled),
        Boolean(summonsPlant),
        Boolean(causesBurn),
        Boolean(massiveAoe),
        Boolean(randomStatuses),
        Boolean(summonsGhost),
        Boolean(potentPoison),
        Boolean(causesBleed),
        Boolean(lifeDrain),
        rarity ?? null,
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
    await pruneDeletedSlugTemplateIds();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete slug template." });
  }
});

export default router;
