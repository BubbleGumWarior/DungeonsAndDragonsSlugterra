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

// NPC prep is a DM-only tool, but the Chronicle tab itself isn't DM-only --
// players can see whichever cards the DM has revealed (name + portrait, plus
// each biographical line the DM has individually lit up) and pitch in on the
// collective "what's it carrying?" slug guesses. Every route below decides for
// itself whether it needs requireDungeonMaster.
router.use(requireAuth);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// The biographical lines a card can carry. Every one is a plain string the DM
// types; `relationship` and `status` are constrained to the sets below because
// the card frame (accent colour, badge, status ribbon) keys off them.
const PROFILE_FIELD_KEYS = [
  "species",
  "age",
  "relationship",
  "status",
  "faction",
  "role",
  "firstMetLocation",
  "firstMetSession",
];
const RELATIONSHIPS = ["Ally", "Friend", "Neutral", "Rival", "Enemy", "Unknown"];
const STATUSES = ["Alive", "Deceased", "Missing", "Unknown"];
const MAX_FIELD_LEN = 120;
const MAX_PARAGRAPH_LEN = 400;
const MAX_PARAGRAPHS = 12;
const MAX_DM_NOTES = 4000;

function emptyProfile() {
  return { fields: {}, bio: [], connections: [], combatShown: false };
}

// Coerce whatever the client sent into the canonical stored shape, dropping
// anything unrecognised. Returns { profile } or { error }.
function normalizeProfile(input) {
  if (input === undefined || input === null) return { profile: emptyProfile() };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { error: "Profile must be an object." };
  }

  const out = emptyProfile();

  const fields = input.fields;
  if (fields !== undefined) {
    if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
      return { error: "Profile fields must be an object." };
    }
    for (const [key, raw] of Object.entries(fields)) {
      if (!PROFILE_FIELD_KEYS.includes(key)) continue;
      if (typeof raw !== "object" || raw === null) return { error: `Profile field "${key}" is malformed.` };
      const value = typeof raw.value === "string" ? raw.value.trim() : "";
      if (value.length > MAX_FIELD_LEN) return { error: `Profile field "${key}" is too long.` };
      if (key === "relationship" && value && !RELATIONSHIPS.includes(value)) {
        return { error: "Relationship must be one of: " + RELATIONSHIPS.join(", ") };
      }
      if (key === "status" && value && !STATUSES.includes(value)) {
        return { error: "Status must be one of: " + STATUSES.join(", ") };
      }
      out.fields[key] = { value, shown: Boolean(raw.shown) };
    }
  }

  for (const listKey of ["bio", "connections"]) {
    const list = input[listKey];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return { error: `Profile ${listKey} must be an array.` };
    if (list.length > MAX_PARAGRAPHS) return { error: `Too many ${listKey} entries.` };
    out[listKey] = list
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        const text = typeof entry.text === "string" ? entry.text.trim() : "";
        return { text, shown: Boolean(entry.shown) };
      })
      .filter((entry) => entry && (entry.text || entry.shown));
    for (const entry of out[listKey]) {
      if (entry.text.length > MAX_PARAGRAPH_LEN) return { error: `A ${listKey} entry is too long.` };
    }
  }

  out.combatShown = Boolean(input.combatShown);
  return { profile: out };
}

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
    combatReady: row.combat_ready,
    profile: { ...emptyProfile(), ...(row.profile || {}) },
    dmNotes: row.dm_notes || "",
    guessedSlugTemplateIds: row.guessed_slug_template_ids || [],
    createdAt: row.created_at,
  };
}

// What a player is allowed to know about a card: it exists, its name and
// portrait (once revealed), every biographical line the DM has individually
// lit, and the collective guesses. The stat block only when the DM has flipped
// `combatShown`. Never the DM notes, never the real slug loadout.
function toPlayerTemplate(row) {
  const profile = { ...emptyProfile(), ...(row.profile || {}) };
  const fields = {};
  for (const [key, entry] of Object.entries(profile.fields || {})) {
    if (entry && entry.shown && typeof entry.value === "string" && entry.value.trim()) {
      fields[key] = entry.value;
    }
  }
  const pickShown = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((entry) => entry && entry.shown && typeof entry.text === "string" && entry.text.trim())
      .map((entry) => entry.text);

  const out = {
    id: row.id,
    name: row.name,
    image: row.image,
    revealed: true,
    fields,
    bio: pickShown(profile.bio),
    connections: pickShown(profile.connections),
    guessedSlugTemplateIds: row.guessed_slug_template_ids || [],
  };
  if (profile.combatShown) {
    out.combat = {
      maxGrit: row.max_grit,
      maxAp: row.max_ap,
      dexModifier: row.dex_modifier,
      conModifier: row.con_modifier,
    };
  }
  return out;
}

function validateCore({ name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId }) {
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
    // Players never see a hidden card at all -- not even that it exists.
    res.json({ templates: rows.filter((r) => r.revealed).map(toPlayerTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load Chronicle cards." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const {
    name,
    image,
    dexModifier,
    conModifier,
    slugTemplateIds,
    blasterTemplateIds,
    mechaTemplateId,
    revealed,
    combatReady,
    profile,
    dmNotes,
  } = req.body || {};
  const error = validateCore({ name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId });
  if (error) return res.status(400).json({ error });
  const normalized = normalizeProfile(profile);
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  if (dmNotes !== undefined && dmNotes !== null && (typeof dmNotes !== "string" || dmNotes.length > MAX_DM_NOTES)) {
    return res.status(400).json({ error: "DM notes are too long." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO npc_templates
        (name, image, max_grit, max_ap, dex_modifier, con_modifier, slug_template_ids, blaster_template_ids,
         mecha_template_id, revealed, combat_ready, profile, dm_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        combatReady === undefined ? true : Boolean(combatReady),
        JSON.stringify(normalized.profile),
        dmNotes ?? null,
      ]
    );
    broadcastAll({ type: "npc-templates-updated" });
    res.status(201).json({ template: toClientTemplate({ ...rows[0], guessed_slug_template_ids: [] }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the card." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const {
    name,
    image,
    dexModifier,
    conModifier,
    slugTemplateIds,
    blasterTemplateIds,
    mechaTemplateId,
    combatReady,
    profile,
    dmNotes,
  } = req.body || {};
  const error = validateCore({ name, image, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId });
  if (error) return res.status(400).json({ error });
  const normalized = normalizeProfile(profile);
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  if (dmNotes !== undefined && dmNotes !== null && (typeof dmNotes !== "string" || dmNotes.length > MAX_DM_NOTES)) {
    return res.status(400).json({ error: "DM notes are too long." });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE npc_templates SET
        name = $1, image = $2, max_grit = $3, max_ap = $4, dex_modifier = $5, con_modifier = $6,
        slug_template_ids = $7, blaster_template_ids = $8, mecha_template_id = $9,
        combat_ready = $10, profile = $11, dm_notes = $12
       WHERE id = $13
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
        combatReady === undefined ? true : Boolean(combatReady),
        JSON.stringify(normalized.profile),
        dmNotes ?? null,
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Card not found." });
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the card." });
  }
});

// Reveal or hide a single biographical line straight from the card, without
// opening the full editor. Body: { profile: <partial> }. Only the keys present
// in the patch are touched -- a field entry that sends `shown` but not `value`
// keeps its stored value; `bio` / `connections` replace wholesale when the
// patch includes the (full) array.
router.patch("/:id/profile", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const patch = req.body?.profile;
  if (patch === undefined || patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return res.status(400).json({ error: "Profile patch must be an object." });
  }

  try {
    const existing = await pool.query("SELECT profile FROM npc_templates WHERE id = $1", [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Card not found." });
    const current = { ...emptyProfile(), ...(existing.rows[0].profile || {}) };
    current.fields = { ...(current.fields || {}) };

    if (patch.fields && typeof patch.fields === "object" && !Array.isArray(patch.fields)) {
      for (const [key, raw] of Object.entries(patch.fields)) {
        if (!PROFILE_FIELD_KEYS.includes(key) || !raw || typeof raw !== "object") continue;
        const next = { value: "", shown: false, ...(current.fields[key] || {}) };
        if (typeof raw.value === "string") {
          const value = raw.value.trim();
          if (value.length > MAX_FIELD_LEN) return res.status(400).json({ error: `"${key}" is too long.` });
          if (key === "relationship" && value && !RELATIONSHIPS.includes(value)) {
            return res.status(400).json({ error: "Relationship must be one of: " + RELATIONSHIPS.join(", ") });
          }
          if (key === "status" && value && !STATUSES.includes(value)) {
            return res.status(400).json({ error: "Status must be one of: " + STATUSES.join(", ") });
          }
          next.value = value;
        }
        if ("shown" in raw) next.shown = Boolean(raw.shown);
        current.fields[key] = next;
      }
    }

    for (const listKey of ["bio", "connections"]) {
      if (Array.isArray(patch[listKey])) {
        const normalized = normalizeProfile({ [listKey]: patch[listKey] });
        if (normalized.error) return res.status(400).json({ error: normalized.error });
        current[listKey] = normalized.profile[listKey];
      }
    }
    if ("combatShown" in patch) current.combatShown = Boolean(patch.combatShown);

    const { rows } = await pool.query(
      "UPDATE npc_templates SET profile = $1 WHERE id = $2 RETURNING *",
      [JSON.stringify(current), id]
    );
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ template: toClientTemplate({ ...rows[0], guessed_slug_template_ids: [] }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the card." });
  }
});

// Flipping this shows everyone the card's name and portrait. Nothing about its
// biographical lines, stats or loadout is sent to a player unless the DM has
// also lit that specific line.
router.patch("/:id/reveal", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { revealed } = req.body || {};
  try {
    const { rows } = await pool.query(
      "UPDATE npc_templates SET revealed = $1 WHERE id = $2 RETURNING *",
      [Boolean(revealed), id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Card not found." });
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ template: toClientTemplate({ ...rows[0], guessed_slug_template_ids: [] }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update reveal state." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM npc_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Card not found." });
    broadcastAll({ type: "npc-templates-updated" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the card." });
  }
});

// Collective slug guesses -- anyone (any player, or the DM) can add or remove
// any entry. One shared checklist per card, and it only makes sense once the
// card has actually been revealed to players.
router.post("/:id/guesses/toggle", async (req, res) => {
  const npcTemplateId = Number(req.params.id);
  const { slugTemplateId } = req.body || {};
  if (!Number.isInteger(slugTemplateId)) {
    return res.status(400).json({ error: "slugTemplateId is required." });
  }
  try {
    const template = await pool.query("SELECT id, revealed FROM npc_templates WHERE id = $1", [npcTemplateId]);
    if (!template.rows[0]) return res.status(404).json({ error: "Card not found." });
    if (req.user.role !== "Dungeon Master") {
      if (!template.rows[0].revealed) return res.status(404).json({ error: "Card not found." });
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
