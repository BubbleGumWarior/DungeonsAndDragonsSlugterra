import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";
import {
  DEFAULT_BUILD_DAYS,
  DEFAULT_COMPARTMENT_SLOTS,
  DEFAULT_COMPARTMENT_TEMPLATES,
  DEFAULT_SHIP_SPEED,
  speedBreakdown,
} from "../shipRules.js";
import { getActiveShip } from "../travelService.js";

const router = Router();
router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// A bare "the ship data changed, refetch" nudge -- same single-slot pattern
// as slugpedia-updated (see the client AccessSocket). No payload, so a burst
// of DM edits can't lose one.
function notifyShipUpdated() {
  broadcastAll({ type: "ship-updated" });
}

// Compartment status flags -- mirrors STATUS_META in client ShipBlueprint.jsx.
const COMPARTMENT_STATUSES = ["empty", "online", "offline", "broken", "building"];

function clampInt(value, min, max, fallback) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// The deck-plan nodes the DM drops on the ship image. Percent coords so they
// track the image at any rendered size (mirrors CombatMap's mapPoint math).
//
// `prev` is what's stored now. The client PATCHes the whole array (every
// drag, every edit), so build progress and engineer assignments -- which move
// on their own at a long rest or when a player signs on -- are carried over
// from `prev` by id rather than trusted from the request. Switching a
// compartment to "building" starts it from zero; leaving "building" clears both.
function cleanCompartments(raw, prev = []) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const before = new Map(prev.map((c) => [c.id, c]));
  const clean = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") return null;
    const id = String(c.id ?? "").slice(0, 64);
    const label = String(c.label ?? "").slice(0, 120);
    const description = String(c.description ?? "").slice(0, 4000);
    const status = COMPARTMENT_STATUSES.includes(c.status) ? c.status : "empty";
    const xPct = Number(c.xPct);
    const yPct = Number(c.yPct);
    if (!id) return null;
    if (!Number.isFinite(xPct) || xPct < 0 || xPct > 100) return null;
    if (!Number.isFinite(yPct) || yPct < 0 || yPct > 100) return null;

    const templateKey = c.templateKey ? String(c.templateKey).slice(0, 64) : null;
    const speedBonus = clampInt(c.speedBonus, -20, 20, 0);
    let buildDays = clampInt(c.buildDays, 0, 365, 0);
    if (status === "building" && buildDays < 1) buildDays = DEFAULT_BUILD_DAYS;

    const old = before.get(id);
    const keepBuild = status === "building" && old?.status === "building";
    clean.push({
      id,
      label,
      description,
      status,
      xPct,
      yPct,
      templateKey,
      speedBonus,
      buildDays,
      progressDays: keepBuild ? clampInt(old.progressDays, 0, 365, 0) : 0,
      engineers: keepBuild && Array.isArray(old.engineers) ? old.engineers : [],
    });
  }
  return clean;
}

// Compartments go out with each engineer's character name resolved from the
// stored user ids.
async function toClientShip(row) {
  const compartments = Array.isArray(row.compartments) ? row.compartments : [];
  const ids = [...new Set(compartments.flatMap((c) => (Array.isArray(c.engineers) ? c.engineers : [])))];
  const names = new Map();
  if (ids.length) {
    const { rows } = await pool.query("SELECT user_id, name FROM characters WHERE user_id = ANY($1::int[])", [ids]);
    for (const r of rows) names.set(r.user_id, r.name);
  }
  const resolved = compartments.map((c) => ({
    ...c,
    engineers: (Array.isArray(c.engineers) ? c.engineers : []).map((userId) => ({
      userId,
      name: names.get(userId) ?? "Crew",
    })),
  }));
  return {
    id: row.id,
    name: row.name,
    image: row.image ?? null,
    speed: row.speed ?? DEFAULT_SHIP_SPEED,
    compartmentSlots: row.compartment_slots ?? DEFAULT_COMPARTMENT_SLOTS,
    speedStats: speedBreakdown({ speed: row.speed, compartments }),
    compartments: resolved,
  };
}

function toClientTemplate(row) {
  return {
    key: `custom-${row.id}`,
    id: row.id,
    custom: true,
    name: row.name,
    description: row.description,
    buildDays: row.build_days,
    speedBonus: row.speed_bonus,
  };
}

async function getActiveShipId() {
  const { rows } = await pool.query("SELECT active_ship_id FROM campaign_settings WHERE id = 1");
  return rows[0]?.active_ship_id ?? null;
}

// The active ship -- every approved user can see it (players need the deck
// plan). `null` until the DM creates one.
router.get("/active", async (req, res) => {
  try {
    const activeId = await getActiveShipId();
    if (!activeId) return res.json({ ship: null });
    const { rows } = await pool.query("SELECT * FROM ships WHERE id = $1", [activeId]);
    res.json({ ship: rows[0] ? await toClientShip(rows[0]) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the ship." });
  }
});

// The compartments the DM can build: the built-ins from shipRules.js plus
// any they have designed themselves.
router.get("/templates", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM compartment_templates ORDER BY created_at ASC");
    res.json({
      defaults: DEFAULT_COMPARTMENT_TEMPLATES.map((t) => ({ ...t, custom: false })),
      custom: rows.map(toClientTemplate),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the compartment templates." });
  }
});

router.post("/templates", requireDungeonMaster, async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: "A compartment needs a name." });
  const description = String(req.body?.description ?? "").slice(0, 4000);
  const buildDays = clampInt(req.body?.buildDays, 1, 365, DEFAULT_BUILD_DAYS);
  const speedBonus = clampInt(req.body?.speedBonus, -20, 20, 0);
  try {
    const { rows } = await pool.query(
      `INSERT INTO compartment_templates (name, description, build_days, speed_bonus)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description, buildDays, speedBonus]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save the template." });
  }
});

router.delete("/templates/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad template id." });
  try {
    await pool.query("DELETE FROM compartment_templates WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the template." });
  }
});

// A player signs on (or off, with a null compartmentId) as the engineer for a
// compartment that is being built. It takes Survival proficiency, and each
// player works one compartment at a time. While the ship is under way, only
// compartments with an engineer move forward at a long rest.
router.post("/engineer", async (req, res) => {
  const compartmentId = req.body?.compartmentId ?? null;
  try {
    const { rows: chars } = await pool.query("SELECT proficiencies FROM characters WHERE user_id = $1", [
      req.user.sub,
    ]);
    if (!chars[0]) return res.status(403).json({ error: "You need a character to work on the ship." });
    const ship = await getActiveShip();
    if (!ship) return res.status(409).json({ error: "The party has no ship." });

    const userId = req.user.sub;
    const compartments = Array.isArray(ship.compartments) ? ship.compartments : [];
    if (compartmentId !== null) {
      const target = compartments.find((c) => c.id === compartmentId);
      if (!target || target.status !== "building") {
        return res.status(400).json({ error: "That compartment isn't being built." });
      }
      const proficiencies = chars[0].proficiencies;
      if (!Array.isArray(proficiencies) || !proficiencies.includes("survival")) {
        return res.status(403).json({ error: "Only someone proficient in Survival can engineer repairs and builds." });
      }
    }

    const next = compartments.map((c) => {
      const others = (Array.isArray(c.engineers) ? c.engineers : []).filter((id) => id !== userId);
      return { ...c, engineers: c.id === compartmentId ? [...others, userId] : others };
    });
    await pool.query("UPDATE ships SET compartments = $1::jsonb WHERE id = $2", [JSON.stringify(next), ship.id]);
    notifyShipUpdated();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update your engineering assignment." });
  }
});

// Full list for the DM's ship switcher. Images omitted -- the list can get
// heavy and the switcher only needs names.
router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const activeId = await getActiveShipId();
    const { rows } = await pool.query(
      "SELECT id, name, compartments, (image IS NOT NULL) AS has_image, created_at FROM ships ORDER BY created_at ASC"
    );
    res.json({
      activeShipId: activeId,
      ships: rows.map((r) => ({
        id: r.id,
        name: r.name,
        hasImage: r.has_image,
        compartments: Array.isArray(r.compartments) ? r.compartments : [],
        isActive: r.id === activeId,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the ship registry." });
  }
});

// One full ship row (image included) -- the DM switcher needs this to show a
// non-active ship's deck plan.
router.get("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });
  try {
    const { rows } = await pool.query("SELECT * FROM ships WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "No such ship." });
    res.json({ ship: await toClientShip(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the ship." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 120) || "The Ship";
  try {
    const { rows } = await pool.query(
      "INSERT INTO ships (name) VALUES ($1) RETURNING *",
      [name]
    );
    const ship = rows[0];
    // First ship ever -> make it active so there's always something to show.
    const activeId = await getActiveShipId();
    if (!activeId) {
      await pool.query("UPDATE campaign_settings SET active_ship_id = $1 WHERE id = 1", [ship.id]);
    }
    notifyShipUpdated();
    res.status(201).json({ ship: await toClientShip(ship) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the ship." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });

  const sets = [];
  const values = [];

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "A ship needs a name." });
    values.push(name);
    sets.push(`name = $${values.length}`);
  }

  if (req.body?.image !== undefined) {
    const image = req.body.image;
    if (image !== null && (typeof image !== "string" || !image.startsWith("data:image/"))) {
      return res.status(400).json({ error: "Image must be a data URL or null." });
    }
    values.push(image);
    sets.push(`image = $${values.length}`);
  }

  if (req.body?.speed !== undefined) {
    const speed = Number(req.body.speed);
    if (!Number.isInteger(speed) || speed < 1 || speed > 99) {
      return res.status(400).json({ error: "Speed must be a whole number from 1 to 99." });
    }
    values.push(speed);
    sets.push(`speed = $${values.length}`);
  }

  let slots;
  if (req.body?.compartmentSlots !== undefined) {
    slots = Number(req.body.compartmentSlots);
    if (!Number.isInteger(slots) || slots < 0 || slots > 60) {
      return res.status(400).json({ error: "Compartment slots must be a whole number from 0 to 60." });
    }
    values.push(slots);
    sets.push(`compartment_slots = $${values.length}`);
  }

  try {
    const { rows: existing } = await pool.query("SELECT * FROM ships WHERE id = $1", [id]);
    if (!existing[0]) return res.status(404).json({ error: "No such ship." });

    if (req.body?.compartments !== undefined) {
      const prev = Array.isArray(existing[0].compartments) ? existing[0].compartments : [];
      const clean = cleanCompartments(req.body.compartments, prev);
      if (clean === null) return res.status(400).json({ error: "Malformed compartments." });
      // Only adding a pin is capped -- a ship that already holds more than its
      // slots (older ones, or after the DM lowers the number) can still be edited.
      const cap = slots ?? existing[0].compartment_slots ?? DEFAULT_COMPARTMENT_SLOTS;
      if (clean.length > prev.length && clean.length > cap) {
        return res.status(400).json({ error: `This ship only has ${cap} compartment slots.` });
      }
      values.push(JSON.stringify(clean));
      sets.push(`compartments = $${values.length}::jsonb`);
    }

    if (sets.length === 0) return res.status(400).json({ error: "Nothing to update." });

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE ships SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    notifyShipUpdated();
    if (req.body?.speed !== undefined || req.body?.compartments !== undefined) {
      broadcastAll({ type: "travel-updated" });
    }
    res.json({ ship: await toClientShip(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the ship." });
  }
});

router.post("/:id/activate", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });
  try {
    const { rows } = await pool.query("SELECT id FROM ships WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "No such ship." });
    await pool.query("UPDATE campaign_settings SET active_ship_id = $1 WHERE id = 1", [id]);
    notifyShipUpdated();
    res.json({ activeShipId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not switch ships." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });
  try {
    const activeId = await getActiveShipId();
    await pool.query("DELETE FROM ships WHERE id = $1", [id]);
    // The FK is ON DELETE SET NULL, so deleting the active ship leaves the
    // party ship-less -- fall back to the most recent remaining one.
    if (activeId === id) {
      const { rows } = await pool.query("SELECT id FROM ships ORDER BY created_at DESC LIMIT 1");
      await pool.query("UPDATE campaign_settings SET active_ship_id = $1 WHERE id = 1", [rows[0]?.id ?? null]);
    }
    notifyShipUpdated();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the ship." });
  }
});

export default router;
