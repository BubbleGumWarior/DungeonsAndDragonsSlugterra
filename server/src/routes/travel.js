import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { isValidArea } from "../shipRules.js";
import {
  buildTravelView,
  clearProposal,
  getActiveShip,
  navComputerWorking,
  notifyTravelUpdated,
  resetTravel,
  settleProposal,
  setVisited,
  startTravel,
} from "../travelService.js";

const router = Router();
router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

async function travelRow() {
  const { rows } = await pool.query("SELECT * FROM travel_state WHERE id = 1");
  return rows[0];
}

async function partyArea() {
  const { rows } = await pool.query("SELECT slug_hunt_area FROM campaign_settings WHERE id = 1");
  return rows[0]?.slug_hunt_area ?? 0;
}

router.get("/", async (req, res) => {
  try {
    res.json(await buildTravelView(req.user.sub));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load travel." });
  }
});

// A player puts a destination to the party. Only one proposal is open at a
// time; the proposer's own yes is counted straight away.
router.post("/propose", async (req, res) => {
  const area = Number(req.body?.area);
  if (!isValidArea(area)) return res.status(400).json({ error: "That isn't a charted world." });
  try {
    const row = await travelRow();
    if (row.traveling) return res.status(409).json({ error: "The ship is already under way." });
    if (row.proposal_area != null) {
      return res.status(409).json({ error: "The party is already voting on a destination." });
    }
    if (area === (await partyArea())) return res.status(400).json({ error: "The party is already there." });
    if (!(await getActiveShip())) return res.status(409).json({ error: "The party has no ship to travel in." });
    if (!(await navComputerWorking())) {
      return res.status(409).json({ error: "The ship's Nav Computer isn't working, so the party can't plot a course." });
    }

    await pool.query("UPDATE travel_state SET proposal_area = $1, proposer_id = $2 WHERE id = 1", [area, req.user.sub]);
    await pool.query("DELETE FROM travel_votes");
    // The DM isn't a voter, so their proposal starts at no votes.
    const { rows: voter } = await pool.query(
      "SELECT 1 FROM characters c JOIN users u ON u.id = c.user_id WHERE c.user_id = $1 AND u.role <> 'Dungeon Master'",
      [req.user.sub]
    );
    if (voter.length) {
      await pool.query("INSERT INTO travel_votes (user_id, vote) VALUES ($1, true)", [req.user.sub]);
    }
    const outcome = await settleProposal();
    notifyTravelUpdated();
    res.json({ outcome });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start the vote." });
  }
});

router.post("/vote", async (req, res) => {
  const vote = req.body?.vote;
  if (vote !== "yes" && vote !== "no") return res.status(400).json({ error: "Vote yes or no." });
  try {
    const row = await travelRow();
    if (row.proposal_area == null || row.traveling) {
      return res.status(409).json({ error: "There's nothing to vote on right now." });
    }
    const view = await buildTravelView(req.user.sub);
    if (!view.canVote) return res.status(403).json({ error: "Only players with a character can vote." });

    await pool.query(
      `INSERT INTO travel_votes (user_id, vote) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET vote = $2`,
      [req.user.sub, vote === "yes"]
    );
    const outcome = await settleProposal();
    notifyTravelUpdated();
    if (outcome === "blocked") {
      return res.status(409).json({ error: "The ship's Nav Computer went offline, so the course was scrapped." });
    }
    res.json({ outcome });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not record your vote." });
  }
});

// Whoever proposed it (or the DM) can take a proposal back.
router.post("/withdraw", async (req, res) => {
  try {
    const row = await travelRow();
    if (row.proposal_area == null) return res.json({ ok: true });
    const isDm = req.user.role === "Dungeon Master";
    if (!isDm && row.proposer_id !== req.user.sub) {
      return res.status(403).json({ error: "Only the person who proposed it can withdraw it." });
    }
    await clearProposal();
    notifyTravelUpdated();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not withdraw the proposal." });
  }
});

// The DM can launch the journey without waiting for a vote -- the open
// proposal if there is one, or a destination of their own.
router.post("/depart", requireDungeonMaster, async (req, res) => {
  try {
    const row = await travelRow();
    if (row.traveling) return res.status(409).json({ error: "The ship is already under way." });
    const area = req.body?.area !== undefined ? Number(req.body.area) : row.proposal_area;
    if (!isValidArea(area)) return res.status(400).json({ error: "Pick a charted world to fly to." });
    if (area === (await partyArea())) return res.status(400).json({ error: "The party is already there." });
    if (!(await getActiveShip())) return res.status(409).json({ error: "The party has no ship to travel in." });
    const days = await startTravel(area);
    notifyTravelUpdated();
    res.json({ days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not launch the journey." });
  }
});

// Reveal a world's survey data to the players (or hide it again) without the
// party having to fly there.
router.post("/visited", requireDungeonMaster, async (req, res) => {
  const area = Number(req.body?.area);
  if (!isValidArea(area)) return res.status(400).json({ error: "That isn't a charted world." });
  try {
    if (req.body?.visited === false && area === (await partyArea())) {
      return res.status(409).json({ error: "The party is standing on that world, so it can't be hidden." });
    }
    await setVisited(area, req.body?.visited !== false);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the chart." });
  }
});

// Turn the ship around: the party is back where it set out from, docked.
router.post("/abort", requireDungeonMaster, async (req, res) => {
  try {
    await resetTravel();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not abort the journey." });
  }
});

export default router;
