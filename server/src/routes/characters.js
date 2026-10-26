import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  validateCharacterPayload,
  validateKnockoutPips,
  validateCurrentGrit,
  computeMaxGrit,
} from "../characterRules.js";
import { broadcastAll } from "../ws.js";
import { toClientSlug } from "./slugs.js";
import { getActiveEncounterRow, grantFame } from "./combat.js";
import { syncTempoAura } from "../slugAura.js";
import { FOOD_DRAIN_PER_REST, rollMoodKey } from "../careRules.js";
import { MARKET_MOODS, moodPctFor } from "../marketRules.js";
import { LOYALTY_TIER_MIN } from "../slugRules.js";
import { advanceDay } from "../travelService.js";

const router = Router();

router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

export function toClientCharacter(row) {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    portrait: row.portrait,
    stats: row.stats,
    proficiencies: row.proficiencies,
    knockoutPips: row.knockout_pips,
    currentGrit: row.current_grit,
    gritBonus: row.grit_bonus ?? 0,
    fame: row.fame,
    heat: row.heat,
    credits: row.credits,
    pods: row.pods,
    kibble: row.kibble,
    repairKits: row.repair_kits,
    energyCells: row.energy_cells,
    medpacks: row.medpacks,
    revivalTonics: row.revival_tonics,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, name, portrait, knockout_pips, stats, current_grit, grit_bonus, fame, heat FROM characters ORDER BY created_at ASC"
    );
    res.json({
      characters: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        portrait: row.portrait,
        knockoutPips: row.knockout_pips,
        currentGrit: row.current_grit,
        maxGrit: computeMaxGrit(row.stats, row.grit_bonus),
        gritBonus: row.grit_bonus ?? 0,
        fame: row.fame,
        heat: row.heat,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load characters." });
  }
});

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [req.user.sub]);
    res.json({ character: rows[0] ? toClientCharacter(rows[0]) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load character." });
  }
});

router.post("/", async (req, res) => {
  const { name, age, portrait, stats, proficiencies } = req.body || {};

  const validation = validateCharacterPayload({ name, age, portrait, stats, proficiencies });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO characters (user_id, name, age, portrait, stats, proficiencies, current_grit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [
        req.user.sub,
        name.trim(),
        age ?? null,
        portrait ?? null,
        JSON.stringify(stats),
        JSON.stringify(proficiencies),
        computeMaxGrit(stats),
      ]
    );

    if (!rows[0]) {
      return res.status(409).json({ error: "Character already exists." });
    }

    // Tell every open client a new character joined the table so their
    // Roster re-syncs from the server -- the per-character "character-updated"
    // signal only patches rows already in the list, it can't add a new one.
    broadcastAll({ type: "character-created", userId: req.user.sub, at: Date.now() });

    res.status(201).json({ character: toClientCharacter(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create character." });
  }
});

router.get("/:userId", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  try {
    const { rows } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [userId]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }
    res.json({ character: toClientCharacter(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load character." });
  }
});

router.patch("/:userId", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { name, age, portrait, stats, proficiencies } = req.body || {};

  const validation = validateCharacterPayload({ name, age, portrait, stats, proficiencies }, { unrestricted: true });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    // $6 is the stat-only maximum; worn armor's bonus is added in SQL.
    const newMax = computeMaxGrit(stats);
    const { rows } = await pool.query(
      `UPDATE characters SET name = $1, age = $2, portrait = $3, stats = $4, proficiencies = $5,
        current_grit = LEAST(current_grit, $6 + grit_bonus)
       WHERE user_id = $7
       RETURNING *`,
      [name.trim(), age ?? null, portrait ?? null, JSON.stringify(stats), JSON.stringify(proficiencies), newMax, userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }

    const character = toClientCharacter(rows[0]);
    broadcastAll({ type: "character-updated", userId, character });
    res.json({ character });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update character." });
  }
});

router.patch("/:userId/knockout", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { knockoutPips } = req.body || {};

  const validation = validateKnockoutPips(knockoutPips);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE characters SET knockout_pips = $1 WHERE user_id = $2 RETURNING *`,
      [JSON.stringify(knockoutPips), userId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }

    const character = toClientCharacter(rows[0]);
    broadcastAll({ type: "character-updated", userId, character });
    res.json({ character });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update knockout pips." });
  }
});

// Who is out of the rest: any character who is a combatant in the live
// encounter. Combat spends their Grit, pips and slug energy rows mid-fight, so
// a long rest never touches them (or their slugs).
async function charactersInCombat() {
  const inCombat = new Set();
  const activeEncounter = await getActiveEncounterRow();
  if (activeEncounter) {
    const { rows: fighters } = await pool.query(
      "SELECT ref_user_id FROM combatants WHERE encounter_id = $1 AND kind = 'character' AND ref_user_id IS NOT NULL",
      [activeEncounter.id]
    );
    for (const f of fighters) inCombat.add(f.ref_user_id);
  }
  return inCombat;
}

// What a long rest would cost right now: every resting slug whose food is
// already at 0 loses a loyalty tier, or leaves if it has no tier left. Lets the
// DM see the damage before putting the party to sleep.
router.get("/long-rest/preview", requireDungeonMaster, async (req, res) => {
  try {
    const inCombat = await charactersInCombat();
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.loyalty_tier, s.user_id, c.name AS owner_name
       FROM slugs s LEFT JOIN characters c ON c.user_id = s.user_id
       WHERE s.user_id IS NOT NULL AND s.food <= 0
       ORDER BY s.created_at ASC`
    );
    res.json({
      skippedInCombat: inCombat.size,
      starving: rows
        .filter((r) => !inCombat.has(r.user_id))
        .map((r) => ({
          slugId: r.id,
          slugName: r.name,
          ownerName: r.owner_name,
          outcome: r.loyalty_tier <= LOYALTY_TIER_MIN ? "leave" : "loyalty",
        })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not preview the rest." });
  }
});

// The party goes to sleep. Every character not in a fight is fully healed --
// Grit back to max, knockout pips cleared -- and every slug they own is
// recharged. Sleeping also costs food: each slug's meter drains, and a slug
// that was already at 0 loses a loyalty tier (or leaves the party at the
// lowest). Slug Hunt, haggling and the merchants' mood all reset for the new
// day. Lives here (not combat.js) because it's a table-wide reset the DM can
// reach for any time.
router.post(["/long-rest", "/heal-all"], requireDungeonMaster, async (req, res) => {
  try {
    const inCombat = await charactersInCombat();

    const { rows: allCharacters } = await pool.query("SELECT * FROM characters");
    const characters = allCharacters.filter((c) => !inCombat.has(c.user_id));
    const ownerNames = new Map(allCharacters.map((c) => [c.user_id, c.name]));
    for (const c of characters) {
      const newMax = computeMaxGrit(c.stats, c.grit_bonus);
      const { rows } = await pool.query(
        `UPDATE characters SET current_grit = $1, knockout_pips = $2 WHERE user_id = $3 RETURNING *`,
        [newMax, JSON.stringify([false, false, false]), c.user_id]
      );
      if (rows[0]) broadcastAll({ type: "character-updated", userId: c.user_id, character: toClientCharacter(rows[0]) });
    }

    // Feed check first, so a slug that leaves doesn't also get recharged.
    const { rows: allSlugs } = await pool.query(
      "SELECT id, name, max_energy_pips, user_id, food, loyalty_tier FROM slugs WHERE user_id IS NOT NULL ORDER BY created_at ASC"
    );
    const restingSlugs = allSlugs.filter((s) => !inCombat.has(s.user_id));
    const slugEvents = [];
    const staying = [];
    for (const s of restingSlugs) {
      const base = { userId: s.user_id, ownerName: ownerNames.get(s.user_id) ?? null, slugId: s.id, slugName: s.name };
      if (s.food <= 0) {
        if (s.loyalty_tier <= LOYALTY_TIER_MIN) {
          await pool.query("DELETE FROM slugs WHERE id = $1", [s.id]);
          broadcastAll({ type: "slug-updated", userId: s.user_id, slug: null, slugId: s.id });
          slugEvents.push({ ...base, kind: "left" });
          continue;
        }
        await pool.query("UPDATE slugs SET loyalty_tier = loyalty_tier - 1, loyalty_progress = 0 WHERE id = $1", [s.id]);
        slugEvents.push({ ...base, kind: "loyalty", fromTier: s.loyalty_tier, toTier: s.loyalty_tier - 1 });
      } else {
        const next = Math.max(0, s.food - FOOD_DRAIN_PER_REST);
        await pool.query("UPDATE slugs SET food = $1 WHERE id = $2", [next, s.id]);
        if (next === 0) slugEvents.push({ ...base, kind: "starving", tier: s.loyalty_tier });
      }
      staying.push(s);
    }

    for (const s of staying) {
      const { rows: updatedSlug } = await pool.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [
        JSON.stringify(Array(s.max_energy_pips).fill(true)),
        s.id,
      ]);
      if (updatedSlug[0]) broadcastAll({ type: "slug-updated", userId: s.user_id, slug: toClientSlug(updatedSlug[0]) });
    }

    // The reset above refills every slug to its plain max_energy_pips; a
    // player with a Tempo Aura up (see slugAura.js) rests back up to the
    // boosted size, extra pips full. A slug that left may have been the carrier.
    const ownerIds = [...new Set(restingSlugs.map((s) => s.user_id))];
    for (const userId of ownerIds) await syncTempoAura({ userId }, { fill: true });

    // A rest also refreshes everyone's once-per-rest Slug Hunt attempt.
    await pool.query("DELETE FROM slug_hunt_locks");
    // ...and is one day on the calendar: the voyage counts down a day (landing
    // the party if that was the last one) and compartment builds move along.
    // Done before the markets settle so the mood below is rolled for the world
    // the party wakes up on.
    const day = await advanceDay();
    // ...and settles the markets: everyone may haggle again, any planet-wide
    // markup from a poor barter roll wears off, and the merchants wake up in a
    // new mood (weighted toward neutral -- see MOOD_WEIGHTS).
    await pool.query("DELETE FROM market_barters");
    await pool.query("UPDATE planet_markets SET barter_pct = 0");
    const { rows: area } = await pool.query("SELECT slug_hunt_area FROM campaign_settings WHERE id = 1");
    const marketMood = rollMoodKey(MARKET_MOODS);
    await pool.query(
      `INSERT INTO planet_markets (planet_index, mood) VALUES ($1, $2)
       ON CONFLICT (planet_index) DO UPDATE SET mood = $2`,
      [area[0]?.slug_hunt_area ?? 0, marketMood]
    );
    broadcastAll({ type: "market-changed", at: Date.now() });
    broadcastAll({ type: "slug-hunt-lock", all: true, locked: false });

    // A single authoritative "it happened" signal, sent once after every
    // row is committed. The per-character/per-slug broadcasts above arrive
    // as a rapid burst and some get coalesced away client-side (see the
    // single-slot signal note in AccessSocket); views listen for this and
    // re-sync from the server so nothing is left showing stale Grit/pips.
    broadcastAll({ type: "party-healed", at: Date.now() });

    const summary = {
      at: Date.now(),
      rested: characters.length,
      skippedInCombat: inCombat.size,
      slugEvents,
      marketMood: { key: marketMood, pct: moodPctFor(marketMood) },
      day,
    };
    // The sleep overlay: its own slot, sent once and last.
    broadcastAll({ type: "long-rest", ...summary });

    res.json({ ...summary, healed: characters.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not put the party to sleep." });
  }
});

router.patch("/:userId/grit", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { currentGrit } = req.body || {};

  try {
    const existing = await pool.query("SELECT stats FROM characters WHERE user_id = $1", [userId]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }

    const validation = validateCurrentGrit(currentGrit, existing.rows[0].stats);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { rows } = await pool.query(
      "UPDATE characters SET current_grit = $1 WHERE user_id = $2 RETURNING *",
      [currentGrit, userId]
    );

    const character = toClientCharacter(rows[0]);
    broadcastAll({ type: "character-updated", userId, character });
    res.json({ character });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update current Grit." });
  }
});

// DM manual Fame override, on top of the automatic combat hook (see
// grantFame in combat.js). Takes the absolute next value (same convention as
// /grit above) and routes the positive/negative delta through grantFame so
// an increase mirrors into Heat exactly the same way an automatic combat
// award would -- there's only ever one place Heat's mirroring happens.
router.patch("/:userId/fame", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { fame } = req.body || {};

  if (!Number.isInteger(fame) || fame < 0) {
    return res.status(400).json({ error: "Fame must be a non-negative integer." });
  }

  try {
    const existing = await pool.query("SELECT * FROM characters WHERE user_id = $1", [userId]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }

    const delta = fame - existing.rows[0].fame;
    if (delta === 0) {
      return res.json({ character: toClientCharacter(existing.rows[0]) });
    }

    const updated = await grantFame(userId, delta);
    if (!updated) {
      return res.status(404).json({ error: "Character not found." });
    }
    res.json({ character: toClientCharacter(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update Fame." });
  }
});

// DM manual Heat override -- a free +/- on top of Heat's automatic
// mirroring of Fame gains (see grantFame in combat.js). Never touches Fame
// in either direction; this is purely the DM's own dial.
router.patch("/:userId/heat", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { heat } = req.body || {};

  if (!Number.isInteger(heat) || heat < 0) {
    return res.status(400).json({ error: "Heat must be a non-negative integer." });
  }

  try {
    const { rows } = await pool.query("UPDATE characters SET heat = $1 WHERE user_id = $2 RETURNING *", [heat, userId]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Character not found." });
    }
    const character = toClientCharacter(rows[0]);
    broadcastAll({ type: "character-updated", userId, character });
    res.json({ character });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update Heat." });
  }
});

export default router;
