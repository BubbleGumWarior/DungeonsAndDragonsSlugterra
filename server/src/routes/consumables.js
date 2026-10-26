import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";
import { computeMaxGrit } from "../characterRules.js";
import { ENERGY_CELL_PIPS, MEDPACK_HEAL_FRACTION, TONIC_PIPS } from "../careRules.js";
import { toClientSlug } from "./slugs.js";
import { toClientCharacter } from "./characters.js";
import { getActiveEncounterRow } from "./combat.js";

// Field supplies a player uses between fights: Energy Cells recharge a slug,
// Medpacks heal Grit, Revival Tonics clear knockout pips. The server rolls
// nothing here -- each use is a fixed, announced effect. Combat spends the very
// rows these change, so none of it works while the player is in the live fight.

const router = Router();
router.use(requireAuth);

class SupplyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function assertNotInCombat(userId) {
  const encounter = await getActiveEncounterRow();
  if (!encounter) return;
  const { rows } = await pool.query(
    "SELECT 1 FROM combatants WHERE encounter_id = $1 AND kind = 'character' AND ref_user_id = $2",
    [encounter.id, userId]
  );
  if (rows[0]) throw new SupplyError("You can't use supplies mid-fight -- wait until the encounter ends.");
}

function playersOnly(req, res, next) {
  if (req.user.role === "Dungeon Master") {
    return res.status(403).json({ error: "Only players use consumables." });
  }
  next();
}

function fail(res, err, fallback) {
  if (err instanceof SupplyError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallback });
}

// Spend one Medpack: heal a fraction of max Grit.
router.post("/medpack", playersOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await assertNotInCombat(req.user.sub);
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM characters WHERE user_id = $1 FOR UPDATE", [req.user.sub]);
    const c = rows[0];
    if (!c) throw new SupplyError("You don't have a character sheet yet.", 404);
    const max = computeMaxGrit(c.stats, c.grit_bonus);
    if (c.current_grit >= max) throw new SupplyError("You're already at full Grit.");
    if (c.medpacks < 1) throw new SupplyError("You're out of Medpacks -- buy more at the Market.");
    const heal = Math.ceil(max * MEDPACK_HEAL_FRACTION);
    const next = Math.min(max, c.current_grit + heal);
    const { rows: updated } = await client.query(
      "UPDATE characters SET current_grit = $1, medpacks = medpacks - 1 WHERE user_id = $2 RETURNING *",
      [next, req.user.sub]
    );
    await client.query("COMMIT");
    const character = toClientCharacter(updated[0]);
    broadcastAll({ type: "character-updated", userId: req.user.sub, character });
    res.json({ character, healed: next - c.current_grit, maxGrit: max });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    fail(res, err, "Could not use that Medpack.");
  } finally {
    client.release();
  }
});

// Spend one Revival Tonic: clear a knocked-out pip (the most recent one first).
router.post("/tonic", playersOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await assertNotInCombat(req.user.sub);
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM characters WHERE user_id = $1 FOR UPDATE", [req.user.sub]);
    const c = rows[0];
    if (!c) throw new SupplyError("You don't have a character sheet yet.", 404);
    const pips = Array.isArray(c.knockout_pips) ? [...c.knockout_pips] : [false, false, false];
    if (!pips.some(Boolean)) throw new SupplyError("You have no knockout pips to clear.");
    if (c.revival_tonics < 1) throw new SupplyError("You're out of Revival Tonics -- buy more at the Market.");
    let cleared = 0;
    for (let i = pips.length - 1; i >= 0 && cleared < TONIC_PIPS; i -= 1) {
      if (pips[i]) {
        pips[i] = false;
        cleared += 1;
      }
    }
    const { rows: updated } = await client.query(
      "UPDATE characters SET knockout_pips = $1, revival_tonics = revival_tonics - 1 WHERE user_id = $2 RETURNING *",
      [JSON.stringify(pips), req.user.sub]
    );
    await client.query("COMMIT");
    const character = toClientCharacter(updated[0]);
    broadcastAll({ type: "character-updated", userId: req.user.sub, character });
    res.json({ character, cleared });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    fail(res, err, "Could not use that Revival Tonic.");
  } finally {
    client.release();
  }
});

// Spend one Energy Cell on a slug: refill its first spent energy pips.
router.post("/slugs/:id/recharge", playersOnly, async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await assertNotInCombat(req.user.sub);
    await client.query("BEGIN");
    const { rows: chars } = await client.query("SELECT energy_cells FROM characters WHERE user_id = $1 FOR UPDATE", [req.user.sub]);
    const { rows: found } = await client.query("SELECT * FROM slugs WHERE id = $1 FOR UPDATE", [id]);
    const slug = found[0];
    if (!slug || slug.user_id !== req.user.sub) throw new SupplyError("Slug not found.", 404);
    const pips = Array.isArray(slug.energy_pips) ? [...slug.energy_pips] : [];
    if (!pips.some((p) => !p)) throw new SupplyError(`${slug.name} is already fully charged.`);
    if ((chars[0]?.energy_cells ?? 0) < 1) throw new SupplyError("You're out of Energy Cells -- buy more at the Market.");
    let restored = 0;
    for (let i = 0; i < pips.length && restored < ENERGY_CELL_PIPS; i += 1) {
      if (!pips[i]) {
        pips[i] = true;
        restored += 1;
      }
    }
    const { rows: updated } = await client.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [
      JSON.stringify(pips),
      id,
    ]);
    const { rows: left } = await client.query(
      "UPDATE characters SET energy_cells = energy_cells - 1 WHERE user_id = $1 RETURNING energy_cells",
      [req.user.sub]
    );
    await client.query("COMMIT");
    const out = toClientSlug(updated[0]);
    broadcastAll({ type: "slug-updated", userId: out.userId, slug: out });
    res.json({ slug: out, restored, energyCells: left[0].energy_cells });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    fail(res, err, "Could not recharge that slug.");
  } finally {
    client.release();
  }
});

export default router;
