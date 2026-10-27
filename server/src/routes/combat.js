import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll, notifyUser } from "../ws.js";
import { statModifier, skillModifier, PROFICIENCY_KEYS, computeMaxGrit, actionPoints, initiativeBonus, npcActionPoints, npcMaxGrit, heatGainFor } from "../characterRules.js";
import { QUALITY_TIERS, BASE_TYPES, BASE_TYPE_KEYS } from "../itemRules.js";
import { TIER_LABELS as MECHA_TIER_LABELS, effectiveMechaStats } from "../mechaRules.js";
import { LOYALTY_TIER_MIN, LOYALTY_TIER_MAX, RARITY_MAX } from "../slugRules.js";
import { loyaltyPerShot, LOYALTY_FULL_EPSILON, LOYALTY_TIER_LABELS } from "../loyaltyRules.js";
import { wearPerShot } from "../careRules.js";
import { toClientSlug } from "./slugs.js";
import { toClientBlaster } from "./blasters.js";
import { toClientCharacter } from "./characters.js";
import { EQUIPMENT_SLOT, meleeDamageFor, DEFAULT_MELEE_TYPE } from "../equipmentRules.js";
import { recordSlugpediaEntry } from "../slugpediaStore.js";
import { recordCombatEvent, publishCombatReport } from "../combatStats.js";
import { slugReturnTurns, syncTempoAura } from "../slugAura.js";
import {
  MOVE_SPEED_PER_AP,
  MECHA_SPEED_PER_AP,
  MOUNT_RANGE,
  MOVE_AP_COST,
  MOUNT_AP_COST,
  RAM_AP_COST,
  RAM_DAMAGE_MULTIPLIER,
  RAM_CHARACTER_MAX_GRIT_FRACTION,
  splitRiderDamage,
  ELECTRIC_MECHA_DAMAGE_MULTIPLIER,
  SWITCH_WEAPON_AP_COST,
  PRIMARY_WEAPON_SLOT,
  SECONDARY_WEAPON_SLOT,
  hunkerHeal,
  hunkerGritCap,
  rollD20,
  distance,
  pointAtDistance,
  missDeflection,
  firstWallHit,
  breakWallSegment,
  knockbackTarget,
  computeMaxStructure,
  knockoutDC,
  countKnockoutPipsUsed,
  typeBallistics,
  shotFlightMs,
  shotTooClose,
  shotWindupFraction,
  SHOT_SLOW_PHASE_MS,
  shotDistanceFraction,
  lerpPoint,
  isSupportiveSlug,
  resolveClash,
  rangePenalty,
  KNOCKBACK_DISTANCE,
  KNOCKBACK_DISMOUNT_CHANCE,
  SHOT_FLIGHT_MULTIPLIER,
  shotKnockbackDistance,
  slugBallistics,
  slugHasTrait,
  slugHasType,
  shotSlugIds,
  dualShotPairError,
  buildDualShotSlug,
  DUAL_SHOT_BASE_TYPE,
  tickStatusEffects,
  REGEN_DURATION_TURNS,
  computeRegenAmount,
  GRAPPLE_WALL_STOP_DISTANCE,
  grappleDestination,
  STALL_COOLDOWN_TURNS,
  METAL_PULL_DISTANCE,
  METAL_PULL_RADIUS,
  PLANT_MAX_GRIT,
  PLANT_BITE_RANGE,
  GHOST_SPAWN_OFFSET,
  POTENT_POISON_MULTIPLIER,
  BLEED_DURATION_TURNS,
  pathCrossesRange,
  aoeRadiusMult,
  RANDOM_STATUS_COUNT,
  RANDOM_STATUS_SELF_COUNT,
  RANDOM_STATUS_NEGATIVE,
  RANDOM_STATUS_POSITIVE,
  RANDOM_STATUS_LABELS,
  computeBurnDamage,
  BURN_DURATION_TURNS,
  POISON_DAMAGE_PER_STACK,
  POISON_DURATION_TURNS,
  SNARE_DURATION_TURNS,
  ICE_PATCH_RADIUS,
  ICE_SLIP_CHANCE,
  SLIPPERY_SLIP_CHANCE,
  computeStunAp,
  stunApOf,
  HEAL_POWER_MULTIPLIER,
  METAL_UNCOUNTERED_MULTIPLIER,
  findHazardAt,
  hazardsAlongPath,
  ENV_ACTION_DC,
  WALL_MAKER_LENGTH,
  BRIDGE_WIDTH,
  BRIDGE_LENGTH,
  angleBetween,
  perpendicularSegment,
  pointInBridge,
  AOE_RADIUS,
  HAZARD_RADIUS,
  HAZARD_DAMAGE_FRACTION,
  HAZARD_DURATION_ROUNDS,
  CHAIN_RADIUS,
  RICOCHET_MAX_BOUNCES,
  MEGA_MORPH_MIN_SPEED,
  MEGA_MORPH_PIP_COST,
  applyMegaMorphToSlug,
  INVISIBLE_DURATION_TURNS,
  FEAR_FLEE_AP_EQUIVALENT,
  CONFUSION_DURATION_TURNS,
  CONFUSION_CHANCE,
  confusedDeflection,
  clampToMapBounds,
  withMapEdges,
  MELEE_KNOCKBACK_DISTANCE,
  INSIGHT_DC,
  wallVaultApCost,
  planWallVault,
  WALL_RUN_AP_COST,
  WALL_RUN_MIN_DISTANCE,
  wallRunDistance,
  planWallRun,
  makeWaterSet,
  isWaterAt,
  pathApCost,
  pathTouchesWater,
  WATER_FOOT_COST_MULT,
  MECHA_MODES,
  BIKE_ACCURACY_PENALTY,
  modeBlasterSpeedFactor,
  modeMechaSpeedFactor,
  modeIgnoresWater,
  effectiveMode,
  isBurrowed,
  combatantSkillMod,
  areAllies,
  combatSide,
  COMBAT_TEAM_IDS,
  PERCEPTION_DC,
  PERCEPTION_RANGE,
  moveSpeedPerAp,
  gearMoveMult,
  gearAccuracyMod,
  gearReloadAp,
  gearDisadvantage,
  reloadApCostFor,
  dodgeSidestepDistance,
  HIDE_AP_COST,
  HIDE_RANGE,
  HIDE_DC,
  INTIMIDATE_AP_COST,
  INTIMIDATE_RANGE,
  INTIMIDATE_DC,
  INTIMIDATE_AP_PENALTY,
  firstAidApCost,
  FIRST_AID_RANGE,
  NEGATIVE_STATUS_KEYS,
  STYLE_DC,
  STYLE_FAME_BONUS,
  CLASH_TRIPLE_MULTIPLIER,
  CONE_HALF_ANGLE_DEG,
  CONE_LENGTH,
  CONE_DAMAGE_FRACTION,
  pointInCone,
  POD_COUNT,
  POD_SCATTER_RADIUS,
  POD_LINE_HIT_TOLERANCE,
  rollPodTimer,
  scatterPoint,
  distanceToSegment,
  podLineEnd,
  STAR_HIT_TOLERANCE,
  starSegments,
  ANCHOR_RADIUS,
  ANCHOR_DURATION_ROUNDS,
  DISARM_ZONE_RADIUS,
  DISARM_ZONE_DURATION_ROUNDS,
  DISARM_DURATION_TURNS,
  MIND_SCRAMBLE_ENEMY_EFFECTS,
  MIND_SCRAMBLE_SELF_EFFECTS,
  MIND_SCRAMBLE_EFFECT_LABELS,
  MIND_SCRAMBLE_DURATION_TURNS,
  FRICTION_EFFECTS,
  FRICTION_EFFECT_LABELS,
  SLIPPERY_DURATION_TURNS,
  CROSSWIND_ZONE_RADIUS,
  CROSSWIND_ZONE_DURATION_ROUNDS,
  LOYALTY_FRIENDLY_TIER,
  MARK_SPLASH_FRACTION,
  rollCrosswindOffset,
  rotateDeflection,
  reactionWindowFactor,
  reverseMoveDestination,
  isInsideAnyZone,
  DECOY_COUNT,
  DECOY_MAX_RADIUS,
  MAP_UNITS_PER_METER,
  DEFAULT_MAP_METERS,
  MIN_MAP_METERS,
  MAX_MAP_METERS,
  rescaleWater,
  randomDecoyOffset,
  loyaltyAccuracyModifier,
  loyaltyEnvScale,
  applyLoyaltyToSlug,
  blasterTypeAccuracyBonus,
  gatlingShotApCost,
  applyBlasterTypeToSlug,
  applyPowerSurgeToSlug,
  POWER_SURGE_MULTIPLIER,
  DODGE_AP_COST,
  DODGE_SIDESTEP_DISTANCE,
  DODGE_FAME_BONUS,
  sidestepTarget,
  slugBaseHitAmount,
} from "../combatRules.js";
import { evaluateAutoCounter } from "../autoCounter.js";
import { buildGearSnapshot } from "../outfitRules.js";
import { getClimate, getWornOutfit } from "../outfitService.js";

const router = Router();
router.use(requireAuth);

// A burrowed unit may only Move, End Turn, or surface (mecha-mode) -- every
// other combat action is refused. The acting combatant arrives under a few
// different body keys depending on the route.
const BURROW_ALLOWED_ACTIONS = new Set(["/move", "/end-turn", "/mecha-mode"]);
router.use("/actions", async (req, res, next) => {
  try {
    if (req.method !== "POST" || BURROW_ALLOWED_ACTIONS.has(req.path)) {
      return next();
    }
    const body = req.body || {};
    const actorId = body.combatantId ?? body.attackerId ?? body.mechaCombatantId;
    if (actorId == null) return next();
    const actor = await getCombatant(actorId);
    if (actor && isBurrowed(actor)) {
      return res.status(400).json({ error: "Burrowed -- surface first. Only moving and surfacing are possible underground." });
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Battle Report: every successful action route leaves a one-line "this
// combatant did X" event (Reload, Hide, Patch Up...). Shooting and moving
// have richer, dedicated events of their own, so they're skipped here.
const STAT_SKIP_ACTIONS = new Set(["/shoot", "/move", "/end-turn", "/arm-slug"]);
router.use("/actions", (req, res, next) => {
  if (req.method !== "POST" || STAT_SKIP_ACTIONS.has(req.path)) return next();
  res.on("finish", async () => {
    if (res.statusCode >= 400) return;
    try {
      const body = req.body || {};
      const actorId = body.combatantId ?? body.attackerId ?? body.mechaCombatantId;
      if (actorId == null) return;
      const actor = await getCombatant(actorId);
      if (actor) await recordCombatEvent(actor.encounter_id, "action", { actor, action: req.path.slice(1) });
    } catch (err) {
      console.error("Could not record action stat:", err);
    }
  });
  next();
});

function recordShotResult(encounterId, actor, target, outcome, slug, extra = {}) {
  return recordCombatEvent(encounterId, "shot_result", {
    actor,
    target,
    outcome,
    slug: slug?.name ?? null,
    slugType: slug?.type ?? null,
    ...extra,
  });
}

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function toClientCombatant(row) {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    kind: row.kind,
    refUserId: row.ref_user_id,
    refMechaId: row.ref_mecha_id,
    refNpcTemplateId: row.ref_npc_template_id,
    refGruntTemplateId: row.ref_grunt_template_id,
    // Ally / Friend / Neutral / Rival / Enemy / Unknown -- from loadFullEncounter's
    // join (which reflects later template edits), falling back to the copy
    // stamped into `data` when the combatant was spawned. Null for
    // characters/mecha. Combat shows everyone fully, so this is never gated on
    // the NPC card's per-line "shown" flag.
    relationship: row.relationship ?? row.data?.relationship ?? null,
    team: row.team ?? null,
    name: row.name,
    portrait: row.portrait,
    x: row.x,
    y: row.y,
    maxAp: row.max_ap,
    currentAp: row.current_ap,
    maxGrit: row.max_grit,
    currentGrit: row.current_grit,
    maxStructure: row.max_structure,
    currentStructure: row.current_structure,
    knockoutPips: row.knockout_pips,
    unconscious: row.unconscious,
    disabled: row.disabled,
    initiative: row.initiative,
    mountedOn: row.mounted_on,
    damagedThisTurn: row.damaged_this_turn,
    rammedThisRound: row.rammed_this_round,
    statusEffects: row.status_effects,
    data: row.data,
  };
}

function toClientEncounter(row, combatants) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    mapWidth: row.map_width,
    mapHeight: row.map_height,
    mapImage: row.map_image,
    walls: row.walls,
    water: row.water,
    hazards: row.hazards,
    bridges: row.bridges,
    pods: row.pods,
    zones: row.zones,
    turnOrder: row.turn_order,
    activeTurnIndex: row.active_turn_index,
    // Teammates who are next to each other in the order act together (see
    // advanceTurn): everyone in the current phase who hasn't ended their turn.
    activeCombatantIds: activeGroupIds(row),
    activeCombatantId: activeGroupIds(row)[0] ?? null,
    round: row.round,
    combatants: withDecoyMimics(combatants.map(toClientCombatant)),
  };
}

// A Mirage Coil decoy must read exactly like its owner on every client -- same
// team ring, same name tint -- so the DM's teams (and relationship hues) can't
// give it away. `mimic` carries the owner's side-defining fields; the client
// resolves colour and team through it (see combatSide / combatantNameColor).
function withDecoyMimics(list) {
  const byId = new Map(list.map((c) => [c.id, c]));
  return list.map((c) => {
    if (c.kind !== "decoy") return c;
    const owner = byId.get(c.data?.decoyOwnerId);
    return owner ? { ...c, mimic: { kind: owner.kind, relationship: owner.relationship, team: owner.team } } : c;
  });
}

async function loadFullEncounter(id) {
  const encResult = await pool.query("SELECT * FROM encounters WHERE id = $1", [id]);
  const encounter = encResult.rows[0];
  if (!encounter) return null;
  const combatantsResult = await pool.query(
    `SELECT c.*,
       COALESCE(gt.relationship, nt.profile->'fields'->'relationship'->>'value') AS relationship
     FROM combatants c
     LEFT JOIN grunt_templates gt ON gt.id = c.ref_grunt_template_id
     LEFT JOIN npc_templates nt ON nt.id = c.ref_npc_template_id
     WHERE c.encounter_id = $1
     ORDER BY c.id ASC`,
    [id]
  );
  return toClientEncounter(encounter, combatantsResult.rows);
}

async function broadcastEncounter(id) {
  const encounter = await loadFullEncounter(id);
  if (encounter) broadcastAll({ type: "encounter-updated", encounter });
  return encounter;
}

async function getActiveEncounterRow() {
  const { rows } = await pool.query(
    "SELECT * FROM encounters WHERE status IN ('setup', 'active') ORDER BY created_at DESC LIMIT 1"
  );
  return rows[0] || null;
}

// Lives in its own table/feed, entirely separate from Party Chat -- see the
// Combat Log panel under the Turn Order roster on the client.
async function pushCombatLog(encounterId, text) {
  if (!text || !encounterId) return;
  try {
    const { rows } = await pool.query(
      `INSERT INTO combat_log (encounter_id, body) VALUES ($1, $2) RETURNING id, encounter_id, body, created_at`,
      [encounterId, text]
    );
    broadcastAll({
      type: "combat-log-entry",
      encounterId,
      entry: { id: rows[0].id, body: rows[0].body, createdAt: rows[0].created_at },
    });
  } catch (err) {
    // Never let a logging hiccup block combat resolution itself.
    console.error("Could not log combat message:", err);
    console.log("[combat]", text);
  }
}

async function getCombatant(id) {
  const { rows } = await pool.query("SELECT * FROM combatants WHERE id = $1", [id]);
  return rows[0] || null;
}

// A mecha with someone riding it shares that rider's turn -- it never takes
// its own (see advanceTurn's skip loop), and it also can't be moved
// independently (see /actions/move).
async function mechaRiders(mechaId) {
  const { rows } = await pool.query("SELECT * FROM combatants WHERE mounted_on = $1", [mechaId]);
  return rows;
}

async function updateCombatant(id, fields) {
  // Safety net for every position write -- a knockback, a drag, a reel, a swap:
  // nobody ends up off the board, whatever path put them there.
  if ("x" in fields || "y" in fields) {
    const { rows: dims } = await pool.query(
      "SELECT e.map_width, e.map_height FROM combatants c JOIN encounters e ON e.id = c.encounter_id WHERE c.id = $1",
      [id]
    );
    if (dims[0]) {
      const probe = { x: fields.x ?? 0, y: fields.y ?? 0 };
      const inside = clampToMapBounds(probe, dims[0].map_width, dims[0].map_height);
      fields = { ...fields };
      if ("x" in fields) fields.x = Number.isFinite(fields.x) ? inside.x : dims[0].map_width / 2;
      if ("y" in fields) fields.y = Number.isFinite(fields.y) ? inside.y : dims[0].map_height / 2;
    }
  }
  const keys = Object.keys(fields);
  if (keys.length === 0) return getCombatant(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await pool.query(`UPDATE combatants SET ${setClause} WHERE id = $1 RETURNING *`, [
    id,
    ...keys.map((k) => fields[k]),
  ]);
  return rows[0] || null;
}

// What a character brings into a fight: AP and max Grit from stats, then their
// worn outfit against the temperature of the world (or ship) they are on, then
// illness. Used when they are added to the lobby and again when the fight
// starts, since an outfit can change in between. See outfitRules.js.
async function characterGearSnapshot(character) {
  const outfit = await getWornOutfit(pool, character.user_id);
  const { temp } = await getClimate();
  return buildGearSnapshot({
    baseMaxAp: actionPoints(character.stats),
    baseMaxGrit: computeMaxGrit(character.stats, character.grit_bonus),
    outfit,
    fortitudeMod: skillModifier(character.stats, character.proficiencies, "fortitude"),
    temp,
    ill: Boolean(character.ill),
  });
}

async function syncCharacterFromCombatant(combatant) {
  if (combatant.kind !== "character" || !combatant.ref_user_id) return;
  try {
    const { rows } = await pool.query(
      `UPDATE characters SET current_grit = $1, knockout_pips = $2 WHERE user_id = $3 RETURNING *`,
      [combatant.current_grit, JSON.stringify(combatant.knockout_pips || [false, false, false]), combatant.ref_user_id]
    );
    if (!rows[0]) return;
    broadcastAll({
      type: "character-updated",
      userId: combatant.ref_user_id,
      // A full character: this broadcast is a full-object replace on the client
      // (CharacterSheet.jsx etc.), so anything left out (Fame, Heat, illness...)
      // would blank on every single combat grit sync.
      character: toClientCharacter(rows[0]),
    });
  } catch (err) {
    console.error("Could not sync character from combatant:", err);
  }
}

// Fame only ever moves up automatically (see the callers below); a DM's
// manual override (routes/characters.js's PATCH /:userId/fame) can move it
// either way. Heat follows Fame one-directionally: whatever positive amount
// Fame just gained, from EITHER source, Heat gains the same amount less the
// character's Deception cut (heatGainFor), atomically, in the same query -- a
// negative delta lowers Fame but never touches Heat. Heat's only decrease path is the separate, explicit DM
// action in PATCH /:userId/heat, which never calls this function. Floors
// both stats at 0.
async function grantFame(userId, delta) {
  if (!userId || !delta) return null;
  try {
    const { rows: who } = await pool.query("SELECT stats, proficiencies FROM characters WHERE user_id = $1", [userId]);
    if (!who[0]) return null;
    const heatDelta = heatGainFor(delta, skillModifier(who[0].stats, who[0].proficiencies, "deception"));
    const { rows } = await pool.query(
      `UPDATE characters SET fame = GREATEST(0, fame + $1), heat = GREATEST(0, heat + $2) WHERE user_id = $3 RETURNING *`,
      [delta, heatDelta, userId]
    );
    if (!rows[0]) return null;
    broadcastAll({
      type: "character-updated",
      userId,
      character: toClientCharacter(rows[0]),
    });
    return rows[0];
  } catch (err) {
    console.error("Could not grant Fame:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Encounter lifecycle
// ---------------------------------------------------------------------------

router.get("/active", async (req, res) => {
  try {
    const row = await getActiveEncounterRow();
    if (!row) return res.json({ encounter: null });
    res.json({ encounter: await loadFullEncounter(row.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load encounter." });
  }
});

router.get("/encounters/:id/log", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query(
      "SELECT id, body, created_at FROM combat_log WHERE encounter_id = $1 ORDER BY id ASC",
      [id]
    );
    res.json({ entries: rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load combat log." });
  }
});

// ---------------------------------------------------------------------------
// What the players know of a foe's slugs (Insight)
// ---------------------------------------------------------------------------
// A foe's slugs are hidden from the party. Two things lift the veil: a
// character's opening Insight read of that foe (data.insightSeers -- the user
// ids who read it) shows that player the whole magazine, and every slug a foe
// fires is shown to everyone from then on (data.shownSlugIds). The DM sees it
// all anyway, and allies hold nothing back.

function knownFoeSlugIds(combatant, slugs, viewerUserId) {
  if (combatant.data?.insightSeers?.includes(viewerUserId)) return slugs.map((s) => s.id);
  const shown = new Set(combatant.data?.shownSlugIds || []);
  return slugs.filter((s) => shown.has(s.id)).map((s) => s.id);
}

router.get("/encounters/:id/slug-knowledge", async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (req.user.role === "Dungeon Master") return res.json({ knowledge: {} });
    const { rows: combatants } = await pool.query("SELECT * FROM combatants WHERE encounter_id = $1", [id]);
    const viewer = combatants.find((c) => c.kind === "character" && c.ref_user_id === req.user.sub);
    const npcs = combatants.filter((c) => c.kind === "npc");
    const { rows: slugs } = npcs.length
      ? await pool.query("SELECT id, name, type, owner_combatant_id FROM slugs WHERE owner_combatant_id = ANY($1::int[]) ORDER BY id", [npcs.map((c) => c.id)])
      : { rows: [] };
    const knowledge = {};
    for (const npc of npcs) {
      const owned = slugs.filter((s) => s.owner_combatant_id === npc.id);
      if (owned.length === 0) continue;
      const ally = viewer ? areAllies(viewer, npc) : false;
      const knownIds = new Set(ally ? owned.map((s) => s.id) : knownFoeSlugIds(npc, owned, req.user.sub));
      const known = owned.filter((s) => knownIds.has(s.id));
      knowledge[npc.id] = {
        total: owned.length,
        read: Boolean(ally || npc.data?.insightSeers?.includes(req.user.sub)),
        known: known.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      };
    }
    res.json({ knowledge });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load what you know of the foes' slugs." });
  }
});

// As a fight opens, each character rolls d20 + Insight against every foe that
// carries slugs. Meeting INSIGHT_DC reads that foe's magazine for them. The log
// says who read whom -- never which slugs, since the log is public.
async function insightOpeningRead(encounterId, combatantRows) {
  const observers = combatantRows.filter((c) => c.kind === "character" && c.ref_user_id);
  const foes = combatantRows.filter((c) => c.kind === "npc");
  if (observers.length === 0 || foes.length === 0) return;
  const { rows: owned } = await pool.query(
    "SELECT DISTINCT owner_combatant_id FROM slugs WHERE owner_combatant_id = ANY($1::int[])",
    [foes.map((c) => c.id)]
  );
  const armed = new Set(owned.map((r) => r.owner_combatant_id));
  // A fight that is started again begins with a clean slate.
  await pool.query("UPDATE combatants SET data = COALESCE(data, '{}'::jsonb) - 'insightSeers' - 'shownSlugIds' WHERE id = ANY($1::int[])", [
    foes.map((c) => c.id),
  ]);
  const seers = new Map(); // foe id -> user ids
  for (const observer of observers) {
    const mod = combatantSkillMod(observer, "insight");
    const read = [];
    for (const foe of foes) {
      if (!armed.has(foe.id) || areAllies(observer, foe)) continue;
      if (rollD20() + mod < INSIGHT_DC) continue;
      read.push(foe.name);
      seers.set(foe.id, [...(seers.get(foe.id) || []), observer.ref_user_id]);
    }
    if (read.length > 0) {
      await pushCombatLog(encounterId, `${observer.name}'s Insight reads ${read.join(", ")} -- their slugs are no secret.`);
    }
  }
  for (const [foeId, userIds] of seers) {
    await pool.query("UPDATE combatants SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb WHERE id = $2", [
      JSON.stringify({ insightSeers: userIds }),
      foeId,
    ]);
  }
  broadcastAll({ type: "combat-slug-knowledge", encounterId });
}

// A foe fires a slug and the whole table sees which one: it's known from now on.
async function revealFiredSlug(attacker, slug) {
  if (attacker.kind !== "npc" || !Number.isInteger(slug?.id)) return;
  const shown = attacker.data?.shownSlugIds || [];
  if (shown.includes(slug.id)) return;
  await pool.query("UPDATE combatants SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb WHERE id = $2", [
    JSON.stringify({ shownSlugIds: [...shown, slug.id] }),
    attacker.id,
  ]);
  broadcastAll({ type: "combat-slug-knowledge", encounterId: attacker.encounter_id });
}

// ---------------------------------------------------------------------------
// Battle reports (frozen at the end of each fight -- see combatStats.js)
// ---------------------------------------------------------------------------

router.get("/reports", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, encounter_name, created_at, seen_by, report->'encounter' AS encounter
       FROM combat_reports WHERE recipients @> $1::jsonb ORDER BY created_at DESC LIMIT 60`,
      [JSON.stringify([req.user.sub])]
    );
    res.json({
      reports: rows.map((r) => ({
        id: r.id,
        name: r.encounter_name,
        createdAt: r.created_at,
        seen: (r.seen_by || []).includes(req.user.sub),
        rounds: r.encounter?.rounds ?? null,
        totalDamage: r.encounter?.totalDamage ?? 0,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load battle reports." });
  }
});

router.get("/reports/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, encounter_name, created_at, report FROM combat_reports WHERE id = $1 AND recipients @> $2::jsonb",
      [Number(req.params.id), JSON.stringify([req.user.sub])]
    );
    if (!rows[0]) return res.status(404).json({ error: "Report not found." });
    res.json({ id: rows[0].id, name: rows[0].encounter_name, createdAt: rows[0].created_at, report: rows[0].report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load battle report." });
  }
});

router.post("/reports/:id/seen", async (req, res) => {
  try {
    await pool.query(
      `UPDATE combat_reports SET seen_by = seen_by || $2::jsonb
       WHERE id = $1 AND recipients @> $2::jsonb AND NOT seen_by @> $2::jsonb`,
      [Number(req.params.id), JSON.stringify([req.user.sub])]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not mark report seen." });
  }
});

router.post("/encounters", requireDungeonMaster, async (req, res) => {
  const { name, mapWidth, mapHeight } = req.body || {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Encounter name is required." });
  }
  try {
    const existing = await getActiveEncounterRow();
    if (existing) {
      return res.status(400).json({ error: "An encounter is already in progress. End it before starting another." });
    }
    const { rows } = await pool.query(
      `INSERT INTO encounters (name, map_width, map_height) VALUES ($1, $2, $3) RETURNING *`,
      [
        name.trim(),
        Number.isInteger(mapWidth) ? mapWidth : DEFAULT_MAP_METERS * MAP_UNITS_PER_METER,
        Number.isInteger(mapHeight) ? mapHeight : Math.round((DEFAULT_MAP_METERS * MAP_UNITS_PER_METER * 9) / 16),
      ]
    );
    const encounter = await loadFullEncounter(rows[0].id);
    broadcastAll({ type: "encounter-updated", encounter });
    res.status(201).json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create encounter." });
  }
});

// Scraps an encounter that is still being staged: nothing was fought, so unlike
// /end there is no battle report and nothing to reset -- the encounter and
// everything the DM placed in it (combatants, and the blasters/slugs spawned
// for NPCs) simply go away. Clients already treat a "finished" encounter as
// "no encounter", so that is what the broadcast says.
router.delete("/encounters/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("SELECT status FROM encounters WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });
    if (rows[0].status !== "setup") {
      return res.status(400).json({ error: "Only an encounter that hasn't started can be cancelled -- end it instead." });
    }
    const encounter = await loadFullEncounter(id);
    await pool.query("DELETE FROM encounters WHERE id = $1", [id]);
    broadcastAll({ type: "encounter-updated", encounter: { ...encounter, status: "finished" } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not cancel encounter." });
  }
});

router.post("/encounters/:id/end", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("UPDATE encounters SET status = 'finished' WHERE id = $1 RETURNING *", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });

    // A slug's return-to-hand cooldown only makes sense mid-fight -- once
    // the encounter is over there are no more turns for it to count down
    // against, so every slug that belonged to a combatant here comes back
    // fresh for next time instead of carrying a stale cooldown into it.
    // Slugs sitting in a destroyed pod (see breakPods) only come back if their
    // owner has a spare pod to put them in -- the end-of-fight reset spends one
    // each, oldest first; whatever the owner can't cover stays unloaded.
    const { rows: brokenSlugs } = await pool.query(
      `SELECT s.id, s.user_id FROM slugs s JOIN combatants c ON c.encounter_id = $1 AND s.user_id = c.ref_user_id
       WHERE s.pod_broken ORDER BY s.id`,
      [id]
    );
    const podBudget = new Map();
    const keepBroken = [];
    for (const s of brokenSlugs) {
      if (!podBudget.has(s.user_id)) {
        const { rows: pr } = await pool.query("SELECT pods FROM characters WHERE user_id = $1", [s.user_id]);
        podBudget.set(s.user_id, pr[0]?.pods ?? 0);
      }
      const left = podBudget.get(s.user_id);
      if (left > 0) podBudget.set(s.user_id, left - 1);
      else keepBroken.push(s.id);
    }
    for (const [userId, left] of podBudget) {
      const { rows: pr } = await pool.query("UPDATE characters SET pods = $1 WHERE user_id = $2 RETURNING pods", [left, userId]);
      broadcastAll({ type: "pods-updated", userId, pods: pr[0]?.pods ?? left });
    }

    const { rows: clearedSlugs } = await pool.query(
      `UPDATE slugs s SET cooldown_turns_left = 0,
         loaded = (s.id <> ALL($2::int[])),
         pod_broken = (s.id = ANY($2::int[]))
       FROM combatants c
       WHERE c.encounter_id = $1
         AND (s.user_id = c.ref_user_id OR s.owner_combatant_id = c.id)
         AND (s.cooldown_turns_left > 0 OR s.loaded = false OR s.pod_broken)
       RETURNING s.*`,
      [id, keepBroken]
    );
    for (const slugRow of clearedSlugs) {
      broadcastAll({ type: "slug-updated", userId: slugRow.user_id, slug: toClientSlug(slugRow) });
    }

    const encounter = await loadFullEncounter(id);
    broadcastAll({ type: "encounter-updated", encounter });
    await pushCombatLog(id, `${encounter.name} has ended.`);
    // Freeze the Battle Report and send it to every participant + the DM.
    const reportId = await publishCombatReport(id);
    if (reportId) await pushCombatLog(id, "A battle report has been sent to everyone who took part.");
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not end encounter." });
  }
});

// ---------------------------------------------------------------------------
// Map background
// ---------------------------------------------------------------------------

// Sets/replaces the map picture ({ image }), or clears it ({ image: null }).
// The picture is always cover-fitted to the map; there is no DM pan/zoom of it
// any more (each viewer pans/zooms their own view -- see CombatMap.jsx), so
// the old map_image_scale/offset columns are reset and otherwise unused.
router.patch("/encounters/:id/map", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { image } = req.body || {};
  if (image === undefined) return res.status(400).json({ error: "Nothing to update." });
  if (image !== null && typeof image !== "string") {
    return res.status(400).json({ error: "Map image must be a data URL or null." });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE encounters SET map_image = $1, map_image_scale = 1, map_image_offset_x = 0, map_image_offset_y = 0
       WHERE id = $2 RETURNING id`,
      [image, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update map." });
  }
});

// Sets how big the battlefield really is: { meters } across (the height keeps
// the map's current aspect ratio). Ranges, hazards, mount reach etc. are all
// fixed distances (see MAP_UNITS_PER_METER in combatRules.js), so a bigger
// map automatically makes every one of them cover less of it. Setup only --
// everything the DM has placed is rescaled to stay over the same spot of the
// map picture, which would be meaningless once a fight is running.
router.patch("/encounters/:id/size", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const meters = Number(req.body?.meters);
  if (!Number.isFinite(meters) || meters < MIN_MAP_METERS || meters > MAX_MAP_METERS) {
    return res.status(400).json({ error: `Map width must be between ${MIN_MAP_METERS} and ${MAX_MAP_METERS} metres.` });
  }
  try {
    const { rows } = await pool.query("SELECT * FROM encounters WHERE id = $1", [id]);
    const enc = rows[0];
    if (!enc) return res.status(404).json({ error: "Encounter not found." });
    if (enc.status !== "setup") return res.status(400).json({ error: "The map can only be resized during setup." });

    const newWidth = Math.round(meters * MAP_UNITS_PER_METER);
    const newHeight = Math.max(1, Math.round((newWidth * enc.map_height) / enc.map_width));
    const kx = newWidth / enc.map_width;
    const ky = newHeight / enc.map_height;
    if (newWidth !== enc.map_width) {
      const walls = (enc.walls || []).map((w) => ({ ...w, x1: w.x1 * kx, y1: w.y1 * ky, x2: w.x2 * kx, y2: w.y2 * ky }));
      const water = rescaleWater(enc.water, kx, ky, newWidth, newHeight);
      await pool.query("UPDATE encounters SET map_width = $1, map_height = $2, walls = $3, water = $4 WHERE id = $5", [
        newWidth,
        newHeight,
        JSON.stringify(walls),
        JSON.stringify(water),
        id,
      ]);
      await pool.query("UPDATE combatants SET x = x * $1, y = y * $2 WHERE encounter_id = $3", [kx, ky, id]);
    }
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not resize map." });
  }
});

// ---------------------------------------------------------------------------
// Water terrain (painted by the DM during setup)
// ---------------------------------------------------------------------------

router.patch("/encounters/:id/water", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { cells, paint } = req.body || {};
  if (!Array.isArray(cells) || !cells.every((c) => Number.isInteger(c) && c >= 0)) {
    return res.status(400).json({ error: "cells must be a list of cell ids." });
  }
  try {
    const { rows } = await pool.query("SELECT water FROM encounters WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });
    const set = makeWaterSet(rows[0].water);
    for (const c of cells) {
      if (paint) set.add(c);
      else set.delete(c);
    }
    await pool.query("UPDATE encounters SET water = $1 WHERE id = $2", [JSON.stringify([...set]), id]);
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not paint water." });
  }
});

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

router.post("/encounters/:id/walls", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { x1, y1, x2, y2 } = req.body || {};
  if ([x1, y1, x2, y2].some((v) => typeof v !== "number" || Number.isNaN(v))) {
    return res.status(400).json({ error: "A wall needs four numeric coordinates." });
  }
  try {
    const { rows } = await pool.query("SELECT walls, next_wall_id FROM encounters WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });
    const wallId = rows[0].next_wall_id;
    // Explicit "dm" source (vs. a Wall Maker slug's "slug") -- see the
    // Break Wall action: a DM wall only ever loses a WALL_BREAK_RADIUS
    // chunk, a player-made one breaks outright.
    const walls = [...rows[0].walls, { id: wallId, source: "dm", x1, y1, x2, y2 }];
    await pool.query("UPDATE encounters SET walls = $1, next_wall_id = $2 WHERE id = $3", [
      JSON.stringify(walls),
      wallId + 1,
      id,
    ]);
    const encounter = await broadcastEncounter(id);
    res.status(201).json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not add wall." });
  }
});

router.delete("/encounters/:id/walls/:wallId", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const wallId = Number(req.params.wallId);
  try {
    const { rows } = await pool.query("SELECT walls FROM encounters WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });
    const walls = rows[0].walls.filter((w) => w.id !== wallId);
    await pool.query("UPDATE encounters SET walls = $1 WHERE id = $2", [JSON.stringify(walls), id]);
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove wall." });
  }
});

// ---------------------------------------------------------------------------
// Combatants
// ---------------------------------------------------------------------------

router.post("/encounters/:id/combatants", requireDungeonMaster, async (req, res) => {
  const encounterId = Number(req.params.id);
  const { kind, refUserId, refMechaId, name, x, y, team } = req.body || {};

  if (team != null && !COMBAT_TEAM_IDS.includes(team)) return res.status(400).json({ error: "Unknown team." });
  if (!["character", "npc", "mecha"].includes(kind)) {
    return res.status(400).json({ error: "Kind must be character, npc, or mecha." });
  }
  const px = Number.isFinite(x) ? x : 100;
  const py = Number.isFinite(y) ? y : 100;

  try {
    let fields = {
      encounter_id: encounterId,
      kind,
      ref_user_id: null,
      ref_mecha_id: null,
      name: (name || "").trim() || "Combatant",
      portrait: null,
      x: px,
      y: py,
      max_ap: 2,
      current_ap: 0,
      max_grit: null,
      current_grit: null,
      max_structure: null,
      current_structure: null,
      knockout_pips: null,
      team: team ?? null,
      data: {},
    };

    if (kind === "character") {
      if (!Number.isInteger(refUserId)) return res.status(400).json({ error: "A player is required." });
      const { rows } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [refUserId]);
      const character = rows[0];
      if (!character) return res.status(400).json({ error: "That player doesn't have a character sheet yet." });
      fields.ref_user_id = refUserId;
      fields.name = (name || character.name).trim();
      fields.portrait = character.portrait;
      const gearSnap = await characterGearSnapshot(character);
      fields.max_ap = gearSnap.maxAp;
      fields.max_grit = gearSnap.maxGrit;
      fields.current_grit = Math.min(character.current_grit, gearSnap.maxGrit);
      fields.knockout_pips = JSON.stringify(character.knockout_pips);
      // Every character joins on their primary weapon (equip slot 0) --
      // Switch Weapon (see /actions/switch-weapon) flips this to secondary.
      fields.data = {
        dexMod: initiativeBonus(character.stats),
        conMod: statModifier(character.stats.constitution),
        // Melee hit roll and damage (see /actions/melee) -- the client previews them.
        strMod: statModifier(character.stats.strength),
        shield: await shieldSnapshot(refUserId, {}),
        skills: Object.fromEntries(
          PROFICIENCY_KEYS.map((key) => [key, skillModifier(character.stats, character.proficiencies, key)])
        ),
        activeWeaponSlot: PRIMARY_WEAPON_SLOT,
        gear: gearSnap.gear,
      };
    } else if (kind === "mecha") {
      if (!Number.isInteger(refMechaId)) return res.status(400).json({ error: "A mecha is required." });
      const { rows } = await pool.query("SELECT * FROM mechas WHERE id = $1", [refMechaId]);
      const mecha = rows[0];
      if (!mecha) return res.status(400).json({ error: "Mecha not found." });
      const { rows: mechaMods } = await pool.query("SELECT * FROM mecha_mods WHERE equipped_mecha_id = $1", [refMechaId]);
      const stats = effectiveMechaStats(mecha, mechaMods);
      const maxStructure = computeMaxStructure({ armor: stats.structureArmor, tier: mecha.tier });
      fields.ref_mecha_id = refMechaId;
      fields.name = (name || mecha.name).trim();
      fields.portrait = mecha.image;
      fields.max_ap = 2;
      fields.max_structure = maxStructure;
      fields.current_structure = maxStructure;
      // ownerUserId: the player who owns this mecha on the Mechas page. They
      // (and only they, besides the DM) may move it on its own turn while
      // it's unmounted -- see /actions/move and isActingCombatantAuthorized.
      fields.data = { dexMod: 0, speed: stats.speed, handling: stats.handling, armor: stats.armor, rammingPower: stats.rammingPower, tier: mecha.tier, ownerUserId: mecha.user_id ?? null, modes: [...new Set(mechaMods.map((m) => m.unlocks_mode).filter(Boolean))], mode: null };
    } else {
      // npc: DM supplies a lightweight ad-hoc stat block. AP and Grit are
      // derived from the DEX/CON modifiers on the same curves players use --
      // never set by hand.
      const { dexModifier, conModifier } = req.body || {};
      fields.max_ap = npcActionPoints(dexModifier);
      fields.max_grit = npcMaxGrit(conModifier, dexModifier);
      fields.current_grit = fields.max_grit;
      fields.knockout_pips = JSON.stringify([false, false, false]);
      fields.data = { dexMod: Number.isInteger(dexModifier) ? dexModifier : 0, conMod: Number.isInteger(conModifier) ? conModifier : 0 };
    }

    const columns = Object.keys(fields);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const values = columns.map((c) => (typeof fields[c] === "object" && fields[c] !== null && !(fields[c] instanceof Array) ? JSON.stringify(fields[c]) : fields[c]));
    const { rows } = await pool.query(
      `INSERT INTO combatants (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    const encounter = await broadcastEncounter(encounterId);
    res.status(201).json({ encounter, combatant: toClientCombatant(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not add combatant." });
  }
});

router.patch("/encounters/:id/combatants/:cid/position", requireDungeonMaster, async (req, res) => {
  const cid = Number(req.params.cid);
  const { x, y } = req.body || {};
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ error: "x and y are required." });
  }
  try {
    // A free reposition (setup, or the DM holding Shift): deliberately skips AP,
    // hazards and ghost/bloom bites -- real movement goes through /actions/move.
    await updateCombatant(cid, { x, y });
    // Keep a mounted pair together: dragging the rider drags the mecha (and
    // any other riders), dragging the mecha drags its riders.
    const moved = await getCombatant(cid);
    if (moved?.mounted_on != null) {
      await updateCombatant(moved.mounted_on, { x, y });
      for (const r of await mechaRiders(moved.mounted_on)) {
        if (r.id !== cid) await updateCombatant(r.id, { x, y });
      }
    } else if (moved?.kind === "mecha") {
      for (const r of await mechaRiders(cid)) {
        await updateCombatant(r.id, { x, y });
      }
    }
    const encounter = await broadcastEncounter(Number(req.params.id));
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not move token." });
  }
});

// Teleports a combatant back to the middle of the map (and whatever rides with
// them) -- the DM's rescue for someone who got shoved somewhere they can't walk
// back from. Free: no AP, no hazards, no wall check, like a manual drag.
router.post("/encounters/:id/combatants/:cid/reset-position", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.cid);
  try {
    const { rows } = await pool.query("SELECT map_width, map_height FROM encounters WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });
    const combatant = await getCombatant(cid);
    if (!combatant || combatant.encounter_id !== id) return res.status(404).json({ error: "Combatant not found." });
    const center = { x: Math.round(rows[0].map_width / 2), y: Math.round(rows[0].map_height / 2) };
    // A rider goes with their mecha, a mecha with its riders (same pairing as a manual drag).
    const moving = new Set([cid]);
    if (combatant.mounted_on != null) moving.add(combatant.mounted_on);
    for (const m of [...moving]) for (const r of await mechaRiders(m)) moving.add(r.id);
    for (const mid of moving) await updateCombatant(mid, center);
    await pushCombatLog(id, `${combatant.name} is moved back to the middle of the map.`);
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reset that position." });
  }
});

router.patch("/encounters/:id/combatants/:cid/team", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.cid);
  const { team } = req.body || {};
  if (team !== null && !COMBAT_TEAM_IDS.includes(team)) return res.status(400).json({ error: "Unknown team." });
  try {
    await pool.query("UPDATE combatants SET team = $1 WHERE id = $2 AND encounter_id = $3", [team, cid, id]);
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change team." });
  }
});

// Auto-counter (see autoCounter.js): an NPC or grunt with this on answers its
// own counter windows -- the server forecasts whether a counter or dodge is
// worth it and acts after a short reaction delay, instead of prompting the DM.
// Stored on the combatant's `data` so it needs no migration and dies with it.
async function setAutoCounter(combatant, enabled) {
  const data = { ...(combatant.data || {}) };
  if (enabled) data.autoCounter = true;
  else delete data.autoCounter;
  await updateCombatant(combatant.id, { data: JSON.stringify(data) });
}

router.patch("/encounters/:id/combatants/:cid/auto-counter", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.cid);
  const { enabled } = req.body || {};
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be true or false." });
  try {
    const combatant = await getCombatant(cid);
    if (!combatant || combatant.encounter_id !== id) return res.status(404).json({ error: "Combatant not found." });
    if (combatant.kind !== "npc") return res.status(400).json({ error: "Only NPCs and grunts can auto-counter." });
    await setAutoCounter(combatant, enabled);
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change auto-counter." });
  }
});

// Bulk toggle for a whole group at once: every grunt, every important NPC, or both.
router.patch("/encounters/:id/auto-counter", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { enabled, scope } = req.body || {};
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be true or false." });
  if (!["all", "grunts", "npcs"].includes(scope)) return res.status(400).json({ error: "scope must be all, grunts or npcs." });
  try {
    const { rows } = await pool.query("SELECT * FROM combatants WHERE encounter_id = $1 AND kind = 'npc'", [id]);
    for (const c of rows) {
      const isGrunt = c.ref_grunt_template_id != null;
      if (scope === "all" || (scope === "grunts" && isGrunt) || (scope === "npcs" && !isGrunt)) await setAutoCounter(c, enabled);
    }
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change auto-counter." });
  }
});

router.delete("/encounters/:id/combatants/:cid", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.cid);
  try {
    await pool.query("DELETE FROM combatants WHERE id = $1", [cid]);
    const { rows } = await pool.query("SELECT turn_order, active_turn_index, active_group FROM encounters WHERE id = $1", [id]);
    if (rows[0]) {
      const turnOrder = rows[0].turn_order.filter((tid) => tid !== cid);
      const activeGroup = (rows[0].active_group || []).filter((tid) => tid !== cid);
      // The phase's last slot is where the next search starts from; if the
      // removed combatant held it, fall back to the last teammate still up.
      const lastActive = Math.max(-1, ...activeGroup.map((tid) => turnOrder.indexOf(tid)));
      const activeTurnIndex = lastActive >= 0 ? lastActive : Math.min(rows[0].active_turn_index, Math.max(0, turnOrder.length - 1));
      await pool.query("UPDATE encounters SET turn_order = $1, active_turn_index = $2, active_group = $3 WHERE id = $4", [
        JSON.stringify(turnOrder),
        activeTurnIndex,
        JSON.stringify(activeGroup),
        id,
      ]);
    }
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove combatant." });
  }
});

// Kits out an already-inserted NPC/grunt combatant row: spawns independent
// blaster copies (first two equipped), then independent slug copies loaded
// into whatever magazine slot is free, then an optional auto-mounted mecha.
// Shared by the important-character pull (/npc-combatants) and the grunt pull
// (/grunt-combatants) -- the differences are which id arrays get passed in and
// `slugLoyaltyTier`: an important character shows up with slugs they've already
// bonded with (Loyal), a grunt with Indifferent ones (GRUNT_SLUG_LOYALTY_TIER).
// `slugTemplateIds` may contain repeats (a grunt rolling the same slug twice).
// Loyalty tier 1 = "Indifferent" (see LOYALTY_TIER_LABELS in client/src/slugData.js).
const GRUNT_SLUG_LOYALTY_TIER = 1;

async function equipNpcCombatant(
  combatant,
  encounterId,
  { slugTemplateIds, blasterTemplateIds, mechaTemplateId, slugLoyaltyTier = LOYALTY_TIER_MAX - 1 }
) {
  // Spawn independent blaster copies for this instance, equipped in order
  // (only the first two get a slot -- same Primary/Secondary limit players have).
  const spawnedBlasters = [];
  for (let i = 0; i < blasterTemplateIds.length; i++) {
    const btResult = await pool.query("SELECT * FROM blaster_templates WHERE id = $1", [blasterTemplateIds[i]]);
    const bt = btResult.rows[0];
    if (!bt) continue;
    const equipSlot = i < 2 ? i : null;
    const { rows } = await pool.query(
      `INSERT INTO blasters
        (template_id, owner_combatant_id, name, base_type, image, accuracy, reload_ap_cost, range, speed, mod_slots, magazine_size, quality, equip_slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [bt.id, combatant.id, bt.name, bt.base_type, bt.image, bt.accuracy, bt.reload_ap_cost, bt.range, bt.speed, bt.mod_slots, bt.magazine_size, bt.quality, equipSlot]
    );
    spawnedBlasters.push(rows[0]);
    // The DM's already-fetched slug/blaster lists have no way to learn
    // about gear that gets created after that fetch -- without this, a
    // pulled NPC's weapons exist in the DB but never show up in the
    // DM's slug panel to actually fire.
    broadcastAll({ type: "blaster-updated", userId: null, blaster: toClientBlaster(rows[0]) });
  }

  // Spawn independent slug copies, auto-loaded into whichever spawned
  // blaster still has a free magazine slot -- an NPC joins the fight with
  // its slugs already loaded, exactly like a player joins on a ready
  // primary weapon.
  const slotCursor = spawnedBlasters.map(() => 0);

  // Next free (equipped-blaster, magazine-slot) pair, or null if every
  // equipped weapon is full.
  function nextFreeMagazineSlot() {
    for (let i = 0; i < spawnedBlasters.length; i++) {
      if (spawnedBlasters[i].equip_slot === null) continue;
      if (slotCursor[i] < spawnedBlasters[i].magazine_size) {
        const slot = { equippedBlasterId: spawnedBlasters[i].id, magazineSlot: slotCursor[i] };
        slotCursor[i] += 1;
        return slot;
      }
    }
    return null;
  }

  // The DM gave this NPC slugs but not enough weapon to hold them (no
  // blaster at all, or one whose magazine is already full). Give it a
  // plain Standard Blaster in the next open equip slot so nothing joins
  // combat stranded and unfirable. Returns false once both slots are used.
  async function spawnFallbackBlaster() {
    const equippedCount = spawnedBlasters.filter((b) => b.equip_slot !== null).length;
    if (equippedCount >= 2) return false;
    const base = BASE_TYPES.Pistol;
    const { rows } = await pool.query(
      `INSERT INTO blasters
        (template_id, owner_combatant_id, name, base_type, image, accuracy, reload_ap_cost, range, speed, mod_slots, magazine_size, quality, equip_slot)
       VALUES (NULL,$1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [combatant.id, "Standard Blaster", "Pistol", base.accuracy, base.reloadApCost, base.range, base.speed, base.modSlots, base.magazineSize, 1, equippedCount]
    );
    spawnedBlasters.push(rows[0]);
    slotCursor.push(0);
    broadcastAll({ type: "blaster-updated", userId: null, blaster: toClientBlaster(rows[0]) });
    return true;
  }

  // The caller decides the tier (see the doc comment) rather than trusting
  // whatever the template happens to store: an important character's slugs
  // spawn Loyal, a grunt's spawn Wild.
  const NPC_SLUG_LOYALTY_TIER = Math.max(LOYALTY_TIER_MIN, Math.min(LOYALTY_TIER_MAX, slugLoyaltyTier));

  for (const slugTemplateId of slugTemplateIds) {
    const stResult = await pool.query("SELECT * FROM slug_templates WHERE id = $1", [slugTemplateId]);
    const st = stResult.rows[0];
    if (!st) continue;
    let slot = nextFreeMagazineSlot();
    if (!slot && (await spawnFallbackBlaster())) slot = nextFreeMagazineSlot();
    const equippedBlasterId = slot ? slot.equippedBlasterId : null;
    const magazineSlot = slot ? slot.magazineSlot : null;
    const { rows: slugRows } = await pool.query(
      `INSERT INTO slugs
        (template_id, owner_combatant_id, name, type, protoform_image, velocity_image, clash_power, clash_defense,
         ap_cost, max_energy_pips, energy_pips, loyalty_tier, velocity_ability, protoform_utility,
         breaks_walls, causes_knockback, wall_maker, bridge_maker, aoe_blast, hazard_maker,
         causes_blind, causes_snare, causes_shock, causes_jam,
         pierces_walls, causes_chain, ricochets, ultra_fast, causes_invisible, causes_fear, causes_confusion,
         trail_wall, clash_tripled, cone_blast, spawns_pods, mirage_decoy, star_wall, anchor_zone,
         voids_fire_clash, clears_fire_terrain, causes_disarm, disarm_zone, mind_scramble, swaps_position,
         friction_shift, crosswind_zone, skips_reload,
         emotion_surge, uncounterable, damage_tripled, static_mark,
         equipped_blaster_id, magazine_slot, tempo_aura, power_surge, heal_over_time, grapple, causes_stun, stalls_slugs, amplifies_partner, pulls_metal, phases_walls, mirrors_clash, surrounds_target, ambush_tripled, summons_plant, causes_burn, massive_aoe, random_statuses, summons_ghost, potent_poison, causes_bleed, life_drain)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,$67,$68,$69,$70,$71,$72,$73)
       RETURNING *`,
      [
        st.id,
        combatant.id,
        st.name,
        st.type,
        st.protoform_image,
        st.velocity_image,
        st.clash_power,
        st.clash_defense,
        st.ap_cost,
        st.max_energy_pips,
        JSON.stringify(Array(st.max_energy_pips).fill(true)),
        NPC_SLUG_LOYALTY_TIER,
        st.velocity_ability,
        st.protoform_utility,
        st.breaks_walls,
        st.causes_knockback,
        st.wall_maker,
        st.bridge_maker,
        st.aoe_blast,
        st.hazard_maker,
        st.causes_blind,
        st.causes_snare,
        st.causes_shock,
        st.causes_jam,
        st.pierces_walls,
        st.causes_chain,
        st.ricochets,
        st.ultra_fast,
        st.causes_invisible,
        st.causes_fear,
        st.causes_confusion,
        st.trail_wall,
        st.clash_tripled,
        st.cone_blast,
        st.spawns_pods,
        st.mirage_decoy,
        st.star_wall,
        st.anchor_zone,
        st.voids_fire_clash,
        st.clears_fire_terrain,
        st.causes_disarm,
        st.disarm_zone,
        st.mind_scramble,
        st.swaps_position,
        st.friction_shift,
        st.crosswind_zone,
        st.skips_reload,
        st.emotion_surge,
        st.uncounterable,
        st.damage_tripled,
        st.static_mark,
        equippedBlasterId,
        magazineSlot,
        st.tempo_aura,
        st.power_surge,
        st.heal_over_time,
        st.grapple,
        st.causes_stun,
        st.stalls_slugs,
        st.amplifies_partner,
        st.pulls_metal,
        st.phases_walls,
        st.mirrors_clash,
        st.surrounds_target,
        st.ambush_tripled,
        st.summons_plant,
        st.causes_burn,
        st.massive_aoe,
        st.random_statuses,
        st.summons_ghost,
        st.potent_poison,
        st.causes_bleed,
        st.life_drain,
      ]
    );
    broadcastAll({ type: "slug-updated", userId: null, slug: toClientSlug(slugRows[0]) });
    // This NPC/grunt joined the fight carrying it -- the party now knows the
    // slug exists and what it looks like, but not its stats or abilities. Those
    // stay redacted in the slugpedia until a player catches one themselves
    // (see slugpediaStore.js).
    recordSlugpediaEntry(slugRows[0], { discovered: false });
  }
  // If one of the slugs it just spawned with carries a Tempo Aura, the whole
  // set joins the fight at the boosted stamina (see slugAura.js).
  await syncTempoAura({ ownerCombatantId: combatant.id }, { fill: true });

  // Optionally spawn a mecha companion, auto-mounted by this NPC.
  if (mechaTemplateId) {
    const mtResult = await pool.query("SELECT * FROM mecha_templates WHERE id = $1", [mechaTemplateId]);
    const mt = mtResult.rows[0];
    if (mt) {
      const mtStats = effectiveMechaStats(mt);
      const maxStructure = computeMaxStructure({ armor: mtStats.structureArmor, tier: mt.tier });
      const mechaResult = await pool.query(
        `INSERT INTO combatants
          (encounter_id, kind, name, portrait, x, y, max_ap, current_ap, max_structure, current_structure, data)
         VALUES ($1, 'mecha', $2, $3, $4, $5, 2, 0, $6, $6, $7)
         RETURNING *`,
        [
          encounterId,
          `${combatant.name}'s ${mt.name}`,
          mt.image,
          combatant.x,
          combatant.y,
          maxStructure,
          JSON.stringify({ dexMod: 0, speed: mtStats.speed, handling: mtStats.handling, armor: mtStats.armor, rammingPower: mtStats.rammingPower, tier: mt.tier, ownerUserId: null }),
        ]
      );
      await pool.query("UPDATE combatants SET mounted_on = $1 WHERE id = $2", [mechaResult.rows[0].id, combatant.id]);
    }
  }

  // The per-row blaster-updated/slug-updated broadcasts above arrive at the
  // client as a rapid burst, and its single-slot live state only keeps the
  // last of each -- so an NPC with several slugs/blasters would show up in the
  // DM's slug panel with most of its gear missing. One authoritative "it
  // happened" signal, sent once everything has committed, lets the client
  // refetch the lot instead of trusting the burst.
  broadcastAll({ type: "combat-gear-changed", at: Date.now() });
}

// Weighted random pick of one item; `weightFn` returns a non-negative number.
function weightedPick(items, weightFn) {
  const weights = items.map((it) => Math.max(0, weightFn(it)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

// `n` weighted picks with replacement.
function weightedSample(items, n, weightFn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(weightedPick(items, weightFn));
  return out;
}

// Pulls an important-character Chronicle card into the encounter as a fresh,
// independently-geared instance. One copy only -- the card names a single
// named character, so a second pull is rejected and the name carries no
// number. (Disposable minions that DO stack live at /grunt-combatants.)
router.post("/encounters/:id/npc-combatants", requireDungeonMaster, async (req, res) => {
  const encounterId = Number(req.params.id);
  const { npcTemplateId, x, y, team } = req.body || {};
  if (team != null && !COMBAT_TEAM_IDS.includes(team)) return res.status(400).json({ error: "Unknown team." });
  if (!Number.isInteger(npcTemplateId)) {
    return res.status(400).json({ error: "An NPC is required." });
  }

  try {
    const templateResult = await pool.query("SELECT * FROM npc_templates WHERE id = $1", [npcTemplateId]);
    const template = templateResult.rows[0];
    if (!template) return res.status(404).json({ error: "NPC not found." });

    const dupe = await pool.query(
      "SELECT 1 FROM combatants WHERE encounter_id = $1 AND ref_npc_template_id = $2 LIMIT 1",
      [encounterId, npcTemplateId]
    );
    if (dupe.rows[0]) {
      return res.status(409).json({ error: `${template.name} is already in this encounter.` });
    }
    const name = template.name;
    const relationship = template.profile?.fields?.relationship?.value || null;

    const combatantResult = await pool.query(
      `INSERT INTO combatants
        (encounter_id, kind, ref_npc_template_id, name, portrait, x, y, max_ap, current_ap, max_grit, current_grit, knockout_pips, data, team)
       VALUES ($1, 'npc', $2, $3, $4, $5, $6, $7, 0, $8, $8, $9, $10, $11)
       RETURNING *`,
      [
        encounterId,
        npcTemplateId,
        name,
        template.image,
        Number.isFinite(x) ? x : 100,
        Number.isFinite(y) ? y : 100,
        npcActionPoints(template.dex_modifier),
        npcMaxGrit(template.con_modifier, template.dex_modifier),
        JSON.stringify([false, false, false]),
        JSON.stringify({ dexMod: template.dex_modifier, conMod: template.con_modifier, relationship }),
        team ?? null,
      ]
    );
    const combatant = combatantResult.rows[0];

    await equipNpcCombatant(combatant, encounterId, {
      slugTemplateIds: template.slug_template_ids,
      blasterTemplateIds: template.blaster_template_ids,
      mechaTemplateId: template.mecha_template_id,
    });

    const encounter = await broadcastEncounter(encounterId);
    res.status(201).json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not pull NPC into the encounter." });
  }
});

// Pulls a grunt/minion into the encounter. Unlike an important character, a
// grunt stacks (auto-numbered "Blakk Goon 1", "2", ...) and rolls its own
// loadout from the template's pools: one blaster, biased toward the
// lower-quality options, then a magazine's worth of slugs, biased toward the
// lower-rarity options. Every grunt of the same type comes out a little
// different and a little weaker than a hand-built NPC.
router.post("/encounters/:id/grunt-combatants", requireDungeonMaster, async (req, res) => {
  const encounterId = Number(req.params.id);
  const { gruntTemplateId, x, y, team } = req.body || {};
  if (team != null && !COMBAT_TEAM_IDS.includes(team)) return res.status(400).json({ error: "Unknown team." });
  if (!Number.isInteger(gruntTemplateId)) {
    return res.status(400).json({ error: "A grunt is required." });
  }

  try {
    const templateResult = await pool.query("SELECT * FROM grunt_templates WHERE id = $1", [gruntTemplateId]);
    const template = templateResult.rows[0];
    if (!template) return res.status(404).json({ error: "Grunt not found." });

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM combatants WHERE encounter_id = $1 AND ref_grunt_template_id = $2",
      [encounterId, gruntTemplateId]
    );
    const name = `${template.name} ${countResult.rows[0].count + 1}`;

    const combatantResult = await pool.query(
      `INSERT INTO combatants
        (encounter_id, kind, ref_grunt_template_id, name, portrait, x, y, max_ap, current_ap, max_grit, current_grit, knockout_pips, data, team)
       VALUES ($1, 'npc', $2, $3, $4, $5, $6, $7, 0, $8, $8, $9, $10, $11)
       RETURNING *`,
      [
        encounterId,
        gruntTemplateId,
        name,
        template.image,
        Number.isFinite(x) ? x : 100,
        Number.isFinite(y) ? y : 100,
        npcActionPoints(template.dex_modifier),
        npcMaxGrit(template.con_modifier, template.dex_modifier),
        JSON.stringify([false, false, false]),
        JSON.stringify({
          dexMod: template.dex_modifier,
          conMod: template.con_modifier,
          relationship: template.relationship || "Enemy",
        }),
        team ?? null,
      ]
    );
    const combatant = combatantResult.rows[0];

    // Roll one blaster from the pool, leaning toward lower quality.
    let chosenBlasterIds = [];
    let magSize = BASE_TYPES.Pistol.magazineSize;
    if (Array.isArray(template.blaster_template_ids) && template.blaster_template_ids.length) {
      const { rows: pool_ } = await pool.query(
        "SELECT * FROM blaster_templates WHERE id = ANY($1::int[])",
        [template.blaster_template_ids]
      );
      if (pool_.length) {
        const maxQ = Math.max(...pool_.map((b) => b.quality));
        const chosen = weightedPick(pool_, (b) => (maxQ - b.quality + 1) ** 2);
        chosenBlasterIds = [chosen.id];
        magSize = chosen.magazine_size;
      }
    }

    // Roll a magazine's worth of slugs from the pool, leaning toward lower
    // rarity (a NULL rarity counts as mid). Picks are with replacement -- a
    // grunt can turn up carrying two of the same common slug.
    let chosenSlugIds = [];
    if (Array.isArray(template.slug_template_ids) && template.slug_template_ids.length && magSize > 0) {
      const { rows: pool_ } = await pool.query(
        "SELECT id, rarity FROM slug_templates WHERE id = ANY($1::int[])",
        [template.slug_template_ids]
      );
      if (pool_.length) {
        chosenSlugIds = weightedSample(pool_, magSize, (s) => (RARITY_MAX - (s.rarity ?? 5) + 1) ** 2).map((s) => s.id);
      }
    }

    await equipNpcCombatant(combatant, encounterId, {
      slugTemplateIds: chosenSlugIds,
      blasterTemplateIds: chosenBlasterIds,
      mechaTemplateId: null,
      // A goon's slugs are Indifferent: neutral clash/accuracy (tier 1).
      slugLoyaltyTier: GRUNT_SLUG_LOYALTY_TIER,
    });

    const encounter = await broadcastEncounter(encounterId);
    res.status(201).json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not pull the grunt into the encounter." });
  }
});

// ---------------------------------------------------------------------------
// Start encounter / turn advancement
// ---------------------------------------------------------------------------

router.post("/encounters/:id/start", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows: combatantRows } = await pool.query("SELECT * FROM combatants WHERE encounter_id = $1", [id]);
    if (combatantRows.length === 0) {
      return res.status(400).json({ error: "Add at least one combatant first." });
    }

    // Everyone enters the fight with every slug ready: no stale return-to-hand
    // cooldown and nothing left un-chambered from a previous encounter, a
    // Reload, or swapping gear in the lobby. Slugs in a destroyed pod
    // (pod_broken) stay out until their owner replaces the pod.
    const { rows: readiedSlugs } = await pool.query(
      `UPDATE slugs s SET cooldown_turns_left = 0, loaded = true
       FROM combatants c
       WHERE c.encounter_id = $1
         AND (s.user_id = c.ref_user_id OR s.owner_combatant_id = c.id)
         AND NOT s.pod_broken
         AND (s.cooldown_turns_left > 0 OR s.loaded = false)
       RETURNING s.*`,
      [id]
    );
    for (const slugRow of readiedSlugs) {
      broadcastAll({ type: "slug-updated", userId: slugRow.user_id, slug: toClientSlug(slugRow) });
    }

    // Characters enter on whatever armor and shield they're wearing NOW (not when
    // they were added to the lobby): armor's Grit bonus, and a shield that hasn't
    // soaked anything yet.
    for (const c of combatantRows) {
      if (c.kind !== "character" || !c.ref_user_id) continue;
      const { rows: chars } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [c.ref_user_id]);
      if (!chars[0]) continue;
      // Armor, outfit, the weather and illness are all read again here, so what
      // they were wearing when the fight began is what counts.
      const gearSnap = await characterGearSnapshot(chars[0]);
      await pool.query("UPDATE combatants SET max_grit = $1, max_ap = $5, current_grit = LEAST($2::int, $1::int), data = $3 WHERE id = $4", [
        gearSnap.maxGrit,
        chars[0].current_grit,
        JSON.stringify({ ...(c.data || {}), shieldUsed: {}, shield: await shieldSnapshot(c.ref_user_id, {}), gear: gearSnap.gear }),
        c.id,
        gearSnap.maxAp,
      ]);
    }

    const rolled = [];
    for (const c of combatantRows) {
      const dexMod = c.data?.dexMod ?? 0;
      const initiative = rollD20() + dexMod;
      // Everyone starts the encounter at full AP, not just whoever goes
      // first -- a counter-clash now spends leftover AP (see
      // resolveCounterOffer), so a player shouldn't be unable to react in
      // round 1 purely because their initiative slot is late.
      await pool.query(
        "UPDATE combatants SET initiative = $1, current_ap = max_ap, damaged_this_turn = false, rammed_this_round = false WHERE id = $2",
        [initiative, c.id]
      );
      rolled.push({ id: c.id, name: c.name, initiative, dexMod });
    }
    rolled.sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod || Math.random() - 0.5);
    const turnOrder = rolled.map((c) => c.id);
    // Teammates at the head of the order open the fight together.
    const opening = await findNextTurnGroup(turnOrder, -1);
    await pool.query(
      "UPDATE encounters SET status = 'active', turn_order = $1, active_turn_index = $2, active_group = $3, round = 1 WHERE id = $4",
      [JSON.stringify(turnOrder), opening.members.length ? opening.endIndex : 0, JSON.stringify(opening.members.map((m) => m.id)), id]
    );

    // Fame snapshot so the Battle Report can show what each player earned.
    const fameStart = {};
    for (const c of combatantRows) {
      if (c.kind !== "character" || !c.ref_user_id) continue;
      const { rows: fr } = await pool.query("SELECT fame FROM characters WHERE user_id = $1", [c.ref_user_id]);
      if (fr[0]) fameStart[c.ref_user_id] = fr[0].fame;
    }
    await recordCombatEvent(id, "start", { fame: fameStart });

    const encounter = await broadcastEncounter(id);
    await pushCombatLog(
      id,
      `Initiative rolled: ${rolled.map((c) => `${c.name} (${c.initiative})`).join(", ")}. ${
        opening.members.length > 1 ? `${opening.members.map((m) => m.name).join(", ")} go first, together.` : `${rolled[0].name} goes first.`
      }`
    );
    await insightOpeningRead(id, combatantRows);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start encounter." });
  }
});

// Perception: at the start of a character's turn they roll d20 + Perception
// automatically; meeting PERCEPTION_DC they see through any hostile within
// PERCEPTION_RANGE who is hiding -- invisible, or behind a Mirage Coil's
// decoys (the mirage collapses). Only rolled -- and logged, hit or miss -- when
// there is someone hiding within range; a miss never names them.
async function perceptionSweep(encounterId, observer) {
  const { rows } = await pool.query(
    "SELECT * FROM combatants WHERE encounter_id = $1 AND kind <> 'decoy' AND NOT unconscious AND NOT disabled",
    [encounterId]
  );
  const hidden = rows.filter(
    (c) =>
      c.id !== observer.id &&
      !areAllies(observer, c) &&
      (c.status_effects?.invisible || c.status_effects?.mirage) &&
      distance({ x: observer.x, y: observer.y }, { x: c.x, y: c.y }) <= PERCEPTION_RANGE
  );
  if (hidden.length === 0) return;
  const die = rollD20();
  const mod = combatantSkillMod(observer, "perception");
  const total = die + mod;
  const rollText = `d20 ${die} ${mod < 0 ? "-" : "+"} ${Math.abs(mod)} = ${total} vs DC ${PERCEPTION_DC}`;
  if (total < PERCEPTION_DC) {
    // A miss is logged too, but never names who was hiding -- the log is public.
    await pushCombatLog(encounterId, `${observer.name} scans for hidden foes (${rollText}) -- sees nothing.`);
    return;
  }
  for (const c of hidden) {
    const next = { ...(c.status_effects || {}) };
    const notes = [];
    if (next.invisible) {
      delete next.invisible;
      notes.push("out of hiding");
    }
    if (next.mirage) {
      await removeDecoys(encounterId, next.mirage.decoyIds);
      delete next.mirage;
      notes.push("through the mirage");
    }
    await updateCombatant(c.id, { status_effects: JSON.stringify(next) });
    await pushCombatLog(encounterId, `${observer.name} spots ${c.name} ${notes.join(" and ")} (${rollText})!`);
  }
}

// Per-combatant start-of-turn bookkeeping: AP refill, status ticks, DoT, regen,
// fear flight, perception. Returns { skip, fledLog } -- skip is true when a
// shock or fear means the combatant never actually gets to act this turn.
async function beginCombatantTurn(encounter, nextCombatant, wrapped) {
  const encounterId = encounter.id;
  let shocked = false;
  let fledLog = null;
  // Stun docks AP equal to half the damage of the hit that stunned them (see computeStunAp).
  const stunAp = stunApOf(nextCombatant.status_effects?.stunned);
  const stunned = stunAp > 0;
  // Shocked (see causes_shock in dealHit) skips the whole turn -- 0 AP,
  // full stop -- overriding stun's ordinary -1 AP if somehow both are up.
  shocked = Boolean(nextCombatant.status_effects?.shocked);
  // Frightgeist's fear -- also a full skip, but instead of just doing
  // nothing, the target's AP is spent fleeing FEAR_FLEE_AP_EQUIVALENT
  // worth of Move directly away from wherever the shot that feared them
  // came from (see causes_fear in dealHit, which records that point).
  const feared = nextCombatant.status_effects?.feared;
  // Intimidate (see /actions/intimidate) docks AP from this one turn only.
  const intimidatePenalty = nextCombatant.status_effects?.intimidated?.apPenalty ?? 0;
  const baseRefillAp = shocked || feared ? 0 : stunned ? Math.max(0, nextCombatant.max_ap - stunAp) : nextCombatant.max_ap;
  const refillAp = Math.max(0, baseRefillAp - intimidatePenalty);
  const statusAfterStun = { ...(nextCombatant.status_effects || {}) };
  if (stunned) delete statusAfterStun.stunned;
  if (shocked) delete statusAfterStun.shocked;
  if (feared) delete statusAfterStun.feared;
  delete statusAfterStun.intimidated;

  // Burn/poison/snare/confusion/invisibility all tick down at the start of
  // the combatant's own turn -- see tickStatusEffects. Snare is a pure
  // duration countdown (the actual movement block lives in /actions/move);
  // burn/poison also deal their damage here, before this turn's AP is even
  // usable. A shocked or feared combatant still takes their DoT/cooldown
  // tick -- neither skips anything except their own actions.
  // Cynosure's disarm field is checked here too, against wherever this
  // combatant is actually standing right now -- see insideDisarmZone's
  // doc on tickStatusEffects.
  const insideDisarmZone = isInsideAnyZone(encounter.zones, { x: nextCombatant.x, y: nextCombatant.y }, "disarm");
  const { damage: dotDamage, heal: regenHeal, healSources: regenSources, statusEffects: nextStatus, notes: dotNotes, sources: dotSources } = tickStatusEffects(statusAfterStun, insideDisarmZone, nextCombatant.max_grit);

  await tickSlugCooldowns(nextCombatant);
  // A fresh turn, a fresh Hide attempt (see /actions/hide).
  delete nextStatus.hideTried;

  const fields = {
    current_ap: refillAp,
    damaged_this_turn: false,
    status_effects: JSON.stringify(nextStatus),
    ...(wrapped ? { rammed_this_round: false } : {}),
  };

  if (feared) {
    const fleeDistance = FEAR_FLEE_AP_EQUIVALENT * MOVE_SPEED_PER_AP;
    const kb = knockbackTarget(feared, { x: nextCombatant.x, y: nextCombatant.y }, withMapEdges(encounter.walls, encounter.map_width, encounter.map_height), fleeDistance);
    const dest = clampToMapBounds(kb.point, encounter.map_width, encounter.map_height);
    fields.x = dest.x;
    fields.y = dest.y;
    fledLog = `${nextCombatant.name}, terrified, bolts ${Math.round(fleeDistance)} units away and can't act this turn!`;
  }

  const hasGrit = nextCombatant.current_grit !== null;
  let gritAfterTick = nextCombatant.current_grit;
  if (dotDamage > 0 && hasGrit) {
    gritAfterTick = Math.max(0, gritAfterTick - dotDamage);
    fields.current_grit = gritAfterTick;
  }
  // Regen (a heal_over_time hit) tops up whatever the DoT left -- it never
  // drags someone back from 0 Grit, that's still a knockout roll's job.
  let regenHealed = 0;
  if (regenHeal > 0 && hasGrit && gritAfterTick > 0) {
    const healedGrit = Math.min(nextCombatant.max_grit ?? gritAfterTick, gritAfterTick + regenHeal);
    regenHealed = healedGrit - gritAfterTick;
    if (regenHealed > 0) fields.current_grit = healedGrit;
  }

  const updatedCombatant = await updateCombatant(nextCombatant.id, fields);

  // A ridden mecha is skipped in the turn loop above, so its AP would never
  // refill on its own. Top it up here, on its rider's turn -- the two share
  // this one slot, and the mecha's pool is what Move/Ram spend while mounted.
  if (nextCombatant.mounted_on != null) {
    const riddenMecha = await getCombatant(nextCombatant.mounted_on);
    if (riddenMecha && !riddenMecha.disabled) {
      await updateCombatant(riddenMecha.id, { current_ap: riddenMecha.max_ap });
    }
  }

  if (intimidatePenalty > 0) {
    await pushCombatLog(encounterId, `${nextCombatant.name} is still rattled -- starts the turn ${intimidatePenalty} AP short.`);
  }
  if (nextCombatant.kind === "character") await perceptionSweep(encounterId, updatedCombatant);

  if (dotDamage > 0 && hasGrit) {
    await syncCharacterFromCombatant(updatedCombatant);
    let gritLeft = nextCombatant.current_grit;
    for (const src of dotSources) {
      const applied = Math.min(src.amount, gritLeft);
      gritLeft -= applied;
      const by = src.by ? await getCombatant(src.by) : null;
      await recordCombatEvent(encounterId, "damage", {
        actor: by,
        target: nextCombatant,
        amount: applied,
        via: "dot",
        kill: applied > 0 && gritLeft === 0 && !nextCombatant.unconscious,
      });
    }
    await pushCombatLog(encounterId, `${nextCombatant.name} takes ${dotDamage} damage from ${dotNotes.join(" + ")}.`);
    if (updatedCombatant.current_grit === 0 && !updatedCombatant.unconscious) {
      await triggerKnockoutRoll(updatedCombatant.id, "grit");
    }
  }

  if (regenHealed > 0) {
    if (!(dotDamage > 0 && hasGrit)) await syncCharacterFromCombatant(updatedCombatant);
    for (const src of regenSources) {
      const by = src.by ? await getCombatant(src.by) : null;
      await recordCombatEvent(encounterId, "heal", {
        actor: by,
        target: nextCombatant,
        amount: regenHealed,
        overheal: Math.max(0, regenHeal - regenHealed),
        source: "regen",
      });
    }
    await pushCombatLog(encounterId, `${nextCombatant.name} recovers ${regenHealed} Grit from their regeneration.`);
  }

  // A terrified slinger's flight is movement like any other: running out of (or through) the
  // reach of a bloom or ghost gets them bitten as they go.
  if (feared && nextCombatant.kind !== "mecha") {
    // ...and so is any damaging terrain they bolt through on the way.
    await applyPathHazards(nextCombatant.id, { x: nextCombatant.x, y: nextCombatant.y }, { x: fields.x, y: fields.y }, { hazards: encounter.hazards, verb: "bolts through" });
    await plantBites(await getCombatant(nextCombatant.id), { fromPos: { x: nextCombatant.x, y: nextCombatant.y }, fleeing: true });
  }
  return { skip: shocked || Boolean(fledLog), fledLog };
}

// The close of one combatant's turn (a power surge only lasts through the turn
// it was set up on, and the Battle Report wants to know how much AP went unused).
async function finishCombatantTurn(encounterId, combatant, skipped) {
  if (!combatant) return;
  if (combatant.kind !== "mecha" && combatant.kind !== "decoy") {
    await recordCombatEvent(encounterId, "turn_end", {
      actor: combatant,
      apLeft: skipped ? 0 : combatant.current_ap || 0,
      apMax: combatant.max_ap || 0,
      skipped,
    });
  }
  if (combatant.status_effects?.powerSurge) {
    const { powerSurge, ...rest } = combatant.status_effects;
    await updateCombatant(combatant.id, { status_effects: JSON.stringify(rest) });
  }
}

// Combatants that can take a turn right now: standing, and not a mecha with a
// rider (a ridden mecha acts on its rider's turn, sharing that one slot -- see
// /actions/move and /actions/ram).
async function canTakeTurn(combatant) {
  if (!combatant || combatant.unconscious || combatant.disabled) return false;
  if (combatant.kind === "mecha" && (await mechaRiders(combatant.id)).length > 0) return false;
  return true;
}

// Consecutive combatants of the same team act at the same time: the turn
// order is still sorted by initiative, but a run of teammates forms one phase
// and they all act together -- so a team's shooters can all open fire before
// the other side gets any say, and a defender can't counter them one by one.
// Walks the order from `fromIndex` (exclusive) for the next phase. Fallen
// combatants are skipped over without breaking a run. `wrapped` says the walk
// passed the end of the order (a new round); a phase never straddles the wrap.
async function findNextTurnGroup(turnOrder, fromIndex) {
  const members = [];
  let team = null;
  let endIndex = fromIndex;
  let cursor = fromIndex;
  let wrapped = false;
  for (let scanned = 0; scanned < turnOrder.length; scanned++) {
    cursor += 1;
    if (cursor >= turnOrder.length) {
      if (members.length > 0) break;
      cursor = 0;
      wrapped = true;
    }
    const combatant = await getCombatant(turnOrder[cursor]);
    if (!(await canTakeTurn(combatant))) continue;
    const side = combatSide(combatant);
    if (members.length === 0) team = side;
    else if (side !== team) break;
    members.push(combatant);
    endIndex = cursor;
  }
  return { members, endIndex, wrapped };
}

// Who is acting right now: the encounter's stored active group, or -- for an
// encounter that predates simultaneous turns -- whoever the index points at.
function activeGroupIds(encounter) {
  const order = encounter.turn_order || [];
  const stored = (encounter.active_group || []).filter((id) => order.includes(id));
  if (stored.length > 0) return stored;
  const single = order[encounter.active_turn_index];
  return single != null ? [single] : [];
}

// Ends a turn. `combatantId` is the one finishing: while teammates in the same
// phase still have actions left the phase carries on, and only when the last
// of them is done does play pass to the next team. With no `combatantId` (or
// one who isn't acting -- the DM nudging things along) the whole phase ends.
// `chain` is internal: the phase just started was entirely shocked or
// terrified, so move straight on to the next one.
async function advanceTurn(encounterId, { combatantId = null, chain = false } = {}) {
  const { rows } = await pool.query("SELECT * FROM encounters WHERE id = $1", [encounterId]);
  const encounter = rows[0];
  if (!encounter) return null;
  const turnOrder = encounter.turn_order;
  if (turnOrder.length === 0) return await loadFullEncounter(encounterId);

  if (!chain) {
    const group = activeGroupIds(encounter);
    const enders = combatantId != null && group.includes(combatantId) ? [combatantId] : group;
    for (const id of enders) await finishCombatantTurn(encounterId, await getCombatant(id), false);

    // Teammates still on their feet and still to act keep the phase open.
    const stillActing = [];
    for (const id of group) {
      if (enders.includes(id)) continue;
      if (await canTakeTurn(await getCombatant(id))) stillActing.push(id);
    }
    if (stillActing.length > 0) {
      await pool.query("UPDATE encounters SET active_group = $1 WHERE id = $2", [JSON.stringify(stillActing), encounterId]);
      const updated = await broadcastEncounter(encounterId);
      const finished = (await Promise.all(enders.map((id) => getCombatant(id)))).filter(Boolean).map((c) => c.name);
      if (finished.length > 0) await pushCombatLog(encounterId, `${finished.join(", ")} finished their turn.`);
      return updated;
    }
  }

  const { members, endIndex, wrapped } = await findNextTurnGroup(turnOrder, encounter.active_turn_index);
  if (members.length === 0) {
    // Nobody left who can take a turn; leave the order where it is.
    await pool.query("UPDATE encounters SET active_group = '[]' WHERE id = $1", [encounterId]);
    return await broadcastEncounter(encounterId);
  }
  const round = wrapped ? encounter.round + 1 : encounter.round;

  const acting = [];
  const lostTurns = [];
  for (const member of members) {
    // Pressure Tick's pods tick down once every time *any* combatant's turn
    // starts (not just their owner's) -- see tickPods/POD_MIN_TIMER's comment
    // in combatRules.js.
    await tickPods(encounterId);
    const started = await beginCombatantTurn(encounter, member, wrapped);
    if (started.skip) {
      // Their turn "happens" (DoT ticked, cooldowns ticked, the status
      // consumed) but they never actually get to act on it.
      lostTurns.push({ member, log: started.fledLog || `${member.name} is shocked -- their turn is skipped!` });
    } else {
      acting.push(member);
    }
  }
  if (wrapped) {
    await pool.query("UPDATE combatants SET rammed_this_round = false WHERE encounter_id = $1", [encounterId]);
    // Zones (Anchorage's, Cynosure's) are battlefield fixtures, not a status
    // on a person -- they tick down once per full round, not per combatant
    // turn.
    await tickZones(encounterId);
    await tickHazards(encounterId);
  }

  await pool.query("UPDATE encounters SET active_turn_index = $1, active_group = $2, round = $3 WHERE id = $4", [
    endIndex,
    JSON.stringify(acting.map((m) => m.id)),
    round,
    encounterId,
  ]);

  for (const lost of lostTurns) {
    await finishCombatantTurn(encounterId, await getCombatant(lost.member.id), true);
    await pushCombatLog(encounterId, lost.log);
  }

  if (acting.length === 0) {
    // The whole phase lost its turn -- hand play to whoever's next.
    await broadcastEncounter(encounterId);
    return await advanceTurn(encounterId, { chain: true });
  }

  const updated = await broadcastEncounter(encounterId);
  if (acting.length === 1) {
    await pushCombatLog(encounterId, `${acting[0].name}'s turn (Round ${round}).`);
  } else {
    const names = acting.map((m) => m.name);
    await pushCombatLog(encounterId, `Round ${round}: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} act together.`);
  }
  return updated;
}

router.post("/actions/end-turn", async (req, res) => {
  const { combatantId } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    const ownsCombatant =
      combatant.ref_user_id === req.user.sub ||
      (combatant.kind === "mecha" && combatant.data?.ownerUserId === req.user.sub);
    if (req.user.role !== "Dungeon Master" && !ownsCombatant) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    // A player may only end their own combatant's turn, and only while it's
    // actually that combatant's turn -- otherwise "End Turn" fired off-turn
    // would just skip whoever *is* active. The DM can still advance the turn
    // for anyone (nudging a stuck player, running NPCs).
    if (req.user.role !== "Dungeon Master") {
      const { rows } = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
      if (rows[0] && !requireOwnTurn(rows[0], combatant)) {
        return res.status(400).json({ error: "It isn't your turn." });
      }
    }
    const encounter = await advanceTurn(combatant.encounter_id, { combatantId: combatant.id });
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not end turn." });
  }
});

function isActingCombatantAuthorized(req, combatant, encounter) {
  if (req.user.role === "Dungeon Master") return true;
  if (combatant.kind === "character" && combatant.ref_user_id === req.user.sub) return true;
  // A player may drive their own mecha (moving it on its turn, or riding it).
  // Non-movement actions still reject mechas on their own `kind` checks.
  if (combatant.kind === "mecha" && combatant.data?.ownerUserId === req.user.sub) return true;
  return false;
}

function requireOwnTurn(encounter, combatant) {
  return activeGroupIds(encounter).includes(combatant.id);
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

router.post("/actions/move", async (req, res) => {
  let { combatantId, x, y } = req.body || {};
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ error: "A destination is required." });
  }
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
    const encounter = encounterRow.rows[0];
    if (!encounter) return res.status(404).json({ error: "Encounter not found." });
    if (!isActingCombatantAuthorized(req, combatant, encounter)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, combatant)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (combatant.unconscious || combatant.disabled) {
      return res.status(400).json({ error: "This combatant can't move." });
    }

    // --- Mecha movement (a lone mecha on its own turn, or a mounted rider
    // driving the mecha they're on) -------------------------------------------
    // The mecha is the thing that actually moves: it covers a character's
    // walking distance times its own `speed`, spends the mecha's AP, and drags
    // every rider along to the same spot. A mounted rider's foot speed and
    // personal status effects (snare, reversed, ice) don't apply -- they're
    // along for the ride.
    const vehicle =
      combatant.kind === "mecha"
        ? combatant
        : combatant.mounted_on != null
          ? await getCombatant(combatant.mounted_on)
          : null;
    if (vehicle) {
      if (vehicle.disabled) return res.status(400).json({ error: "That mecha is disabled." });
      const water = makeWaterSet(encounter.water);
      const mode = vehicle.data?.mode ?? null;
      const inWater = isWaterAt(water, { x: vehicle.x, y: vehicle.y });
      const speedPerAp = MECHA_SPEED_PER_AP(vehicle.data?.speed) * modeMechaSpeedFactor(mode, inWater);
      const apNeeded = pathApCost({ x: vehicle.x, y: vehicle.y }, { x, y }, water, speedPerAp, modeIgnoresWater(mode));
      if ((vehicle.current_ap ?? 0) < apNeeded) {
        return res.status(400).json({ error: "Not enough mecha AP to move that far." });
      }
      if (firstWallHit({ x: vehicle.x, y: vehicle.y }, { x, y }, withMapEdges(encounter.walls, encounter.map_width, encounter.map_height))) {
        return res.status(400).json({ error: "A wall blocks that path." });
      }
      await recordCombatEvent(combatant.encounter_id, "move", {
        actor: combatant,
        distance: distance({ x: vehicle.x, y: vehicle.y }, { x, y }),
        ap: apNeeded,
        mounted: true,
      });
      await updateCombatant(vehicle.id, { x, y, current_ap: vehicle.current_ap - apNeeded });
      const riders = await mechaRiders(vehicle.id);
      for (const rider of riders) {
        await updateCombatant(rider.id, { x, y });
      }
      const notes = [];

      // Aquatic mode engages by itself on entering water and drops again once
      // the mecha is back on dry land (it never overrides another mode).
      let nextMode = mode;
      if ((vehicle.data?.modes || []).includes("aquatic")) {
        const landedInWater = isWaterAt(water, { x, y });
        if (landedInWater && mode === null) {
          nextMode = "aquatic";
          notes.push(`${vehicle.name} slips into the water -- Aquatic mode engages.`);
        } else if (!landedInWater && mode === "aquatic") {
          nextMode = null;
          notes.push(`${vehicle.name} climbs out of the water -- Aquatic mode disengages.`);
        }
      }
      if (nextMode !== mode) {
        for (const c of [vehicle, ...riders]) {
          const fresh = await getCombatant(c.id);
          await updateCombatant(c.id, { data: JSON.stringify({ ...(fresh?.data || {}), mode: nextMode }) });
        }
      }

      // Hazards hit mechas too -- except a gliding one, which flies over them.
      let slipped = false;
      if (mode !== "glider") {
        if (findHazardAt({ x, y }, encounter.hazards, "ice") && Math.random() < ICE_SLIP_CHANCE) {
          slipped = true;
          await updateCombatant(vehicle.id, { current_ap: 0 });
          for (const rider of riders) await updateCombatant(rider.id, { current_ap: 0 });
          notes.push(`${vehicle.name} skids on the ice -- the turn ends abruptly!`);
        }
        // Any damaging patch the mecha rolled through, not just the one it
        // stopped on (logs its own lines).
        await applyPathHazards(vehicle.id, { x: vehicle.x, y: vehicle.y }, { x, y }, { hazards: encounter.hazards, verb: "rolls through" });
      }

      const encounterOut = await broadcastEncounter(combatant.encounter_id);
      await pushCombatLog(combatant.encounter_id, `${vehicle.name} repositions.`);
      for (const note of notes) await pushCombatLog(combatant.encounter_id, note);
      return res.json({ encounter: encounterOut, slipped });
    }

    const statusEffects = combatant.status_effects || {};
    if (statusEffects.snared?.turnsLeft > 0) {
      return res.status(400).json({ error: "This combatant is snared and can't move." });
    }
    // Perplexus's reversedDirection: whatever destination was actually
    // requested gets mirrored through the combatant's current position --
    // same distance, exact opposite direction -- before anything else about
    // this Move (AP cost, wall-blocking, hazards) is worked out. Applies to
    // every Move for as long as the status is up, not just a one-shot
    // consumption (same as snared blocking every Move above, not just one).
    if (statusEffects.reversedDirection?.turnsLeft > 0) {
      const reversed = clampToMapBounds(
        reverseMoveDestination({ x: combatant.x, y: combatant.y }, { x, y }),
        encounter.map_width,
        encounter.map_height
      );
      x = reversed.x;
      y = reversed.y;
    }

    // Only characters/NPCs on foot reach here -- a mecha or a mounted rider
    // returned from the vehicle branch above.
    const speedPerAp = moveSpeedPerAp(combatantSkillMod(combatant, "athletics")) * gearMoveMult(combatant);
    const apNeeded = pathApCost(
      { x: combatant.x, y: combatant.y },
      { x, y },
      makeWaterSet(encounter.water),
      speedPerAp,
      false,
      WATER_FOOT_COST_MULT
    );

    if (combatant.current_ap < apNeeded) {
      return res.status(400).json({ error: "Not enough AP to move that far." });
    }

    const blocked = firstWallHit({ x: combatant.x, y: combatant.y }, { x, y }, withMapEdges(encounter.walls, encounter.map_width, encounter.map_height));
    if (blocked) {
      return res.status(400).json({ error: "A wall blocks that path." });
    }

    // Landing inside an ice patch (see Ice's shoot-time hazard, addIceHazard)
    // has a flat ICE_SLIP_CHANCE of ending the turn right there -- a mecha is
    // heavy enough not to care. Landing inside a damaging hazard (Hazard
    // Maker, see addDamageHazard) always hurts, plus that hazard's own
    // type-appropriate DoT if it has one (Fire/Toxic).
    let slipped = false;
    let hazardHit = null;
    if (combatant.kind !== "mecha") {
      const iceHazard = findHazardAt({ x, y }, encounter.hazards, "ice");
      if (iceHazard && Math.random() < ICE_SLIP_CHANCE) slipped = true;

      // Psi's slippery status: a SLIPPERY_SLIP_CHANCE roll, carried on the
      // combatant themselves instead of requiring them to be standing on a
      // specific tile.
      if (statusEffects.slippery?.turnsLeft > 0 && Math.random() < SLIPPERY_SLIP_CHANCE) slipped = true;

    }

    // Wading into water puts out the flames.
    const dousedStatus = { ...(combatant.status_effects || {}) };
    const doused =
      Boolean(dousedStatus.burning) &&
      pathTouchesWater({ x: combatant.x, y: combatant.y }, { x, y }, makeWaterSet(encounter.water));
    if (doused) delete dousedStatus.burning;

    await updateCombatant(combatant.id, {
      x,
      y,
      current_ap: slipped ? 0 : combatant.current_ap - apNeeded,
      ...(doused ? { status_effects: JSON.stringify(dousedStatus) } : {}),
    });
    await recordCombatEvent(combatant.encounter_id, "move", {
      actor: combatant,
      distance: distance({ x: combatant.x, y: combatant.y }, { x, y }),
      ap: slipped ? combatant.current_ap : apNeeded,
    });
    if (doused) await pushCombatLog(combatant.encounter_id, `${combatant.name} splashes into the water and the flames go out.`);

    // Mirage Coil's decoys mimic the owner's position on every Move, each
    // holding the random offset it was spawned with -- see spawnMirageDecoys.
    const decoyIds = combatant.status_effects?.mirage?.decoyIds;
    if (decoyIds && decoyIds.length > 0) {
      for (const decoyId of decoyIds) {
        const decoy = await getCombatant(decoyId);
        const offset = decoy?.data?.offset || { dx: 0, dy: 0 };
        await updateCombatant(decoyId, { x: x + offset.dx, y: y + offset.dy });
      }
    }

    if (slipped) {
      await pushCombatLog(combatant.encounter_id, `${combatant.name} slips on the ice -- their turn ends abruptly!`);
    }
    // Damaging terrain applies to the whole walk, not just where it ends: a
    // patch the path cuts through burns/poisons them even if both the start
    // and the stop are outside it. Logs its own lines and rolls any knockout.
    if (combatant.kind !== "mecha") {
      const crossed = await applyPathHazards(combatant.id, { x: combatant.x, y: combatant.y }, { x, y }, { hazards: encounter.hazards, verb: "moves through" });
      hazardHit = crossed[0]?.hit ?? null;
    }
    // Walking into, out of or through a bloom's or ghost's reach gets you bitten -- see plantBites.
    await plantBites(await getCombatant(combatant.id), { fromPos: { x: combatant.x, y: combatant.y } });
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    res.json({ encounter: encounterOut, slipped, hazardHit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not move." });
  }
});

// ---------------------------------------------------------------------------
// Wall Vault: spring over a nearby wall and land on its far side
// ---------------------------------------------------------------------------

router.post("/actions/wall-vault", async (req, res) => {
  const { combatantId } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
    const encounter = encounterRow.rows[0];
    if (!encounter) return res.status(404).json({ error: "Encounter not found." });
    if (!isActingCombatantAuthorized(req, combatant, encounter)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, combatant)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (combatant.unconscious || combatant.disabled) {
      return res.status(400).json({ error: "This combatant can't act." });
    }
    if (combatant.kind === "mecha" || combatant.mounted_on != null) {
      return res.status(400).json({ error: "Only a combatant on foot can vault a wall." });
    }
    if (combatant.status_effects?.snared?.turnsLeft > 0) {
      return res.status(400).json({ error: "This combatant is snared and can't move." });
    }

    // Characters carry their Acrobatics modifier from when they joined; NPCs
    // (and grunts) have no skills, so their DEX modifier stands in.
    const acrobaticsMod = combatantSkillMod(combatant, "acrobatics");
    if (acrobaticsMod <= 0) {
      return res.status(400).json({ error: "You need a positive Acrobatics modifier to Wall Vault." });
    }
    const apCost = wallVaultApCost(acrobaticsMod);
    if (combatant.current_ap < apCost) {
      return res.status(400).json({ error: `Not enough AP -- Wall Vault costs ${apCost}.` });
    }

    const plan = planWallVault({ x: combatant.x, y: combatant.y }, encounter.walls, encounter.map_width, encounter.map_height);
    if (!plan) return res.status(400).json({ error: "You need to be close to a wall to Wall Vault." });
    // Whatever else is in the way (other than the wall being vaulted) still blocks.
    if (firstWallHit({ x: combatant.x, y: combatant.y }, plan.landing, withMapEdges(encounter.walls, encounter.map_width, encounter.map_height), [plan.wall.id])) {
      return res.status(400).json({ error: "Another wall blocks the landing." });
    }

    const { x, y } = plan.landing;
    await updateCombatant(combatant.id, { x, y, current_ap: combatant.current_ap - apCost });
    for (const decoyId of combatant.status_effects?.mirage?.decoyIds || []) {
      const decoy = await getCombatant(decoyId);
      const offset = decoy?.data?.offset || { dx: 0, dy: 0 };
      await updateCombatant(decoyId, { x: x + offset.dx, y: y + offset.dy });
    }
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(combatant.encounter_id, `${combatant.name} vaults over the wall and lands on the other side (${apCost} AP).`);
    res.json({ encounter: encounterOut, wallVault: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not Wall Vault." });
  }
});

// ---------------------------------------------------------------------------
// Wall Run: slide along the length of a nearby wall
// ---------------------------------------------------------------------------

router.post("/actions/wall-run", async (req, res) => {
  const { combatantId, targetPoint } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
    const encounter = encounterRow.rows[0];
    if (!encounter) return res.status(404).json({ error: "Encounter not found." });
    if (!isActingCombatantAuthorized(req, combatant, encounter)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, combatant)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (combatant.unconscious || combatant.disabled) {
      return res.status(400).json({ error: "This combatant can't act." });
    }
    if (combatant.kind === "mecha" || combatant.mounted_on != null) {
      return res.status(400).json({ error: "Only a combatant on foot can run a wall." });
    }
    if (combatant.status_effects?.snared?.turnsLeft > 0) {
      return res.status(400).json({ error: "This combatant is snared and can't move." });
    }

    const acrobaticsMod = combatantSkillMod(combatant, "acrobatics");
    if (acrobaticsMod <= 0) {
      return res.status(400).json({ error: "You need a positive Acrobatics modifier to Wall Run." });
    }
    if (combatant.current_ap < WALL_RUN_AP_COST) {
      return res.status(400).json({ error: `Not enough AP -- Wall Run costs ${WALL_RUN_AP_COST}.` });
    }

    const from = { x: combatant.x, y: combatant.y };
    const plan = planWallRun(
      from,
      encounter.walls,
      encounter.map_width,
      encounter.map_height,
      targetPoint,
      wallRunDistance(acrobaticsMod)
    );
    if (!plan) return res.status(400).json({ error: "You need to be close to a wall to Wall Run." });
    if (plan.distance < WALL_RUN_MIN_DISTANCE) {
      return res.status(400).json({ error: "You're already at the end of that wall -- pick the other direction." });
    }
    // Whatever else is in the way (other than the wall being run) still blocks.
    if (firstWallHit(from, plan.landing, withMapEdges(encounter.walls, encounter.map_width, encounter.map_height), [plan.wall.id])) {
      return res.status(400).json({ error: "Another wall blocks the run." });
    }

    const { x, y } = plan.landing;
    await updateCombatant(combatant.id, { x, y, current_ap: combatant.current_ap - WALL_RUN_AP_COST });
    await recordCombatEvent(combatant.encounter_id, "move", {
      actor: combatant,
      distance: distance(from, { x, y }),
      ap: WALL_RUN_AP_COST,
    });
    for (const decoyId of combatant.status_effects?.mirage?.decoyIds || []) {
      const decoy = await getCombatant(decoyId);
      const offset = decoy?.data?.offset || { dx: 0, dy: 0 };
      await updateCombatant(decoyId, { x: x + offset.dx, y: y + offset.dy });
    }
    // Like a Move: damaging patches along the run still bite, as do blooms and ghosts.
    const crossed = await applyPathHazards(combatant.id, from, { x, y }, { hazards: encounter.hazards, verb: "runs through" });
    await plantBites(await getCombatant(combatant.id), { fromPos: from });
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(combatant.encounter_id, `${combatant.name} runs along the wall (${WALL_RUN_AP_COST} AP).`);
    res.json({ encounter: encounterOut, wallRun: true, hazardHit: crossed[0]?.hit ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not Wall Run." });
  }
});

// ---------------------------------------------------------------------------
// Skill actions: Hide (Stealth), Intimidate, First Aid (Medicine)
// ---------------------------------------------------------------------------

// Shared gatekeeping for the skill actions below: the combatant must be one
// the caller controls, acting on their own turn, conscious, on foot. Sends the
// error response itself and returns null when any check fails.
async function loadSkillActor(req, res, combatantId) {
  const combatant = await getCombatant(combatantId);
  if (!combatant) {
    res.status(404).json({ error: "Combatant not found." });
    return null;
  }
  const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
  const encounter = encounterRow.rows[0];
  if (!encounter) {
    res.status(404).json({ error: "Encounter not found." });
    return null;
  }
  if (!isActingCombatantAuthorized(req, combatant, encounter)) {
    res.status(403).json({ error: "That isn't your combatant." });
    return null;
  }
  if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, combatant)) {
    res.status(400).json({ error: "It isn't your turn." });
    return null;
  }
  if (combatant.unconscious || combatant.disabled) {
    res.status(400).json({ error: "This combatant can't act." });
    return null;
  }
  if (combatant.kind === "mecha" || combatant.mounted_on != null) {
    res.status(400).json({ error: "Only a combatant on foot can do that." });
    return null;
  }
  return { combatant, encounter };
}

router.post("/actions/hide", async (req, res) => {
  try {
    const actor = await loadSkillActor(req, res, (req.body || {}).combatantId);
    if (!actor) return;
    const { combatant } = actor;
    const stealthMod = combatantSkillMod(combatant, "stealth");
    if (stealthMod <= 0) return res.status(400).json({ error: "You need a positive Stealth modifier to Hide." });
    if (combatant.current_ap < HIDE_AP_COST) return res.status(400).json({ error: "Not enough AP to Hide." });
    if (combatant.status_effects?.hideTried) return res.status(400).json({ error: "You've already tried to Hide this turn." });

    const { rows } = await pool.query(
      "SELECT * FROM combatants WHERE encounter_id = $1 AND id <> $2 AND kind <> 'decoy' AND NOT unconscious AND NOT disabled",
      [combatant.encounter_id, combatant.id]
    );
    const watcher = rows.find(
      (c) => !areAllies(combatant, c) && distance({ x: combatant.x, y: combatant.y }, { x: c.x, y: c.y }) <= HIDE_RANGE
    );
    if (watcher) {
      return res.status(400).json({ error: `${watcher.name} is too close -- nobody hostile can be within ${HIDE_RANGE} units.` });
    }

    const total = rollD20() + stealthMod;
    const hidden = total > HIDE_DC;
    const status = { ...(combatant.status_effects || {}), hideTried: true };
    if (hidden) status.invisible = { turnsLeft: INVISIBLE_DURATION_TURNS };
    await updateCombatant(combatant.id, {
      current_ap: combatant.current_ap - HIDE_AP_COST,
      status_effects: JSON.stringify(status),
    });
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(
      combatant.encounter_id,
      hidden
        ? `${combatant.name} slips out of sight (${total} Stealth)!`
        : `${combatant.name} tries to hide but is still in view (${total} Stealth).`
    );
    res.json({ encounter: encounterOut, hidden, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not Hide." });
  }
});

router.post("/actions/intimidate", async (req, res) => {
  try {
    const { combatantId, targetId } = req.body || {};
    const actor = await loadSkillActor(req, res, combatantId);
    if (!actor) return;
    const { combatant } = actor;
    const mod = combatantSkillMod(combatant, "intimidation");
    if (mod <= 0) return res.status(400).json({ error: "You need a positive Intimidation modifier to Intimidate." });
    if (combatant.current_ap < INTIMIDATE_AP_COST) return res.status(400).json({ error: "Not enough AP to Intimidate." });

    const target = await getCombatant(targetId);
    if (!target || isBurrowed(target) || target.encounter_id !== combatant.encounter_id) return res.status(404).json({ error: "Target not found." });
    if (target.kind === "mecha" || target.kind === "decoy" || target.kind === "plant" || target.kind === "ghost") return res.status(400).json({ error: "That can't be intimidated." });
    if (target.unconscious || target.disabled) return res.status(400).json({ error: "That target is already down." });
    if (areAllies(combatant, target)) return res.status(400).json({ error: "You can only intimidate an enemy." });
    if (distance({ x: combatant.x, y: combatant.y }, { x: target.x, y: target.y }) > INTIMIDATE_RANGE) {
      return res.status(400).json({ error: `Too far away -- within ${INTIMIDATE_RANGE} units only.` });
    }

    const total = rollD20() + mod;
    const worked = total > INTIMIDATE_DC;
    await updateCombatant(combatant.id, { current_ap: combatant.current_ap - INTIMIDATE_AP_COST });
    if (worked) {
      await updateCombatant(target.id, {
        status_effects: JSON.stringify({ ...(target.status_effects || {}), intimidated: { apPenalty: INTIMIDATE_AP_PENALTY } }),
      });
    }
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(
      combatant.encounter_id,
      worked
        ? `${combatant.name} stares ${target.name} down (${total} Intimidation) -- they'll start their next turn ${INTIMIDATE_AP_PENALTY} AP short!`
        : `${combatant.name} tries to intimidate ${target.name} but they hold firm (${total} Intimidation).`
    );
    res.json({ encounter: encounterOut, worked, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not Intimidate." });
  }
});

router.post("/actions/first-aid", async (req, res) => {
  try {
    const { combatantId, targetId } = req.body || {};
    const actor = await loadSkillActor(req, res, combatantId);
    if (!actor) return;
    const { combatant } = actor;
    const apCost = firstAidApCost(combatantSkillMod(combatant, "medicine"));
    if (combatant.current_ap < apCost) return res.status(400).json({ error: `Not enough AP -- First Aid costs ${apCost}.` });

    const target = await getCombatant(targetId);
    if (!target || isBurrowed(target) || target.encounter_id !== combatant.encounter_id) return res.status(404).json({ error: "Target not found." });
    if (target.kind === "mecha" || target.kind === "decoy" || target.kind === "plant" || target.kind === "ghost") return res.status(400).json({ error: "First Aid only works on people." });
    if (!areAllies(combatant, target)) return res.status(400).json({ error: "First Aid only works on allies." });
    if (distance({ x: combatant.x, y: combatant.y }, { x: target.x, y: target.y }) > FIRST_AID_RANGE) {
      return res.status(400).json({ error: "Too far away -- get closer to your patient." });
    }

    const status = { ...(target.status_effects || {}) };
    const cured = NEGATIVE_STATUS_KEYS.filter((key) => status[key]);
    if (cured.length === 0) return res.status(400).json({ error: `${target.name} has nothing to treat.` });
    for (const key of cured) delete status[key];

    await updateCombatant(combatant.id, { current_ap: combatant.current_ap - apCost });
    await updateCombatant(target.id, { status_effects: JSON.stringify(status) });
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    const who = target.id === combatant.id ? "themselves" : target.name;
    await pushCombatLog(
      combatant.encounter_id,
      `${combatant.name} treats ${who}, clearing ${cured.length} negative effect${cured.length === 1 ? "" : "s"} (${apCost} AP).`
    );
    res.json({ encounter: encounterOut, cured });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not give First Aid." });
  }
});

// ---------------------------------------------------------------------------
// Mecha modes (Bike / Glider / Aquatic / Burrow)
// ---------------------------------------------------------------------------

// A mounted rider flips their mecha between normal and one of its mod-granted
// modes. Free, but only on your own turn. The mode lives on both the mecha and
// its rider so either row can answer "what mode am I in?". `mode: null` returns
// to normal (for Burrow that's "get out of burrow").
router.post("/actions/mecha-mode", async (req, res) => {
  const { combatantId, mode } = req.body || {};
  try {
    if (mode !== null && !MECHA_MODES.includes(mode)) return res.status(400).json({ error: "Unknown mode." });
    if (mode === "aquatic") return res.status(400).json({ error: "Aquatic mode engages by itself in water." });
    const rider = await getCombatant(combatantId);
    if (!rider) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [rider.encounter_id]);
    const encounter = encounterRow.rows[0];
    if (!isActingCombatantAuthorized(req, rider, encounter)) return res.status(403).json({ error: "That isn't your combatant." });
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, rider)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (rider.kind === "mecha" || rider.mounted_on == null) return res.status(400).json({ error: "You need to be mounted on a mecha." });
    const vehicle = await getCombatant(rider.mounted_on);
    if (!vehicle || vehicle.disabled) return res.status(400).json({ error: "That mecha is disabled." });
    if (mode !== null && !(vehicle.data?.modes || []).includes(mode)) {
      return res.status(400).json({ error: "This mecha doesn't have that mode installed." });
    }
    const previous = vehicle.data?.mode ?? null;
    for (const c of [rider, vehicle]) {
      await updateCombatant(c.id, { data: JSON.stringify({ ...(c.data || {}), mode }) });
    }
    const encounterOut = await broadcastEncounter(rider.encounter_id);
    const label = { bike: "Bike", glider: "Glider", aquatic: "Aquatic", burrow: "Burrow" };
    await pushCombatLog(
      rider.encounter_id,
      mode === null
        ? previous === "burrow"
          ? `${vehicle.name} surfaces from the ground.`
          : `${vehicle.name} returns to normal mode.`
        : mode === "burrow"
          ? `${vehicle.name} burrows underground and vanishes from sight!`
          : `${vehicle.name} switches to ${label[mode]} mode.`
    );
    res.json({ encounter: encounterOut });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change mode." });
  }
});

// ---------------------------------------------------------------------------
// Switch Weapon
// ---------------------------------------------------------------------------

router.post("/actions/switch-weapon", async (req, res) => {
  const { combatantId } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    if (combatant.kind !== "character" || !combatant.ref_user_id) {
      return res.status(400).json({ error: "Only characters carry a primary and secondary weapon." });
    }
    const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
    const encounter = encounterRow.rows[0];
    if (!isActingCombatantAuthorized(req, combatant, encounter)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, combatant)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (combatant.unconscious || combatant.disabled) {
      return res.status(400).json({ error: "This combatant can't act." });
    }
    if (combatant.current_ap < SWITCH_WEAPON_AP_COST) {
      return res.status(400).json({ error: "Not enough AP." });
    }

    const currentSlot = combatant.data?.activeWeaponSlot ?? PRIMARY_WEAPON_SLOT;
    const nextSlot = currentSlot === PRIMARY_WEAPON_SLOT ? SECONDARY_WEAPON_SLOT : PRIMARY_WEAPON_SLOT;
    const { rows: nextBlasterRows } = await pool.query(
      "SELECT id FROM blasters WHERE user_id = $1 AND equip_slot = $2",
      [combatant.ref_user_id, nextSlot]
    );
    if (nextBlasterRows.length === 0) {
      return res.status(400).json({ error: nextSlot === SECONDARY_WEAPON_SLOT ? "No secondary weapon equipped." : "No primary weapon equipped." });
    }

    await updateCombatant(combatant.id, {
      current_ap: combatant.current_ap - SWITCH_WEAPON_AP_COST,
      data: JSON.stringify({ ...(combatant.data || {}), activeWeaponSlot: nextSlot }),
    });
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(
      combatant.encounter_id,
      `${combatant.name} switches to their ${nextSlot === PRIMARY_WEAPON_SLOT ? "primary" : "secondary"} weapon.`
    );
    res.json({ encounter: encounterOut });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not switch weapons." });
  }
});

// ---------------------------------------------------------------------------
// Melee
// ---------------------------------------------------------------------------

// A swing with the melee weapon in the Secondary slot (see equipmentRules.js).
// Hit roll: d20 + STR modifier (+ the weapon's own accuracy) against the usual
// 10 + the target's DEX modifier -- a mecha's `handling` for a mecha, like Ram.
// A hit deals the weapon's damage x the STR modifier (when positive; added
// otherwise -- see meleeDamageFor), applied through dealHit as a
// plain "None"-element hit (so mounted riders, mechas, decoys, blooms, Fame and
// knockout rolls all behave exactly as they do for a slug). There's no reaction
// window: melee resolves on the spot, and costs the weapon's own AP.
router.post("/actions/melee", async (req, res) => {
  const { attackerId, targetId } = req.body || {};
  try {
    const attacker = await getCombatant(attackerId);
    if (!attacker) return res.status(404).json({ error: "Combatant not found." });
    if (attacker.kind !== "character" || !attacker.ref_user_id) {
      return res.status(400).json({ error: "Only characters carry a melee weapon." });
    }
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [attacker.encounter_id])).rows[0];
    if (!encounterRow) return res.status(404).json({ error: "Encounter not found." });
    if (!isActingCombatantAuthorized(req, attacker, encounterRow)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounterRow, attacker)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (attacker.unconscious || attacker.disabled) return res.status(400).json({ error: "This combatant can't act." });
    if (isBurrowed(attacker)) return res.status(400).json({ error: "You can't swing a weapon from inside a burrow." });

    const { rows: weapons } = await pool.query(
      "SELECT * FROM equipment WHERE user_id = $1 AND kind = 'melee' AND equip_slot = $2",
      [attacker.ref_user_id, EQUIPMENT_SLOT]
    );
    const weapon = weapons[0];
    if (!weapon) return res.status(400).json({ error: "No melee weapon equipped in your Secondary slot." });

    const target = await getCombatant(targetId);
    if (!target || target.encounter_id !== attacker.encounter_id || isBurrowed(target)) {
      return res.status(404).json({ error: "Target not found." });
    }
    if (target.id === attacker.id) return res.status(400).json({ error: "You can't strike yourself." });
    if (target.unconscious) return res.status(400).json({ error: `${target.name} is already down.` });
    if (target.kind !== "decoy" && areAllies(attacker, target)) {
      return res.status(400).json({ error: "You can't strike an ally." });
    }
    if ((attacker.current_ap ?? 0) < weapon.ap_cost) return res.status(400).json({ error: "Not enough AP." });

    const from = { x: attacker.x, y: attacker.y };
    const to = { x: target.x, y: target.y };
    if (distance(from, to) > weapon.reach) {
      return res.status(400).json({ error: `${target.name} is out of reach (${weapon.name} reaches ${weapon.reach} units).` });
    }
    if (firstWallHit(from, to, encounterRow.walls || [])) {
      return res.status(400).json({ error: "A wall is in the way." });
    }

    const { rows: chars } = await pool.query("SELECT stats FROM characters WHERE user_id = $1", [attacker.ref_user_id]);
    const strMod = statModifier(chars[0]?.stats?.strength ?? 10);

    // The swing is spent from here on, hit or miss. Blinded / keen vision are
    // "your next attack roll" effects, so a swing consumes them just like a shot.
    let roll = rollD20();
    let rollNote = "";
    const attackerStatus = { ...(attacker.status_effects || {}) };
    if (attackerStatus.blinded) {
      roll = Math.min(roll, rollD20());
      attackerStatus.blinded = false;
      rollNote = " (blinded -- disadvantage)";
    } else if (attackerStatus.keenVision) {
      // Advantage and an ill character's disadvantage cancel out.
      if (!gearDisadvantage(attacker)) roll = Math.max(roll, rollD20());
      attackerStatus.keenVision = false;
      rollNote = " (keen vision -- advantage)";
    } else if (gearDisadvantage(attacker)) {
      roll = Math.min(roll, rollD20());
      rollNote = " (ill -- disadvantage)";
    }
    await updateCombatant(attacker.id, {
      current_ap: attacker.current_ap - weapon.ap_cost,
      status_effects: JSON.stringify(attackerStatus),
    });

    const evasion = target.kind === "mecha" ? target.data?.handling ?? 0 : target.data?.dexMod ?? 0;
    const dc = 10 + evasion;
    const attackTotal = roll + strMod + weapon.accuracy + gearAccuracyMod(attacker);
    const hit = attackTotal >= dc;
    const damage = meleeDamageFor(weapon.damage, strMod);

    await recordCombatEvent(attacker.encounter_id, "shot", { actor: attacker, target, slug: weapon.name, slugType: "None", action: "attack" });
    await recordCombatEvent(attacker.encounter_id, "shot_result", {
      actor: attacker,
      target,
      slug: weapon.name,
      slugType: "None",
      outcome: hit ? "hit" : "miss",
      roll,
      attackTotal,
      dc,
    });

    let log;
    if (!hit) {
      log = `${attacker.name} swings ${weapon.name} at ${target.name} and misses (${attackTotal} vs DC ${dc})${rollNote}.`;
    } else {
      broadcastChainFx({ fromPos: from, toPos: to });
      // The weapon's type picks its on-hit effect, reusing the slug machinery:
      // bludgeon shoves, slash bleeds, pierce slips past shields.
      const meleeType = weapon.melee_type || DEFAULT_MELEE_TYPE;
      const meleeSlug = {
        id: null,
        name: weapon.name,
        type: "None",
        clash_power: damage,
        loyalty_tier: 1,
        ...(meleeType === "bludgeon" ? { melee_knockback: MELEE_KNOCKBACK_DISTANCE } : {}),
        ...(meleeType === "slash" ? { causes_bleed: true } : {}),
        ...(meleeType === "pierce" ? { pierces_shield: true } : {}),
      };
      const hitLog = await dealHit(attacker.encounter_id, attacker.id, target.id, meleeSlug, { statTag: "melee" });
      log = `${attacker.name} ${meleeType === "bludgeon" ? "bludgeons" : meleeType === "pierce" ? "pierces" : "slashes"} ${target.name} with ${weapon.name} (${attackTotal} vs DC ${dc})${rollNote} -- ${hitLog}`;
    }

    await pushCombatLog(attacker.encounter_id, log);
    const encounter = await broadcastEncounter(attacker.encounter_id);
    res.json({ encounter, hit, damage: hit ? damage : 0, log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not swing." });
  }
});

// ---------------------------------------------------------------------------
// Patch Up: spend all remaining AP to heal yourself (route keeps its old
// "hunker-down" name so earlier battle reports still read right)
// ---------------------------------------------------------------------------

router.post("/actions/hunker-down", async (req, res) => {
  const { combatantId } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
    const encounter = encounterRow.rows[0];
    if (!isActingCombatantAuthorized(req, combatant, encounter)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, combatant)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (combatant.unconscious || combatant.disabled) {
      return res.status(400).json({ error: "This combatant can't act." });
    }
    if (combatant.current_grit === null) {
      return res.status(400).json({ error: "This combatant can't patch themselves up." });
    }
    if (combatant.damaged_this_turn) {
      return res.status(400).json({ error: "Can't Patch Up the same round you were hit." });
    }
    if (combatant.current_ap < 1) {
      return res.status(400).json({ error: "No AP left to Patch Up." });
    }

    // No point burning the turn once Grit is already at the cap.
    const cap = hunkerGritCap(combatant.max_grit);
    if (combatant.current_grit >= cap) {
      return res.status(400).json({ error: "Patch Up can't heal you above 50% Grit." });
    }

    // Sinks every remaining AP into the heal -- a flat max(1, CON mod) Grit per AP,
    // but never past the cap.
    const apSpent = combatant.current_ap;
    const conMod = combatant.data?.conMod ?? 0;
    const newGrit = Math.min(cap, combatant.current_grit + hunkerHeal(conMod, apSpent));
    const heal = newGrit - combatant.current_grit;

    const updated = await updateCombatant(combatant.id, {
      current_grit: newGrit,
      current_ap: 0,
    });
    await syncCharacterFromCombatant(updated);
    await recordCombatEvent(combatant.encounter_id, "heal", {
      actor: combatant,
      target: combatant,
      amount: newGrit - combatant.current_grit,
      source: "hunker",
    });
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(
      combatant.encounter_id,
      `${combatant.name} patches themselves up, spending ${apSpent} AP to recover ${heal} Grit.`
    );
    res.json({ encounter: encounterOut, healed: heal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not Patch Up." });
  }
});

// ---------------------------------------------------------------------------
// Reload
// ---------------------------------------------------------------------------

// A slug that's finished its return-to-hand cooldown (see SLUG_RETURN_TURNS)
// is back with its owner but sitting out of the weapon -- `loaded` false.
// Reload chambers every such slug in the currently active weapon at once,
// for a flat AP cost equal to that blaster's own reload_ap_cost.
router.post("/actions/reload", async (req, res) => {
  const { combatantId } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = await pool.query("SELECT * FROM encounters WHERE id = $1", [combatant.encounter_id]);
    const encounter = encounterRow.rows[0];
    if (!isActingCombatantAuthorized(req, combatant, encounter)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounter, combatant)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (combatant.unconscious || combatant.disabled) {
      return res.status(400).json({ error: "This combatant can't act." });
    }
    if (combatant.kind !== "character" && combatant.kind !== "npc") {
      return res.status(400).json({ error: "This combatant doesn't carry slugs." });
    }

    // The blaster in hand right now: a character's active slot, an NPC's
    // single loadout.
    let blaster;
    if (combatant.kind === "character") {
      const activeSlot = combatant.data?.activeWeaponSlot ?? PRIMARY_WEAPON_SLOT;
      ({ rows: [blaster] } = await pool.query(
        "SELECT * FROM blasters WHERE user_id = $1 AND equip_slot = $2",
        [combatant.ref_user_id, activeSlot]
      ));
    } else {
      ({ rows: [blaster] } = await pool.query(
        "SELECT * FROM blasters WHERE owner_combatant_id = $1 AND equip_slot IS NOT NULL ORDER BY equip_slot ASC LIMIT 1",
        [combatant.id]
      ));
    }
    if (!blaster) return res.status(400).json({ error: "No weapon equipped to reload." });

    const { rows: toReload } = await pool.query(
      `SELECT * FROM slugs
       WHERE equipped_blaster_id = $1 AND loaded = false AND cooldown_turns_left = 0
       ORDER BY pod_broken ASC, magazine_slot ASC NULLS LAST, id ASC`,
      [blaster.id]
    );
    if (toReload.length === 0) {
      return res.status(400).json({ error: "No returned slugs waiting to be reloaded." });
    }

    // A player's slug whose pod was destroyed by a misfire needs a spare pod
    // to go back in; NPCs/grunts have infinite pods and never get here.
    const isPlayer = combatant.kind === "character";
    let sparePods = Infinity;
    if (isPlayer) {
      const { rows: podRows } = await pool.query("SELECT pods FROM characters WHERE user_id = $1", [combatant.ref_user_id]);
      sparePods = podRows[0]?.pods ?? 0;
    }
    const reloadIds = [];
    let podsUsed = 0;
    let stalled = 0;
    for (const s of toReload) {
      if (isPlayer && s.pod_broken) {
        if (sparePods - podsUsed > 0) {
          podsUsed += 1;
          reloadIds.push(s.id);
        } else {
          stalled += 1;
        }
      } else {
        reloadIds.push(s.id);
      }
    }
    if (reloadIds.length === 0) {
      return res.status(400).json({ error: "No spare pods left -- those slugs can't be reloaded." });
    }

    // Mods shift the weapon's own cost first (floored at 1), then Sleight of
    // Hand shaves its modifier off that.
    const modifiedCost = Math.max(1, (blaster.reload_ap_cost || 1) + (await blasterModTotal(blaster, "reload_ap_bonus")));
    // Cold fingers (or sweaty ones): the climate tier adds to what is left.
    const apCost = reloadApCostFor(modifiedCost, combatantSkillMod(combatant, "sleightOfHand")) + gearReloadAp(combatant);
    if (combatant.current_ap < apCost) {
      return res.status(400).json({ error: "Not enough AP to reload." });
    }

    await updateCombatant(combatant.id, { current_ap: combatant.current_ap - apCost });
    const { rows: reloaded } = await pool.query(
      `UPDATE slugs SET loaded = true, pod_broken = false WHERE id = ANY($1::int[]) RETURNING *`,
      [reloadIds]
    );
    if (podsUsed > 0) {
      const { rows: podRows } = await pool.query(
        "UPDATE characters SET pods = GREATEST(0, pods - $1) WHERE user_id = $2 RETURNING pods",
        [podsUsed, combatant.ref_user_id]
      );
      broadcastAll({ type: "pods-updated", userId: combatant.ref_user_id, pods: podRows[0]?.pods ?? 0 });
    }
    for (const slugRow of reloaded) {
      broadcastAll({ type: "slug-updated", userId: slugRow.user_id, slug: toClientSlug(slugRow) });
    }
    // The burst above only leaves the last slug in the client's single slot.
    if (reloaded.length > 1) broadcastAll({ type: "combat-gear-changed", at: Date.now() });

    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(
      combatant.encounter_id,
      `${combatant.name} reloads ${reloaded.length} slug${reloaded.length === 1 ? "" : "s"} into ${blaster.name}.` +
        (podsUsed > 0 ? ` (${podsUsed} spare pod${podsUsed === 1 ? "" : "s"} used)` : "") +
        (stalled > 0 ? ` ${stalled} slug${stalled === 1 ? "" : "s"} can't be reloaded -- out of pods.` : "")
    );
    res.json({ encounter: encounterOut, reloaded: reloaded.length, stalled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reload." });
  }
});

// ---------------------------------------------------------------------------
// Shared combat-resolution helpers (shooting, counter-clash, knockout, ram)
// ---------------------------------------------------------------------------

const pendingCounters = new Map(); // id -> offer, cleared by manual resolve or its own timeout
// Most network delay a counter response is credited for. The client reports
// when it clicked (relative to the shot's firing); the server believes it only
// back to this far before the request actually arrived, so a tampered client
// can't claim an arbitrarily early reaction.
const COUNTER_LAG_COMP_MS = 300;
const pendingKnockouts = new Map(); // id -> offer, cleared by manual resolve (no hard timeout)
const KNOCKOUT_PENDING_TTL_MS = 10 * 60 * 1000;

function cleanupExpiredKnockouts() {
  const cutoff = Date.now() - KNOCKOUT_PENDING_TTL_MS;
  for (const [id, offer] of pendingKnockouts) {
    if (offer.createdAt < cutoff) pendingKnockouts.delete(id);
  }
}

// A clash flings the slug out of the barrel, but -- exactly like an ordinary
// fired slug (see spendEnergyPip) -- it stays in its magazine slot and
// returns to hand after its return time, then waits on a Reload. It is NOT
// stripped out of the weapon: doing that made a countered slug vanish from
// the combat slug panel mid-fight with no in-combat way to get it back.
// spendEnergyPip has already run for both clash participants by the time we
// get here (it sets `loaded` per the slug's own self-load rule), so this only
// needs to (re)assert the full return-to-hand cooldown -- the slug was just
// flung out in a clash and owes the same return time as a fired one (see
// slugReturnTurns -- shorter for a slinger with a Tempo Aura up).
async function ejectSlug(slugId) {
  if (!slugId) return;
  const { rows: current } = await pool.query("SELECT * FROM slugs WHERE id = $1", [slugId]);
  if (!current[0]) return;
  const { rows } = await pool.query(
    "UPDATE slugs SET cooldown_turns_left = $1 WHERE id = $2 RETURNING *",
    [await slugReturnTurns(current[0]), slugId]
  );
  if (rows[0]) broadcastAll({ type: "slug-updated", userId: rows[0].user_id, slug: toClientSlug(rows[0]) });
}

// Called exactly when a slug actually flies -- the shooter's own shot, or a
// defender's chosen counter -- so this is also the one place that starts its
// return-to-hand cooldown (see SLUG_RETURN_TURNS) and knocks it out of the
// weapon: once the cooldown expires the slug is back in hand but `loaded`
// false, needing a Reload action to chamber it again (see /actions/reload).
// `count` is how many pips this use burns -- 1 normally, MEGA_MORPH_PIP_COST
// for a Mega Morph shot. Still a single fire, so the cooldown/reload state
// below is set once regardless.
// A misfire destroys the pod each fired slug was sitting in: flagged here, and
// the slug is forced unloaded (even a self-chambering Lentus) until a Reload
// spends a spare pod on it. Players only -- callers skip NPCs/grunts.
async function breakPods(attacker, slugIds) {
  const ids = (slugIds || []).filter((id) => id != null);
  if (ids.length === 0) return;
  const { rows } = await pool.query(
    "UPDATE slugs SET pod_broken = true, loaded = false WHERE id = ANY($1::int[]) AND user_id = $2 RETURNING *",
    [ids, attacker.ref_user_id]
  );
  for (const slugRow of rows) {
    broadcastAll({ type: "slug-updated", userId: slugRow.user_id, slug: toClientSlug(slugRow) });
  }
  if (rows.length > 0) {
    await pushCombatLog(attacker.encounter_id, rows.length > 1 ? `${attacker.name}'s slug pods shatter in the misfire!` : `${attacker.name}'s slug pod shatters in the misfire!`);
  }
}

// Every shot a player fires wears their blaster down a little (careRules.js);
// a stronger-quality weapon wears slower. NPC/grunt blasters don't track wear.
async function wearBlaster(blaster) {
  if (!blaster?.id) return;
  const { rows } = await pool.query(
    "UPDATE blasters SET durability = ROUND(GREATEST(0, durability - $1)::numeric, 3)::double precision WHERE id = $2 RETURNING *",
    [wearPerShot(blaster.quality), blaster.id]
  );
  if (rows[0]) broadcastAll({ type: "blaster-updated", userId: rows[0].user_id, blaster: toClientBlaster(rows[0]) });
}

async function spendEnergyPip(slugId, count = 1) {
  if (!slugId) return;
  const { rows } = await pool.query("SELECT * FROM slugs WHERE id = $1", [slugId]);
  const slug = rows[0];
  if (!slug) return;
  const pips = slug.energy_pips || [];
  if (!pips.some(Boolean)) return;
  let remaining = count;
  const next = pips.map((p) => {
    if (p && remaining > 0) {
      remaining -= 1;
      return false;
    }
    return p;
  });
  // Lentus: self-chambers the instant it's back in hand -- never actually
  // goes to `loaded: false` in the first place once its loyalty tier is
  // Friendly or higher, so there's nothing to Reload and no "needs reload"
  // UI state to show either. The cooldown itself is unaffected -- only the
  // separate reload step is skipped.
  const selfLoads = Boolean(slug.skips_reload) && (slug.loyalty_tier || 0) >= LOYALTY_FRIENDLY_TIER;
  // A normal slug comes back from cooldown un-chambered (`loaded` false) and
  // waits on a Reload action; only a self-loading slug (Lentus) stays loaded.
  await pool.query("UPDATE slugs SET cooldown_turns_left = $1, loaded = $2 WHERE id = $3", [
    await slugReturnTurns(slug),
    selfLoads,
    slugId,
  ]);
  const { rows: updated } = await pool.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [
    JSON.stringify(next),
    slugId,
  ]);
  broadcastAll({ type: "slug-updated", userId: updated[0].user_id, slug: toClientSlug(updated[0]) });
}

// Loyalty growth: every player-owned slug that actually flies earns a sliver
// of trust, worth more the better its owner's Slug Handling (see
// loyaltyRules.js). Called for a shot that left the barrel and for a slug that
// answers a counter -- never for a misfire, a ricochet leg, an NPC's slug or a
// DM's ad-hoc stat block (no id / no owner). Filling a tier raises it.
async function recordSlugShots(combatant, slugIds) {
  if (combatant?.kind !== "character" || !combatant.ref_user_id) return;
  const handling = combatant.data?.skills?.creatureHandling ?? 0;
  let changed = false;
  for (const slugId of slugIds) {
    if (!Number.isInteger(slugId)) continue;
    const { rows } = await pool.query("SELECT * FROM slugs WHERE id = $1 AND user_id = $2", [slugId, combatant.ref_user_id]);
    const slug = rows[0];
    if (!slug || slug.loyalty_tier >= LOYALTY_TIER_MAX) continue;
    let tier = slug.loyalty_tier;
    let progress = (slug.loyalty_progress || 0) + loyaltyPerShot(tier, handling);
    const rose = progress >= 1 - LOYALTY_FULL_EPSILON;
    if (rose) {
      tier += 1;
      progress = 0;
    }
    const { rows: updated } = await pool.query(
      "UPDATE slugs SET loyalty_tier = $1, loyalty_progress = $2 WHERE id = $3 RETURNING *",
      [tier, progress, slugId]
    );
    changed = true;
    broadcastAll({ type: "slug-updated", userId: updated[0].user_id, slug: toClientSlug(updated[0]) });
    if (rose) {
      await pushCombatLog(combatant.encounter_id, `${slug.name} has warmed to ${combatant.name} -- now ${LOYALTY_TIER_LABELS[tier]}!`);
      notifyUser(combatant.ref_user_id, { type: "slug-tier-up", slugId, slugName: slug.name, tier });
    }
  }
  // slug-updated is a single slot (a dual shot sends two); this signal makes
  // every owner and DM view refetch the fill and the DM's shot counts.
  if (changed) broadcastAll({ type: "slug-loyalty-changed", userId: combatant.ref_user_id });
}

// Ticks down the return-to-hand cooldown (see spendEnergyPip) by one for
// every slug this combatant owns -- called once, right as their own turn
// starts (see advanceTurn), so a slug fired on turn N is unusable for their
// next SLUG_RETURN_TURNS turns (fewer with a Tempo Aura up, see slugReturnTurns)
// and free again on the one after that.
async function tickSlugCooldowns(combatant) {
  const { rows } = await pool.query(
    combatant.kind === "npc"
      ? "SELECT * FROM slugs WHERE owner_combatant_id = $1 AND cooldown_turns_left > 0"
      : "SELECT * FROM slugs WHERE user_id = $1 AND cooldown_turns_left > 0",
    [combatant.kind === "npc" ? combatant.id : combatant.ref_user_id]
  );
  for (const slug of rows) {
    const { rows: updated } = await pool.query(
      "UPDATE slugs SET cooldown_turns_left = $1 WHERE id = $2 RETURNING *",
      [Math.max(0, slug.cooldown_turns_left - 1), slug.id]
    );
    if (updated[0]) broadcastAll({ type: "slug-updated", userId: updated[0].user_id, slug: toClientSlug(updated[0]) });
  }
  // Several slugs ticking at once is a burst the client's single slot can't
  // hold -- send the refetch signal so every countdown shows.
  if (rows.length > 1) broadcastAll({ type: "combat-gear-changed", at: Date.now() });
}

// Pieper's stalls_slugs: every slug the target owns goes on cooldown for one
// of their turns (STALL_COOLDOWN_TURNS), or -- if it's already cooling down --
// stays out one turn longer. Nothing about `loaded` changes; the slug just
// can't be used until the cooldown has run out. Returns how many slugs it hit.
async function stallTargetSlugs(target) {
  const byUser = target.kind === "character";
  if (byUser && !target.ref_user_id) return 0;
  const { rows } = await pool.query(
    byUser ? "SELECT * FROM slugs WHERE user_id = $1" : "SELECT * FROM slugs WHERE owner_combatant_id = $1",
    [byUser ? target.ref_user_id : target.id]
  );
  for (const slug of rows) {
    const next = slug.cooldown_turns_left > 0 ? slug.cooldown_turns_left + 1 : STALL_COOLDOWN_TURNS;
    const { rows: updated } = await pool.query("UPDATE slugs SET cooldown_turns_left = $1 WHERE id = $2 RETURNING *", [next, slug.id]);
    if (updated[0]) broadcastAll({ type: "slug-updated", userId: updated[0].user_id, slug: toClientSlug(updated[0]) });
  }
  if (rows.length > 1) broadcastAll({ type: "combat-gear-changed", at: Date.now() });
  return rows.length;
}

// `excludeSlugIds` is one id or an array -- a dual shot excludes both slugs
// that flew, so the refund can't land back on its own partner.
async function rechargeAnotherSlug(userId, excludeSlugIds) {
  if (!userId) return null;
  const { rows } = await pool.query(
    "SELECT * FROM slugs WHERE user_id = $1 AND equipped_blaster_id IS NOT NULL AND id != ALL($2::int[])",
    [userId, [].concat(excludeSlugIds)]
  );
  for (const slug of rows) {
    const pips = slug.energy_pips || [];
    const idx = pips.findIndex((p) => !p);
    if (idx === -1) continue;
    const next = pips.map((p, i) => (i === idx ? true : p));
    const { rows: updated } = await pool.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [
      JSON.stringify(next),
      slug.id,
    ]);
    broadcastAll({ type: "slug-updated", userId, slug: toClientSlug(updated[0]) });
    return slug.name;
  }
  return null;
}

// Water's soak: spends one live energy pip on a random one of `target`'s slugs that has any left
// (the ones loaded in a blaster, same pool as rechargeAnotherSlug). Returns that slug's name, or
// null if they have none (a mecha, or everything already empty).
async function drainRandomEnergyPip(target) {
  if (target.kind !== "character" && target.kind !== "npc") return null;
  let rows;
  if (target.kind === "character") {
    if (!target.ref_user_id) return null;
    ({ rows } = await pool.query("SELECT * FROM slugs WHERE user_id = $1 AND equipped_blaster_id IS NOT NULL", [target.ref_user_id]));
  } else {
    ({ rows } = await pool.query("SELECT * FROM slugs WHERE owner_combatant_id = $1 AND equipped_blaster_id IS NOT NULL", [target.id]));
  }
  const candidates = rows.filter((slug) => (slug.energy_pips || []).some(Boolean));
  if (candidates.length === 0) return null;
  const slug = candidates[Math.floor(Math.random() * candidates.length)];
  const pips = slug.energy_pips;
  const idx = pips.findIndex(Boolean);
  const next = pips.map((p, i) => (i === idx ? false : p));
  const { rows: updated } = await pool.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [JSON.stringify(next), slug.id]);
  broadcastAll({ type: "slug-updated", userId: updated[0].user_id, slug: toClientSlug(updated[0]) });
  return slug.name;
}

async function findEligibleCounterSlugs(target) {
  if (target.unconscious || target.disabled) return [];
  // Cynosure: a disarmed blaster can't be fired at all -- same blanket
  // lockout as the disarmed check in /actions/shoot, so a counter-clash
  // (which is just a Shoot Slug on someone else's turn) is out too.
  if (target.status_effects?.disarmed?.turnsLeft > 0) return [];
  // Only the slug(s) loaded into whichever weapon slot is currently active
  // can counter -- same rule as firing on your own turn (see /actions/shoot).
  const activeSlot = target.data?.activeWeaponSlot ?? PRIMARY_WEAPON_SLOT;
  // A player's slugs are keyed to their user; an NPC's to its combatant row
  // (see the NPC spawn in /encounters/:id/npc-combatants). Either way the
  // DM answers the NPC's counter -- see launchAndOfferCounter.
  let rows;
  if (target.kind === "character" && target.ref_user_id) {
    ({ rows } = await pool.query(
      `SELECT s.* FROM slugs s
       JOIN blasters b ON b.id = s.equipped_blaster_id
       WHERE s.user_id = $1 AND b.equip_slot = $2
       ORDER BY s.magazine_slot ASC NULLS LAST, s.id ASC`,
      [target.ref_user_id, activeSlot]
    ));
  } else if (target.kind === "npc") {
    ({ rows } = await pool.query(
      `SELECT s.* FROM slugs s
       JOIN blasters b ON b.id = s.equipped_blaster_id
       WHERE s.owner_combatant_id = $1 AND b.equip_slot = $2
       ORDER BY s.magazine_slot ASC NULLS LAST, s.id ASC`,
      [target.id, activeSlot]
    ));
  } else {
    return [];
  }
  // A counter now costs the slug's own apCost out of the defender's leftover
  // (unspent) AP -- so you can only counter with something you can afford,
  // and spending your whole turn leaves you unable to react. See
  // resolveCounterOffer, which actually charges it.
  const availableAp = target.current_ap || 0;
  return rows
    .filter(
      (s) =>
        Array.isArray(s.energy_pips) &&
        s.energy_pips.some(Boolean) &&
        (s.cooldown_turns_left || 0) === 0 &&
        s.loaded !== false &&
        (s.ap_cost || 0) <= availableAp
    )
    .map(applyLoyaltyToSlug);
}

// Bug fix bundled with the Speedstinger work below: this was still using a
// bare `8` -- a leftover from before RANGE_SCALE blew every distance number
// up 25x (see docs/combat-system-design.md §4's chain row, "within 8 units
// of target"), so chain basically never found anyone at this map's actual
// scale. Now uses CHAIN_RADIUS (8 * RANGE_SCALE) like everything else.
// `excludeCombatantId` is always barred (the shooter -- a shot never chains
// or ricochets back into its own owner). `fromCombatantId` (the combatant
// the shot is leaving) is preferred-against but not hard-barred: with
// `allowFrom`, it's returned as a last resort when nothing else qualifies,
// which is what lets a 1v1 Speedstinger ricochet keep bouncing off the lone
// enemy. `maxRadius` caps how far the search reaches -- CHAIN_RADIUS for the
// electricity chain arc, Infinity for the ricochet ("always the closest,
// wherever they are"). Only the shooter's *enemies* qualify -- an arc or
// ricochet never homes in on one of the shooter's own allies (same
// areAllies/combatSide rule everything else uses; a decoy counts as its
// owner's side, like it looks to everyone else).
async function findChainTarget(encounterId, fromCombatantId, excludeCombatantId, { maxRadius = CHAIN_RADIUS, allowFrom = false } = {}) {
  const from = await getCombatant(fromCombatantId);
  if (!from) return null;
  const shooter = await getCombatant(excludeCombatantId);
  const { rows } = await pool.query(
    "SELECT * FROM combatants WHERE encounter_id = $1 AND id != $2 AND unconscious = false AND disabled = false",
    [encounterId, excludeCombatantId]
  );
  let nearest = null;
  let nearestDist = Infinity;
  let fromFallback = null; // the from-combatant itself, used only when allowFrom and nothing else is in reach
  let fromFallbackDist = Infinity;
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const c of rows) {
    if (isBurrowed(c)) continue;
    // Hidden units can't be picked out -- a ricochet or arc never homes in on
    // someone invisible (hitting them directly still reveals them, see dealHit).
    if (c.status_effects?.invisible) continue;
    // A Mirage Coil decoy is a perfectly good target: it looks like its owner,
    // so a bolt that picks "the closest" must be able to pick a clone over the
    // real thing (the shot just pops it, see dealHit). Not the shooter's own
    // clones, and not clones of someone hidden.
    if (c.kind === "decoy") {
      const ownerId = c.data?.decoyOwnerId;
      const owner = byId.get(ownerId);
      if (ownerId === excludeCombatantId || !owner || owner.status_effects?.invisible) continue;
    }
    if (c.current_grit === null && c.current_structure === null) continue;
    if (shooter && areAllies(shooter, c.kind === "decoy" ? byId.get(c.data?.decoyOwnerId) : c)) continue;
    const d = distance({ x: from.x, y: from.y }, { x: c.x, y: c.y });
    if (d > maxRadius) continue;
    if (c.id === fromCombatantId) {
      if (allowFrom && d < fromFallbackDist) {
        fromFallback = c;
        fromFallbackDist = d;
      }
      continue;
    }
    if (d < nearestDist) {
      nearest = c;
      nearestDist = d;
    }
  }
  return nearest || fromFallback;
}

// Every living, conscious combatant within AOE_RADIUS of `origin` (a hit's
// impact point), excluding whichever ids the caller already resolved
// separately (the shooter, and the primary target -- which went through the
// normal roll/counter-clash flow, not this one). See dealHit's aoe_blast
// block.
async function findAoeTargets(encounterId, origin, excludeIds, radiusMult = 1) {
  const { rows } = await pool.query(
    "SELECT * FROM combatants WHERE encounter_id = $1 AND unconscious = false AND disabled = false",
    [encounterId]
  );
  return rows.filter((c) => {
    if (excludeIds.includes(c.id)) return false;
    if (c.kind === "decoy") return false; // only pops from a direct hit, see dealHit
    if (isBurrowed(c)) return false;
    if (c.current_grit === null && c.current_structure === null) return false;
    return distance(origin, { x: c.x, y: c.y }) <= AOE_RADIUS * radiusMult;
  });
}

async function disableMecha(mechaCombatantId) {
  await updateCombatant(mechaCombatantId, { disabled: true });
  const { rows: riders } = await pool.query("SELECT * FROM combatants WHERE mounted_on = $1", [mechaCombatantId]);
  for (const rider of riders) {
    await updateCombatant(rider.id, { mounted_on: null });
    await triggerKnockoutRoll(rider.id, "mecha-destroyed");
  }
}

// Any Grit hit that would land on a mounted rider is split with their mecha:
// the mecha soaks RIDER_DAMAGE_MECHA_FRACTION (75%, rounded up) as Structure,
// the rider takes the rest (see splitRiderDamage's rounding note). Applies the
// mecha's share to Structure here (disabling it at 0, which also dismounts the
// rider) and returns { riderDamage, note } for the caller to fold into its
// own Grit write and log line. A no-op -- returns the amount untouched -- when
// the target isn't riding a live mecha.
// ---- Shields (equipment.kind = 'shield', Secondary slot) -------------------------
// A shield soaks up to `absorb` damage per fight, then it's broken until the
// fight is over. Damage already soaked is tracked per shield on the combatant
// (data.shieldUsed, keyed by equipment id), so unequipping and re-equipping a
// broken shield mid-fight doesn't mend it -- and a new fight (a new combatant)
// starts fresh. data.shield is the snapshot the clients draw.
async function equippedShield(userId) {
  if (!userId) return null;
  const { rows } = await pool.query(
    "SELECT * FROM equipment WHERE user_id = $1 AND kind = 'shield' AND equip_slot = $2 LIMIT 1",
    [userId, EQUIPMENT_SLOT]
  );
  return rows[0] || null;
}

async function shieldSnapshot(userId, shieldUsed) {
  const shield = await equippedShield(userId);
  if (!shield) return null;
  const remaining = Math.max(0, shield.absorb - (shieldUsed?.[shield.id] ?? 0));
  return { id: shield.id, name: shield.name, max: shield.absorb, remaining };
}

async function absorbWithShield(target, damage, { pierceShield = false } = {}) {
  if (!(damage > 0) || target.kind !== "character" || !target.ref_user_id) return { riderDamage: damage, note: "" };
  // Re-read: an earlier hit in this same resolution (splash, chain) may have already chipped it.
  const fresh = (await getCombatant(target.id)) ?? target;
  const shield = await equippedShield(fresh.ref_user_id);
  if (!shield) return { riderDamage: damage, note: "" };
  const used = fresh.data?.shieldUsed?.[shield.id] ?? 0;
  const left = shield.absorb - used;
  if (left <= 0) return { riderDamage: damage, note: ` ${shield.name} is broken.` };
  if (pierceShield) return { riderDamage: damage, note: ` It pierces straight past ${shield.name}!` };
  const absorbed = Math.min(left, damage);
  const shieldUsed = { ...(fresh.data?.shieldUsed || {}), [shield.id]: used + absorbed };
  const remaining = shield.absorb - shieldUsed[shield.id];
  await updateCombatant(fresh.id, {
    data: JSON.stringify({ ...(fresh.data || {}), shieldUsed, shield: { id: shield.id, name: shield.name, max: shield.absorb, remaining } }),
  });
  return {
    riderDamage: damage - absorbed,
    shieldAbsorbed: absorbed,
    note: ` ${shield.name} absorbs ${absorbed}${remaining <= 0 ? " and shatters!" : ` (${remaining} left)`}`,
  };
}

// Where a hit's Grit damage is finally decided: the mecha a rider is on soaks
// its share first, then the rider's shield takes what's left.
async function absorbRiderDamage(target, amount, { electric = false, stat = null, pierceShield = false } = {}) {
  const soaked = await soakByMecha(target, amount, { electric, stat });
  const shielded = await absorbWithShield(target, soaked.riderDamage, { pierceShield });
  return { ...soaked, riderDamage: shielded.riderDamage, note: (soaked.note || "") + shielded.note };
}

async function soakByMecha(target, amount, { electric = false, stat = null } = {}) {
  if (!(amount > 0) || target.mounted_on == null) return { riderDamage: amount, note: "" };
  const mecha = await getCombatant(target.mounted_on);
  if (!mecha || mecha.kind !== "mecha" || mecha.disabled) return { riderDamage: amount, note: "" };
  const split = splitRiderDamage(amount);
  const riderDamage = split.rider;
  // Only the mecha's share is doubled by Electricity -- the rider's portion is
  // untouched (power 10 -> split 8/2 -> mecha 16, rider 2).
  const mechaShare = electric ? split.mecha * ELECTRIC_MECHA_DAMAGE_MULTIPLIER : split.mecha;
  const newStructure = Math.max(0, (mecha.current_structure ?? 0) - mechaShare);
  await updateCombatant(mecha.id, { current_structure: newStructure });
  if (stat) {
    await recordCombatEvent(mecha.encounter_id, "damage", {
      actor: stat.actor,
      target: mecha,
      amount: Math.min(mechaShare, mecha.current_structure ?? 0),
      structure: true,
      via: stat.via,
      slug: stat.slug ?? null,
      slugType: stat.slugType ?? null,
      kill: newStructure === 0,
    });
  }
  let note = ` ${mecha.name} soaks ${mechaShare} Structure`;
  if (newStructure === 0 && !mecha.disabled) {
    await disableMecha(mecha.id);
    note += " and is wrecked";
  }
  note += ".";
  return { riderDamage, mechaShare, note };
}

async function triggerKnockoutRoll(combatantId, reason) {
  const combatant = await getCombatant(combatantId);
  if (!combatant || combatant.unconscious) return;

  // One 0-Grit beat can land more than once on the same combatant -- an AOE
  // blast that also splashes the primary target's neighbours, a chain or
  // ricochet leg that circles back, a counter-clash the shot still wins on top
  // of the plain hit, a burn/poison tick arriving while the prompt is still
  // open. Only the first gets a roll: a second prompt here would stack a
  // duplicate popup and burn a second knockout pip for what is really a single
  // "did they stay up?" question. Cleared the instant the pending roll is
  // answered (or after its TTL), so a genuinely separate later hit still rolls.
  cleanupExpiredKnockouts();
  for (const pending of pendingKnockouts.values()) {
    if (pending.combatantId === combatantId) return;
  }

  // Both player characters and NPCs make a Constitution save to stay
  // conscious -- an NPC's is answered by the DM (see dmControlled below),
  // same convention as a counter-clash. Anything without a knockout-pip
  // track (a mecha) just drops.
  const makesKnockoutSave =
    (combatant.kind === "character" || combatant.kind === "npc") && Array.isArray(combatant.knockout_pips);
  if (!makesKnockoutSave) {
    if (combatant.current_grit !== null) {
      await updateCombatant(combatantId, { unconscious: true });
      await recordCombatEvent(combatant.encounter_id, "down", { actor: combatant, reason });
      await pushCombatLog(combatant.encounter_id, `${combatant.name} is knocked out.`);
      await broadcastEncounter(combatant.encounter_id);
    }
    return;
  }

  const pipsUsed = countKnockoutPipsUsed(combatant.knockout_pips);
  if (pipsUsed >= 3) {
    const updated = await updateCombatant(combatantId, { unconscious: true });
    await syncCharacterFromCombatant(updated);
    await recordCombatEvent(combatant.encounter_id, "down", { actor: combatant, reason });
    await pushCombatLog(combatant.encounter_id, `${combatant.name} has nothing left to give and falls unconscious.`);
    await broadcastEncounter(combatant.encounter_id);
    return;
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dc = knockoutDC(pipsUsed);
  const conMod = combatant.data?.conMod ?? 0;
  // A player character's own player makes the roll; an NPC's has no
  // ref_user_id, so it's handed to the DM (every DM, same as counter-clash
  // offers for NPCs).
  const dmControlled = !combatant.ref_user_id;
  pendingKnockouts.set(id, {
    combatantId,
    userId: combatant.ref_user_id,
    dmControlled,
    name: combatant.name,
    dc,
    conMod,
    reason,
    createdAt: Date.now(),
  });

  const recipients = dmControlled ? await getDungeonMasterIds() : [combatant.ref_user_id];
  for (const recipientId of recipients) {
    notifyUser(recipientId, {
      type: "knockout-roll-offered",
      offer: { id, name: combatant.name, dc, reason, conMod, forNpc: dmControlled },
    });
  }
  await pushCombatLog(
    combatant.encounter_id,
    `${combatant.name}'s Grit hits 0${reason === "knockback" ? " from the impact" : ""} -- rolling to stay conscious.`
  );
  await broadcastEncounter(combatant.encounter_id);
}

// Same problem, same fix, for knockback: the target used to get shoved (and
// that shove broadcast to everyone) the instant the hit resolved, well
// before the projectile had visually reached them. Delays only the actual
// position change and its broadcast to land when the client's explosion
// burst would actually be showing -- the knockout-roll consequence of a
// wall hit (if any) still fires immediately alongside the rest of dealHit,
// since that's a separate mechanic (a DC save prompt) whose own sequencing
// (skipping the redundant grit-hits-0 roll) depends on it staying
// synchronous.
function scheduleKnockback(encounterId, targetCombatantId, destination, windowMs, firedAt) {
  const targetDelayMs = Math.max(0, (windowMs || 0) * SHOT_FLIGHT_MULTIPLIER);
  const elapsedSinceLaunch = Date.now() - (firedAt ?? Date.now());
  const delayMs = Math.max(0, targetDelayMs - elapsedSinceLaunch);
  setTimeout(async () => {
    try {
      const before = await getCombatant(targetCombatantId);
      // The destination was worked out when the shot launched; a wall raised
      // since (or the map's edge) still stops the shove.
      const { rows: encRows } = await pool.query("SELECT walls, map_width, map_height FROM encounters WHERE id = $1", [encounterId]);
      if (before && encRows[0]) {
        const blocked = firstWallHit(
          { x: before.x, y: before.y },
          destination,
          withMapEdges(encRows[0].walls, encRows[0].map_width, encRows[0].map_height)
        );
        if (blocked) {
          const t = Math.max(0, blocked.hit.t - 0.05);
          destination = { x: before.x + (destination.x - before.x) * t, y: before.y + (destination.y - before.y) * t };
        }
      }
      await updateCombatant(targetCombatantId, { x: destination.x, y: destination.y });
      if (before) {
        // Shoved or reeled through a damaging patch: it applies even if the
        // path starts and ends outside it.
        await applyPathHazards(targetCombatantId, { x: before.x, y: before.y }, destination, { verb: "is flung through" });
        await plantBites(await getCombatant(targetCombatantId), { fromPos: { x: before.x, y: before.y } });
      }
      await broadcastEncounter(encounterId);
    } catch (err) {
      console.error("Could not apply knockback:", err);
    }
  }, delayMs);
}

// An Ice slug leaves a patch of ice on the ground wherever its shot lands --
// see docs/combat-system-design.md §4's Ice row and findHazardAt/ICE_SLIP_CHANCE
// in combatRules.js for what actually happens when someone walks into it.
// Called once, right when the shot launches, at its already-computed
// impact point -- independent of whether it goes on to hit, miss, or clash,
// same as a wall-break's impact location.
async function addIceHazard(encounterId, point, radiusMult = 1) {
  try {
    const { rows } = await pool.query("SELECT hazards, next_hazard_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const hazardId = rows[0].next_hazard_id;
    const hazards = [
      ...(rows[0].hazards || []),
      { id: hazardId, type: "ice", x: point.x, y: point.y, radius: ICE_PATCH_RADIUS * radiusMult, turnsLeft: HAZARD_DURATION_ROUNDS },
    ];
    await pool.query("UPDATE encounters SET hazards = $1, next_hazard_id = $2 WHERE id = $3", [
      JSON.stringify(hazards),
      hazardId + 1,
      encounterId,
    ]);
    await pushCombatLog(encounterId, "A sheet of ice spreads across the ground.");
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not add ice hazard:", err);
  }
}

// Emberblade / Flaringo's trail_wall flag: a wall of fire along the exact
// line the shot traveled (attacker -> impact point), not the perpendicular
// "shield" a Wall Maker slug raises. Grows in client-side the same way any
// other slug-made wall does (see CombatMap.jsx's source === "slug" check) --
// no special-casing needed there, this is just a differently-shaped wall.
async function addTrailWall(encounterId, fromPos, toPos, slugType) {
  try {
    const { rows } = await pool.query("SELECT walls, next_wall_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const wallId = rows[0].next_wall_id;
    const walls = [
      ...(rows[0].walls || []),
      { id: wallId, source: "slug", slugType, x1: fromPos.x, y1: fromPos.y, x2: toPos.x, y2: toPos.y },
    ];
    await pool.query("UPDATE encounters SET walls = $1, next_wall_id = $2 WHERE id = $3", [
      JSON.stringify(walls),
      wallId + 1,
      encounterId,
    ]);
    const trailWhat = slugType === "Fire" ? "wall of fire roars to life" : slugType === "Ice" ? "wall of ice freezes into place" : "wall rises";
    await pushCombatLog(encounterId, `A ${trailWhat} along the shot's path.`);
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not add trail wall:", err);
  }
}

// Generalizes Ice's "leaves a patch on the ground" pattern to any type via
// the hazardMaker flag -- but this patch actually hurts. Same unconditional
// hit/miss/out-of-range trigger as Ice (called once, at launch, at the
// already-computed impact point), tagged with the leaving slug's own type
// and clashPower so applyHazardEffect below knows what to do when someone
// walks into it later.
async function addDamageHazard(encounterId, point, slug, logText, ownerId = null) {
  try {
    const { rows } = await pool.query("SELECT hazards, next_hazard_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const hazardId = rows[0].next_hazard_id;
    const hazards = [
      ...(rows[0].hazards || []),
      { id: hazardId, type: "damage", slugType: slug.type, x: point.x, y: point.y, radius: HAZARD_RADIUS, clashPower: slug.clash_power, ownerId, slugName: slug.name, poisonStacks: slug.potent_poison ? POTENT_POISON_MULTIPLIER : 1, turnsLeft: HAZARD_DURATION_ROUNDS },
    ];
    await pool.query("UPDATE encounters SET hazards = $1, next_hazard_id = $2 WHERE id = $3", [
      JSON.stringify(hazards),
      hazardId + 1,
      encounterId,
    ]);
    await pushCombatLog(encounterId, logText || `${slug.name} leaves a hazardous patch of terrain behind.`);
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not add damage hazard:", err);
  }
}

// Caligo's clears_fire_terrain flag: wherever its shot actually comes to
// rest, snuff out any Fire-origin wall, bridge, or damage hazard within
// HAZARD_RADIUS of that point -- a lingering fire trail hisses out, a
// blazing bridge collapses into ash, a burning patch goes cold. If nothing
// Fire-tagged was in range, it leaves its own steam patch instead, reusing
// addDamageHazard exactly like an ordinary Hazard Maker would (Water has no
// burn/poison DoT, so this is flat scalding damage only). Every wall,
// bridge, and hazard already carries the slugType that made it (see
// addTrailWall/formStarWall/addDamageHazard and the build-wall/build-bridge
// actions below), so this is a plain radius filter, not new terrain
// bookkeeping. Walls are line segments (distanceToSegment); bridges and
// hazards are single points (their own x/y).
async function clearOrCreateSteamTerrain(encounterId, point, slug) {
  try {
    const { rows } = await pool.query("SELECT walls, bridges, hazards FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const walls = rows[0].walls || [];
    const bridges = rows[0].bridges || [];
    const hazards = rows[0].hazards || [];

    const fireWalls = walls.filter(
      (w) => w.slugType === "Fire" && distanceToSegment(point, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }) <= HAZARD_RADIUS
    );
    const fireBridges = bridges.filter((b) => b.slugType === "Fire" && Math.hypot(b.x - point.x, b.y - point.y) <= HAZARD_RADIUS);
    const fireHazards = hazards.filter((h) => h.slugType === "Fire" && Math.hypot(h.x - point.x, h.y - point.y) <= HAZARD_RADIUS);

    if (fireWalls.length === 0 && fireBridges.length === 0 && fireHazards.length === 0) {
      await addDamageHazard(encounterId, point, slug, `${slug.name}'s mist condenses into a scalding cloud of steam.`);
      return;
    }

    const remainingWalls = fireWalls.length ? walls.filter((w) => !fireWalls.includes(w)) : walls;
    const remainingBridges = fireBridges.length ? bridges.filter((b) => !fireBridges.includes(b)) : bridges;
    const remainingHazards = fireHazards.length ? hazards.filter((h) => !fireHazards.includes(h)) : hazards;
    await pool.query("UPDATE encounters SET walls = $1, bridges = $2, hazards = $3 WHERE id = $4", [
      JSON.stringify(remainingWalls),
      JSON.stringify(remainingBridges),
      JSON.stringify(remainingHazards),
      encounterId,
    ]);
    await pushCombatLog(encounterId, `${slug.name}'s steam smothers the flames nearby -- the fire hisses out.`);
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not clear/create fire terrain:", err);
  }
}

// Shared by any source of flat, type-tagged environmental damage (a
// Hazard Maker patch, Pressure Tick's pod lines, Regulator's star-wall
// formation) -- applies the type's Burn/Poison DoT (if it has one) the exact
// same way dealHit itself would, on top of a flat Grit hit. Returns the
// damage dealt and a short log fragment; callers handle their own
// knockout-roll check.
async function applyEnvironmentalDamage(combatant, amount, slugType, stat = null) {
  const byRow = stat?.by && typeof stat.by === "object" ? stat.by : null;
  const byId = byRow ? byRow.id : stat?.by ?? null;
  const statActor = byRow || (byId ? await getCombatant(byId) : null);
  const tb = typeBallistics(slugType);
  const nextStatus = { ...(combatant.status_effects || {}) };
  let note = "";
  if (tb.trait === "burn") {
    const burnDamage = computeBurnDamage(amount);
    nextStatus.burning = { turnsLeft: BURN_DURATION_TURNS, damage: burnDamage, by: byId };
    note = " and catches fire";
  } else if (tb.trait === "poison") {
    const stacks = (nextStatus.poison?.stacks || 0) + (stat?.poisonStacks ?? 1);
    nextStatus.poison = { stacks, turnsLeft: POISON_DURATION_TURNS, by: byId };
    note = " and is poisoned";
  }
  // A mounted rider's mecha soaks most of the hit (Structure); the DoT status
  // above still lands on the rider themselves.
  const { riderDamage, note: absorbNote } = await absorbRiderDamage(combatant, amount, {
    electric: slugType === "Electricity",
    stat: stat ? { actor: statActor, via: stat.via, slug: stat.slug } : null,
  });
  const newGrit = Math.max(0, (combatant.current_grit ?? 0) - riderDamage);
  const updated = await updateCombatant(combatant.id, {
    current_grit: newGrit,
    damaged_this_turn: true,
    status_effects: JSON.stringify(nextStatus),
  });
  await syncCharacterFromCombatant(updated);
  if (stat) {
    const hpBefore = combatant.current_grit ?? 0;
    const applied = Math.min(riderDamage, hpBefore);
    await recordCombatEvent(combatant.encounter_id, "damage", {
      actor: statActor,
      target: combatant,
      amount: applied,
      overkill: riderDamage - applied,
      via: stat.via,
      slug: stat.slug ?? null,
      slugType,
      kill: newGrit === 0 && hpBefore > 0 && !combatant.unconscious,
    });
  }
  return { amount: riderDamage, newGrit, note: note + absorbNote };
}

// Called from /actions/move when a non-mecha combatant's destination lands
// inside a "damage"-type hazard (see findHazardAt). Deals
// HAZARD_DAMAGE_FRACTION of the leaving slug's own clashPower as Grit
// damage, plus that type's Burn/Poison DoT if it has one. The caller (the
// Move route) handles the knockout-roll check.
async function applyHazardEffect(hazard, combatant) {
  const amount = Math.max(1, Math.floor(hazard.clashPower * HAZARD_DAMAGE_FRACTION));
  return applyEnvironmentalDamage(combatant, amount, hazard.slugType, { by: hazard.ownerId ?? null, via: "hazard", slug: hazard.slugName ?? null, poisonStacks: hazard.poisonStacks ?? 1 });
}

// A mecha rolling onto a damaging hazard takes it as Structure damage (armor
// still helps, like against a shot); the type's Burn/Poison DoT lands on its
// rider, if any. Returns a short log fragment.
async function applyMechaHazard(hazard, mecha, rider) {
  const amount = Math.max(1, Math.floor(hazard.clashPower * HAZARD_DAMAGE_FRACTION));
  const dmg = Math.max(0, amount - (mecha.data?.armor ?? 0));
  const newStructure = Math.max(0, (mecha.current_structure ?? 0) - dmg);
  await updateCombatant(mecha.id, { current_structure: newStructure });
  await recordCombatEvent(mecha.encounter_id, "damage", {
    actor: hazard.ownerId ? await getCombatant(hazard.ownerId) : null,
    target: mecha,
    amount: Math.min(dmg, mecha.current_structure ?? 0),
    structure: true,
    via: "hazard",
    slug: hazard.slugName ?? null,
    kill: newStructure === 0 && !mecha.disabled,
  });
  let note = `${mecha.name} takes ${dmg} Structure damage from the hazard`;
  const tb = typeBallistics(hazard.slugType);
  if (rider && (tb.trait === "burn" || tb.trait === "poison")) {
    const status = { ...(rider.status_effects || {}) };
    if (tb.trait === "burn") {
      status.burning = { turnsLeft: BURN_DURATION_TURNS, damage: computeBurnDamage(amount) };
      note += `, and ${rider.name} catches fire`;
    } else {
      status.poison = { stacks: (status.poison?.stacks || 0) + 1, turnsLeft: POISON_DURATION_TURNS };
      note += `, and ${rider.name} is poisoned`;
    }
    await updateCombatant(rider.id, { status_effects: JSON.stringify(status) });
  }
  if (newStructure === 0 && !mecha.disabled) {
    await disableMecha(mecha.id);
    note += " -- it is wrecked!";
  } else {
    note += ".";
  }
  return note;
}

// Applies every damaging hazard patch the straight path from `fromPos` to
// `toPos` touches to this combatant -- walking, knockback, a grapple pull or
// a fear flee all pass through here, so crossing a patch counts even when both
// endpoints are outside it. Call it AFTER the position update. Each patch hits
// once; a mecha takes Structure damage (its rider gets the Burn/Poison), a
// combatant dropped to 0 Grit gets the knockout roll and the walk stops there.
// `hazards` can be passed when the caller already loaded them. Logs each hit
// and returns [{ hazard, hit }] (hit is applyHazardEffect's result, or null
// for a mecha).
async function applyPathHazards(combatantId, fromPos, toPos, { hazards, verb = "is caught in" } = {}) {
  const first = await getCombatant(combatantId);
  if (!first || ["decoy", "plant", "ghost"].includes(first.kind)) return [];
  const list = hazards ?? (await pool.query("SELECT hazards FROM encounters WHERE id = $1", [first.encounter_id])).rows[0]?.hazards;
  const results = [];
  for (const hazard of hazardsAlongPath(fromPos, toPos, list, "damage")) {
    const current = await getCombatant(combatantId);
    if (!current || current.unconscious || current.disabled) break;
    if (current.kind === "mecha") {
      const riders = await mechaRiders(current.id);
      const note = await applyMechaHazard(hazard, current, riders[0] ? await getCombatant(riders[0].id) : null);
      await pushCombatLog(current.encounter_id, note);
      results.push({ hazard, hit: null });
      continue;
    }
    const hit = await applyHazardEffect(hazard, current);
    await pushCombatLog(
      current.encounter_id,
      `${current.name} ${verb} hazardous terrain -- ${hit.amount} Grit damage${hit.note}.`
    );
    results.push({ hazard, hit });
    if (hit.newGrit === 0 && !current.unconscious) {
      await triggerKnockoutRoll(current.id, "grit");
      break;
    }
  }
  return results;
}

// Pressure Tick's steam pods -- 3 scattered near the impact point, each with
// a fixed random direction and an independently rolled 3-10 counter. See
// POD_* in combatRules.js and tickPods below (where they actually fire).
// Called once, unconditional on hit/miss, same trigger rule as Ice's patch.
async function spawnPods(encounterId, point, slug, ownerId = null) {
  try {
    const { rows } = await pool.query("SELECT pods, next_pod_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    let podId = rows[0].next_pod_id;
    const pods = [...(rows[0].pods || [])];
    for (let i = 0; i < POD_COUNT; i++) {
      const pos = scatterPoint(point, POD_SCATTER_RADIUS);
      pods.push({
        id: podId,
        x: pos.x,
        y: pos.y,
        angle: Math.random() * 360,
        counter: rollPodTimer(),
        slugType: slug.type,
        clashPower: slug.clash_power,
        ownerId,
        slugName: slug.name,
      });
      podId += 1;
    }
    await pool.query("UPDATE encounters SET pods = $1, next_pod_id = $2 WHERE id = $3", [
      JSON.stringify(pods),
      podId,
      encounterId,
    ]);
    await pushCombatLog(encounterId, `${slug.name} leaves ${POD_COUNT} steam pods hissing on the ground.`);
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not spawn pods:", err);
  }
}

// Decrements every pod's counter by 1 -- called once per advanceTurn
// invocation, i.e. once every time *any* combatant's turn starts (not just
// a pod's own owner). Any pod that hits 0 fires its damaging line along its
// own fixed direction, then re-arms with a fresh random counter instead of
// being consumed -- pods are permanent for the rest of the encounter.
async function tickPods(encounterId) {
  try {
    const { rows } = await pool.query("SELECT pods FROM encounters WHERE id = $1", [encounterId]);
    const pods = rows[0]?.pods || [];
    if (pods.length === 0) return;

    const { rows: combatantRows } = await pool.query(
      "SELECT * FROM combatants WHERE encounter_id = $1 AND unconscious = false AND disabled = false",
      [encounterId]
    );

    const nextPods = [];
    for (const pod of pods) {
      const counter = pod.counter - 1;
      if (counter > 0) {
        nextPods.push({ ...pod, counter });
        continue;
      }
      // Fires: anyone within POD_LINE_HIT_TOLERANCE of the line from the pod
      // out to podLineEnd(pod) takes flat clashPower damage. Always fires
      // its visual (see broadcastPodFx below), hit or not.
      const end = podLineEnd(pod);
      broadcastPodFx({ fromPos: { x: pod.x, y: pod.y }, toPos: end });
      for (const c of combatantRows) {
        if (c.kind === "mecha" || c.kind === "decoy" || c.kind === "plant" || c.kind === "ghost") continue; // Grit-only hazard, same as any other; a decoy only pops from a direct shot (see dealHit), not incidental splash
        if (c.current_grit === null) continue;
        if (distanceToSegment({ x: c.x, y: c.y }, pod, end) > POD_LINE_HIT_TOLERANCE) continue;
        const hit = await applyEnvironmentalDamage(c, pod.clashPower, pod.slugType, { by: pod.ownerId ?? null, via: "pod", slug: pod.slugName ?? null });
        await pushCombatLog(
          encounterId,
          `A steam pod erupts, catching ${c.name} in its blast -- ${hit.amount} Grit damage${hit.note}.`
        );
        // A red flash on the taken-damage player's own screen -- their own
        // client, not the map, so it reads even if they're not looking at
        // this particular corner of it. DM/NPCs have no ref_user_id to
        // notify, so this only ever reaches an actual player.
        if (c.kind === "character" && c.ref_user_id) {
          notifyUser(c.ref_user_id, { type: "combat-damage-flash", combatantId: c.id });
        }
        if (hit.newGrit === 0 && !c.unconscious) await triggerKnockoutRoll(c.id, "grit");
      }
      nextPods.push({ ...pod, counter: rollPodTimer() });
    }
    await pool.query("UPDATE encounters SET pods = $1 WHERE id = $2", [JSON.stringify(nextPods), encounterId]);
    // Pod damage doesn't otherwise reach clients until whatever later
    // broadcastEncounter call happens to follow (e.g. advanceTurn's own,
    // once the rest of the turn-start bookkeeping finishes) -- broadcast
    // right away so the Grit hit is visible the moment it lands, in step
    // with the fx above instead of trailing behind it.
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not tick pods:", err);
  }
}

// Regulator: a STAR_POINTS-segment star of fire walls radiating from the
// impact point. Anyone caught in a segment as it forms takes full
// clashPower damage, once -- after that the segments persist as ordinary
// walls (no further damage on touch). Unconditional on hit/miss, same
// trigger rule as Ice's patch/addTrailWall.
async function formStarWall(encounterId, point, slug, ownerId = null) {
  try {
    const segments = starSegments(point);
    const { rows } = await pool.query("SELECT walls, next_wall_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    let wallId = rows[0].next_wall_id;
    const walls = [...(rows[0].walls || [])];
    for (const seg of segments) {
      walls.push({ id: wallId, source: "slug", slugType: slug.type, ...seg });
      wallId += 1;
    }
    await pool.query("UPDATE encounters SET walls = $1, next_wall_id = $2 WHERE id = $3", [
      JSON.stringify(walls),
      wallId,
      encounterId,
    ]);

    const { rows: combatantRows } = await pool.query(
      "SELECT * FROM combatants WHERE encounter_id = $1 AND unconscious = false AND disabled = false",
      [encounterId]
    );
    for (const c of combatantRows) {
      if (c.kind === "mecha" || c.kind === "decoy" || c.kind === "plant" || c.kind === "ghost" || isBurrowed(c)) continue;
      if (c.current_grit === null) continue;
      // seg is {x1,y1,x2,y2} (starSegments' own shape) -- distanceToSegment
      // wants two {x,y} points, not the segment object itself.
      const caught = segments.some(
        (seg) => distanceToSegment({ x: c.x, y: c.y }, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }) <= STAR_HIT_TOLERANCE
      );
      if (!caught) continue;
      const hit = await applyEnvironmentalDamage(c, slug.clash_power, slug.type, { by: ownerId, via: "star", slug: slug.name });
      await pushCombatLog(encounterId, `The bursting star of fire walls catches ${c.name} -- ${hit.amount} Grit damage${hit.note}.`);
      if (hit.newGrit === 0 && !c.unconscious) await triggerKnockoutRoll(c.id, "grit");
    }

    await pushCombatLog(encounterId, `${slug.name} bursts into a star-shaped wall of fire!`);
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not form star wall:", err);
  }
}

// Anchorage: a zone that suppresses knockback and wall-breaking for anyone
// inside it, for ANCHOR_DURATION_ROUNDS rounds. Unconditional on hit/miss,
// same trigger rule as Ice's patch. Tagged kind: "anchor" so isInsideAnyZone
// checks elsewhere (knockback, wall-breaking) don't also trip on a
// differently-kinded zone sharing the same `zones` array/lifecycle, e.g.
// Cynosure's disarm field below.
async function addAnchorZone(encounterId, point) {
  try {
    const { rows } = await pool.query("SELECT zones, next_zone_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const zoneId = rows[0].next_zone_id;
    const zones = [
      ...(rows[0].zones || []),
      { id: zoneId, kind: "anchor", x: point.x, y: point.y, radius: ANCHOR_RADIUS, turnsLeft: ANCHOR_DURATION_ROUNDS },
    ];
    await pool.query("UPDATE encounters SET zones = $1, next_zone_id = $2 WHERE id = $3", [
      JSON.stringify(zones),
      zoneId + 1,
      encounterId,
    ]);
    await pushCombatLog(encounterId, "A shimmering field settles over the ground -- nothing here can be knocked back or broken.");
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not add anchor zone:", err);
  }
}

// Cynosure: a lingering electromagnetic field, same shape/lifecycle as
// Anchorage's zone (radius/duration, ticked down by the same tickZones
// below) but tagged kind: "disarm" -- checked every affected combatant's
// own turn in advanceTurn (see tickStatusEffects' insideDisarmZone param),
// not against a one-off action like knockback/wall-break.
async function addDisarmZone(encounterId, point) {
  try {
    const { rows } = await pool.query("SELECT zones, next_zone_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const zoneId = rows[0].next_zone_id;
    const zones = [
      ...(rows[0].zones || []),
      { id: zoneId, kind: "disarm", x: point.x, y: point.y, radius: DISARM_ZONE_RADIUS, turnsLeft: DISARM_ZONE_DURATION_ROUNDS },
    ];
    await pool.query("UPDATE encounters SET zones = $1, next_zone_id = $2 WHERE id = $3", [
      JSON.stringify(zones),
      zoneId + 1,
      encounterId,
    ]);
    await pushCombatLog(encounterId, "The air crackles -- a standing electromagnetic field settles over the ground, frying any blaster inside it.");
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not add disarm zone:", err);
  }
}

// Lentus: a lingering crosswind hazard, same shape/lifecycle as Anchorage's/
// Cynosure's zones but tagged kind: "crosswind" -- bends the course of ANY
// shot (anyone's, not just Lentus's own) whose path passes through it, see
// the crosswind check in the shoot route below.
async function addCrosswindZone(encounterId, point) {
  try {
    const { rows } = await pool.query("SELECT zones, next_zone_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const zoneId = rows[0].next_zone_id;
    const zones = [
      ...(rows[0].zones || []),
      { id: zoneId, kind: "crosswind", x: point.x, y: point.y, radius: CROSSWIND_ZONE_RADIUS, turnsLeft: CROSSWIND_ZONE_DURATION_ROUNDS },
    ];
    await pool.query("UPDATE encounters SET zones = $1, next_zone_id = $2 WHERE id = $3", [
      JSON.stringify(zones),
      zoneId + 1,
      encounterId,
    ]);
    await pushCombatLog(encounterId, "A swirling crosswind kicks up over the ground -- any shot flying through it risks veering wildly off course.");
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not add crosswind zone:", err);
  }
}

// Ticks every zone's duration down by 1 (once per full round -- see
// advanceTurn's `wrapped` branch), dropping any that expire. Kind-agnostic
// -- Anchorage's and Cynosure's zones share this same lifecycle, they just
// mean different things while they're up (see their own `kind` tag).
async function tickZones(encounterId) {
  try {
    const { rows } = await pool.query("SELECT zones FROM encounters WHERE id = $1", [encounterId]);
    const zones = rows[0]?.zones || [];
    if (zones.length === 0) return;
    const next = zones.map((z) => ({ ...z, turnsLeft: z.turnsLeft - 1 })).filter((z) => z.turnsLeft > 0);
    await pool.query("UPDATE encounters SET zones = $1 WHERE id = $2", [JSON.stringify(next), encounterId]);
  } catch (err) {
    console.error("Could not tick zones:", err);
  }
}

// Ice and damage hazard patches fade after HAZARD_DURATION_ROUNDS full rounds
// (once per round, same hook as tickZones). A patch with no turnsLeft yet
// (laid before this rule existed) starts its countdown from the full duration.
async function tickHazards(encounterId) {
  try {
    const { rows } = await pool.query("SELECT hazards FROM encounters WHERE id = $1", [encounterId]);
    const hazards = rows[0]?.hazards || [];
    if (hazards.length === 0) return;
    const next = hazards
      .map((h) => ({ ...h, turnsLeft: (h.turnsLeft ?? HAZARD_DURATION_ROUNDS) - 1 }))
      .filter((h) => h.turnsLeft > 0);
    await pool.query("UPDATE encounters SET hazards = $1 WHERE id = $2", [JSON.stringify(next), encounterId]);
  } catch (err) {
    console.error("Could not tick hazards:", err);
  }
}

// ---- Carnivorous bloom (Necrobloom's summons_plant) -------------------------
// A stationary "plant" combatant on the summoner's side. See PLANT_* in
// combatRules.js. It never joins the turn order (nothing adds a mid-fight row
// to it), has no knockout pips, and is deleted when its Grit hits 0.
async function spawnCarnivorousPlant(owner, slug, point, kind = "plant") {
  const { rows } = await pool.query(
    `INSERT INTO combatants (encounter_id, kind, name, x, y, max_ap, current_ap, max_grit, current_grit, data, team)
     VALUES ($1, $8, $2, $3, $4, 0, 0, $5, $5, $6, $7)
     RETURNING *`,
    [
      owner.encounter_id,
      kind === "ghost" ? "Phantom" : "Carnivorous Bloom",
      point.x,
      point.y,
      PLANT_MAX_GRIT,
      JSON.stringify({
        ownerId: owner.id,
        ownerName: owner.name,
        slugName: slug.name,
        slugType: slug.type,
        clashPower: slug.clash_power,
        biteRange: PLANT_BITE_RANGE,
      }),
      combatSide(owner),
      kind,
    ]
  );
  return rows[0];
}

// One bite: the summoning slug's clash power as flat Grit damage plus its
// element's DoT (Toxic poisons), logged and, if it drops them, a knockout roll.
// Returns true if the victim went down.
async function plantBite(plant, victim) {
  const fresh = await getCombatant(victim.id);
  if (!fresh || fresh.unconscious || fresh.disabled || fresh.current_grit === null) return true;
  const hit = await applyEnvironmentalDamage(fresh, Math.max(1, plant.data?.clashPower ?? 1), plant.data?.slugType ?? "Toxic", {
    by: plant.data?.ownerId ?? null,
    via: "plant",
    slug: plant.data?.slugName ?? null,
  });
  await pushCombatLog(
    plant.encounter_id,
    plant.kind === "ghost"
      ? `${plant.name} wails and rakes a ghostly chill through ${fresh.name} -- ${hit.amount} Grit damage${hit.note}.`
      : `${plant.name} lunges and bites ${fresh.name} -- ${hit.amount} Grit damage${hit.note}.`
  );
  if (hit.newGrit === 0 && !fresh.unconscious) {
    await triggerKnockoutRoll(fresh.id, "grit");
    return true;
  }
  return false;
}

// A bloom or ghost bites a mover whose path from `fromPos` to where they are now goes into,
// out of, or straight through its bite range (see pathCrossesRange) -- once per summon per move.
// Standing beside one, or shuffling about inside its reach, never sets it off. Called after a
// Move, a fear flee, a knockback/pull and a grapple reel; with no `fromPos` it does nothing.
// A `fleeing` slinger that starts inside the reach is always bitten as they bolt, even when a
// wall or the map edge cuts the run short and they end up still inside it.
async function plantBites(combatant, { fromPos = null, fleeing = false } = {}) {
  if (!combatant || combatant.unconscious || combatant.disabled || combatant.current_grit === null) return;
  if (["plant", "ghost", "decoy", "mecha"].includes(combatant.kind)) return;
  const { rows: plants } = await pool.query("SELECT * FROM combatants WHERE encounter_id = $1 AND kind IN ('plant', 'ghost') AND current_grit > 0", [combatant.encounter_id]);
  for (const plant of plants) {
    if (areAllies(plant, combatant)) continue;
    const range = plant.data?.biteRange ?? PLANT_BITE_RANGE;
    const at = { x: plant.x, y: plant.y };
    if (!fromPos) continue;
    const fledFromReach = fleeing && distance(at, fromPos) <= range;
    if (!fledFromReach && !pathCrossesRange(at, fromPos, { x: combatant.x, y: combatant.y }, range)) continue;
    if (await plantBite(plant, combatant)) break;
  }
  await broadcastEncounter(combatant.encounter_id);
}

// A bloom that has just sprouted bites every enemy already standing in reach.
async function plantBiteNearby(plant) {
  const { rows } = await pool.query(
    "SELECT * FROM combatants WHERE encounter_id = $1 AND kind NOT IN ('plant', 'ghost', 'decoy', 'mecha') AND unconscious = false AND disabled = false AND current_grit IS NOT NULL",
    [plant.encounter_id]
  );
  const range = plant.data?.biteRange ?? PLANT_BITE_RANGE;
  for (const c of rows) {
    if (areAllies(plant, c)) continue;
    if (distance({ x: plant.x, y: plant.y }, { x: c.x, y: c.y }) > range) continue;
    await plantBite(plant, c);
  }
  await broadcastEncounter(plant.encounter_id);
}

// A shot landing on a bloom: plain Grit damage (power with the element's power
// modifier, triples and the like -- no statuses, knockback or knockout roll).
// At 0 Grit it dies and is removed.
async function damagePlant(encounterId, shooter, plant, slug, { half = false } = {}) {
  if (slug.type === "Healing" && !slug.random_statuses) return `${plant.name} shrugs off the healing light.`;
  const tb = slugBallistics(slug);
  let amount = Math.max(0, slug.clash_power + tb.powerMod * (slug.power_doubled ? POWER_SURGE_MULTIPLIER : 1));
  if (slug.damage_tripled) amount *= CLASH_TRIPLE_MULTIPLIER;
  if (slug.ambush_tripled && shooter.status_effects?.invisible) amount *= CLASH_TRIPLE_MULTIPLIER;
  if (slug.dual?.damageMult > 1) amount = Math.floor(amount * slug.dual.damageMult);
  if (half) amount = Math.floor(amount / 2);
  const before = plant.current_grit ?? 0;
  const left = Math.max(0, before - amount);
  await recordCombatEvent(encounterId, "damage", {
    actor: shooter,
    target: plant,
    amount: Math.min(amount, before),
    overkill: Math.max(0, amount - before),
    via: "direct",
    slug: slug.name,
    slugType: slug.type,
    kill: left === 0 && before > 0,
  });
  if (left === 0) {
    await pool.query("DELETE FROM combatants WHERE id = $1", [plant.id]);
    await broadcastEncounter(encounterId);
    return plant.kind === "ghost" ? `${plant.name} takes ${amount} damage and dissipates!` : `${plant.name} takes ${amount} damage and withers away!`;
  }
  await updateCombatant(plant.id, { current_grit: left });
  return `${plant.name} takes ${amount} damage (${left}/${plant.max_grit} Grit left).`;
}

// Panaceon's random_statuses: picks RANDOM_STATUS_COUNT distinct effects -- all harmful at an enemy,
// all helpful (`positive`) at an ally or yourself -- from the matching pool
// and writes each onto `nextStatus` the same way the dedicated flags do. Returns each
// one's log label.
function applyRandomStatuses(nextStatus, slug, shooter, positive = false, count = RANDOM_STATUS_COUNT) {
  const pool_ = [...(positive ? RANDOM_STATUS_POSITIVE : RANDOM_STATUS_NEGATIVE)];
  const picked = [];
  while (picked.length < count && pool_.length > 0) {
    picked.push(pool_.splice(Math.floor(Math.random() * pool_.length), 1)[0]);
  }
  for (const key of picked) {
    if (key === "burn") nextStatus.burning = { turnsLeft: BURN_DURATION_TURNS, damage: computeBurnDamage(slug.clash_power), by: shooter.id };
    else if (key === "poison") nextStatus.poison = { stacks: (nextStatus.poison?.stacks || 0) + 1, turnsLeft: POISON_DURATION_TURNS, by: shooter.id };
    else if (key === "blind") nextStatus.blinded = true;
    else if (key === "snare") nextStatus.snared = { turnsLeft: SNARE_DURATION_TURNS };
    else if (key === "shock") nextStatus.shocked = true;
    else if (key === "stun") nextStatus.stunned = { ap: computeStunAp(slug.clash_power) };
    else if (key === "jam") nextStatus.jammed = true;
    else if (key === "fear") nextStatus.feared = { x: shooter.x, y: shooter.y };
    else if (key === "confusion") nextStatus.confused = { turnsLeft: CONFUSION_DURATION_TURNS };
    else if (key === "disarm") nextStatus.disarmed = { turnsLeft: DISARM_DURATION_TURNS };
    else if (key === "reversedDirection") nextStatus.reversedDirection = { turnsLeft: MIND_SCRAMBLE_DURATION_TURNS };
    else if (key === "slowedReaction") nextStatus.slowedReaction = { turnsLeft: MIND_SCRAMBLE_DURATION_TURNS };
    else if (key === "slippery") nextStatus.slippery = { turnsLeft: SLIPPERY_DURATION_TURNS };
    else if (key === "marked") nextStatus.marked = true;
    else if (key === "bleed") nextStatus.bleeding = { turnsLeft: BLEED_DURATION_TURNS, by: shooter.id };
    else if (key === "regen") nextStatus.regen = { turnsLeft: REGEN_DURATION_TURNS, amount: computeRegenAmount(slug.clash_power), by: shooter.id };
    else if (key === "keenVision") nextStatus.keenVision = true;
    else if (key === "enhancedReaction") nextStatus.enhancedReaction = { turnsLeft: MIND_SCRAMBLE_DURATION_TURNS };
    // "invisible" is applied by the caller, after a hit's usual reveal -- see dealHit.
  }
  return { keys: picked, labels: picked.map((k) => RANDOM_STATUS_LABELS[k]) };
}

// Mirage Coil: self-targeted, spawns DECOY_COUNT lightweight combatant rows
// (kind: "decoy") next to the owner. They mimic the owner's position on
// every Move (see /actions/move) and the owner's own shots visually (see
// causes_jam-style broadcast in the shoot route) but have no real stats --
// a shot "landing" on one just pops it (see dealHit's decoy branch). Hitting
// the real owner clears all remaining decoys at once (see
// clearMirageDecoys below).
async function spawnMirageDecoys(owner) {
  const decoyIds = [];
  for (let i = 0; i < DECOY_COUNT; i++) {
    // Rolled per decoy and stored on the decoy row -- moveDecoysWith reads it
    // back so each one tracks the owner from its own scattered spot.
    const offset = randomDecoyOffset();
    const { rows } = await pool.query(
      // max_grit/current_grit are copied from the owner (not left null) so
      // the token's Grit ring reads full/healthy instead of the 0%-red ring
      // a null maxGrit produces -- a decoy is meant to be visually
      // indistinguishable from the real thing, not obviously fake.
      `INSERT INTO combatants (encounter_id, kind, name, portrait, x, y, max_ap, current_ap, max_grit, current_grit, data)
       VALUES ($1, 'decoy', $2, $3, $4, $5, 0, 0, $6, $7, $8)
       RETURNING *`,
      [
        owner.encounter_id,
        `${owner.name} (mirage)`,
        owner.portrait,
        owner.x + offset.dx,
        owner.y + offset.dy,
        owner.max_grit,
        owner.current_grit,
        JSON.stringify({ decoyOwnerId: owner.id, offset }),
      ]
    );
    decoyIds.push(rows[0].id);
  }
  return decoyIds;
}

// Removes every decoy tied to `ownerCombatantId` (used both when a decoy is
// popped down to none and when the real owner is hit -- see dealHit).
async function removeDecoys(encounterId, decoyIds) {
  if (!decoyIds || decoyIds.length === 0) return;
  await pool.query("DELETE FROM combatants WHERE id = ANY($1::int[])", [decoyIds]);
}

// Arcling's static_mark, second half: whenever this slug deals damage to
// anyone, MARK_SPLASH_FRACTION of that same hit's Grit damage also lands on
// every OTHER `marked` combatant in the encounter (global -- no radius, no
// proximity check, matching the source text exactly), excluding the
// combatant that was just hit directly (they already took their own full
// hit) and the shooter themselves. Mecha/decoys are skipped -- marking is a
// Grit-only status, same as every other status effect here. Returns the
// per-target log fragments for the caller to fold into its own single
// combined log line, rather than pushing its own combat-log entries (which
// would land out of order relative to the primary hit's own line).
async function applyMarkedSplash(encounterId, shooterId, primaryTargetId, amount, electric = false) {
  const splashAmount = Math.floor(amount * MARK_SPLASH_FRACTION);
  if (splashAmount <= 0) return [];
  const { rows } = await pool.query(
    "SELECT * FROM combatants WHERE encounter_id = $1 AND unconscious = false AND disabled = false",
    [encounterId]
  );
  const notes = [];
  for (const c of rows) {
    if (c.id === primaryTargetId || c.id === shooterId) continue;
    if (c.kind === "mecha" || c.kind === "decoy" || c.kind === "plant" || c.kind === "ghost" || isBurrowed(c)) continue;
    if (!c.status_effects?.marked) continue;
    if (c.current_grit === null) continue;
    const { riderDamage, note: absorbNote } = await absorbRiderDamage(c, splashAmount, { electric });
    const newGrit = Math.max(0, c.current_grit - riderDamage);
    const updated = await updateCombatant(c.id, { current_grit: newGrit });
    await syncCharacterFromCombatant(updated);
    await recordCombatEvent(encounterId, "damage", {
      actor: { id: shooterId, name: null },
      target: c,
      amount: Math.min(riderDamage, c.current_grit),
      overkill: Math.max(0, riderDamage - c.current_grit),
      via: "splash",
      kill: newGrit === 0 && c.current_grit > 0,
    });
    notes.push(`${c.name} takes ${riderDamage} from the static arc${newGrit === 0 ? " and is at 0 Grit!" : ""}${absorbNote}`);
    if (newGrit === 0 && !c.unconscious) await triggerKnockoutRoll(c.id, "grit");
  }
  return notes;
}

// The core damage/heal/trait/wall-break/knockback resolver, shared by normal
// hits, clash outcomes, chained hits, and ram. Re-fetches fresh rows so it's
// safe to call after an arbitrary delay (a counter window can take seconds).
async function dealHit(
  encounterId,
  shooterCombatantId,
  targetCombatantId,
  slug,
  {
    half = false,
    windowMs = 0,
    firedAt,
    isSplash = false,
    originPos = null,
    isRicochetLeg = false,
    mindScrambleEffect = null,
    frictionEffect = null,
    statTag = null,
    // True when this hit is the outcome of a counter-clash (see resolveCounterOffer) -- Metal's
    // uncountered bonus doesn't apply then.
    countered = false,
  } = {}
) {
  const shooter = await getCombatant(shooterCombatantId);
  const target = await getCombatant(targetCombatantId);
  if (!shooter || !target) return "the target is no longer there.";
  // Battle Report attribution: how this particular hit reached its target.
  const via = statTag || (isRicochetLeg ? "ricochet" : half ? "chain" : isSplash ? "splash" : "direct");
  const statSlug = { slug: slug.name, slugType: slug.type };
  // Knockback (below) shoves the target directly away from wherever the
  // shot actually came from -- normally that's just the shooter's own
  // position, but a ricocheted leg (Speedstinger) is visually launched from
  // the *previous* target's position while shooterCombatantId stays the
  // real, original owner throughout (energy/cooldown/recharge always belong
  // to them). originPos lets a caller override "where this leg's bolt
  // started" independently of who owns the slug -- see resolveNormalHit/
  // resolveCounterOffer, which pass offer.attackerPos or offer.targetPos.
  const knockbackOrigin = originPos || { x: shooter.x, y: shooter.y };

  // Mirage Coil: a shot resolved against a decoy never actually lands --
  // the decoy just pops (revealing it was fake), no damage. Popping one
  // decoy doesn't end the mirage (see the real-owner branch below for
  // that) -- it just shrinks the illusion by one.
  if (target.kind === "decoy") {
    const ownerId = target.data?.decoyOwnerId;
    if (ownerId) {
      const owner = await getCombatant(ownerId);
      if (owner) {
        const remaining = (owner.status_effects?.mirage?.decoyIds || []).filter((id) => id !== target.id);
        const nextStatus = { ...(owner.status_effects || {}) };
        if (remaining.length > 0) nextStatus.mirage = { decoyIds: remaining };
        else delete nextStatus.mirage;
        await updateCombatant(owner.id, { status_effects: JSON.stringify(nextStatus) });
      }
    }
    await removeDecoys(encounterId, [target.id]);
    await broadcastEncounter(encounterId);
    return `it was a decoy! ${target.name} vanishes in a shimmer.`;
  }

  // A carnivorous bloom (Necrobloom's summons_plant): plain Grit damage, no
  // statuses, no knockback, no knockout roll -- at 0 Grit it's simply destroyed.
  if (target.kind === "plant" || target.kind === "ghost") return await damagePlant(encounterId, shooter, target, slug, { half });

  let log;
  // Healing (and None) don't go through the normal Grit/Structure damage
  // resolution below at all -- but a Healing slug can still be flagged
  // aoe_blast (Sapheart: "heals all slingers in its range"), so instead of
  // returning immediately it just sets skipDamageResolution and falls
  // through to the aoe_blast splash block at the end of this function.
  let skipDamageResolution = false;

  if (slug.type === "Healing" && !slug.random_statuses && slug.heal_over_time) {
    // Heal over time: no instant heal -- leaves a `regen` status that restores
    // Grit at the start of each of the target's own next turns instead (see
    // REGEN_DURATION_TURNS / tickStatusEffects). Re-applying refreshes it and
    // keeps the stronger per-turn amount.
    const perTurn = computeRegenAmount(slug.clash_power);
    const regenStatus = {
      ...(target.status_effects || {}),
      regen: { turnsLeft: REGEN_DURATION_TURNS, amount: Math.max(perTurn, target.status_effects?.regen?.amount ?? 0), by: shooter.id },
    };
    await updateCombatant(target.id, { status_effects: JSON.stringify(regenStatus) });
    log = `${target.name} is bathed in a restorative glow -- they'll recover ${perTurn} Grit at the start of each of their next ${REGEN_DURATION_TURNS} turns.`;
    skipDamageResolution = true;
  } else if (slug.type === "Healing" && !slug.random_statuses) {
    const amount = slug.clash_power * HEAL_POWER_MULTIPLIER;
    const newGrit = Math.min(target.max_grit ?? amount, (target.current_grit ?? 0) + amount);
    const updated = await updateCombatant(target.id, { current_grit: newGrit });
    await syncCharacterFromCombatant(updated);
    const healed = newGrit - (target.current_grit ?? 0);
    await recordCombatEvent(encounterId, "heal", {
      actor: shooter,
      target,
      amount: healed,
      overheal: Math.max(0, amount - healed),
      source: "slug",
      slug: slug.name,
    });
    log = `${target.name} is healed for ${amount} Grit.`;
    skipDamageResolution = true;
  }

  const tb = slugBallistics(slug);
  // slug.clash_power already has its loyalty tier's modifier folded in (see
  // applyLoyaltyToSlug) by the time it reaches here -- this, the Healing
  // amount above, and every burn/cone/hazard/pod calc below that reads
  // slug.clash_power all get the effective number for free, with no extra
  // loyalty lookup needed at each of those sites.
  // A surged shot (see applyPowerSurgeToSlug) has its power doubled after every
  // other modifier, so the type's own powerMod is doubled along with it.
  // Meduslug's unconditional x3, Thermal Shock-style dual combos and the chain
  // arc's half all live in slugBaseHitAmount (shared with the auto-counter forecast).
  // Gloomstalk: an ambush from the dark -- triple damage while its shooter is invisible
  // (see causes_invisible). Only an actual attack: a shot at yourself is the self-buff.
  const ambushed = Boolean(slug.ambush_tripled && shooter.status_effects?.invisible && shooter.id !== target.id);
  let amount = slugBaseHitAmount(slug, { ambushed, half });
  // Metal hits harder when nobody got a counter in.
  const metalBonus = slugHasType(slug, "Metal") && !countered && !skipDamageResolution;
  if (metalBonus) amount = Math.round(amount * METAL_UNCOUNTERED_MULTIPLIER);
  const metalNote = metalBonus ? " (Metal, uncountered -- +25%)" : "";

  if (skipDamageResolution) {
    // fall through to the aoe_blast block below
  } else if (target.kind === "mecha") {
    const armor = target.data?.armor ?? 0;
    // Electricity fries circuitry -- double whatever damage actually reaches
    // Structure (applied after armor, so armor still does its job first).
    const electricMult = slugHasType(slug, "Electricity") ? ELECTRIC_MECHA_DAMAGE_MULTIPLIER : 1;
    const dmg = Math.max(0, amount - armor) * electricMult;
    const newStructure = Math.max(0, (target.current_structure ?? 0) - dmg);
    await updateCombatant(target.id, { current_structure: newStructure });
    // Fame: the raw clash_power of whatever landed (not the armor/electric-
    // modified `dmg`), plus overkill -- damage beyond the Structure the
    // mecha had left. See the matching character-branch comment below.
    if (shooter.id !== target.id && shooter.kind === "character" && shooter.ref_user_id) {
      const mechaOverkill = Math.max(0, dmg - (target.current_structure ?? 0));
      const mechaFameGain = slug.clash_power + mechaOverkill;
      if (mechaFameGain > 0) await grantFame(shooter.ref_user_id, mechaFameGain);
    }
    await recordCombatEvent(encounterId, "damage", {
      actor: shooter,
      target,
      amount: Math.min(dmg, target.current_structure ?? 0),
      overkill: Math.max(0, dmg - (target.current_structure ?? 0)),
      structure: true,
      via,
      kill: newStructure === 0 && (target.current_structure ?? 0) > 0,
      ...statSlug,
    });
    log = `${target.name} takes ${dmg} Structure damage${electricMult > 1 ? " (Electricity -- doubled)" : ""}${metalNote}.`;
    if (newStructure === 0) {
      await disableMecha(target.id);
      log += ` ${target.name} is disabled!`;
    }
  } else {
    // A self-targeted shot (Thugglet's invisibility, Mirage Coil's decoys,
    // or a custom buff slug fired at yourself) is a pure self-buff -- it
    // applies whatever it does but never costs the shooter Grit, and none
    // of a type's own negative traits (burn/poison/snare/stun/blind) or the
    // analogous "Causes X" flags should land on the shooter just because
    // their slug's *type* happens to carry one (e.g. Mirage Coil is Light,
    // whose trait is "blind"; Thugglet is Psychic, whose trait is "stun").
    // Computed up front, before any of those checks, so every one of them
    // can gate on it -- same rule causes_jam already followed further down.
    const isSelfTarget = shooter.id === target.id;
    // Panaceon thrown at an ally: a friendly brew, not an attack -- no damage, only helpful effects.
    const isSupportBrew = Boolean(slug.random_statuses && !isSelfTarget && areAllies(shooter, target));
    let gritDamage = isSelfTarget || isSupportBrew ? 0 : amount;
    // A mounted rider's mecha soaks 75% of the hit as Structure.
    let riderAbsorbNote = "";
    if (!isSelfTarget && !isSupportBrew) {
      const split = await absorbRiderDamage(target, gritDamage, {
        electric: slugHasType(slug, "Electricity"),
        stat: { actor: shooter, via, ...statSlug },
        pierceShield: Boolean(slug.pierces_shield),
      });
      gritDamage = split.riderDamage;
      riderAbsorbNote = split.note;
    }
    const newGrit = Math.max(0, (target.current_grit ?? 0) - gritDamage);
    const nextStatus = { ...(target.status_effects || {}) };
    // Burn/poison don't hit right now -- they land at the start of the
    // target's own next turn (see tickStatusEffects, called from
    // advanceTurn). Snare fully blocks Move (see /actions/move) instead of
    // costing extra AP.
    const wasBurning = Boolean(target.status_effects?.burning);
    const wasDoused = slugHasTrait(slug, "douse") && wasBurning;
    let burnDamage = 0;
    if ((slugHasTrait(slug, "burn") || slug.causes_burn) && !isSelfTarget) {
      // Doesn't stack -- a fresh Fire hit just refreshes the duration and
      // recalculates the damage off this hit's own clashPower. (Wildfire's
      // dual-shot combo doubles it -- burnMult.)
      burnDamage = computeBurnDamage(slug.clash_power) * (slug.dual?.burnMult ?? 1);
      nextStatus.burning = { turnsLeft: BURN_DURATION_TURNS, damage: burnDamage, by: shooter.id };
    }
    let poisonStacks = 0;
    if (slugHasTrait(slug, "poison") && !isSelfTarget) {
      // Stacks -- each poisoning hit adds a stack (more damage/turn) and
      // resets the shared duration back to the full length. A dual-shot combo
      // can add more than one at once (poisonStacks).
      poisonStacks = (nextStatus.poison?.stacks || 0) + (slug.dual?.poisonStacks ?? 1) * (slug.potent_poison ? POTENT_POISON_MULTIPLIER : 1);
      nextStatus.poison = { stacks: poisonStacks, turnsLeft: POISON_DURATION_TURNS, by: shooter.id };
    }
    if (slugHasTrait(slug, "snare") && !isSelfTarget) nextStatus.snared = { turnsLeft: SNARE_DURATION_TURNS };
    // Perplexus's mind_scramble replaces Psychic's own baseline stun
    // entirely (see the block below) -- without this gate it'd just be a
    // strictly-better Psychic slug, stun plus a bonus effect.
    // Stun is the Psychic trait or a causes_stun flag (same status either way), applied once: the target
    // loses half this hit's damage in AP next turn, adding to any stun they already carry.
    let stunApLost = 0;
    if (!isSelfTarget && ((slugHasTrait(slug, "stun") && !slug.mind_scramble && !slug.emotion_surge) || slug.causes_stun)) {
      stunApLost = stunApOf(nextStatus.stunned) + computeStunAp(amount);
      nextStatus.stunned = { ap: stunApLost };
    }
    if (slugHasTrait(slug, "blind") && !isSelfTarget) nextStatus.blinded = true;
    if (slugHasTrait(slug, "douse")) delete nextStatus.burning;
    // Perplexus -- 3 debuffs fired at someone else, 2 buffs fired at
    // yourself (isSelfTarget picks the pool, not a !isSelfTarget gate like
    // every flag below). mindScrambleEffect (the shoot route's own
    // offer.effectChoice, threaded in as this option) is only trusted if
    // it's actually legal for whichever pool applies here -- an NPC fired
    // without the client's picker, or a mismatched/missing choice, falls
    // back to a random pick from that same pool instead.
    let mindScrambleResult = "";
    if (slug.mind_scramble) {
      const pool = isSelfTarget ? MIND_SCRAMBLE_SELF_EFFECTS : MIND_SCRAMBLE_ENEMY_EFFECTS;
      mindScrambleResult = pool.includes(mindScrambleEffect) ? mindScrambleEffect : pool[Math.floor(Math.random() * pool.length)];
      if (mindScrambleResult === "reverse") nextStatus.reversedDirection = { turnsLeft: MIND_SCRAMBLE_DURATION_TURNS };
      if (mindScrambleResult === "darkness") nextStatus.blinded = true;
      if (mindScrambleResult === "slow") nextStatus.slowedReaction = { turnsLeft: MIND_SCRAMBLE_DURATION_TURNS };
      if (mindScrambleResult === "enhance") nextStatus.enhancedReaction = { turnsLeft: MIND_SCRAMBLE_DURATION_TURNS };
      if (mindScrambleResult === "vision") nextStatus.keenVision = true;
    }
    // Tesser: on a landed hit, the shooter and the target slinger instantly
    // trade map positions -- captured before either write lands (shooter's
    // own updateCombatant call right here, target's folded into the big
    // status_effects write below) so the two don't race each other or read
    // back an already-moved position.
    const swapsPosition = Boolean(slug.swaps_position && !isSelfTarget);
    const shooterOldPos = { x: shooter.x, y: shooter.y };
    const targetOldPos = { x: target.x, y: target.y };
    // If the target was riding a mecha and the shooter is on foot, the swap
    // doesn't just trade spots -- the shooter lands in the saddle and the
    // target is thrown clear. The mecha itself doesn't move (it's already at
    // targetOldPos, which is exactly where the shooter is warping to).
    const stealsMount = swapsPosition && target.mounted_on != null && shooter.mounted_on == null;
    if (swapsPosition) {
      await updateCombatant(shooter.id, {
        x: targetOldPos.x,
        y: targetOldPos.y,
        ...(stealsMount ? { mounted_on: target.mounted_on } : {}),
      });
    }
    // Psi: friction_shift, always a debuff (no self-target branch, unlike
    // Perplexus's split pools) -- picks between rooting the target in place
    // (reuses `snared` outright) or making them personally slippery for a
    // few of their own Moves (see the ICE_SLIP_CHANCE check in
    // /actions/move). Same offer.effectChoice/random-fallback convention as
    // Perplexus's mind_scramble.
    let frictionResult = "";
    if (slug.friction_shift && !isSelfTarget) {
      frictionResult = FRICTION_EFFECTS.includes(frictionEffect)
        ? frictionEffect
        : FRICTION_EFFECTS[Math.floor(Math.random() * FRICTION_EFFECTS.length)];
      if (frictionResult === "harsh") nextStatus.snared = { turnsLeft: SNARE_DURATION_TURNS };
      if (frictionResult === "slippery") nextStatus.slippery = { turnsLeft: SLIPPERY_DURATION_TURNS };
    }
    // Eunoa: emotion_surge, no choice/randomness involved, just isSelfTarget
    // deciding which pair of effects lands -- fired at yourself stacks BOTH
    // of Perplexus's buffs at once (keenVision's advantage+range-waiver and
    // enhancedReaction's longer counter window), which is already stronger
    // than Perplexus's pick-one-buff version without needing new, larger
    // constants of its own. Fired at someone else stacks BOTH of
    // Perplexus's "someone else" debuffs that don't step on trait defaults
    // here (darkness/blind and reversed reasoning of confusion), reusing
    // `confused` and `blinded` exactly as they already exist.
    if (slug.emotion_surge) {
      if (isSelfTarget) {
        nextStatus.keenVision = true;
        nextStatus.enhancedReaction = { turnsLeft: MIND_SCRAMBLE_DURATION_TURNS };
      } else {
        nextStatus.confused = { turnsLeft: CONFUSION_DURATION_TURNS };
        nextStatus.blinded = true;
      }
    }
    // Arcling: static_mark tags whoever it hits with a persistent `marked`
    // status (no duration -- the source text never mentions it wearing
    // off, so it just lasts the rest of the encounter). The other half of
    // the ability -- 25% of *any* damage this same slug deals splashing to
    // every other marked combatant -- runs after the main hit lands below,
    // once gritDamage/newGrit are known (see applyMarkedSplash).
    if (slug.static_mark && !isSelfTarget) nextStatus.marked = true;
    // Heal over time fired at yourself (any type): a self-buff, same
    // isSelfTarget convention as Thugglet's invisibility. See computeRegenAmount.
    const regenPerTurn = slug.heal_over_time && isSelfTarget ? computeRegenAmount(slug.clash_power) : 0;
    if (regenPerTurn > 0) {
      nextStatus.regen = { turnsLeft: REGEN_DURATION_TURNS, amount: Math.max(regenPerTurn, nextStatus.regen?.amount ?? 0), by: shooter.id };
    }
    // Mirage Coil -- the real owner (never a decoy; those are intercepted
    // above before reaching here) taking any hit collapses the whole
    // illusion at once, unlike a decoy being hit (which only pops that one
    // decoy, see the decoy branch near the top of this function).
    let mirageLog = "";
    if (nextStatus.mirage) {
      await removeDecoys(encounterId, nextStatus.mirage.decoyIds);
      delete nextStatus.mirage;
      mirageLog = ` The mirage collapses -- ${target.name}'s decoys vanish!`;
    }
    // Per-slug flags that opt a type without the trait by default into it --
    // same "Causes X" pattern as causes_knockback. Shock is its own status,
    // distinct from Psychic's stun: it skips the target's entire next turn
    // (see advanceTurn) rather than costing 1 AP. All gated on !isSelfTarget
    // (declared above) -- same reasoning as the type-trait checks above and
    // causes_jam below: a self-targeted shot is a pure self-buff.
    if (slug.causes_blind && !isSelfTarget) nextStatus.blinded = true;
    if (slug.causes_snare && !isSelfTarget) nextStatus.snared = { turnsLeft: SNARE_DURATION_TURNS };
    if (slug.causes_shock && !isSelfTarget) nextStatus.shocked = true;
    // causes_stun is handled with the Psychic stun above (same status, any element).
    // Madicus: a bleed -- a fresh one resets the 3 turns (it doesn't stack).
    if (slug.causes_bleed && !isSelfTarget) nextStatus.bleeding = { turnsLeft: BLEED_DURATION_TURNS, by: shooter.id };
    // Panaceon: RANDOM_STATUS_COUNT distinct effects, rolled fresh on every hit.
    const randomRoll = slug.random_statuses ? applyRandomStatuses(nextStatus, slug, shooter, isSelfTarget || isSupportBrew, isSelfTarget ? RANDOM_STATUS_SELF_COUNT : RANDOM_STATUS_COUNT) : { keys: [], labels: [] };
    const randomStatusLabels = randomRoll.labels;
    // Fries the target's blaster regardless of hit/miss (see resolveNormalHit
    // for the miss case) -- consumed the next time they attempt to fire, see
    // /actions/shoot.
    if (slug.causes_jam && !isSelfTarget) nextStatus.jammed = true;
    // Cynosure -- fries the target's blaster for their next turn (a
    // turn-counted lockout, not causes_jam's single guaranteed misfire); see
    // DISARM_DURATION_TURNS and the disarmed check in /actions/shoot.
    if (slug.causes_disarm && !isSelfTarget) nextStatus.disarmed = { turnsLeft: DISARM_DURATION_TURNS };
    // Frightgeist -- records *where the shot came from*, not just that fear
    // landed, so advanceTurn knows which direction to run the target away
    // from when their turn comes up (see FEAR_FLEE_AP_EQUIVALENT there).
    if (slug.causes_fear && !isSelfTarget) nextStatus.feared = { x: shooter.x, y: shooter.y };
    // Fandango -- only the combatant actually hit gets confused; it's a
    // debuff on *their* future shots, not a field-wide effect (see
    // CONFUSION_CHANCE/confusedDeflection in the shoot route).
    if (slug.causes_confusion && !isSelfTarget) nextStatus.confused = { turnsLeft: CONFUSION_DURATION_TURNS };
    // Thugglet, self-targeted only -- hides the token from every other
    // player (see CombatMap.jsx) until it's consumed below by getting hit
    // (any hit, not just an AOE splash -- "AOE reveals" is just the general
    // rule, applied) or its own duration runs out (tickStatusEffects). Firing
    // it at someone else does nothing but the jam above -- invisibility is a
    // self-buff, not something you'd inflict on a target.
    if (slug.causes_invisible && isSelfTarget) nextStatus.invisible = { turnsLeft: INVISIBLE_DURATION_TURNS };
    // Any hit -- from any slug, not just an AOE blast -- reveals an
    // invisible target; getting struck gives your position away regardless
    // of what actually hit you.
    if (nextStatus.invisible && !slug.causes_invisible) delete nextStatus.invisible;
    // ...except a brew that rolled invisibility itself, which lands after that reveal.
    if (randomRoll.keys.includes("invisible")) nextStatus.invisible = { turnsLeft: INVISIBLE_DURATION_TURNS };
    // Mirage Coil, self-targeted only (same isSelfTarget convention as
    // Thugglet's invisibility) -- the actual decoy rows get spawned further
    // down, after this combatant's own status_effects write lands, so their
    // ids are on hand to store into it.
    const spawnMirage = Boolean(slug.mirage_decoy && isSelfTarget);

    const updated = await updateCombatant(target.id, {
      current_grit: newGrit,
      // A self-buff isn't "taking damage" -- don't let it trip anything that
      // keys off having been hit this turn (hunker eligibility, etc.).
      damaged_this_turn: isSelfTarget || isSupportBrew ? target.damaged_this_turn : true,
      status_effects: JSON.stringify(nextStatus),
      ...(swapsPosition ? { x: shooterOldPos.x, y: shooterOldPos.y } : {}),
      ...(stealsMount ? { mounted_on: null } : {}),
    });
    await syncCharacterFromCombatant(updated);
    if (!isSelfTarget && !isSupportBrew) {
      const hpBefore = target.current_grit ?? 0;
      const applied = Math.min(gritDamage, hpBefore);
      await recordCombatEvent(encounterId, "damage", {
        actor: shooter,
        target,
        amount: applied,
        raw: amount,
        overkill: gritDamage - applied,
        via,
        kill: newGrit === 0 && hpBefore > 0 && !target.unconscious,
        ...statSlug,
      });
      for (const key of NEGATIVE_STATUS_KEYS) {
        if (nextStatus[key] && JSON.stringify(nextStatus[key]) !== JSON.stringify(target.status_effects?.[key])) {
          await recordCombatEvent(encounterId, "status", { actor: shooter, target, status: key, ...statSlug });
        }
      }
    }
    // Fame: the raw clash_power of whatever slug landed (not the type/
    // triple/dual-modified `amount`, and not the post-mecha-soak
    // `gritDamage` for the power term) -- a bigger slug earns more on its
    // own, no need to model "restraint" separately -- plus overkill, damage
    // beyond what the target had left. No Fame for a self-buff.
    if (!isSelfTarget && !isSupportBrew && shooter.kind === "character" && shooter.ref_user_id) {
      const overkill = Math.max(0, gritDamage - (target.current_grit ?? 0));
      const fameGain = slug.clash_power + overkill;
      if (fameGain > 0) await grantFame(shooter.ref_user_id, fameGain);
    }
    // Duskfang: a vampiric hit heals its own shooter, flat clash_power,
    // whenever it actually lands real damage -- same gate as the Fame hook
    // just above (no self-buff, no support brew, no healing off a hit that
    // dealt nothing). Capped at the shooter's own max Grit like any other heal.
    // Hacksaw: a non-Healing heal_over_time slug that lands on someone else is
    // an ordinary attack (its type's own damage/traits above) that also leaves
    // a regen on its own shooter -- the mirror of firing it at yourself.
    // Refreshes rather than stacks, keeping the stronger per-turn amount.
    let shooterRegenPerTurn = 0;
    if (slug.heal_over_time && slug.type !== "Healing" && !isSelfTarget && !isSupportBrew) {
      shooterRegenPerTurn = computeRegenAmount(slug.clash_power);
      const freshShooter = (await getCombatant(shooter.id)) ?? shooter;
      const shooterStatus = { ...(freshShooter.status_effects || {}) };
      shooterStatus.regen = {
        turnsLeft: REGEN_DURATION_TURNS,
        amount: Math.max(shooterRegenPerTurn, shooterStatus.regen?.amount ?? 0),
        by: shooter.id,
      };
      await updateCombatant(shooter.id, { status_effects: JSON.stringify(shooterStatus) });
    }
    let lifeDrainHealed = 0;
    if (slug.life_drain && !isSelfTarget && !isSupportBrew && gritDamage > 0 && shooter.current_grit != null) {
      const healAmount = slug.clash_power;
      const shooterNewGrit = Math.min(shooter.max_grit ?? shooter.current_grit, shooter.current_grit + healAmount);
      lifeDrainHealed = shooterNewGrit - shooter.current_grit;
      if (lifeDrainHealed > 0) {
        const updatedShooter = await updateCombatant(shooter.id, { current_grit: shooterNewGrit });
        await syncCharacterFromCombatant(updatedShooter);
        await recordCombatEvent(encounterId, "heal", {
          actor: shooter,
          target: shooter,
          amount: lifeDrainHealed,
          overheal: Math.max(0, healAmount - lifeDrainHealed),
          source: "lifedrain",
          slug: slug.name,
        });
      }
    }
    log = isSupportBrew
      ? `${shooter.name}'s ${slug.name} washes over ${target.name}.`
      : isSelfTarget
      ? `${shooter.name} braces behind ${slug.name}.${mirageLog}`
      : `${target.name} takes ${gritDamage} Grit damage${metalNote}${newGrit === 0 ? " and is at 0 Grit!" : ""}.${riderAbsorbNote}${mirageLog}${ambushed ? " It strikes from the dark -- triple damage!" : ""}`;
    if (shooterRegenPerTurn > 0) {
      log += ` ${shooter.name} is bathed in a restorative glow -- they'll recover ${shooterRegenPerTurn} Grit at the start of each of their next ${REGEN_DURATION_TURNS} turns.`;
    }
    if (lifeDrainHealed > 0) {
      log += ` ${shooter.name}'s ${slug.name} drains ${lifeDrainHealed} Grit back to them.`;
    }

    // Arcling: 25% of this same hit's damage also splashes onto every other
    // marked combatant, global, no radius -- see applyMarkedSplash.
    if (slug.static_mark) {
      const markNotes = await applyMarkedSplash(encounterId, shooter.id, target.id, gritDamage, slugHasType(slug, "Electricity"));
      if (markNotes.length > 0) log += ` Static arcs to the marked: ${markNotes.join(", ")}.`;
    }

    // Mirage Coil, self-targeted -- the real slinger also blurs to a fresh
    // random spot as the decoys appear, so anyone who watched where they were
    // standing can't just keep firing at that spot. Move the owner first,
    // then spawn the decoys scattered around the *new* position, then layer
    // the mirage entry on top of the just-written status_effects.
    if (spawnMirage) {
      const mapRow = (await pool.query("SELECT map_width, map_height FROM encounters WHERE id = $1", [encounterId])).rows[0];
      const shifted = clampToMapBounds(
        scatterPoint({ x: updated.x, y: updated.y }, DECOY_MAX_RADIUS),
        mapRow?.map_width ?? 1600,
        mapRow?.map_height ?? 900
      );
      const movedOwner = await updateCombatant(target.id, { x: shifted.x, y: shifted.y });
      const decoyIds = await spawnMirageDecoys(movedOwner);
      await updateCombatant(target.id, {
        status_effects: JSON.stringify({ ...(movedOwner.status_effects || {}), mirage: { decoyIds } }),
      });
      log += ` ${DECOY_COUNT} decoys shimmer into being as ${target.name} blurs aside!`;
    }

    // The status effect itself never deals damage on this same hit (see
    // tickStatusEffects) -- without an explicit log line here, inflicting
    // one reads as if nothing happened until it actually ticks on the
    // target's next turn.
    if ((slugHasTrait(slug, "burn") || slug.causes_burn) && !isSelfTarget) {
      log += ` ${target.name} catches fire -- ${burnDamage} Grit damage at the start of each of their next ${BURN_DURATION_TURNS} turns.`;
    }
    if (slugHasTrait(slug, "poison") && !isSelfTarget) {
      log += ` ${target.name} is poisoned (${poisonStacks * POISON_DAMAGE_PER_STACK} Grit/turn until cured with First Aid${poisonStacks > 1 ? `, ${poisonStacks} stacks` : ""}).`;
    }
    if (slugHasTrait(slug, "snare") && !isSelfTarget) {
      log += ` ${target.name} is snared -- can't Move on their next turn.`;
    }
    if (stunApLost > 0) {
      log += ` ${target.name} is stunned -- they'll lose ${stunApLost} AP on their next turn.`;
    }
    if (slugHasTrait(slug, "blind") && !isSelfTarget) {
      log += ` ${target.name} is blinded -- their next attack roll has disadvantage.`;
    }
    if (mindScrambleResult) {
      log += ` ${target.name}'s mind scrambles -- ${MIND_SCRAMBLE_EFFECT_LABELS[mindScrambleResult]}.`;
    }
    if (swapsPosition) {
      log += ` ${shooter.name} and ${target.name} swap places in a flicker of light!`;
      if (stealsMount) {
        log += ` ${shooter.name} materializes in the saddle -- ${target.name} is thrown to the ground!`;
      }
    }
    if (frictionResult) {
      log += ` ${target.name}'s friction shifts -- ${FRICTION_EFFECT_LABELS[frictionResult]}.`;
    }
    if (wasDoused) {
      log += ` The water douses ${target.name}'s flames.`;
    }
    if (slug.causes_blind && !isSelfTarget && !slugHasTrait(slug, "blind")) {
      log += ` ${target.name} is blinded -- their next attack roll has disadvantage.`;
    }
    if (slug.causes_snare && !isSelfTarget && !slugHasTrait(slug, "snare")) {
      log += ` ${target.name} is snared -- can't Move on their next turn.`;
    }
    if (slug.causes_shock && !isSelfTarget) {
      log += ` ${target.name} is shocked -- their entire next turn is skipped.`;
    }
    if (randomStatusLabels.length > 0) {
      log += isSelfTarget || isSupportBrew
        ? ` A restorative brew settles on ${target.name}: ${randomStatusLabels.join(", ")}.`
        : ` A volatile brew splashes ${target.name}: ${randomStatusLabels.join(", ")}.`;
    }
    if (slug.causes_bleed && !isSelfTarget) {
      log += ` ${target.name} is bleeding -- 10% of their max Grit at the start of each of their next ${BLEED_DURATION_TURNS} turns.`;
    }
    if (slug.causes_jam && !isSelfTarget) {
      log += ` ${target.name}'s blaster is fried -- their next shot misfires.`;
    }
    if (slug.causes_disarm && !isSelfTarget) {
      log += ` ${target.name}'s blaster is disabled -- they can't Shoot Slug on their next turn.`;
    }
    if (slug.causes_fear && !isSelfTarget) {
      log += ` ${target.name} is terrified -- their entire next turn is spent fleeing.`;
    }
    if (slug.causes_confusion && !isSelfTarget) {
      log += ` ${target.name} is rattled -- their own shots risk firing wildly off target for ${CONFUSION_DURATION_TURNS} turns.`;
    }
    if (slug.causes_invisible && isSelfTarget) {
      log += ` ${target.name} fades from sight.`;
    }
    if (regenPerTurn > 0) {
      log += ` ${target.name} begins to regenerate -- ${regenPerTurn} Grit at the start of each of their next ${REGEN_DURATION_TURNS} turns.`;
    }

    if (slug.stalls_slugs && !isSelfTarget) {
      const stalled = await stallTargetSlugs(target);
      if (stalled > 0) log += ` ${target.name}'s slugs are thrown into disarray -- ${stalled} slug${stalled === 1 ? "" : "s"} go on cooldown (or stay out a turn longer).`;
    }

    // Water also soaks the target's energy: one live pip off a random one of their slugs.
    if (slugHasTrait(slug, "douse") && !isSelfTarget) {
      const drainedName = await drainRandomEnergyPip(target);
      if (drainedName) log += ` The water seeps into ${target.name}'s gear -- ${drainedName} loses an energy pip.`;
    }

    if (slugHasTrait(slug, "recharge")) {
      // Overcharge (Energy in a dual shot) refunds 2 pips instead of 1.
      for (let i = 0; i < (slug.dual?.refundPips ?? 1); i++) {
        const rechargedName = await rechargeAnotherSlug(shooter.ref_user_id, shotSlugIds(slug));
        if (rechargedName) log += ` ${shooter.name}'s ${rechargedName} recovers an energy pip.`;
      }
    }

    // Electricity's own trait, or any slug flagged causes_chain (Speedstinger
    // generalizes this to a non-Electricity type -- see
    // docs/combat-system-design.md's "Bespoke unique-slug mechanics"). Never
    // on a ricochet leg's own hit -- Speedstinger's fast chain bolt is
    // strictly the lightning-arc effect on the *primary* hit; without this,
    // the ricocheted shot landing on its own target would re-trigger a
    // second, unwanted chain arc off of *that* hit too.
    if ((slugHasTrait(slug, "chain") || slug.causes_chain) && !half && !isSplash && !isRicochetLeg) {
      const chainTarget = await findChainTarget(encounterId, target.id, shooter.id);
      if (chainTarget) {
        // A fast, forced-yellow bolt -- purely visual, no counter offer (the
        // arc calls dealHit directly below, same as it always has).
        broadcastChainFx({ fromPos: { x: target.x, y: target.y }, toPos: { x: chainTarget.x, y: chainTarget.y } });
        // Conduction (Water+Electricity) arcs at full power; isSplash then
        // stops that full-power hit re-arcing, since `half` no longer does.
        const chainLog = await dealHit(
          encounterId,
          shooter.id,
          chainTarget.id,
          slug,
          slug.dual?.chainFull ? { isSplash: true } : { half: true }
        );
        log += ` It arcs to ${chainTarget.name}: ${chainLog}`;
      }
    }

    let knockedIntoWall = false;
    // Metal/Earth always shove on hit; any other type only does if its
    // template has causes_knockback ticked -- see slugKnockbackDistance.
    const kbDistance = isSelfTarget || slug.grapple ? 0 : shotKnockbackDistance(slug); // a bludgeon sets melee_knockback
    if (kbDistance > 0) {
      const encRow = (await pool.query("SELECT walls, zones, map_width, map_height FROM encounters WHERE id = $1", [encounterId])).rows[0];
      // Anchorage's zone suppresses knockback entirely for anyone inside it.
      if (isInsideAnyZone(encRow?.zones, { x: target.x, y: target.y }, "anchor")) {
        log += ` ${target.name} doesn't budge -- something is anchoring them in place!`;
      } else {
        const kb = knockbackTarget(knockbackOrigin, { x: target.x, y: target.y }, withMapEdges(encRow?.walls, encRow?.map_width, encRow?.map_height), kbDistance);
        scheduleKnockback(encounterId, target.id, kb.point, windowMs, firedAt);
        if (kb.hitWall) {
          log += ` ${target.name} is knocked into a wall!`;
          knockedIntoWall = true;
        }
        // A shove that catches a mounted rider has a flat chance of throwing
        // them out of the saddle -- the rider tumbles off (and gets shoved by
        // the scheduled knockback above), the mecha holds its ground.
        if (target.mounted_on != null && Math.random() < KNOCKBACK_DISMOUNT_CHANCE) {
          await updateCombatant(target.id, { mounted_on: null });
          log += ` ${target.name} is knocked clean out of the saddle!`;
        }
      }
    }
    // Phantasmo: on a landed Attack a ghost manifests beside the target (see
    // spawnCarnivorousPlant/plantBites -- the same 50-Grit haunter as a bloom, as a ghost).
    // Never from a splash/chain/ricochet leg, and never beside another summon.
    let newGhost = null;
    if (slug.summons_ghost && !isSelfTarget && !half && !isSplash && !isRicochetLeg && target.kind !== "plant" && target.kind !== "ghost") {
      const encRow = (await pool.query("SELECT walls, map_width, map_height FROM encounters WHERE id = $1", [encounterId])).rows[0];
      const here = { x: target.x, y: target.y };
      const angle = Math.random() * Math.PI * 2;
      let spot = { x: here.x + Math.cos(angle) * GHOST_SPAWN_OFFSET, y: here.y + Math.sin(angle) * GHOST_SPAWN_OFFSET };
      const wallHit = firstWallHit(here, spot, encRow?.walls || []);
      if (wallHit) {
        const t = Math.max(0, wallHit.hit.t - 0.05);
        spot = { x: here.x + (spot.x - here.x) * t, y: here.y + (spot.y - here.y) * t };
      }
      spot = clampToMapBounds(spot, encRow?.map_width ?? 1600, encRow?.map_height ?? 900);
      newGhost = await spawnCarnivorousPlant(shooter, slug, spot, "ghost");
      log += ` A ghost manifests beside ${target.name}!`;
    }
    // Grapple (Arachnet): a landed Attack hooks the target and reels them toward
    // the shooter -- in place of any shove away (see kbDistance above). Only the
    // primary hit does it, never a splash/chain/ricochet leg, and a mecha or a
    // mounted rider is too heavy to drag. See grappleDestination.
    if (slug.grapple && !isSelfTarget && !half && !isSplash && !isRicochetLeg && target.kind !== "mecha" && target.mounted_on == null) {
      const encRow = (await pool.query("SELECT walls, zones, map_width, map_height FROM encounters WHERE id = $1", [encounterId])).rows[0];
      if (isInsideAnyZone(encRow?.zones, { x: target.x, y: target.y }, "anchor")) {
        log += ` ${target.name} doesn't budge -- something is anchoring them in place!`;
      } else {
        const pull = grappleDestination({ x: target.x, y: target.y }, knockbackOrigin, withMapEdges(encRow?.walls, encRow?.map_width, encRow?.map_height));
        if (pull.moved >= 1) {
          scheduleKnockback(encounterId, target.id, pull.point, windowMs, firedAt);
          log += ` ${slug.name}'s line hooks ${target.name} and reels them ${Math.round(pull.moved)} units toward ${shooter.name}!`;
        }
      }
    }
    // A hard wall impact can knock a target out on its own, independent of
    // whether Grit also hit 0 on this same hit -- see
    // docs/combat-system-design.md §5/§7. Only one roll ever fires per hit:
    // grit-hits-0 takes priority for the reason text when both are true.
    if (newGrit === 0 && !isSelfTarget && !isSupportBrew && !target.unconscious) {
      await triggerKnockoutRoll(target.id, knockedIntoWall ? "knockback" : "grit");
    } else if (knockedIntoWall && !target.unconscious) {
      await triggerKnockoutRoll(target.id, "knockback");
    }
    // A freshly manifested ghost haunts anyone already in reach (the target, usually).
    if (newGhost) await plantBiteNearby(newGhost);
  }

  // AOE Blast: everyone else within AOE_RADIUS of the target takes the same
  // hit too, at full effect (not halved like a chain arc). Each splash hit
  // is its own automatic dealHit -- no attack roll, no counter-clash, and
  // isSplash keeps it from re-triggering AOE/chain off of itself.
  if (slug.aoe_blast && !isSplash) {
    const nearby = await findAoeTargets(encounterId, { x: target.x, y: target.y }, [shooter.id, target.id], aoeRadiusMult(slug));
    for (const other of nearby) {
      const splashLog = await dealHit(encounterId, shooter.id, other.id, slug, { windowMs, firedAt, isSplash: true });
      log += ` The blast also catches ${other.name}: ${splashLog}`;
    }
  }

  // Thornlash: not a circular splash -- the primary target already took a
  // full, ordinary hit above. A cone of spikes then fans out *beyond* the
  // impact point, continuing the shot's own line of travel (apex = the
  // target's position, "from" = wherever the shot came from), dealing
  // CONE_DAMAGE_FRACTION of clashPower to anyone else it catches.
  if (slug.cone_blast && !isSplash) {
    const apex = { x: target.x, y: target.y };
    const { rows: coneCandidates } = await pool.query(
      "SELECT * FROM combatants WHERE encounter_id = $1 AND id != $2 AND id != $3 AND unconscious = false AND disabled = false",
      [encounterId, shooter.id, target.id]
    );
    const coneAmount = Math.max(1, Math.round(slug.clash_power * CONE_DAMAGE_FRACTION));
    for (const c of coneCandidates) {
      if (c.kind === "decoy" || c.kind === "plant" || c.kind === "ghost" || isBurrowed(c)) continue; // decoys only pop from a direct hit, see dealHit
      if (c.current_grit === null && c.current_structure === null) continue;
      if (!pointInCone(apex, knockbackOrigin, { x: c.x, y: c.y }, CONE_HALF_ANGLE_DEG, CONE_LENGTH)) continue;
      // A Healing slug's cone mends instead of hurting -- same reduced fraction
      // of its power, straight onto Grit (a Structure-only mecha has none to mend).
      if (slug.type === "Healing" && !slug.random_statuses) {
        if (c.current_grit === null) continue;
        const mended = Math.min(c.max_grit ?? c.current_grit, c.current_grit + coneAmount * HEAL_POWER_MULTIPLIER);
        const updatedCone = await updateCombatant(c.id, { current_grit: mended });
        await syncCharacterFromCombatant(updatedCone);
        log += ` The healing light also reaches ${c.name} -- ${mended - c.current_grit} Grit restored.`;
        continue;
      }
      const hit = await applyEnvironmentalDamage(c, coneAmount, slug.type, { by: shooter, via: "cone", slug: slug.name });
      log += ` The cone of spikes also catches ${c.name} -- ${hit.amount} Grit damage${hit.note}.`;
      if (hit.newGrit === 0 && !c.unconscious) await triggerKnockoutRoll(c.id, "grit");
    }
  }

  return log;
}

// The shot's visual: a projectile from attackerPos to impactPoint, timed to
// take `windowMs * SHOT_FLIGHT_MULTIPLIER` -- so a clash (if any) always
// lands right at the end of the flight, the same moment the reaction window
// (which now runs the whole flight) would have closed.
// Positions are the ones snapshotted at fire time, independent of whatever
// dealHit() mutates afterward (knockback, etc.), and impactPoint is already
// clamped to the shot's actual range -- the client never learns *why* a shot
// fell short, only where.
//
// Used two ways, both keyed by the same offer.fxId so the client can tell
// they're the same shot:
//  - The LAUNCH broadcast (outcome: null) fires immediately when the shot is
//    fired -- this is what starts the bolt flying and the sound playing, at
//    the exact instant the player clicks, regardless of whether a counter is
//    still pending. It renders as an ordinary (uncountered) flight until a
//    resolve update says otherwise.
//  - The JAM broadcast (outcome: "jam") is the one case that's fully
//    self-contained and immediate -- a misfire is rolled up front, before
//    any launch, so nothing ever flies for it.
function broadcastShotFx(fx) {
  broadcastAll({
    type: "combat-shot-fx",
    fx: {
      id: fx.fxId,
      attackerId: fx.attackerCombatantId,
      targetId: fx.targetCombatantId,
      attackerPos: fx.attackerPos,
      targetPos: fx.targetPos,
      impactPoint: fx.impactPoint,
      slugType: fx.slug.type,
      // The slug's own name, so the client can play a slug-specific sound
      // (Zeus's thunderclap) -- the type alone ("Electricity") isn't unique
      // to it.
      slugName: fx.slug.name || null,
      // Lets every client start fetching the slug's art (a second chance to
      // warm the cache if the earlier slug-armed signal was missed).
      slugId: fx.slug.id ?? null,
      windowMs: fx.windowMs,
      // This shot's own windup share (see shotWindupFraction) -- undefined
      // for synthetic effects with no real weapon/distance behind them (the
      // chain arc, a pod blast), which fall back to the client's default.
      windupFraction: fx.windupFraction,
      countered: Boolean(fx.countered),
      counterSlugType: fx.counterSlugType || null,
      outcome: fx.outcome,
      // True when the miss was already decided at launch: the bolt flies the
      // deflected trajectory from the start instead of veering at a late reveal.
      preMissed: Boolean(fx.preMissed),
      // Lets the client draw a blast-radius-sized burst instead of the
      // normal small one -- an AOE slug always explodes at full size,
      // hit or miss (see the miss branch of resolveNormalHit below).
      aoe: Boolean(fx.slug.aoe_blast),
      // Novaflare's massive_aoe: the burst is drawn this many times the normal radius.
      aoeScale: aoeRadiusMult(fx.slug),
      // A Mega Morph shot's bolt is drawn as a teardrop, not the usual circle.
      mega: Boolean(fx.slug.mega_morphed),
      // Pentalux: on a hit the bolt splits into five that circle the target and strike from five directions.
      split: Boolean(fx.slug.surrounds_target),
      // A dual shot: the second element (its bolt shows both colours) and the
      // partner slug's id, so clients can prefetch its art too.
      secondaryType: fx.slug.secondary_type ?? null,
      partnerSlugId: fx.slug.dual?.partnerId ?? null,
    },
  });
}

// The chain arc's own visual -- a quick, forced-yellow bolt distinct from a
// normal slug's own type-colored one, matching why it isn't counterable (it
// resolves immediately, synchronously, in dealHit -- there's no window for
// anyone to react to). Self-contained: no launch/resolve split like a normal
// shot needs, since the outcome is already known the instant this fires.
const CHAIN_FX_MS = 350;
function broadcastChainFx({ fromPos, toPos }) {
  broadcastAll({
    type: "combat-shot-fx",
    fx: {
      id: `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      attackerId: null,
      targetId: null,
      attackerPos: fromPos,
      targetPos: toPos,
      impactPoint: toPos,
      slugType: null,
      windowMs: CHAIN_FX_MS,
      countered: false,
      counterSlugType: null,
      outcome: "hit",
      aoe: false,
      chain: true,
    },
  });
}

// Pressure Tick's pod firing -- unlike the chain arc's traveling bolt, this
// draws instantly (the line + arrowhead just appear, they don't fly out),
// lingers fully visible, then fades -- see the fx.pod branch in
// CombatMap.jsx's ShotEffect. Same self-contained, non-counterable
// broadcast pattern as the chain arc otherwise (the outcome's already
// known, there's no window for anyone to react). See tickPods.
const POD_FX_MS = 1200;
function broadcastPodFx({ fromPos, toPos }) {
  broadcastAll({
    type: "combat-shot-fx",
    fx: {
      id: `pod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      attackerId: null,
      targetId: null,
      attackerPos: fromPos,
      targetPos: toPos,
      impactPoint: toPos,
      slugType: null,
      windowMs: POD_FX_MS,
      countered: false,
      counterSlugType: null,
      outcome: "hit",
      aoe: false,
      pod: true,
    },
  });
}

// A failed ram (missed the target, or the mecha stalled out) -- reuses the
// slug-shot misfire treatment on the client: the "jam" outcome plays Fail.mp3
// and fires the red-border shake on the map (see CombatMap.jsx's shotFx
// effect). Self-contained, like the chain/pod broadcasts.
function broadcastRamFailFx({ fromPos, toPos }) {
  broadcastAll({
    type: "combat-shot-fx",
    fx: {
      id: `ram-fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      attackerId: null,
      targetId: null,
      attackerPos: fromPos,
      targetPos: toPos,
      impactPoint: toPos,
      slugType: null,
      slugName: null,
      windowMs: 450,
      countered: false,
      counterSlugType: null,
      outcome: "jam",
      aoe: false,
    },
  });
}

// The follow-up to a LAUNCH broadcast: arrives whenever the shot actually
// finishes resolving (immediately for an out-of-range/uncontested shot, or
// up to windowMs later for a shot that offered a counter) and tells the
// client what the already-playing animation should reveal -- without ever
// having delayed that animation's start.
function broadcastShotResolved(
  offer,
  { outcome, countered = false, counterSlugType = null, counterSlugName = null, impactPoint = null, clashPoint = null, counterAtMs = null, style = false }
) {
  broadcastAll({
    type: "combat-shot-resolved",
    resolved: { id: offer.fxId, outcome, countered, counterSlugType, counterSlugName, impactPoint, clashPoint, counterAtMs, style },
  });
}

// Delays `fn` until `firedAt + windowMs*SHOT_FLIGHT_MULTIPLIER` of real wall-
// clock time -- i.e. whenever the shot's flight/explosion animation would
// actually have finished playing, not "windowMs from right now". A shot
// resolved early (a defender countering well before their window closes, or
// a shoot request that just finishes computing fast) still waits out the
// rest of the flight; one resolved at or after that point (the counter
// timeout, or a slow request) doesn't wait any extra.
//
// Only the *reveal* (combat-shot-resolved's outcome/impactPoint, so the
// client knows which way a shot actually went) happens synchronously, right
// when it's determined -- everything that actually changes state because of
// it (damage, status effects, hazard placement, ejects, the Combat Log
// entry, the encounter broadcast) goes through this instead, so nothing
// updates on anyone's screen before the burst that's supposed to explain it
// has actually played.
function scheduleAfterFlight(firedAt, windowMs, fn) {
  const targetDelayMs = Math.max(0, (windowMs || 0) * SHOT_FLIGHT_MULTIPLIER);
  const elapsedSinceLaunch = Date.now() - (firedAt ?? Date.now());
  const delayMs = Math.max(0, targetDelayMs - elapsedSinceLaunch);
  setTimeout(() => {
    fn().catch((err) => console.error("Could not apply delayed shot effect:", err));
  }, delayMs);
}

// Slicksilver's pulls_metal: every wall and bridge a Metal-type slug built
// within METAL_PULL_RADIUS of `point` slides METAL_PULL_DISTANCE units toward it
// (less if it's already closer than that). DM-drawn walls have no material and
// never move, and anything standing inside an Anchorage zone is held in place.
async function pullMetalTerrain(encounterId, point, slug) {
  try {
    const { rows } = await pool.query("SELECT walls, bridges, zones FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const zones = rows[0].zones;
    // How far to shift something at `from` toward `point`, or null if it shouldn't move.
    const pullOffset = (from) => {
      const d = distance(from, point);
      if (d < 1 || d > METAL_PULL_RADIUS) return null;
      if (isInsideAnyZone(zones, from, "anchor")) return null;
      const step = Math.min(METAL_PULL_DISTANCE, d);
      return { dx: ((point.x - from.x) / d) * step, dy: ((point.y - from.y) / d) * step };
    };
    let wallsMoved = 0;
    const walls = (rows[0].walls || []).map((w) => {
      if (w.slugType !== "Metal") return w;
      const off = pullOffset({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
      if (!off) return w;
      wallsMoved += 1;
      return { ...w, x1: w.x1 + off.dx, y1: w.y1 + off.dy, x2: w.x2 + off.dx, y2: w.y2 + off.dy };
    });
    let bridgesMoved = 0;
    const bridges = (rows[0].bridges || []).map((b) => {
      if (b.slugType !== "Metal") return b;
      const off = pullOffset({ x: b.x, y: b.y });
      if (!off) return b;
      bridgesMoved += 1;
      return { ...b, x: b.x + off.dx, y: b.y + off.dy };
    });
    if (wallsMoved + bridgesMoved === 0) return;
    await pool.query("UPDATE encounters SET walls = $1, bridges = $2 WHERE id = $3", [JSON.stringify(walls), JSON.stringify(bridges), encounterId]);
    const parts = [];
    if (wallsMoved) parts.push(`${wallsMoved} metal wall${wallsMoved === 1 ? "" : "s"}`);
    if (bridgesMoved) parts.push(`${bridgesMoved} metal bridge${bridgesMoved === 1 ? "" : "s"}`);
    await pushCombatLog(encounterId, `${slug.name}'s magnetic pull drags ${parts.join(" and ")} toward the impact.`);
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not pull metal terrain:", err);
  }
}

// Every terrain mark a shot leaves at -- or, for a fire trail, along the way
// to -- wherever it actually ends up: ice/damage patches, Regulator's star
// of fire walls, Anchorage's zone, a fire trail, Pressure Tick's steam pods,
// Caligo's fire-terrain clear/steam patch, Cynosure's disarm field.
// `endPoint` is where the shot really stopped, which is the whole point of
// routing these through here rather than scheduling them at fire time: the
// target for an uncontested shot (or one that smashed through a counter),
// the fizzle point for one that fell short, or the clash point for one that
// lost -- or merely bounced off -- a counter and so never reached the
// target. A ricochet leg leaves nothing, matching fireSecondaryShot's
// deliberately effect-free bounce.
async function applyShotTerrain(offer, endPoint) {
  if (offer.isRicochetLeg) return;
  const { slug } = offer;
  const eid = offer.encounterId;
  if (slugHasTrait(slug, "ice")) await addIceHazard(eid, endPoint, slug.dual?.iceMult ?? 1);
  if (slug.hazard_maker) await addDamageHazard(eid, endPoint, slug, undefined, offer.attackerCombatantId);
  if (slug.trail_wall) await addTrailWall(eid, offer.attackerPos, endPoint, slug.type);
  if (slug.star_wall) await formStarWall(eid, endPoint, slug, offer.attackerCombatantId);
  if (slug.anchor_zone) await addAnchorZone(eid, endPoint);
  if (slug.spawns_pods) await spawnPods(eid, endPoint, slug, offer.attackerCombatantId);
  if (slug.clears_fire_terrain) await clearOrCreateSteamTerrain(eid, endPoint, slug);
  if (slug.disarm_zone) await addDisarmZone(eid, endPoint);
  if (slug.crosswind_zone) await addCrosswindZone(eid, endPoint);
  if (slug.pulls_metal) await pullMetalTerrain(eid, endPoint, slug);
}

// Same, deferred to land with the shot's own flight/burst rather than the
// instant it's computed. Used for every path except a countered shot, whose
// resolveCounterOffer is already running inside a post-flight callback and
// calls applyShotTerrain directly.
function scheduleShotTerrain(offer, endPoint) {
  scheduleAfterFlight(offer.firedAt, offer.windowMs, () => applyShotTerrain(offer, endPoint));
}

// Shared shot-resolution tail: broadcasts the launch, offers the target a
// counter if they have one available, otherwise resolves immediately.
// Factored out of /actions/shoot's own tail so Speedstinger's ricochet leg
// (a second, server-triggered "shot" -- see fireSecondaryShot below) can
// reuse the exact same offer-or-resolve logic a real player's shot goes
// through, instead of a parallel copy that could drift out of sync with it.
// Returns { pending: boolean } -- true if a counter was offered (and is now
// sitting in pendingCounters, resolved later by timeout or the defender's
// choice), false if it was resolved immediately inside this call.
async function getDungeonMasterIds() {
  const { rows } = await pool.query("SELECT id FROM users WHERE role = 'Dungeon Master'");
  return rows.map((r) => r.id);
}

// Runs the auto-counter forecast (autoCounter.js) for an NPC/grunt defender
// with the toggle on. Returns evaluateAutoCounter's decision.
async function decideAutoCounter(offer, target, eligible, canDodge) {
  const attacker = await getCombatant(offer.attackerCombatantId);
  return evaluateAutoCounter({
    incoming: offer.slug,
    attacker,
    defender: target,
    counters: eligible,
    canDodge,
    acrobaticsMod: combatantSkillMod(target, "acrobatics"),
    windowMs: offer.windowMs,
    attackRoll: offer.attackRoll,
  });
}

// Answers a pending counter offer on the defender's behalf once the decided
// delay has passed -- the same call a human click makes through
// /counters/:id/resolve, timestamped as if clicked then, so the clash point
// lands where a real reaction at that moment would.
function scheduleAutoReaction(offer, decision) {
  setTimeout(async () => {
    if (!pendingCounters.has(offer.fxId)) return;
    try {
      if (decision.action === "dodge") await resolveDodgeAttempt(offer.fxId);
      else await resolveCounterOffer(offer.fxId, decision.slugId, offer.firedAt + decision.delayMs);
    } catch (err) {
      console.error("Auto-counter reaction failed:", err);
    }
  }, decision.delayMs);
}

async function launchAndOfferCounter(offer) {
  const target = await getCombatant(offer.targetCombatantId);
  // The accuracy roll is made up front, before anything launches, so a shot
  // that's going to miss flies its missed (deflected) trajectory from the very
  // first frame and never opens a counter window -- there's nothing to counter
  // about a shot that won't land. A hit carries its roll on the offer
  // (attackRoll) so the counter/dodge/normal-hit resolution reuses it instead
  // of rolling a second time. A self-shot never rolls (it always lands).
  const shooter = target && offer.attackerCombatantId !== target.id ? await getCombatant(offer.attackerCombatantId) : null;
  if (shooter && target) {
    const attackRoll = await resolveAttackRoll(offer, shooter, target);
    if (attackRoll.attackTotal < attackRoll.dc) {
      const wallsRow = (await pool.query("SELECT walls FROM encounters WHERE id = $1", [offer.encounterId])).rows[0];
      const missPoint = missDeflection(offer.attackerPos, offer.impactPoint, wallsRow?.walls || []);
      const missedOffer = { ...offer, attackRoll, missPoint };
      // The launch itself already carries the miss: deflected impact point,
      // outcome "miss", preMissed so the client skips its late-reveal veer.
      broadcastShotFx({ ...missedOffer, impactPoint: missPoint, outcome: "miss", preMissed: true });
      await resolveNormalHit(missedOffer);
      return { pending: false };
    }
    offer = { ...offer, attackRoll };
  }
  broadcastShotFx({ ...offer, outcome: null });
  // A supportive slug (a heal, an inert None) is a boon, not an attack --
  // there's nothing to clash with, so it never offers the target a counter,
  // whoever it was aimed at. A self-targeted shot (a self-buff) is the same:
  // you don't clash with your own slug. Both go straight to resolution.
  // Meduslug's uncounterable is the same "never offers a counter" outcome
  // for a different reason -- its gaze locks the target in place before
  // they can even react, so the shot always resolves as a plain accuracy
  // roll (resolveNormalHit), never a clash.
  const isSelfShot = offer.attackerCombatantId === offer.targetCombatantId;
  // None of these gates make sense for Dodge either -- you don't dodge a
  // heal, your own buff, or Meduslug's gaze-lock.
  // A random-status brew thrown at an ally is a friendly toss, not an attack -- nothing to counter.
  const brewer = offer.slug.random_statuses ? await getCombatant(offer.attackerCombatantId) : null;
  const friendlyBrew = Boolean(brewer && target && areAllies(brewer, target));
  const reactionEligible = target && !isSupportiveSlug(offer.slug) && !isSelfShot && !friendlyBrew && !offer.slug.uncounterable;
  const eligible = reactionEligible ? await findEligibleCounterSlugs(target) : [];
  // A Dodge-only defender (no usable counter slug, but enough AP for the
  // flat Dodge cost) still gets a reaction window -- just without any slug
  // option in it. Re-validated for real in resolveDodgeAttempt; this copy is
  // only for whether to open the window and what to tell the client.
  const canDodge =
    reactionEligible &&
    !target.unconscious &&
    !target.disabled &&
    !(target.status_effects?.snared?.turnsLeft > 0) &&
    DODGE_AP_COST <= (target.current_ap || 0) &&
    combatantSkillMod(target, "acrobatics") > 0;
  if (target && (eligible.length > 0 || canDodge)) {
    // Perception: d20 + mod meeting PERCEPTION_DC and the target clocks the shot
    // the moment it's fired, so the prompt doesn't wait out the windup.
    const perceptionTotal = rollD20() + combatantSkillMod(target, "perception");
    const spottedEarly = perceptionTotal >= PERCEPTION_DC;
    // A player-controlled target answers their own counter; an NPC's (no
    // ref_user_id) is handed to the DM to answer on its behalf.
    const dmControlled = !target.ref_user_id;
    const recipients = dmControlled ? await getDungeonMasterIds() : [target.ref_user_id];

    // Auto-counter: the DM has handed this NPC/grunt's reaction to the server.
    // The forecast either picks a counter/dodge (answered below after a
    // human-ish delay, with no prompt sent) or decides it isn't worth it, in
    // which case the shot just resolves as a plain hit.
    const auto = dmControlled && target.kind === "npc" && target.data?.autoCounter ? await decideAutoCounter(offer, target, eligible, canDodge) : null;
    if (auto?.action === "none") {
      await resolveNormalHit(offer);
      return { pending: false };
    }

    // The grace lets a click made inside the window (and timestamped by the
    // client, see /counters/:id/resolve) still land after its network trip.
    const timeoutHandle = setTimeout(() => resolveCounterOffer(offer.fxId, null), offer.windowMs + COUNTER_LAG_COMP_MS);
    pendingCounters.set(offer.fxId, {
      ...offer,
      userId: target.ref_user_id,
      dmControlled,
      eligibleSlugRows: eligible,
      timeoutHandle,
    });

    const counterPayload = {
      type: "counter-offered",
      offer: {
        id: offer.fxId,
        windowMs: offer.windowMs,
        // How far into the window the offer already is as it's sent -- the
        // client counts from here (plus its own time since receipt) so its
        // bar and its reported reaction time match the server's clock
        // whatever the network delay.
        elapsedMs: Math.max(0, Date.now() - offer.firedAt),
        attackerName: offer.attackerName,
        slugName: offer.slug.name,
        slugType: offer.slug.type,
        // The incoming slug's id -- the prompt shows its transformed art,
        // already cached client-side from the slug-armed/shot-fx signals.
        slugId: offer.slug.id ?? null,
        // Dual shot: the second slug and element, plus the combo they make --
        // the prompt shows both slugs' art and names the combo.
        secondaryType: offer.slug.secondary_type ?? null,
        partnerSlugId: offer.slug.dual?.partnerId ?? null,
        primarySlugName: offer.slug.dual?.primaryName ?? null,
        partnerSlugName: offer.slug.dual?.partnerName ?? null,
        comboName: offer.slug.dual?.comboName ?? null,
        comboSummary: offer.slug.dual?.comboSummary ?? null,
        mega: Boolean(offer.slug.mega_morphed),
        // How much of the shot's fixed windup is still left -- the slug can't
        // be identified until it's out of the barrel and transformed, so the
        // prompt holds back until then (the window itself, windowMs, still
        // runs from launch and isn't extended).
        revealAfterMs: spottedEarly ? 0 : Math.max(0, SHOT_SLOW_PHASE_MS - (Date.now() - offer.firedAt)),
        // Who's being shot at -- the DM may be fielding counters for several
        // NPCs at once, so the prompt names the defender.
        defenderName: offer.targetName,
        forNpc: dmControlled,
        eligibleSlugs: eligible.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          clashPower: s.clash_power,
          clashDefense: s.clash_defense,
          apCost: s.ap_cost || 0,
          // Magazine slot the slug sits in (0-based). The counter prompt
          // shows slot+1 as the hotkey and lists slugs in this order, so it
          // lines up with the player's own slug panel.
          magazineSlot: s.magazine_slot,
        })),
        // The defender's leftover AP right now -- lets the prompt show what
        // a counter will cost against what they have.
        availableAp: target.current_ap || 0,
        canDodge,
        dodgeApCost: DODGE_AP_COST,
      },
    };
    if (auto) scheduleAutoReaction(offer, auto);
    else for (const recipientId of recipients) notifyUser(recipientId, counterPayload);

    await broadcastEncounter(offer.encounterId);
    await pushCombatLog(offer.encounterId, `${offer.attackerName} fires ${offer.slug.name} at ${offer.targetName}...`);
    if (spottedEarly) {
      await pushCombatLog(offer.encounterId, `${target.name} spots it the instant it's fired (${perceptionTotal} Perception)!`);
    }
    return { pending: true };
  }
  await resolveNormalHit(offer);
  return { pending: false };
}

// Fires `slug` at `target` as a fresh, independently-counterable shot, with
// the *visual* origin at `originPos` -- which for Speedstinger's ricochet is
// the previous target's own position, not the true shooter's. Ownership
// (whose slug this is, for energy/cooldown/recharge purposes) always stays
// with `attackerId`. `ricochetCount` is how many bounces deep this leg is
// (1 = the first carom off the primary hit); it rides along on the offer so
// maybeRicochet can stop the chain at RICOCHET_MAX_BOUNCES. Only ever used
// for ricochet legs, so unlike the main Attack flow it ignores weapon/type
// max range entirely -- a caroming bounce always reaches its chosen target
// unless a wall physically stops it.
// Sum of one numeric column (accuracy_bonus / reload_ap_bonus) across every
// mod equipped to this blaster. A DM-puppeted NPC's synthetic blaster has no
// real id (and no mods), so it contributes nothing.
async function blasterModTotal(blaster, column) {
  if (!Number.isInteger(blaster?.id)) return 0;
  const { rows } = await pool.query(`SELECT COALESCE(SUM(${column}), 0) AS total FROM mods WHERE equipped_blaster_id = $1`, [
    blaster.id,
  ]);
  return Number(rows[0].total);
}

// Sums every equipped mod's speed_bonus for this blaster and adds it to the
// weapon's own base speed stat (floored at 1 -- shotEffectiveSpeed divides
// by it, so it can never hit zero). A real, applied bonus, not just a
// cosmetic display number. A DM-puppeted NPC's synthetic blaster (see
// resolveShooterSlugAndBlaster) has no real id/mods to look up, so it's
// just returned as-is.
async function blasterEffectiveSpeed(blaster, shooter = null) {
  const base = await blasterBaseEffectiveSpeed(blaster);
  const mode = effectiveMode(shooter);
  if (!mode) return base;
  const { rows } = await pool.query("SELECT water FROM encounters WHERE id = $1", [shooter.encounter_id]);
  const inWater = isWaterAt(makeWaterSet(rows[0]?.water), { x: shooter.x, y: shooter.y });
  return Math.max(1, Math.round(base * modeBlasterSpeedFactor(mode, inWater)));
}

async function blasterBaseEffectiveSpeed(blaster) {
  if (!Number.isInteger(blaster.id)) return blaster.speed;
  const { rows } = await pool.query("SELECT COALESCE(SUM(speed_bonus), 0) AS bonus FROM mods WHERE equipped_blaster_id = $1", [
    blaster.id,
  ]);
  return Math.max(1, blaster.speed + Number(rows[0].bonus));
}

async function fireSecondaryShot({ encounterId, attackerId, attackerName, originPos, target, slug, blaster, walls, ricochetCount = 1 }) {
  const targetPos = { x: target.x, y: target.y };
  const dist = distance(originPos, targetPos);
  const wallHit = firstWallHit(originPos, targetPos, walls);
  const wallBlocks = Boolean(wallHit) && !slugHasTrait(slug, "phase");
  const wallDist = wallBlocks ? wallHit.hit.t * dist : Infinity;
  const stopDist = wallDist;
  const reaches = dist <= stopDist;
  const impactPoint = reaches ? targetPos : pointAtDistance(originPos, targetPos, stopDist);
  // shotFlightMs already bakes the shooter's own speed traits (ultra_fast,
  // Mega Morph) into the bolt's effective speed -- see slugWindowFactor
  // inside shotEffectiveSpeed. reactionWindowFactor is the *target's* own
  // slowedReaction/enhancedReaction, applied on top regardless.
  const speed = await blasterEffectiveSpeed(blaster, await getCombatant(attackerId));
  const rawWindowMs = shotFlightMs(dist, speed, slug);
  const windowMs = Math.round(rawWindowMs * reactionWindowFactor(target.status_effects));
  const fxId = `ricochet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const firedAt = Date.now();

  const offer = {
    fxId,
    firedAt,
    encounterId,
    attackerCombatantId: attackerId,
    targetCombatantId: target.id,
    attackerName,
    targetName: target.name,
    slug,
    blaster,
    attackerPos: originPos,
    targetPos,
    impactPoint,
    windowMs,
    windupFraction: shotWindupFraction(dist, speed, slug),
    // Flags this as a bounce (suppresses terrain marks + the chain arc on
    // its own hit -- see applyShotTerrain / dealHit); ricochetCount tracks
    // how deep the chain is so maybeRicochet can cap it.
    isRicochetLeg: true,
    ricochetCount,
  };

  if (!reaches) {
    broadcastShotFx({ ...offer, outcome: null });
    broadcastShotResolved(offer, { outcome: "out-of-range" });
    scheduleAfterFlight(firedAt, windowMs, async () => {
      await pushCombatLog(encounterId, `${slug.name} ricochets into a wall and stops.`);
      await broadcastEncounter(encounterId);
    });
    await broadcastEncounter(encounterId);
    return;
  }

  await launchAndOfferCounter(offer);
  await broadcastEncounter(encounterId);
}

// Speedstinger's ricochet (see causes_chain/ricochets in dealHit's docs):
// once a shot connects with a target (an uncountered hit OR miss, a countered
// one where the attacker still won the clash, or -- when Speedstinger is the
// *counter* slug and wins -- the reflected shot landing back on the
// attacker), the same full-power shot caroms on to the nearest other
// combatant, launched visually from that target's own position, with its own
// completely independent counter-clash opportunity.
//
// Bounces RICOCHET_MAX_BOUNCES times total: `offer.ricochetCount` is how many
// bounces produced THIS offer (0/undefined for the primary shot, 1 for the
// first carom, ...), and each new leg gets the next number. The chain also
// dies early if a leg hits a wall, loses a clash, or finds no valid target.
// Target selection ignores range ("always the closest"), never picks the
// shooter, and never the combatant just left -- so against a lone enemy it
// doesn't bounce at all ("finds no one else to hit").
//
// `ricochetSlug`/`shooterId`/`shooterName` default to the original shot's
// attacker + slug, but the counter path overrides all three: the bouncing
// slug is the defender's counter slug, and ownership (energy/cooldown, and
// who the next target is offered a counter against) stays with the defender.
// The bounced leg reuses offer.blaster purely as an accuracy proxy -- a
// counter clash carries no blaster of its own.
async function maybeRicochet(
  offer,
  hitTargetId,
  { ricochetSlug = offer.slug, shooterId = offer.attackerCombatantId, shooterName = offer.attackerName } = {}
) {
  const bouncesSoFar = offer.ricochetCount || 0;
  if (!ricochetSlug.ricochets || bouncesSoFar >= RICOCHET_MAX_BOUNCES) return;
  const bounceFrom = await getCombatant(hitTargetId);
  if (!bounceFrom) return;
  // Never back onto the combatant it just left: with only one enemy in the
  // fight there is nobody to bounce to, and the shot simply ends.
  const nextTarget = await findChainTarget(offer.encounterId, hitTargetId, shooterId, { maxRadius: Infinity });
  if (!nextTarget) {
    await pushCombatLog(offer.encounterId, `${ricochetSlug.name} ricochets off ${bounceFrom.name} but finds no one else to hit.`);
    await broadcastEncounter(offer.encounterId);
    return;
  }
  await pushCombatLog(offer.encounterId, `${ricochetSlug.name} ricochets off ${bounceFrom.name} toward ${nextTarget.name}!`);
  const wallsRow = (await pool.query("SELECT walls FROM encounters WHERE id = $1", [offer.encounterId])).rows[0];
  await fireSecondaryShot({
    encounterId: offer.encounterId,
    attackerId: shooterId,
    attackerName: shooterName,
    originPos: { x: bounceFrom.x, y: bounceFrom.y },
    target: nextTarget,
    slug: ricochetSlug,
    blaster: offer.blaster,
    walls: wallsRow?.walls || [],
    ricochetCount: bouncesSoFar + 1,
  });
}

// The misfire roll happens up front now, at fire time (see the shoot route)
// -- by the time a shot reaches here, it has already launched, so this only
// ever resolves it as a miss or a hit. The roll itself (and the
// combat-shot-resolved reveal of which way it went) happens right away,
// synchronously -- but *applying* that outcome (damage, status effects, an
// AOE miss's splash) is handed to scheduleAfterFlight, so nothing actually
// changes on anyone's screen until the shot's flight/explosion animation
// would actually have finished playing.
// The attack roll itself -- shared by an uncontested shot (resolveNormalHit)
// and a Dodge attempt (resolveDodgeAttempt), which opposes its own roll
// against this same attackTotal instead of the target's static dc. Extracted
// rather than duplicated because it has a real side effect (consuming
// blinded/keenVision via updateCombatant) that must only ever fire once per
// shot.
async function resolveAttackRoll(offer, attacker, target) {
  const quality = QUALITY_TIERS[offer.blaster.quality] || QUALITY_TIERS[0];
  const tb = slugBallistics(offer.slug);
  // Uses offer.attackerPos (the shot's real visual origin), not a fresh
  // attacker.x/y -- normally identical (the attacker can't move mid-
  // resolution), but this is also what lets Speedstinger's ricochet leg
  // reuse this same function with a *different* origin than the true
  // shooter's own position (see fireSecondaryShot/maybeRicochet below).
  const dist = distance(offer.attackerPos, { x: target.x, y: target.y });
  // Pivot the accuracy penalty on the shot's actual effective range (blaster
  // vs. slug type, whichever reaches further), not the blaster's range
  // alone -- so it scales correctly whichever one is doing the reaching.
  // Perplexus's keenVision waives the range falloff entirely for this shot
  // (the "further-seeing" half of the effect) -- mutually exclusive with
  // blinded below (whichever one applies, not both) since a combatant
  // realistically can't be both blinded and keen-sighted at once.
  const hasKeenVision = Boolean(attacker.status_effects?.keenVision);
  const penalty = hasKeenVision ? 0 : rangePenalty(dist, Math.max(offer.blaster.range, tb.range));
  const targetDexMod = target.data?.dexMod ?? 0;

  let roll = rollD20();
  if (attacker.status_effects?.blinded) {
    roll = Math.min(roll, rollD20());
    await updateCombatant(attacker.id, {
      status_effects: JSON.stringify({ ...attacker.status_effects, blinded: false }),
    });
  } else if (hasKeenVision) {
    // Advantage -- the exact mirror of blinded's disadvantage above -- plus
    // the range-falloff waiver already applied to `penalty`. (An ill shooter's
    // disadvantage cancels the advantage, but the keen vision is still used up.)
    if (!gearDisadvantage(attacker)) roll = Math.max(roll, rollD20());
    await updateCombatant(attacker.id, {
      status_effects: JSON.stringify({ ...attacker.status_effects, keenVision: false }),
    });
  } else if (gearDisadvantage(attacker)) {
    // Ill (see outfitRules.js): every attack roll at disadvantage.
    roll = Math.min(roll, rollD20());
  }
  const attackTotal =
    roll +
    gearAccuracyMod(attacker) +
    offer.blaster.accuracy +
    (await blasterModTotal(offer.blaster, "accuracy_bonus")) +
    quality.accuracyBonus +
    tb.accuracyMod +
    penalty +
    loyaltyAccuracyModifier(offer.slug.loyalty_tier) +
    // Bow folds in the shooter's own DEX modifier; every other base type adds 0.
    blasterTypeAccuracyBonus(offer.blaster, attacker) -
    // Bike mode trades aim for speed.
    (effectiveMode(attacker) === "bike" ? BIKE_ACCURACY_PENALTY : 0);
  const dc = 10 + targetDexMod;
  return { attackTotal, dc, roll };
}

// The hit branch's consequences -- shared by resolveNormalHit and a failed
// Dodge that still lands as an ordinary hit. Returns dealHit's own log string.
async function applyHitEffects(offer, attacker, target) {
  const hitLog = await dealHit(offer.encounterId, attacker.id, target.id, offer.slug, {
    windowMs: offer.windowMs,
    firedAt: offer.firedAt,
    // Where this specific leg's bolt actually flew from -- the real
    // shooter's position for a normal shot, but the *previous* target's
    // position for a ricocheted leg (see fireSecondaryShot). Knockback
    // needs to shove away from this, not from attacker.id's real
    // current position, which for a ricochet leg is somewhere else
    // entirely.
    originPos: offer.attackerPos,
    isRicochetLeg: offer.isRicochetLeg,
    mindScrambleEffect: offer.effectChoice,
    frictionEffect: offer.effectChoice,
  });
  // B's counter didn't actually stop the shot (it still connected) --
  // Speedstinger's ricochet continues on to a second target exactly like
  // an uncontested hit would.
  await maybeRicochet(offer, target.id);
  return hitLog;
}

// The miss branch's consequences -- shared by resolveNormalHit's real miss
// and a failed Dodge whose underlying shot missed anyway. `missPoint` is
// wherever the bolt actually came to rest (the deflected wide point for a
// real miss). Returns an array of extra log fragments (possibly empty).
async function applyGlancingEffects(offer, attacker, target, missPoint) {
  const fragments = [];
  // A miss still fries the target's blaster -- causes_jam triggers on hit or
  // miss alike (the shot got close enough to matter), just not on the
  // attacker's own misfire (which returns before this point ever runs), an
  // out-of-range shot (handled earlier, never reaches here), or a
  // self-targeted shot (Thugglet shooting yourself for invisibility
  // shouldn't also jam your own gun).
  if (offer.slug.causes_jam && target.kind !== "mecha" && target.id !== attacker.id) {
    await updateCombatant(target.id, {
      status_effects: JSON.stringify({ ...(target.status_effects || {}), jammed: true }),
    });
    fragments.push(`${target.name}'s blaster is fried -- their next shot misfires.`);
  }
  // Cynosure's disarm follows the exact same "still fries on a miss" rule as
  // causes_jam above.
  if (offer.slug.causes_disarm && target.kind !== "mecha" && target.id !== attacker.id) {
    await updateCombatant(target.id, {
      status_effects: JSON.stringify({ ...(target.status_effects || {}), disarmed: { turnsLeft: DISARM_DURATION_TURNS } }),
    });
    fragments.push(`${target.name}'s blaster is disabled -- they can't Shoot Slug on their next turn.`);
  }
  // An AOE slug still detonates on a miss -- it just goes off wherever the
  // deflected shot actually landed instead of on the target. Whoever's
  // within AOE_RADIUS of that point (which can include the original target,
  // if the miss didn't carry it far) takes the blast anyway.
  if (offer.slug.aoe_blast) {
    const caught = await findAoeTargets(offer.encounterId, missPoint, [attacker.id], aoeRadiusMult(offer.slug));
    if (caught.length > 0) {
      let aoeFragment = "It still detonates!";
      for (const other of caught) {
        const splashLog = await dealHit(offer.encounterId, attacker.id, other.id, offer.slug, { isSplash: true });
        aoeFragment += ` The blast catches ${other.name}: ${splashLog}`;
      }
      fragments.push(aoeFragment);
    } else {
      fragments.push("It detonates harmlessly, catching no one.");
    }
  }
  // The bolt still glances off a missed target -- Speedstinger's carom
  // continues from here regardless of whether this leg connected.
  await maybeRicochet(offer, target.id);
  return fragments;
}

// Performance: a shot that connects rolls d20 + the shooter's Performance
// modifier; above STYLE_DC it's a style shot (extra Fame, curved flight on
// everyone's map). Characters only -- NPCs don't showboat. Returns null for no
// style, else the roll total.
function rollStyleShot(offer, attacker, target) {
  if (!attacker || attacker.kind !== "character" || !attacker.ref_user_id) return null;
  if (offer.isRicochetLeg || attacker.id === target.id) return null;
  const total = rollD20() + combatantSkillMod(attacker, "performance");
  return total > STYLE_DC ? total : null;
}

async function applyStyleBonus(attacker, styleTotal) {
  await grantFame(attacker.ref_user_id, STYLE_FAME_BONUS);
  await pushCombatLog(
    attacker.encounter_id,
    `${attacker.name} pulls off a STYLE SHOT (${styleTotal} Performance)! +${STYLE_FAME_BONUS} Fame!`
  );
}

async function resolveNormalHit(offer) {
  const attacker = await getCombatant(offer.attackerCombatantId);
  const target = await getCombatant(offer.targetCombatantId);
  // Fetched once, up front, for missDeflection's own wall check -- the
  // deflected ray isn't guaranteed clear just because the true path was.
  const wallsRow = (await pool.query("SELECT walls FROM encounters WHERE id = $1", [offer.encounterId])).rows[0];
  const walls = wallsRow?.walls || [];

  if (!attacker || !target) {
    broadcastShotResolved(offer, {
      outcome: "miss",
      impactPoint: missDeflection(offer.attackerPos, offer.impactPoint, walls),
    });
    return;
  }

  // You never fumble a slug fired at yourself -- a self-buff always lands.
  const isSelfShot = attacker.id === target.id;
  // Already rolled at launch (see launchAndOfferCounter) -- only roll here for
  // an offer that never went through it.
  const { attackTotal, dc, roll } = offer.attackRoll || (await resolveAttackRoll(offer, attacker, target));
  const hit = isSelfShot || attackTotal >= dc;
  // Went wide instead of stopping dead-on the target -- see missDeflection.
  // Only computed for a miss; a hit's reveal doesn't need it. A miss decided
  // at launch already flew toward its own deflected point, so reuse that one.
  const deflected = hit ? null : offer.missPoint || missDeflection(offer.attackerPos, offer.impactPoint, walls);

  const styleTotal = hit ? rollStyleShot(offer, attacker, target) : null;
  if (!isSelfShot) {
    await recordShotResult(offer.encounterId, attacker, target, hit ? "hit" : "miss", offer.slug, {
      roll,
      attackTotal,
      dc,
      style: styleTotal != null,
      bonus: Boolean(offer.isRicochetLeg),
    });
  }
  broadcastShotResolved(offer, hit ? { outcome: "hit", style: styleTotal != null } : { outcome: "miss", impactPoint: deflected });

  scheduleAfterFlight(offer.firedAt, offer.windowMs, async () => {
    let log;
    if (hit) {
      if (styleTotal != null) await applyStyleBonus(attacker, styleTotal);
      const hitLog = await applyHitEffects(offer, attacker, target);
      log = isSelfShot
        ? `${attacker.name} fires ${offer.slug.name} at themselves. ${hitLog}`
        : `${attacker.name}'s ${offer.slug.name} hits ${target.name} (${attackTotal} vs DC ${dc})! ${hitLog}`;
    } else {
      const fragments = await applyGlancingEffects(offer, attacker, target, deflected);
      log = [`${attacker.name}'s ${offer.slug.name} misses ${target.name} (${attackTotal} vs DC ${dc}).`, ...fragments].join(" ");
    }
    // Any terrain this slug leaves (ice/damage patch, fire trail, star wall,
    // pods, zones) lands where the bolt actually came to rest: dead on the
    // target for a hit, out at the deflected wide point for a miss -- never
    // on a target the shot visibly sailed past. A ricochet leg leaves
    // nothing (applyShotTerrain no-ops on isRicochetLeg).
    await applyShotTerrain(offer, hit ? offer.impactPoint : deflected);
    await pushCombatLog(offer.encounterId, log);
    await broadcastEncounter(offer.encounterId);
  });
}

// A third counter-window reaction alongside firing a counter slug: no slug
// or energy pip spent, just d20 + DEX opposed directly against the
// attacker's own attack roll. A failed dodge falls through to *exactly* the
// same hit-or-miss determination an unanswered shot would get -- dodging
// isn't a second chance to avoid a shot that was going to miss on its own.
async function resolveDodgeAttempt(id) {
  const offer = pendingCounters.get(id);
  if (!offer) return null;
  clearTimeout(offer.timeoutHandle);
  pendingCounters.delete(id);

  const defender = await getCombatant(offer.targetCombatantId);
  const attacker = await getCombatant(offer.attackerCombatantId);
  // Re-check against a fresh row -- same reasoning as resolveCounterOffer's
  // own re-check: the offer was snapshotted when it went out, and AP may
  // have moved since. Dodge is gated on unconscious/disabled, not disarmed
  // (disarm is about firing a blaster; dodging never fires one).
  const canAfford =
    defender &&
    attacker &&
    !defender.unconscious &&
    !defender.disabled &&
    // Snared: rooted in place, so there's nothing to dive with.
    !(defender.status_effects?.snared?.turnsLeft > 0) &&
    DODGE_AP_COST <= (defender.current_ap || 0) &&
    combatantSkillMod(defender, "acrobatics") > 0;
  if (!canAfford) {
    await resolveNormalHit(offer);
    return { pending: false, countered: false, dodged: false };
  }

  // Spent regardless of outcome, broadcast immediately -- same rule a slug
  // counter already follows (see resolveCounterOffer's matching comment).
  await updateCombatant(defender.id, { current_ap: (defender.current_ap || 0) - DODGE_AP_COST });
  await broadcastEncounter(offer.encounterId);

  const wallsRow = (await pool.query("SELECT walls FROM encounters WHERE id = $1", [offer.encounterId])).rows[0];
  const walls = wallsRow?.walls || [];
  const { attackTotal, dc, roll } = offer.attackRoll || (await resolveAttackRoll(offer, attacker, defender));
  const acrobaticsMod = combatantSkillMod(defender, "acrobatics");
  const dodgeTotal = rollD20() + acrobaticsMod;
  // Opposed roll -- a tie favors the attacker, same convention as
  // resolveNormalHit's own attackTotal >= dc (ties favor the active roller
  // against a static target).
  const dodged = dodgeTotal > attackTotal;
  // The dodge failed -- fall through to the SAME outcome an unanswered shot
  // would get. The attacker's own accuracy roll might still miss on its own,
  // independent of the dodge attempt.
  const hit = !dodged && attackTotal >= dc;
  const deflected = !dodged && !hit ? missDeflection(offer.attackerPos, offer.impactPoint, walls) : null;

  const styleTotal = hit ? rollStyleShot(offer, attacker, defender) : null;
  await recordCombatEvent(offer.encounterId, "dodge", {
    actor: defender,
    target: attacker,
    success: dodged,
    dodgeTotal,
    attackTotal,
    ap: DODGE_AP_COST,
  });
  await recordShotResult(offer.encounterId, attacker, defender, dodged ? "dodged" : hit ? "hit" : "miss", offer.slug, {
    roll,
    attackTotal,
    dc,
    style: styleTotal != null,
    bonus: Boolean(offer.isRicochetLeg),
  });
  broadcastShotResolved(
    offer,
    dodged ? { outcome: "dodged" } : hit ? { outcome: "hit", style: styleTotal != null } : { outcome: "miss", impactPoint: deflected }
  );

  scheduleAfterFlight(offer.firedAt, offer.windowMs, async () => {
    let log;
    if (dodged) {
      const encRow = (
        await pool.query("SELECT walls, map_width, map_height FROM encounters WHERE id = $1", [offer.encounterId])
      ).rows[0];
      const step = sidestepTarget(
        offer.attackerPos,
        { x: defender.x, y: defender.y },
        withMapEdges(encRow?.walls, encRow?.map_width, encRow?.map_height),
        dodgeSidestepDistance(acrobaticsMod)
      );
      const dest = clampToMapBounds(step.point, encRow?.map_width ?? 1600, encRow?.map_height ?? 900);
      // Position updates BEFORE the AOE check below (findAoeTargets
      // re-queries live x/y) -- this is what lets a blast still catch a
      // dodger who's still within AOE_RADIUS of the real impact point.
      await updateCombatant(defender.id, { x: dest.x, y: dest.y });
      const fragments = await applyGlancingEffects(offer, attacker, defender, offer.impactPoint);
      log = [`${defender.name} dives clear (${dodgeTotal} dodge vs ${attackTotal} attack)!`, ...fragments].join(" ");
      if (defender.kind === "character" && defender.ref_user_id) {
        await grantFame(defender.ref_user_id, DODGE_FAME_BONUS);
      }
    } else if (hit) {
      if (styleTotal != null) await applyStyleBonus(attacker, styleTotal);
      const hitLog = await applyHitEffects(offer, attacker, defender);
      log = `${defender.name} tries to dodge but isn't fast enough (${dodgeTotal} vs ${attackTotal})! ${offer.attackerName}'s ${offer.slug.name} connects! ${hitLog}`;
    } else {
      // The dodge failed, but the shot missed on its own anyway -- ordinary
      // miss handling, no Fame, no movement (nothing to reward or dodge).
      const fragments = await applyGlancingEffects(offer, attacker, defender, deflected);
      log = [`${offer.attackerName}'s ${offer.slug.name} misses ${defender.name} anyway (${attackTotal} vs DC ${dc}).`, ...fragments].join(
        " "
      );
    }
    // The bolt itself flew true either way in the dodged/hit cases (only the
    // defender moved); a genuine miss leaves terrain at the deflected point.
    await applyShotTerrain(offer, dodged || hit ? offer.impactPoint : deflected);
    await pushCombatLog(offer.encounterId, log);
    await broadcastEncounter(offer.encounterId);
  });

  return { pending: false, dodged };
}

// reactedAt: wall-clock time (server clock) the defender actually reacted --
// the arrival time, minus any lag compensation granted by the resolve route.
async function resolveCounterOffer(id, chosenSlugId, reactedAt = Date.now()) {
  const offer = pendingCounters.get(id);
  if (!offer) return null;
  clearTimeout(offer.timeoutHandle);
  pendingCounters.delete(id);

  const counterSlugRow = chosenSlugId ? offer.eligibleSlugRows.find((s) => s.id === chosenSlugId) : null;

  // Re-check the defender's AP against a fresh row -- eligibleSlugRows was
  // snapshotted when the offer went out, and an earlier counter this same
  // turn may have drained the AP since. Can't afford it -> treat exactly
  // like a decline.
  const defender = counterSlugRow ? await getCombatant(offer.targetCombatantId) : null;
  const canAffordCounter = defender && (counterSlugRow.ap_cost || 0) <= (defender.current_ap || 0);

  if (!counterSlugRow || !canAffordCounter) {
    // No counter (declined, timed out, or no longer affordable) -- the shot
    // flies on exactly as if none had been offered. resolveNormalHit now
    // places the terrain itself, at the real impact point (target on a hit,
    // the deflected wide point on a miss).
    await resolveNormalHit(offer);
    return { pending: false, countered: false };
  }

  // Fetched for Fame's clash-margin bonus below (the attacker isn't
  // otherwise loaded in this function -- only offer.attackerCombatantId/
  // offer.attackerName).
  const attacker = await getCombatant(offer.attackerCombatantId);

  // Countering costs the slug's own apCost out of the defender's leftover
  // AP, plus one of its energy pips -- both are the price of the *choice* to
  // counter (same as the attacker's own AP/energy at fire time), so neither
  // is held back for the animation. Broadcast right away so the defender's
  // token shows the spent AP the instant they commit, not when the clash
  // resolves ~a flight later.
  await updateCombatant(defender.id, { current_ap: (defender.current_ap || 0) - (counterSlugRow.ap_cost || 0) });
  await spendEnergyPip(counterSlugRow.id);
  await recordSlugShots(defender, [counterSlugRow.id]);
  await broadcastEncounter(offer.encounterId);
  // Emberblade: power and defense triple specifically while it's the slug on
  // either side of a clash (not on an ordinary uncountered hit) -- applies
  // to whichever side actually has it, attacker or defender. offer.slug and
  // counterSlugRow both already have their loyalty tier's clash modifier
  // baked into clash_power/clash_defense (see applyLoyaltyToSlug, applied
  // back in resolveShooterSlugAndBlaster/findEligibleCounterSlugs), so the
  // tripling below multiplies the already-effective numbers.
  const attackerClashMultiplier = offer.slug.clash_tripled ? CLASH_TRIPLE_MULTIPLIER : 1;
  const defenderClashMultiplier = counterSlugRow.clash_tripled ? CLASH_TRIPLE_MULTIPLIER : 1;
  // Caligo: a clash against a Fire-type slug never resolves on power/defense
  // at all -- whichever side has voids_fire_clash smothers it in steam
  // before it ever lands, same end state as an ordinary "bounce" (no damage,
  // no ejects), just guaranteed instead of a resolveClash roll of the dice.
  const firesVoided =
    (offer.slug.voids_fire_clash && counterSlugRow.type === "Fire") ||
    (counterSlugRow.voids_fire_clash && slugHasType(offer.slug, "Fire"));
  // Mimkey: fired as the counter, it transforms into whatever slug it's
  // facing, so the two are identical and cancel out -- the same guaranteed
  // "bounce" (no damage, no ejects) a voided fire clash ends in, just not
  // limited to Fire.
  const mimicked = Boolean(counterSlugRow.mirrors_clash);

  // Where the two bolts actually meet, and how much flight time that leaves
  // the counter slug itself. The incoming shot has been in the air for
  // counterAtMs by the time the counter launches (clamped to the flight
  // window); from wherever it had got to, both bolts close the remaining
  // gap and collide halfway. A snappy reaction meets the shot far from the
  // defender, a last-instant one almost on top of them -- instead of always
  // colliding at the geometric midpoint. Drives both where the clash
  // renders (client) and where a losing pod-spawner drops its pods.
  const counterAtMs = Math.max(0, Math.min(offer.windowMs, reactedAt - offer.firedAt));
  const shotPosAtCounter = lerpPoint(
    offer.attackerPos,
    offer.impactPoint,
    shotDistanceFraction(counterAtMs, offer.windowMs, offer.windupFraction)
  );
  const clashPoint = lerpPoint(shotPosAtCounter, offer.impactPoint, 0.5);

  // The counter slug has the same fixed windup as any other shot (see
  // SHOT_SLOW_PHASE_MS / shotTooClose) -- reacting doesn't launch it already
  // up to speed. The clash always lands at offer.windowMs regardless of when
  // the counter fired (see above), so counterFlightMs is exactly how long
  // the counter slug itself has, start to clash. React late enough that
  // this dips under the windup and the counter slug never actually gets
  // moving in time: it loses the clash outright, whatever its own
  // power/defense would otherwise have done -- there's nothing there yet to
  // smother a voided fire clash or bounce off of, either.
  const counterFlightMs = offer.windowMs - counterAtMs;
  const counterNeverWoundUp = counterFlightMs < SHOT_SLOW_PHASE_MS;

  const attackerPowerVal = offer.slug.clash_power * attackerClashMultiplier;
  const attackerDefenseVal = offer.slug.clash_defense * attackerClashMultiplier;
  const defenderPowerVal = counterSlugRow.clash_power * defenderClashMultiplier;
  const defenderDefenseVal = counterSlugRow.clash_defense * defenderClashMultiplier;

  const outcome = counterNeverWoundUp
    ? "attacker-wins"
    : firesVoided || mimicked
      ? "bounce"
      : resolveClash({
          attackerPower: attackerPowerVal,
          attackerDefense: attackerDefenseVal,
          defenderPower: defenderPowerVal,
          defenderDefense: defenderDefenseVal,
        });

  // Fame's clash-margin bonus only applies to a genuinely contested clash --
  // counterNeverWoundUp is a forced win with no real clash (the counter slug
  // never got up to speed), and bounce/double-break has no winner.
  const clashWasContested = !counterNeverWoundUp && !firesVoided && !mimicked;
  const clashMargin = !clashWasContested
    ? 0
    : outcome === "attacker-wins"
      ? attackerPowerVal - defenderDefenseVal
      : outcome === "defender-wins"
        ? defenderPowerVal - attackerDefenseVal
        : 0;

  const CLASH_OUTCOME_STAT = { "attacker-wins": "clash_won", "defender-wins": "clash_lost", bounce: "clash_bounce", "double-break": "clash_double" };
  await recordShotResult(offer.encounterId, attacker, defender, CLASH_OUTCOME_STAT[outcome] ?? "clash_bounce", offer.slug, {
    counterSlug: counterSlugRow.name,
    bonus: Boolean(offer.isRicochetLeg),
  });
  await recordCombatEvent(offer.encounterId, "counter", {
    actor: defender,
    target: attacker,
    outcome: outcome === "defender-wins" ? "won" : outcome === "attacker-wins" ? "lost" : "bounce",
    slug: counterSlugRow.name,
    slugType: counterSlugRow.type,
    ap: counterSlugRow.ap_cost || 0,
    neverWoundUp: counterNeverWoundUp,
  });
  // The clash math (who wins) is "the direction" -- fine to know and reveal
  // right away. What it actually *does* (ejects, damage) is held back for
  // scheduleAfterFlight so it lands with the clash/aftermath burst instead
  // of before it, same as a normal hit.
  broadcastShotResolved(offer, {
    countered: true,
    counterSlugType: counterSlugRow.type,
    counterSlugName: counterSlugRow.name,
    outcome,
    clashPoint,
    counterAtMs,
  });

  scheduleAfterFlight(offer.firedAt, offer.windowMs, async () => {
    let log;
    if (outcome === "double-break") {
      for (const id of shotSlugIds(offer.slug)) await ejectSlug(id);
      await ejectSlug(counterSlugRow.id);
      log = `${offer.attackerName}'s ${offer.slug.name} and ${offer.targetName}'s ${counterSlugRow.name} clash head-on and both go flying -- no damage.`;
    } else if (outcome === "bounce") {
      log = mimicked
        ? `${offer.targetName}'s ${counterSlugRow.name} transforms into ${offer.attackerName}'s ${offer.slug.name} -- the two slugs are identical and cancel each other out, no damage.`
        : firesVoided
        ? `${offer.attackerName}'s ${offer.slug.name} and ${offer.targetName}'s ${counterSlugRow.name} clash in a billow of steam -- the flames are smothered instantly, no damage.`
        : `${offer.attackerName}'s ${offer.slug.name} and ${offer.targetName}'s ${counterSlugRow.name} clash and deflect harmlessly.`;
    } else if (outcome === "attacker-wins") {
      await ejectSlug(counterSlugRow.id);
      // Fame: the margin by which the winning clash actually beat the
      // loser's defense -- on top of dealHit's own raw-power/overkill hook
      // below, which credits the same attacker again for the hit itself.
      if (clashMargin > 0 && attacker?.kind === "character" && attacker.ref_user_id) {
        await grantFame(attacker.ref_user_id, clashMargin);
      }
      // Tripled power carries through to the actual damage too, not just the
      // clash comparison -- a cloned slug object so the real DB row's own
      // clash_power is never touched.
      const attackingSlug =
        attackerClashMultiplier > 1 ? { ...offer.slug, clash_power: offer.slug.clash_power * attackerClashMultiplier } : offer.slug;
      const hitLog = await dealHit(offer.encounterId, offer.attackerCombatantId, offer.targetCombatantId, attackingSlug, {
        windowMs: offer.windowMs,
        firedAt: offer.firedAt,
        originPos: offer.attackerPos, // see the matching comment in resolveNormalHit
        isRicochetLeg: offer.isRicochetLeg,
        mindScrambleEffect: offer.effectChoice,
        frictionEffect: offer.effectChoice,
        countered: true,
      });
      log = counterNeverWoundUp
        ? `${offer.targetName}'s ${counterSlugRow.name} never gets up to speed before ${offer.attackerName}'s ${offer.slug.name} smashes through! ${hitLog}`
        : `${offer.attackerName}'s ${offer.slug.name} smashes through ${offer.targetName}'s counter! ${hitLog}`;
      // B's counter didn't actually stop the shot (it still connected) --
      // Speedstinger's ricochet continues on to a second target exactly like
      // an uncontested hit would.
      await maybeRicochet(offer, offer.targetCombatantId);
    } else {
      // Fame: same margin bonus as the attacker-wins branch above, mirrored
      // for the defender -- dealHit's own hook (below) credits them again
      // for the reflected hit itself.
      if (clashMargin > 0 && defender.kind === "character" && defender.ref_user_id) {
        await grantFame(defender.ref_user_id, clashMargin);
      }
      // Both halves of a dual shot go flying when it loses the clash.
      for (const id of shotSlugIds(offer.slug)) await ejectSlug(id);
      const reflectingSlug =
        defenderClashMultiplier > 1 ? { ...counterSlugRow, clash_power: counterSlugRow.clash_power * defenderClashMultiplier } : counterSlugRow;
      // The counter-slug's own "shooter" is the defender, launched from
      // their position (offer.targetPos) -- already what shooter.x/y would
      // resolve to here anyway (the defender can't ricochet), but explicit
      // for the same reason as the two call sites above.
      const hitLog = await dealHit(offer.encounterId, offer.targetCombatantId, offer.attackerCombatantId, reflectingSlug, {
        originPos: offer.targetPos,
        statTag: "counter",
        countered: true,
      });
      log = `${offer.targetName}'s ${counterSlugRow.name} reflects the shot back at ${offer.attackerName}! ${hitLog}`;
      // Speedstinger as the counter slug: the reflected shot doesn't just
      // hit the attacker, it caroms off them on to another nearby enemy --
      // its own independent counter-clash, owned by the defender. This is a
      // fresh shot, so its bounce count starts at 0 regardless of how deep
      // the incoming shot's own chain was.
      await maybeRicochet({ ...offer, ricochetCount: 0 }, offer.attackerCombatantId, {
        ricochetSlug: reflectingSlug,
        shooterId: offer.targetCombatantId,
        shooterName: offer.targetName,
      });
    }

    const counterApCost = counterSlugRow.ap_cost || 0;
    if (counterApCost > 0) {
      log += ` (${offer.targetName} spends ${counterApCost} AP.)`;
    }

    // Emberblade's wall of fire forms specifically when it's *involved in a
    // clash* -- unlike Flaringo's trail_wall (unconditional on every
    // Attack), this is keyed off clash_tripled instead, since the CSV
    // describes both effects as the same trigger. Fires here regardless of
    // which of the four clash outcomes landed (double-break/bounce/
    // attacker-wins/defender-wins all count as "was in a clash") -- but
    // never for an ordinary uncontested hit, which never reaches this
    // function at all (see the !counterSlugRow early return above).
    // Whichever side has the flag gets a wall along *its own* slug's
    // trajectory. The attacker's shot only travelled as far as it got: the
    // target if it smashed through, otherwise the clash point. The counter
    // always travels its full target -> attacker line.
    const attackerShotEnd = outcome === "attacker-wins" ? offer.impactPoint : clashPoint;
    if (offer.slug.clash_tripled) {
      await addTrailWall(offer.encounterId, offer.attackerPos, attackerShotEnd, offer.slug.type);
    }
    if (counterSlugRow.clash_tripled) {
      await addTrailWall(offer.encounterId, offer.targetPos, offer.attackerPos, counterSlugRow.type);
    }

    // Every other terrain mark the attacker's slug leaves (ice/damage patch,
    // star wall, anchor zone, fire trail, steam pods) lands wherever the shot
    // was actually stopped -- the target only if it smashed clean through the
    // counter, otherwise the clash point (it lost, bounced, or both slugs
    // flew). Already inside the post-flight callback, so applied directly.
    await applyShotTerrain(offer, attackerShotEnd);

    await pushCombatLog(offer.encounterId, log);
    await broadcastEncounter(offer.encounterId);
  });

  return { pending: false, countered: true, outcome };
}

// ---------------------------------------------------------------------------
// Shoot Slug
// ---------------------------------------------------------------------------

// Shared by every action type below -- resolves which slug/blaster pair is
// actually firing, whether that's a player's real slug, an NPC's real slug,
// or a DM-puppeted NPC's ad-hoc stat block. Returns { slug, blaster } or
// { error } (a 400 message) -- never throws for a bad request, only for a
// genuine DB failure.
async function resolveShooterSlugAndBlaster(attacker, req, { slugId, npcSlug, npcBlaster }) {
  if (attacker.kind === "character" || (attacker.kind === "npc" && Number.isInteger(slugId))) {
    if (!Number.isInteger(slugId)) return { error: "Choose a slug to fire." };
    const slugResult = await pool.query("SELECT * FROM slugs WHERE id = $1", [slugId]);
    const slug = slugResult.rows[0];
    const ownsSlug =
      slug &&
      ((attacker.kind === "character" && slug.user_id === attacker.ref_user_id) ||
        (attacker.kind === "npc" && slug.owner_combatant_id === attacker.id));
    if (!ownsSlug) return { error: "That slug isn't yours." };
    if (!slug.equipped_blaster_id) return { error: "That slug isn't loaded into a weapon." };
    const blasterResult = await pool.query("SELECT * FROM blasters WHERE id = $1", [slug.equipped_blaster_id]);
    const blaster = blasterResult.rows[0];
    if (!blaster || blaster.equip_slot === null) return { error: "That weapon isn't equipped." };
    // A character can only fire whichever weapon slot is currently active
    // (see /actions/switch-weapon) -- a slug loaded into the *other* slot
    // is holstered, not in hand. NPCs aren't held to this.
    if (attacker.kind === "character") {
      if ((blaster.durability ?? 100) <= 0) {
        return { error: `${blaster.name} is broken -- it needs an expert's repair before it can fire again.` };
      }
      const activeSlot = attacker.data?.activeWeaponSlot ?? PRIMARY_WEAPON_SLOT;
      if (blaster.equip_slot !== activeSlot) {
        return { error: "That slug is loaded into your other weapon -- switch weapons first." };
      }
    }
    if ((slug.cooldown_turns_left || 0) > 0) {
      return { error: "That slug hasn't returned to hand yet." };
    }
    if (slug.loaded === false) {
      return { error: "That slug is back in hand but not loaded -- Reload it into your weapon first." };
    }
    if (!Array.isArray(slug.energy_pips) || !slug.energy_pips.some(Boolean)) {
      return { error: "That slug is out of energy -- it needs to recharge." };
    }
    return { slug: applyLoyaltyToSlug(slug), blaster };
  } else if (attacker.kind === "npc" && req.user.role === "Dungeon Master") {
    const slug = {
      id: null,
      name: npcSlug?.name || "NPC Slug",
      type: npcSlug?.type || "Unique",
      clash_power: Number.isInteger(npcSlug?.clashPower) ? npcSlug.clashPower : 5,
      clash_defense: Number.isInteger(npcSlug?.clashDefense) ? npcSlug.clashDefense : 5,
      ap_cost: Number.isInteger(npcSlug?.apCost) ? npcSlug.apCost : 1,
      breaks_walls: Boolean(npcSlug?.breaksWalls),
      causes_knockback: Boolean(npcSlug?.causesKnockback),
      wall_maker: Boolean(npcSlug?.wallMaker),
      bridge_maker: Boolean(npcSlug?.bridgeMaker),
      causes_blind: Boolean(npcSlug?.causesBlind),
      causes_snare: Boolean(npcSlug?.causesSnare),
      causes_shock: Boolean(npcSlug?.causesShock),
      causes_jam: Boolean(npcSlug?.causesJam),
      pierces_walls: Boolean(npcSlug?.piercesWalls),
      causes_chain: Boolean(npcSlug?.causesChain),
      ricochets: Boolean(npcSlug?.ricochets),
      ultra_fast: Boolean(npcSlug?.ultraFast),
      causes_invisible: Boolean(npcSlug?.causesInvisible),
      causes_fear: Boolean(npcSlug?.causesFear),
      causes_confusion: Boolean(npcSlug?.causesConfusion),
      trail_wall: Boolean(npcSlug?.trailWall),
      clash_tripled: Boolean(npcSlug?.clashTripled),
      cone_blast: Boolean(npcSlug?.coneBlast),
      spawns_pods: Boolean(npcSlug?.spawnsPods),
      mirage_decoy: Boolean(npcSlug?.mirageDecoy),
      star_wall: Boolean(npcSlug?.starWall),
      anchor_zone: Boolean(npcSlug?.anchorZone),
      voids_fire_clash: Boolean(npcSlug?.voidsFireClash),
      clears_fire_terrain: Boolean(npcSlug?.clearsFireTerrain),
      causes_disarm: Boolean(npcSlug?.causesDisarm),
      disarm_zone: Boolean(npcSlug?.disarmZone),
      mind_scramble: Boolean(npcSlug?.mindScramble),
      swaps_position: Boolean(npcSlug?.swapsPosition),
      friction_shift: Boolean(npcSlug?.frictionShift),
      crosswind_zone: Boolean(npcSlug?.crosswindZone),
      skips_reload: Boolean(npcSlug?.skipsReload),
      emotion_surge: Boolean(npcSlug?.emotionSurge),
      uncounterable: Boolean(npcSlug?.uncounterable),
      damage_tripled: Boolean(npcSlug?.damageTripled),
      static_mark: Boolean(npcSlug?.staticMark),
      power_surge: Boolean(npcSlug?.powerSurge),
      heal_over_time: Boolean(npcSlug?.healOverTime),
      grapple: Boolean(npcSlug?.grapple),
      causes_stun: Boolean(npcSlug?.causesStun),
      stalls_slugs: Boolean(npcSlug?.stallsSlugs),
      amplifies_partner: Boolean(npcSlug?.amplifiesPartner),
      pulls_metal: Boolean(npcSlug?.pullsMetal),
      phases_walls: Boolean(npcSlug?.phasesWalls),
      mirrors_clash: Boolean(npcSlug?.mirrorsClash),
      surrounds_target: Boolean(npcSlug?.surroundsTarget),
      ambush_tripled: Boolean(npcSlug?.ambushTripled),
      summons_plant: Boolean(npcSlug?.summonsPlant),
      causes_burn: Boolean(npcSlug?.causesBurn),
      massive_aoe: Boolean(npcSlug?.massiveAoe),
      random_statuses: Boolean(npcSlug?.randomStatuses),
      summons_ghost: Boolean(npcSlug?.summonsGhost),
      potent_poison: Boolean(npcSlug?.potentPoison),
      causes_bleed: Boolean(npcSlug?.causesBleed),
      life_drain: Boolean(npcSlug?.lifeDrain),
      energy_pips: [true],
      user_id: null,
    };
    const blaster = {
      // Lets a DM-puppeted NPC opt into a base type's combat effect (Bow's
      // DEX roll, Gatling's AP discount, Cannon's clash bonus); null = none.
      base_type: BASE_TYPE_KEYS.includes(npcBlaster?.baseType) ? npcBlaster.baseType : null,
      accuracy: Number.isInteger(npcBlaster?.accuracy) ? npcBlaster.accuracy : 0,
      range: Number.isInteger(npcBlaster?.range) ? npcBlaster.range : 20,
      speed: Number.isInteger(npcBlaster?.speed) ? npcBlaster.speed : 88,
      quality: Number.isInteger(npcBlaster?.quality) ? npcBlaster.quality : 0,
    };
    return { slug, blaster };
  }
  return { error: "This combatant can't shoot slugs." };
}

// ---------------------------------------------------------------------------
// Break Wall / Make Wall / Build Bridge -- Shoot Slug against a bare map
// point instead of a combatant. See docs/combat-system-design.md.
// ---------------------------------------------------------------------------

// The actual terrain mutation (and its combat-shot-resolved reveal) is
// delayed to land when the bolt's flight animation would actually arrive --
// same reasoning as the old scheduleWallBreak/scheduleKnockback: nothing
// should visibly change on the map before the projectile gets there.
async function applyEnvironmentEffect({ actionType, attacker, slug, tb, attackerPos, finalPoint, hit, fxId }) {
  const encounterId = attacker.encounter_id;
  let impactPoint = finalPoint;
  let log;
  let newPlant = null;

  if (actionType === "break-wall") {
    if (slugHasTrait(slug, "phase")) {
      // Dark slugs phase through walls, they don't break them -- there's
      // nothing for a Break Wall action to actually do.
      log = `${attacker.name}'s ${slug.name} phases straight through -- there's nothing solid enough for it to break.`;
    } else {
      const row = (await pool.query("SELECT walls, bridges, next_wall_id, zones FROM encounters WHERE id = $1", [encounterId])).rows[0];
      const walls = row?.walls || [];
      const bridges = row?.bridges || [];
      const wallHit = firstWallHit(attackerPos, finalPoint, walls);
      if (wallHit && isInsideAnyZone(row?.zones, wallHit.hit, "anchor")) {
        // Anchorage's zone -- nothing here can be broken while it's up.
        impactPoint = wallHit.hit;
        log = `${attacker.name}'s ${slug.name} slams into the wall, but some anchoring force keeps it standing!`;
      } else if (wallHit) {
        impactPoint = wallHit.hit;
        if (wallHit.wall.source === "slug") {
          // A player-made wall breaks outright -- unlike a DM wall, there's
          // no partial trim.
          const nextWalls = walls.filter((w) => w.id !== wallHit.wall.id);
          await pool.query("UPDATE encounters SET walls = $1 WHERE id = $2", [JSON.stringify(nextWalls), encounterId]);
          log = `${attacker.name}'s ${slug.name} smashes the wall to pieces!`;
        } else {
          const pieces = breakWallSegment(wallHit.wall, wallHit.hit);
          const nextWalls = walls.filter((w) => w.id !== wallHit.wall.id);
          let nextId = row.next_wall_id;
          for (const piece of pieces) {
            nextWalls.push({ id: nextId, source: wallHit.wall.source || "dm", ...piece });
            nextId += 1;
          }
          await pool.query("UPDATE encounters SET walls = $1, next_wall_id = $2 WHERE id = $3", [
            JSON.stringify(nextWalls),
            nextId,
            encounterId,
          ]);
          log = `${attacker.name}'s ${slug.name} blasts a hole in the wall!`;
        }
      } else {
        const bridgeHit = bridges.find((b) => pointInBridge(finalPoint, b));
        if (bridgeHit) {
          const nextBridges = bridges.filter((b) => b.id !== bridgeHit.id);
          await pool.query("UPDATE encounters SET bridges = $1 WHERE id = $2", [JSON.stringify(nextBridges), encounterId]);
          log = `${attacker.name}'s ${slug.name} collapses the bridge!`;
        } else {
          log = `${attacker.name}'s ${slug.name} finds nothing to break.`;
        }
      }
    }
  } else if (actionType === "make-wall") {
    const envScale = loyaltyEnvScale(slug.loyalty_tier);
    const seg = perpendicularSegment(attackerPos, finalPoint, Math.round(WALL_MAKER_LENGTH * envScale));
    const row = (await pool.query("SELECT walls, next_wall_id FROM encounters WHERE id = $1", [encounterId])).rows[0];
    const wallId = row?.next_wall_id ?? 1;
    const walls = [...(row?.walls || []), { id: wallId, source: "slug", slugType: slug.type, ...seg }];
    await pool.query("UPDATE encounters SET walls = $1, next_wall_id = $2 WHERE id = $3", [
      JSON.stringify(walls),
      wallId + 1,
      encounterId,
    ]);
    log = `${attacker.name}'s ${slug.name} raises a wall!`;
  } else if (actionType === "build-bridge") {
    const angle = angleBetween(attackerPos, finalPoint);
    const envScale = loyaltyEnvScale(slug.loyalty_tier);
    const row = (await pool.query("SELECT bridges, next_bridge_id FROM encounters WHERE id = $1", [encounterId])).rows[0];
    const bridgeId = row?.next_bridge_id ?? 1;
    const bridges = [
      ...(row?.bridges || []),
      { id: bridgeId, x: finalPoint.x, y: finalPoint.y, angle, width: Math.round(BRIDGE_WIDTH * envScale), length: Math.round(BRIDGE_LENGTH * envScale), slugType: slug.type },
    ];
    await pool.query("UPDATE encounters SET bridges = $1, next_bridge_id = $2 WHERE id = $3", [
      JSON.stringify(bridges),
      bridgeId + 1,
      encounterId,
    ]);
    log = `${attacker.name}'s ${slug.name} builds a bridge!`;
  } else if (actionType === "summon-plant") {
    // Shot at the ground: a carnivorous bloom takes root there -- short of the
    // first wall in the way, and inside the map. It bites right away if an
    // enemy is already within reach (see plantBiteNearby, run after the log).
    const row = (await pool.query("SELECT walls, map_width, map_height FROM encounters WHERE id = $1", [encounterId])).rows[0];
    const wallHit = firstWallHit(attackerPos, finalPoint, row?.walls || []);
    let spot = finalPoint;
    if (wallHit) {
      const t = Math.max(0, wallHit.hit.t - 0.05);
      spot = { x: attackerPos.x + (finalPoint.x - attackerPos.x) * t, y: attackerPos.y + (finalPoint.y - attackerPos.y) * t };
    }
    spot = clampToMapBounds(spot, row?.map_width ?? 1600, row?.map_height ?? 900);
    impactPoint = spot;
    newPlant = await spawnCarnivorousPlant(attacker, slug, spot);
    log = `${attacker.name}'s ${slug.name} takes root -- a carnivorous bloom sprouts and snaps at anything that wanders close!`;
  } else if (actionType === "grapple") {
    // The shooter reels themselves across to whatever the line hooks: the first
    // wall along the shot, or a bridge at the aimed point. Nothing to hook =
    // nothing happens. See grappleDestination for the distance cap.
    const row = (await pool.query("SELECT walls, bridges, zones, hazards, map_width, map_height FROM encounters WHERE id = $1", [encounterId])).rows[0];
    const walls = row?.walls || [];
    const mover = await getCombatant(attacker.id);
    const from = { x: mover.x, y: mover.y };
    const wallHit = firstWallHit(from, finalPoint, walls);
    const bridgeHit = wallHit ? null : (row?.bridges || []).find((b) => pointInBridge(finalPoint, b));
    const anchor = wallHit ? wallHit.hit : bridgeHit ? finalPoint : null;
    const anchorName = wallHit ? "wall" : "bridge";
    if (!anchor) {
      log = `${attacker.name}'s ${slug.name} finds nothing to grab hold of.`;
    } else if (isInsideAnyZone(row?.zones, from, "anchor")) {
      impactPoint = anchor;
      log = `${attacker.name}'s ${slug.name} hooks the ${anchorName}, but some anchoring force holds ${attacker.name} in place!`;
    } else {
      impactPoint = anchor;
      const pull = grappleDestination(from, anchor, withMapEdges(walls, row?.map_width, row?.map_height), { stopShort: wallHit ? GRAPPLE_WALL_STOP_DISTANCE : 0 });
      if (pull.moved < 1) {
        log = `${attacker.name}'s ${slug.name} hooks the ${anchorName}, but ${attacker.name} is already right there.`;
      } else {
        await updateCombatant(mover.id, { x: pull.point.x, y: pull.point.y });
        await plantBites(await getCombatant(mover.id), { fromPos: from });
        // Mirage Coil's decoys shadow their owner's position, same as on a Move.
        for (const decoyId of mover.status_effects?.mirage?.decoyIds || []) {
          const decoy = await getCombatant(decoyId);
          const offset = decoy?.data?.offset || { dx: 0, dy: 0 };
          await updateCombatant(decoyId, { x: pull.point.x + offset.dx, y: pull.point.y + offset.dy });
        }
        log = `${attacker.name}'s ${slug.name} hooks the ${anchorName} and reels ${attacker.name} ${Math.round(pull.moved)} units across the field!`;
        // Reeled across a damaging patch: applies for the whole line, not just the landing spot.
        await applyPathHazards(mover.id, from, pull.point, { hazards: row?.hazards, verb: "is reeled through" });
      }
    }
  }

  if (!hit) log = `${attacker.name}'s ${slug.name} goes wide -- ${log.charAt(0).toLowerCase()}${log.slice(1)}`;

  broadcastShotResolved({ fxId }, { outcome: hit ? "hit" : "miss", impactPoint });
  await pushCombatLog(encounterId, log);
  await broadcastEncounter(encounterId);
  if (newPlant) await plantBiteNearby(newPlant);
}

async function resolveEnvironmentShot({ actionType, attacker, slug, blaster, tb, targetPoint, encounterRow, fxId, firedAt }) {
  const attackerPos = { x: attacker.x, y: attacker.y };
  // The weapon's own range and the slug type's own range stack -- a
  // long-ranged type in a long-ranged weapon reaches further than either
  // alone. See the identical comment on the main Attack flow's own
  // combinedRange below.
  const combinedRange = blaster.range + tb.range;
  const rawDist = distance(attackerPos, targetPoint);
  const dist = Math.min(rawDist, combinedRange);
  const intendedPoint = rawDist <= combinedRange ? targetPoint : pointAtDistance(attackerPos, targetPoint, combinedRange);

  // Same accuracy formula as a normal attack roll, but against a flat
  // ENV_ACTION_DC instead of a defender's DEX -- there's no combatant here
  // to compute a real DC from.
  const quality = QUALITY_TIERS[blaster.quality] || QUALITY_TIERS[0];
  const penalty = rangePenalty(dist, combinedRange);
  const attackTotal =
    (gearDisadvantage(attacker) ? Math.min(rollD20(), rollD20()) : rollD20()) +
    gearAccuracyMod(attacker) +
    blaster.accuracy +
    (await blasterModTotal(blaster, "accuracy_bonus")) +
    quality.accuracyBonus +
    tb.accuracyMod +
    penalty +
    loyaltyAccuracyModifier(slug.loyalty_tier) +
    blasterTypeAccuracyBonus(blaster, attacker) - // Bow adds the shooter's DEX modifier
    (effectiveMode(attacker) === "bike" ? BIKE_ACCURACY_PENALTY : 0);
  const hit = attackTotal >= ENV_ACTION_DC;
  // A miss runs the exact same effect logic, just a few degrees off target
  // -- a wall might land somewhere else, a different wall gets broken, or
  // the shot finds nothing at all. See missDeflection.
  let finalPoint = hit ? intendedPoint : missDeflection(attackerPos, intendedPoint, encounterRow.walls);
  let flightDist = dist;

  // "Breaks the first wall it hits": a click on (or just short of) a wall must
  // still count -- the bolt keeps flying along that line, out to the weapon's
  // reach, until something solid stops it. Testing only the segment up to the
  // exact clicked point missed whenever the click landed a hair before the
  // wall (or float error put the crossing at t just over 1), and the shot
  // "found nothing to break". The impact point is nudged just past the wall
  // so the later segment test is never a coin-flip on the exact crossing.
  if (hit && actionType === "break-wall" && !slugHasTrait(slug, "phase")) {
    const len = distance(attackerPos, intendedPoint) || 1;
    const reachEnd = {
      x: attackerPos.x + ((intendedPoint.x - attackerPos.x) / len) * Math.max(combinedRange, len),
      y: attackerPos.y + ((intendedPoint.y - attackerPos.y) / len) * Math.max(combinedRange, len),
    };
    const wallAlongLine = firstWallHit(attackerPos, reachEnd, encounterRow.walls);
    if (wallAlongLine) {
      const reachLen = distance(attackerPos, reachEnd) || 1;
      const t = Math.min(1, wallAlongLine.hit.t + 2 / reachLen);
      finalPoint = { x: attackerPos.x + (reachEnd.x - attackerPos.x) * t, y: attackerPos.y + (reachEnd.y - attackerPos.y) * t };
      flightDist = distance(attackerPos, finalPoint);
    }
  }

  const speed = await blasterEffectiveSpeed(blaster, attacker);

  // Break Wall needs the slug to finish winding up before it reaches the wall,
  // exactly like an Attack on a close target (see shotTooClose in the shoot
  // route) -- a wall inside that distance can't be broken, and saying "finds
  // nothing to break" there was misleading.
  if (actionType === "break-wall" && !slugHasTrait(slug, "phase")) {
    const wallAhead = firstWallHit(attackerPos, finalPoint, encounterRow.walls);
    const breakDist = wallAhead ? wallAhead.hit.t * distance(attackerPos, finalPoint) : distance(attackerPos, finalPoint);
    if (shotTooClose(breakDist, speed, slug)) {
      await recordShotResult(attacker.encounter_id, attacker, null, "too_close", slug);
      broadcastShotFx({
        fxId,
        attackerCombatantId: attacker.id,
        targetCombatantId: null,
        attackerPos,
        targetPos: attackerPos,
        impactPoint: attackerPos,
        slug,
        windowMs: 0,
        outcome: "too-close",
      });
      await pushCombatLog(
        attacker.encounter_id,
        `${attacker.name}'s ${slug.name} doesn't have enough time to wind up before reaching ${wallAhead ? "the wall" : "that spot"}, so it can't break it. Stand further back.`
      );
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return { pending: false, encounter };
    }
  }

  const windowMs = shotFlightMs(flightDist, speed, slug);

  broadcastShotFx({
    fxId,
    attackerCombatantId: attacker.id,
    targetCombatantId: null,
    attackerPos,
    targetPos: finalPoint,
    impactPoint: finalPoint,
    slug,
    windowMs,
    windupFraction: shotWindupFraction(flightDist, speed, slug),
    countered: false,
    outcome: null,
  });

  const encounter = await broadcastEncounter(attacker.encounter_id); // AP/energy spend only -- the terrain mutation lands later

  const delayMs = Math.max(0, windowMs * SHOT_FLIGHT_MULTIPLIER);
  setTimeout(() => {
    applyEnvironmentEffect({ actionType, attacker, slug, tb, attackerPos, finalPoint, hit, fxId }).catch((err) =>
      console.error("Could not resolve environment shot:", err)
    );
  }, delayMs);

  return { pending: false, encounter };
}

// Whether a weapon can fire dual shots: a Twin Slinger always can, and any
// other blaster can if it has a mod with grants_dual_shot equipped (mods only
// ever belong to players, so an NPC's blaster needs to be a Twin Slinger).
async function blasterCanDualShot(blaster) {
  if (blaster.base_type === DUAL_SHOT_BASE_TYPE) return true;
  if (!blaster.id) return false;
  const { rows } = await pool.query("SELECT 1 FROM mods WHERE equipped_blaster_id = $1 AND grants_dual_shot LIMIT 1", [blaster.id]);
  return rows.length > 0;
}

// A shooter picked a slug but hasn't chosen a target yet. Purely a heads-up
// so every connected client can fetch and cache that slug's art now, and have
// it ready the instant a counter window opens -- nothing here changes combat
// state. Best-effort by design: a lost or overwritten signal just means the
// image is fetched a moment later (see the shot-fx and counter-offered
// fallbacks), never a wrong result.
router.post("/actions/arm-slug", async (req, res) => {
  const { attackerId, slugId } = req.body || {};
  if (!Number.isInteger(slugId)) return res.status(400).json({ error: "Choose a slug." });
  try {
    const attacker = await getCombatant(attackerId);
    if (!attacker) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [attacker.encounter_id])).rows[0];
    if (!encounterRow || !isActingCombatantAuthorized(req, attacker, encounterRow)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    const slug = (await pool.query("SELECT id, user_id, owner_combatant_id FROM slugs WHERE id = $1", [slugId])).rows[0];
    const ownsSlug =
      slug &&
      ((attacker.kind === "character" && slug.user_id === attacker.ref_user_id) ||
        (attacker.kind === "npc" && slug.owner_combatant_id === attacker.id));
    if (!ownsSlug) return res.status(400).json({ error: "That slug isn't yours." });
    broadcastAll({ type: "combat-slug-armed", slugId: slug.id, at: Date.now() });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not arm slug." });
  }
});

router.post("/actions/shoot", async (req, res) => {
  const { attackerId, targetId, targetPoint, slugId, npcSlug, npcBlaster, actionType: rawActionType, effectChoice } = req.body || {};
  const actionType = ["break-wall", "make-wall", "build-bridge", "grapple", "summon-plant"].includes(rawActionType) ? rawActionType : "attack";
  // A Mega Morph is a variant of Attack (it targets a slinger), so it rides
  // along as a flag on an "attack" instead of being its own action type.
  const megaMorph = actionType === "attack" && req.body?.megaMorph === true;
  // Same for a dual shot: an Attack with a second slug (partnerSlugId).
  const partnerSlugId = actionType === "attack" && Number.isInteger(req.body?.partnerSlugId) ? req.body.partnerSlugId : null;
  const dualShot = partnerSlugId !== null;
  try {
    const attacker = await getCombatant(attackerId);
    if (!attacker) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [attacker.encounter_id])).rows[0];
    if (!encounterRow) return res.status(404).json({ error: "Encounter not found." });
    if (!isActingCombatantAuthorized(req, attacker, encounterRow)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounterRow, attacker)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (attacker.unconscious || attacker.disabled) return res.status(400).json({ error: "This combatant can't act." });
    // Cynosure: a disarmed combatant can't Shoot Slug at all this turn --
    // no Attack, no Break/Make Wall, no Build Bridge, same blanket lockout
    // shape as the snared-can't-Move check in /actions/move.
    if (attacker.status_effects?.disarmed?.turnsLeft > 0) {
      return res.status(400).json({ error: "This combatant's blaster is disabled and can't be fired." });
    }

    let target = null;
    if (actionType === "attack") {
      target = await getCombatant(targetId);
      if (!target || isBurrowed(target)) return res.status(404).json({ error: "Target not found." });
    } else if (!targetPoint || !Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y)) {
      return res.status(400).json({ error: "A target location is required." });
    }

    const resolved = await resolveShooterSlugAndBlaster(attacker, req, { slugId, npcSlug, npcBlaster });
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    const { blaster } = resolved;

    // Dual shot: a second slug from the same weapon fired together with the
    // first as one fused bolt (see buildDualShotSlug). Everything below this
    // block just sees "the slug" -- the fused one.
    let shotSlug = resolved.slug;
    let partner = null;
    if (dualShot) {
      if (!(await blasterCanDualShot(blaster))) {
        return res.status(400).json({ error: "This weapon can't fire a dual shot -- it needs to be a Twin Slinger, or carry a mod that allows it." });
      }
      const partnerResolved = await resolveShooterSlugAndBlaster(attacker, req, { slugId: partnerSlugId });
      if (partnerResolved.error) return res.status(400).json({ error: partnerResolved.error });
      if (partnerResolved.blaster.id !== blaster.id) {
        return res.status(400).json({ error: "Both slugs of a dual shot must be loaded in the same weapon." });
      }
      const pairError = dualShotPairError(resolved.slug, partnerResolved.slug);
      if (pairError) return res.status(400).json({ error: pairError });
      partner = partnerResolved.slug;
      shotSlug = buildDualShotSlug(resolved.slug, partner);
    }

    if (megaMorph) {
      // With a dual shot, BOTH slugs must be able to Mega Morph and each
      // burns MEGA_MORPH_PIP_COST pips.
      for (const s of [resolved.slug, partner].filter(Boolean)) {
        if (!s.mega_morph_allowed) {
          return res.status(400).json({ error: `${s.name} isn't able to Mega Morph.` });
        }
        const livePips = Array.isArray(s.energy_pips) ? s.energy_pips.filter(Boolean).length : 0;
        if (livePips < MEGA_MORPH_PIP_COST) {
          return res.status(400).json({ error: `A Mega Morph burns ${MEGA_MORPH_PIP_COST} energy pips -- ${s.name} only has ${livePips}.` });
        }
      }
      // Effective speed (base + any equipped mods' speed_bonus) -- a
      // Range-Finder-tier mod boosting a borderline weapon's speed can push
      // it over the threshold same as it would for a normal shot's flight.
      if ((await blasterEffectiveSpeed(blaster, attacker)) < MEGA_MORPH_MIN_SPEED) {
        return res.status(400).json({ error: `A Mega Morph needs a weapon with a speed of at least ${MEGA_MORPH_MIN_SPEED}.` });
      }
    }
    // Cannon lends +3 clash power to whatever it fires (see
    // applyBlasterTypeToSlug) -- a cloned slug, so the DB row is untouched and
    // the boost rides through both the clash comparison and the hit's damage.
    // A Mega Morph then doubles that effective number.
    const boostedSlug = applyBlasterTypeToSlug(blaster, shotSlug);
    const megaSlug = megaMorph ? applyMegaMorphToSlug(boostedSlug) : boostedSlug;
    // Fandango's power surge: if a power_surge slug already flew earlier this
    // turn, this shot's power is doubled as the very last step -- after
    // loyalty, Cannon, Mega Morph and a dual shot's fusing -- so it doubles
    // the finished number. The surge is set up further down, only once the
    // shot that grants it has actually launched, so that shot never doubles
    // itself.
    const surged = Boolean(attacker.status_effects?.powerSurge);
    const slug = surged ? applyPowerSurgeToSlug(megaSlug) : megaSlug;
    // Gatling fires everything for 2 less AP (floored at 1). Every AP check
    // and spend below this point uses shotApCost, not the slug's raw ap_cost.
    const shotApCost = gatlingShotApCost(blaster, slug.ap_cost);

    if (actionType === "break-wall" && !slug.breaks_walls) {
      return res.status(400).json({ error: "That slug can't break walls." });
    }
    if (actionType === "make-wall" && !slug.wall_maker) {
      return res.status(400).json({ error: "That slug can't make walls." });
    }
    if (actionType === "build-bridge" && !slug.bridge_maker) {
      return res.status(400).json({ error: "That slug can't build bridges." });
    }
    if (actionType === "summon-plant" && !slug.summons_plant) {
      return res.status(400).json({ error: "That slug can't summon a plant." });
    }
    if (actionType === "grapple") {
      if (!slug.grapple) return res.status(400).json({ error: "That slug can't grapple." });
      // Grappling reels the shooter across the field -- not something a mecha
      // (or its rider) or a snared slinger can do.
      if (attacker.kind === "mecha" || attacker.mounted_on != null) {
        return res.status(400).json({ error: "You can't grapple while riding a mecha." });
      }
      if (attacker.status_effects?.snared?.turnsLeft > 0) {
        return res.status(400).json({ error: "This combatant is snared and can't be pulled anywhere." });
      }
    }

    if (attacker.current_ap < shotApCost) return res.status(400).json({ error: "Not enough AP." });

    const attackerPos = { x: attacker.x, y: attacker.y };
    const tb = slugBallistics(slug);

    await updateCombatant(attacker.id, { current_ap: attacker.current_ap - shotApCost });
    // Every slug that flies -- both halves of a dual shot -- burns its pips
    // and starts its own return-to-hand cooldown.
    for (const id of shotSlugIds(slug)) {
      if (id != null) await spendEnergyPip(id, megaMorph ? MEGA_MORPH_PIP_COST : 1);
    }
    // One trigger pull, one dose of wear -- a dual shot still fires one weapon.
    if (attacker.kind === "character") await wearBlaster(blaster);
    if (dualShot) {
      const { comboName } = slug.dual;
      await pushCombatLog(
        attacker.encounter_id,
        `${attacker.name} fires a DUAL SHOT -- ${slug.dual.primaryName} + ${slug.dual.partnerName}${comboName ? `: ${comboName}!` : "!"}`
      );
    }
    if (megaMorph) {
      await pushCombatLog(attacker.encounter_id, `${attacker.name}'s ${slug.name} MEGA MORPHS!`);
    }

    await recordCombatEvent(attacker.encounter_id, "shot", {
      actor: attacker,
      target,
      action: actionType,
      slug: slug.name,
      slugType: slug.type,
      ap: shotApCost,
      mega: megaMorph,
      dual: dualShot,
    });
    for (const fired of [resolved.slug, partner].filter(Boolean)) await revealFiredSlug(attacker, fired);

    // Ties together this shot's launch broadcast, its later resolve
    // broadcast, and (if a counter is offered) the pending-counter entry --
    // so the client can find its way back to the same in-flight ShotEffect
    // instance no matter how the shot ultimately resolves.
    const fxId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Real wall-clock moment the launch broadcast goes out -- lets anything
    // timing-sensitive (e.g. applyEnvironmentEffect's delay) anchor to when
    // the client's animation actually started, not to whenever the shot
    // happens to finish resolving.
    const firedAt = Date.now();

    // A misfire never leaves the barrel -- there's nothing to launch, and
    // (for an Attack) nothing for a defender to counter. Rolled here, up
    // front, before anything launches, shared by every action type. A
    // standing "jammed" status (from an earlier causes_jam hit -- see
    // dealHit/resolveNormalHit) forces this same outcome once, then clears
    // itself, same as a quality-tier misfire otherwise would.
    const quality = QUALITY_TIERS[blaster.quality] || QUALITY_TIERS[0];
    const wasJammed = Boolean(attacker.status_effects?.jammed);
    if (wasJammed || Math.random() * 100 < quality.failRate) {
      if (wasJammed) {
        await updateCombatant(attacker.id, {
          status_effects: JSON.stringify({ ...(attacker.status_effects || {}), jammed: false }),
        });
      }
      if (actionType === "attack") await recordShotResult(attacker.encounter_id, attacker, target, "jam", slug);
      broadcastShotFx({
        fxId,
        attackerCombatantId: attacker.id,
        targetCombatantId: target?.id ?? null,
        attackerPos,
        targetPos: attackerPos,
        impactPoint: attackerPos,
        slug,
        windowMs: 0,
        outcome: "jam",
      });
      await pushCombatLog(
        attacker.encounter_id,
        wasJammed
          ? `${attacker.name}'s ${slug.name} is still fried from that last hit -- the shot misfires!`
          : `${attacker.name}'s ${slug.name} misfires! The shot is wasted.`
      );
      // A player's misfire shatters the pod the slug was riding in; it stays
      // out of the weapon until a Reload spends a spare. NPCs/grunts have
      // infinite pods, so they skip this entirely.
      if (attacker.kind === "character") await breakPods(attacker, shotSlugIds(slug));
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    // The shot left the barrel -- each slug in it earns a little loyalty.
    await recordSlugShots(attacker, shotSlugIds(slug));

    // ...and a power_surge slug (Fandango, alone or as half
    // of a dual shot) now doubles every other shot this slinger fires for the
    // rest of the turn -- cleared again in advanceTurn.
    if (slug.power_surge) {
      await updateCombatant(attacker.id, {
        status_effects: JSON.stringify({ ...(attacker.status_effects || {}), powerSurge: true }),
      });
      await pushCombatLog(
        attacker.encounter_id,
        `${attacker.name}'s ${slug.name} surges with power -- every other shot they fire this turn has its power doubled!`
      );
    }
    if (surged) {
      await pushCombatLog(attacker.encounter_id, `${attacker.name}'s ${slug.name} is surging -- its power is doubled!`);
    }

    if (actionType !== "attack") {
      const result = await resolveEnvironmentShot({ actionType, attacker, slug, blaster, tb, targetPoint, encounterRow, fxId, firedAt });
      return res.json(result);
    }

    // ---- Attack a Slinger: the original targeted-shot flow -------------

    const targetPos = { x: target.x, y: target.y };
    // tb.range already has RANGE_SCALE baked in (combatRules.js) -- don't
    // scale it again here, and blaster.range is intentionally left at its
    // raw stored value (see itemRules.js) rather than migrated. The
    // weapon's own range and the slug type's own range stack -- a
    // long-reach type (e.g. Air) fired from a long-range Sniper Rig reaches
    // further than either alone. dist can therefore exceed blaster.range on
    // its own (whenever the type contributes real reach past it) -- that's
    // fine now that the bolt's speed (see shotFlightMs) is its own explicit
    // stat rather than derived from range, so ground covered past the
    // weapon's own range still crosses at that same fixed speed, just
    // taking proportionally longer.
    const combinedRange = blaster.range + tb.range;
    const dist = distance(attackerPos, targetPos);
    // Sums any equipped mods' speed_bonus onto the weapon's own base speed
    // (see blasterEffectiveSpeed) -- computed once and reused for every
    // speed-driven check below so they all agree on the same number.
    const speed = await blasterEffectiveSpeed(blaster, attacker);
    // A self-buff has zero distance to cross -- there's no aim, no travel,
    // and (per resolveNormalHit's isSelfShot check) it always connects, so
    // it must never be gated on how long the flight would otherwise take.
    // Without this, every self-target shot has dist === 0, which always
    // trips shotTooClose below and fails outright, no matter the weapon.
    const isSelfShot = target.id === attacker.id;

    // Point-blank failure: at this weapon's own effective speed (see
    // shotFlightMs), the target is close enough that the shot would have to
    // land before the slug even finishes its fixed windup out of the
    // barrel. That can't happen -- the windup never compresses -- so the
    // shot just fails outright instead, exactly like a jam (no launch, no
    // counter offered). Being too close is bad.
    if (!isSelfShot && shotTooClose(dist, speed, slug)) {
      await recordShotResult(attacker.encounter_id, attacker, target, "too_close", slug);
      broadcastShotFx({
        fxId,
        attackerCombatantId: attacker.id,
        targetCombatantId: target.id,
        attackerPos,
        targetPos: attackerPos,
        impactPoint: attackerPos,
        slug,
        windowMs: 0,
        outcome: "too-close",
      });
      await pushCombatLog(
        attacker.encounter_id,
        `${attacker.name}'s ${slug.name} is fired at point-blank range -- it never has time to arm before it'd hit, and the shot fizzles!`
      );
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    // Neither running out of range nor a wall in the way rejects the shot or
    // tells the shooter why -- it always fires, always costs the AP/energy,
    // and whichever stops it first (max range, or a wall it can't phase
    // through) just clamps where the animation lands. Wall-breaking is no
    // longer something an Attack does in passing -- see the dedicated Break
    // Wall action above; a wall always fully blocks an Attack now, Dark's
    // phase trait aside.
    const wallHit = firstWallHit(attackerPos, targetPos, encounterRow.walls);
    // Bladier: the one slug whose Attack punches straight through the first
    // wall in its path instead of being stopped by it (or needing the
    // separate Break Wall action) -- see the scheduled break below.
    const phases = slugHasTrait(slug, "phase");
    const pierces = Boolean(wallHit) && slug.pierces_walls && !phases;
    const wallBlocks = Boolean(wallHit) && !phases && !pierces;
    const wallDist = wallBlocks ? wallHit.hit.t * dist : Infinity;
    const stopDist = Math.min(combinedRange, wallDist);
    const reaches = dist <= stopDist;
    const impactPoint = reaches ? targetPos : pointAtDistance(attackerPos, targetPos, stopDist);

    // Driven by the equipped weapon's own explicit speed stat (Zeus's
    // ultra_fast and a Mega Morph bump that speed further still) and how
    // much ground there is to cross -- see shotFlightMs's comment. Never
    // the other way around: dist never changes the bolt's *speed*, only how
    // much of the fixed reaction window is left to react in.
    const rawWindowMs = shotFlightMs(dist, speed, slug);
    // Perplexus's slowedReaction/enhancedReaction modify the *target's* own
    // window regardless of the shooter's own ultra_fast -- see
    // reactionWindowFactor.
    const windowMs = Math.round(rawWindowMs * reactionWindowFactor(target.status_effects));

    const offer = {
      fxId,
      firedAt,
      encounterId: attacker.encounter_id,
      attackerCombatantId: attacker.id,
      targetCombatantId: target.id,
      attackerName: attacker.name,
      targetName: target.name,
      slug,
      blaster,
      attackerPos,
      targetPos,
      impactPoint,
      windowMs,
      windupFraction: shotWindupFraction(dist, speed, slug),
      // Perplexus/Psi: the client's pre-fire effect picker, already narrowed
      // to whichever pool this shot's targeting actually allows -- see
      // dealHit's mind_scramble/friction_shift blocks, which each
      // re-validate against their own pool and fall back to a random pick
      // if this is missing/invalid (an NPC fired without the picker, e.g.).
      effectChoice: slug.mind_scramble || slug.friction_shift ? effectChoice : null,
    };

    // Fandango's confusion: a *complete* 180-degree misfire chance on the
    // confused combatant's own shots (not the ordinary small missDeflection
    // wobble) -- checked before anything else about this shot's outcome is
    // decided. On a trigger it bypasses the accuracy roll and any counter
    // offer entirely; the bolt just goes the wrong way, full stop. AP/energy
    // are already spent above either way -- confusion doesn't refund the
    // attempt, it just ruins its aim.
    if (attacker.status_effects?.confused && Math.random() < CONFUSION_CHANCE) {
      const wildPoint = confusedDeflection(attackerPos, impactPoint, encounterRow.walls);
      await recordShotResult(attacker.encounter_id, attacker, target, "wild", slug);
      broadcastShotFx({ ...offer, outcome: null });
      broadcastShotResolved(offer, { outcome: "miss", impactPoint: wildPoint });
      scheduleAfterFlight(firedAt, windowMs, async () => {
        let log = `${attacker.name}'s ${slug.name} goes completely haywire, firing a full 180 off target!`;
        if (slug.aoe_blast) {
          const caught = await findAoeTargets(attacker.encounter_id, wildPoint, [attacker.id], aoeRadiusMult(slug));
          if (caught.length > 0) {
            log += " It still detonates!";
            for (const other of caught) {
              const splashLog = await dealHit(attacker.encounter_id, attacker.id, other.id, slug, { isSplash: true });
              log += ` The blast catches ${other.name}: ${splashLog}`;
            }
          }
        }
        await pushCombatLog(attacker.encounter_id, log);
        await broadcastEncounter(attacker.encounter_id);
      });
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    // Lentus: crosswinds bend the course of ANY shot (not gated on the
    // shooter's own slug -- this is a purely environmental hazard) whose
    // straight-line path from attacker to its already-determined impact
    // point passes within a live crosswind zone. Rolls 0-180 recentered on
    // 90 as "no change" -- on anything else, the shot veers off by that
    // many degrees and the whole thing resolves as a miss at the new point,
    // same short-circuit shape as Fandango's confusion just above (which
    // this can't stack with -- confusion already returned before this ever
    // runs). Checked once per shot; multiple overlapping crosswind zones
    // still only get the one roll.
    const crosswindZone = (encounterRow.zones || []).find(
      (z) => z.kind === "crosswind" && distanceToSegment({ x: z.x, y: z.y }, attackerPos, impactPoint) <= z.radius
    );
    if (crosswindZone) {
      const offsetDeg = rollCrosswindOffset();
      if (offsetDeg !== 0) {
        const windPoint = rotateDeflection(attackerPos, impactPoint, offsetDeg, encounterRow.walls);
        await recordShotResult(attacker.encounter_id, attacker, target, "crosswind", slug);
        broadcastShotFx({ ...offer, outcome: null });
        broadcastShotResolved(offer, { outcome: "miss", impactPoint: windPoint });
        scheduleAfterFlight(firedAt, windowMs, async () => {
          let log = `${attacker.name}'s ${slug.name} gets caught in a crosswind and veers ${Math.abs(offsetDeg)} degrees off course!`;
          if (slug.aoe_blast) {
            const caught = await findAoeTargets(attacker.encounter_id, windPoint, [attacker.id], aoeRadiusMult(slug));
            if (caught.length > 0) {
              log += " It still detonates!";
              for (const other of caught) {
                const splashLog = await dealHit(attacker.encounter_id, attacker.id, other.id, slug, { isSplash: true });
                log += ` The blast catches ${other.name}: ${splashLog}`;
              }
            }
          }
          await pushCombatLog(attacker.encounter_id, log);
          await broadcastEncounter(attacker.encounter_id);
        });
        const encounter = await broadcastEncounter(attacker.encounter_id);
        return res.json({ pending: false, encounter });
      }
      // offsetDeg === 0 -- "stays its course": fall through to normal
      // resolution exactly as if the zone weren't there.
    }

    // Everything else actually launches: the bolt starts flying and the
    // launch sound plays immediately, right now, the instant the AP is
    // spent -- not delayed until the shot finishes resolving. Whatever
    // happens next (a miss, a hit, falling short, or a counter-clash)
    // arrives later as a separate combat-shot-resolved update, layered onto
    // this same already-playing animation instead of holding up its start.
    // (The actual broadcastShotFx call is inside launchAndOfferCounter,
    // below -- kept there so it's shared with Speedstinger's ricochet leg,
    // which launches the exact same way but isn't a real HTTP request.)

    // Any terrain the slug leaves -- ice/damage patch, Regulator's star
    // wall, Anchorage's zone, a fire trail, Pressure Tick's steam pods,
    // Caligo's fire-terrain clear/steam patch, Cynosure's disarm field -- is
    // a *result* of the shot landing, so it's delayed to the end of the
    // flight (and grown in client-side, see the encounter diffs in
    // CombatMap.jsx) rather than popping up mid-flight. Where it lands
    // depends on how the shot ends: scheduled here at impactPoint for a shot
    // no counter is offered for, but handed to resolveCounterOffer when one
    // is -- a countered slug that loses (or bounces) marks the clash point,
    // not a target it never reached. See applyShotTerrain / scheduleShotTerrain.

    // Bladier: the wall actually breaks once the bolt's flight would have
    // reached it, same delayed-resolution treatment as every other
    // terrain mutation tied to a shot (see WALL_BREAK_RADIUS's comment,
    // applyEnvironmentEffect's break-wall branch, which this mirrors).
    if (pierces) {
      scheduleAfterFlight(firedAt, windowMs, async () => {
        const row = (await pool.query("SELECT walls, next_wall_id, zones FROM encounters WHERE id = $1", [attacker.encounter_id])).rows[0];
        const walls = row?.walls || [];
        const stillThere = walls.find((w) => w.id === wallHit.wall.id);
        if (!stillThere) return; // already gone by the time the bolt got there
        if (isInsideAnyZone(row?.zones, wallHit.hit, "anchor")) {
          // Anchorage's zone -- the dagger still hits the target (the shot
          // already resolved as a normal hit above), the wall just holds.
          await pushCombatLog(attacker.encounter_id, `${attacker.name}'s ${slug.name} punches the wall, but some anchoring force keeps it standing!`);
          await broadcastEncounter(attacker.encounter_id);
          return;
        }
        if (stillThere.source === "slug") {
          const nextWalls = walls.filter((w) => w.id !== stillThere.id);
          await pool.query("UPDATE encounters SET walls = $1 WHERE id = $2", [JSON.stringify(nextWalls), attacker.encounter_id]);
        } else {
          const pieces = breakWallSegment(stillThere, wallHit.hit);
          const nextWalls = walls.filter((w) => w.id !== stillThere.id);
          let nextId = row.next_wall_id;
          for (const piece of pieces) {
            nextWalls.push({ id: nextId, source: stillThere.source || "dm", ...piece });
            nextId += 1;
          }
          await pool.query("UPDATE encounters SET walls = $1, next_wall_id = $2 WHERE id = $3", [
            JSON.stringify(nextWalls),
            nextId,
            attacker.encounter_id,
          ]);
        }
        await pushCombatLog(attacker.encounter_id, `${attacker.name}'s ${slug.name} punches straight through the wall!`);
        await broadcastEncounter(attacker.encounter_id);
      });
    }

    if (!reaches) {
      // Out of range / blocked by a wall: the shot still launches and flies,
      // but only as far as it can -- impactPoint is already clamped to the
      // range or the wall -- and fizzles there with the out-of-range reveal.
      // No counter is offered (nothing reaches the target). The flight is
      // timed to the ground it actually covers, not the full distance.
      const fizzleMs = Math.max(400, shotFlightMs(stopDist, speed, slug));
      const fizzleOffer = { ...offer, windowMs: fizzleMs, windupFraction: shotWindupFraction(stopDist, speed, slug) };
      await recordShotResult(attacker.encounter_id, attacker, target, "out_of_range", slug);
      broadcastShotFx({ ...fizzleOffer, outcome: null });
      broadcastShotResolved(fizzleOffer, { outcome: "out-of-range", impactPoint });
      scheduleAfterFlight(firedAt, fizzleMs, async () => {
        await pushCombatLog(attacker.encounter_id, wallBlocks && wallDist < combinedRange
            ? `${attacker.name}'s ${slug.name} is stopped by a wall before reaching ${target.name}.`
            : `${attacker.name}'s ${slug.name} is out of range of ${target.name}.`);
        await broadcastEncounter(attacker.encounter_id);
      });
      scheduleShotTerrain(fizzleOffer, impactPoint);
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    const result = await launchAndOfferCounter(offer);
    if (result.pending) {
      // A counter was offered -- resolveCounterOffer owns the terrain now
      // (clash point if the slug loses, target if it smashes through).
      return res.json({ pending: true, counterId: fxId, windowMs });
    }
    // No counter available: launchAndOfferCounter already ran resolveNormalHit,
    // which places the terrain itself at the real impact point (target on a
    // hit, the deflected wide point on a miss).
    const encounter = await broadcastEncounter(attacker.encounter_id);
    res.json({ pending: false, encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fire." });
  }
});

router.post("/counters/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const { slugId, dodge, reactedAtMs } = req.body || {};
  const offer = pendingCounters.get(id);
  if (!offer) return res.status(404).json({ error: "This counter window has already closed." });
  const authorized = offer.dmControlled ? req.user.role === "Dungeon Master" : offer.userId === req.user.sub;
  if (!authorized) return res.status(403).json({ error: "This counter isn't yours to make." });
  try {
    // Lag compensation: the client reports how long after firing it clicked,
    // by its own reckoning of the shot's clock. Judge the reaction at that
    // moment (capped, never in the future) instead of whenever the request
    // got here, so ping doesn't eat into the window.
    const now = Date.now();
    const reactedAt = Number.isFinite(reactedAtMs)
      ? Math.min(now, Math.max(now - COUNTER_LAG_COMP_MS, offer.firedAt + reactedAtMs))
      : now;
    // Clicked after the window really closed (only reachable via the grace
    // period) -- same as never answering.
    const tooLate = reactedAt - offer.firedAt > offer.windowMs;
    const result = tooLate
      ? await resolveCounterOffer(id, null)
      : dodge
        ? await resolveDodgeAttempt(id)
        : await resolveCounterOffer(id, Number.isInteger(slugId) ? slugId : null, reactedAt);
    res.json(result || { pending: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not resolve the counter." });
  }
});

// ---------------------------------------------------------------------------
// Knockout roll
// ---------------------------------------------------------------------------

router.post("/knockout/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const offer = pendingKnockouts.get(id);
  if (!offer) return res.status(404).json({ error: "This knockout roll has expired or was already made." });
  const authorized = offer.dmControlled ? req.user.role === "Dungeon Master" : offer.userId === req.user.sub;
  if (!authorized) return res.status(403).json({ error: "This roll isn't yours to make." });
  pendingKnockouts.delete(id);

  try {
    const roll = rollD20();
    const total = roll + offer.conMod;
    const success = total >= offer.dc;
    const combatant = await getCombatant(offer.combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });

    let updated;
    if (success) {
      const pips = (combatant.knockout_pips || [false, false, false]).slice();
      const idx = pips.findIndex((p) => !p);
      if (idx !== -1) pips[idx] = true;
      updated = await updateCombatant(combatant.id, { knockout_pips: JSON.stringify(pips), current_grit: combatant.max_grit });
    } else {
      updated = await updateCombatant(combatant.id, { unconscious: true });
    }
    await syncCharacterFromCombatant(updated);
    await recordCombatEvent(combatant.encounter_id, "ko_save", { actor: combatant, success, total, dc: offer.dc });
    if (!success) await recordCombatEvent(combatant.encounter_id, "down", { actor: combatant, reason: offer.reason });
    await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(
      combatant.encounter_id,
      success
        ? `${combatant.name} rolls ${total} vs DC ${offer.dc} -- shakes it off and gets back up!`
        : `${combatant.name} rolls ${total} vs DC ${offer.dc} -- falls unconscious.`
    );
    res.json({ success, roll, total, dc: offer.dc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not resolve the knockout roll." });
  }
});

router.post("/actions/revive", requireDungeonMaster, async (req, res) => {
  const { combatantId, grit } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    const newGrit = Number.isInteger(grit)
      ? Math.min(combatant.max_grit ?? grit, grit)
      : Math.ceil((combatant.max_grit || 0) / 2);
    const updated = await updateCombatant(combatant.id, { unconscious: false, current_grit: newGrit });
    await syncCharacterFromCombatant(updated);
    const encounter = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(combatant.encounter_id, `${combatant.name} is revived with ${newGrit} Grit.`);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not revive combatant." });
  }
});

// ---------------------------------------------------------------------------
// Mecha: mount / dismount / ram
// ---------------------------------------------------------------------------

router.post("/actions/mount", async (req, res) => {
  const { combatantId, mechaCombatantId } = req.body || {};
  try {
    const rider = await getCombatant(combatantId);
    const mecha = await getCombatant(mechaCombatantId);
    if (!rider || !mecha || mecha.kind !== "mecha") return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [rider.encounter_id])).rows[0];
    if (!isActingCombatantAuthorized(req, rider, encounterRow)) return res.status(403).json({ error: "That isn't your combatant." });
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounterRow, rider)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (rider.kind === "mecha") return res.status(400).json({ error: "A mecha can't ride another mecha." });
    if (rider.mounted_on != null) return res.status(400).json({ error: "Already mounted." });
    if (mecha.disabled) return res.status(400).json({ error: "That mecha is disabled." });
    if (rider.current_ap < MOUNT_AP_COST) return res.status(400).json({ error: "Not enough AP." });
    if (distance({ x: rider.x, y: rider.y }, { x: mecha.x, y: mecha.y }) > MOUNT_RANGE) {
      return res.status(400).json({ error: "Too far away to mount -- get within about one move." });
    }
    await updateCombatant(rider.id, {
      mounted_on: mecha.id,
      x: mecha.x,
      y: mecha.y,
      current_ap: rider.current_ap - MOUNT_AP_COST,
    });
    const encounter = await broadcastEncounter(rider.encounter_id);
    await pushCombatLog(rider.encounter_id, `${rider.name} mounts up on ${mecha.name}.`);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not mount." });
  }
});

router.post("/actions/dismount", async (req, res) => {
  const { combatantId } = req.body || {};
  try {
    const rider = await getCombatant(combatantId);
    if (!rider) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [rider.encounter_id])).rows[0];
    if (!isActingCombatantAuthorized(req, rider, encounterRow)) return res.status(403).json({ error: "That isn't your combatant." });
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounterRow, rider)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (!rider.mounted_on) return res.status(400).json({ error: "Not mounted on anything." });
    if (rider.current_ap < MOUNT_AP_COST) return res.status(400).json({ error: "Not enough AP." });
    await updateCombatant(rider.id, { mounted_on: null, current_ap: rider.current_ap - MOUNT_AP_COST, data: JSON.stringify({ ...(rider.data || {}), mode: null }) });
    const vehicleToReset = await getCombatant(rider.mounted_on);
    if (vehicleToReset) await updateCombatant(vehicleToReset.id, { data: JSON.stringify({ ...(vehicleToReset.data || {}), mode: null }) });
    const encounter = await broadcastEncounter(rider.encounter_id);
    await pushCombatLog(rider.encounter_id, `${rider.name} dismounts.`);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not dismount." });
  }
});

router.post("/actions/ram", async (req, res) => {
  const { mechaCombatantId, targetCombatantId } = req.body || {};
  try {
    const mecha = await getCombatant(mechaCombatantId);
    const target = await getCombatant(targetCombatantId);
    if (!mecha || mecha.kind !== "mecha" || !target || isBurrowed(target)) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [mecha.encounter_id])).rows[0];

    // Ram happens on the *rider's* turn now, not the mecha's -- an unmounted
    // mecha can never ram.
    const riders = await mechaRiders(mecha.id);
    if (riders.length === 0) return res.status(400).json({ error: "Only a mounted mecha can ram." });
    const isDM = req.user.role === "Dungeon Master";
    const myRider = riders.find((r) => r.ref_user_id === req.user.sub);
    if (!isDM && !myRider) return res.status(403).json({ error: "You aren't riding that mecha." });
    const turnRider = myRider || riders[0];
    if (!isDM && !requireOwnTurn(encounterRow, turnRider)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (mecha.disabled) return res.status(400).json({ error: "This mecha is disabled." });
    if (mecha.rammed_this_round) return res.status(400).json({ error: "This mecha already rammed this round." });
    if ((mecha.current_ap ?? 0) < RAM_AP_COST) return res.status(400).json({ error: "Not enough mecha AP to ram." });
    if (distance({ x: mecha.x, y: mecha.y }, { x: target.x, y: target.y }) > MOUNT_RANGE) {
      return res.status(400).json({ error: "Target isn't in ramming range." });
    }

    await updateCombatant(mecha.id, { current_ap: mecha.current_ap - RAM_AP_COST, rammed_this_round: true });

    const fromPos = { x: mecha.x, y: mecha.y };
    const toPos = { x: target.x, y: target.y };

    const tierInfo = MECHA_TIER_LABELS[mecha.data?.tier ?? 0] || MECHA_TIER_LABELS[0];
    if (Math.random() * 100 < (tierInfo.breakdownChance ?? 0)) {
      broadcastRamFailFx({ fromPos, toPos });
      await recordCombatEvent(mecha.encounter_id, "ram", { actor: turnRider, target, outcome: "stall" });
      await pushCombatLog(mecha.encounter_id, `${mecha.name} lurches forward but stalls out -- mechanical failure!`);
      const encounter = await broadcastEncounter(mecha.encounter_id);
      return res.json({ encounter, log: "Mechanical failure." });
    }

    const handling = mecha.data?.handling ?? 0;
    const targetEvasion = target.kind === "mecha" ? target.data?.handling ?? 0 : target.data?.dexMod ?? 0;
    const roll = rollD20();
    const attackTotal = roll + handling;
    const dc = 10 + targetEvasion;

    let log;
    if (attackTotal < dc) {
      broadcastRamFailFx({ fromPos, toPos });
      await recordCombatEvent(mecha.encounter_id, "ram", { actor: turnRider, target, outcome: "miss" });
      log = `${mecha.name} rams at ${target.name} and misses (${attackTotal} vs DC ${dc}).`;
    } else {
      const rammingPower = mecha.data?.rammingPower ?? 1;
      const dmg = rammingPower * RAM_DAMAGE_MULTIPLIER;
      await recordCombatEvent(mecha.encounter_id, "ram", { actor: turnRider, target, outcome: "hit" });
      if (target.kind === "mecha") {
        const reduced = Math.max(0, dmg - (target.data?.armor ?? 0));
        const newStructure = Math.max(0, (target.current_structure ?? 0) - reduced);
        await updateCombatant(target.id, { current_structure: newStructure });
        await recordCombatEvent(mecha.encounter_id, "damage", {
          actor: turnRider,
          target,
          amount: Math.min(reduced, target.current_structure ?? 0),
          overkill: Math.max(0, reduced - (target.current_structure ?? 0)),
          structure: true,
          via: "ram",
          slug: "Ram",
          kill: newStructure === 0 && (target.current_structure ?? 0) > 0,
        });
        log = `${mecha.name} rams ${target.name} for ${reduced} Structure damage.`;
        if (newStructure === 0) {
          await disableMecha(target.id);
          log += ` ${target.name} is disabled!`;
        }
        const backDmg = Math.max(0, (target.data?.rammingPower ?? 0) * RAM_DAMAGE_MULTIPLIER - (mecha.data?.armor ?? 0));
        const mechaNewStructure = Math.max(0, (mecha.current_structure ?? 0) - backDmg);
        await updateCombatant(mecha.id, { current_structure: mechaNewStructure });
        log += ` ${mecha.name} takes ${backDmg} Structure damage from the collision.`;
        if (mechaNewStructure === 0) {
          await disableMecha(mecha.id);
          log += ` ${mecha.name} is disabled!`;
        }
      } else {
        // A mecha slamming a person: a flat half of their max Grit, whatever
        // the mecha's ramming power (see RAM_CHARACTER_MAX_GRIT_FRACTION).
        const gritDmg = Math.max(1, Math.floor((target.max_grit ?? 0) * RAM_CHARACTER_MAX_GRIT_FRACTION));
        // If the rammed character is themselves mounted, their mecha soaks 75%.
        const { riderDamage, note: absorbNote } = await absorbRiderDamage(target, gritDmg, {
          stat: { actor: turnRider, via: "ram", slug: "Ram" },
        });
        const newGrit = Math.max(0, (target.current_grit ?? 0) - riderDamage);
        const updatedTarget = await updateCombatant(target.id, { current_grit: newGrit, damaged_this_turn: true });
        await syncCharacterFromCombatant(updatedTarget);
        await recordCombatEvent(mecha.encounter_id, "damage", {
          actor: turnRider,
          target,
          amount: Math.min(riderDamage, target.current_grit ?? 0),
          overkill: Math.max(0, riderDamage - (target.current_grit ?? 0)),
          via: "ram",
          slug: "Ram",
          kill: newGrit === 0 && (target.current_grit ?? 0) > 0 && !target.unconscious,
        });
        log = `${mecha.name} rams ${target.name} for ${riderDamage} Grit damage.${absorbNote}`;

        const kb = knockbackTarget({ x: mecha.x, y: mecha.y }, { x: target.x, y: target.y }, withMapEdges(encounterRow.walls, encounterRow.map_width, encounterRow.map_height), KNOCKBACK_DISTANCE);
        await updateCombatant(target.id, { x: kb.point.x, y: kb.point.y });
        await applyPathHazards(target.id, { x: target.x, y: target.y }, kb.point, { hazards: encounterRow.hazards, verb: "is thrown through" });
        log += ` ${target.name} is thrown by the impact!`;
        await triggerKnockoutRoll(target.id, "mecha-ram");

        const backDmg = Math.floor(rammingPower / 2);
        const mechaNewStructure = Math.max(0, (mecha.current_structure ?? 0) - backDmg);
        await updateCombatant(mecha.id, { current_structure: mechaNewStructure });
        if (mechaNewStructure === 0) {
          await disableMecha(mecha.id);
          log += ` ${mecha.name} is disabled by the collision!`;
        }
      }
    }

    await pushCombatLog(mecha.encounter_id, log);
    const encounter = await broadcastEncounter(mecha.encounter_id);
    res.json({ encounter, log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not ram." });
  }
});

// NPC reveal state and slug guesses are entirely an NPCs-tab concern now --
// see routes/npcTemplates.js. Combat doesn't gate or expose any of it.

export {
  router as combatRouter,
  loadFullEncounter,
  broadcastEncounter,
  getActiveEncounterRow,
  pushCombatLog,
  getCombatant,
  updateCombatant,
  syncCharacterFromCombatant,
  advanceTurn,
  grantFame,
  absorbRiderDamage,
  shieldSnapshot,
};
export default router;
