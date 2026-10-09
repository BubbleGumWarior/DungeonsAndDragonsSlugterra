import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";
import { skillModifier } from "../characterRules.js";
import { toClientBlaster } from "./blasters.js";
import { toClientMod } from "./mods.js";
import { toClientMecha } from "./mechas.js";
import { toClientMod as toClientMechaMod } from "./mechaMods.js";
import { toClientSlug } from "./slugs.js";
import { syncTempoAura } from "../slugAura.js";
import {
  POD_PRICE,
  PLANET_PCT_MIN,
  PLANET_PCT_MAX,
  BARTER_MAX_PCT,
  LISTING_KINDS,
  KIND_TABLES,
  barterPctForTotal,
  finalPrice,
  isStandingBlasterMod,
  isStandingMechaMod,
  defaultBlasterModPrice,
  defaultMechaModPrice,
  templateBasePrice,
} from "../marketRules.js";

const router = Router();
router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

const isDM = (req) => req.user.role === "Dungeon Master";

class MarketError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function signalMarketChanged() {
  broadcastAll({ type: "market-changed", at: Date.now() });
}

async function currentPlanet(db = pool) {
  const { rows } = await db.query("SELECT slug_hunt_area FROM campaign_settings WHERE id = 1");
  return rows[0]?.slug_hunt_area ?? 0;
}

async function planetRow(planet, db = pool) {
  const { rows } = await db.query("SELECT price_pct, barter_pct FROM planet_markets WHERE planet_index = $1", [planet]);
  return { pricePct: rows[0]?.price_pct ?? 100, barterPct: rows[0]?.barter_pct ?? 0 };
}

async function personalDiscount(userId, planet, db = pool) {
  const { rows } = await db.query("SELECT discount_pct, roll FROM market_barters WHERE user_id = $1 AND planet_index = $2", [
    userId,
    planet,
  ]);
  return rows[0] ? { discountPct: rows[0].discount_pct, roll: rows[0].roll } : null;
}

// ---- item presentation ------------------------------------------------------

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function blasterModTags(t) {
  const tags = [];
  if (t.accuracy_bonus) tags.push(`${signed(t.accuracy_bonus)} Accuracy`);
  if (t.reload_ap_bonus) tags.push(`${signed(t.reload_ap_bonus)} Reload AP`);
  if (t.speed_bonus) tags.push(`${signed(t.speed_bonus)} Speed`);
  if (t.grants_dual_shot) tags.push("Dual Shot");
  if (t.grants_range_finder) tags.push("Range Finder");
  return tags;
}

function mechaModTags(t) {
  const tags = [];
  if (t.speed_bonus) tags.push(`${signed(t.speed_bonus)} Speed`);
  if (t.handling_bonus) tags.push(`${signed(t.handling_bonus)} Handling`);
  if (t.armor_bonus) tags.push(`${signed(t.armor_bonus)} Armor`);
  if (t.ramming_bonus) tags.push(`${signed(t.ramming_bonus)} Ramming`);
  if (t.speed_multiplier && t.speed_multiplier !== 1) tags.push(`×${t.speed_multiplier} Speed`);
  if (t.unlocks_mode) tags.push(`Unlocks ${t.unlocks_mode}`);
  return tags;
}

// kind -> { name, image, description, tags } for a template row.
function describeTemplate(kind, t) {
  switch (kind) {
    case "blaster":
      return {
        name: t.name,
        image: t.image,
        description: t.base_type,
        tags: [`${signed(t.accuracy)} Accuracy`, `Range ${t.range}`, `Mag ${t.magazine_size}`, `${t.mod_slots} mod slots`],
      };
    case "mod":
      return { name: t.name, image: t.image, description: t.effect, tags: blasterModTags(t) };
    case "mecha":
      return {
        name: t.name,
        image: t.image,
        description: t.frame_type,
        tags: [`Speed ${t.speed}`, `Handling ${t.handling}`, `Armor ${t.armor}`, `Ram ${t.ramming_power}`, `${t.mod_slots} mod slots`],
      };
    case "mecha_mod":
      return { name: t.name, image: null, description: t.effect, tags: mechaModTags(t) };
    case "slug":
      return {
        name: t.name,
        image: t.protoform_image,
        description: t.type,
        tags: [`Power ${t.clash_power}`, `Defense ${t.clash_defense}`, `AP ${t.ap_cost}`, `${t.max_energy_pips} pips`],
      };
    default:
      return { name: "Unknown", image: null, description: "", tags: [] };
  }
}

const PODS_ITEM = {
  key: "pods",
  kind: "pods",
  name: "Slug Pod",
  image: null,
  description:
    "The cradle a slug rides in inside a blaster's magazine. A misfire shatters the pod, and a reload needs a spare to take its place.",
  tags: ["Reload supply"],
  basePrice: POD_PRICE,
  quantity: null,
  standing: true,
};

async function standingItems(planet) {
  const { rows: hiddenRows } = await pool.query("SELECT item_key FROM market_hidden WHERE planet_index = $1", [planet]);
  const hidden = new Set(hiddenRows.map((r) => r.item_key));
  const items = [{ ...PODS_ITEM }];
  const { rows: mods } = await pool.query("SELECT * FROM mod_templates ORDER BY name");
  for (const t of mods) {
    if (!isStandingBlasterMod(t)) continue;
    items.push({
      key: `mod:${t.id}`,
      kind: "mod",
      templateId: t.id,
      ...describeTemplate("mod", t),
      basePrice: t.base_price ?? defaultBlasterModPrice(t),
      quantity: null,
      standing: true,
    });
  }
  const { rows: mechaMods } = await pool.query("SELECT * FROM mecha_mod_templates ORDER BY name");
  for (const t of mechaMods) {
    if (!isStandingMechaMod(t)) continue;
    items.push({
      key: `mecha_mod:${t.id}`,
      kind: "mecha_mod",
      templateId: t.id,
      ...describeTemplate("mecha_mod", t),
      basePrice: t.base_price ?? defaultMechaModPrice(t),
      quantity: null,
      standing: true,
    });
  }
  return items.map((it) => ({ ...it, hidden: hidden.has(it.key) }));
}

async function listingItems(planet) {
  const { rows } = await pool.query("SELECT * FROM market_listings WHERE planet_index = $1 ORDER BY id", [planet]);
  const items = [];
  for (const l of rows) {
    const def = KIND_TABLES[l.kind];
    if (!def) continue;
    const { rows: tpl } = await pool.query(`SELECT * FROM ${def.table} WHERE id = $1`, [l.template_id]);
    if (!tpl[0]) continue; // template since deleted
    items.push({
      key: `listing:${l.id}`,
      kind: l.kind,
      templateId: l.template_id,
      listingId: l.id,
      ...describeTemplate(l.kind, tpl[0]),
      basePrice: l.base_price,
      quantity: l.quantity,
      standing: false,
      hidden: false,
    });
  }
  return items;
}

// ---- GET /api/market ----------------------------------------------------------

router.get("/", async (req, res) => {
  try {
    const planet = await currentPlanet();
    const pm = await planetRow(planet);
    const dm = isDM(req);
    const barter = dm ? null : await personalDiscount(req.user.sub, planet);
    const discountPct = barter?.discountPct ?? 0;

    const all = [...(await standingItems(planet)), ...(await listingItems(planet))];
    const items = all
      .filter((it) => dm || !it.hidden)
      .map((it) => ({
        ...it,
        price: finalPrice(it.basePrice, pm.pricePct, { personalDiscountPct: discountPct, planetBarterPct: pm.barterPct }),
      }));

    const out = {
      planetIndex: planet,
      pricePct: pm.pricePct,
      barterPct: pm.barterPct,
      barter: barter ? { discountPct: barter.discountPct, roll: barter.roll } : null,
      items,
    };

    if (dm) {
      const { rows: planets } = await pool.query("SELECT planet_index, price_pct, barter_pct FROM planet_markets");
      out.planets = planets.map((r) => ({ planetIndex: r.planet_index, pricePct: r.price_pct, barterPct: r.barter_pct }));
      const { rows: purses } = await pool.query(
        "SELECT user_id, name, credits, pods FROM characters ORDER BY created_at ASC"
      );
      out.purses = purses.map((r) => ({ userId: r.user_id, name: r.name, credits: r.credits, pods: r.pods }));
    } else {
      const { rows } = await pool.query("SELECT credits, pods FROM characters WHERE user_id = $1", [req.user.sub]);
      out.me = rows[0] ? { credits: rows[0].credits, pods: rows[0].pods } : null;
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the market." });
  }
});

// ---- buying -------------------------------------------------------------------

export async function cloneTemplateToUser(client, kind, templateId, userId) {
  switch (kind) {
    case "blaster": {
      const { rows } = await client.query(
        `INSERT INTO blasters (template_id, user_id, name, base_type, image, accuracy, reload_ap_cost, range, speed, mod_slots, magazine_size, quality)
         SELECT id, $2, name, base_type, image, accuracy, reload_ap_cost, range, speed, mod_slots, magazine_size, quality
         FROM blaster_templates WHERE id = $1 RETURNING *`,
        [templateId, userId]
      );
      return rows[0] && { type: "blaster-updated", payload: { blaster: toClientBlaster(rows[0]) }, userId };
    }
    case "mod": {
      const { rows } = await client.query(
        `INSERT INTO mods (template_id, user_id, name, image, effect, accuracy_bonus, reload_ap_bonus, speed_bonus, quality, grants_dual_shot, grants_range_finder)
         SELECT id, $2, name, image, effect, accuracy_bonus, reload_ap_bonus, speed_bonus, quality, grants_dual_shot, grants_range_finder
         FROM mod_templates WHERE id = $1 RETURNING *`,
        [templateId, userId]
      );
      return rows[0] && { type: "mod-updated", payload: { mod: toClientMod(rows[0]) }, userId };
    }
    case "mecha": {
      const { rows } = await client.query(
        `INSERT INTO mechas (template_id, user_id, name, frame_type, image, speed, handling, armor, ramming_power, passenger_capacity, mod_slots, tier)
         SELECT id, $2, name, frame_type, image, speed, handling, armor, ramming_power, passenger_capacity, mod_slots, tier
         FROM mecha_templates WHERE id = $1 RETURNING *`,
        [templateId, userId]
      );
      return rows[0] && { type: "mecha-updated", payload: { mecha: toClientMecha(rows[0]) }, userId };
    }
    case "mecha_mod": {
      const { rows } = await client.query(
        `INSERT INTO mecha_mods (template_id, user_id, name, effect, speed_bonus, speed_multiplier, handling_bonus, armor_bonus, ramming_bonus, unlocks_mode)
         SELECT id, $2, name, effect, speed_bonus, speed_multiplier, handling_bonus, armor_bonus, ramming_bonus, unlocks_mode
         FROM mecha_mod_templates WHERE id = $1 RETURNING *`,
        [templateId, userId]
      );
      return rows[0] && { type: "mecha-mod-updated", payload: { mod: toClientMechaMod(rows[0]) }, userId };
    }
    case "slug": {
      // slug_templates and slugs share ~50 columns (all the ability flags);
      // copy the intersection instead of hand-listing every one.
      const { rows: cols } = await client.query(
        `SELECT a.column_name FROM information_schema.columns a
         JOIN information_schema.columns b ON b.column_name = a.column_name AND b.table_name = 'slugs' AND b.table_schema = a.table_schema
         WHERE a.table_name = 'slug_templates' AND a.table_schema = current_schema()
           AND a.column_name NOT IN ('id', 'created_at')`
      );
      const names = cols.map((c) => `"${c.column_name}"`).join(", ");
      const { rows } = await client.query(
        `INSERT INTO slugs (template_id, user_id, energy_pips, ${names})
         SELECT t.id, $2, (SELECT COALESCE(jsonb_agg(true), '[]'::jsonb) FROM generate_series(1, t.max_energy_pips)), ${cols
           .map((c) => `t."${c.column_name}"`)
           .join(", ")}
         FROM slug_templates t WHERE t.id = $1 RETURNING *`,
        [templateId, userId]
      );
      return rows[0] && { type: "slug-updated", payload: { slug: toClientSlug(rows[0]) }, userId, slug: true };
    }
    default:
      return null;
  }
}

router.post("/buy", async (req, res) => {
  if (isDM(req)) return res.status(403).json({ error: "Only players can buy from the market." });
  const key = String(req.body?.key ?? "");
  const qty = key === "pods" ? Number(req.body?.quantity ?? 1) : 1;
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
    return res.status(400).json({ error: "Quantity must be between 1 and 20." });
  }

  const client = await pool.connect();
  let delivered = null;
  try {
    await client.query("BEGIN");
    const { rows: chars } = await client.query("SELECT * FROM characters WHERE user_id = $1 FOR UPDATE", [req.user.sub]);
    const character = chars[0];
    if (!character) throw new MarketError("You don't have a character sheet yet.");

    const planet = await currentPlanet(client);
    const pm = await planetRow(planet, client);
    const barter = await personalDiscount(req.user.sub, planet, client);
    const priceOf = (basePrice) =>
      finalPrice(basePrice, pm.pricePct, { personalDiscountPct: barter?.discountPct ?? 0, planetBarterPct: pm.barterPct });

    const { rows: hiddenRows } = await client.query("SELECT 1 FROM market_hidden WHERE planet_index = $1 AND item_key = $2", [
      planet,
      key,
    ]);
    let unitPrice;
    let give; // async (client) => delivered descriptor
    let label;

    if (key === "pods") {
      if (hiddenRows[0]) throw new MarketError("That isn't for sale here.");
      unitPrice = priceOf(POD_PRICE);
      label = "Slug Pod";
      give = async () => {
        await client.query("UPDATE characters SET pods = pods + $1 WHERE user_id = $2", [qty, req.user.sub]);
        return null;
      };
    } else if (key.startsWith("mod:") || key.startsWith("mecha_mod:")) {
      if (hiddenRows[0]) throw new MarketError("That isn't for sale here.");
      const kind = key.startsWith("mod:") ? "mod" : "mecha_mod";
      const id = Number(key.split(":")[1]);
      const { rows } = await client.query(`SELECT * FROM ${KIND_TABLES[kind].table} WHERE id = $1`, [id]);
      const t = rows[0];
      const standing = kind === "mod" ? t && isStandingBlasterMod(t) : t && isStandingMechaMod(t);
      if (!t || !standing) throw new MarketError("That isn't for sale here.");
      unitPrice = priceOf(t.base_price ?? (kind === "mod" ? defaultBlasterModPrice(t) : defaultMechaModPrice(t)));
      label = t.name;
      give = () => cloneTemplateToUser(client, kind, id, req.user.sub);
    } else if (key.startsWith("listing:")) {
      const id = Number(key.split(":")[1]);
      const { rows } = await client.query("SELECT * FROM market_listings WHERE id = $1 AND planet_index = $2 FOR UPDATE", [id, planet]);
      const listing = rows[0];
      if (!listing) throw new MarketError("That listing is no longer available.", 404);
      if (listing.quantity !== null && listing.quantity <= 0) throw new MarketError("Sold out.");
      unitPrice = priceOf(listing.base_price);
      const { rows: tpl } = await client.query(`SELECT name FROM ${KIND_TABLES[listing.kind].table} WHERE id = $1`, [listing.template_id]);
      label = tpl[0]?.name ?? "Item";
      give = async () => {
        if (listing.quantity !== null) {
          if (listing.quantity - 1 <= 0) await client.query("DELETE FROM market_listings WHERE id = $1", [id]);
          else await client.query("UPDATE market_listings SET quantity = quantity - 1 WHERE id = $1", [id]);
        }
        return cloneTemplateToUser(client, listing.kind, listing.template_id, req.user.sub);
      };
    } else {
      throw new MarketError("Unknown item.");
    }

    const total = unitPrice * qty;
    if (character.credits < total) throw new MarketError(`Not enough credits -- that costs ${total}.`);
    await client.query("UPDATE characters SET credits = credits - $1 WHERE user_id = $2", [total, req.user.sub]);
    delivered = await give();
    const { rows: after } = await client.query("SELECT credits, pods FROM characters WHERE user_id = $1", [req.user.sub]);
    await client.query("COMMIT");

    if (delivered?.slug) await syncTempoAura({ userId: req.user.sub }, { fill: true });
    if (delivered) broadcastAll({ type: delivered.type, userId: delivered.userId, ...delivered.payload });
    signalMarketChanged();
    res.json({ ok: true, label, quantity: qty, total, me: { credits: after[0].credits, pods: after[0].pods } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof MarketError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not complete that purchase." });
  } finally {
    client.release();
  }
});

// ---- barter ---------------------------------------------------------------------

function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

// One haggle per player per planet per rest. d20 + Persuasion: 10 breaks even,
// each point above is 2% off for the roller (capped at 20%); each point below
// adds 2% to every price on this planet for everyone (capped at 20% total).
router.post("/barter", async (req, res) => {
  if (isDM(req)) return res.status(403).json({ error: "Only players can barter." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: chars } = await client.query(
      "SELECT stats, proficiencies FROM characters WHERE user_id = $1 FOR UPDATE",
      [req.user.sub]
    );
    const character = chars[0];
    if (!character) throw new MarketError("You don't have a character sheet yet.");
    const planet = await currentPlanet(client);
    if (await personalDiscount(req.user.sub, planet, client)) {
      throw new MarketError("You've already haggled here -- try again after the party rests.");
    }

    const die = rollD20();
    const modifier = skillModifier(character.stats, character.proficiencies, "persuasion");
    const total = die + modifier;
    const pct = barterPctForTotal(total); // signed: +discount / -markup
    const roll = { die, modifier, total, pct };

    await client.query(
      "INSERT INTO market_barters (user_id, planet_index, discount_pct, roll) VALUES ($1, $2, $3, $4)",
      [req.user.sub, planet, Math.max(0, pct), JSON.stringify(roll)]
    );
    if (pct < 0) {
      await client.query(
        `INSERT INTO planet_markets (planet_index, barter_pct) VALUES ($1, $2)
         ON CONFLICT (planet_index) DO UPDATE SET barter_pct = LEAST($3, planet_markets.barter_pct + $2)`,
        [planet, -pct, BARTER_MAX_PCT]
      );
    }
    await client.query("COMMIT");
    signalMarketChanged();
    res.json({ roll });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof MarketError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Could not barter." });
  } finally {
    client.release();
  }
});

// ---- DM management -----------------------------------------------------------------

router.put("/planets/:index", requireDungeonMaster, async (req, res) => {
  const index = Number(req.params.index);
  const pricePct = Number(req.body?.pricePct);
  if (!Number.isInteger(index) || index < 0 || index > 16) return res.status(400).json({ error: "Invalid planet." });
  if (!Number.isInteger(pricePct) || pricePct < PLANET_PCT_MIN || pricePct > PLANET_PCT_MAX) {
    return res.status(400).json({ error: `Price modifier must be between ${PLANET_PCT_MIN}% and ${PLANET_PCT_MAX}%.` });
  }
  try {
    await pool.query(
      `INSERT INTO planet_markets (planet_index, price_pct) VALUES ($1, $2)
       ON CONFLICT (planet_index) DO UPDATE SET price_pct = $2`,
      [index, pricePct]
    );
    signalMarketChanged();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save the price modifier." });
  }
});

// Template picker for "post a listing": every template with its default price.
router.get("/catalog", requireDungeonMaster, async (req, res) => {
  try {
    const catalog = {};
    for (const kind of LISTING_KINDS) {
      const def = KIND_TABLES[kind];
      const { rows } = await pool.query(`SELECT * FROM ${def.table} ORDER BY name`);
      catalog[kind] = rows.map((t) => ({
        id: t.id,
        ...describeTemplate(kind, t),
        defaultPrice: templateBasePrice(kind, t),
      }));
    }
    res.json({ catalog });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the catalog." });
  }
});

router.post("/listings", requireDungeonMaster, async (req, res) => {
  const { kind, templateId } = req.body || {};
  const def = KIND_TABLES[kind];
  if (!def || !Number.isInteger(templateId)) return res.status(400).json({ error: "Pick a template to sell." });
  const quantity = req.body?.quantity == null || req.body.quantity === "" ? null : Number(req.body.quantity);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)) {
    return res.status(400).json({ error: "Quantity must be between 1 and 99 (or blank for unlimited)." });
  }
  try {
    const { rows: tpl } = await pool.query(`SELECT * FROM ${def.table} WHERE id = $1`, [templateId]);
    if (!tpl[0]) return res.status(404).json({ error: "Template not found." });
    let basePrice = templateBasePrice(kind, tpl[0]);
    if (req.body?.basePrice != null && req.body.basePrice !== "") {
      basePrice = Number(req.body.basePrice);
      if (!Number.isInteger(basePrice) || basePrice < 1 || basePrice > 1000000) {
        return res.status(400).json({ error: "Price must be a whole number of credits." });
      }
    }
    const planet = await currentPlanet();
    await pool.query(
      `INSERT INTO market_listings (kind, template_id, planet_index, base_price, quantity) VALUES ($1, $2, $3, $4, $5)`,
      [kind, templateId, planet, basePrice, quantity]
    );
    signalMarketChanged();
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not post the listing." });
  }
});

router.delete("/listings/:id", requireDungeonMaster, async (req, res) => {
  try {
    await pool.query("DELETE FROM market_listings WHERE id = $1", [Number(req.params.id)]);
    signalMarketChanged();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove the listing." });
  }
});

// Pull standing stock from (or return it to) the current planet's shelves.
router.post("/hidden", requireDungeonMaster, async (req, res) => {
  const key = String(req.body?.key ?? "");
  const hidden = Boolean(req.body?.hidden);
  if (!/^(pods|mod:\d+|mecha_mod:\d+)$/.test(key)) return res.status(400).json({ error: "Invalid item." });
  try {
    const planet = await currentPlanet();
    if (hidden) {
      await pool.query("INSERT INTO market_hidden (planet_index, item_key) VALUES ($1, $2) ON CONFLICT DO NOTHING", [planet, key]);
    } else {
      await pool.query("DELETE FROM market_hidden WHERE planet_index = $1 AND item_key = $2", [planet, key]);
    }
    signalMarketChanged();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the shelves." });
  }
});

// Absolute credits/pods for one character's purse.
router.patch("/purse/:userId", requireDungeonMaster, async (req, res) => {
  const userId = Number(req.params.userId);
  const { credits, pods } = req.body || {};
  const sets = [];
  const values = [];
  if (credits !== undefined) {
    if (!Number.isInteger(credits) || credits < 0 || credits > 100000000) {
      return res.status(400).json({ error: "Credits must be a non-negative whole number." });
    }
    values.push(credits);
    sets.push(`credits = $${values.length}`);
  }
  if (pods !== undefined) {
    if (!Number.isInteger(pods) || pods < 0 || pods > 999) {
      return res.status(400).json({ error: "Pods must be between 0 and 999." });
    }
    values.push(pods);
    sets.push(`pods = $${values.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update." });
  try {
    values.push(userId);
    const { rows } = await pool.query(
      `UPDATE characters SET ${sets.join(", ")} WHERE user_id = $${values.length} RETURNING user_id, credits, pods`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: "Character not found." });
    signalMarketChanged();
    res.json({ credits: rows[0].credits, pods: rows[0].pods });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the purse." });
  }
});

export default router;
