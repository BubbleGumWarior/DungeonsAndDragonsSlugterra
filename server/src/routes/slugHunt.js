import { Router } from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll, notifyUser } from "../ws.js";
import { skillModifier } from "../characterRules.js";
import { recordSlugpediaEntry } from "../slugpediaStore.js";
import { toClientTemplate } from "./slugTemplates.js";

const router = Router();
router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ODDS_PATH = path.join(__dirname, "..", "data", "slugHuntOdds.json");

// { areas: [...8 names], oddsByArea: { [name]: [{name,type,chance}] } } --
// generated from docs/Slugs - OG Slugs.csv, same source as the client copy
// at client/src/slugHuntOdds.json. A distribution per area summing to ~100%.
let ODDS = { areas: [], oddsByArea: {} };
try {
  ODDS = JSON.parse(readFileSync(ODDS_PATH, "utf8"));
} catch (err) {
  console.error("Could not load slug hunt odds:", err);
}

const SUCCESS_THRESHOLD = 15; // total must be strictly above this
const PENDING_TTL_MS = 30 * 60 * 1000;
const PITY_MISS_LIMIT = 5; // this many misses in a row guarantees the next hunt

// Player succeeded on the hunt roll, waiting on the DM to approve/reroll the
// slug it turned up. In-memory and short-lived, same as diceRoll.js's
// pendingRolls -- a hunt is a live moment, not durable state.
const pendingHunts = new Map();

function cleanupExpired() {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [id, hunt] of pendingHunts) {
    if (hunt.createdAt < cutoff) pendingHunts.delete(id);
  }
}

function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

// Consecutive-miss pity counter -- persists across rests (unlike the
// per-rest lock) so a long dry spell is eventually guaranteed a hit.
async function getMissStreak(userId) {
  const { rows } = await pool.query("SELECT misses FROM slug_hunt_streaks WHERE user_id = $1", [userId]);
  return rows[0]?.misses ?? 0;
}

async function resetMissStreak(userId) {
  await pool.query(
    "INSERT INTO slug_hunt_streaks (user_id, misses) VALUES ($1, 0) ON CONFLICT (user_id) DO UPDATE SET misses = 0",
    [userId]
  );
}

async function incrementMissStreak(userId) {
  await pool.query(
    `INSERT INTO slug_hunt_streaks (user_id, misses) VALUES ($1, 1)
     ON CONFLICT (user_id) DO UPDATE SET misses = slug_hunt_streaks.misses + 1`,
    [userId]
  );
}

function areaName(areaIndex) {
  return ODDS.areas[areaIndex] ?? `Area ${areaIndex + 1}`;
}

// Weighted random slug for an area, restricted to names the DM actually has a
// template for (so approving can always add a real entry to the slugpedia).
// Returns a slug_templates row, or null if nothing is eligible.
async function pickSlugForArea(areaIndex) {
  const entries = ODDS.oddsByArea[areaName(areaIndex)] || [];
  if (entries.length === 0) return null;

  const wanted = entries.map((e) => e.name);
  const { rows: templates } = await pool.query(
    "SELECT * FROM slug_templates WHERE name = ANY($1)",
    [wanted]
  );
  const byName = new Map(templates.map((t) => [t.name, t]));

  const pool_ = entries.filter((e) => e.chance > 0 && byName.has(e.name));
  if (pool_.length === 0) return null;

  const total = pool_.reduce((sum, e) => sum + e.chance, 0);
  let r = Math.random() * total;
  for (const e of pool_) {
    r -= e.chance;
    if (r <= 0) return byName.get(e.name);
  }
  return byName.get(pool_[pool_.length - 1].name);
}

function huntPayload(hunt, template) {
  return {
    id: hunt.id,
    initiatingUserId: hunt.initiatingUserId,
    initiatingName: hunt.initiatingName,
    area: hunt.area,
    areaName: areaName(hunt.area),
    roll: hunt.roll,
    modifier: hunt.modifier,
    total: hunt.total,
    slug: toClientTemplate(template),
    at: Date.now(),
  };
}

async function notifyDungeonMasters(payload) {
  const { rows } = await pool.query("SELECT id FROM users WHERE role = 'Dungeon Master'");
  for (const row of rows) notifyUser(row.id, payload);
}

// Drops a line into Party Chat. `role` picks the styling: "Dungeon Master"
// gets the highlighted DM treatment (a successful find), anything else is a
// plain message bubble (a hunt that came up empty).
async function postChatMessage(role, body) {
  const { rows } = await pool.query(
    `INSERT INTO messages (user_id, username, role, body)
     VALUES (NULL, 'Slug Hunt', $1, $2)
     RETURNING id, user_id, username, role, body, meta, created_at`,
    [role, body]
  );
  broadcastAll({
    type: "chat-message",
    message: {
      id: rows[0].id,
      userId: rows[0].user_id,
      username: rows[0].username,
      role: rows[0].role,
      body: rows[0].body,
      meta: rows[0].meta,
      createdAt: rows[0].created_at,
    },
  });
}

// Whether the current player has already used their hunt this rest.
router.get("/status", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT 1 FROM slug_hunt_locks WHERE user_id = $1", [req.user.sub]);
    res.json({ locked: rows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load hunt status." });
  }
});

// A player attempts a hunt at the party's current location. Rolls d20 +
// Survival server-side; on a total above 15 a pending hunt is created and the
// DM(s) are prompted with a weighted-random slug to approve or reroll. One
// attempt per rest -- a lock row is written whether it succeeds or fails.
router.post("/attempt", async (req, res) => {
  try {
    const { rows: lockRows } = await pool.query("SELECT 1 FROM slug_hunt_locks WHERE user_id = $1", [req.user.sub]);
    if (lockRows.length > 0) {
      return res.status(409).json({ error: "You've already hunted this rest -- wait for the party to rest." });
    }

    const { rows: charRows } = await pool.query(
      "SELECT name, stats, proficiencies FROM characters WHERE user_id = $1",
      [req.user.sub]
    );
    const character = charRows[0];
    if (!character) {
      return res.status(400).json({ error: "You don't have a character sheet yet." });
    }

    const { rows: settingRows } = await pool.query(
      "SELECT slug_hunt_area FROM campaign_settings WHERE id = 1"
    );
    const area = settingRows[0]?.slug_hunt_area ?? 0;

    const modifier = skillModifier(character.stats, character.proficiencies, "survival");
    const roll = rollD20();
    const total = roll + modifier;

    // Pity rule: five misses in a row guarantees the next hunt succeeds,
    // regardless of the roll, so a bad-luck streak can't run forever.
    const missStreak = await getMissStreak(req.user.sub);
    const pityBreak = missStreak >= PITY_MISS_LIMIT;
    const success = pityBreak || total > SUCCESS_THRESHOLD;

    // Burn the attempt now -- win or lose, they don't get another until a rest.
    await pool.query(
      "INSERT INTO slug_hunt_locks (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [req.user.sub]
    );
    notifyUser(req.user.sub, { type: "slug-hunt-lock", userId: req.user.sub, locked: true });

    if (!success) {
      await incrementMissStreak(req.user.sub);
      await postChatMessage(
        "Player",
        `${character.name} tried a slug hunt in ${areaName(area)} but found nothing.`
      );
      return res.json({ success: false, roll, modifier, total, area, areaName: areaName(area) });
    }

    await resetMissStreak(req.user.sub);

    const template = await pickSlugForArea(area);
    if (!template) {
      return res.status(409).json({
        error: "No slugs are catalogued for this area yet -- ask the DM to import the slug templates.",
      });
    }

    cleanupExpired();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hunt = {
      id,
      initiatingUserId: req.user.sub,
      initiatingName: character.name,
      area,
      slugTemplateId: template.id,
      roll,
      modifier,
      total,
      createdAt: Date.now(),
    };
    pendingHunts.set(id, hunt);

    await notifyDungeonMasters({ type: "slug-hunt-offered", hunt: huntPayload(hunt, template) });

    res.status(201).json({ success: true, roll, modifier, total, area, areaName: areaName(area), pityBreak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not attempt the hunt." });
  }
});

router.get("/pending", requireDungeonMaster, async (req, res) => {
  cleanupExpired();
  try {
    const hunts = [];
    for (const hunt of pendingHunts.values()) {
      const { rows } = await pool.query("SELECT * FROM slug_templates WHERE id = $1", [hunt.slugTemplateId]);
      if (rows[0]) hunts.push(huntPayload(hunt, rows[0]));
    }
    res.json({ hunts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load pending hunts." });
  }
});

router.post("/:id/reroll", requireDungeonMaster, async (req, res) => {
  const hunt = pendingHunts.get(req.params.id);
  if (!hunt) {
    return res.status(404).json({ error: "This hunt has expired or was already resolved." });
  }
  try {
    const template = await pickSlugForArea(hunt.area);
    if (!template) {
      return res.status(409).json({ error: "No eligible slugs to reroll." });
    }
    hunt.slugTemplateId = template.id;
    const payload = huntPayload(hunt, template);
    await notifyDungeonMasters({ type: "slug-hunt-updated", hunt: payload });
    res.json({ hunt: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reroll." });
  }
});

router.post("/:id/approve", requireDungeonMaster, async (req, res) => {
  const hunt = pendingHunts.get(req.params.id);
  if (!hunt) {
    return res.status(404).json({ error: "This hunt has expired or was already resolved." });
  }
  try {
    const { rows } = await pool.query("SELECT * FROM slug_templates WHERE id = $1", [hunt.slugTemplateId]);
    const template = rows[0];
    if (!template) {
      pendingHunts.delete(hunt.id);
      return res.status(409).json({ error: "That slug template no longer exists -- reroll." });
    }

    pendingHunts.delete(hunt.id);

    // "Once seen, always known" -- adds a party slugpedia entry (no-op if this
    // exact variant was already recorded). Broadcasts slugpedia-updated itself.
    await recordSlugpediaEntry({ ...template, template_id: template.id });

    await postChatMessage(
      "Dungeon Master",
      `${hunt.initiatingName} tracked down a wild ${template.name} -- a ${template.type}-type slug -- in ${areaName(hunt.area)}.`
    );

    await notifyDungeonMasters({ type: "slug-hunt-resolved", id: hunt.id });
    notifyUser(hunt.initiatingUserId, {
      type: "slug-hunt-resolved",
      id: hunt.id,
      outcome: "found",
      slugName: template.name,
      slugType: template.type,
    });

    res.json({ ok: true, slug: toClientTemplate(template) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not approve the hunt." });
  }
});

router.post("/:id/dismiss", requireDungeonMaster, async (req, res) => {
  const hunt = pendingHunts.get(req.params.id);
  if (!hunt) {
    return res.status(404).json({ error: "This hunt has expired or was already resolved." });
  }
  try {
    pendingHunts.delete(hunt.id);
    // Same plain-theme note as a failed roll -- the DM waving it off reads to
    // the table as the hunt simply turning up nothing.
    await postChatMessage(
      "Player",
      `${hunt.initiatingName} tried a slug hunt in ${areaName(hunt.area)} but found nothing.`
    );
    await notifyDungeonMasters({ type: "slug-hunt-resolved", id: hunt.id });
    notifyUser(hunt.initiatingUserId, { type: "slug-hunt-resolved", id: hunt.id, outcome: "dismissed" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not dismiss the hunt." });
  }
});

export default router;
