import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll, notifyUser } from "../ws.js";
import { syncTempoAura } from "../slugAura.js";
import { syncMechaModeFlags } from "./mechaMods.js";

const router = Router();
router.use(requireAuth);

class TradeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// kind -> table/owner column. Blaster mods and mecha mods are different
// tables with different equip columns, so they're separate kinds.
const KINDS = {
  blaster: { table: "blasters" },
  mod: { table: "mods" },
  slug: { table: "slugs" },
  mecha: { table: "mechas" },
  mecha_mod: { table: "mecha_mods" },
};

const MAX_ITEMS_PER_SIDE = 12;

// ---- helpers ---------------------------------------------------------------

function parseItems(raw, label) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS_PER_SIDE) {
    throw new TradeError(`${label}: too many items (max ${MAX_ITEMS_PER_SIDE}).`);
  }
  const seen = new Set();
  return raw.map((it) => {
    if (!it || !KINDS[it.kind] || !Number.isInteger(it.id)) throw new TradeError(`${label}: invalid item.`);
    const k = `${it.kind}:${it.id}`;
    if (seen.has(k)) throw new TradeError(`${label}: duplicate item.`);
    seen.add(k);
    return { kind: it.kind, id: it.id };
  });
}

function parseAmount(raw, label, max) {
  const n = raw == null || raw === "" ? 0 : Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new TradeError(`${label} must be a whole number between 0 and ${max}.`);
  return n;
}

async function ownerOf(db, item) {
  const { rows } = await db.query(`SELECT user_id FROM ${KINDS[item.kind].table} WHERE id = $1`, [item.id]);
  return rows[0]?.user_id ?? null;
}

async function assertOwns(db, userId, items, whose) {
  for (const it of items) {
    if ((await ownerOf(db, it)) !== userId) {
      throw new TradeError(`${whose} no longer has one of the items in this trade.`);
    }
  }
}

// A character in a live fight can't trade -- gear is in play.
async function assertNotInCombat(db, userIds) {
  const { rows } = await db.query(
    `SELECT 1 FROM combatants c JOIN encounters e ON e.id = c.encounter_id
     WHERE e.status = 'active' AND c.kind = 'character' AND c.ref_user_id = ANY($1::int[]) LIMIT 1`,
    [userIds]
  );
  if (rows[0]) throw new TradeError("Trading is locked while a character is in combat.");
}

// One-line summary of an item for the toast/panel.
async function describeItem(item) {
  const def = KINDS[item.kind];
  const cols = item.kind === "slug" ? "name, protoform_image AS image" : item.kind === "mecha_mod" ? "name, NULL AS image" : "name, image";
  const { rows } = await pool.query(`SELECT ${cols} FROM ${def.table} WHERE id = $1`, [item.id]);
  return { kind: item.kind, id: item.id, name: rows[0]?.name ?? "(item gone)", image: rows[0]?.image ?? null };
}

async function toClientTrade(row, names) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    fromName: names.get(row.from_user_id) ?? "Unknown",
    toName: names.get(row.to_user_id) ?? "Unknown",
    give: await Promise.all(row.give.map(describeItem)),
    ask: await Promise.all(row.ask.map(describeItem)),
    giveCredits: row.give_credits,
    askCredits: row.ask_credits,
    givePods: row.give_pods,
    askPods: row.ask_pods,
    status: row.status,
    counterOf: row.counter_of,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

async function characterNames(userIds) {
  const { rows } = await pool.query("SELECT user_id, name FROM characters WHERE user_id = ANY($1::int[])", [userIds]);
  return new Map(rows.map((r) => [r.user_id, r.name]));
}

function notifyTrade(row, event) {
  const payload = { type: "trade-changed", event, tradeId: row.id, at: Date.now() };
  notifyUser(row.from_user_id, payload);
  notifyUser(row.to_user_id, payload);
}

// ---- reads -------------------------------------------------------------------

router.get("/", async (req, res) => {
  try {
    const me = req.user.sub;
    const { rows } = await pool.query(
      `SELECT * FROM trades WHERE (from_user_id = $1 OR to_user_id = $1)
         AND (status = 'pending' OR resolved_at > now() - interval '3 days')
       ORDER BY id DESC LIMIT 60`,
      [me]
    );
    const ids = [...new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id]))];
    const names = await characterNames(ids);
    res.json({ trades: await Promise.all(rows.map((r) => toClientTrade(r, names))) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load trades." });
  }
});

// Other party members to trade with.
router.get("/players", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT user_id, name, portrait FROM characters WHERE user_id <> $1 ORDER BY created_at ASC",
      [req.user.sub]
    );
    res.json({ players: rows.map((r) => ({ userId: r.user_id, name: r.name, portrait: r.portrait })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load players." });
  }
});

// Everything a player owns that can be put in a trade. `inTrade` marks items
// already offered in one of that player's own pending proposals.
router.get("/inventory/:userId", async (req, res) => {
  const userId = req.params.userId === "me" ? req.user.sub : Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: "Invalid player." });
  try {
    const { rows: pending } = await pool.query("SELECT give FROM trades WHERE from_user_id = $1 AND status = 'pending'", [userId]);
    const locked = new Set(pending.flatMap((t) => t.give.map((g) => `${g.kind}:${g.id}`)));
    const out = { items: [], credits: 0, pods: 0 };
    const specs = [
      ["blaster", "SELECT id, name, image, base_type AS hint, equip_slot IS NOT NULL AS equipped FROM blasters WHERE user_id = $1 AND owner_combatant_id IS NULL ORDER BY name"],
      ["mod", "SELECT id, name, image, NULL AS hint, equipped_blaster_id IS NOT NULL AS equipped FROM mods WHERE user_id = $1 ORDER BY name"],
      ["slug", "SELECT id, name, protoform_image AS image, type AS hint, equipped_blaster_id IS NOT NULL AS equipped FROM slugs WHERE user_id = $1 ORDER BY name"],
      ["mecha", "SELECT id, name, image, frame_type AS hint, false AS equipped FROM mechas WHERE user_id = $1 ORDER BY name"],
      ["mecha_mod", "SELECT id, name, NULL AS image, NULL AS hint, equipped_mecha_id IS NOT NULL AS equipped FROM mecha_mods WHERE user_id = $1 ORDER BY name"],
    ];
    for (const [kind, sql] of specs) {
      const { rows } = await pool.query(sql, [userId]);
      for (const r of rows) {
        out.items.push({
          kind,
          id: r.id,
          name: r.name,
          image: r.image,
          hint: r.hint,
          equipped: Boolean(r.equipped),
          inTrade: locked.has(`${kind}:${r.id}`),
        });
      }
    }
    const { rows: ch } = await pool.query("SELECT credits, pods FROM characters WHERE user_id = $1", [userId]);
    out.credits = ch[0]?.credits ?? 0;
    out.pods = ch[0]?.pods ?? 0;
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load that inventory." });
  }
});

// ---- creating ------------------------------------------------------------------

async function insertTrade(db, fromUserId, body, counterOf = null) {
  const toUserId = Number(body?.toUserId);
  if (!Number.isInteger(toUserId) || toUserId === fromUserId) throw new TradeError("Pick another player to trade with.");
  const { rows: target } = await db.query("SELECT 1 FROM characters WHERE user_id = $1", [toUserId]);
  if (!target[0]) throw new TradeError("That player has no character.");

  const give = parseItems(body.give, "Your offer");
  const ask = parseItems(body.ask, "Your request");
  const giveCredits = parseAmount(body.giveCredits, "Credits offered", 100000000);
  const askCredits = parseAmount(body.askCredits, "Credits requested", 100000000);
  const givePods = parseAmount(body.givePods, "Pods offered", 999);
  const askPods = parseAmount(body.askPods, "Pods requested", 999);

  if (give.length + ask.length + giveCredits + askCredits + givePods + askPods === 0) {
    throw new TradeError("A trade needs something in it.");
  }
  await assertNotInCombat(db, [fromUserId, toUserId]);
  await assertOwns(db, fromUserId, give, "You");
  await assertOwns(db, toUserId, ask, "They");

  // You can't promise the same item to two people at once.
  const { rows: pending } = await db.query(
    "SELECT give FROM trades WHERE from_user_id = $1 AND status = 'pending' AND id IS DISTINCT FROM $2",
    [fromUserId, counterOf]
  );
  const locked = new Set(pending.flatMap((t) => t.give.map((g) => `${g.kind}:${g.id}`)));
  if (give.some((g) => locked.has(`${g.kind}:${g.id}`))) {
    throw new TradeError("One of those items is already offered in another pending trade.");
  }
  const { rows: me } = await db.query("SELECT credits, pods FROM characters WHERE user_id = $1", [fromUserId]);
  if (!me[0]) throw new TradeError("You don't have a character sheet yet.");
  if (me[0].credits < giveCredits) throw new TradeError("You don't have that many credits.");
  if (me[0].pods < givePods) throw new TradeError("You don't have that many pods.");

  const { rows } = await db.query(
    `INSERT INTO trades (from_user_id, to_user_id, give, ask, give_credits, ask_credits, give_pods, ask_pods, counter_of)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [fromUserId, toUserId, JSON.stringify(give), JSON.stringify(ask), giveCredits, askCredits, givePods, askPods, counterOf]
  );
  return rows[0];
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function sendError(res, err, fallback) {
  if (err instanceof TradeError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallback });
}

router.post("/", async (req, res) => {
  try {
    const row = await withTx((client) => insertTrade(client, req.user.sub, req.body));
    notifyTrade(row, "offered");
    res.status(201).json({ id: row.id });
  } catch (err) {
    sendError(res, err, "Could not send the trade.");
  }
});

// The recipient answers with a fresh proposal back to the original sender; the
// original is closed as 'countered'.
router.post("/:id/counter", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { original, row } = await withTx(async (client) => {
      const { rows } = await client.query("SELECT * FROM trades WHERE id = $1 FOR UPDATE", [id]);
      const original = rows[0];
      if (!original) throw new TradeError("Trade not found.", 404);
      if (original.to_user_id !== req.user.sub) throw new TradeError("That offer isn't addressed to you.", 403);
      if (original.status !== "pending") throw new TradeError("That offer is no longer open.");
      const body = { ...req.body, toUserId: original.from_user_id };
      await client.query("UPDATE trades SET status = 'countered', resolved_at = now() WHERE id = $1", [id]);
      const row = await insertTrade(client, req.user.sub, body, id);
      return { original, row };
    });
    notifyTrade(original, "countered");
    notifyTrade(row, "offered");
    res.status(201).json({ id: row.id });
  } catch (err) {
    sendError(res, err, "Could not send the counter-offer.");
  }
});

async function closeTrade(req, res, { who, status, event }) {
  const id = Number(req.params.id);
  try {
    const row = await withTx(async (client) => {
      const { rows } = await client.query("SELECT * FROM trades WHERE id = $1 FOR UPDATE", [id]);
      const t = rows[0];
      if (!t) throw new TradeError("Trade not found.", 404);
      if ((who === "to" ? t.to_user_id : t.from_user_id) !== req.user.sub) {
        throw new TradeError("That isn't yours to answer.", 403);
      }
      if (t.status !== "pending") throw new TradeError("That trade is no longer open.");
      const { rows: upd } = await client.query("UPDATE trades SET status = $2, resolved_at = now() WHERE id = $1 RETURNING *", [id, status]);
      return upd[0];
    });
    notifyTrade(row, event);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, "Could not update the trade.");
  }
}

router.post("/:id/decline", (req, res) => closeTrade(req, res, { who: "to", status: "declined", event: "declined" }));
router.post("/:id/cancel", (req, res) => closeTrade(req, res, { who: "from", status: "cancelled", event: "cancelled" }));

// ---- accepting --------------------------------------------------------------------

// Moves one item to a new owner, first stripping it of every equip
// relationship so nothing in anyone's loadout silently loses a piece:
//   blaster   -> unequipped, its slugs unloaded, its mods detached
//   slug      -> unloaded from its blaster
//   mod       -> detached from its blaster
//   mecha_mod -> detached from its mecha
//   mecha     -> its mods detached
// Mods/slugs attached to a traded blaster stay with the original owner unless
// they were put in the trade themselves. Returns mecha ids needing a
// terrain-flag resync after commit.
export async function transferItem(client, item, newOwnerId, resync) {
  switch (item.kind) {
    case "blaster":
      await client.query("UPDATE slugs SET equipped_blaster_id = NULL, magazine_slot = NULL WHERE equipped_blaster_id = $1", [item.id]);
      await client.query("UPDATE mods SET equipped_blaster_id = NULL WHERE equipped_blaster_id = $1", [item.id]);
      await client.query("UPDATE blasters SET equip_slot = NULL, user_id = $2 WHERE id = $1", [item.id, newOwnerId]);
      break;
    case "slug":
      await client.query(
        "UPDATE slugs SET equipped_blaster_id = NULL, magazine_slot = NULL, user_id = $2 WHERE id = $1",
        [item.id, newOwnerId]
      );
      break;
    case "mod":
      await client.query("UPDATE mods SET equipped_blaster_id = NULL, user_id = $2 WHERE id = $1", [item.id, newOwnerId]);
      break;
    case "mecha_mod": {
      const { rows } = await client.query("SELECT equipped_mecha_id FROM mecha_mods WHERE id = $1", [item.id]);
      if (rows[0]?.equipped_mecha_id) resync.add(rows[0].equipped_mecha_id);
      await client.query("UPDATE mecha_mods SET equipped_mecha_id = NULL, user_id = $2 WHERE id = $1", [item.id, newOwnerId]);
      break;
    }
    case "mecha":
      await client.query("UPDATE mecha_mods SET equipped_mecha_id = NULL WHERE equipped_mecha_id = $1", [item.id]);
      await client.query("UPDATE mechas SET user_id = $2, can_glide = false, can_aquatic = false, can_burrow = false WHERE id = $1", [item.id, newOwnerId]);
      break;
    default:
      throw new TradeError("Unknown item kind.");
  }
}

router.post("/:id/accept", async (req, res) => {
  const id = Number(req.params.id);
  const resync = new Set();
  try {
    const row = await withTx(async (client) => {
      const { rows } = await client.query("SELECT * FROM trades WHERE id = $1 FOR UPDATE", [id]);
      const t = rows[0];
      if (!t) throw new TradeError("Trade not found.", 404);
      if (t.to_user_id !== req.user.sub) throw new TradeError("That offer isn't addressed to you.", 403);
      if (t.status !== "pending") throw new TradeError("That trade is no longer open.");

      // Lock both purses in a stable order so two trades can't deadlock.
      const lockIds = [t.from_user_id, t.to_user_id].sort((a, b) => a - b);
      const { rows: chars } = await client.query("SELECT user_id, credits, pods FROM characters WHERE user_id = ANY($1::int[]) ORDER BY user_id FOR UPDATE", [lockIds]);
      const byId = new Map(chars.map((c) => [c.user_id, c]));
      const from = byId.get(t.from_user_id);
      const to = byId.get(t.to_user_id);
      if (!from || !to) throw new TradeError("A trader no longer has a character.");

      await assertNotInCombat(client, lockIds);
      await assertOwns(client, t.from_user_id, t.give, "The sender");
      await assertOwns(client, t.to_user_id, t.ask, "You");
      if (from.credits < t.give_credits) throw new TradeError("The sender can't cover the credits any more.");
      if (to.credits < t.ask_credits) throw new TradeError("You don't have enough credits for this trade.");
      if (from.pods < t.give_pods) throw new TradeError("The sender doesn't have enough pods any more.");
      if (to.pods < t.ask_pods) throw new TradeError("You don't have enough pods for this trade.");

      for (const it of t.give) await transferItem(client, it, t.to_user_id, resync);
      for (const it of t.ask) await transferItem(client, it, t.from_user_id, resync);

      await client.query(
        "UPDATE characters SET credits = credits - $2 + $3, pods = pods - $4 + $5 WHERE user_id = $1",
        [t.from_user_id, t.give_credits, t.ask_credits, t.give_pods, t.ask_pods]
      );
      await client.query(
        "UPDATE characters SET credits = credits - $2 + $3, pods = pods - $4 + $5 WHERE user_id = $1",
        [t.to_user_id, t.ask_credits, t.give_credits, t.ask_pods, t.give_pods]
      );
      const { rows: upd } = await client.query("UPDATE trades SET status = 'accepted', resolved_at = now() WHERE id = $1 RETURNING *", [id]);
      // Any other pending proposal that promised an item that just moved is
      // now void.
      await client.query(
        `UPDATE trades SET status = 'cancelled', resolved_at = now()
         WHERE status = 'pending' AND id <> $1 AND from_user_id = ANY($2::int[]) AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(give) g
           WHERE (g->>'kind') || ':' || (g->>'id') = ANY($3::text[]))`,
        [id, lockIds, [...t.give, ...t.ask].map((i) => `${i.kind}:${i.id}`)]
      );
      return upd[0];
    });

    for (const mechaId of resync) await syncMechaModeFlags(mechaId);
    await syncTempoAura({ userId: row.from_user_id });
    await syncTempoAura({ userId: row.to_user_id });
    // One authoritative "inventory changed" signal rather than a burst of
    // per-item updates (see the single-slot note in AccessSocket) -- the
    // affected pages refetch.
    broadcastAll({ type: "trade-completed", userIds: [row.from_user_id, row.to_user_id], at: Date.now() });
    notifyTrade(row, "accepted");
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, "Could not complete the trade.");
  }
});

export default router;
