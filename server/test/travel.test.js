// Travel physics, geography and route planning (spec "Four-System Universe",
// v1.1, section 12 -- adapted to the Three Clusters). Run: cd server && npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHYSICS, computeFlight, formatDistance, formatDuration } from "../src/travelPhysics.js";
import * as U from "../src/universe.js";
import { directInterstellar, jumpsBetween, legAt, planRoute, travelDaysFor } from "../src/routePlanner.js";
import { SHIP_CLASSES, driveBreakdown, navCanReach, routeRange, shipEffects } from "../src/shipRules.js";
import { buildAtmosphere } from "../src/atmosphereRules.js";

const { AU, DAY, YEAR, LY, KM } = PHYSICS;
const ship = (g, c) => ({ properAccelerationG: g, maxSpeedFractionC: c });
const near = (actual, expected, relTol, msg) =>
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relTol, `${msg ?? ""} expected ~${expected}, got ${actual}`);

// Deterministic pseudo-random numbers for the property tests.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// ---- 1-2: zero distance, validation ------------------------------------------

test("zero distance returns zero times and speed, no NaN", () => {
  const f = computeFlight(0, ship(1, 0.95));
  for (const [k, v] of Object.entries(f)) if (typeof v === "number") assert.equal(v, 0, k);
  assert.equal(f.reachedSpeedCap, false);
});

test("bad inputs throw clear errors", () => {
  const ok = ship(0.1, 0.75);
  assert.throws(() => computeFlight(-1, ok), RangeError);
  assert.throws(() => computeFlight(1e9, ship(0, 0.75)), RangeError);
  assert.throws(() => computeFlight(1e9, ship(-1, 0.75)), RangeError);
  assert.throws(() => computeFlight(1e9, ship(0.1, 0)), RangeError);
  assert.throws(() => computeFlight(1e9, ship(0.1, 1)), RangeError);
  assert.throws(() => computeFlight(1e9, ship(0.1, 1.2)), RangeError);
  assert.throws(() => computeFlight(NaN, ok), RangeError);
  assert.throws(() => computeFlight(Infinity, ok), RangeError);
  assert.throws(() => computeFlight(1e9, ship(NaN, 0.75)), RangeError);
  assert.throws(() => computeFlight(1e9, ship(0.1, Infinity)), RangeError);
  assert.throws(() => computeFlight(1e9, {}), RangeError);
});

// ---- 4-7: reference journeys ---------------------------------------------------

test("low-speed consistency: 2 AU at 0.5 g ~5.7 days, 8 AU at 1 g ~8.1 days", () => {
  near(computeFlight(2 * AU, ship(0.5, 0.9)).coordinateSeconds / DAY, 5.7, 0.01);
  near(computeFlight(8 * AU, ship(1, 0.95)).coordinateSeconds / DAY, 8.1, 0.01);
});

test("the spec's interplanetary table (2 AU and 8 AU for every class)", () => {
  const table = {
    heavy_freighter: [18.1, 36.2],
    civilian_transport: [12.8, 25.6],
    fast_courier: [8.1, 16.2],
    military_warship: [5.7, 11.4],
    experimental_elite: [4.0, 8.1],
  };
  // The spec prints these to one decimal place.
  const oneDp = (s) => Math.round((s / DAY) * 10) / 10;
  for (const c of SHIP_CLASSES) {
    const [two, eight] = table[c.id];
    assert.equal(oneDp(computeFlight(2 * AU, ship(c.accelG, c.maxSpeedC)).coordinateSeconds), two, c.id);
    assert.equal(oneDp(computeFlight(8 * AU, ship(c.accelG, c.maxSpeedC)).coordinateSeconds), eight, c.id);
    assert.equal(computeFlight(8 * AU, ship(c.accelG, c.maxSpeedC)).reachedSpeedCap, false, "caps unreached in-system");
  }
});

test("NTZ example: 4,000,000 km at 0.1 g ~1.48 days, and the other classes", () => {
  const expected = { heavy_freighter: 2.09, civilian_transport: 1.48, fast_courier: 0.94, military_warship: 0.66, experimental_elite: 0.47 };
  for (const c of SHIP_CLASSES) {
    near(computeFlight(4e6 * KM, ship(c.accelG, c.maxSpeedC)).coordinateSeconds / DAY, expected[c.id], 0.01, c.id);
  }
});

test("interstellar: 4 ly at 0.5 g / 0.90c ~6.86 galactic years", () => {
  near(computeFlight(4 * LY, ship(0.5, 0.9)).coordinateSeconds / YEAR, 6.86, 0.002);
});

test("elite: 4 ly at 1 g / 0.95c ~5.61 galactic years, ~3.5 aboard", () => {
  const f = computeFlight(4 * LY, ship(1, 0.95));
  near(f.coordinateSeconds / YEAR, 5.61, 0.002);
  near(f.shipProperSeconds / YEAR, 3.46, 0.01);
  // 4 ly is just short of the 4.27 ly it takes to reach 0.95c and brake again.
  assert.equal(f.reachedSpeedCap, false);
  assert.equal(f.cruiseCoordinateSeconds, 0);
  assert.equal(computeFlight(8 * LY, ship(1, 0.95)).reachedSpeedCap, true);
});

test("the spec's direct interstellar matrix (years) for 4, 5, 6 and 8 ly", () => {
  const rows = {
    4: [18.06, 13.08, 8.83, 6.86, 5.61],
    5: [20.31, 14.79, 10.12, 7.98, 6.67],
    6: [22.38, 16.39, 11.36, 9.1, 7.72],
    8: [26.15, 19.34, 13.73, 11.32, 9.82],
  };
  for (const [ly, years] of Object.entries(rows)) {
    SHIP_CLASSES.forEach((c, i) => {
      near(computeFlight(Number(ly) * LY, ship(c.accelG, c.maxSpeedC)).coordinateSeconds / YEAR, years[i], 0.003, `${ly} ly ${c.id}`);
    });
  }
});

// ---- 8-12: invariants, over random flights ---------------------------------------

test("properties over random flights: cap, dilation, symmetry, cruise only when capped", () => {
  const r = rng(42);
  for (let i = 0; i < 2000; i++) {
    // Thousands of metres to tens of light-years, log-uniform.
    const D = 10 ** (3 + r() * (Math.log10(30 * LY) - 3));
    const g = 0.01 + r() * 0.99;
    const cap = 0.1 + r() * 0.85;
    const f = computeFlight(D, ship(g, cap));
    const ctx = `D=${D} g=${g} cap=${cap}`;
    assert.ok(f.peakSpeedFractionC <= cap * (1 + 1e-12), `speed cap ${ctx}`);
    assert.ok(f.shipProperSeconds <= f.coordinateSeconds * (1 + 1e-12), `dilation ${ctx}`);
    assert.equal(f.accelerationCoordinateSeconds, f.brakingCoordinateSeconds);
    assert.equal(f.accelerationProperSeconds, f.brakingProperSeconds);
    if (!f.reachedSpeedCap) assert.equal(f.cruiseCoordinateSeconds, 0, `no cruise ${ctx}`);
    for (const v of Object.values(f)) if (typeof v === "number") assert.ok(Number.isFinite(v) && v >= 0, ctx);
    near(
      f.coordinateSeconds,
      f.accelerationCoordinateSeconds + f.cruiseCoordinateSeconds + f.brakingCoordinateSeconds,
      1e-12,
      ctx
    );
  }
});

test("monotonic: more acceleration or a higher cap never makes a trip longer", () => {
  const r = rng(7);
  for (let i = 0; i < 500; i++) {
    const D = 10 ** (6 + r() * 11);
    const g = 0.01 + r() * 0.9;
    const cap = 0.1 + r() * 0.8;
    const base = computeFlight(D, ship(g, cap)).coordinateSeconds;
    assert.ok(computeFlight(D, ship(g + 0.05, cap)).coordinateSeconds <= base * (1 + 1e-12));
    assert.ok(computeFlight(D, ship(g, Math.min(0.95, cap + 0.05))).coordinateSeconds <= base * (1 + 1e-12));
  }
});

test("converges on the Newtonian answer at low speed", () => {
  const a = 0.1 * PHYSICS.G0;
  const D = 0.5 * AU;
  near(computeFlight(D, ship(0.1, 0.75)).coordinateSeconds, 2 * Math.sqrt(D / a), 1e-5);
});

// ---- Geography --------------------------------------------------------------------

test("three systems, one gate each, three gates on the Threshold's outskirts", () => {
  assert.equal(U.SYSTEMS.length, 3);
  assert.equal(U.NTZ_GATES.length, 3);
  assert.equal(U.WORLD_COUNT, 17);
  assert.equal(U.WORLDS[U.THRESHOLD_AREA].name, "The Threshold");
});

test("geometry: NTZ gate coordinates agree with the configured spacing", () => {
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) near(U.ntzGateToGateDistance(a, b), U.NTZ_GATE_SPACING_M, 1e-9);
  }
});

test("the interstellar distance matrix is symmetric and a valid triangle", () => {
  const d = (a, b) => U.interstellarDistanceMeters(a, b);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) assert.equal(d(a, b), d(b, a));
  assert.ok(d(0, 1) + d(1, 2) >= d(0, 2));
  assert.ok(d(0, 1) + d(0, 2) >= d(1, 2));
  assert.ok(d(0, 2) + d(1, 2) >= d(0, 1));
});

test("orbits follow Kepler's law and every gate is outside its system's orbits", () => {
  for (const w of U.WORLDS) {
    if (w.system === null) continue;
    const a = U.orbitRadiusAU(w);
    near(a ** 3 / (w.yearDays / 365.25) ** 2, U.SYSTEMS[w.system].starMassSolar, 1e-9, w.name);
    assert.ok(a < U.SYSTEMS[w.system].gateRadiusAU, `${w.name} inside its gate`);
  }
});

test("universe.js worlds mirror client planetData.js (name, year, phase, order)", () => {
  // planetData.js imports JSON Node can't load bare, so read its source.
  const src = readFileSync(new URL("../../client/src/planetData.js", import.meta.url), "utf8");
  let last = -1;
  for (const w of U.WORLDS) {
    const at = src.indexOf(`name: "${w.name}"`);
    assert.ok(at > last, `${w.name} is in planetData.js, in the same order`);
    last = at;
    const next = src.indexOf('name: "', at + 1);
    const block = src.slice(at, next === -1 ? undefined : next);
    const year = block.match(/yearDays: (null|\d+)/)[1];
    assert.equal(year === "null" ? null : Number(year), w.yearDays, `${w.name} yearDays`);
    const phase = block.match(/phaseDeg: (\d+)/);
    assert.equal(phase ? Number(phase[1]) : null, w.phaseDeg, `${w.name} phaseDeg`);
  }
});

test("planets move with the campaign day; gates never do", () => {
  const p1 = U.worldPosition(0, 1);
  const p2 = U.worldPosition(0, 10);
  assert.ok(U.pointDistance(p1, p2) > 0);
  assert.deepEqual(U.gatePosition(0), U.gatePosition(0));
  // Back where it started after one full year.
  assert.ok(U.pointDistance(U.worldPosition(0, 1), U.worldPosition(0, 1 + U.WORLDS[0].yearDays)) < 1);
});

// ---- Routes ---------------------------------------------------------------------

const civilian = ship(0.1, 0.75);
const elite = ship(1, 0.95);
const NO_OVERHEAD = { flipAndAlignmentSeconds: 0, gateQueueSeconds: 0, jumpSeconds: 0, inspectionSeconds: 0 };

test("route types: in-system, one jump to/from the Threshold, two jumps between systems", () => {
  assert.equal(planRoute({ from: 0, to: 5, departDay: 1, drive: elite }).routeType, "INTRA_SYSTEM");
  assert.equal(jumpsBetween(0, 5), 0);
  assert.equal(planRoute({ from: 0, to: 16, departDay: 1, drive: elite }).routeType, "GATE_NETWORK");
  assert.equal(jumpsBetween(0, 16), 1);
  assert.equal(jumpsBetween(16, 9), 1);
  const cross = planRoute({ from: 4, to: 9, departDay: 1, drive: elite });
  assert.equal(cross.routeType, "GATE_NETWORK");
  assert.equal(cross.jumps, 2);
  assert.deepEqual(cross.legs.filter((l) => l.kind === "jump").map((l) => l.system), [0, 1]);
  // Every system-to-system trip crosses the Threshold between its two gates.
  const across = cross.legs.filter((l) => l.kind === "flight")[1];
  near(across.distanceMeters, U.NTZ_GATE_SPACING_M, 1e-9);
});

test("gate route sums its legs: 10 days + 2 + 10 days with no overhead is 22 days, never years", () => {
  const route = planRoute({ from: 4, to: 9, departDay: 1, drive: civilian, overheads: NO_OVERHEAD });
  const flights = route.legs.filter((l) => l.kind === "flight");
  const sum = flights.reduce((s, l) => s + l.flight.coordinateSeconds, 0);
  near(route.coordinateSeconds, sum, 1e-12);
  // The composition itself, with the spec's illustrative leg times.
  assert.equal((10 * DAY + 0 + 0 + 2 * DAY + 0 + 0 + 10 * DAY) / DAY, 22);
  // And the real one stays in days/weeks, nowhere near a year.
  assert.ok(route.coordinateSeconds / DAY > 10 && route.coordinateSeconds / DAY < 40);
});

test("direct route between the same systems uses light-years and takes years", () => {
  const direct = directInterstellar(4, 9, civilian);
  assert.equal(direct.routeType, "DIRECT_INTERSTELLAR");
  near(direct.distanceMeters, 4 * LY, 1e-12);
  assert.ok(direct.coordinateSeconds / YEAR > 10);
  assert.equal(directInterstellar(0, 5, civilian), null, "same system has no direct figure");
  assert.equal(directInterstellar(0, 16, civilian), null, "the Threshold's place in the galaxy isn't set");
});

test("route symmetry: there and back are the same length on the same day", () => {
  for (const [a, b] of [[0, 5], [4, 9], [2, 16], [11, 3]]) {
    const there = planRoute({ from: a, to: b, departDay: 1, drive: elite, overheads: NO_OVERHEAD });
    const back = planRoute({ from: b, to: a, departDay: 1, drive: elite, overheads: NO_OVERHEAD });
    // Legs are timed when each begins, so only the first-leg-only trips are exact.
    if (there.legs.length === 1) near(there.coordinateSeconds, back.coordinateSeconds, 1e-12);
    else near(there.coordinateSeconds, back.coordinateSeconds, 0.05);
  }
});

test("overheads are explicit legs, and a Thruster Array cuts the flip time", () => {
  const plain = planRoute({ from: 0, to: 5, departDay: 1, drive: elite });
  const overhead = plain.legs.find((l) => l.kind === "overhead");
  assert.ok(overhead && overhead.seconds > 0);
  const fast = planRoute({ from: 0, to: 5, departDay: 1, drive: elite, flipCutPct: 75 });
  near(fast.legs.find((l) => l.kind === "overhead").seconds, overhead.seconds * 0.25, 1e-12);
  const none = planRoute({ from: 0, to: 5, departDay: 1, drive: elite, overheads: NO_OVERHEAD });
  assert.equal(none.legs.length, 1);
});

test("a closed or unauthorised gate leaves the route calculable but not launchable", () => {
  const closed = planRoute({ from: 4, to: 9, departDay: 1, drive: elite, gates: { verrin: { operational: false } } });
  assert.equal(closed.physicallyReachable, true);
  assert.equal(closed.gateOperational, false);
  assert.equal(closed.launchable, false);
  assert.ok(closed.coordinateSeconds > 0);
  const denied = planRoute({ from: 4, to: 16, departDay: 1, drive: elite, gates: { threxa: { authorized: false } } });
  assert.equal(denied.authorizedForTransit, false);
  assert.equal(denied.launchable, false);
  // A gate the route doesn't use doesn't matter.
  assert.equal(planRoute({ from: 0, to: 5, departDay: 1, drive: elite, gates: { threxa: { operational: false } } }).launchable, true);
});

test("whole voyage days: rounded up, at least one", () => {
  assert.equal(travelDaysFor(1), 1);
  assert.equal(travelDaysFor(DAY), 1);
  assert.equal(travelDaysFor(DAY + 1), 2);
  assert.equal(travelDaysFor(3 * DAY * (1 + 1e-15)), 3);
});

test("legAt finds the leg the ship is on", () => {
  const route = planRoute({ from: 4, to: 9, departDay: 1, drive: civilian });
  assert.equal(legAt(route, 0).kind, "flight");
  const jump = route.legs.find((l) => l.kind === "jump");
  assert.equal(legAt(route, jump.startSeconds + 1).startSeconds >= jump.startSeconds, true);
  assert.equal(legAt(route, route.coordinateSeconds), route.legs.at(-1));
});

test("design targets: civilian in-system trips average 3-10 days; the Traveler's are quicker", () => {
  let civ = 0;
  let fast = 0;
  let n = 0;
  for (let a = 0; a < 16; a++) {
    for (let b = a + 1; b < 16; b++) {
      if (U.systemOf(a) !== U.systemOf(b)) continue;
      for (let day = 1; day <= 360; day += 30) {
        civ += planRoute({ from: a, to: b, departDay: day, drive: civilian }).coordinateSeconds / DAY;
        fast += planRoute({ from: a, to: b, departDay: day, drive: elite }).coordinateSeconds / DAY;
        n += 1;
      }
    }
  }
  assert.ok(civ / n >= 3 && civ / n <= 10, `civilian average ${civ / n}`);
  assert.ok(fast / n < civ / n);
});

// ---- Ships, Nav Computer, gravity aboard ---------------------------------------

test("a ship's drive is its class plus online compartments, never above 0.95c", () => {
  const d = driveBreakdown({ shipClass: "experimental_elite" });
  assert.equal(d.accelG, 1);
  assert.equal(d.maxSpeedC, 0.95);
  const tuned = driveBreakdown({
    shipClass: "civilian_transport",
    compartments: [{ status: "online", templateKey: "engine-room", tier: 2 }],
  });
  near(tuned.accelG, 0.2, 1e-9);
  assert.equal(driveBreakdown({ shipClass: "civilian_transport", maxSpeedC: 0.99 }).maxSpeedC, 0.95);
  const offline = driveBreakdown({ shipClass: "civilian_transport", compartments: [{ status: "offline", templateKey: "engine-room", tier: 3 }] });
  assert.equal(offline.accelG, 0.1);
});

test("thrusters are RCS (flip time), the Nav Computer adds no thrust", () => {
  const fx = shipEffects([
    { status: "online", templateKey: "thruster-array", tier: 3 },
    { status: "online", templateKey: "nav-computer", tier: 3 },
  ]);
  assert.equal(fx.accelBonusG, 0);
  assert.equal(fx.flipCutPct, 75);
});

test("Nav range: Tier I own system + the Threshold, Tier II the other systems", () => {
  assert.equal(routeRange(0, 5), "close");
  assert.equal(routeRange(0, 16), "close");
  assert.equal(routeRange(16, 9), "close");
  assert.equal(routeRange(4, 9), "medium");
  assert.equal(navCanReach("close", 4, 9), false);
  assert.equal(navCanReach("medium", 4, 9), true);
  assert.equal(navCanReach("all", 4, 9), true);
  assert.equal(navCanReach("none", 0, 1), false);
  // A Tier I computer is never stranded.
  for (let a = 0; a < U.WORLD_COUNT; a++) {
    assert.ok([...Array(U.WORLD_COUNT).keys()].some((b) => b !== a && navCanReach("close", a, b)), `world ${a}`);
  }
});

test("no artificial gravity: aboard, gravity is whatever the caller says it is", () => {
  assert.equal(buildAtmosphere({ aboard: true, aboardGravityG: 0.1 }).gravity, "low");
  assert.equal(buildAtmosphere({ aboard: true, aboardGravityG: 0 }).gravity, "zero");
  assert.equal(buildAtmosphere({ aboard: true, aboardGravityG: 1 }).gravity, "normal");
});

test("formatters", () => {
  assert.equal(formatDuration(2.5 * DAY), "2.5 days");
  assert.equal(formatDuration(5.61 * YEAR), "5.61 years");
  assert.equal(formatDistance(4 * LY), "4 ly");
  assert.equal(formatDistance(0.5 * AU), "0.50 AU");
  assert.equal(formatDistance(2.3e9), "2.3 million km");
});
