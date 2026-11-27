// Pure rules for ship stats, compartments, and travel -- no DB access, so it
// can be reasoned about (and tested) on its own. The DB-touching half lives in
// travelService.js; the travel physics in travelPhysics.js, the geography in
// universe.js and the legs of a journey in routePlanner.js.

import { isThreshold, isValidArea as validArea, WORLD_COUNT as COUNT } from "./universe.js";
import { jumpsBetween } from "./routePlanner.js";

// ---- Ship classes (the Veylan Drive) ----------------------------------------
// Every conventional ship flies on a Veylan Drive: a fusion-powered reaction
// drive that heats reaction mass and throws it out of a field-shaped nozzle. It
// is not reactionless, not an artificial-gravity generator and not FTL. A class
// is a baseline rating -- sustained proper acceleration (in g) and a speed cap
// (fraction of c) -- that a ship row copies and the DM can then edit per ship.
// These are idealised ratings: they don't prove the ship's reactor, radiators
// or reaction mass could sustain them (that is a separate, unmodelled layer).
export const SHIP_CLASSES = [
  { id: "heavy_freighter", name: "Heavy freighter", accelG: 0.05, maxSpeedC: 0.75 },
  { id: "civilian_transport", name: "Civilian transport", accelG: 0.1, maxSpeedC: 0.75 },
  { id: "fast_courier", name: "Fast courier", accelG: 0.25, maxSpeedC: 0.85 },
  { id: "military_warship", name: "Military warship", accelG: 0.5, maxSpeedC: 0.9 },
  { id: "experimental_elite", name: "Experimental / elite", accelG: 1.0, maxSpeedC: 0.95 },
];
export const DEFAULT_SHIP_CLASS = "civilian_transport";
// 0.95c is the civilisation's technological ceiling -- no ship is set above it.
export const ABSOLUTE_MAX_SPEED_C = 0.95;
export const MIN_ACCEL_G = 0.01;
export const MAX_ACCEL_G = 3;

export const shipClassFor = (id) =>
  SHIP_CLASSES.find((c) => c.id === id) ?? SHIP_CLASSES.find((c) => c.id === DEFAULT_SHIP_CLASS);
export const DEFAULT_COMPARTMENT_SLOTS = 12;
export const DEFAULT_BUILD_DAYS = 3;

// The Nav Computer is what a ship needs to travel: it opens the star console on
// the Deck Plan, and with it offline the party can't plot a course. The client
// matches on this key (client ShipBlueprint.jsx), so keep them equal.
export const NAV_COMPUTER_KEY = "nav-computer";

// A long rest only heals fully, and only mends knockout pips, aboard a ship with
// an online Medbay. Without one the crew leans on Medpacks and Revival Tonics.
export const MEDBAY_KEY = "medbay";

export function hasWorkingNavComputer(compartments) {
  return (
    Array.isArray(compartments) &&
    compartments.some((c) => c?.templateKey === NAV_COMPUTER_KEY && c.status === "online")
  );
}

// ---- Supplies ----------------------------------------------------------------
// Building and upgrading eat ship supplies, which the DM lists in a market
// (they are never on the shelves by default). They go into the party's shared
// stores, and a tier needs the matching grade: Tier I uses Ship Parts, Tier II
// Ship Components, Tier III Ship Cores.
export const SUPPLY_GRADES = [
  { tier: 1, key: "parts", column: "ship_parts", name: "Ship Parts", basePrice: 15, description: "Plating, wiring, fittings and fasteners: the plain stock a basic compartment is built from." },
  { tier: 2, key: "components", column: "ship_components", name: "Ship Components", basePrice: 45, description: "Machined assemblies and tuned parts. Needed to upgrade a compartment to Tier II." },
  { tier: 3, key: "cores", column: "ship_cores", name: "Ship Cores", basePrice: 120, description: "Sealed power cores and rare alloys. Needed to upgrade a compartment to Tier III." },
];

// How many units of supplies the stores hold until a Cargo Hold is built.
export const BASE_STORES_CAPACITY = 12;
export const BASE_MEDPACK_FRACTION = 0.5;

export function storesUsed(stores) {
  return SUPPLY_GRADES.reduce((sum, g) => sum + (Number(stores?.[g.key]) || 0), 0);
}

// ---- Compartment blueprints --------------------------------------------------
// Every built-in compartment has up to three tiers. A tier carries what it costs
// to build (units of that tier's supply grade), how long it takes, the Engineering
// DC to start the work, and the effect it gives the crew while the compartment is
// online. A higher tier is an upgrade of an online compartment, not a new pin.
//
// `buildable: false` keeps a blueprint off the players' build list: only the DM
// places it (Thruster Array, Lexical Graft). A blueprint with one tier has no
// upgrades. Effects are read by shipEffects() below, so every system asks one place.

// Which worlds a Nav Computer can chart, from the shortest reach to the longest.
export const NAV_RANGE_RANK = { none: 0, close: 1, medium: 2, all: 3 };

const tier = (buildDays, cost, dc, effect, extra = {}) => ({ buildDays, cost, dc, effect, ...extra });

const COMPARTMENTS = [
  {
    key: "bridge",
    name: "Bridge",
    description: "The flight deck: helm, navigation and the captain's chair. Where the party decides where the ship goes.",
    buildable: true,
    tiers: [tier(5, 10, 10, "The ship's command deck.")],
  },
  {
    key: "engine-room",
    name: "Engine Room",
    description: "The Veylan main drive and its keepers: reactor, reaction-mass feed and the magnetic nozzle at the stern. A well-tuned drive pushes harder, and every journey gets shorter.",
    buildable: true,
    tiers: [
      tier(6, 10, 10, "Veylan Drive acceleration +0.05 g.", { accel: 0.05 }),
      tier(6, 8, 13, "Veylan Drive acceleration +0.10 g.", { accel: 0.1 }),
      tier(8, 8, 16, "Veylan Drive acceleration +0.15 g.", { accel: 0.15 }),
    ],
  },
  {
    key: "thruster-array",
    name: "Thruster Array",
    description: "Oversized manoeuvring thrusters (RCS) bolted round the hull. They don't push the ship along -- that is the main drive's job -- but they swing it through the midpoint flip and nose it into dock fast.",
    buildable: false,
    tiers: [
      tier(8, 10, 10, "Flip, alignment and docking take 25% less time on every leg.", { flipCut: 25 }),
      tier(8, 8, 13, "Flip, alignment and docking take 50% less time.", { flipCut: 50 }),
      tier(10, 8, 16, "Flip, alignment and docking take 75% less time.", { flipCut: 75 }),
    ],
  },
  {
    key: NAV_COMPUTER_KEY,
    name: "Nav Computer",
    description: "Plots burns, flips and gate approaches. Its holographic star table is how the crew charts a course: without a working one the ship can't travel.",
    buildable: true,
    tiers: [
      tier(4, 8, 10, "Charts the worlds of the ship's own system, and the run through one gate to or from The Threshold.", { navRange: "close" }),
      tier(5, 7, 13, "Also charts the other systems, through both gates and across The Threshold.", { navRange: "medium" }),
      tier(6, 7, 16, "Charts every world, and works out what the trip would take with no gates at all.", { navRange: "all" }),
    ],
  },
  {
    key: MEDBAY_KEY,
    name: "Medbay",
    description: "Cots, scanners and a locked cabinet of medicine for patching up the crew.",
    buildable: true,
    tiers: [
      tier(4, 8, 10, "A long rest heals everyone in full and clears knockout pips."),
      tier(5, 7, 13, "Also cures illness overnight.", { cures: true }),
      tier(6, 7, 16, "Medpacks heal 75% of max Grit instead of 50%.", { cures: true, medpack: 0.75 }),
    ],
  },
  {
    key: "galley",
    name: "Galley",
    description: "A cramped kitchen and mess. Hot meals keep a crew, and its slugs, in good spirits.",
    buildable: true,
    tiers: [
      tier(3, 6, 10, "The cook turns up 2 scoops of Slug Kibble for the party at every long rest.", { kibble: 2 }),
      tier(4, 6, 13, "4 scoops of Slug Kibble every long rest.", { kibble: 4 }),
      tier(5, 6, 16, "6 scoops of Slug Kibble every long rest.", { kibble: 6 }),
    ],
  },
  {
    key: "cargo-hold",
    name: "Cargo Hold",
    description: "Lashed-down crates and loose floor space for loot, trade goods and anything that shouldn't be in the cabins.",
    buildable: true,
    tiers: [
      tier(3, 6, 10, "The ship's stores hold up to 20 supplies.", { storage: 20 }),
      tier(4, 6, 13, "The stores hold up to 40 supplies.", { storage: 40 }),
      tier(5, 6, 16, "The stores hold up to 80 supplies.", { storage: 80 }),
    ],
  },
  {
    key: "crew-quarters",
    name: "Crew Quarters",
    description: "Bunks, lockers and a little privacy. Somewhere to actually take a long rest.",
    buildable: true,
    tiers: [
      tier(3, 6, 10, "Sleeping aboard cuts the chance of falling ill by 25%.", { illnessCut: 25 }),
      tier(4, 6, 13, "Cuts the chance of falling ill by 50%.", { illnessCut: 50 }),
      tier(5, 6, 16, "Nobody falls ill from the climate while sleeping aboard.", { illnessCut: 100 }),
    ],
  },
  {
    key: "armory",
    name: "Armory",
    description: "Racks for blasters and a bench for keeping them in firing order.",
    buildable: true,
    tiers: [
      tier(4, 8, 10, "Blasters wear 10% slower.", { wearCut: 10 }),
      tier(5, 7, 13, "Blasters wear 20% slower.", { wearCut: 20 }),
      tier(6, 7, 16, "Blasters wear 30% slower.", { wearCut: 30 }),
    ],
  },
  {
    key: "workshop",
    name: "Workshop",
    description: "Tools, scrap and a welding rig. Where repairs and tinkering happen.",
    buildable: true,
    tiers: [
      tier(4, 8, 10, "+2 to Repair Kit rolls and +1 to ship-building rolls.", { repair: 2, build: 1 }),
      tier(5, 7, 13, "+4 to Repair Kit rolls and +2 to ship-building rolls.", { repair: 4, build: 2 }),
      tier(6, 7, 16, "+6 to Repair Kit rolls and +3 to ship-building rolls.", { repair: 6, build: 3 }),
    ],
  },
  {
    key: "slug-terrarium",
    name: "Slug Terrarium",
    description: "A climate-controlled habitat for the party's slugs to rest, feed and stay calm in transit.",
    buildable: true,
    tiers: [
      tier(5, 8, 10, "Slugs lose 5% less food at every long rest.", { drainCut: 5 }),
      tier(5, 7, 13, "Slugs lose 10% less food at every long rest.", { drainCut: 10 }),
      tier(6, 7, 16, "Slugs lose 15% less food, and one starving slug a rest keeps its loyalty.", { drainCut: 15, spare: 1 }),
    ],
  },
  {
    key: "observatory",
    name: "Observatory",
    description: "A glass blister with long-range scopes for watching worlds, stars and whatever else is out there.",
    buildable: true,
    tiers: [
      tier(4, 8, 10, "Unvisited worlds show their atmosphere and gravity.", { survey: 1 }),
      tier(5, 7, 13, "Unvisited worlds show every survey fact.", { survey: 2 }),
      tier(6, 7, 16, "Unvisited worlds show their picture and description too.", { survey: 3 }),
    ],
  },
  {
    key: "pub",
    name: "Pub",
    description: "A place to make food, and eat it.",
    buildable: true,
    tiers: [tier(3, 6, 10, "A place to make food, and eat it.")],
  },
  {
    key: "bathroom",
    name: "Bathroom",
    description: "When you ate too much and need to let go, this is the place to go.",
    buildable: true,
    tiers: [tier(3, 6, 10, "When you ate too much and need to let go, this is the place to go.")],
  },
  {
    key: "lexical-graft",
    name: "Lexical Graft",
    description: "A living neurological interface designed for rapid linguistic assimilation.",
    buildable: false,
    tiers: [tier(3, 6, 10, "A living neurological interface designed for rapid linguistic assimilation.")],
  },
];

export const COMPARTMENT_BLUEPRINTS = COMPARTMENTS.map((c) => ({
  ...c,
  maxTier: c.tiers.length,
  tiers: c.tiers.map((t, i) => ({ ...t, tier: i + 1, grade: SUPPLY_GRADES[i].key })),
}));

export function blueprintFor(key) {
  return COMPARTMENT_BLUEPRINTS.find((b) => b.key === key) ?? null;
}

// The DM's template picker: the flat shape it always had, plus what tiers add.
// Built from the blueprints, so this stays the single source.
export const DEFAULT_COMPARTMENT_TEMPLATES = COMPARTMENT_BLUEPRINTS.map((b) => ({
  key: b.key,
  name: b.name,
  description: b.description,
  buildDays: b.tiers[0].buildDays,
  accelBonusG: b.tiers[0].accel ?? 0,
  maxTier: b.maxTier,
  buildable: b.buildable,
}));

// A compartment's tier, kept within what its blueprint offers. Custom
// compartments have no blueprint and so no tiers.
export function compartmentTier(c) {
  const bp = blueprintFor(c?.templateKey);
  if (!bp) return 1;
  return Math.max(1, Math.min(bp.maxTier, Math.trunc(Number(c?.tier)) || 1));
}

// What a compartment's acceleration bonus (g) should read at a tier. The
// fallback is the stored number, which is all a custom compartment has.
export function tierAccelBonus(templateKey, tierNumber, fallback = 0) {
  const bp = blueprintFor(templateKey);
  if (!bp) return fallback;
  return bp.tiers[tierNumber - 1]?.accel ?? 0;
}

// Everything the online compartments give the crew, in one place. Duplicates of
// one kind don't stack (the best one counts); drive acceleration does.
export function shipEffects(compartments) {
  const fx = {
    accelBonusG: 0,
    flipCutPct: 0,
    navTier: 0,
    navRange: "none",
    medbayTier: 0,
    restHealsFully: false,
    curesIllness: false,
    medpackHealFraction: BASE_MEDPACK_FRACTION,
    galleyKibble: 0,
    foodDrainCut: 0,
    spareSlugs: 0,
    illnessCutPct: 0,
    repairBonus: 0,
    buildBonus: 0,
    wearCutPct: 0,
    storesCapacity: BASE_STORES_CAPACITY,
    surveyTier: 0,
  };
  const list = Array.isArray(compartments) ? compartments : [];
  for (const c of list) {
    if (c?.status !== "online") continue;
    const bp = blueprintFor(c.templateKey);
    if (!bp) {
      fx.accelBonusG += Number(c.accelBonusG) || 0;
      continue;
    }
    const n = compartmentTier(c);
    const t = bp.tiers[n - 1];
    fx.accelBonusG += t.accel ?? 0;
    fx.flipCutPct = Math.max(fx.flipCutPct, t.flipCut ?? 0);
    if (t.navRange) {
      fx.navTier = Math.max(fx.navTier, n);
      if (NAV_RANGE_RANK[t.navRange] > NAV_RANGE_RANK[fx.navRange]) fx.navRange = t.navRange;
    }
    if (bp.key === MEDBAY_KEY) {
      fx.medbayTier = Math.max(fx.medbayTier, n);
      fx.restHealsFully = true;
      if (t.cures) fx.curesIllness = true;
      if (t.medpack) fx.medpackHealFraction = Math.max(fx.medpackHealFraction, t.medpack);
    }
    fx.galleyKibble = Math.max(fx.galleyKibble, t.kibble ?? 0);
    fx.foodDrainCut = Math.max(fx.foodDrainCut, t.drainCut ?? 0);
    fx.spareSlugs = Math.max(fx.spareSlugs, t.spare ?? 0);
    fx.illnessCutPct = Math.max(fx.illnessCutPct, t.illnessCut ?? 0);
    fx.repairBonus = Math.max(fx.repairBonus, t.repair ?? 0);
    fx.buildBonus = Math.max(fx.buildBonus, t.build ?? 0);
    fx.wearCutPct = Math.max(fx.wearCutPct, t.wearCut ?? 0);
    fx.surveyTier = Math.max(fx.surveyTier, t.survey ?? 0);
    if (t.storage) fx.storesCapacity = Math.max(fx.storesCapacity, t.storage);
  }
  fx.accelBonusG = Math.round(fx.accelBonusG * 1000) / 1000;
  return fx;
}

// ---- Building and upgrading --------------------------------------------------

// What it takes to bring a blueprint to `toTier` (1 for a fresh build, the next
// tier for an upgrade). null when there is no such tier.
export function workQuote(templateKey, toTier) {
  const bp = blueprintFor(templateKey);
  const t = bp?.tiers[toTier - 1];
  if (!t) return null;
  const grade = SUPPLY_GRADES[toTier - 1];
  return {
    tier: toTier,
    cost: t.cost,
    buildDays: t.buildDays,
    dc: t.dc,
    grade: grade.key,
    gradeName: grade.name,
    column: grade.column,
    effect: t.effect,
  };
}

// The engineering roll. A natural 20 always lands and shaves a day off the work;
// otherwise the total has to reach the DC. A miss costs half the supplies,
// rounded up, and starts nothing.
export function resolveWorkRoll({ die, modifier, bonus = 0, dc, cost, buildDays }) {
  const total = die + modifier + bonus;
  const crit = die === 20;
  const success = crit || total >= dc;
  return {
    die,
    modifier,
    bonus,
    total,
    dc,
    crit,
    success,
    spent: success ? cost : Math.ceil(cost / 2),
    buildDays: success ? Math.max(1, buildDays - (crit ? 1 : 0)) : 0,
  };
}

// Worlds are indexed by campaign_settings.slug_hunt_area; the geography lives
// in universe.js.
export const WORLD_COUNT = COUNT;
export const isValidArea = validArea;

// How far a Nav Computer has to reach to chart a route, by the gates it uses.
// "close": inside one system, or one jump to or from The Threshold (so a Tier I
// computer can always get the ship out of the debris field). "medium": the
// other systems, two jumps through The Threshold. Tier III ("all") charts the
// same worlds and adds the no-gates figures. Mirrored in shipData.js labels.
export function routeRange(from, to) {
  const jumps = jumpsBetween(from, to);
  if (jumps === 0 || isThreshold(from) || isThreshold(to)) return "close";
  return "medium";
}

// Can a Nav Computer of this reach ("none" | "close" | "medium" | "all") chart
// the route between two worlds?
export function navCanReach(navRange, from, to) {
  return (NAV_RANGE_RANK[navRange] ?? 0) >= NAV_RANGE_RANK[routeRange(from, to)];
}

const clampNum = (n, lo, hi, fallback) =>
  n !== null && n !== undefined && Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : fallback;

// The ship's drive: its class baseline, the row's own ratings (the DM can edit
// them), plus every online compartment's acceleration bonus. `drive` is in the
// shape travelPhysics.computeFlight takes.
export function driveBreakdown(ship) {
  const cls = shipClassFor(ship?.shipClass);
  const baseG = clampNum(ship?.accelG, MIN_ACCEL_G, MAX_ACCEL_G, cls.accelG);
  const maxSpeedC = clampNum(ship?.maxSpeedC, 0.01, ABSOLUTE_MAX_SPEED_C, cls.maxSpeedC);
  const fx = shipEffects(ship?.compartments);
  const accelG = Math.round(clampNum(baseG + fx.accelBonusG, MIN_ACCEL_G, MAX_ACCEL_G, MIN_ACCEL_G) * 1000) / 1000;
  return {
    shipClass: cls.id,
    className: cls.name,
    baseG,
    bonusG: fx.accelBonusG,
    accelG,
    maxSpeedC,
    flipCutPct: fx.flipCutPct,
    drive: { properAccelerationG: accelG, maxSpeedFractionC: maxSpeedC },
  };
}

// A proposal passes with a strict majority of the party's players saying yes,
// and fails once a majority can no longer be reached.
export function tallyVotes({ eligible, yes, no }) {
  const needed = Math.floor(eligible / 2) + 1;
  if (yes >= needed) return { needed, outcome: "passed" };
  if (no > eligible - needed) return { needed, outcome: "failed" };
  return { needed, outcome: "open" };
}

// How many days of work a building (or upgrading) compartment gets from one
// long rest: docked, the dockyard crew does one day. Under way, only the
// engineers aboard who are working on it count -- one day each.
export function buildProgressPerRest({ traveling, engineerCount }) {
  return traveling ? engineerCount : 1;
}
