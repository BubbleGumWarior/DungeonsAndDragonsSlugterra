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

export function hasWorkingNavComputer(compartments) {
  return (
    Array.isArray(compartments) &&
    compartments.some((c) => c?.templateKey === NAV_COMPUTER_KEY && c.status === "online")
  );
}

// Built-in compartments the DM can drop into an empty slot. `speedBonus` is
// added to the ship's travel speed while the compartment is online; everything
// else is flavour the party roleplays around. Mirrored client-side only by
// reading them from GET /api/ships/templates, so this is the single source.
export const DEFAULT_COMPARTMENT_TEMPLATES = [
  { key: "bridge", name: "Bridge", buildDays: 5, speedBonus: 0, description: "The flight deck: helm, navigation and the captain's chair. Where the party decides where the ship goes." },
  { key: "engine-room", name: "Engine Room", buildDays: 6, speedBonus: 2, description: "The main drive and its keepers. A well-tuned engine room makes every journey shorter." },
  { key: "thruster-array", name: "Thruster Array", buildDays: 8, speedBonus: 3, description: "Oversized auxiliary thrusters bolted to the hull. Loud, thirsty and fast." },
  { key: NAV_COMPUTER_KEY, name: "Nav Computer", buildDays: 4, speedBonus: 1, description: "Plots tighter routes between worlds and shaves days off long hauls. Its holographic star table is how the crew charts a course: without a working one the ship can't travel." },
  { key: "medbay", name: "Medbay", buildDays: 4, speedBonus: 0, description: "Cots, scanners and a locked cabinet of medicine for patching up the crew." },
  { key: "galley", name: "Galley", buildDays: 3, speedBonus: 0, description: "A cramped kitchen and mess. Hot meals keep a crew, and its slugs, in good spirits." },
  { key: "cargo-hold", name: "Cargo Hold", buildDays: 3, speedBonus: 0, description: "Lashed-down crates and loose floor space for loot, trade goods and anything that shouldn't be in the cabins." },
  { key: "crew-quarters", name: "Crew Quarters", buildDays: 3, speedBonus: 0, description: "Bunks, lockers and a little privacy. Somewhere to actually take a long rest." },
  { key: "armory", name: "Armory", buildDays: 4, speedBonus: 0, description: "Racks for blasters and a bench for keeping them in firing order." },
  { key: "workshop", name: "Workshop", buildDays: 4, speedBonus: 0, description: "Tools, scrap and a welding rig. Where repairs and tinkering happen." },
  { key: "slug-terrarium", name: "Slug Terrarium", buildDays: 5, speedBonus: 0, description: "A climate-controlled habitat for the party's slugs to rest, feed and stay calm in transit." },
  { key: "observatory", name: "Observatory", buildDays: 4, speedBonus: 0, description: "A glass blister with long-range scopes for watching worlds, stars and whatever else is out there." },
  { key: "pub", name: "Pub", buildDays: 3, speedBonus: 0, description: "A place to make food, and eat it." },
  { key: "bathroom", name: "Bathroom", buildDays: 3, speedBonus: 0, description: "When you ate too much and need to let go, this is the place to go." },
  { key: "lexical-graft", name: "Lexical Graft", buildDays: 3, speedBonus: 0, description: "A living neurological interface designed for rapid linguistic assimilation." },
];

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

export function travelDays(distance, speed) {
  return Math.max(1, Math.ceil(distance / Math.max(1, speed)));
}

// Base speed plus every online compartment's bonus.
export function speedBreakdown(ship) {
  const base = Number.isFinite(Number(ship?.speed)) ? Number(ship.speed) : DEFAULT_SHIP_SPEED;
  const compartments = Array.isArray(ship?.compartments) ? ship.compartments : [];
  const bonus = compartments.reduce(
    (sum, c) => sum + (c?.status === "online" ? Number(c.speedBonus) || 0 : 0),
    0
  );
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

// How many days of work a building compartment gets from one long rest:
// docked, the dockyard crew does one day. Under way, only the engineers
// aboard who are working on it count -- one day each.
export function buildProgressPerRest({ traveling, engineerCount }) {
  return traveling ? engineerCount : 1;
}
