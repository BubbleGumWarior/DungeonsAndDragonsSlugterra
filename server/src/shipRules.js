// Pure rules for ship stats, compartments, and travel -- no DB access, so it
// can be reasoned about (and tested) on its own. The DB-touching half lives in
// travelService.js.

export const DEFAULT_SHIP_SPEED = 5;
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
    description: "The main drive and its keepers. A well-tuned engine room makes every journey shorter.",
    buildable: true,
    tiers: [
      tier(6, 10, 10, "Travel speed +2.", { speed: 2 }),
      tier(6, 8, 13, "Travel speed +3.", { speed: 3 }),
      tier(8, 8, 16, "Travel speed +4.", { speed: 4 }),
    ],
  },
  {
    key: "thruster-array",
    name: "Thruster Array",
    description: "Oversized auxiliary thrusters bolted to the hull. Loud, thirsty and fast.",
    buildable: false,
    tiers: [
      tier(8, 10, 10, "Travel speed +3.", { speed: 3 }),
      tier(8, 8, 13, "Travel speed +4.", { speed: 4 }),
      tier(10, 8, 16, "Travel speed +6.", { speed: 6 }),
    ],
  },
  {
    key: NAV_COMPUTER_KEY,
    name: "Nav Computer",
    description: "Plots tighter routes between worlds and shaves days off long hauls. Its holographic star table is how the crew charts a course: without a working one the ship can't travel.",
    buildable: true,
    tiers: [
      tier(4, 8, 10, "Travel speed +1. Charts nearby worlds, up to 13 units away.", { speed: 1, navRange: "close" }),
      tier(5, 7, 13, "Travel speed +1. Charts worlds up to 30 units away: The Threshold and the nearer systems.", { speed: 1, navRange: "medium" }),
      tier(6, 7, 16, "Travel speed +1. Charts every world.", { speed: 1, navRange: "all" }),
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
  speedBonus: b.tiers[0].speed ?? 0,
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

// What a compartment's speed bonus should read at a tier. The fallback is the
// stored number, which is all a custom compartment has.
export function tierSpeedBonus(templateKey, tierNumber, fallback = 0) {
  const t = blueprintFor(templateKey)?.tiers[tierNumber - 1];
  return t && t.speed !== undefined ? t.speed : fallback;
}

// Everything the online compartments give the crew, in one place. Duplicates of
// one kind don't stack (the best one counts); speed does, as it always has.
export function shipEffects(compartments) {
  const fx = {
    speedBonus: 0,
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
      fx.speedBonus += Number(c.speedBonus) || 0;
      continue;
    }
    const n = compartmentTier(c);
    const t = bp.tiers[n - 1];
    fx.speedBonus += t.speed !== undefined ? t.speed : Number(c.speedBonus) || 0;
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

// The flat world index (campaign_settings.slug_hunt_area) mapped back onto the
// star system it sits in: how many worlds each cluster holds, in
// planetData.js's CLUSTERS order (Threxa, Verrin, Kaeth), with The Threshold
// last as its own one-world "cluster". Keep in step with planetData.js.
const CLUSTER_SIZES = [6, 5, 5, 1];
export const WORLD_COUNT = CLUSTER_SIZES.reduce((a, b) => a + b, 0);
const THRESHOLD_CLUSTER = CLUSTER_SIZES.length - 1;

export function isValidArea(area) {
  return Number.isInteger(area) && area >= 0 && area < WORLD_COUNT;
}

function locate(area) {
  let idx = area;
  for (let cluster = 0; cluster < CLUSTER_SIZES.length; cluster++) {
    if (idx < CLUSTER_SIZES[cluster]) return { cluster, slot: idx };
    idx -= CLUSTER_SIZES[cluster];
  }
  return { cluster: THRESHOLD_CLUSTER, slot: 0 };
}

// Gap between the three star systems, in distance units (the same unit a
// ship's speed is measured in per day).
const CLUSTER_GAP = { "0-1": 20, "1-2": 24, "0-2": 32 };
const THRESHOLD_GAP = 12;

// Distance in units between two worlds. Worlds in one system are close, with
// further-out orbits farther apart; crossing between systems is a long haul;
// The Threshold sits in the void between them all, a middling trip from anywhere.
export function worldDistance(from, to) {
  if (from === to) return 0;
  const a = locate(from);
  const b = locate(to);
  if (a.cluster === b.cluster) return 3 + 2 * Math.abs(a.slot - b.slot);
  if (a.cluster === THRESHOLD_CLUSTER || b.cluster === THRESHOLD_CLUSTER) {
    const other = a.cluster === THRESHOLD_CLUSTER ? b : a;
    return THRESHOLD_GAP + 2 * other.slot;
  }
  const lo = Math.min(a.cluster, b.cluster);
  const hi = Math.max(a.cluster, b.cluster);
  return CLUSTER_GAP[`${lo}-${hi}`] + 2 * (a.slot + b.slot);
}

// How far a Nav Computer has to reach to chart a route, by distance in units.
// Close covers any hop inside one star system (the longest is 13) and The
// Threshold's nearest worlds; medium stretches to The Threshold and the nearer
// worlds of the next system over; the rest needs a Tier III. Mirrored in the
// client's shipData.js labels.
export const CLOSE_RANGE_MAX = 13;
export const MEDIUM_RANGE_MAX = 30;

export function routeRange(from, to) {
  const distance = worldDistance(from, to);
  if (distance <= CLOSE_RANGE_MAX) return "close";
  return distance <= MEDIUM_RANGE_MAX ? "medium" : "all";
}

// Can a Nav Computer of this reach ("none" | "close" | "medium" | "all") chart
// the route between two worlds?
export function navCanReach(navRange, from, to) {
  return (NAV_RANGE_RANK[navRange] ?? 0) >= NAV_RANGE_RANK[routeRange(from, to)];
}

export function travelDays(distance, speed) {
  return Math.max(1, Math.ceil(distance / Math.max(1, speed)));
}

// Base speed plus every online compartment's bonus.
export function speedBreakdown(ship) {
  const base = Number.isFinite(Number(ship?.speed)) ? Number(ship.speed) : DEFAULT_SHIP_SPEED;
  const compartments = Array.isArray(ship?.compartments) ? ship.compartments : [];
  const bonus = shipEffects(compartments).speedBonus;
  return { base, bonus, effective: Math.max(1, base + bonus) };
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
