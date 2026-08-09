import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// NPC prep is a DM-only tool -- players never see this roster directly,
// only whatever the DM pulls into an encounter and reveals.
router.use(requireAuth, requireDungeonMaster);

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
    createdAt: row.created_at,
  };
}

function validate({ name, image, maxGrit, maxAp, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId }) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return "Name must be a non-empty string of 40 characters or fewer.";
  }
  if (image !== undefined && image !== null) {
    if (typeof image !== "string" || !image.startsWith("data:image/")) return "Image must be a base64 image data URL.";
    if (image.length > MAX_IMAGE_BYTES) return "Image is too large.";
  }
  for (const [value, label] of [
    [maxGrit, "Max Grit"],
    [maxAp, "Max AP"],
    [dexModifier, "DEX Modifier"],
    [conModifier, "CON Modifier"],
  ]) {
    if (!Number.isInteger(value)) return `${label} must be a whole number.`;
  }
  if (maxGrit < 1 || maxGrit > 500) return "Max Grit must be between 1 and 500.";
  if (maxAp < 1 || maxAp > 10) return "Max AP must be between 1 and 10.";
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

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM npc_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load NPC templates." });
  }
});

router.post("/", async (req, res) => {
  const { name, image, maxGrit, maxAp, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId, revealed } = req.body || {};
  const error = validate({ name, image, maxGrit, maxAp, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId });
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
        maxGrit,
        maxAp,
        dexModifier,
        conModifier,
        JSON.stringify(slugTemplateIds),
        JSON.stringify(blasterTemplateIds),
        mechaTemplateId ?? null,
        Boolean(revealed),
      ]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create NPC." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, image, maxGrit, maxAp, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId, revealed } = req.body || {};
  const error = validate({ name, image, maxGrit, maxAp, dexModifier, conModifier, slugTemplateIds, blasterTemplateIds, mechaTemplateId });
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await pool.query(
      `UPDATE npc_templates SET
        name = $1, image = $2, max_grit = $3, max_ap = $4, dex_modifier = $5, con_modifier = $6,
        slug_template_ids = $7, blaster_template_ids = $8, mecha_template_id = $9, revealed = $10
       WHERE id = $11
       RETURNING *`,
      [
        name.trim(),
        image ?? null,
        maxGrit,
        maxAp,
        dexModifier,
        conModifier,
        JSON.stringify(slugTemplateIds),
        JSON.stringify(blasterTemplateIds),
        mechaTemplateId ?? null,
        Boolean(revealed),
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "NPC not found." });
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update NPC." });
  }
});

router.patch("/:id/reveal", async (req, res) => {
  const id = Number(req.params.id);
  const { revealed } = req.body || {};
  try {
    const { rows } = await pool.query(
      "UPDATE npc_templates SET revealed = $1 WHERE id = $2 RETURNING *",
      [Boolean(revealed), id]
    );
    if (!rows[0]) return res.status(404).json({ error: "NPC not found." });
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update reveal state." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM npc_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "NPC not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete NPC." });
  }
});

export default router;
