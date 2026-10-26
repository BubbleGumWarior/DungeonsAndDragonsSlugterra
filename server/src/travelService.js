import { pool } from "./db.js";
import { broadcastAll } from "./ws.js";
import {
  WORLD_COUNT,
  buildProgressPerRest,
  hasWorkingNavComputer,
  speedBreakdown,
  tallyVotes,
  travelDays,
  worldDistance,
} from "./shipRules.js";

// Bare "refetch" nudges, same single-slot-safe pattern as ship-updated: the
// client re-reads GET /api/travel rather than trusting a payload.
export function notifyTravelUpdated() {
  broadcastAll({ type: "travel-updated" });
}

export function notifyShipUpdated() {
  broadcastAll({ type: "ship-updated" });
}

export async function getActiveShip() {
  const { rows } = await pool.query(
    "SELECT s.* FROM ships s JOIN campaign_settings c ON c.active_ship_id = s.id WHERE c.id = 1"
  );
  return rows[0] ?? null;
}

async function getPartyArea() {
  const { rows } = await pool.query("SELECT slug_hunt_area FROM campaign_settings WHERE id = 1");
  return rows[0]?.slug_hunt_area ?? 0;
}

async function getTravelRow() {
  const { rows } = await pool.query("SELECT * FROM travel_state WHERE id = 1");
  return rows[0];
}

export async function isTraveling() {
  return Boolean((await getTravelRow())?.traveling);
}

// Records a world as visited (a no-op once it already is).
export async function markVisited(area) {
  await pool.query(
    `INSERT INTO visited_worlds (area, first_day)
     VALUES ($1, COALESCE((SELECT campaign_day FROM campaign_settings WHERE id = 1), 1))
     ON CONFLICT (area) DO NOTHING`,
    [area]
  );
}

// The world the party stands on has always been visited, even in a campaign
// that started before visits were tracked.
async function visitedAreas(currentArea) {
  await markVisited(currentArea);
  const { rows } = await pool.query("SELECT area FROM visited_worlds ORDER BY area");
  return rows.map((r) => r.area);
}

export async function setVisited(area, visited) {
  if (visited) await markVisited(area);
  else await pool.query("DELETE FROM visited_worlds WHERE area = $1", [area]);
  notifyTravelUpdated();
}

// Moves the party to a world. Landing somewhere new closes every market (the
// DM reopens the one they want) -- the same thing the DM's "send the party
// here" does.
export async function setPartyLocation(area) {
  const previous = await getPartyArea();
  await pool.query("UPDATE campaign_settings SET slug_hunt_area = $1 WHERE id = 1", [area]);
  await markVisited(area);
  if (previous !== area) {
    await pool.query("UPDATE planet_markets SET market_open = false WHERE market_open");
    broadcastAll({ type: "market-changed", at: Date.now() });
  }
  broadcastAll({ type: "slug-hunt-area", area });
}

export async function clearProposal() {
  await pool.query("UPDATE travel_state SET proposal_area = NULL, proposer_id = NULL WHERE id = 1");
  await pool.query("DELETE FROM travel_votes");
}

// Drops any voyage and open proposal, leaving the party docked where it is.
export async function resetTravel() {
  await pool.query(
    "UPDATE travel_state SET traveling = false, origin = NULL, destination = NULL, days_total = 0, days_left = 0 WHERE id = 1"
  );
  await clearProposal();
  notifyTravelUpdated();
}

// The players who get a say: everyone with a character who isn't the DM.
async function loadVoters() {
  const { rows } = await pool.query(
    `SELECT c.user_id, c.name FROM characters c JOIN users u ON u.id = c.user_id
     WHERE u.role <> 'Dungeon Master' ORDER BY c.name ASC`
  );
  return rows;
}

// The party can only plot a course while the active ship's Nav Computer is online.
export async function navComputerWorking() {
  const ship = await getActiveShip();
  return Boolean(ship) && hasWorkingNavComputer(ship.compartments);
}

export function shipSpeed(ship) {
  return speedBreakdown(ship ? { speed: ship.speed, compartments: ship.compartments } : null);
}

export async function startTravel(destination) {
  const origin = await getPartyArea();
  const speed = shipSpeed(await getActiveShip()).effective;
  const days = travelDays(worldDistance(origin, destination), speed);
  await pool.query(
    `UPDATE travel_state SET traveling = true, origin = $1, destination = $2, days_total = $3, days_left = $3,
       proposal_area = NULL, proposer_id = NULL WHERE id = 1`,
    [origin, destination, days]
  );
  await pool.query("DELETE FROM travel_votes");
  return days;
}

// Re-counts the open proposal's votes: a majority launches the journey, an
// unwinnable count throws the proposal out. Returns what happened.
export async function settleProposal() {
  const row = await getTravelRow();
  if (!row || row.proposal_area == null || row.traveling) return "none";
  const voters = await loadVoters();
  const ids = new Set(voters.map((v) => v.user_id));
  const { rows: votes } = await pool.query("SELECT user_id, vote FROM travel_votes");
  const counted = votes.filter((v) => ids.has(v.user_id));
  const yes = counted.filter((v) => v.vote).length;
  const no = counted.length - yes;
  const { outcome } = tallyVotes({ eligible: voters.length, yes, no });
  if (outcome === "passed") {
    // The Nav Computer can break while a vote is open; no course, no launch.
    if (!(await navComputerWorking())) {
      await clearProposal();
      return "blocked";
    }
    await startTravel(row.proposal_area);
  } else if (outcome === "failed") {
    await clearProposal();
  }
  return outcome;
}

// Everything the Galaxy Map's voting panel needs, tailored to who is asking.
export async function buildTravelView(userId) {
  const [row, area, ship, voters] = await Promise.all([
    getTravelRow(),
    getPartyArea(),
    getActiveShip(),
    loadVoters(),
  ]);
  const { rows: dayRows } = await pool.query("SELECT campaign_day FROM campaign_settings WHERE id = 1");
  const speed = shipSpeed(ship);

  let proposal = null;
  let myVote = null;
  if (row.proposal_area != null && !row.traveling) {
    const { rows: votes } = await pool.query("SELECT user_id, vote FROM travel_votes");
    const byUser = new Map(votes.map((v) => [v.user_id, v.vote]));
    const yes = voters.filter((v) => byUser.get(v.user_id) === true).map((v) => v.name);
    const no = voters.filter((v) => byUser.get(v.user_id) === false).map((v) => v.name);
    const waiting = voters.filter((v) => !byUser.has(v.user_id)).map((v) => v.name);
    const proposer = voters.find((v) => v.user_id === row.proposer_id);
    const distance = worldDistance(area, row.proposal_area);
    proposal = {
      area: row.proposal_area,
      proposerId: row.proposer_id,
      proposerName: proposer?.name ?? null,
      mine: row.proposer_id === userId,
      yes,
      no,
      waiting,
      needed: tallyVotes({ eligible: voters.length, yes: 0, no: 0 }).needed,
      eligible: voters.length,
      distance,
      days: travelDays(distance, speed.effective),
    };
    myVote = byUser.has(userId) ? byUser.get(userId) : null;
  }

  const routes = [];
  if (!row.traveling) {
    for (let to = 0; to < WORLD_COUNT; to++) {
      if (to === area) continue;
      const distance = worldDistance(area, to);
      routes.push({ area: to, distance, days: travelDays(distance, speed.effective) });
    }
  }

  return {
    day: dayRows[0]?.campaign_day ?? 1,
    area,
    visited: await visitedAreas(area),
    traveling: row.traveling,
    origin: row.origin,
    destination: row.destination,
    daysTotal: row.days_total,
    daysLeft: row.days_left,
    ship: ship ? { id: ship.id, name: ship.name, ...speed } : null,
    navReady: Boolean(ship) && hasWorkingNavComputer(ship.compartments),
    proposal,
    myVote,
    canVote: voters.some((v) => v.user_id === userId),
    routes,
  };
}

// One long rest = one day. Moves the calendar, the voyage and every building
// compartment on. Called from the long-rest route; returns what the sleep
// overlay should report.
export async function advanceDay() {
  const { rows: dayRows } = await pool.query(
    "UPDATE campaign_settings SET campaign_day = campaign_day + 1 WHERE id = 1 RETURNING campaign_day"
  );
  const day = dayRows[0]?.campaign_day ?? 1;
  const travelRow = await getTravelRow();
  const traveling = Boolean(travelRow?.traveling);

  // Builds: docked, the dockyard works one day on each; under way, only an
  // engineer assigned to a compartment moves it forward.
  const builds = [];
  const ship = await getActiveShip();
  if (ship && Array.isArray(ship.compartments)) {
    let changed = false;
    const next = ship.compartments.map((c) => {
      if (c?.status !== "building") return c;
      const engineers = Array.isArray(c.engineers) ? c.engineers : [];
      const gain = buildProgressPerRest({ traveling, engineerCount: engineers.length });
      const buildDays = Math.max(1, Number(c.buildDays) || 1);
      if (gain <= 0) {
        builds.push({ label: c.label, progress: c.progressDays || 0, buildDays, stalled: true });
        return c;
      }
      changed = true;
      const progress = (Number(c.progressDays) || 0) + gain;
      if (progress >= buildDays) {
        builds.push({ label: c.label, progress: buildDays, buildDays, completed: true });
        return { ...c, status: "online", progressDays: 0, engineers: [] };
      }
      builds.push({ label: c.label, progress, buildDays });
      return { ...c, progressDays: progress };
    });
    if (changed) {
      await pool.query("UPDATE ships SET compartments = $1::jsonb WHERE id = $2", [JSON.stringify(next), ship.id]);
      notifyShipUpdated();
    }
  }

  let travel = { status: "docked" };
  if (traveling) {
    const left = Math.max(0, travelRow.days_left - 1);
    if (left === 0) {
      const destination = travelRow.destination;
      await pool.query(
        "UPDATE travel_state SET traveling = false, origin = NULL, destination = NULL, days_total = 0, days_left = 0 WHERE id = 1"
      );
      await setPartyLocation(destination);
      travel = { status: "arrived", destination };
    } else {
      await pool.query("UPDATE travel_state SET days_left = $1 WHERE id = 1", [left]);
      travel = { status: "underway", destination: travelRow.destination, daysLeft: left, daysTotal: travelRow.days_total };
    }
  }

  notifyTravelUpdated();
  return { day, builds, travel };
}
