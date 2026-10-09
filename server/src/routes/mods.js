import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateModFields } from "../itemRules.js";
import { broadcastAll } from "../ws.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

export function toClientMod(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    name: row.name,
    effect: row.effect,
    accuracyBonus: row.accuracy_bonus,
    reloadApBonus: row.reload_ap_bonus,
    speedBonus: row.speed_bonus,
    quality: row.quality,
    grantsDualShot: Boolean(row.grants_dual_shot),
    grantsRangeFinder: Boolean(row.grants_range_finder),
    equippedBlasterId: row.equipped_blaster_id,
    createdAt: row.created_at,
  };
}

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mods WHERE user_id = $1 ORDER BY created_at ASC", [req.user.sub]);
    res.json({ mods: rows.map(toClientMod) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mods." });
  }
});

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mods ORDER BY created_at ASC");
    res.json({ mods: rows.map(toClientMod) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mods." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const { userId, templateId, name, effect, accuracyBonus, reloadApBonus, speedBonus, quality, grantsDualShot, grantsRangeFinder } =
    req.body || {};

  const validation = validateModFields({ name, effect, accuracyBonus, reloadApBonus, speedBonus, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A target player is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO mods (template_id, user_id, name, effect, accuracy_bonus, reload_ap_bonus, speed_bonus, quality, grants_dual_shot, grants_range_finder)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        Number.isInteger(templateId) ? templateId : null,
        userId,
        name.trim(),
        effect ?? null,
        accuracyBonus,
        reloadApBonus,
        speedBonus,
        quality,
        Boolean(grantsDualShot),
        Boolean(grantsRangeFinder),
      ]
    );

    const mod = toClientMod(rows[0]);
    broadcastAll({ type: "mod-updated", userId, mod });
    res.status(201).json({ mod });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not assign mod." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { name, effect, accuracyBonus, reloadApBonus, speedBonus, quality, grantsDualShot, grantsRangeFinder } = req.body || {};

  const validation = validateModFields({ name, effect, accuracyBonus, reloadApBonus, speedBonus, quality });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE mods SET name = $1, effect = $2, accuracy_bonus = $3, reload_ap_bonus = $4,
        speed_bonus = $5, quality = $6, grants_dual_shot = $7, grants_range_finder = $8
       WHERE id = $9
       RETURNING *`,
      [name.trim(), effect ?? null, accuracyBonus, reloadApBonus, speedBonus, quality, Boolean(grantsDualShot), Boolean(grantsRangeFinder), id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Mod not found." });
    }

    const mod = toClientMod(rows[0]);
    broadcastAll({ type: "mod-updated", userId: mod.userId, mod });
    res.json({ mod });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update mod." });
  }
});

router.patch("/:id/equip", async (req, res) => {
  const id = Number(req.params.id);
  const { blasterId } = req.body || {};

  if (!Number.isInteger(blasterId)) {
    return res.status(400).json({ error: "A target blaster is required." });
  }

  try {
    const modResult = await pool.query("SELECT * FROM mods WHERE id = $1", [id]);
    const mod = modResult.rows[0];
    if (!mod) {
      return res.status(404).json({ error: "Mod not found." });
    }
    if (mod.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      return res.status(403).json({ error: "You do not own this mod." });
    }

    const blasterResult = await pool.query("SELECT * FROM blasters WHERE id = $1", [blasterId]);
    const blaster = blasterResult.rows[0];
    if (!blaster) {
      return res.status(404).json({ error: "Blaster not found." });
    }
    if (blaster.user_id !== mod.user_id) {
      return res.status(400).json({ error: "The blaster must belong to the same player." });
    }

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM mods WHERE equipped_blaster_id = $1 AND id != $2",
      [blasterId, id]
    );
    if (countResult.rows[0].count >= blaster.mod_slots) {
      return res.status(400).json({ error: "That blaster has no open mod slots." });
    }

    const { rows } = await pool.query("UPDATE mods SET equipped_blaster_id = $1 WHERE id = $2 RETURNING *", [blasterId, id]);
    const updated = toClientMod(rows[0]);
    broadcastAll({ type: "mod-updated", userId: updated.userId, mod: updated });
    res.json({ mod: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not equip mod." });
  }
});

router.patch("/:id/unequip", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const modResult = await pool.query("SELECT * FROM mods WHERE id = $1", [id]);
    const mod = modResult.rows[0];
    if (!mod) {
      return res.status(404).json({ error: "Mod not found." });
    }
    if (mod.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      return res.status(403).json({ error: "You do not own this mod." });
    }

    const { rows } = await pool.query("UPDATE mods SET equipped_blaster_id = NULL WHERE id = $1 RETURNING *", [id]);
    const updated = toClientMod(rows[0]);
    broadcastAll({ type: "mod-updated", userId: updated.userId, mod: updated });
    res.json({ mod: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not unequip mod." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM mods WHERE id = $1 RETURNING id, user_id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Mod not found." });
    }
    broadcastAll({ type: "mod-updated", userId: rows[0].user_id, mod: null, modId: id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete mod." });
  }
});

export default router;
