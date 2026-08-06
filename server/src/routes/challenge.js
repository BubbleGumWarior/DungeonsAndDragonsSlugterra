import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";

const router = Router();

router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

function serializeChallenge(row) {
  return {
    id: row.id,
    target: row.target,
    reward: row.reward,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

function serializeRoll(row) {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    userId: row.user_id,
    username: row.username,
    value: row.value,
    createdAt: row.created_at,
  };
}

async function loadCurrent() {
  const { rows: challengeRows } = await pool.query(
    "SELECT * FROM challenges ORDER BY created_at DESC, id DESC LIMIT 1"
  );
  const challenge = challengeRows[0];
  if (!challenge) return null;

  const { rows: rollRows } = await pool.query(
    "SELECT * FROM challenge_rolls WHERE challenge_id = $1 ORDER BY value DESC, created_at ASC",
    [challenge.id]
  );

  return { challenge: serializeChallenge(challenge), rolls: rollRows.map(serializeRoll) };
}

router.get("/current", async (req, res) => {
  try {
    const current = await loadCurrent();
    res.json(current || { challenge: null, rolls: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load challenge." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const target = Number(req.body?.target);
  const reward = typeof req.body?.reward === "string" ? req.body.reward.trim() : "";

  if (!Number.isInteger(target) || target < 1 || target > 100) {
    return res.status(400).json({ error: "Target must be a whole number between 1 and 100." });
  }
  if (!reward) {
    return res.status(400).json({ error: "Reward cannot be empty." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO challenges (target, reward, status) VALUES ($1, $2, 'active') RETURNING *`,
      [target, reward]
    );
    const challenge = serializeChallenge(rows[0]);
    broadcastAll({ type: "challenge-issued", challenge, rolls: [] });
    res.status(201).json({ challenge, rolls: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not issue challenge." });
  }
});

router.post("/:id/roll", async (req, res) => {
  const challengeId = Number(req.params.id);
  try {
    const { rows: challengeRows } = await pool.query("SELECT * FROM challenges WHERE id = $1", [challengeId]);
    const challenge = challengeRows[0];
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }
    if (challenge.status !== "active") {
      return res.status(400).json({ error: "This challenge is no longer accepting rolls." });
    }

    // d100, rolled server-side so the client animation can never influence the outcome.
    const value = 1 + Math.floor(Math.random() * 100);

    const { rows } = await pool.query(
      `INSERT INTO challenge_rolls (challenge_id, user_id, username, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (challenge_id, user_id) DO NOTHING
       RETURNING *`,
      [challengeId, req.user.sub, req.user.username, value]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: "You already rolled for this challenge." });
    }

    const roll = serializeRoll(rows[0]);
    broadcastAll({ type: "challenge-roll-added", challengeId, roll });
    res.status(201).json({ roll });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not roll." });
  }
});

router.delete("/:id/roll/:userId", requireDungeonMaster, async (req, res) => {
  const challengeId = Number(req.params.id);
  const userId = Number(req.params.userId);
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM challenge_rolls WHERE challenge_id = $1 AND user_id = $2",
      [challengeId, userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Roll not found." });
    }
    broadcastAll({ type: "challenge-roll-removed", challengeId, userId });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove roll." });
  }
});

router.post("/:id/finish", requireDungeonMaster, async (req, res) => {
  const challengeId = Number(req.params.id);
  try {
    const { rows: updated } = await pool.query(
      `UPDATE challenges SET status = 'finished', finished_at = now()
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [challengeId]
    );
    if (updated.length === 0) {
      return res.status(400).json({ error: "Challenge is not active." });
    }

    const { rows: rollRows } = await pool.query(
      "SELECT * FROM challenge_rolls WHERE challenge_id = $1 ORDER BY value DESC, created_at ASC",
      [challengeId]
    );
    const rolls = rollRows.map(serializeRoll);
    // Only rolls that actually beat the target are eligible to win --
    // "roll above X" means a roll of X or below never wins, however high it
    // is relative to everyone else's.
    const qualifying = rolls.filter((r) => r.value > updated[0].target);
    const highest = qualifying.reduce((max, r) => Math.max(max, r.value), 0);
    const winners = qualifying.filter((r) => r.value === highest);

    const challenge = serializeChallenge(updated[0]);
    broadcastAll({ type: "challenge-finished", challenge, winners, highest: winners.length > 0 ? highest : null });
    res.json({ challenge, winners, highest: winners.length > 0 ? highest : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not finish challenge." });
  }
});

export default router;
