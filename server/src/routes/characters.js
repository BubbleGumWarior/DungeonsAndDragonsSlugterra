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
import { getActiveEncounterRow, broadcastEncounter } from "./combat.js";

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
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, name, portrait, knockout_pips, stats, current_grit FROM characters ORDER BY created_at ASC"
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

    // A rest also refreshes everyone's once-per-rest Slug Hunt attempt.
    await pool.query("DELETE FROM slug_hunt_locks");
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

export default router;
