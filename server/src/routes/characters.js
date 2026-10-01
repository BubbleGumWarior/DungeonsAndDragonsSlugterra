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
import { getActiveEncounterRow, broadcastEncounter, grantFame } from "./combat.js";
import { syncTempoAura } from "../slugAura.js";

const router = Router();

router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

function toClientCharacter(row) {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    portrait: row.portrait,
    stats: row.stats,
    proficiencies: row.proficiencies,
    knockoutPips: row.knockout_pips,
    currentGrit: row.current_grit,
    fame: row.fame,
    heat: row.heat,
    credits: row.credits,
    pods: row.pods,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, name, portrait, knockout_pips, stats, current_grit, fame, heat FROM characters ORDER BY created_at ASC"
    );
    res.json({
      characters: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        portrait: row.portrait,
        knockoutPips: row.knockout_pips,
        currentGrit: row.current_grit,
        maxGrit: computeMaxGrit(row.stats),
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
    const newMax = computeMaxGrit(stats);
    const { rows } = await pool.query(
      `UPDATE characters SET name = $1, age = $2, portrait = $3, stats = $4, proficiencies = $5,
        current_grit = LEAST(current_grit, $6)
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

// Fully heals every player character at the table -- Grit back to max, all
// three knockout pips cleared, and every slug any of them own recharged to
// full energy. Lives here (not combat.js) because it's a table-wide reset
// the DM can reach for any time, not just mid-encounter -- but if a fight
// happens to be going on, the matching character-kind combatants (and the
// live encounter view) are kept in sync too, so nothing looks stale there.
router.post("/heal-all", requireDungeonMaster, async (req, res) => {
  try {
    const { rows: characters } = await pool.query("SELECT * FROM characters");
    for (const c of characters) {
      const newMax = computeMaxGrit(c.stats);
      const { rows } = await pool.query(
        `UPDATE characters SET current_grit = $1, knockout_pips = $2 WHERE user_id = $3 RETURNING *`,
        [newMax, JSON.stringify([false, false, false]), c.user_id]
      );
      if (rows[0]) broadcastAll({ type: "character-updated", userId: c.user_id, character: toClientCharacter(rows[0]) });
    }

    const { rows: slugs } = await pool.query("SELECT id, max_energy_pips, user_id FROM slugs WHERE user_id IS NOT NULL");
    for (const s of slugs) {
      const { rows: updatedSlug } = await pool.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [
        JSON.stringify(Array(s.max_energy_pips).fill(true)),
        s.id,
      ]);
      if (updatedSlug[0]) broadcastAll({ type: "slug-updated", userId: s.user_id, slug: toClientSlug(updatedSlug[0]) });
    }

    // The reset above refills every slug to its plain max_energy_pips; a
    // player with a Tempo Aura up (see slugAura.js) rests back up to the
    // boosted size, extra pips full.
    const ownerIds = [...new Set(slugs.map((s) => s.user_id))];
    for (const userId of ownerIds) await syncTempoAura({ userId }, { fill: true });

    // A rest also refreshes everyone's once-per-rest Slug Hunt attempt.
    await pool.query("DELETE FROM slug_hunt_locks");
    // ...and settles the markets: everyone may haggle again, and any planet-wide
    // markup from a poor barter roll wears off.
    await pool.query("DELETE FROM market_barters");
    await pool.query("UPDATE planet_markets SET barter_pct = 0");
    broadcastAll({ type: "market-changed", at: Date.now() });
    broadcastAll({ type: "slug-hunt-lock", all: true, locked: false });

    const activeEncounter = await getActiveEncounterRow();
    if (activeEncounter) {
      await pool.query(
        `UPDATE combatants c SET current_grit = c.max_grit, knockout_pips = '[false,false,false]', unconscious = false, disabled = false
         FROM characters ch
         WHERE c.encounter_id = $1 AND c.kind = 'character' AND c.ref_user_id = ch.user_id`,
        [activeEncounter.id]
      );
      await broadcastEncounter(activeEncounter.id);
    }

    // A single authoritative "it happened" signal, sent once after every
    // row is committed. The per-character/per-slug broadcasts above arrive
    // as a rapid burst and some get coalesced away client-side (see the
    // single-slot signal note in AccessSocket); views listen for this and
    // re-sync from the server so nothing is left showing stale Grit/pips.
    broadcastAll({ type: "party-healed", at: Date.now() });

    res.json({ healed: characters.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not heal the party." });
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
