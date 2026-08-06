import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateMechaModFields } from "../mechaRules.js";
import { broadcastAll } from "../ws.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth);

function toClientMod(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    name: row.name,
    effect: row.effect,
    speedBonus: row.speed_bonus,
    handlingBonus: row.handling_bonus,
    armorBonus: row.armor_bonus,
    rammingBonus: row.ramming_bonus,
    unlocksMode: row.unlocks_mode,
    equippedMechaId: row.equipped_mecha_id,
    createdAt: row.created_at,
  };
}

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mecha_mods WHERE user_id = $1 ORDER BY created_at ASC", [req.user.sub]);
    res.json({ mods: rows.map(toClientMod) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mecha mods." });
  }
});

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM mecha_mods ORDER BY created_at ASC");
    res.json({ mods: rows.map(toClientMod) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mecha mods." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const { userId, templateId, name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode } = req.body || {};

  const validation = validateMechaModFields({ name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A target player is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO mecha_mods (template_id, user_id, name, effect, speed_bonus, handling_bonus, armor_bonus, ramming_bonus, unlocks_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        Number.isInteger(templateId) ? templateId : null,
        userId,
        name.trim(),
        effect ?? null,
        speedBonus,
        handlingBonus,
        armorBonus,
        rammingBonus,
        unlocksMode ?? null,
      ]
    );

    const mod = toClientMod(rows[0]);
    broadcastAll({ type: "mecha-mod-updated", userId, mod });
    res.status(201).json({ mod });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not assign mecha mod." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const { name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode } = req.body || {};

  const validation = validateMechaModFields({ name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE mecha_mods SET name = $1, effect = $2, speed_bonus = $3, handling_bonus = $4, armor_bonus = $5, ramming_bonus = $6, unlocks_mode = $7
       WHERE id = $8
       RETURNING *`,
      [name.trim(), effect ?? null, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode ?? null, id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Mod not found." });
    }

    const mod = toClientMod(rows[0]);
    broadcastAll({ type: "mecha-mod-updated", userId: mod.userId, mod });
    res.json({ mod });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update mecha mod." });
  }
});

router.patch("/:id/equip", async (req, res) => {
  const id = Number(req.params.id);
  const { mechaId } = req.body || {};

  if (!Number.isInteger(mechaId)) {
    return res.status(400).json({ error: "A target mecha is required." });
  }

  try {
    const modResult = await pool.query("SELECT * FROM mecha_mods WHERE id = $1", [id]);
    const mod = modResult.rows[0];
    if (!mod) {
      return res.status(404).json({ error: "Mod not found." });
    }
    if (mod.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      return res.status(403).json({ error: "You do not own this mod." });
    }

    const mechaResult = await pool.query("SELECT * FROM mechas WHERE id = $1", [mechaId]);
    const mecha = mechaResult.rows[0];
    if (!mecha) {
      return res.status(404).json({ error: "Mecha not found." });
    }
    if (mecha.user_id !== mod.user_id) {
      return res.status(400).json({ error: "The mecha must belong to the same player." });
    }

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM mecha_mods WHERE equipped_mecha_id = $1 AND id != $2",
      [mechaId, id]
    );
    if (countResult.rows[0].count >= mecha.mod_slots) {
      return res.status(400).json({ error: "That mecha has no open mod slots." });
    }

    const { rows } = await pool.query("UPDATE mecha_mods SET equipped_mecha_id = $1 WHERE id = $2 RETURNING *", [mechaId, id]);
    const updated = toClientMod(rows[0]);
    broadcastAll({ type: "mecha-mod-updated", userId: updated.userId, mod: updated });
    res.json({ mod: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not equip mecha mod." });
  }
});

router.patch("/:id/unequip", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const modResult = await pool.query("SELECT * FROM mecha_mods WHERE id = $1", [id]);
    const mod = modResult.rows[0];
    if (!mod) {
      return res.status(404).json({ error: "Mod not found." });
    }
    if (mod.user_id !== req.user.sub && req.user.role !== "Dungeon Master") {
      return res.status(403).json({ error: "You do not own this mod." });
    }

    const { rows } = await pool.query("UPDATE mecha_mods SET equipped_mecha_id = NULL WHERE id = $1 RETURNING *", [id]);
    const updated = toClientMod(rows[0]);
    broadcastAll({ type: "mecha-mod-updated", userId: updated.userId, mod: updated });
    res.json({ mod: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not unequip mecha mod." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM mecha_mods WHERE id = $1 RETURNING id, user_id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Mod not found." });
    }
    broadcastAll({ type: "mecha-mod-updated", userId: rows[0].user_id, mod: null, modId: id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete mecha mod." });
  }
});

export default router;
