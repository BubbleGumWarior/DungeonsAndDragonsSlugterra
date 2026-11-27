import { pool } from "./db.js";
import { broadcastAll } from "./ws.js";
import {
  WORLD_COUNT,
  buildProgressPerRest,
  driveBreakdown,
  hasWorkingNavComputer,
  navCanReach,
  routeRange,
  shipEffects,
  tallyVotes,
  tierAccelBonus,
} from "./shipRules.js";
import { directInterstellar, gateState, legAt, planRoute } from "./routePlanner.js";
import { PHYSICS } from "./travelPhysics.js";
import { SYSTEMS, THRESHOLD_AREA } from "./universe.js";

// Bare "refetch" nudges, same single-slot-safe pattern as ship-updated: the
// client re-reads GET /api/travel rather than trusting a payload.
export function notifyTravelUpdated() {
  broadcastAll({ type: "travel-updated" });
}

export function notifyShipUpdated() {
  invalidateShipEffects();
  broadcastAll({ type: "ship-updated" });
}

export async function getActiveShip() {
  const { rows } = await pool.query(
    "SELECT s.* FROM ships s JOIN campaign_settings c ON c.active_ship_id = s.id WHERE c.id = 1"
  );
  return rows[0] ?? null;
}

// What the active ship's online compartments give the crew right now. Combat asks
// on every shot, so it is cached briefly; anything that changes a ship calls
// invalidateShipEffects (notifyShipUpdated does), and the short expiry is a backstop.
const EFFECTS_TTL_MS = 3000;
let effectsCache = null;

export function invalidateShipEffects() {
  effectsCache = null;
}

export async function getShipEffects() {
  if (effectsCache && Date.now() - effectsCache.at < EFFECTS_TTL_MS) return effectsCache.value;
  const ship = await getActiveShip();
  const value = shipEffects(ship?.compartments);
  effectsCache = { at: Date.now(), value };
  return value;
}

// The party's shared ship supplies, one counter per grade (see SUPPLY_GRADES).
// Pass a transaction client as `db` and `lock` to read them for update.
export async function loadStores(db = pool, lock = false) {
  const { rows } = await db.query(
    `SELECT ship_parts, ship_components, ship_cores FROM campaign_settings WHERE id = 1${lock ? " FOR UPDATE" : ""}`
  );
  const r = rows[0] ?? {};
  return { parts: r.ship_parts ?? 0, components: r.ship_components ?? 0, cores: r.ship_cores ?? 0 };
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
    "UPDATE travel_state SET traveling = false, origin = NULL, destination = NULL, days_total = 0, days_left = 0, route = NULL WHERE id = 1"
  );
  await clearProposal();
  notifyTravelUpdated();
}

// The players who get a say: everyone with a character whose role is Player
// (never the DM or a DM Assistant).
async function loadVoters() {
  const { rows } = await pool.query(
    `SELECT c.user_id, c.name FROM characters c JOIN users u ON u.id = c.user_id
     WHERE u.role = 'Player' ORDER BY c.name ASC`
  );
  return rows;
}

// The party can only plot a course while the active ship's Nav Computer is online.
export async function navComputerWorking() {
  const ship = await getActiveShip();
  return Boolean(ship) && hasWorkingNavComputer(ship.compartments);
}

// The Nav Computer's reach: "none" without a working one, else how far it charts.
export async function navReach() {
  const ship = await getActiveShip();
  const fx = shipEffects(ship?.compartments);
  return { working: Boolean(ship) && hasWorkingNavComputer(ship.compartments), range: fx.navRange, tier: fx.navTier };
}

// The active ship's Veylan Drive: class, ratings and what compartments add.
export function shipDrive(ship) {
  return driveBreakdown(
    ship
      ? { shipClass: ship.ship_class, accelG: ship.accel_g, maxSpeedC: ship.max_speed_c, compartments: ship.compartments }
      : null
  );
}

async function getCampaignDay() {
  const { rows } = await pool.query("SELECT campaign_day FROM campaign_settings WHERE id = 1");
  return rows[0]?.campaign_day ?? 1;
}

// The DM's gate state: { threxa: { operational, authorized }, ... }. Missing
// means open and cleared.
export async function getGates() {
  const { rows } = await pool.query("SELECT gate_status FROM campaign_settings WHERE id = 1");
  return rows[0]?.gate_status ?? {};
}

export async function setGate(systemKey, patch) {
  const gates = await getGates();
  const current = gates[systemKey] ?? {};
  const next = { ...current };
  if (typeof patch.operational === "boolean") next.operational = patch.operational;
  if (typeof patch.authorized === "boolean") next.authorized = patch.authorized;
  await pool.query("UPDATE campaign_settings SET gate_status = $1::jsonb WHERE id = 1", [
    JSON.stringify({ ...gates, [systemKey]: next }),
  ]);
  notifyTravelUpdated();
}

// The full route plan from one world to another, leaving on `day`.
export function planFor({ from, to, day, ship, gates }) {
  const drive = shipDrive(ship);
  return planRoute({ from, to, departDay: day, drive: drive.drive, gates, flipCutPct: drive.flipCutPct });
}

// What the client needs of a plan: the legs without the solver's internals.
function routeSummary(route) {
  return {
    routeType: route.routeType,
    days: route.days,
    jumps: route.jumps,
    coordinateSeconds: route.coordinateSeconds,
    shipProperSeconds: route.shipProperSeconds,
    distanceMeters: route.distanceMeters,
    peakSpeedFractionC: route.peakSpeedFractionC,
    launchable: route.launchable,
    blockedBy: route.blockedBy,
    legs: route.legs.map((l) => ({
      kind: l.kind,
      label: l.label,
      startSeconds: l.startSeconds,
      seconds: l.flight ? l.flight.coordinateSeconds : l.seconds,
      properSeconds: l.flight ? l.flight.shipProperSeconds : l.seconds,
      distanceMeters: l.distanceMeters ?? null,
      peakSpeedFractionC: l.flight?.peakSpeedFractionC ?? null,
    })),
  };
}

// The no-gates figure, as information only.
function directSummary(from, to, ship) {
  const d = directInterstellar(from, to, shipDrive(ship).drive);
  if (!d) return null;
  return {
    routeType: d.routeType,
    distanceMeters: d.distanceMeters,
    coordinateSeconds: d.coordinateSeconds,
    shipProperSeconds: d.shipProperSeconds,
    peakSpeedFractionC: d.peakSpeedFractionC,
    reachedSpeedCap: d.reachedSpeedCap,
  };
}

// Why a route can't be launched right now, in words, or null if it can.
export function routeBlockedReason(route) {
  const b = route?.blockedBy?.[0];
  if (!b) return null;
  return b.reason === "offline"
    ? `The ${b.gate} is shut down, so the course can't go through it.`
    : `The ${b.gate}'s control station hasn't cleared the ship to jump.`;
}

// Plans the voyage from where the party is and sets it going. Returns the plan.
export async function startTravel(destination) {
  const [origin, ship, gates, day] = await Promise.all([getPartyArea(), getActiveShip(), getGates(), getCampaignDay()]);
  const route = planFor({ from: origin, to: destination, day, ship, gates });
  await pool.query(
    `UPDATE travel_state SET traveling = true, origin = $1, destination = $2, days_total = $3, days_left = $3,
       route = $4::jsonb, proposal_area = NULL, proposer_id = NULL WHERE id = 1`,
    [origin, destination, route.days, JSON.stringify(routeSummary(route))]
  );
  await pool.query("DELETE FROM travel_votes");
  return route;
}

// The plan the party would fly right now, for the propose / launch checks.
export async function currentPlan(destination) {
  const [origin, ship, gates, day] = await Promise.all([getPartyArea(), getActiveShip(), getGates(), getCampaignDay()]);
  return planFor({ from: origin, to: destination, day, ship, gates });
}

// What the deck feels like aboard: no artificial gravity. Under way the Veylan
// Drive is always burning (accelerating, then braking after the flip) so the
// crew feels its thrust; docked at a station, the world's own gravity (null,
// which atmosphereRules reads as "the world's").
export async function aboardGravityG() {
  if (!(await isTraveling())) return null;
  return shipDrive(await getActiveShip()).accelG;
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
    // (The DM can also have changed its tier since the course was put up.)
    const reach = await navReach();
    if (!reach.working || !navCanReach(reach.range, await getPartyArea(), row.proposal_area)) {
      await clearProposal();
      return "blocked";
    }
    // A gate can close (or clearance be pulled) while the vote is open.
    if (!(await currentPlan(row.proposal_area)).launchable) {
      await clearProposal();
      return "gate-closed";
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
  const [day, gates] = await Promise.all([getCampaignDay(), getGates()]);
  const drive = shipDrive(ship);
  const plan = (to) => routeSummary(planFor({ from: area, to, day, ship, gates }));

  let proposal = null;
  let myVote = null;
  if (row.proposal_area != null && !row.traveling) {
    const { rows: votes } = await pool.query("SELECT user_id, vote FROM travel_votes");
    const byUser = new Map(votes.map((v) => [v.user_id, v.vote]));
    const yes = voters.filter((v) => byUser.get(v.user_id) === true).map((v) => v.name);
    const no = voters.filter((v) => byUser.get(v.user_id) === false).map((v) => v.name);
    const waiting = voters.filter((v) => !byUser.has(v.user_id)).map((v) => v.name);
    const proposer = voters.find((v) => v.user_id === row.proposer_id);
    const route = plan(row.proposal_area);
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
      days: route.days,
      route,
    };
    myVote = byUser.has(userId) ? byUser.get(userId) : null;
  }

  const fx = shipEffects(ship?.compartments);
  const routes = [];
  if (!row.traveling) {
    for (let to = 0; to < WORLD_COUNT; to++) {
      if (to === area) continue;
      const route = plan(to);
      routes.push({
        area: to,
        ...route,
        range: routeRange(area, to),
        reachable: navCanReach(fx.navRange, area, to),
        direct: directSummary(area, to, ship),
      });
    }
  }

  // Under way: which leg of the planned route the ship is on today.
  let voyage = null;
  if (row.traveling && row.route) {
    const elapsed = (row.days_total - row.days_left) * PHYSICS.DAY;
    const leg = legAt(row.route, elapsed);
    voyage = { ...row.route, currentLeg: leg ? row.route.legs.indexOf(leg) : null };
  }

  return {
    day,
    area,
    visited: await visitedAreas(area),
    traveling: row.traveling,
    origin: row.origin,
    destination: row.destination,
    daysTotal: row.days_total,
    daysLeft: row.days_left,
    voyage,
    ship: ship ? { id: ship.id, name: ship.name, ...drive } : null,
    gates: SYSTEMS.map((sys, i) => ({
      system: i,
      key: sys.key,
      name: sys.name,
      angleDeg: sys.gateAngleDeg,
      radiusAU: sys.gateRadiusAU,
      ...gateState(gates, i),
    })),
    thresholdArea: THRESHOLD_AREA,
    navReady: Boolean(ship) && hasWorkingNavComputer(ship.compartments),
    navRange: fx.navRange,
    navTier: fx.navTier,
    surveyTier: fx.surveyTier,
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
      // A new build, or an online compartment being lifted to its next tier. The
      // second keeps working at its old tier until the upgrade lands.
      const upgrading = c?.status === "online" && c.upgradingTo;
      if (c?.status !== "building" && !upgrading) return c;
      const note = upgrading ? { upgrade: true, tier: c.upgradingTo } : {};
      const engineers = Array.isArray(c.engineers) ? c.engineers : [];
      const gain = buildProgressPerRest({ traveling, engineerCount: engineers.length });
      const buildDays = Math.max(1, Number(c.buildDays) || 1);
      if (gain <= 0) {
        builds.push({ label: c.label, progress: c.progressDays || 0, buildDays, stalled: true, ...note });
        return c;
      }
      changed = true;
      const progress = (Number(c.progressDays) || 0) + gain;
      if (progress >= buildDays) {
        builds.push({ label: c.label, progress: buildDays, buildDays, completed: true, ...note });
        if (upgrading) {
          return {
            ...c,
            tier: c.upgradingTo,
            upgradingTo: null,
            accelBonusG: tierAccelBonus(c.templateKey, c.upgradingTo, c.accelBonusG),
            progressDays: 0,
            engineers: [],
          };
        }
        return { ...c, status: "online", progressDays: 0, engineers: [] };
      }
      builds.push({ label: c.label, progress, buildDays, ...note });
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
        "UPDATE travel_state SET traveling = false, origin = NULL, destination = NULL, days_total = 0, days_left = 0, route = NULL WHERE id = 1"
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
