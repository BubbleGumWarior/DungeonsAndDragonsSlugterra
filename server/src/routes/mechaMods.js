import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateMechaModFields } from "../mechaRules.js";
import { broadcastAll } from "../ws.js";
import { toClientMecha } from "./mechas.js";

const router = Router();

// A mecha's glide / aquatic / burrow flags mirror whatever mode-granting mods
// are equipped on it right now. Recompute and persist them whenever that set
// changes (equip, unequip, a mod's mode edited, a mod deleted), and push the
// refreshed mecha out so every open sheet updates live.
async function syncMechaModeFlags(mechaId) {
  if (!Number.isInteger(mechaId)) return;
  const { rows } = await pool.query(
    "SELECT unlocks_mode FROM mecha_mods WHERE equipped_mecha_id = $1",
    [mechaId]
  );
  const active = new Set(rows.map((r) => r.unlocks_mode).filter(Boolean));
  const { rows: updated } = await pool.query(
    "UPDATE mechas SET can_glide = $1, can_aquatic = $2, can_burrow = $3 WHERE id = $4 RETURNING *",
    [active.has("glider"), active.has("aquatic"), active.has("burrow"), mechaId]
  );
  if (updated[0]) {
    broadcastAll({ type: "mecha-updated", userId: updated[0].user_id, mecha: toClientMecha(updated[0]) });
  }
}

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
    speedMultiplier: row.speed_multiplier,
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
  const { userId, templateId, name, effect, speedBonus, speedMultiplier, handlingBonus, armorBonus, rammingBonus, unlocksMode } = req.body || {};

  const validation = validateMechaModFields({ name, effect, speedBonus, speedMultiplier, handlingBonus, armorBonus, rammingBonus, unlocksMode });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A target player is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO mecha_mods (template_id, user_id, name, effect, speed_bonus, speed_multiplier, handling_bonus, armor_bonus, ramming_bonus, unlocks_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        Number.isInteger(templateId) ? templateId : null,
        userId,
        name.trim(),
        effect ?? null,
        speedBonus,
        speedMultiplier ?? 1,
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
  const { name, effect, speedBonus, speedMultiplier, handlingBonus, armorBonus, rammingBonus, unlocksMode } = req.body || {};

  const validation = validateMechaModFields({ name, effect, speedBonus, speedMultiplier, handlingBonus, armorBonus, rammingBonus, unlocksMode });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE mecha_mods SET name = $1, effect = $2, speed_bonus = $3, speed_multiplier = $4, handling_bonus = $5, armor_bonus = $6, ramming_bonus = $7, unlocks_mode = $8
       WHERE id = $9
       RETURNING *`,
      [name.trim(), effect ?? null, speedBonus, speedMultiplier ?? 1, handlingBonus, armorBonus, rammingBonus, unlocksMode ?? null, id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Mod not found." });
    }

    const mod = toClientMod(rows[0]);
    broadcastAll({ type: "mecha-mod-updated", userId: mod.userId, mod });
    if (rows[0].equipped_mecha_id) await syncMechaModeFlags(rows[0].equipped_mecha_id);
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
    await syncMechaModeFlags(mechaId);
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

    const prevMechaId = mod.equipped_mecha_id;
    const { rows } = await pool.query("UPDATE mecha_mods SET equipped_mecha_id = NULL WHERE id = $1 RETURNING *", [id]);
    const updated = toClientMod(rows[0]);
    broadcastAll({ type: "mecha-mod-updated", userId: updated.userId, mod: updated });
    await syncMechaModeFlags(prevMechaId);
    res.json({ mod: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not unequip mecha mod." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM mecha_mods WHERE id = $1 RETURNING id, user_id, equipped_mecha_id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Mod not found." });
    }
    broadcastAll({ type: "mecha-mod-updated", userId: rows[0].user_id, mod: null, modId: id });
    if (rows[0].equipped_mecha_id) await syncMechaModeFlags(rows[0].equipped_mecha_id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete mecha mod." });
  }
});

export default router;
