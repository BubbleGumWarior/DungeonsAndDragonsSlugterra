import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll, notifyUser } from "../ws.js";
import { PROFICIENCY_KEYS, PROFICIENCY_LABELS, PROFICIENCY_STATS, skillModifier } from "../characterRules.js";

const router = Router();

router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

function formatModifier(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function describeRoll(roll) {
  const typeSuffix =
    roll.rollType === "advantage" ? " (Advantage)" : roll.rollType === "disadvantage" ? " (Disadvantage)" : "";
  const mod = formatModifier(roll.modifier);

  if (roll.diceCount === 1) {
    const [r] = roll.results;
    const raw = r.values.length > 1 ? `[${r.values.join(", ")}] keeping ${r.kept}` : `${r.kept}`;
    return `${roll.targetName} rolled ${roll.skillLabel}${typeSuffix}: d20 ${raw} ${mod} = ${r.total}`;
  }

  const parts = roll.results.map((r) => r.total).join(", ");
  return `${roll.targetName} rolled ${roll.skillLabel}${typeSuffix} ×${roll.diceCount}: ${parts} (d20 ${mod} each)`;
}

// Pending roll requests, keyed by offer id. In-memory and short-lived: a
// request is a live "hey, roll this" moment, not durable state -- it is
// consumed exactly once by the target player's own Roll click, or it
// expires if never answered.
const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingRolls = new Map();

function cleanupExpired() {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [id, offer] of pendingRolls) {
    if (offer.createdAt < cutoff) pendingRolls.delete(id);
  }
}

// DM calls for a roll. Sent to the target player only -- nobody else,
// including the DM's own other sessions, is notified. The DM's panel just
// gets a plain "sent" confirmation back.
router.post("/", requireDungeonMaster, async (req, res) => {
  const diceCount = Number(req.body?.diceCount);
  const skill = req.body?.skill;
  const targetUserId = Number(req.body?.targetUserId);
  const rollType = req.body?.rollType;

  if (!Number.isInteger(diceCount) || diceCount < 1 || diceCount > 10) {
    return res.status(400).json({ error: "Dice must be a whole number between 1 and 10." });
  }
  if (!PROFICIENCY_KEYS.includes(skill)) {
    return res.status(400).json({ error: "Invalid skill." });
  }
  if (!["normal", "advantage", "disadvantage"].includes(rollType)) {
    return res.status(400).json({ error: "Invalid roll type." });
  }
  if (!Number.isInteger(targetUserId)) {
    return res.status(400).json({ error: "Target player is required." });
  }

  try {
    const { rows: userRows } = await pool.query("SELECT id, username FROM users WHERE id = $1", [targetUserId]);
    const target = userRows[0];
    if (!target) {
      return res.status(404).json({ error: "Target player not found." });
    }

    const { rows: charRows } = await pool.query("SELECT name FROM characters WHERE user_id = $1", [targetUserId]);
    const character = charRows[0];
    if (!character) {
      return res.status(400).json({ error: `${target.username} doesn't have a character sheet yet.` });
    }

    cleanupExpired();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingRolls.set(id, {
      targetUserId,
      targetName: character.name,
      diceCount,
      skill,
      rollType,
      calledBy: req.user.username,
      createdAt: Date.now(),
    });

    notifyUser(targetUserId, {
      type: "dice-roll-offered",
      offer: {
        id,
        diceCount,
        skill,
        skillLabel: PROFICIENCY_LABELS[skill],
        rollType,
        calledBy: req.user.username,
        at: Date.now(),
      },
    });

    res.status(201).json({ ok: true, targetName: character.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not call roll." });
  }
});

// The target player resolves their own pending roll. Single-use: the offer
// is deleted the moment it's claimed, computed fresh server-side (never
// trusting the client for dice values), and logged to chat immediately --
// the instant the roller sees their result, so does the table.
router.post("/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const offer = pendingRolls.get(id);
  if (!offer) {
    return res.status(404).json({ error: "This roll request has expired or was already used." });
  }
  if (offer.targetUserId !== req.user.sub) {
    return res.status(403).json({ error: "This roll isn't yours to make." });
  }
  pendingRolls.delete(id);

  try {
    const { rows: charRows } = await pool.query(
      "SELECT stats, proficiencies FROM characters WHERE user_id = $1",
      [req.user.sub]
    );
    const character = charRows[0];
    if (!character) {
      return res.status(400).json({ error: "You don't have a character sheet yet." });
    }

    const modifier = skillModifier(character.stats, character.proficiencies, offer.skill);
    const isProficient = Array.isArray(character.proficiencies) && character.proficiencies.includes(offer.skill);

    const results = [];
    for (let i = 0; i < offer.diceCount; i++) {
      let values, kept;
      if (offer.rollType === "normal") {
        const v = rollD20();
        values = [v];
        kept = v;
      } else {
        const a = rollD20();
        const b = rollD20();
        values = [a, b];
        kept = offer.rollType === "advantage" ? Math.max(a, b) : Math.min(a, b);
      }
      results.push({ values, kept, total: kept + modifier });
    }

    const roll = {
      id,
      targetUserId: req.user.sub,
      targetName: offer.targetName,
      calledBy: offer.calledBy,
      diceCount: offer.diceCount,
      skill: offer.skill,
      skillLabel: PROFICIENCY_LABELS[offer.skill],
      statKey: PROFICIENCY_STATS[offer.skill],
      modifier,
      isProficient,
      rollType: offer.rollType,
      results,
      at: Date.now(),
    };

    // body is a plain-text fallback; meta carries the structured shape the
    // chat UI actually renders (dice tiles, not a formula string).
    const meta = {
      type: "dice-roll",
      targetName: roll.targetName,
      skillLabel: roll.skillLabel,
      rollType: roll.rollType,
      diceCount: roll.diceCount,
      modifier: roll.modifier,
      results: roll.results,
    };

    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (user_id, username, role, body, meta)
       VALUES ($1, $2, 'System', $3, $4)
       RETURNING id, user_id, username, role, body, meta, created_at`,
      [req.user.sub, "Dice Roll", describeRoll(roll), JSON.stringify(meta)]
    );
    broadcastAll({
      type: "chat-message",
      message: {
        id: msgRows[0].id,
        userId: msgRows[0].user_id,
        username: msgRows[0].username,
        role: msgRows[0].role,
        body: msgRows[0].body,
        meta: msgRows[0].meta,
        createdAt: msgRows[0].created_at,
      },
    });

    res.json({ roll });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not resolve roll." });
  }
});

export default router;
