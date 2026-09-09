import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// Grunts are purely a DM prep tool -- never revealed, never shown to players,
// no biographical profile. Every route is DM-only.
router.use(requireAuth, requireDungeonMaster);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const RELATIONSHIPS = ["Ally", "Friend", "Neutral", "Rival", "Enemy", "Unknown"];

function toClientTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    relationship: row.relationship || "Enemy",
    dexModifier: row.dex_modifier,
    conModifier: row.con_modifier,
    slugTemplateIds: row.slug_template_ids || [],
    blasterTemplateIds: row.blaster_template_ids || [],
    createdAt: row.created_at,
  };
}

function validateCore({ name, image, relationship, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds }) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return "Name must be a non-empty string of 40 characters or fewer.";
  }
  if (relationship !== undefined && relationship !== null && !RELATIONSHIPS.includes(relationship)) {
    return "Relationship must be one of: " + RELATIONSHIPS.join(", ");
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
    return "Slug pool must be an array of integers.";
  }
  if (!Array.isArray(blasterTemplateIds) || !blasterTemplateIds.every(Number.isInteger)) {
    return "Blaster pool must be an array of integers.";
  }
  return null;
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM grunt_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load grunts." });
  }
});

router.post("/", async (req, res) => {
  const { name, image, relationship, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds } = req.body || {};
  const error = validateCore({ name, image, relationship, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds });
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await pool.query(
      `INSERT INTO grunt_templates (name, image, relationship, dex_modifier, con_modifier, slug_template_ids, blaster_template_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        image ?? null,
        relationship || "Enemy",
        dexModifier,
        conModifier,
        JSON.stringify(slugTemplateIds),
        JSON.stringify(blasterTemplateIds),
      ]
    );
    broadcastAll({ type: "grunt-templates-updated" });
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the grunt." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, image, relationship, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds } = req.body || {};
  const error = validateCore({ name, image, relationship, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds });
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await pool.query(
      `UPDATE grunt_templates SET
        name = $1, image = $2, relationship = $3, dex_modifier = $4, con_modifier = $5,
        slug_template_ids = $6, blaster_template_ids = $7
       WHERE id = $8
       RETURNING *`,
      [
        name.trim(),
        image ?? null,
        relationship || "Enemy",
        dexModifier,
        conModifier,
        JSON.stringify(slugTemplateIds),
        JSON.stringify(blasterTemplateIds),
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Grunt not found." });
    broadcastAll({ type: "grunt-templates-updated" });
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the grunt." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM grunt_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Grunt not found." });
    broadcastAll({ type: "grunt-templates-updated" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the grunt." });
  }
});

export default router;
