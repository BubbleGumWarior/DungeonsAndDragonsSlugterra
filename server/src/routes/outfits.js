import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";
import { skillModifier } from "../characterRules.js";
import { syncArmorGrit } from "../ammoBelt.js";
import { toClientCharacter } from "./characters.js";
import { announceOutfitsChanged, getClimate, getWornOutfit, grantOutfit, toClientOutfit } from "../outfitService.js";

const router = Router();
router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// A fight snapshots Grit, AP and the climate penalty when it starts, so what
// someone wears stays put until it is over.
async function assertNotInCombat(db, userId) {
  const { rows } = await db.query(
    `SELECT 1 FROM combatants c JOIN encounters e ON e.id = c.encounter_id
     WHERE e.status = 'active' AND c.kind = 'character' AND c.ref_user_id = $1 LIMIT 1`,
    [userId]
  );
  if (rows[0]) {
    const err = new Error("You can't change clothes in the middle of a fight.");
    err.status = 400;
    throw err;
  }
}

// Outfit Grit rides on characters.grit_bonus, so after any change of what is
// worn push the character to every sheet.
async function announceWornChange(userId, gritChanged) {
  announceOutfitsChanged(userId);
  if (!gritChanged) return;
  const { rows } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [userId]);
  if (rows[0]) broadcastAll({ type: "character-updated", userId, character: toClientCharacter(rows[0]) });
}

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM outfits WHERE user_id = $1 ORDER BY created_at ASC, id ASC", [req.user.sub]);
    const { rows: chars } = await pool.query("SELECT stats, proficiencies FROM characters WHERE user_id = $1", [req.user.sub]);
    const climate = await getClimate();
    res.json({
      outfits: rows.map(toClientOutfit),
      climate,
      fortitudeMod: chars[0] ? skillModifier(chars[0].stats, chars[0].proficiencies, "fortitude") : 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load your wardrobe." });
  }
});

router.patch("/:id/equip", async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM outfits WHERE id = $1 FOR UPDATE", [id]);
    const outfit = rows[0];
    if (!outfit || (outfit.user_id !== req.user.sub && req.user.role !== "Dungeon Master")) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Outfit not found." });
    }
    await assertNotInCombat(client, outfit.user_id);
    await client.query("UPDATE outfits SET equipped = false WHERE user_id = $1 AND equipped AND id <> $2", [outfit.user_id, id]);
    await client.query("UPDATE outfits SET equipped = true WHERE id = $1", [id]);
    const gritChanged = await syncArmorGrit(client, outfit.user_id);
    await client.query("COMMIT");
    await announceWornChange(outfit.user_id, gritChanged);
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not change outfit." });
  } finally {
    client.release();
  }
});

// ---- DM: look at, grant and take away --------------------------------------

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM outfits ORDER BY user_id ASC, created_at ASC, id ASC");
    res.json({ outfits: rows.map(toClientOutfit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load outfits." });
  }
});

// The catalog, for the DM's grant picker.
router.get("/templates", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM outfit_templates ORDER BY starter DESC, name ASC");
    res.json({
      templates: rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        comfortMin: t.comfort_min,
        comfortMax: t.comfort_max,
        gritBonus: t.grit_bonus,
        movePct: t.move_pct,
        apBonus: t.ap_bonus,
        accuracyBonus: t.accuracy_bonus,
        basePrice: t.base_price,
        starter: t.starter,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the catalog." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const { userId, templateId } = req.body || {};
  if (!Number.isInteger(userId) || !Number.isInteger(templateId)) {
    return res.status(400).json({ error: "A player and an outfit are required." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: chars } = await client.query("SELECT 1 FROM characters WHERE user_id = $1", [userId]);
    if (!chars[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "That player has no character." });
    }
    const outfit = await grantOutfit(client, userId, templateId);
    if (!outfit) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "They already own that outfit, or it doesn't exist." });
    }
    const gritChanged = await syncArmorGrit(client, userId);
    await client.query("COMMIT");
    await announceWornChange(userId, gritChanged);
    res.status(201).json({ outfit: toClientOutfit(outfit) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not grant the outfit." });
  } finally {
    client.release();
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("DELETE FROM outfits WHERE id = $1 RETURNING user_id, equipped", [id]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Outfit not found." });
    }
    const userId = rows[0].user_id;
    // Taking away the worn outfit puts them in the oldest one left.
    if (rows[0].equipped && !(await getWornOutfit(client, userId))) {
      await client.query(
        "UPDATE outfits SET equipped = true WHERE id = (SELECT id FROM outfits WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1)",
        [userId]
      );
    }
    const gritChanged = await syncArmorGrit(client, userId);
    await client.query("COMMIT");
    await announceWornChange(userId, gritChanged);
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not remove the outfit." });
  } finally {
    client.release();
  }
});

export default router;
