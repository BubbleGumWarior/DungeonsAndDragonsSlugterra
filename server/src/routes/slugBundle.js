import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireDmEdit, canEditAsDm } from "../roles.js";
import { broadcastAll } from "../ws.js";
import { grantSlugFromTemplate } from "../slugGrant.js";
import { BUNDLE_SLUG_FOOD } from "../careRules.js";

// Give Slug Bundle: the DM lays out a set of slugs, everyone sees them in a
// shared modal, and the DM calls players up one at a time (or several at once)
// to claim exactly one each. Like a slug hunt this is a live table moment, so
// it lives in memory: a server restart simply closes the bundle, and any slug
// already claimed is a normal slug row by then.
//
// Every change broadcasts the whole bundle as one `slug-bundle` message, so the
// client's single-slot socket state is always the full current picture.

const router = Router();
router.use(requireAuth);

const MAX_SLUGS = 40;

let bundle = null; // { id, slugs: [...], players: [...], activeUserIds: Set, createdAt }
const claiming = new Set(); // slug keys with a claim in flight

function snapshot() {
  if (!bundle) return null;
  return {
    id: bundle.id,
    createdAt: bundle.createdAt,
    slugs: bundle.slugs.map((s) => ({
      key: s.key,
      templateId: s.templateId,
      name: s.name,
      type: s.type,
      protoformImage: s.protoformImage,
      claimedBy: s.claimedBy,
    })),
    players: bundle.players.map((p) => ({ userId: p.userId, name: p.name, claimedKey: p.claimedKey })),
    activeUserIds: [...bundle.activeUserIds],
  };
}

function broadcastBundle() {
  broadcastAll({ type: "slug-bundle", bundle: snapshot(), at: Date.now() });
}

// Anyone signed in can see the bundle -- it's on everyone's screen.
router.get("/", (req, res) => {
  res.json({ bundle: snapshot() });
});

// The DM opens a bundle from a list of template ids (repeats allowed, so two
// of the same slug can be on offer).
router.post("/", requireDmEdit, async (req, res) => {
  if (bundle) return res.status(409).json({ error: "A slug bundle is already open. Close it before starting another." });
  const ids = Array.isArray(req.body?.templateIds) ? req.body.templateIds : [];
  if (ids.length === 0 || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: "Pick at least one slug for the bundle." });
  }
  if (ids.length > MAX_SLUGS) return res.status(400).json({ error: `A bundle can hold at most ${MAX_SLUGS} slugs.` });

  try {
    const { rows: templates } = await pool.query(
      "SELECT id, name, type, protoform_image FROM slug_templates WHERE id = ANY($1::int[])",
      [[...new Set(ids)]]
    );
    const byId = new Map(templates.map((t) => [t.id, t]));
    if (ids.some((id) => !byId.has(id))) return res.status(400).json({ error: "One of those slug templates no longer exists." });

    // Every player, by character name (account name if they have no character yet).
    const { rows: players } = await pool.query(
      `SELECT u.id, COALESCE(c.name, u.username) AS name
       FROM users u LEFT JOIN characters c ON c.user_id = u.id
       WHERE u.role = 'Player' ORDER BY name ASC`
    );
    if (players.length === 0) return res.status(400).json({ error: "There are no players to give slugs to." });

    bundle = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      slugs: ids.map((id, i) => {
        const t = byId.get(id);
        return { key: `s${i}`, templateId: t.id, name: t.name, type: t.type, protoformImage: t.protoform_image, claimedBy: null };
      }),
      players: players.map((p) => ({ userId: p.id, name: p.name, claimedKey: null })),
      activeUserIds: new Set(),
    };
    broadcastBundle();
    res.status(201).json({ bundle: snapshot() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not open the slug bundle." });
  }
});

// The DM calls a player up to choose (or sends them back). A player who has
// already claimed can't be called again.
router.post("/turn", requireDmEdit, (req, res) => {
  if (!bundle) return res.status(404).json({ error: "There is no open slug bundle." });
  const { userId, active } = req.body || {};
  const player = bundle.players.find((p) => p.userId === userId);
  if (!player) return res.status(400).json({ error: "That player isn't part of this bundle." });
  if (active) {
    if (player.claimedKey) return res.status(409).json({ error: `${player.name} has already picked a slug.` });
    if (!bundle.slugs.some((s) => !s.claimedBy)) return res.status(409).json({ error: "Every slug in the bundle is taken." });
    bundle.activeUserIds.add(userId);
  } else {
    bundle.activeUserIds.delete(userId);
  }
  broadcastBundle();
  res.json({ bundle: snapshot() });
});

// A called-up player takes one slug. The DM may also pick on behalf of a
// called-up player (pass `userId`), e.g. when that player is away from the screen.
router.post("/claim", async (req, res) => {
  if (!bundle) return res.status(404).json({ error: "There is no open slug bundle." });
  const isDm = canEditAsDm(req.user);
  const userId = isDm && Number.isInteger(req.body?.userId) ? req.body.userId : req.user.sub;
  const player = bundle.players.find((p) => p.userId === userId);
  if (!player) return res.status(403).json({ error: "You aren't part of this bundle." });
  if (player.claimedKey) return res.status(409).json({ error: "You've already picked a slug from this bundle." });
  if (!bundle.activeUserIds.has(userId)) return res.status(409).json({ error: "Wait for the DM to call you up." });

  const slot = bundle.slugs.find((s) => s.key === req.body?.key);
  if (!slot) return res.status(400).json({ error: "That slug isn't in the bundle." });
  if (slot.claimedBy || claiming.has(slot.key)) return res.status(409).json({ error: `${slot.name} has already been taken.` });

  // Reserve before the first await so a second click can't take the same slug.
  const bundleId = bundle.id;
  claiming.add(slot.key);
  try {
    // Bundle slugs arrive hungry (25% food) -- the new owner has to feed them.
    const slug = await grantSlugFromTemplate(slot.templateId, userId, { food: BUNDLE_SLUG_FOOD });
    if (!slug) return res.status(409).json({ error: `The ${slot.name} template no longer exists.` });
    // The DM may have closed the bundle while the insert ran; the slug is
    // given either way, there's just nothing left to mark.
    if (bundle?.id === bundleId) {
      slot.claimedBy = userId;
      player.claimedKey = slot.key;
      bundle.activeUserIds.delete(userId);
      // Nothing left to pick: nobody else stays called up.
      if (!bundle.slugs.some((s) => !s.claimedBy)) bundle.activeUserIds.clear();
      broadcastBundle();
    }
    res.json({ ok: true, slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not claim that slug." });
  } finally {
    claiming.delete(slot.key);
  }
});

// Ends the bundle for everyone. Unclaimed slugs simply aren't given.
router.post("/close", requireDmEdit, (req, res) => {
  bundle = null;
  claiming.clear();
  broadcastBundle();
  res.json({ ok: true });
});

export default router;
