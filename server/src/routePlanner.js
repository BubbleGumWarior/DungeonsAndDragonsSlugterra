// Route engine: turns "from this world to that one, on this day, in this ship"
// into normal-flight legs and gate jumps. Pure -- no DB. The physics of each
// flight leg is travelPhysics.computeFlight; this file only composes legs,
// adds the (configurable, visible) overheads and checks the gates.
//
// Route types (never mixed up):
//   INTRA_SYSTEM        station to station inside one star system.
//   GATE_NETWORK        through the gates: a world -> its system's gate -> jump
//                       -> that gate's twin on the Threshold's outskirts ->
//                       across the Threshold -> (the other system's gate ->
//                       jump -> its world). To or from The Threshold itself
//                       is one jump; system to system is always two, because
//                       every system's gate opens onto the Threshold.
//   DIRECT_INTERSTELLAR the same systems with no gates: light-years of normal
//                       flight. Information only -- never launched.
//
// Frame note: summing legs is a scheduling approximation (galactic frame, small
// gravitational clock offsets ignored). Gates are fictional stationary
// shortcuts synchronised to one network clock so they can't form time loops;
// that is a world rule, not established physics.

import { PHYSICS, computeFlight } from "./travelPhysics.js";
import {
  SYSTEMS,
  WORLDS,
  interstellarDistanceMeters,
  inSystemDistance,
  isThreshold,
  ntzGateToGateDistance,
  systemOf,
  thresholdToGateDistance,
  worldToGateDistance,
} from "./universe.js";

// Operational overheads, in seconds. Editable; every one shows up as its own
// line in a route's legs, never hidden inside a flight time.
//   flipAndAlignmentSeconds: per normal-flight leg -- clearing the station,
//     lining up the thrust axis, the midpoint flip on RCS, and the approach and
//     docking at the far end. A Thruster Array (RCS) cuts it.
//   gateQueueSeconds / jumpSeconds / inspectionSeconds: per gate, all 0 until
//     the setting defines them (the crossing itself is near-instant).
export const TRAVEL_OVERHEADS = Object.freeze({
  flipAndAlignmentSeconds: 2 * 3600,
  gateQueueSeconds: 0,
  jumpSeconds: 0,
  inspectionSeconds: 0,
});

const DAY = PHYSICS.DAY;

const gateName = (system) => `${SYSTEMS[system].name.replace(/^The /, "")} gate`;
const worldName = (area) => WORLDS[area]?.name ?? "Unknown";

// Default gate state: every gate open, the party cleared to use it.
export const OPEN_GATE = Object.freeze({ operational: true, authorized: true });

export function gateState(gates, system) {
  const g = gates?.[SYSTEMS[system]?.key] ?? {};
  return { operational: g.operational !== false, authorized: g.authorized !== false };
}

// The route's shape, before any physics: which world/gate/Threshold points it
// passes and which gates it jumps through.
function waypoints(from, to) {
  const a = systemOf(from);
  const b = systemOf(to);
  if (a !== null && a === b) return { type: "INTRA_SYSTEM", gates: [] };
  if (isThreshold(from)) return { type: "GATE_NETWORK", gates: [b] };
  if (isThreshold(to)) return { type: "GATE_NETWORK", gates: [a] };
  return { type: "GATE_NETWORK", gates: [a, b] };
}

// How many gate jumps a route takes (0, 1 or 2). Drives the Nav Computer's reach.
export const jumpsBetween = (from, to) => (from === to ? 0 : waypoints(from, to).gates.length);

// Plans a whole route. `departDay` is the campaign day the ship leaves on (its
// start); planet positions for each leg are taken when that leg begins.
// `drive` is { properAccelerationG, maxSpeedFractionC }; `flipCutPct` is the
// Thruster Array's cut to the per-leg flip-and-alignment overhead.
export function planRoute({ from, to, departDay, drive, gates = {}, flipCutPct = 0, overheads = TRAVEL_OVERHEADS }) {
  if (from === to) throw new RangeError("A route needs two different worlds");
  const shape = waypoints(from, to);
  const flipSeconds = overheads.flipAndAlignmentSeconds * (1 - Math.min(100, Math.max(0, flipCutPct)) / 100);

  const legs = [];
  let t = 0; // galactic seconds since the start of departDay
  let proper = 0;
  const dayAt = () => departDay + t / DAY;

  const fly = (label, distanceMeters) => {
    const flight = computeFlight(distanceMeters, drive);
    legs.push({ kind: "flight", label, startSeconds: t, distanceMeters, flight });
    t += flight.coordinateSeconds;
    proper += flight.shipProperSeconds;
    if (flipSeconds > 0) {
      legs.push({ kind: "overhead", label: "Flip, alignment and docking", startSeconds: t, seconds: flipSeconds });
      t += flipSeconds;
      proper += flipSeconds;
    }
  };
  const jump = (system, outbound) => {
    const { gateQueueSeconds, jumpSeconds, inspectionSeconds } = overheads;
    const seconds = gateQueueSeconds + jumpSeconds + inspectionSeconds;
    const label = outbound
      ? `Jump: ${gateName(system)} to its twin on the Threshold's outskirts`
      : `Jump: the Threshold's outskirts to the ${gateName(system)}`;
    legs.push({ kind: "jump", label, system, startSeconds: t, seconds, queueSeconds: gateQueueSeconds, jumpSeconds, inspectionSeconds });
    t += seconds;
    proper += seconds; // waiting at a gate is time at rest
  };

  if (shape.type === "INTRA_SYSTEM") {
    fly(`${worldName(from)} to ${worldName(to)}`, inSystemDistance(from, to, dayAt()));
  } else if (isThreshold(from)) {
    const [s] = shape.gates;
    fly(`Out of the Threshold to the ${gateName(s)}`, thresholdToGateDistance(s));
    jump(s, false);
    fly(`${gateName(s)} to ${worldName(to)}`, worldToGateDistance(to, dayAt()));
  } else if (isThreshold(to)) {
    const [s] = shape.gates;
    fly(`${worldName(from)} to the ${gateName(s)}`, worldToGateDistance(from, dayAt()));
    jump(s, true);
    fly(`Into the Threshold's debris field`, thresholdToGateDistance(s));
  } else {
    const [sa, sb] = shape.gates;
    fly(`${worldName(from)} to the ${gateName(sa)}`, worldToGateDistance(from, dayAt()));
    jump(sa, true);
    fly(`Across the Threshold to the ${gateName(sb)}'s twin`, ntzGateToGateDistance(sa, sb));
    jump(sb, false);
    fly(`${gateName(sb)} to ${worldName(to)}`, worldToGateDistance(to, dayAt()));
  }

  const blockedBy = [];
  for (const s of shape.gates) {
    const g = gateState(gates, s);
    if (!g.operational) blockedBy.push({ system: s, gate: gateName(s), reason: "offline" });
    else if (!g.authorized) blockedBy.push({ system: s, gate: gateName(s), reason: "unauthorized" });
  }

  const flights = legs.filter((l) => l.kind === "flight");
  return {
    routeType: shape.type,
    from,
    to,
    departDay,
    legs,
    jumps: shape.gates.length,
    gatesUsed: shape.gates,
    distanceMeters: flights.reduce((sum, l) => sum + l.distanceMeters, 0),
    peakSpeedFractionC: Math.max(...flights.map((l) => l.flight.peakSpeedFractionC)),
    coordinateSeconds: t,
    shipProperSeconds: proper,
    physicallyReachable: true,
    gateOperational: !blockedBy.some((b) => b.reason === "offline"),
    authorizedForTransit: !blockedBy.some((b) => b.reason === "unauthorized"),
    blockedBy,
    launchable: blockedBy.length === 0,
    // A long rest is a day: the voyage takes whole days, at least one.
    days: travelDaysFor(t),
  };
}

export function travelDaysFor(coordinateSeconds) {
  // A hair of tolerance so 3.0000000001 days doesn't become 4.
  return Math.max(1, Math.ceil(coordinateSeconds / DAY - 1e-9));
}

// The no-gates figure between two worlds in different star systems, for the
// dossier. null when it isn't defined (same system, or the Threshold, whose
// physical place in the galaxy isn't set).
export function directInterstellar(from, to, drive) {
  const a = systemOf(from);
  const b = systemOf(to);
  if (a === null || b === null || a === b) return null;
  const flight = computeFlight(interstellarDistanceMeters(a, b), drive);
  return { routeType: "DIRECT_INTERSTELLAR", from, to, ...flight };
}

// Which leg the ship is on, `elapsedSeconds` into a planned route.
export function legAt(route, elapsedSeconds) {
  const legs = route?.legs ?? [];
  let current = legs[0] ?? null;
  for (const leg of legs) if (leg.startSeconds <= elapsedSeconds) current = leg;
  return current;
}
