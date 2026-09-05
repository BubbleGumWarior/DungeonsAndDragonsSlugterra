import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";
import { npcActionPoints, npcMaxGrit } from "../characterRules.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// NPC prep is a DM-only tool, but the NPCs tab itself isn't DM-only anymore
// -- players can see whichever NPCs the DM has revealed (name + portrait
// only) and pitch in on the collective "what's it carrying?" guesses. Every
// route below decides for itself whether it needs requireDungeonMaster.
router.use(requireAuth);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function toClientTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    maxGrit: row.max_grit,
    maxAp: row.max_ap,
    dexModifier: row.dex_modifier,
    conModifier: row.con_modifier,
    slugTemplateIds: row.slug_template_ids,
    blasterTemplateIds: row.blaster_template_ids,
    mechaTemplateId: row.mecha_template_id,
    revealed: row.revealed,
    guessedSlugTemplateIds: row.guessed_slug_template_ids || [],
    createdAt: row.created_at,
  };
}

// What a player is allowed to know about an NPC: it exists, its name and
// portrait (once revealed), and the collective guesses. Never its stats or
// its real loadout.
function toPlayerTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    revealed: true,
    guessedSlugTemplateIds: row.guessed_slug_template_ids || [],
  };
}

function validate({ name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId }) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return "Name must be a non-empty string of 40 characters or fewer.";
  }
  if (image !== undefined && image !== null) {
    if (typeof image !== "string" || !image.startsWith("data:image/")) return "Image must be a base64 image data URL.";
    if (image.length > MAX_IMAGE_BYTES) return "Image is too large.";
  }
  for (const [value, label] of [
    [dexModifier, "DEX Modifier"],
    [conModifier, "CON Modifier"],
  ]) {
    if (!Number.isInteger(value)) return `${label} must be a whole number.`;
    if (value < -5 || value > 10) return `${label} must be between -5 and 10.`;
  }
  if (!Array.isArray(slugTemplateIds) || !slugTemplateIds.every(Number.isInteger)) {
    return "Slug Template Ids must be an array of integers.";
  }
  if (!Array.isArray(blasterTemplateIds) || !blasterTemplateIds.every(Number.isInteger)) {
    return "Blaster Template Ids must be an array of integers.";
  }
  if (mechaTemplateId !== null && mechaTemplateId !== undefined && !Number.isInteger(mechaTemplateId)) {
    return "Mecha Template Id must be an integer or null.";
  }
  return null;
}

const SELECT_WITH_GUESSES = `
  SELECT nt.*,
    COALESCE(
      json_agg(g.slug_template_id) FILTER (WHERE g.slug_template_id IS NOT NULL),
      '[]'
    ) AS guessed_slug_template_ids
  FROM npc_templates nt
  LEFT JOIN npc_slug_guesses g ON g.npc_template_id = nt.id
`;

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_WITH_GUESSES} GROUP BY nt.id ORDER BY nt.created_at ASC`);
    if (req.user.role === "Dungeon Master") {
      return res.json({ templates: rows.map(toClientTemplate) });
    }
    // Players never see a hidden NPC at all -- not even that it exists.
    res.json({ templates: rows.filter((r) => r.revealed).map(toPlayerTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load NPC templates." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const { name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId, revealed } = req.body || {};
  const error = validate({ name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId });
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await pool.query(
      `INSERT INTO npc_templates
        (name, image, max_grit, max_ap, dex_modifier, con_modifier, slug_template_ids, blaster_template_ids, mecha_template_id, revealed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        name.trim(),
        image ?? null,
        npcMaxGrit(conModifier, dexModifier),
        npcActionPoints(dexModifier),
        dexModifier,
        conModifier,
        JSON.stringify(slugTemplateIds),
        JSON.stringify(blasterTemplateIds),
        mechaTemplateId ?? null,
        Boolean(revealed),
      ]
    );
    broadcastAll({ type: "npc-templates-updated" });
    res.status(201).json({ template: toClientTemplate({ ...rows[0], guessed_slug_template_ids: [] }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create NPC." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId } = req.body || {};
  const error = validate({ name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId });
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await pool.query(
      `UPDATE npc_templates SET
        name = $1, image = $2, max_grit = $3, max_ap = $4, dex_modifier = $5, con_modifier = $6,
        slug_template_ids = $7, blaster_template_ids = $8, mecha_template_id = $9
       WHERE id = $10
       RETURNING *`,
      [
        name.trim(),
        image ?? null,
        npcMaxGrit(conModifier, dexModifier),
        npcActionPoints(dexModifier),
        dexModifier,
        conModifier,
        JSON.stringify(slugTemplateIds),
        JSON.stringify(blasterTemplateIds),
        mechaTemplateId ?? null,
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "NPC not found." });
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update NPC." });
  }
});

// The one action that actually matters to players: flipping this shows
// everyone the NPC's name and portrait. Nothing about its stats or loadout
// is ever sent to a player, revealed or not.
router.patch("/:id/reveal", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { revealed } = req.body || {};
  try {
    const { rows } = await pool.query(
      "UPDATE npc_templates SET revealed = $1 WHERE id = $2 RETURNING *",
      [Boolean(revealed), id]
    );
    if (!rows[0]) return res.status(404).json({ error: "NPC not found." });
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update reveal state." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM npc_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "NPC not found." });
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete NPC." });
  }
});

// Collective slug guesses -- anyone (any player, or the DM) can add or
// remove any entry. It's one shared checklist per NPC, not a private guess
// per person, and it only makes sense once the NPC has actually been
// revealed to players.
router.post("/:id/guesses/toggle", async (req, res) => {
  const npcTemplateId = Number(req.params.id);
  const { slugTemplateId } = req.body || {};
  if (!Number.isInteger(slugTemplateId)) {
    return res.status(400).json({ error: "slugTemplateId is required." });
  }
  try {
    const template = await pool.query("SELECT id, revealed FROM npc_templates WHERE id = $1", [npcTemplateId]);
    if (!template.rows[0]) return res.status(404).json({ error: "NPC not found." });
    if (req.user.role !== "Dungeon Master") {
      if (!template.rows[0].revealed) return res.status(404).json({ error: "NPC not found." });
      // Players can only guess slugs the party has actually encountered
      // before (assigned to a player, or carried by an NPC in combat) --
      // see routes/slugpedia.js.
      const known = await pool.query(
        "SELECT 1 FROM slugpedia_entries WHERE template_id = $1 LIMIT 1",
        [slugTemplateId]
      );
      if (!known.rows[0]) return res.status(400).json({ error: "The party hasn't seen that slug yet." });
    }

    const existing = await pool.query(
      "SELECT id FROM npc_slug_guesses WHERE npc_template_id = $1 AND slug_template_id = $2",
      [npcTemplateId, slugTemplateId]
    );
    if (existing.rows[0]) {
      await pool.query("DELETE FROM npc_slug_guesses WHERE id = $1", [existing.rows[0].id]);
    } else {
      await pool.query(
        "INSERT INTO npc_slug_guesses (npc_template_id, slug_template_id, added_by_user_id) VALUES ($1, $2, $3)",
        [npcTemplateId, slugTemplateId, req.user.sub]
      );
    }
    const { rows } = await pool.query(
      "SELECT slug_template_id FROM npc_slug_guesses WHERE npc_template_id = $1",
      [npcTemplateId]
    );
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ guessedSlugTemplateIds: rows.map((r) => r.slug_template_id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update guess." });
  }
});

export default router;
