// The universe's geography for travel: three star systems, each with one fixed
// jump gate, and the Threshold -- the debris field in open space whose
// outskirts hold each system's matching gate. Pure data and geometry, SI units.
//
// Every number here is a PROPOSED, editable worldbuilding value, not canon
// astronomy. The orbital radii are not typed in: they come from each world's
// year length (`yearDays`, shared with client/src/planetData.js) and its star's
// mass by Kepler's third law, so the radius and the year always agree.
//
// Gates never move. Planets do: a world's place on its orbit is a function of
// the campaign day (same rule the Galaxy Map draws), so the distance between
// two worlds -- and the trip -- changes as they swing round their star.
//
// Ships dock at each world's orbiting station; there is no launch or landing.
// Travel is planned station-to-station (rest-to-rest in the shared frame).

import { PHYSICS } from "./travelPhysics.js";

const { AU, KM } = PHYSICS;

// The three systems, in planetData.js CLUSTERS order. `starMassSolar` drives the
// orbital radii (a binary counts both stars). The gate sits at a fixed point in
// the system's orbital plane: `gateRadiusAU` from the star, at `gateAngleDeg`
// (same angle convention as the worlds' phaseDeg).
export const SYSTEMS = [
  { key: "threxa", name: "The Threxa Combine", starMassSolar: 1.0, gateRadiusAU: 1.2, gateAngleDeg: 235 },
  { key: "verrin", name: "The Verrin Concord", starMassSolar: 1.6, gateRadiusAU: 1.2, gateAngleDeg: 95 },
  { key: "kaeth", name: "The Kaeth Dominion", starMassSolar: 3.0, gateRadiusAU: 1.5, gateAngleDeg: 340 },
];

// The Threshold's own "system" key: not a star system, the open space between.
export const THRESHOLD_KEY = "threshold";

// Every charted world in the flat slug_hunt_area order (mirrors planetData.js:
// the name, yearDays and phaseDeg must match -- scripts/travel-check.mjs checks).
// `system` is an index into SYSTEMS, or null for The Threshold.
export const WORLDS = [
  { name: "Cindrath", system: 0, yearDays: 62, phaseDeg: 140 },
  { name: "Pyrsis Barrens", system: 0, yearDays: 98, phaseDeg: 80 },
  { name: "Ashfall Rift", system: 0, yearDays: 140, phaseDeg: 260 },
  { name: "Vorn's Forge", system: 0, yearDays: 190, phaseDeg: 320 },
  { name: "The Wellspring", system: 0, yearDays: 255, phaseDeg: 200 },
  { name: "Kessa-9", system: 0, yearDays: 340, phaseDeg: 20 },
  { name: "Virid Canopy", system: 1, yearDays: 70, phaseDeg: 170 },
  { name: "Solenne", system: 1, yearDays: 115, phaseDeg: 250 },
  { name: "Maren's Deep", system: 1, yearDays: 165, phaseDeg: 10 },
  { name: "Aurelia Docks", system: 1, yearDays: 215, phaseDeg: 130 },
  { name: "Kethrun Reach", system: 1, yearDays: 275, phaseDeg: 40 },
  { name: "Marrek's Hold", system: 2, yearDays: 80, phaseDeg: 190 },
  { name: "Drennow Yards", system: 2, yearDays: 125, phaseDeg: 60 },
  { name: "Vhalden", system: 2, yearDays: 180, phaseDeg: 150 },
  { name: "Ossuary Station", system: 2, yearDays: 235, phaseDeg: 20 },
  { name: "Kaeloth Prime", system: 2, yearDays: 300, phaseDeg: 300 },
  { name: "The Threshold", system: null, yearDays: null, phaseDeg: null },
];

export const WORLD_COUNT = WORLDS.length;
export const THRESHOLD_AREA = WORLDS.findIndex((w) => w.system === null);

// ---- The Threshold (Neutral Transit Zone) ------------------------------------
// Ordinary open space. Three gates sit on its outskirts, one per system, each
// run by that system's own control station; the debris field drifts between
// them. Proposed layout: the gates form an equilateral triangle with 4,000,000
// km sides (the spec's illustrative gate-to-gate distance) and the debris
// field's heart sits at the middle. Coordinates in metres, in the Threshold's
// own plane. Gates never move.
export const NTZ_GATE_SPACING_M = 4_000_000 * KM;
const NTZ_CIRCUMRADIUS_M = NTZ_GATE_SPACING_M / Math.sqrt(3);
export const NTZ_GATES = SYSTEMS.map((s, i) => {
  const angle = (Math.PI / 2) + (i * 2 * Math.PI) / SYSTEMS.length;
  return { system: i, x: NTZ_CIRCUMRADIUS_M * Math.cos(angle), y: NTZ_CIRCUMRADIUS_M * Math.sin(angle) };
});
export const THRESHOLD_CORE = { x: 0, y: 0 };

// ---- Direct interstellar distances (information only) -------------------------
// Light-years between the systems themselves, for the "what if there were no
// gates" figure. Provisional, editable. Where the Threshold physically lies is
// not defined, so it has no direct distance.
export const INTERSTELLAR_LY = { "0:1": 4, "1:2": 5, "0:2": 6 };

export function interstellarDistanceMeters(a, b) {
  if (a === b) return 0;
  const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
  const ly = INTERSTELLAR_LY[key];
  if (ly === undefined) throw new Error(`Missing system distance: ${key}`);
  return ly * PHYSICS.LY;
}

// ---- Geometry ----------------------------------------------------------------

// Kepler's third law: a[AU] = cbrt(M[solar] * P[years]^2).
export function orbitRadiusAU(world) {
  if (world?.system == null || !world.yearDays) return null;
  const years = world.yearDays / 365.25;
  return Math.cbrt(SYSTEMS[world.system].starMassSolar * years * years);
}

const toRad = (deg) => (deg * Math.PI) / 180;

// A world's angle on its orbit at a campaign day (day 1 = phaseDeg; fractional
// days allowed), the same rule GalaxyMap.jsx's planetPos uses.
export function orbitAngleDeg(world, day) {
  return world.phaseDeg + ((day - 1) / world.yearDays) * 360;
}

// Where a world's station is, in metres from its star, on a campaign day.
export function worldPosition(area, day) {
  const world = WORLDS[area];
  const r = orbitRadiusAU(world) * AU;
  const t = toRad(orbitAngleDeg(world, day));
  return { x: r * Math.cos(t), y: r * Math.sin(t) };
}

// Where a system's gate is, in metres from its star. Fixed.
export function gatePosition(system) {
  const s = SYSTEMS[system];
  const t = toRad(s.gateAngleDeg);
  return { x: s.gateRadiusAU * AU * Math.cos(t), y: s.gateRadiusAU * AU * Math.sin(t) };
}

export const pointDistance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

export const systemOf = (area) => WORLDS[area]?.system ?? null;
export const isThreshold = (area) => area === THRESHOLD_AREA;
export const isValidArea = (area) => Number.isInteger(area) && area >= 0 && area < WORLD_COUNT;

// Distance between two worlds of one system on a campaign day.
export function inSystemDistance(from, to, day) {
  return pointDistance(worldPosition(from, day), worldPosition(to, day));
}

// From a world's station to its system's gate on a campaign day.
export function worldToGateDistance(area, day) {
  return pointDistance(worldPosition(area, day), gatePosition(systemOf(area)));
}

// Across the Threshold between two systems' outskirts gates.
export function ntzGateToGateDistance(a, b) {
  return pointDistance(NTZ_GATES[a], NTZ_GATES[b]);
}

// From the debris field's heart to a system's gate on the outskirts.
export function thresholdToGateDistance(system) {
  return pointDistance(THRESHOLD_CORE, NTZ_GATES[system]);
}
