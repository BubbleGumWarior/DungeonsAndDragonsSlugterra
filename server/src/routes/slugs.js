import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSlugFields, validateEnergyPips } from "../slugRules.js";
import { broadcastAll } from "../ws.js";
import { recordSlugpediaEntry } from "../slugpediaStore.js";
import { syncTempoAura } from "../slugAura.js";
import { syncAmmoBelt } from "../ammoBelt.js";
import { FOOD_MAX, kibbleFoodFor } from "../careRules.js";
import { skillModifier } from "../characterRules.js";
import { loyaltyShotsReadout } from "../loyaltyRules.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

// Re-fits its owner's slugs to whatever Tempo Aura they now have (see
// slugAura.js) and returns the freshest copy of `row` -- the sync may have
// resized its pips, and the route is about to send the row back to the client.
async function syncedRow(row, owner, options) {
  const changed = await syncTempoAura(owner, options);
  return changed.find((r) => r.id === row.id) ?? row;
}

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
    // How far through the current tier (0-1) -- the only loyalty progress a
    // player ever sees. The shot counts go to the DM alone (see GET /).
    loyaltyFill: Math.round(Math.min(1, Math.max(0, row.loyalty_progress ?? 0)) * 1000) / 1000,
    food: row.food ?? FOOD_MAX,
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
    ownerCombatantId: row.owner_combatant_id,
    equippedBlasterId: row.equipped_blaster_id,
    magazineSlot: row.magazine_slot,
    cooldownTurnsLeft: row.cooldown_turns_left,
    loaded: row.loaded,
    podBroken: Boolean(row.pod_broken),
    megaMorphAllowed: Boolean(row.mega_morph_allowed),
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
    // The DM also reads loyalty as shots done / needed, at each owner's
    // current Slug Handling.
    const { rows: owners } = await pool.query("SELECT user_id, stats, proficiencies FROM characters");
    const handling = new Map(owners.map((o) => [o.user_id, skillModifier(o.stats, o.proficiencies, "creatureHandling")]));
    res.json({
      slugs: rows.map((row) => ({
        ...toClientSlug(row),
        loyaltyShots: loyaltyShotsReadout(row.loyalty_tier, row.loyalty_progress, handling.get(row.user_id) ?? 0),
      })),
    });
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
         pierces_walls, causes_chain, ricochets, ultra_fast, causes_invisible, causes_fear, causes_confusion, trail_wall, clash_tripled,
         cone_blast, spawns_pods, mirage_decoy, star_wall, anchor_zone,
         voids_fire_clash, clears_fire_terrain, causes_disarm, disarm_zone, mind_scramble, swaps_position,
         friction_shift, crosswind_zone, skips_reload, emotion_surge, uncounterable, damage_tripled, static_mark, tempo_aura, power_surge, heal_over_time, grapple, causes_stun, stalls_slugs, amplifies_partner, pulls_metal, phases_walls, mirrors_clash, surrounds_target, ambush_tripled, summons_plant, causes_burn, massive_aoe, random_statuses, summons_ghost, potent_poison, causes_bleed, life_drain)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71)
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
      ]
    );

    // A new slug arrives full -- including any Tempo Aura stamina its owner
    // already has (see slugAura.js).
    const created = await syncedRow(rows[0], { userId }, { fill: true });
    const slug = toClientSlug(created);
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
        loyalty_progress = CASE WHEN loyalty_tier <> $10 THEN 0 ELSE loyalty_progress END,
        loyalty_tier = $10, velocity_ability = $11, protoform_utility = $12,
        breaks_walls = $13, causes_knockback = $14, wall_maker = $15, bridge_maker = $16, aoe_blast = $17, hazard_maker = $18,
        causes_blind = $19, causes_snare = $20, causes_shock = $21, causes_jam = $22,
        pierces_walls = $23, causes_chain = $24, ricochets = $25, ultra_fast = $26,
        causes_invisible = $27, causes_fear = $28, causes_confusion = $29, trail_wall = $30, clash_tripled = $31,
        cone_blast = $32, spawns_pods = $33, mirage_decoy = $34, star_wall = $35, anchor_zone = $36,
        voids_fire_clash = $37, clears_fire_terrain = $38, causes_disarm = $39, disarm_zone = $40,
        mind_scramble = $41, swaps_position = $42, friction_shift = $43, crosswind_zone = $44, skips_reload = $45,
        emotion_surge = $46, uncounterable = $47, damage_tripled = $48, static_mark = $49, tempo_aura = $50, power_surge = $51,
        heal_over_time = $52, grapple = $53,
        causes_stun = $54, stalls_slugs = $55, amplifies_partner = $56, pulls_metal = $57, phases_walls = $58, mirrors_clash = $59, surrounds_target = $60, ambush_tripled = $61, summons_plant = $62, causes_burn = $63, massive_aoe = $64, random_statuses = $65, summons_ghost = $66, potent_poison = $67, causes_bleed = $68, life_drain = $69
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
        id,
      ]
    );

    // A changed max_energy_pips resets the pips to that many (above), and a
    // toggled tempo_aura can switch the owner's aura on or off -- either way
    // re-fit the owner's slugs (see slugAura.js).
    const edited = await syncedRow(rows[0], { userId: rows[0].user_id, ownerCombatantId: rows[0].owner_combatant_id }, { fill: true });
    const slug = toClientSlug(edited);
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
    const existing = await pool.query("SELECT max_energy_pips, energy_pips FROM slugs WHERE id = $1", [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Slug not found." });
    }

    // The stored array can be longer than max_energy_pips while its owner has
    // a Tempo Aura up (see slugAura.js), so it's the array's own current
    // length that a toggled copy has to keep.
    const currentPips = existing.rows[0].energy_pips;
    const validation = validateEnergyPips(
      energyPips,
      Array.isArray(currentPips) ? currentPips.length : existing.rows[0].max_energy_pips
    );
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

// The slug's transformed (velocity) art as a real image response, so a combat
// client can fetch and cache it ahead of time -- the counter-clash prompt
// shows it to whoever is being shot at. Any signed-in user may fetch it (they
// see the bolt's slug in the counter window anyway); stats stay private. Not
// part of toClientSlug, which would drag every slug's base64 art into every
// list response.
router.get("/:id/velocity-image", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid slug id." });

  try {
    const { rows } = await pool.query("SELECT velocity_image FROM slugs WHERE id = $1", [id]);
    const src = rows[0]?.velocity_image;
    if (!src) return res.status(404).json({ error: "No image." });

    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
    if (!match) return res.redirect(src); // a plain URL rather than an embedded data URI
    const body = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
    res.set({ "Content-Type": match[1], "Cache-Control": "private, max-age=3600" }).send(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slug image." });
  }
});

router.patch("/:id/mega-morph", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { allowed } = req.body || {};
  if (typeof allowed !== "boolean") {
    return res.status(400).json({ error: "allowed must be true or false." });
  }

  try {
    const { rows } = await pool.query("UPDATE slugs SET mega_morph_allowed = $1 WHERE id = $2 RETURNING *", [allowed, id]);
    if (!rows[0]) return res.status(404).json({ error: "Slug not found." });

    const slug = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: slug.userId, slug });
    res.json({ slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update mega morph permission." });
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
    if (slot >= blaster.magazine_size + (blaster.magazine_bonus ?? 0)) {
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
    const updated = toClientSlug(await syncedRow(rows[0], { userId: rows[0].user_id }));
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
    const updated = toClientSlug(await syncedRow(rows[0], { userId: rows[0].user_id }));
    broadcastAll({ type: "slug-updated", userId: updated.userId, slug: updated });
    res.json({ slug: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not unload slug." });
  }
});

// DM override: set a slug's food meter outright.
router.patch("/:id/food", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const food = req.body?.food;
  if (!Number.isInteger(food) || food < 0 || food > FOOD_MAX) {
    return res.status(400).json({ error: `Food must be a whole number from 0 to ${FOOD_MAX}.` });
  }
  try {
    const { rows } = await pool.query("UPDATE slugs SET food = $1 WHERE id = $2 RETURNING *", [food, id]);
    if (!rows[0]) return res.status(404).json({ error: "Slug not found." });
    const slug = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: slug.userId, slug });
    res.json({ slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update food." });
  }
});

// A player feeds one of their slugs Slug Kibble. Each scoop restores
// kibbleFoodFor(the feeder's Slug Handling); `count` scoops are spent (never
// more than the slug can still eat), or `fill` spends exactly as many as it
// takes to top the meter up.
router.post("/:id/feed", async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === "Dungeon Master") {
    return res.status(403).json({ error: "Only players feed their slugs." });
  }
  const fill = Boolean(req.body?.fill);
  const asked = fill ? Infinity : Number(req.body?.count ?? 1);
  if (!fill && (!Number.isInteger(asked) || asked < 1 || asked > 20)) {
    return res.status(400).json({ error: "Feed between 1 and 20 scoops at a time." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: chars } = await client.query(
      "SELECT kibble, stats, proficiencies FROM characters WHERE user_id = $1 FOR UPDATE",
      [req.user.sub]
    );
    const { rows: slugRows } = await client.query("SELECT * FROM slugs WHERE id = $1 FOR UPDATE", [id]);
    const slug = slugRows[0];
    if (!slug || slug.user_id !== req.user.sub || !chars[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Slug not found." });
    }
    const perScoop = kibbleFoodFor(skillModifier(chars[0].stats, chars[0].proficiencies, "creatureHandling"));
    const food = slug.food ?? FOOD_MAX;
    const needed = Math.ceil((FOOD_MAX - food) / perScoop);
    if (needed <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `${slug.name} isn't hungry.` });
    }
    const have = chars[0]?.kibble ?? 0;
    const spend = Math.min(asked, needed, have);
    if (spend < 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "You're out of Slug Kibble -- buy more at the Market." });
    }
    const { rows } = await client.query("UPDATE slugs SET food = $1 WHERE id = $2 RETURNING *", [
      Math.min(FOOD_MAX, food + spend * perScoop),
      id,
    ]);
    const { rows: left } = await client.query("UPDATE characters SET kibble = kibble - $1 WHERE user_id = $2 RETURNING kibble", [
      spend,
      req.user.sub,
    ]);
    await client.query("COMMIT");

    const updated = toClientSlug(rows[0]);
    broadcastAll({ type: "slug-updated", userId: updated.userId, slug: updated });
    res.json({ slug: updated, spent: spend, kibble: left[0].kibble, perScoop });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not feed that slug." });
  } finally {
    client.release();
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
    // If it was carrying a Tempo Aura, its owner's other slugs lose the bonus.
    await syncTempoAura({ userId: rows[0].user_id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete slug." });
  }
});

// ---------------------------------------------------------------------------
// TEST-ONLY helpers (DM slug sheet buttons). Not meant for production -- delete
// these two routes and the matching buttons in SlugManagement.jsx before ship.
// ---------------------------------------------------------------------------

// Loyalty tier 1 = "Indifferent" (see LOYALTY_TIER_LABELS in client/src/slugData.js).
const INDIFFERENT_LOYALTY_TIER = 1;

// Fills every empty magazine slot on each player's equipped blasters (ammo belt
// slots included) with a random slug cloned from the templates at Indifferent
// loyalty, already loaded into that slot.
router.post("/test/give-random", requireDungeonMaster, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: templates } = await client.query("SELECT id FROM slug_templates");
    if (templates.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "There are no slug templates to hand out." });
    }
    // Same intersection-of-columns clone the market uses for bought slugs.
    const { rows: cols } = await client.query(
      `SELECT a.column_name FROM information_schema.columns a
       JOIN information_schema.columns b ON b.column_name = a.column_name AND b.table_name = 'slugs' AND b.table_schema = a.table_schema
       WHERE a.table_name = 'slug_templates' AND a.table_schema = current_schema()
         AND a.column_name NOT IN ('id', 'created_at', 'loyalty_tier')`
    );
    const names = cols.map((c) => `"${c.column_name}"`).join(", ");
    const sources = cols.map((c) => `t."${c.column_name}"`).join(", ");

    const { rows: players } = await client.query("SELECT id FROM users WHERE role = 'Player'");
    let given = 0;
    const touched = [];
    for (const player of players) {
      // Make sure an equipped ammo belt's extra slots are on the primary
      // blaster before counting capacity, so the belt gets filled too.
      await syncAmmoBelt(client, player.id);
      const { rows: blasters } = await client.query(
        "SELECT id, magazine_size, magazine_bonus FROM blasters WHERE user_id = $1 AND equip_slot IS NOT NULL ORDER BY equip_slot ASC",
        [player.id]
      );
      if (blasters.length === 0) continue;
      const { rows: loaded } = await client.query(
        "SELECT equipped_blaster_id, magazine_slot FROM slugs WHERE user_id = $1 AND equipped_blaster_id IS NOT NULL",
        [player.id]
      );
      const taken = new Set(loaded.map((s) => `${s.equipped_blaster_id}:${s.magazine_slot}`));

      // Shuffled deck so a player doesn't get duplicates until it runs out.
      let deck = [];
      const draw = () => {
        if (deck.length === 0) deck = templates.map((t) => t.id).sort(() => Math.random() - 0.5);
        return deck.pop();
      };

      for (const blaster of blasters) {
        const capacity = blaster.magazine_size + (blaster.magazine_bonus ?? 0);
        for (let slot = 0; slot < capacity; slot++) {
          if (taken.has(`${blaster.id}:${slot}`)) continue;
          const { rowCount } = await client.query(
            `INSERT INTO slugs (template_id, user_id, energy_pips, equipped_blaster_id, magazine_slot, loyalty_tier, ${names})
             SELECT t.id, $2, (SELECT COALESCE(jsonb_agg(true), '[]'::jsonb) FROM generate_series(1, t.max_energy_pips)), $3, $4, $5, ${sources}
             FROM slug_templates t WHERE t.id = $1`,
            [draw(), player.id, blaster.id, slot, INDIFFERENT_LOYALTY_TIER]
          );
          given += rowCount;
        }
      }
      touched.push(player.id);
    }
    await client.query("COMMIT");

    // Tempo Aura stamina has to be re-fit once the whole batch is in.
    for (const userId of touched) await syncTempoAura({ userId }, { fill: true });
    // One "everyone re-sync" signal rather than a slug-updated per row (see
    // AccessSocket's single-slot note).
    broadcastAll({ type: "party-healed", at: Date.now() });
    res.json({ ok: true, given, players: touched.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not give random slugs." });
  } finally {
    client.release();
  }
});

// Deletes every slug owned by a player (NPC/combat-owned slugs have no user_id
// and are left alone).
router.delete("/test/player-slugs", requireDungeonMaster, async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM slugs WHERE user_id IS NOT NULL");
    broadcastAll({ type: "party-healed", at: Date.now() });
    res.json({ ok: true, deletedCount: rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove player slugs." });
  }
});

export default router;
