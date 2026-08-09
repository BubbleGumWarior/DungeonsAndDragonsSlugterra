import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll, notifyUser } from "../ws.js";
import { statModifier, computeMaxGrit, actionPoints, initiativeBonus } from "../characterRules.js";
import { QUALITY_TIERS } from "../itemRules.js";
import { TIER_LABELS as MECHA_TIER_LABELS } from "../mechaRules.js";
import { toClientSlug } from "./slugs.js";
import { toClientBlaster } from "./blasters.js";
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
    // Always sourced from the NPC template, not this row -- see
    // loadFullEncounter's join. Combat itself never hides a combatant; this
    // only tells the client whether to redact this NPC's stats for players.
    npcRevealed: row.npc_revealed ?? false,
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
    `SELECT c.*, nt.revealed AS npc_revealed
     FROM combatants c
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
    const walls = [...rows[0].walls, { id: wallId, x1, y1, x2, y2 }];
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
           breaks_walls, causes_knockback, equipped_blaster_id, magazine_slot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
          equippedBlasterId,
          magazineSlot,
        ]
      );
      broadcastAll({ type: "slug-updated", userId: null, slug: toClientSlug(slugRows[0]) });
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
  if (nextCombatant) {
    const stunned = Boolean(nextCombatant.status_effects?.stunned);
    const refillAp = stunned ? Math.max(0, nextCombatant.max_ap - 1) : nextCombatant.max_ap;
    const nextStatus = { ...(nextCombatant.status_effects || {}) };
    if (stunned) delete nextStatus.stunned;
    await tickSlugCooldowns(nextCombatant);
    await updateCombatant(nextCombatant.id, {
      current_ap: refillAp,
      damaged_this_turn: false,
      status_effects: JSON.stringify(nextStatus),
      ...(wrapped ? { rammed_this_round: false } : {}),
    });
  }
  if (wrapped) {
    await pool.query("UPDATE combatants SET rammed_this_round = false WHERE encounter_id = $1", [encounterId]);
  }

  await pool.query("UPDATE encounters SET active_turn_index = $1, round = $2 WHERE id = $3", [nextIndex, round, encounterId]);
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

    const speedPerAp = combatant.kind === "mecha" ? (combatant.data?.speed || 1) * MECHA_SPEED_UNIT : MOVE_SPEED_PER_AP;
    const dist = distance({ x: combatant.x, y: combatant.y }, { x, y });
    let apNeeded = Math.max(1, Math.ceil(dist / speedPerAp));

    const statusEffects = combatant.status_effects || {};
    if (statusEffects.rooted) {
      apNeeded += 1; // rooted: movement costs an extra AP this use, then clears
    }
    if (combatant.current_ap < apNeeded) {
      return res.status(400).json({ error: "Not enough AP to move that far." });
    }

    const blocked = firstWallHit({ x: combatant.x, y: combatant.y }, { x, y }, encounter.walls);
    if (blocked) {
      return res.status(400).json({ error: "A wall blocks that path." });
    }

    const nextStatus = { ...statusEffects };
    delete nextStatus.rooted;

    await updateCombatant(combatant.id, {
      x,
      y,
      current_ap: combatant.current_ap - apNeeded,
      status_effects: JSON.stringify(nextStatus),
    });
    const encounterOut = await broadcastEncounter(combatant.encounter_id);
    res.json({ encounter: encounterOut });
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
    if (d <= 8 && d < nearestDist) {
      nearest = c;
      nearestDist = d;
    }
  }
  return nearest;
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

// Wall-breaking shots used to blow the wall open the instant the shot
// resolved -- often well before the projectile had visually traveled far
// enough to reach it. The client always animates the flight over
// windowMs * SHOT_FLIGHT_MULTIPLIER (see broadcastShotFx), starting from the
// moment the shot LAUNCHED (not whenever it happens to finish resolving --
// for a countered shot that's answered early, those can be seconds apart).
// So the target delay is anchored to `firedAt`, with however much real time
// has already passed since launch subtracted back out, rather than being
// re-anchored to "now" (which is when dealHit happens to run).
function scheduleWallBreak(encounterId, wallHit, windowMs, firedAt) {
  const t = Math.max(0, Math.min(1, wallHit.hit.t));
  const targetDelayMs = Math.max(0, (windowMs || 0) * SHOT_FLIGHT_MULTIPLIER * t);
  const elapsedSinceLaunch = Date.now() - (firedAt ?? Date.now());
  const delayMs = Math.max(0, targetDelayMs - elapsedSinceLaunch);
  setTimeout(async () => {
    try {
      const encRow = (await pool.query("SELECT walls, next_wall_id FROM encounters WHERE id = $1", [encounterId])).rows[0];
      const wall = (encRow?.walls || []).find((w) => w.id === wallHit.wall.id);
      if (!wall) return;
      const pieces = breakWallSegment(wall, wallHit.hit);
      const nextWalls = (encRow.walls || []).filter((w) => w.id !== wall.id);
      let nextId = encRow.next_wall_id;
      for (const piece of pieces) {
        nextWalls.push({ id: nextId, ...piece });
        nextId += 1;
      }
      await pool.query("UPDATE encounters SET walls = $1, next_wall_id = $2 WHERE id = $3", [
        JSON.stringify(nextWalls),
        nextId,
        encounterId,
      ]);
      await pushCombatLog(encounterId, "The wall is blown open!");
      await broadcastEncounter(encounterId);
    } catch (err) {
      console.error("Could not break wall:", err);
    }
  }, delayMs);
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

// The core damage/heal/trait/wall-break/knockback resolver, shared by normal
// hits, clash outcomes, chained hits, and ram. Re-fetches fresh rows so it's
// safe to call after an arbitrary delay (a counter window can take seconds).
async function dealHit(encounterId, shooterCombatantId, targetCombatantId, slug, { wallHit, half = false, windowMs = 0, firedAt } = {}) {
  const shooter = await getCombatant(shooterCombatantId);
  const target = await getCombatant(targetCombatantId);
  if (!shooter || !target) return "the target is no longer there.";

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
  if (tb.trait === "burn" || tb.trait === "poison") amount += 1;
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
    if (tb.trait === "root") nextStatus.rooted = true;
    if (tb.trait === "stun") nextStatus.stunned = true;
    if (tb.trait === "blind") nextStatus.blinded = true;
    if (tb.trait === "douse") delete nextStatus.burning;

    const updated = await updateCombatant(target.id, {
      current_grit: newGrit,
      damaged_this_turn: true,
      status_effects: JSON.stringify(nextStatus),
    });
    await syncCharacterFromCombatant(updated);
    log = `${target.name} takes ${amount} Grit damage${newGrit === 0 ? " and is at 0 Grit!" : ""}.`;

    if (tb.trait === "recharge") {
      const rechargedName = await rechargeAnotherSlug(shooter.ref_user_id, slug.id);
      if (rechargedName) log += ` ${shooter.name}'s ${rechargedName} recovers an energy pip.`;
    }

    if (tb.trait === "chain" && !half) {
      const chainTarget = await findChainTarget(encounterId, target.id, shooter.id);
      if (chainTarget) {
        const chainLog = await dealHit(encounterId, shooter.id, chainTarget.id, slug, { half: true });
        log += ` It arcs to ${chainTarget.name}: ${chainLog}`;
      }
    }

    let knockedIntoWall = false;
    if (slug.causes_knockback) {
      const encRow = (await pool.query("SELECT walls FROM encounters WHERE id = $1", [encounterId])).rows[0];
      const kb = knockbackTarget({ x: shooter.x, y: shooter.y }, { x: target.x, y: target.y }, encRow?.walls || []);
      scheduleKnockback(encounterId, target.id, kb.point, windowMs, firedAt);
      if (kb.hitWall) {
        log += ` ${target.name} is knocked into a wall!`;
        knockedIntoWall = true;
      }
    }
    // A knockout roll is always about Grit actually hitting 0 -- being
    // knocked into a wall on the way down just changes the reason text on
    // that same roll (see triggerKnockoutRoll), it was never its own
    // separate trigger. It used to fire unconditionally on any wall
    // knockback, forcing a roll (or worse, an instant fall unconscious once
    // all 3 pips were already used) even when the target still had Grit
    // left after this hit.
    if (newGrit === 0 && !target.unconscious) {
      await triggerKnockoutRoll(target.id, knockedIntoWall ? "knockback" : "grit");
    }
  }

  if (slug.breaks_walls && wallHit) {
    // Delayed -- see scheduleWallBreak. Its own combat-log line and
    // encounter broadcast land later, once the shot would actually be there.
    scheduleWallBreak(encounterId, wallHit, windowMs, firedAt);
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

// The misfire roll happens up front now, at fire time (see the shoot route)
// -- by the time a shot reaches here, it has already launched, so this only
// ever resolves it as a miss or a hit.
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
    return "The shot has nothing left to hit.";
  }

  const quality = QUALITY_TIERS[offer.blaster.quality] || QUALITY_TIERS[0];
  const tb = typeBallistics(offer.slug.type);
  const dist = distance({ x: attacker.x, y: attacker.y }, { x: target.x, y: target.y });
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

  if (attackTotal < dc) {
    // Went wide instead of stopping dead-on the target -- see missDeflection.
    // Safe to just overwrite impactPoint client-side: this shot is staying
    // uncontested (fx.countered never flips true), so nothing else still
    // needs the true point once this fires.
    broadcastShotResolved(offer, {
      outcome: "miss",
      impactPoint: missDeflection(offer.attackerPos, offer.impactPoint, walls),
    });
    return `${attacker.name}'s ${offer.slug.name} misses ${target.name} (${attackTotal} vs DC ${dc}).`;
  }

  broadcastShotResolved(offer, { outcome: "hit" });
  const hitLog = await dealHit(offer.encounterId, attacker.id, target.id, offer.slug, {
    wallHit: offer.wallHit,
    windowMs: offer.windowMs,
    firedAt: offer.firedAt,
  });
  return `${attacker.name}'s ${offer.slug.name} hits ${target.name} (${attackTotal} vs DC ${dc})! ${hitLog}`;
}

async function resolveCounterOffer(id, chosenSlugId) {
  const offer = pendingCounters.get(id);
  if (!offer) return null;
  clearTimeout(offer.timeoutHandle);
  pendingCounters.delete(id);

  const counterSlugRow = chosenSlugId ? offer.eligibleSlugRows.find((s) => s.id === chosenSlugId) : null;

  if (!counterSlugRow) {
    const log = await resolveNormalHit(offer);
    await pushCombatLog(offer.encounterId, log);
    await broadcastEncounter(offer.encounterId);
    return { pending: false, countered: false, log };
  }

  await spendEnergyPip(counterSlugRow.id);
  const outcome = resolveClash({
    attackerPower: offer.slug.clash_power,
    attackerDefense: offer.slug.clash_defense,
    defenderPower: counterSlugRow.clash_power,
    defenderDefense: counterSlugRow.clash_defense,
  });

  broadcastShotResolved(offer, { countered: true, counterSlugType: counterSlugRow.type, outcome });

  let log;
  if (outcome === "double-break") {
    await ejectSlug(offer.slug.id);
    await ejectSlug(counterSlugRow.id);
    log = `${offer.attackerName}'s ${offer.slug.name} and ${offer.targetName}'s ${counterSlugRow.name} clash head-on and both go flying -- no damage.`;
  } else if (outcome === "bounce") {
    log = `${offer.attackerName}'s ${offer.slug.name} and ${offer.targetName}'s ${counterSlugRow.name} clash and deflect harmlessly.`;
  } else if (outcome === "attacker-wins") {
    await ejectSlug(counterSlugRow.id);
    const hitLog = await dealHit(offer.encounterId, offer.attackerCombatantId, offer.targetCombatantId, offer.slug, {
      wallHit: offer.wallHit,
      windowMs: offer.windowMs,
      firedAt: offer.firedAt,
    });
    log = `${offer.attackerName}'s ${offer.slug.name} smashes through ${offer.targetName}'s counter! ${hitLog}`;
  } else {
    await ejectSlug(offer.slug.id);
    const hitLog = await dealHit(offer.encounterId, offer.targetCombatantId, offer.attackerCombatantId, counterSlugRow, {});
    log = `${offer.targetName}'s ${counterSlugRow.name} reflects the shot back at ${offer.attackerName}! ${hitLog}`;
  }

  await pushCombatLog(offer.encounterId, log);
  await broadcastEncounter(offer.encounterId);
  return { pending: false, countered: true, outcome, log };
}

// ---------------------------------------------------------------------------
// Shoot Slug
// ---------------------------------------------------------------------------

router.post("/actions/shoot", async (req, res) => {
  const { attackerId, targetId, slugId, npcSlug, npcBlaster } = req.body || {};
  try {
    const attacker = await getCombatant(attackerId);
    const target = await getCombatant(targetId);
    if (!attacker || !target) return res.status(404).json({ error: "Combatant not found." });
    const encounterRow = (await pool.query("SELECT * FROM encounters WHERE id = $1", [attacker.encounter_id])).rows[0];
    if (!encounterRow) return res.status(404).json({ error: "Encounter not found." });
    if (!isActingCombatantAuthorized(req, attacker, encounterRow)) {
      return res.status(403).json({ error: "That isn't your combatant." });
    }
    if (req.user.role !== "Dungeon Master" && !requireOwnTurn(encounterRow, attacker)) {
      return res.status(400).json({ error: "It isn't your turn." });
    }
    if (attacker.unconscious || attacker.disabled) return res.status(400).json({ error: "This combatant can't act." });

    let slug, blaster;
    if (attacker.kind === "character" || (attacker.kind === "npc" && Number.isInteger(slugId))) {
      if (!Number.isInteger(slugId)) return res.status(400).json({ error: "Choose a slug to fire." });
      const slugResult = await pool.query("SELECT * FROM slugs WHERE id = $1", [slugId]);
      slug = slugResult.rows[0];
      const ownsSlug =
        slug &&
        ((attacker.kind === "character" && slug.user_id === attacker.ref_user_id) ||
          (attacker.kind === "npc" && slug.owner_combatant_id === attacker.id));
      if (!ownsSlug) return res.status(400).json({ error: "That slug isn't yours." });
      if (!slug.equipped_blaster_id) return res.status(400).json({ error: "That slug isn't loaded into a weapon." });
      const blasterResult = await pool.query("SELECT * FROM blasters WHERE id = $1", [slug.equipped_blaster_id]);
      blaster = blasterResult.rows[0];
      if (!blaster || blaster.equip_slot === null) return res.status(400).json({ error: "That weapon isn't equipped." });
      // A character can only fire whichever weapon slot is currently active
      // (see /actions/switch-weapon) -- a slug loaded into the *other* slot
      // is holstered, not in hand. NPCs aren't held to this.
      if (attacker.kind === "character") {
        const activeSlot = attacker.data?.activeWeaponSlot ?? PRIMARY_WEAPON_SLOT;
        if (blaster.equip_slot !== activeSlot) {
          return res.status(400).json({ error: "That slug is loaded into your other weapon -- switch weapons first." });
        }
      }
      if ((slug.cooldown_turns_left || 0) > 0) {
        return res.status(400).json({ error: "That slug hasn't returned to hand yet." });
      }
      if (!Array.isArray(slug.energy_pips) || !slug.energy_pips.some(Boolean)) {
        return res.status(400).json({ error: "That slug is out of energy -- it needs to recharge." });
      }
    } else if (attacker.kind === "npc" && req.user.role === "Dungeon Master") {
      slug = {
        id: null,
        name: npcSlug?.name || "NPC Slug",
        type: npcSlug?.type || "Unique",
        clash_power: Number.isInteger(npcSlug?.clashPower) ? npcSlug.clashPower : 5,
        clash_defense: Number.isInteger(npcSlug?.clashDefense) ? npcSlug.clashDefense : 5,
        ap_cost: Number.isInteger(npcSlug?.apCost) ? npcSlug.apCost : 1,
        breaks_walls: Boolean(npcSlug?.breaksWalls),
        causes_knockback: Boolean(npcSlug?.causesKnockback),
        energy_pips: [true],
        user_id: null,
      };
      blaster = {
        accuracy: Number.isInteger(npcBlaster?.accuracy) ? npcBlaster.accuracy : 0,
        range: Number.isInteger(npcBlaster?.range) ? npcBlaster.range : 20,
        quality: Number.isInteger(npcBlaster?.quality) ? npcBlaster.quality : 0,
      };
    } else {
      return res.status(400).json({ error: "This combatant can't shoot slugs." });
    }

    if (attacker.current_ap < slug.ap_cost) return res.status(400).json({ error: "Not enough AP." });

    const attackerPos = { x: attacker.x, y: attacker.y };
    const targetPos = { x: target.x, y: target.y };
    const tb = typeBallistics(slug.type);
    // tb.range already has RANGE_SCALE baked in (combatRules.js) -- don't
    // scale it again here, and blaster.range is intentionally left at its
    // raw stored value (see itemRules.js) rather than migrated.
    const combinedRange = Math.max(blaster.range, tb.range);
    const dist = distance(attackerPos, targetPos);

    // Neither running out of range nor a wall in the way rejects the shot or
    // tells the shooter why -- it always fires, always costs the AP/energy,
    // and whichever stops it first (max range, or a wall it can't break or
    // phase through) just clamps where the animation lands.
    const wallHit = firstWallHit(attackerPos, targetPos, encounterRow.walls);
    const wallBlocks = Boolean(wallHit) && !slug.breaks_walls && tb.trait !== "phase";
    const wallDist = wallBlocks ? wallHit.hit.t * dist : Infinity;
    const stopDist = Math.min(combinedRange, wallDist);
    const reaches = dist <= stopDist;
    const impactPoint = reaches ? targetPos : pointAtDistance(attackerPos, targetPos, stopDist);

    await updateCombatant(attacker.id, { current_ap: attacker.current_ap - slug.ap_cost });
    if (slug.id != null) await spendEnergyPip(slug.id);

    // Scales with the equipped weapon's own range vs. the actual distance --
    // see shotFlightMs's comment. Always <= COUNTER_WINDOW_MS, so the
    // reaction window (which mirrors it) never runs longer than the fixed
    // maximum either.
    const windowMs = shotFlightMs(dist, blaster.range);
    // Ties together this shot's launch broadcast, its later resolve
    // broadcast, and (if a counter is offered) the pending-counter entry --
    // so the client can find its way back to the same in-flight ShotEffect
    // instance no matter how the shot ultimately resolves.
    const fxId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Real wall-clock moment the launch broadcast goes out -- lets
    // scheduleWallBreak (and anything else timing-sensitive) anchor to when
    // the client's animation actually started, not to whenever the shot
    // happens to finish resolving.
    const firedAt = Date.now();

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
      wallHit: wallHit || null,
      attackerPos,
      targetPos,
      impactPoint,
      windowMs,
    };

    // A misfire never leaves the barrel -- there's nothing to launch and
    // nothing for a defender to counter. Rolled here, up front, before any
    // launch or counter offer, so a defender is never even offered a chance
    // to counter a shot that was never really coming.
    const quality = QUALITY_TIERS[blaster.quality] || QUALITY_TIERS[0];
    if (Math.random() * 100 < quality.failRate) {
      broadcastShotFx({ ...offer, outcome: "jam" });
      await pushCombatLog(attacker.encounter_id, `${attacker.name}'s ${slug.name} misfires! The shot is wasted.`);
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    // Everything else actually launches: the bolt starts flying and the
    // launch sound plays immediately, right now, the instant the AP is
    // spent -- not delayed until the shot finishes resolving. Whatever
    // happens next (a miss, a hit, falling short, or a counter-clash)
    // arrives later as a separate combat-shot-resolved update, layered onto
    // this same already-playing animation instead of holding up its start.
    broadcastShotFx({ ...offer, outcome: null });

    if (!reaches) {
      // Deliberately worded the same as an ordinary miss -- nobody is told
      // whether this was a range problem or a wall in the way, only that
      // the shot didn't land.
      broadcastShotResolved(offer, { outcome: "out-of-range" });
      await pushCombatLog(attacker.encounter_id, `${attacker.name}'s ${slug.name} goes wide of ${target.name}.`);
      const encounter = await broadcastEncounter(attacker.encounter_id);
      return res.json({ pending: false, encounter });
    }

    const eligible = await findEligibleCounterSlugs(target);
    if (eligible.length > 0) {
      const timeoutHandle = setTimeout(() => resolveCounterOffer(fxId, null), windowMs);
      pendingCounters.set(fxId, { ...offer, userId: target.ref_user_id, eligibleSlugRows: eligible, timeoutHandle });
      if (target.ref_user_id) {
        notifyUser(target.ref_user_id, {
          type: "counter-offered",
          offer: {
            id: fxId,
            windowMs,
            attackerName: attacker.name,
            slugName: slug.name,
            slugType: slug.type,
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
      await broadcastEncounter(attacker.encounter_id);
      await pushCombatLog(attacker.encounter_id, `${attacker.name} fires ${slug.name} at ${target.name}...`);
      return res.json({ pending: true, counterId: fxId, windowMs });
    }

    const log = await resolveNormalHit(offer);
    await pushCombatLog(attacker.encounter_id, log);
    const encounter = await broadcastEncounter(attacker.encounter_id);
    res.json({ pending: false, encounter, log });
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

// ---------------------------------------------------------------------------
// NPC slug guesses -- a player's private "I think this NPC is carrying..."
// notes. Pure flavor/strategy bookkeeping; never consulted by combat
// resolution, and only ever visible to the player who made them.
// ---------------------------------------------------------------------------

router.get("/npc-guesses/:combatantId", async (req, res) => {
  const combatantId = Number(req.params.combatantId);
  try {
    const { rows } = await pool.query(
      "SELECT slug_template_id FROM npc_slug_guesses WHERE combatant_id = $1 AND user_id = $2",
      [combatantId, req.user.sub]
    );
    res.json({ slugTemplateIds: rows.map((r) => r.slug_template_id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load guesses." });
  }
});

router.post("/npc-guesses/toggle", async (req, res) => {
  const { combatantId, slugTemplateId } = req.body || {};
  if (!Number.isInteger(combatantId) || !Number.isInteger(slugTemplateId)) {
    return res.status(400).json({ error: "combatantId and slugTemplateId are required." });
  }
  try {
    const existing = await pool.query(
      "SELECT id FROM npc_slug_guesses WHERE combatant_id = $1 AND user_id = $2 AND slug_template_id = $3",
      [combatantId, req.user.sub, slugTemplateId]
    );
    if (existing.rows[0]) {
      await pool.query("DELETE FROM npc_slug_guesses WHERE id = $1", [existing.rows[0].id]);
    } else {
      await pool.query(
        "INSERT INTO npc_slug_guesses (combatant_id, user_id, slug_template_id) VALUES ($1, $2, $3)",
        [combatantId, req.user.sub, slugTemplateId]
      );
    }
    const { rows } = await pool.query(
      "SELECT slug_template_id FROM npc_slug_guesses WHERE combatant_id = $1 AND user_id = $2",
      [combatantId, req.user.sub]
    );
    res.json({ slugTemplateIds: rows.map((r) => r.slug_template_id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update guess." });
  }
});

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
