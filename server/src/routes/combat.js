import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll, notifyUser } from "../ws.js";
import { statModifier, computeMaxGrit, actionPoints, initiativeBonus } from "../characterRules.js";
import { QUALITY_TIERS } from "../itemRules.js";
import { TIER_LABELS as MECHA_TIER_LABELS } from "../mechaRules.js";
import { toClientSlug } from "./slugs.js";
import { toClientBlaster } from "./blasters.js";
import { recordSlugpediaEntry } from "../slugpediaStore.js";
import {
  MOVE_SPEED_PER_AP,
  MECHA_SPEED_UNIT,
  MOUNT_RANGE,
  MOVE_AP_COST,
  HUNKER_AP_COST,
  MOUNT_AP_COST,
  RAM_AP_COST,
  SWITCH_WEAPON_AP_COST,
  PRIMARY_WEAPON_SLOT,
  SECONDARY_WEAPON_SLOT,
  SLUG_RETURN_TURNS,
  hunkerHeal,
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
  COUNTER_WINDOW_MS,
  shotFlightMs,
  resolveClash,
  rangePenalty,
  KNOCKBACK_DISTANCE,
  SHOT_FLIGHT_MULTIPLIER,
  slugKnockbackDistance,
  tickStatusEffects,
  computeBurnDamage,
  BURN_DURATION_TURNS,
  POISON_DAMAGE_PER_STACK,
  POISON_DURATION_TURNS,
  SNARE_DURATION_TURNS,
  ICE_PATCH_RADIUS,
  ICE_SLIP_CHANCE,
  findHazardAt,
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
  CHAIN_RADIUS,
  ULTRA_FAST_WINDOW_FACTOR,
  INVISIBLE_DURATION_TURNS,
  FEAR_FLEE_AP_EQUIVALENT,
  CONFUSION_DURATION_TURNS,
  CONFUSION_CHANCE,
  confusedDeflection,
  clampToMapBounds,
  CLASH_TRIPLE_MULTIPLIER,
} from "../combatRules.js";

const router = Router();
router.use(requireAuth);

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
    mapImageScale: row.map_image_scale,
    mapImageOffsetX: row.map_image_offset_x,
    mapImageOffsetY: row.map_image_offset_y,
    walls: row.walls,
    hazards: row.hazards,
    bridges: row.bridges,
    turnOrder: row.turn_order,
    activeTurnIndex: row.active_turn_index,
    activeCombatantId: row.turn_order?.[row.active_turn_index] ?? null,
    round: row.round,
    combatants: combatants.map(toClientCombatant),
  };
}

async function loadFullEncounter(id) {
  const encResult = await pool.query("SELECT * FROM encounters WHERE id = $1", [id]);
  const encounter = encResult.rows[0];
  if (!encounter) return null;
  const combatantsResult = await pool.query(
    `SELECT c.* FROM combatants c WHERE c.encounter_id = $1 ORDER BY c.id ASC`,
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

async function updateCombatant(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return getCombatant(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await pool.query(`UPDATE combatants SET ${setClause} WHERE id = $1 RETURNING *`, [
    id,
    ...keys.map((k) => fields[k]),
  ]);
  return rows[0] || null;
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
      character: {
        id: rows[0].id,
        name: rows[0].name,
        age: rows[0].age,
        portrait: rows[0].portrait,
        stats: rows[0].stats,
        proficiencies: rows[0].proficiencies,
        knockoutPips: rows[0].knockout_pips,
        currentGrit: rows[0].current_grit,
        createdAt: rows[0].created_at,
      },
    });
  } catch (err) {
    console.error("Could not sync character from combatant:", err);
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
      [name.trim(), Number.isInteger(mapWidth) ? mapWidth : 1600, Number.isInteger(mapHeight) ? mapHeight : 900]
    );
    const encounter = await loadFullEncounter(rows[0].id);
    broadcastAll({ type: "encounter-updated", encounter });
    res.status(201).json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create encounter." });
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
    const { rows: clearedSlugs } = await pool.query(
      `UPDATE slugs s SET cooldown_turns_left = 0
       FROM combatants c
       WHERE c.encounter_id = $1
         AND (s.user_id = c.ref_user_id OR s.owner_combatant_id = c.id)
         AND s.cooldown_turns_left > 0
       RETURNING s.*`,
      [id]
    );
    for (const slugRow of clearedSlugs) {
      broadcastAll({ type: "slug-updated", userId: slugRow.user_id, slug: toClientSlug(slugRow) });
    }

    const encounter = await loadFullEncounter(id);
    broadcastAll({ type: "encounter-updated", encounter });
    await pushCombatLog(id, `${encounter.name} has ended.`);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not end encounter." });
  }
});

// ---------------------------------------------------------------------------
// Map background
// ---------------------------------------------------------------------------

// Accepts a partial patch -- { image } to set/replace the map (or image:
// null to clear it), and/or { scale, offsetX, offsetY } to update the DM's
// pan/zoom on top of it. Any field not sent is left as-is.
router.patch("/encounters/:id/map", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { image, scale, offsetX, offsetY } = req.body || {};
  // Column -> value, last write wins per column so an image reset and an
  // explicit scale/offset in the same request never both try to set the
  // same column (which Postgres rejects as a duplicate SET target).
  const columns = {};
  if (image !== undefined) {
    if (image !== null && typeof image !== "string") {
      return res.status(400).json({ error: "Map image must be a data URL or null." });
    }
    columns.map_image = image;
    // A fresh (or cleared) image always starts centered at 1x -- any prior
    // pan/zoom was framing the old picture, not this one -- unless this same
    // request also supplies its own scale/offset below.
    columns.map_image_scale = 1;
    columns.map_image_offset_x = 0;
    columns.map_image_offset_y = 0;
  }
  if (scale !== undefined) {
    if (!Number.isFinite(scale) || scale <= 0) return res.status(400).json({ error: "scale must be a positive number." });
    columns.map_image_scale = scale;
  }
  if (offsetX !== undefined) {
    if (!Number.isFinite(offsetX)) return res.status(400).json({ error: "offsetX must be a number." });
    columns.map_image_offset_x = offsetX;
  }
  if (offsetY !== undefined) {
    if (!Number.isFinite(offsetY)) return res.status(400).json({ error: "offsetY must be a number." });
    columns.map_image_offset_y = offsetY;
  }
  const keys = Object.keys(columns);
  if (keys.length === 0) return res.status(400).json({ error: "Nothing to update." });
  try {
    const values = keys.map((k) => columns[k]);
    const sets = keys.map((k, idx) => `${k} = $${idx + 1}`);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE encounters SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING id`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: "Encounter not found." });
    const encounter = await broadcastEncounter(id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update map." });
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
  const { kind, refUserId, refMechaId, name, x, y } = req.body || {};

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
      fields.max_ap = actionPoints(character.stats);
      fields.max_grit = computeMaxGrit(character.stats);
      fields.current_grit = character.current_grit;
      fields.knockout_pips = JSON.stringify(character.knockout_pips);
      // Every character joins on their primary weapon (equip slot 0) --
      // Switch Weapon (see /actions/switch-weapon) flips this to secondary.
      fields.data = {
        dexMod: initiativeBonus(character.stats),
        conMod: statModifier(character.stats.constitution),
        activeWeaponSlot: PRIMARY_WEAPON_SLOT,
      };
    } else if (kind === "mecha") {
      if (!Number.isInteger(refMechaId)) return res.status(400).json({ error: "A mecha is required." });
      const { rows } = await pool.query("SELECT * FROM mechas WHERE id = $1", [refMechaId]);
      const mecha = rows[0];
      if (!mecha) return res.status(400).json({ error: "Mecha not found." });
      const maxStructure = computeMaxStructure({ armor: mecha.armor, tier: mecha.tier });
      fields.ref_mecha_id = refMechaId;
      fields.name = (name || mecha.name).trim();
      fields.portrait = mecha.image;
      fields.max_ap = 2;
      fields.max_structure = maxStructure;
      fields.current_structure = maxStructure;
      fields.data = { dexMod: 0, speed: mecha.speed, handling: mecha.handling, armor: mecha.armor, rammingPower: mecha.ramming_power, tier: mecha.tier };
    } else {
      // npc: DM supplies a lightweight ad-hoc stat block
      const { maxAp, maxGrit, currentGrit, dexModifier, conModifier } = req.body || {};
      fields.max_ap = Number.isInteger(maxAp) ? maxAp : 2;
      fields.max_grit = Number.isInteger(maxGrit) ? maxGrit : 20;
      fields.current_grit = Number.isInteger(currentGrit) ? currentGrit : fields.max_grit;
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
    await updateCombatant(cid, { x, y });
    const encounter = await broadcastEncounter(Number(req.params.id));
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not move token." });
  }
});

router.delete("/encounters/:id/combatants/:cid", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.cid);
  try {
    await pool.query("DELETE FROM combatants WHERE id = $1", [cid]);
    const { rows } = await pool.query("SELECT turn_order, active_turn_index FROM encounters WHERE id = $1", [id]);
    if (rows[0]) {
      const turnOrder = rows[0].turn_order.filter((tid) => tid !== cid);
      const activeTurnIndex = Math.min(rows[0].active_turn_index, Math.max(0, turnOrder.length - 1));
      await pool.query("UPDATE encounters SET turn_order = $1, active_turn_index = $2 WHERE id = $3", [
        JSON.stringify(turnOrder),
        activeTurnIndex,
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

// Pulls an NPC template into the encounter as a fresh, independently-geared
// instance. Repeated pulls of the same template auto-number: "Bandit 1",
// "Bandit 2", etc.
router.post("/encounters/:id/npc-combatants", requireDungeonMaster, async (req, res) => {
  const encounterId = Number(req.params.id);
  const { npcTemplateId, x, y } = req.body || {};
  if (!Number.isInteger(npcTemplateId)) {
    return res.status(400).json({ error: "An NPC is required." });
  }

  try {
    const templateResult = await pool.query("SELECT * FROM npc_templates WHERE id = $1", [npcTemplateId]);
    const template = templateResult.rows[0];
    if (!template) return res.status(404).json({ error: "NPC not found." });

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM combatants WHERE encounter_id = $1 AND ref_npc_template_id = $2",
      [encounterId, npcTemplateId]
    );
    const name = `${template.name} ${countResult.rows[0].count + 1}`;

    const combatantResult = await pool.query(
      `INSERT INTO combatants
        (encounter_id, kind, ref_npc_template_id, name, portrait, x, y, max_ap, current_ap, max_grit, current_grit, knockout_pips, data)
       VALUES ($1, 'npc', $2, $3, $4, $5, $6, $7, 0, $8, $8, $9, $10)
       RETURNING *`,
      [
        encounterId,
        npcTemplateId,
        name,
        template.image,
        Number.isFinite(x) ? x : 100,
        Number.isFinite(y) ? y : 100,
        template.max_ap,
        template.max_grit,
        JSON.stringify([false, false, false]),
        JSON.stringify({ dexMod: template.dex_modifier, conMod: template.con_modifier }),
      ]
    );
    const combatant = combatantResult.rows[0];

    // Spawn independent blaster copies for this instance, equipped in order
    // (only the first two get a slot -- same Primary/Secondary limit players have).
    const spawnedBlasters = [];
    for (let i = 0; i < template.blaster_template_ids.length; i++) {
      const btResult = await pool.query("SELECT * FROM blaster_templates WHERE id = $1", [template.blaster_template_ids[i]]);
      const bt = btResult.rows[0];
      if (!bt) continue;
      const equipSlot = i < 2 ? i : null;
      const { rows } = await pool.query(
        `INSERT INTO blasters
          (template_id, owner_combatant_id, name, base_type, image, accuracy, reload_ap_cost, range, mod_slots, magazine_size, quality, equip_slot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [bt.id, combatant.id, bt.name, bt.base_type, bt.image, bt.accuracy, bt.reload_ap_cost, bt.range, bt.mod_slots, bt.magazine_size, bt.quality, equipSlot]
      );
      spawnedBlasters.push(rows[0]);
      // The DM's already-fetched slug/blaster lists have no way to learn
      // about gear that gets created after that fetch -- without this, a
      // pulled NPC's weapons exist in the DB but never show up in the
      // DM's slug panel to actually fire.
      broadcastAll({ type: "blaster-updated", userId: null, blaster: toClientBlaster(rows[0]) });
    }

    // Spawn independent slug copies, auto-loaded into whichever spawned
    // blaster still has a free magazine slot.
    const slotCursor = spawnedBlasters.map(() => 0);
    for (const slugTemplateId of template.slug_template_ids) {
      const stResult = await pool.query("SELECT * FROM slug_templates WHERE id = $1", [slugTemplateId]);
      const st = stResult.rows[0];
      if (!st) continue;
      let equippedBlasterId = null;
      let magazineSlot = null;
      for (let i = 0; i < spawnedBlasters.length; i++) {
        if (spawnedBlasters[i].equip_slot === null) continue;
        if (slotCursor[i] < spawnedBlasters[i].magazine_size) {
          equippedBlasterId = spawnedBlasters[i].id;
          magazineSlot = slotCursor[i];
          slotCursor[i] += 1;
          break;
        }
      }
      const { rows: slugRows } = await pool.query(
        `INSERT INTO slugs
          (template_id, owner_combatant_id, name, type, protoform_image, velocity_image, clash_power, clash_defense,
           ap_cost, max_energy_pips, energy_pips, loyalty_tier, velocity_ability, protoform_utility,
           breaks_walls, causes_knockback, wall_maker, bridge_maker, aoe_blast, hazard_maker,
           causes_blind, causes_snare, causes_shock, causes_jam,
           pierces_walls, causes_chain, ricochets, ultra_fast, causes_invisible, causes_fear, causes_confusion,
           trail_wall, clash_tripled, equipped_blaster_id, magazine_slot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
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
          st.loyalty_tier,
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
          equippedBlasterId,
          magazineSlot,
        ]
      );
      broadcastAll({ type: "slug-updated", userId: null, slug: toClientSlug(slugRows[0]) });
      // This NPC just joined the fight carrying it -- reveal the variant to
      // the whole party's slugpedia, same as if a player had been assigned it.
      recordSlugpediaEntry(slugRows[0]);
    }

    // Optionally spawn a mecha companion, auto-mounted by this NPC.
    if (template.mecha_template_id) {
      const mtResult = await pool.query("SELECT * FROM mecha_templates WHERE id = $1", [template.mecha_template_id]);
      const mt = mtResult.rows[0];
      if (mt) {
        const maxStructure = computeMaxStructure({ armor: mt.armor, tier: mt.tier });
        const mechaResult = await pool.query(
          `INSERT INTO combatants
            (encounter_id, kind, name, portrait, x, y, max_ap, current_ap, max_structure, current_structure, data)
           VALUES ($1, 'mecha', $2, $3, $4, $5, 2, 0, $6, $6, $7)
           RETURNING *`,
          [
            encounterId,
            `${name}'s ${mt.name}`,
            mt.image,
            combatant.x,
            combatant.y,
            maxStructure,
            JSON.stringify({ dexMod: 0, speed: mt.speed, handling: mt.handling, armor: mt.armor, rammingPower: mt.ramming_power, tier: mt.tier }),
          ]
        );
        await pool.query("UPDATE combatants SET mounted_on = $1 WHERE id = $2", [mechaResult.rows[0].id, combatant.id]);
      }
    }

    const encounter = await broadcastEncounter(encounterId);
    res.status(201).json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not pull NPC into the encounter." });
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

    const rolled = [];
    for (const c of combatantRows) {
      const dexMod = c.data?.dexMod ?? 0;
      const initiative = rollD20() + dexMod;
      await pool.query("UPDATE combatants SET initiative = $1, current_ap = 0, damaged_this_turn = false, rammed_this_round = false WHERE id = $2", [
        initiative,
        c.id,
      ]);
      rolled.push({ id: c.id, name: c.name, initiative, dexMod });
    }
    rolled.sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod || Math.random() - 0.5);
    const turnOrder = rolled.map((c) => c.id);

    await pool.query("UPDATE combatants SET current_ap = max_ap WHERE id = $1", [turnOrder[0]]);
    await pool.query(
      "UPDATE encounters SET status = 'active', turn_order = $1, active_turn_index = 0, round = 1 WHERE id = $2",
      [JSON.stringify(turnOrder), id]
    );

    const encounter = await broadcastEncounter(id);
    await pushCombatLog(
      id,
      `Initiative rolled: ${rolled.map((c) => `${c.name} (${c.initiative})`).join(", ")}. ${rolled[0].name} goes first.`
    );
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start encounter." });
  }
});

async function advanceTurn(encounterId) {
  const { rows } = await pool.query("SELECT * FROM encounters WHERE id = $1", [encounterId]);
  const encounter = rows[0];
  if (!encounter) return null;
  const turnOrder = encounter.turn_order;
  if (turnOrder.length === 0) return await loadFullEncounter(encounterId);

  let nextIndex = encounter.active_turn_index;
  let round = encounter.round;
  let wrapped = false;
  for (let i = 0; i < turnOrder.length; i++) {
    nextIndex = (nextIndex + 1) % turnOrder.length;
    if (nextIndex === 0) wrapped = true;
    const combatant = await getCombatant(turnOrder[nextIndex]);
    if (combatant && !combatant.unconscious && !combatant.disabled) break;
  }
  if (wrapped) round += 1;

  const nextCombatant = await getCombatant(turnOrder[nextIndex]);
  let shocked = false;
  let fledLog = null;
  if (nextCombatant) {
    const stunned = Boolean(nextCombatant.status_effects?.stunned);
    // Shocked (see causes_shock in dealHit) skips the whole turn -- 0 AP,
    // full stop -- overriding stun's ordinary -1 AP if somehow both are up.
    shocked = Boolean(nextCombatant.status_effects?.shocked);
    // Frightgeist's fear -- also a full skip, but instead of just doing
    // nothing, the target's AP is spent fleeing FEAR_FLEE_AP_EQUIVALENT
    // worth of Move directly away from wherever the shot that feared them
    // came from (see causes_fear in dealHit, which records that point).
    const feared = nextCombatant.status_effects?.feared;
    const refillAp = shocked || feared ? 0 : stunned ? Math.max(0, nextCombatant.max_ap - 1) : nextCombatant.max_ap;
    const statusAfterStun = { ...(nextCombatant.status_effects || {}) };
    if (stunned) delete statusAfterStun.stunned;
    if (shocked) delete statusAfterStun.shocked;
    if (feared) delete statusAfterStun.feared;

    // Burn/poison/snare/confusion/invisibility all tick down at the start of
    // the combatant's own turn -- see tickStatusEffects. Snare is a pure
    // duration countdown (the actual movement block lives in /actions/move);
    // burn/poison also deal their damage here, before this turn's AP is even
    // usable. A shocked or feared combatant still takes their DoT/cooldown
    // tick -- neither skips anything except their own actions.
    const { damage: dotDamage, statusEffects: nextStatus, notes: dotNotes } = tickStatusEffects(statusAfterStun);

    await tickSlugCooldowns(nextCombatant);

    const fields = {
      current_ap: refillAp,
      damaged_this_turn: false,
      status_effects: JSON.stringify(nextStatus),
      ...(wrapped ? { rammed_this_round: false } : {}),
    };

    if (feared) {
      const fleeDistance = FEAR_FLEE_AP_EQUIVALENT * MOVE_SPEED_PER_AP;
      const kb = knockbackTarget(feared, { x: nextCombatant.x, y: nextCombatant.y }, encounter.walls || [], fleeDistance);
      const dest = clampToMapBounds(kb.point, encounter.map_width, encounter.map_height);
      fields.x = dest.x;
      fields.y = dest.y;
      fledLog = `${nextCombatant.name}, terrified, bolts ${Math.round(fleeDistance)} units away and can't act this turn!`;
    }

    const hasGrit = nextCombatant.current_grit !== null;
    if (dotDamage > 0 && hasGrit) {
      fields.current_grit = Math.max(0, nextCombatant.current_grit - dotDamage);
    }

    const updatedCombatant = await updateCombatant(nextCombatant.id, fields);

    if (dotDamage > 0 && hasGrit) {
      await syncCharacterFromCombatant(updatedCombatant);
      await pushCombatLog(encounterId, `${nextCombatant.name} takes ${dotDamage} damage from ${dotNotes.join(" + ")}.`);
      if (updatedCombatant.current_grit === 0 && !updatedCombatant.unconscious) {
        await triggerKnockoutRoll(updatedCombatant.id, "grit");
      }
    }
  }
  if (wrapped) {
    await pool.query("UPDATE combatants SET rammed_this_round = false WHERE encounter_id = $1", [encounterId]);
  }

  await pool.query("UPDATE encounters SET active_turn_index = $1, round = $2 WHERE id = $3", [nextIndex, round, encounterId]);

  if (shocked || fledLog) {
    // Their turn "happens" (DoT ticked, cooldowns ticked, the status
    // consumed above) but they never actually get to act on it -- immediately
    // hand the turn to whoever's next, same as an unconscious/disabled
    // combatant being skipped in the search loop above, just after this
    // one's own start-of-turn bookkeeping already ran. Re-reads the
    // encounter (now sitting on this combatant as "active") and continues
    // the chain from there.
    await pushCombatLog(encounterId, fledLog || `${nextCombatant.name} is shocked -- their turn is skipped!`);
    await broadcastEncounter(encounterId);
    return await advanceTurn(encounterId);
  }

  const updated = await broadcastEncounter(encounterId);
  if (nextCombatant) await pushCombatLog(encounterId, `${nextCombatant.name}'s turn (Round ${round}).`);
  return updated;
}

router.post("/actions/end-turn", async (req, res) => {
  const { combatantId } = req.body || {};
  try {
    const combatant = await getCombatant(combatantId);
    if (!combatant) return res.status(404).json({ error: "Combatant not found." });
    if (req.user.role !== "Dungeon Master" && combatant.ref_user_id !== req.user.sub) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    const encounter = await advanceTurn(combatant.encounter_id);
    res.json({ encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not end turn." });
  }
});

function isActingCombatantAuthorized(req, combatant, encounter) {
  if (req.user.role === "Dungeon Master") return true;
  if (combatant.kind === "character" && combatant.ref_user_id === req.user.sub) return true;
  return false;
}

function requireOwnTurn(encounter, combatant) {
  return encounter.turn_order[encounter.active_turn_index] === combatant.id;
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

router.post("/actions/move", async (req, res) => {
  const { combatantId, x, y } = req.body || {};
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
    const statusEffects = combatant.status_effects || {};
    if (statusEffects.snared?.turnsLeft > 0) {
      return res.status(400).json({ error: "This combatant is snared and can't move." });
    }

    const speedPerAp = combatant.kind === "mecha" ? (combatant.data?.speed || 1) * MECHA_SPEED_UNIT : MOVE_SPEED_PER_AP;
    const dist = distance({ x: combatant.x, y: combatant.y }, { x, y });
    const apNeeded = Math.max(1, Math.ceil(dist / speedPerAp));

    if (combatant.current_ap < apNeeded) {
      return res.status(400).json({ error: "Not enough AP to move that far." });
    }

    const blocked = firstWallHit({ x: combatant.x, y: combatant.y }, { x, y }, encounter.walls);
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

      const dmgHazard = findHazardAt({ x, y }, encounter.hazards, "damage");
      if (dmgHazard) {
        hazardHit = await applyHazardEffect(dmgHazard, combatant);
      }
    }

    await updateCombatant(combatant.id, {
      x,
      y,
      current_ap: slipped ? 0 : combatant.current_ap - apNeeded,
    });
    if (slipped) {
      await pushCombatLog(combatant.encounter_id, `${combatant.name} slips on the ice -- their turn ends abruptly!`);
    }
    if (hazardHit) {
      await pushCombatLog(
        combatant.encounter_id,
        `${combatant.name} steps into hazardous terrain -- takes ${hazardHit.amount} Grit damage${hazardHit.note}.`
      );
      if (hazardHit.newGrit === 0 && !combatant.unconscious) {
        await triggerKnockoutRoll(combatant.id, "grit");
      }
    }
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    res.json({ encounter: encounterOut, slipped, hazardHit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not move." });
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
// Hunker Down
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
    if (combatant.current_grit === null) {
      return res.status(400).json({ error: "This combatant can't hunker down." });
    }
    if (combatant.damaged_this_turn) {
      return res.status(400).json({ error: "Can't hunker down the same round you were hit." });
    }
    if (combatant.current_ap < HUNKER_AP_COST) {
      return res.status(400).json({ error: "Not enough AP." });
    }

    const conMod = combatant.data?.conMod ?? 0;
    const heal = hunkerHeal(conMod);
    const newGrit = Math.min(combatant.max_grit, combatant.current_grit + heal);

    const updated = await updateCombatant(combatant.id, {
      current_grit: newGrit,
      current_ap: combatant.current_ap - HUNKER_AP_COST,
    });
    await syncCharacterFromCombatant(updated);
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    await pushCombatLog(combatant.encounter_id, `${combatant.name} hunkers down and recovers ${heal} Grit.`);
    res.json({ encounter: encounterOut, healed: heal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not hunker down." });
  }
});

// ---------------------------------------------------------------------------
// Shared combat-resolution helpers (shooting, counter-clash, knockout, ram)
// ---------------------------------------------------------------------------

const pendingCounters = new Map(); // id -> offer, cleared by manual resolve or its own timeout
const pendingKnockouts = new Map(); // id -> offer, cleared by manual resolve (no hard timeout)
const KNOCKOUT_PENDING_TTL_MS = 10 * 60 * 1000;

function cleanupExpiredKnockouts() {
  const cutoff = Date.now() - KNOCKOUT_PENDING_TTL_MS;
  for (const [id, offer] of pendingKnockouts) {
    if (offer.createdAt < cutoff) pendingKnockouts.delete(id);
  }
}

async function ejectSlug(slugId) {
  if (!slugId) return;
  const { rows } = await pool.query(
    "UPDATE slugs SET equipped_blaster_id = NULL, magazine_slot = NULL WHERE id = $1 RETURNING *",
    [slugId]
  );
  if (rows[0]) broadcastAll({ type: "slug-updated", userId: rows[0].user_id, slug: toClientSlug(rows[0]) });
}

// Called exactly when a slug actually flies -- the shooter's own shot, or a
// defender's chosen counter -- so this is also the one place that starts its
// return-to-hand cooldown (see SLUG_RETURN_TURNS).
async function spendEnergyPip(slugId) {
  if (!slugId) return;
  const { rows } = await pool.query("SELECT * FROM slugs WHERE id = $1", [slugId]);
  const slug = rows[0];
  if (!slug) return;
  const pips = slug.energy_pips || [];
  const idx = pips.findIndex((p) => p);
  if (idx === -1) return;
  const next = pips.map((p, i) => (i === idx ? false : p));
  await pool.query("UPDATE slugs SET cooldown_turns_left = $1 WHERE id = $2", [SLUG_RETURN_TURNS, slugId]);
  const { rows: updated } = await pool.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [
    JSON.stringify(next),
    slugId,
  ]);
  broadcastAll({ type: "slug-updated", userId: updated[0].user_id, slug: toClientSlug(updated[0]) });
}

// Ticks down the return-to-hand cooldown (see spendEnergyPip) by one for
// every slug this combatant owns -- called once, right as their own turn
// starts (see advanceTurn), so a slug fired on turn N is unusable for their
// next SLUG_RETURN_TURNS turns and free again on the one after that.
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
}

async function rechargeAnotherSlug(userId, excludeSlugId) {
  if (!userId) return null;
  const { rows } = await pool.query(
    "SELECT * FROM slugs WHERE user_id = $1 AND equipped_blaster_id IS NOT NULL AND id != $2",
    [userId, excludeSlugId]
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

async function findEligibleCounterSlugs(target) {
  if (target.kind !== "character" || target.unconscious || !target.ref_user_id) return [];
  // Only the slug(s) loaded into whichever weapon slot is currently active
  // can counter -- same rule as firing on your own turn (see /actions/shoot).
  const activeSlot = target.data?.activeWeaponSlot ?? PRIMARY_WEAPON_SLOT;
  const { rows } = await pool.query(
    `SELECT s.* FROM slugs s
     JOIN blasters b ON b.id = s.equipped_blaster_id
     WHERE s.user_id = $1 AND b.equip_slot = $2`,
    [target.ref_user_id, activeSlot]
  );
  return rows.filter((s) => Array.isArray(s.energy_pips) && s.energy_pips.some(Boolean) && (s.cooldown_turns_left || 0) === 0);
}

// Bug fix bundled with the Speedstinger work below: this was still using a
// bare `8` -- a leftover from before RANGE_SCALE blew every distance number
// up 25x (see docs/combat-system-design.md §4's chain row, "within 8 units
// of target"), so chain basically never found anyone at this map's actual
// scale. Now uses CHAIN_RADIUS (8 * RANGE_SCALE) like everything else.
async function findChainTarget(encounterId, fromCombatantId, excludeCombatantId) {
  const from = await getCombatant(fromCombatantId);
  if (!from) return null;
  const { rows } = await pool.query(
    "SELECT * FROM combatants WHERE encounter_id = $1 AND id != $2 AND id != $3 AND unconscious = false AND disabled = false",
    [encounterId, fromCombatantId, excludeCombatantId]
  );
  let nearest = null;
  let nearestDist = Infinity;
  for (const c of rows) {
    if (c.current_grit === null && c.current_structure === null) continue;
    const d = distance({ x: from.x, y: from.y }, { x: c.x, y: c.y });
    if (d <= CHAIN_RADIUS && d < nearestDist) {
      nearest = c;
      nearestDist = d;
    }
  }
  return nearest;
}

// Every living, conscious combatant within AOE_RADIUS of `origin` (a hit's
// impact point), excluding whichever ids the caller already resolved
// separately (the shooter, and the primary target -- which went through the
// normal roll/counter-clash flow, not this one). See dealHit's aoe_blast
// block.
async function findAoeTargets(encounterId, origin, excludeIds) {
  const { rows } = await pool.query(
    "SELECT * FROM combatants WHERE encounter_id = $1 AND unconscious = false AND disabled = false",
    [encounterId]
  );
  return rows.filter((c) => {
    if (excludeIds.includes(c.id)) return false;
    if (c.current_grit === null && c.current_structure === null) return false;
    return distance(origin, { x: c.x, y: c.y }) <= AOE_RADIUS;
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

async function triggerKnockoutRoll(combatantId, reason) {
  const combatant = await getCombatant(combatantId);
  if (!combatant || combatant.unconscious) return;

  if (combatant.kind !== "character") {
    if (combatant.current_grit !== null) {
      await updateCombatant(combatantId, { unconscious: true });
      await pushCombatLog(combatant.encounter_id, `${combatant.name} is knocked out.`);
      await broadcastEncounter(combatant.encounter_id);
    }
    return;
  }

  const pipsUsed = countKnockoutPipsUsed(combatant.knockout_pips);
  if (pipsUsed >= 3) {
    const updated = await updateCombatant(combatantId, { unconscious: true });
    await syncCharacterFromCombatant(updated);
    await pushCombatLog(combatant.encounter_id, `${combatant.name} has nothing left to give and falls unconscious.`);
    await broadcastEncounter(combatant.encounter_id);
    return;
  }

  cleanupExpiredKnockouts();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dc = knockoutDC(pipsUsed);
  const conMod = combatant.data?.conMod ?? 0;
  pendingKnockouts.set(id, {
    combatantId,
    userId: combatant.ref_user_id,
    name: combatant.name,
    dc,
    conMod,
    reason,
    createdAt: Date.now(),
  });

  if (combatant.ref_user_id) {
    notifyUser(combatant.ref_user_id, {
      type: "knockout-roll-offered",
      offer: { id, name: combatant.name, dc, reason, conMod },
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
      await updateCombatant(targetCombatantId, { x: destination.x, y: destination.y });
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
async function addIceHazard(encounterId, point) {
  try {
    const { rows } = await pool.query("SELECT hazards, next_hazard_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const hazardId = rows[0].next_hazard_id;
    const hazards = [
      ...(rows[0].hazards || []),
      { id: hazardId, type: "ice", x: point.x, y: point.y, radius: ICE_PATCH_RADIUS },
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
    await pushCombatLog(encounterId, "A wall of fire roars to life along the shot's path.");
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
async function addDamageHazard(encounterId, point, slug) {
  try {
    const { rows } = await pool.query("SELECT hazards, next_hazard_id FROM encounters WHERE id = $1", [encounterId]);
    if (!rows[0]) return;
    const hazardId = rows[0].next_hazard_id;
    const hazards = [
      ...(rows[0].hazards || []),
      { id: hazardId, type: "damage", slugType: slug.type, x: point.x, y: point.y, radius: HAZARD_RADIUS, clashPower: slug.clash_power },
    ];
    await pool.query("UPDATE encounters SET hazards = $1, next_hazard_id = $2 WHERE id = $3", [
      JSON.stringify(hazards),
      hazardId + 1,
      encounterId,
    ]);
    await pushCombatLog(encounterId, `${slug.name} leaves a hazardous patch of terrain behind.`);
    await broadcastEncounter(encounterId);
  } catch (err) {
    console.error("Could not add damage hazard:", err);
  }
}

// Called from /actions/move when a non-mecha combatant's destination lands
// inside a "damage"-type hazard (see findHazardAt). Deals
// HAZARD_DAMAGE_FRACTION of the leaving slug's own clashPower as Grit
// damage, plus that type's Burn/Poison DoT if it has one -- the exact same
// status_effects fields dealHit itself writes, so tickStatusEffects picks
// them up identically. Returns the damage dealt and a short log fragment;
// the caller (the Move route) handles the knockout-roll check.
async function applyHazardEffect(hazard, combatant) {
  const tb = typeBallistics(hazard.slugType);
  const amount = Math.max(1, Math.floor(hazard.clashPower * HAZARD_DAMAGE_FRACTION));
  const nextStatus = { ...(combatant.status_effects || {}) };
  let note = "";
  if (tb.trait === "burn") {
    const burnDamage = computeBurnDamage(hazard.clashPower);
    nextStatus.burning = { turnsLeft: BURN_DURATION_TURNS, damage: burnDamage };
    note = " and catches fire";
  } else if (tb.trait === "poison") {
    const stacks = (nextStatus.poison?.stacks || 0) + 1;
    nextStatus.poison = { stacks, turnsLeft: POISON_DURATION_TURNS };
    note = " and is poisoned";
  }
  const newGrit = Math.max(0, (combatant.current_grit ?? 0) - amount);
  const updated = await updateCombatant(combatant.id, {
    current_grit: newGrit,
    damaged_this_turn: true,
    status_effects: JSON.stringify(nextStatus),
  });
  await syncCharacterFromCombatant(updated);
  return { amount, newGrit, note };
}

// The core damage/heal/trait/wall-break/knockback resolver, shared by normal
// hits, clash outcomes, chained hits, and ram. Re-fetches fresh rows so it's
// safe to call after an arbitrary delay (a counter window can take seconds).
async function dealHit(
  encounterId,
  shooterCombatantId,
  targetCombatantId,
  slug,
  { half = false, windowMs = 0, firedAt, isSplash = false, originPos = null, isRicochetLeg = false } = {}
) {
  const shooter = await getCombatant(shooterCombatantId);
  const target = await getCombatant(targetCombatantId);
  if (!shooter || !target) return "the target is no longer there.";
  // Knockback (below) shoves the target directly away from wherever the
  // shot actually came from -- normally that's just the shooter's own
  // position, but a ricocheted leg (Speedstinger) is visually launched from
  // the *previous* target's position while shooterCombatantId stays the
  // real, original owner throughout (energy/cooldown/recharge always belong
  // to them). originPos lets a caller override "where this leg's bolt
  // started" independently of who owns the slug -- see resolveNormalHit/
  // resolveCounterOffer, which pass offer.attackerPos or offer.targetPos.
  const knockbackOrigin = originPos || { x: shooter.x, y: shooter.y };

  if (slug.type === "Healing") {
    const amount = slug.clash_power;
    const newGrit = Math.min(target.max_grit ?? amount, (target.current_grit ?? 0) + amount);
    const updated = await updateCombatant(target.id, { current_grit: newGrit });
    await syncCharacterFromCombatant(updated);
    return `${target.name} is healed for ${amount} Grit.`;
  }
  if (slug.type === "None") {
    return "it bounces off harmlessly.";
  }

  const tb = typeBallistics(slug.type);
  let amount = Math.max(0, slug.clash_power + tb.powerMod);
  if (half) amount = Math.floor(amount / 2);

  let log;

  if (target.kind === "mecha") {
    const armor = target.data?.armor ?? 0;
    const dmg = Math.max(0, amount - armor);
    const newStructure = Math.max(0, (target.current_structure ?? 0) - dmg);
    await updateCombatant(target.id, { current_structure: newStructure });
    log = `${target.name} takes ${dmg} Structure damage.`;
    if (newStructure === 0) {
      await disableMecha(target.id);
      log += ` ${target.name} is disabled!`;
    }
  } else {
    const newGrit = Math.max(0, (target.current_grit ?? 0) - amount);
    const nextStatus = { ...(target.status_effects || {}) };
    // Burn/poison don't hit right now -- they land at the start of the
    // target's own next turn (see tickStatusEffects, called from
    // advanceTurn). Snare fully blocks Move (see /actions/move) instead of
    // costing extra AP.
    const wasBurning = Boolean(target.status_effects?.burning);
    const wasDoused = tb.trait === "douse" && wasBurning;
    let burnDamage = 0;
    if (tb.trait === "burn") {
      // Doesn't stack -- a fresh Fire hit just refreshes the duration and
      // recalculates the damage off this hit's own clashPower.
      burnDamage = computeBurnDamage(slug.clash_power);
      nextStatus.burning = { turnsLeft: BURN_DURATION_TURNS, damage: burnDamage };
    }
    let poisonStacks = 0;
    if (tb.trait === "poison") {
      // Stacks -- each poisoning hit adds a stack (more damage/turn) and
      // resets the shared duration back to the full length.
      poisonStacks = (nextStatus.poison?.stacks || 0) + 1;
      nextStatus.poison = { stacks: poisonStacks, turnsLeft: POISON_DURATION_TURNS };
    }
    if (tb.trait === "snare") nextStatus.snared = { turnsLeft: SNARE_DURATION_TURNS };
    if (tb.trait === "stun") nextStatus.stunned = true;
    if (tb.trait === "blind") nextStatus.blinded = true;
    if (tb.trait === "douse") delete nextStatus.burning;
    // Per-slug flags that opt a type without the trait by default into it --
    // same "Causes X" pattern as causes_knockback. Shock is its own status,
    // distinct from Psychic's stun: it skips the target's entire next turn
    // (see advanceTurn) rather than costing 1 AP.
    if (slug.causes_blind) nextStatus.blinded = true;
    if (slug.causes_snare) nextStatus.snared = { turnsLeft: SNARE_DURATION_TURNS };
    if (slug.causes_shock) nextStatus.shocked = true;
    // Thugglet is the one slug with both causes_jam and causes_invisible --
    // firing it at yourself (self-targeted, see causes_invisible below)
    // should only turn you invisible, never jam your own gun; firing it at
    // someone else should only jam theirs, never turn *them* invisible.
    const isSelfTarget = shooter.id === target.id;
    // Fries the target's blaster regardless of hit/miss (see resolveNormalHit
    // for the miss case) -- consumed the next time they attempt to fire, see
    // /actions/shoot.
    if (slug.causes_jam && !isSelfTarget) nextStatus.jammed = true;
    // Frightgeist -- records *where the shot came from*, not just that fear
    // landed, so advanceTurn knows which direction to run the target away
    // from when their turn comes up (see FEAR_FLEE_AP_EQUIVALENT there).
    if (slug.causes_fear) nextStatus.feared = { x: shooter.x, y: shooter.y };
    // Fandango -- only the combatant actually hit gets confused; it's a
    // debuff on *their* future shots, not a field-wide effect (see
    // CONFUSION_CHANCE/confusedDeflection in the shoot route).
    if (slug.causes_confusion) nextStatus.confused = { turnsLeft: CONFUSION_DURATION_TURNS };
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

    const updated = await updateCombatant(target.id, {
      current_grit: newGrit,
      damaged_this_turn: true,
      status_effects: JSON.stringify(nextStatus),
    });
    await syncCharacterFromCombatant(updated);
    log = `${target.name} takes ${amount} Grit damage${newGrit === 0 ? " and is at 0 Grit!" : ""}.`;

    // The status effect itself never deals damage on this same hit (see
    // tickStatusEffects) -- without an explicit log line here, inflicting
    // one reads as if nothing happened until it actually ticks on the
    // target's next turn.
    if (tb.trait === "burn") {
      log += ` ${target.name} catches fire -- ${burnDamage} Grit damage at the start of each of their next ${BURN_DURATION_TURNS} turns.`;
    }
    if (tb.trait === "poison") {
      log += ` ${target.name} is poisoned (${poisonStacks * POISON_DAMAGE_PER_STACK} Grit/turn for ${POISON_DURATION_TURNS} turns${poisonStacks > 1 ? `, ${poisonStacks} stacks` : ""}).`;
    }
    if (tb.trait === "snare") {
      log += ` ${target.name} is snared -- can't Move for ${SNARE_DURATION_TURNS} of their own turns.`;
    }
    if (tb.trait === "stun") {
      log += ` ${target.name} is stunned -- they'll lose 1 AP on their next turn.`;
    }
    if (tb.trait === "blind") {
      log += ` ${target.name} is blinded -- their next attack roll has disadvantage.`;
    }
    if (wasDoused) {
      log += ` The water douses ${target.name}'s flames.`;
    }
    if (slug.causes_blind && tb.trait !== "blind") {
      log += ` ${target.name} is blinded -- their next attack roll has disadvantage.`;
    }
    if (slug.causes_snare && tb.trait !== "snare") {
      log += ` ${target.name} is snared -- can't Move for ${SNARE_DURATION_TURNS} of their own turns.`;
    }
    if (slug.causes_shock) {
      log += ` ${target.name} is shocked -- their entire next turn is skipped.`;
    }
    if (slug.causes_jam && !isSelfTarget) {
      log += ` ${target.name}'s blaster is fried -- their next shot misfires.`;
    }
    if (slug.causes_fear) {
      log += ` ${target.name} is terrified -- their entire next turn is spent fleeing.`;
    }
    if (slug.causes_confusion) {
      log += ` ${target.name} is rattled -- their own shots risk firing wildly off target for ${CONFUSION_DURATION_TURNS} turns.`;
    }
    if (slug.causes_invisible && isSelfTarget) {
      log += ` ${target.name} fades from sight.`;
    }

    if (tb.trait === "recharge") {
      const rechargedName = await rechargeAnotherSlug(shooter.ref_user_id, slug.id);
      if (rechargedName) log += ` ${shooter.name}'s ${rechargedName} recovers an energy pip.`;
    }

    // Electricity's own trait, or any slug flagged causes_chain (Speedstinger
    // generalizes this to a non-Electricity type -- see
    // docs/combat-system-design.md's "Bespoke unique-slug mechanics"). Never
    // on a ricochet leg's own hit -- Speedstinger's fast chain bolt is
    // strictly the lightning-arc effect on the *primary* hit; without this,
    // the ricocheted shot landing on its own target would re-trigger a
    // second, unwanted chain arc off of *that* hit too.
    if ((tb.trait === "chain" || slug.causes_chain) && !half && !isSplash && !isRicochetLeg) {
      const chainTarget = await findChainTarget(encounterId, target.id, shooter.id);
      if (chainTarget) {
        // A fast, forced-yellow bolt -- purely visual, no counter offer (the
        // arc calls dealHit directly below, same as it always has).
        broadcastChainFx({ fromPos: { x: target.x, y: target.y }, toPos: { x: chainTarget.x, y: chainTarget.y } });
        const chainLog = await dealHit(encounterId, shooter.id, chainTarget.id, slug, { half: true });
        log += ` It arcs to ${chainTarget.name}: ${chainLog}`;
      }
    }

    let knockedIntoWall = false;
    // Metal/Earth always shove on hit; any other type only does if its
    // template has causes_knockback ticked -- see slugKnockbackDistance.
    const kbDistance = slugKnockbackDistance(slug.type, slug.causes_knockback);
    if (kbDistance > 0) {
      const encRow = (await pool.query("SELECT walls FROM encounters WHERE id = $1", [encounterId])).rows[0];
      const kb = knockbackTarget(knockbackOrigin, { x: target.x, y: target.y }, encRow?.walls || [], kbDistance);
      scheduleKnockback(encounterId, target.id, kb.point, windowMs, firedAt);
      if (kb.hitWall) {
        log += ` ${target.name} is knocked into a wall!`;
        knockedIntoWall = true;
      }
    }
    // A hard wall impact can knock a target out on its own, independent of
    // whether Grit also hit 0 on this same hit -- see
    // docs/combat-system-design.md §5/§7. Only one roll ever fires per hit:
    // grit-hits-0 takes priority for the reason text when both are true.
    if (newGrit === 0 && !target.unconscious) {
      await triggerKnockoutRoll(target.id, knockedIntoWall ? "knockback" : "grit");
    } else if (knockedIntoWall && !target.unconscious) {
      await triggerKnockoutRoll(target.id, "knockback");
    }
  }

  // AOE Blast: everyone else within AOE_RADIUS of the target takes the same
  // hit too, at full effect (not halved like a chain arc). Each splash hit
  // is its own automatic dealHit -- no attack roll, no counter-clash, and
  // isSplash keeps it from re-triggering AOE/chain off of itself.
  if (slug.aoe_blast && !isSplash) {
    const nearby = await findAoeTargets(encounterId, { x: target.x, y: target.y }, [shooter.id, target.id]);
    for (const other of nearby) {
      const splashLog = await dealHit(encounterId, shooter.id, other.id, slug, { windowMs, firedAt, isSplash: true });
      log += ` The blast also catches ${other.name}: ${splashLog}`;
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
      windowMs: fx.windowMs,
      countered: Boolean(fx.countered),
      counterSlugType: fx.counterSlugType || null,
      outcome: fx.outcome,
      // Lets the client draw a blast-radius-sized burst instead of the
      // normal small one -- an AOE slug always explodes at full size,
      // hit or miss (see the miss branch of resolveNormalHit below).
      aoe: Boolean(fx.slug.aoe_blast),
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

// The follow-up to a LAUNCH broadcast: arrives whenever the shot actually
// finishes resolving (immediately for an out-of-range/uncontested shot, or
// up to windowMs later for a shot that offered a counter) and tells the
// client what the already-playing animation should reveal -- without ever
// having delayed that animation's start.
function broadcastShotResolved(offer, { outcome, countered = false, counterSlugType = null, impactPoint = null }) {
  broadcastAll({
    type: "combat-shot-resolved",
    resolved: { id: offer.fxId, outcome, countered, counterSlugType, impactPoint },
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

// Shared shot-resolution tail: broadcasts the launch, offers the target a
// counter if they have one available, otherwise resolves immediately.
// Factored out of /actions/shoot's own tail so Speedstinger's ricochet leg
// (a second, server-triggered "shot" -- see fireSecondaryShot below) can
// reuse the exact same offer-or-resolve logic a real player's shot goes
// through, instead of a parallel copy that could drift out of sync with it.
// Returns { pending: boolean } -- true if a counter was offered (and is now
// sitting in pendingCounters, resolved later by timeout or the defender's
// choice), false if it was resolved immediately inside this call.
async function launchAndOfferCounter(offer) {
  broadcastShotFx({ ...offer, outcome: null });
  const target = await getCombatant(offer.targetCombatantId);
  const eligible = target ? await findEligibleCounterSlugs(target) : [];
  if (target && eligible.length > 0) {
    const timeoutHandle = setTimeout(() => resolveCounterOffer(offer.fxId, null), offer.windowMs);
    pendingCounters.set(offer.fxId, { ...offer, userId: target.ref_user_id, eligibleSlugRows: eligible, timeoutHandle });
    if (target.ref_user_id) {
      notifyUser(target.ref_user_id, {
        type: "counter-offered",
        offer: {
          id: offer.fxId,
          windowMs: offer.windowMs,
          attackerName: offer.attackerName,
          slugName: offer.slug.name,
          slugType: offer.slug.type,
          eligibleSlugs: eligible.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            clashPower: s.clash_power,
            clashDefense: s.clash_defense,
          })),
        },
      });
    }
    await broadcastEncounter(offer.encounterId);
    await pushCombatLog(offer.encounterId, `${offer.attackerName} fires ${offer.slug.name} at ${offer.targetName}...`);
    return { pending: true };
  }
  await resolveNormalHit(offer);
  return { pending: false };
}

// Fires `slug` at `target` as a fresh, independently-counterable shot, with
// the *visual* origin at `originPos` -- which for Speedstinger's ricochet is
// the first target's own position, not the true shooter's. Ownership (whose
// slug this is, for energy/cooldown/recharge purposes) always stays with
// `attackerId`. Shares the exact range/wall-block logic the main Attack flow
// uses, just condensed since there's no HTTP request to respond to here.
async function fireSecondaryShot({ encounterId, attackerId, attackerName, originPos, target, slug, blaster, walls }) {
  const tb = typeBallistics(slug.type);
  const targetPos = { x: target.x, y: target.y };
  const combinedRange = Math.max(blaster.range, tb.range);
  const dist = distance(originPos, targetPos);
  const wallHit = firstWallHit(originPos, targetPos, walls);
  const wallBlocks = Boolean(wallHit) && tb.trait !== "phase";
  const wallDist = wallBlocks ? wallHit.hit.t * dist : Infinity;
  const stopDist = Math.min(combinedRange, wallDist);
  const reaches = dist <= stopDist;
  const impactPoint = reaches ? targetPos : pointAtDistance(originPos, targetPos, stopDist);
  const rawWindowMs = shotFlightMs(dist, blaster.range);
  const windowMs = slug.ultra_fast ? Math.round(rawWindowMs * ULTRA_FAST_WINDOW_FACTOR) : rawWindowMs;
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
    // Stops maybeRicochet from firing again off of this already-bounced
    // shot -- Speedstinger bounces exactly once (B -> C, never C -> D...).
    isRicochetLeg: true,
  };

  if (!reaches) {
    broadcastShotFx({ ...offer, outcome: null });
    broadcastShotResolved(offer, { outcome: "out-of-range" });
    scheduleAfterFlight(firedAt, windowMs, async () => {
      await pushCombatLog(encounterId, `${slug.name} ricochets wide, missing ${target.name} entirely.`);
      await broadcastEncounter(encounterId);
    });
    await broadcastEncounter(encounterId);
    return;
  }

  await launchAndOfferCounter(offer);
  await broadcastEncounter(encounterId);
}

// Speedstinger's ricochet (see causes_chain/ricochets in dealHit's docs):
// after a shot actually connects with its primary target (an uncontested
// hit, or a countered one where the attacker still won the clash), the same
// full-power shot bounces on to a second nearby target, launched visually
// from the first target's own position, with its own completely independent
// counter-clash opportunity. Only bounces once.
async function maybeRicochet(offer, hitTargetId) {
  if (!offer.slug.ricochets || offer.isRicochetLeg) return;
  const bounceFrom = await getCombatant(hitTargetId);
  if (!bounceFrom) return;
  const nextTarget = await findChainTarget(offer.encounterId, hitTargetId, offer.attackerCombatantId);
  if (!nextTarget) {
    await pushCombatLog(offer.encounterId, `${offer.slug.name} ricochets off ${bounceFrom.name} but finds no one else nearby.`);
    await broadcastEncounter(offer.encounterId);
    return;
  }
  await pushCombatLog(offer.encounterId, `${offer.slug.name} ricochets off ${bounceFrom.name} toward ${nextTarget.name}!`);
  const wallsRow = (await pool.query("SELECT walls FROM encounters WHERE id = $1", [offer.encounterId])).rows[0];
  await fireSecondaryShot({
    encounterId: offer.encounterId,
    attackerId: offer.attackerCombatantId,
    attackerName: offer.attackerName,
    originPos: { x: bounceFrom.x, y: bounceFrom.y },
    target: nextTarget,
    slug: offer.slug,
    blaster: offer.blaster,
    walls: wallsRow?.walls || [],
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

  const quality = QUALITY_TIERS[offer.blaster.quality] || QUALITY_TIERS[0];
  const tb = typeBallistics(offer.slug.type);
  // Uses offer.attackerPos (the shot's real visual origin), not a fresh
  // attacker.x/y -- normally identical (the attacker can't move mid-
  // resolution), but this is also what lets Speedstinger's ricochet leg
  // reuse this same function with a *different* origin than the true
  // shooter's own position (see fireSecondaryShot/maybeRicochet below).
  const dist = distance(offer.attackerPos, { x: target.x, y: target.y });
  // Pivot the accuracy penalty on the shot's actual effective range (blaster
  // vs. slug type, whichever reaches further), not the blaster's range
  // alone -- so it scales correctly whichever one is doing the reaching.
  const penalty = rangePenalty(dist, Math.max(offer.blaster.range, tb.range));
  const targetDexMod = target.data?.dexMod ?? 0;

  let roll = rollD20();
  if (attacker.status_effects?.blinded) {
    roll = Math.min(roll, rollD20());
    await updateCombatant(attacker.id, {
      status_effects: JSON.stringify({ ...attacker.status_effects, blinded: false }),
    });
  }
  const attackTotal = roll + offer.blaster.accuracy + quality.accuracyBonus + tb.accuracyMod + penalty;
  const dc = 10 + targetDexMod;
  const hit = attackTotal >= dc;
  // Went wide instead of stopping dead-on the target -- see missDeflection.
  // Only computed for a miss; a hit's reveal doesn't need it.
  const deflected = hit ? null : missDeflection(offer.attackerPos, offer.impactPoint, walls);

  broadcastShotResolved(offer, hit ? { outcome: "hit" } : { outcome: "miss", impactPoint: deflected });

  scheduleAfterFlight(offer.firedAt, offer.windowMs, async () => {
    let log;
    if (hit) {
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
      });
      log = `${attacker.name}'s ${offer.slug.name} hits ${target.name} (${attackTotal} vs DC ${dc})! ${hitLog}`;
      await maybeRicochet(offer, target.id);
    } else {
      log = `${attacker.name}'s ${offer.slug.name} misses ${target.name} (${attackTotal} vs DC ${dc}).`;
      // A miss still fries the target's blaster -- causes_jam triggers on
      // hit or miss alike (the shot got close enough to matter), just not
      // on the attacker's own misfire (which returns before this point ever
      // runs), an out-of-range shot (handled earlier, never reaches here),
      // or a self-targeted shot (Thugglet shooting yourself for
      // invisibility shouldn't also jam your own gun).
      if (offer.slug.causes_jam && target.kind !== "mecha" && target.id !== attacker.id) {
        await updateCombatant(target.id, {
          status_effects: JSON.stringify({ ...(target.status_effects || {}), jammed: true }),
        });
        log += ` ${target.name}'s blaster is fried -- their next shot misfires.`;
      }
      // An AOE slug still detonates on a miss -- it just goes off wherever
      // the deflected shot actually landed instead of on the target.
      // Whoever's within AOE_RADIUS of that point (which can include the
      // original target, if the miss didn't carry it far) takes the blast
      // anyway.
      if (offer.slug.aoe_blast) {
        const caught = await findAoeTargets(offer.encounterId, deflected, [attacker.id]);
        if (caught.length > 0) {
          log += " It still detonates!";
          for (const other of caught) {
            const splashLog = await dealHit(offer.encounterId, attacker.id, other.id, offer.slug, { isSplash: true });
            log += ` The blast catches ${other.name}: ${splashLog}`;
          }
        } else {
          log += " It detonates harmlessly, catching no one.";
        }
      }
    }
    await pushCombatLog(offer.encounterId, log);
    await broadcastEncounter(offer.encounterId);
  });
}

async function resolveCounterOffer(id, chosenSlugId) {
  const offer = pendingCounters.get(id);
  if (!offer) return null;
  clearTimeout(offer.timeoutHandle);
  pendingCounters.delete(id);

  const counterSlugRow = chosenSlugId ? offer.eligibleSlugRows.find((s) => s.id === chosenSlugId) : null;

  if (!counterSlugRow) {
    await resolveNormalHit(offer);
    return { pending: false, countered: false };
  }

  // Spending the counter slug's own energy pip is the cost of the *choice*
  // to counter, same as the attacker's own AP/energy at fire time -- it
  // isn't a result of the clash, so it isn't held back for the animation.
  await spendEnergyPip(counterSlugRow.id);
  // Emberblade: power and defense triple specifically while it's the slug on
  // either side of a clash (not on an ordinary uncountered hit) -- applies
  // to whichever side actually has it, attacker or defender.
  const attackerClashMultiplier = offer.slug.clash_tripled ? CLASH_TRIPLE_MULTIPLIER : 1;
  const defenderClashMultiplier = counterSlugRow.clash_tripled ? CLASH_TRIPLE_MULTIPLIER : 1;
  const outcome = resolveClash({
    attackerPower: offer.slug.clash_power * attackerClashMultiplier,
    attackerDefense: offer.slug.clash_defense * attackerClashMultiplier,
    defenderPower: counterSlugRow.clash_power * defenderClashMultiplier,
    defenderDefense: counterSlugRow.clash_defense * defenderClashMultiplier,
  });

  // The clash math (who wins) is "the direction" -- fine to know and reveal
  // right away. What it actually *does* (ejects, damage) is held back for
  // scheduleAfterFlight so it lands with the clash/aftermath burst instead
  // of before it, same as a normal hit.
  broadcastShotResolved(offer, { countered: true, counterSlugType: counterSlugRow.type, outcome });

  scheduleAfterFlight(offer.firedAt, offer.windowMs, async () => {
    let log;
    if (outcome === "double-break") {
      await ejectSlug(offer.slug.id);
      await ejectSlug(counterSlugRow.id);
      log = `${offer.attackerName}'s ${offer.slug.name} and ${offer.targetName}'s ${counterSlugRow.name} clash head-on and both go flying -- no damage.`;
    } else if (outcome === "bounce") {
      log = `${offer.attackerName}'s ${offer.slug.name} and ${offer.targetName}'s ${counterSlugRow.name} clash and deflect harmlessly.`;
    } else if (outcome === "attacker-wins") {
      await ejectSlug(counterSlugRow.id);
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
      });
      log = `${offer.attackerName}'s ${offer.slug.name} smashes through ${offer.targetName}'s counter! ${hitLog}`;
      // B's counter didn't actually stop the shot (it still connected) --
      // Speedstinger's ricochet continues on to a second target exactly like
      // an uncontested hit would.
      await maybeRicochet(offer, offer.targetCombatantId);
    } else {
      await ejectSlug(offer.slug.id);
      const reflectingSlug =
        defenderClashMultiplier > 1 ? { ...counterSlugRow, clash_power: counterSlugRow.clash_power * defenderClashMultiplier } : counterSlugRow;
      // The counter-slug's own "shooter" is the defender, launched from
      // their position (offer.targetPos) -- already what shooter.x/y would
      // resolve to here anyway (the defender can't ricochet), but explicit
      // for the same reason as the two call sites above.
      const hitLog = await dealHit(offer.encounterId, offer.targetCombatantId, offer.attackerCombatantId, reflectingSlug, {
        originPos: offer.targetPos,
      });
      log = `${offer.targetName}'s ${counterSlugRow.name} reflects the shot back at ${offer.attackerName}! ${hitLog}`;
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
    // trajectory -- the attacker's shot travels attacker -> target, the
    // counter travels target -> attacker.
    if (offer.slug.clash_tripled) {
      await addTrailWall(offer.encounterId, offer.attackerPos, offer.impactPoint, offer.slug.type);
    }
    if (counterSlugRow.clash_tripled) {
      await addTrailWall(offer.encounterId, offer.targetPos, offer.attackerPos, counterSlugRow.type);
    }

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
      const activeSlot = attacker.data?.activeWeaponSlot ?? PRIMARY_WEAPON_SLOT;
      if (blaster.equip_slot !== activeSlot) {
        return { error: "That slug is loaded into your other weapon -- switch weapons first." };
      }
    }
    if ((slug.cooldown_turns_left || 0) > 0) {
      return { error: "That slug hasn't returned to hand yet." };
    }
    if (!Array.isArray(slug.energy_pips) || !slug.energy_pips.some(Boolean)) {
      return { error: "That slug is out of energy -- it needs to recharge." };
    }
    return { slug, blaster };
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
      energy_pips: [true],
      user_id: null,
    };
    const blaster = {
      accuracy: Number.isInteger(npcBlaster?.accuracy) ? npcBlaster.accuracy : 0,
      range: Number.isInteger(npcBlaster?.range) ? npcBlaster.range : 20,
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

  if (actionType === "break-wall") {
    if (tb.trait === "phase") {
      // Dark slugs phase through walls, they don't break them -- there's
      // nothing for a Break Wall action to actually do.
      log = `${attacker.name}'s ${slug.name} phases straight through -- there's nothing solid enough for it to break.`;
    } else {
      const row = (await pool.query("SELECT walls, bridges, next_wall_id FROM encounters WHERE id = $1", [encounterId])).rows[0];
      const walls = row?.walls || [];
      const bridges = row?.bridges || [];
      const wallHit = firstWallHit(attackerPos, finalPoint, walls);
      if (wallHit) {
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
    const seg = perpendicularSegment(attackerPos, finalPoint, WALL_MAKER_LENGTH);
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
    const row = (await pool.query("SELECT bridges, next_bridge_id FROM encounters WHERE id = $1", [encounterId])).rows[0];
    const bridgeId = row?.next_bridge_id ?? 1;
    const bridges = [
      ...(row?.bridges || []),
      { id: bridgeId, x: finalPoint.x, y: finalPoint.y, angle, width: BRIDGE_WIDTH, length: BRIDGE_LENGTH, slugType: slug.type },
    ];
    await pool.query("UPDATE encounters SET bridges = $1, next_bridge_id = $2 WHERE id = $3", [
      JSON.stringify(bridges),
      bridgeId + 1,
      encounterId,
    ]);
    log = `${attacker.name}'s ${slug.name} builds a bridge!`;
  }

  if (!hit) log = `${attacker.name}'s ${slug.name} goes wide -- ${log.charAt(0).toLowerCase()}${log.slice(1)}`;

  broadcastShotResolved({ fxId }, { outcome: hit ? "hit" : "miss", impactPoint });
  await pushCombatLog(encounterId, log);
  await broadcastEncounter(encounterId);
}

async function resolveEnvironmentShot({ actionType, attacker, slug, blaster, tb, targetPoint, encounterRow, fxId, firedAt }) {
  const attackerPos = { x: attacker.x, y: attacker.y };
  const combinedRange = Math.max(blaster.range, tb.range);
  const rawDist = distance(attackerPos, targetPoint);
  const dist = Math.min(rawDist, combinedRange);
  const intendedPoint = rawDist <= combinedRange ? targetPoint : pointAtDistance(attackerPos, targetPoint, combinedRange);

  // Same accuracy formula as a normal attack roll, but against a flat
  // ENV_ACTION_DC instead of a defender's DEX -- there's no combatant here
  // to compute a real DC from.
  const quality = QUALITY_TIERS[blaster.quality] || QUALITY_TIERS[0];
  const penalty = rangePenalty(dist, Math.max(blaster.range, tb.range));
  const attackTotal = rollD20() + blaster.accuracy + quality.accuracyBonus + tb.accuracyMod + penalty;
  const hit = attackTotal >= ENV_ACTION_DC;
  // A miss runs the exact same effect logic, just a few degrees off target
  // -- a wall might land somewhere else, a different wall gets broken, or
  // the shot finds nothing at all. See missDeflection.
  const finalPoint = hit ? intendedPoint : missDeflection(attackerPos, intendedPoint, encounterRow.walls);

  const windowMs = shotFlightMs(dist, blaster.range);

  broadcastShotFx({
    fxId,
    attackerCombatantId: attacker.id,
    targetCombatantId: null,
    attackerPos,
    targetPos: finalPoint,
    impactPoint: finalPoint,
    slug,
    windowMs,
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

router.post("/actions/shoot", async (req, res) => {
  const { attackerId, targetId, targetPoint, slugId, npcSlug, npcBlaster, actionType: rawActionType } = req.body || {};
  const actionType = ["break-wall", "make-wall", "build-bridge"].includes(rawActionType) ? rawActionType : "attack";
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

    let target = null;
    if (actionType === "attack") {
      target = await getCombatant(targetId);
      if (!target) return res.status(404).json({ error: "Target not found." });
    } else if (!targetPoint || !Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y)) {
      return res.status(400).json({ error: "A target location is required." });
    }

    const resolved = await resolveShooterSlugAndBlaster(attacker, req, { slugId, npcSlug, npcBlaster });
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    const { slug, blaster } = resolved;

    if (actionType === "break-wall" && !slug.breaks_walls) {
      return res.status(400).json({ error: "That slug can't break walls." });
    }
    if (actionType === "make-wall" && !slug.wall_maker) {
      return res.status(400).json({ error: "That slug can't make walls." });
    }
    if (actionType === "build-bridge" && !slug.bridge_maker) {
      return res.status(400).json({ error: "That slug can't build bridges." });
    }

    if (attacker.current_ap < slug.ap_cost) return res.status(400).json({ error: "Not enough AP." });

    const attackerPos = { x: attacker.x, y: attacker.y };
    const tb = typeBallistics(slug.type);

    await updateCombatant(attacker.id, { current_ap: attacker.current_ap - slug.ap_cost });
    if (slug.id != null) await spendEnergyPip(slug.id);

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
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    if (actionType !== "attack") {
      const result = await resolveEnvironmentShot({ actionType, attacker, slug, blaster, tb, targetPoint, encounterRow, fxId, firedAt });
      return res.json(result);
    }

    // ---- Attack a Slinger: the original targeted-shot flow -------------

    const targetPos = { x: target.x, y: target.y };
    // tb.range already has RANGE_SCALE baked in (combatRules.js) -- don't
    // scale it again here, and blaster.range is intentionally left at its
    // raw stored value (see itemRules.js) rather than migrated.
    const combinedRange = Math.max(blaster.range, tb.range);
    const dist = distance(attackerPos, targetPos);

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
    const pierces = Boolean(wallHit) && slug.pierces_walls && tb.trait !== "phase";
    const wallBlocks = Boolean(wallHit) && tb.trait !== "phase" && !pierces;
    const wallDist = wallBlocks ? wallHit.hit.t * dist : Infinity;
    const stopDist = Math.min(combinedRange, wallDist);
    const reaches = dist <= stopDist;
    const impactPoint = reaches ? targetPos : pointAtDistance(attackerPos, targetPos, stopDist);

    // Scales with the equipped weapon's own range vs. the actual distance --
    // see shotFlightMs's comment. Always <= COUNTER_WINDOW_MS, so the
    // reaction window (which mirrors it) never runs longer than the fixed
    // maximum either. Zeus shrinks this further still -- "near impossible to
    // counter" -- which for free also speeds up the client's own bolt
    // animation, since that's driven directly off this same number.
    const rawWindowMs = shotFlightMs(dist, blaster.range);
    const windowMs = slug.ultra_fast ? Math.round(rawWindowMs * ULTRA_FAST_WINDOW_FACTOR) : rawWindowMs;

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
      broadcastShotFx({ ...offer, outcome: null });
      broadcastShotResolved(offer, { outcome: "miss", impactPoint: wildPoint });
      scheduleAfterFlight(firedAt, windowMs, async () => {
        let log = `${attacker.name}'s ${slug.name} goes completely haywire, firing a full 180 off target!`;
        if (slug.aoe_blast) {
          const caught = await findAoeTargets(attacker.encounter_id, wildPoint, [attacker.id]);
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

    // Everything else actually launches: the bolt starts flying and the
    // launch sound plays immediately, right now, the instant the AP is
    // spent -- not delayed until the shot finishes resolving. Whatever
    // happens next (a miss, a hit, falling short, or a counter-clash)
    // arrives later as a separate combat-shot-resolved update, layered onto
    // this same already-playing animation instead of holding up its start.
    // (The actual broadcastShotFx call is inside launchAndOfferCounter,
    // below -- kept there so it's shared with Speedstinger's ricochet leg,
    // which launches the exact same way but isn't a real HTTP request.)

    // A hazard's own appearance is a *result* of the shot landing, same as
    // damage or a status effect -- it shouldn't pop up before the explosion
    // that's supposed to leave it there. Delayed and grown-in client-side
    // (see the encounter.hazards diff in CombatMap.jsx) instead of applied
    // instantly.
    if (slug.type === "Ice" || slug.hazard_maker) {
      scheduleAfterFlight(firedAt, windowMs, async () => {
        if (slug.type === "Ice") await addIceHazard(attacker.encounter_id, impactPoint);
        if (slug.hazard_maker) await addDamageHazard(attacker.encounter_id, impactPoint, slug);
      });
    }

    // Emberblade / Flaringo: a wall of fire along the exact line the shot
    // traveled, unconditional on hit/miss/out-of-range -- same trigger rule
    // as Ice's patch above.
    if (slug.trail_wall) {
      scheduleAfterFlight(firedAt, windowMs, async () => {
        await addTrailWall(attacker.encounter_id, attackerPos, impactPoint, slug.type);
      });
    }

    // Bladier: the wall actually breaks once the bolt's flight would have
    // reached it, same delayed-resolution treatment as every other
    // terrain mutation tied to a shot (see WALL_BREAK_RADIUS's comment,
    // applyEnvironmentEffect's break-wall branch, which this mirrors).
    if (pierces) {
      scheduleAfterFlight(firedAt, windowMs, async () => {
        const row = (await pool.query("SELECT walls, next_wall_id FROM encounters WHERE id = $1", [attacker.encounter_id])).rows[0];
        const walls = row?.walls || [];
        const stillThere = walls.find((w) => w.id === wallHit.wall.id);
        if (!stillThere) return; // already gone by the time the bolt got there
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
      // Deliberately worded the same as an ordinary miss -- nobody is told
      // whether this was a range problem or a wall in the way, only that
      // the shot didn't land. The outcome reveal is immediate ("the
      // direction"); the log entry is a result of it, so it waits for the
      // flight to actually finish, same as everything else.
      broadcastShotResolved(offer, { outcome: "out-of-range" });
      scheduleAfterFlight(firedAt, windowMs, async () => {
        await pushCombatLog(attacker.encounter_id, `${attacker.name}'s ${slug.name} goes wide of ${target.name}.`);
        await broadcastEncounter(attacker.encounter_id);
      });
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    const result = await launchAndOfferCounter(offer);
    if (result.pending) {
      return res.json({ pending: true, counterId: fxId, windowMs });
    }
    const encounter = await broadcastEncounter(attacker.encounter_id);
    res.json({ pending: false, encounter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fire." });
  }
});

router.post("/counters/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const { slugId } = req.body || {};
  const offer = pendingCounters.get(id);
  if (!offer) return res.status(404).json({ error: "This counter window has already closed." });
  if (offer.userId !== req.user.sub) return res.status(403).json({ error: "This counter isn't yours to make." });
  try {
    const result = await resolveCounterOffer(id, Number.isInteger(slugId) ? slugId : null);
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
  if (offer.userId !== req.user.sub) return res.status(403).json({ error: "This roll isn't yours to make." });
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
    if (mecha.disabled) return res.status(400).json({ error: "That mecha is disabled." });
    if (rider.current_ap < MOUNT_AP_COST) return res.status(400).json({ error: "Not enough AP." });
    if (distance({ x: rider.x, y: rider.y }, { x: mecha.x, y: mecha.y }) > MOUNT_RANGE) {
      return res.status(400).json({ error: "Too far away to mount." });
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
    await updateCombatant(rider.id, { mounted_on: null, current_ap: rider.current_ap - MOUNT_AP_COST });
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
    if (!mecha || mecha.kind !== "mecha" || !target) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [mecha.encounter_id])).rows[0];
    const { rows: riders } = await pool.query("SELECT * FROM combatants WHERE mounted_on = $1", [mecha.id]);
    const driverAuthorized = req.user.role === "Dungeon Master" || riders.some((r) => r.ref_user_id === req.user.sub);
    if (!driverAuthorized) return res.status(403).json({ error: "You aren't riding that mecha." });
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounterRow, mecha)) {
      return res.status(400).json({ error: "It isn't this mecha's turn." });
    }
    if (mecha.disabled) return res.status(400).json({ error: "This mecha is disabled." });
    if (mecha.rammed_this_round) return res.status(400).json({ error: "This mecha already rammed this round." });
    if (mecha.current_ap < RAM_AP_COST) return res.status(400).json({ error: "Not enough AP." });
    if (distance({ x: mecha.x, y: mecha.y }, { x: target.x, y: target.y }) > MOUNT_RANGE) {
      return res.status(400).json({ error: "Target isn't adjacent." });
    }

    await updateCombatant(mecha.id, { current_ap: mecha.current_ap - RAM_AP_COST, rammed_this_round: true });

    const tierInfo = MECHA_TIER_LABELS[mecha.data?.tier ?? 0] || MECHA_TIER_LABELS[0];
    if (Math.random() * 100 < (tierInfo.breakdownChance ?? 0)) {
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
      log = `${mecha.name} rams at ${target.name} and misses (${attackTotal} vs DC ${dc}).`;
    } else {
      const rammingPower = mecha.data?.rammingPower ?? 1;
      const dmg = rammingPower * 2;
      if (target.kind === "mecha") {
        const reduced = Math.max(0, dmg - (target.data?.armor ?? 0));
        const newStructure = Math.max(0, (target.current_structure ?? 0) - reduced);
        await updateCombatant(target.id, { current_structure: newStructure });
        log = `${mecha.name} rams ${target.name} for ${reduced} Structure damage.`;
        if (newStructure === 0) {
          await disableMecha(target.id);
          log += ` ${target.name} is disabled!`;
        }
        const backDmg = Math.max(0, (target.data?.rammingPower ?? 0) * 2 - (mecha.data?.armor ?? 0));
        const mechaNewStructure = Math.max(0, (mecha.current_structure ?? 0) - backDmg);
        await updateCombatant(mecha.id, { current_structure: mechaNewStructure });
        log += ` ${mecha.name} takes ${backDmg} Structure damage from the collision.`;
        if (mechaNewStructure === 0) {
          await disableMecha(mecha.id);
          log += ` ${mecha.name} is disabled!`;
        }
      } else {
        const gritDmg = Math.floor(dmg / 2);
        const newGrit = Math.max(0, (target.current_grit ?? 0) - gritDmg);
        const updatedTarget = await updateCombatant(target.id, { current_grit: newGrit, damaged_this_turn: true });
        await syncCharacterFromCombatant(updatedTarget);
        log = `${mecha.name} rams ${target.name} for ${gritDmg} Grit damage.`;

        const kb = knockbackTarget({ x: mecha.x, y: mecha.y }, { x: target.x, y: target.y }, encounterRow.walls, KNOCKBACK_DISTANCE);
        await updateCombatant(target.id, { x: kb.point.x, y: kb.point.y });
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
};
export default router;
