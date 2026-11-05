import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";
import {
  COMPARTMENT_BLUEPRINTS,
  DEFAULT_BUILD_DAYS,
  DEFAULT_COMPARTMENT_SLOTS,
  DEFAULT_COMPARTMENT_TEMPLATES,
  DEFAULT_SHIP_SPEED,
  SUPPLY_GRADES,
  blueprintFor,
  compartmentTier,
  resolveWorkRoll,
  shipEffects,
  speedBreakdown,
  storesUsed,
  tierSpeedBonus,
  workQuote,
} from "../shipRules.js";
import { skillModifier } from "../characterRules.js";
import { getActiveShip, getShipEffects, loadStores, notifyShipUpdated } from "../travelService.js";

const router = Router();
router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// notifyShipUpdated (travelService.js) is a bare "the ship data changed, refetch"
// nudge -- same single-slot pattern as slugpedia-updated (see the client
// AccessSocket). No payload, so a burst of DM edits can't lose one.

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
    const old = before.get(id);

    // The DM may set a compartment's tier by hand, within what its blueprint
    // offers. A custom compartment has no tiers.
    const maxTier = blueprintFor(templateKey)?.maxTier ?? 1;
    const tier = clampInt(c.tier ?? old?.tier, 1, maxTier, 1);
    // An upgrade is only ever started by a player (or the DM through the build
    // routes), so the client can't invent one: it can keep the stored one or
    // cancel it (send null). It lives on an online compartment, ahead of its tier.
    const keepUpgrade =
      status === "online" && old?.status === "online" && old.upgradingTo > tier && old.upgradingTo <= maxTier &&
      c.upgradingTo === old.upgradingTo;
    const upgradingTo = keepUpgrade ? old.upgradingTo : null;

    const stored = clampInt(c.speedBonus, -20, 20, 0);
    const speedBonus = tierSpeedBonus(templateKey, tier, stored);
    let buildDays = clampInt(c.buildDays, 0, 365, 0);
    if (status === "building" && buildDays < 1) buildDays = DEFAULT_BUILD_DAYS;

    const keepBuild = (status === "building" && old?.status === "building") || keepUpgrade;
    clean.push({
      id,
      label,
      description,
      status,
      xPct,
      yPct,
      templateKey,
      tier,
      upgradingTo,
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
    tier: compartmentTier(c),
    upgradingTo: c.upgradingTo ?? null,
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
    effects: shipEffects(compartments),
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
// compartment that is being built. It takes Engineering proficiency, and each
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
      const upgrading = target?.status === "online" && target.upgradingTo;
      if (!target || (target.status !== "building" && !upgrading)) {
        return res.status(400).json({ error: "That compartment isn't being built or upgraded." });
      }
      const proficiencies = chars[0].proficiencies;
      if (!Array.isArray(proficiencies) || !proficiencies.includes("engineering")) {
        return res.status(403).json({ error: "Only someone proficient in Engineering can engineer repairs and builds." });
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

// ---- Building and upgrading (the crew's side) --------------------------------

const ROMAN = ["", "I", "II", "III"];
const signedNumber = (n) => (n >= 0 ? `+${n}` : `${n}`);

function storesView(stores, effects) {
  return { ...stores, used: storesUsed(stores), capacity: effects.storesCapacity };
}

// Everything the build panel needs: the stores, what each blueprint costs at
// each tier, and the caller's own Engineering modifier for the roll.
router.get("/blueprints", async (req, res) => {
  try {
    const fx = await getShipEffects();
    const stores = await loadStores();
    let modifier = null;
    if (req.user.role !== "Dungeon Master") {
      const { rows } = await pool.query("SELECT stats, proficiencies FROM characters WHERE user_id = $1", [req.user.sub]);
      if (rows[0]) modifier = skillModifier(rows[0].stats, rows[0].proficiencies, "engineering");
    }
    res.json({
      stores: storesView(stores, fx),
      grades: SUPPLY_GRADES.map(({ tier, key, name }) => ({ tier, key, name })),
      buildBonus: fx.buildBonus,
      modifier,
      blueprints: COMPARTMENT_BLUEPRINTS.map((b) => ({
        key: b.key,
        name: b.name,
        description: b.description,
        buildable: b.buildable,
        maxTier: b.maxTier,
        tiers: b.tiers.map((t) => {
          const q = workQuote(b.key, t.tier);
          return { tier: t.tier, cost: q.cost, grade: q.grade, gradeName: q.gradeName, buildDays: q.buildDays, dc: q.dc, effect: q.effect };
        }),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the blueprints." });
  }
});

// What the ship's online compartments give the crew right now (Medpack strength
// and the like), for screens that quote a rule.
router.get("/effects", async (req, res) => {
  try {
    res.json({ effects: await getShipEffects() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not read the ship's effects." });
  }
});

// The DM sets the stores outright, e.g. after salvage or a reward.
router.patch("/stores", requireDungeonMaster, async (req, res) => {
  const sets = [];
  const values = [];
  for (const g of SUPPLY_GRADES) {
    const v = req.body?.[g.key];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return res.status(400).json({ error: `${g.name} must be between 0 and 999.` });
    }
    values.push(v);
    sets.push(`${g.column} = $${values.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update." });
  try {
    await pool.query(`UPDATE campaign_settings SET ${sets.join(", ")} WHERE id = 1`, values);
    notifyShipUpdated();
    res.json({ stores: storesView(await loadStores(), await getShipEffects()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not set the stores." });
  }
});

class WorkError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// One engineering attempt, for a new build ("build", on an empty slot the DM
// placed) or the next tier of an online compartment ("upgrade"). One player rolls
// d20 + Engineering (+ the Workshop) against the tier's DC. A hit spends the
// supplies and starts the work; a miss spends half of them and starts nothing.
// Either way the whole table is told who rolled and how it went.
async function attemptWork(req, res, mode) {
  if (req.user.role === "Dungeon Master") {
    return res.status(403).json({ error: "The crew builds and upgrades. The DM edits the compartment directly." });
  }
  const compartmentId = String(req.params.id ?? "");
  const client = await pool.connect();
  let message = null;
  let result = null;
  try {
    await client.query("BEGIN");
    const { rows: chars } = await client.query("SELECT name, stats, proficiencies FROM characters WHERE user_id = $1", [
      req.user.sub,
    ]);
    const character = chars[0];
    if (!character) throw new WorkError("You need a character to work on the ship.", 403);
    const { rows: ships } = await client.query(
      "SELECT s.* FROM ships s JOIN campaign_settings c ON c.active_ship_id = s.id WHERE c.id = 1 FOR UPDATE OF s"
    );
    const ship = ships[0];
    if (!ship) throw new WorkError("The party has no ship.", 409);
    const compartments = Array.isArray(ship.compartments) ? ship.compartments : [];
    const target = compartments.find((c) => c.id === compartmentId);
    if (!target) throw new WorkError("No such compartment.", 404);

    let templateKey;
    let toTier;
    if (mode === "build") {
      if (target.status !== "empty") throw new WorkError("Only an empty slot can be built on.");
      templateKey = String(req.body?.templateKey ?? "");
      const bp = blueprintFor(templateKey);
      if (!bp || !bp.buildable) throw new WorkError("The crew can't build that.");
      toTier = 1;
    } else {
      if (target.status !== "online") throw new WorkError("Only a working compartment can be upgraded.");
      const bp = blueprintFor(target.templateKey);
      if (!bp || bp.maxTier < 2) throw new WorkError("This compartment has no upgrades.");
      if (target.upgradingTo) throw new WorkError("It's already being upgraded.");
      toTier = compartmentTier(target) + 1;
      if (toTier > bp.maxTier) throw new WorkError("It's already at its highest tier.");
      templateKey = target.templateKey;
    }
    const bp = blueprintFor(templateKey);
    const quote = workQuote(templateKey, toTier);

    const { rows: stock } = await client.query(`SELECT ${quote.column} AS have FROM campaign_settings WHERE id = 1 FOR UPDATE`);
    const have = stock[0]?.have ?? 0;
    if (have < quote.cost) {
      throw new WorkError(`The stores hold ${have} ${quote.gradeName}. This needs ${quote.cost}.`);
    }

    const fx = shipEffects(compartments);
    const modifier = skillModifier(character.stats, character.proficiencies, "engineering");
    const die = 1 + Math.floor(Math.random() * 20);
    const roll = resolveWorkRoll({
      die,
      modifier,
      bonus: fx.buildBonus,
      dc: quote.dc,
      cost: quote.cost,
      buildDays: quote.buildDays,
    });

    await client.query(`UPDATE campaign_settings SET ${quote.column} = ${quote.column} - $1 WHERE id = 1`, [roll.spent]);
    if (roll.success) {
      const next = compartments.map((c) => {
        if (c.id !== compartmentId) return c;
        if (mode === "build") {
          return {
            ...c,
            status: "building",
            templateKey,
            label: bp.name,
            description: bp.description,
            tier: 1,
            upgradingTo: null,
            speedBonus: tierSpeedBonus(templateKey, 1, 0),
            buildDays: roll.buildDays,
            progressDays: 0,
            engineers: [],
          };
        }
        return { ...c, upgradingTo: toTier, buildDays: roll.buildDays, progressDays: 0, engineers: [] };
      });
      await client.query("UPDATE ships SET compartments = $1::jsonb WHERE id = $2", [JSON.stringify(next), ship.id]);
    }

    const subject = mode === "build" ? `${bp.name} (Tier ${ROMAN[toTier]})` : `${bp.name} to Tier ${ROMAN[toTier]}`;
    result = {
      type: "ship-build",
      action: mode,
      characterName: character.name,
      compartment: bp.name,
      tier: toTier,
      die: roll.die,
      modifier: roll.modifier,
      bonus: roll.bonus,
      total: roll.total,
      dc: roll.dc,
      crit: roll.crit,
      success: roll.success,
      gradeName: quote.gradeName,
      spent: roll.spent,
      cost: quote.cost,
      buildDays: roll.buildDays,
    };
    const body = `${character.name} rolled to ${mode === "build" ? "build" : "upgrade"} ${subject}: d20 ${roll.die} ${signedNumber(
      roll.modifier + roll.bonus
    )} = ${roll.total} vs DC ${roll.dc}. ${roll.success ? "Success" : "Failed"}.`;
    const { rows: msg } = await client.query(
      `INSERT INTO messages (user_id, username, role, body, meta)
       VALUES ($1, $2, 'System', $3, $4)
       RETURNING id, user_id, username, role, body, meta, created_at`,
      [req.user.sub, "Ship Works", body, JSON.stringify(result)]
    );
    message = msg[0];
    result.id = message.id;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof WorkError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: "The work could not be attempted." });
  } finally {
    client.release();
  }

  notifyShipUpdated();
  broadcastAll({ type: "travel-updated" });
  broadcastAll({
    type: "chat-message",
    message: {
      id: message.id,
      userId: message.user_id,
      username: message.username,
      role: message.role,
      body: message.body,
      meta: message.meta,
      createdAt: message.created_at,
    },
  });
  broadcastAll({ type: "ship-build-result", result });
  res.json({ result });
}

router.post("/compartments/:id/build", (req, res) => attemptWork(req, res, "build"));
router.post("/compartments/:id/upgrade", (req, res) => attemptWork(req, res, "upgrade"));

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
