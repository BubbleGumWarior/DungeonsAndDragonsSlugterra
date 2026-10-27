// Upkeep rules for the things players carry: feeding slugs and keeping blasters
// in repair. Mirrored by client/src/careData.js (display only -- the server is
// always the referee).

// ---- Slug food ---------------------------------------------------------------
// Every slug has a food meter (0-100). A long rest drains it; a rest that
// starts with the meter already empty costs the slug a loyalty tier, and a
// slug already at the lowest tier leaves the party.
export const FOOD_MAX = 100;
export const FOOD_DRAIN_PER_REST = 25;
// One scoop of Slug Kibble restores 10% food, and a better Slug Handling
// modifier stretches it: 8% more per point, topping out at 50% (a +5 handler).
export const KIBBLE_FOOD_MIN = 10;
export const KIBBLE_FOOD_MAX = 50;
export const KIBBLE_FOOD_PER_HANDLING = 8;

export function kibbleFoodFor(handlingMod) {
  const bonus = Math.max(0, Math.trunc(handlingMod || 0)) * KIBBLE_FOOD_PER_HANDLING;
  return Math.min(KIBBLE_FOOD_MAX, KIBBLE_FOOD_MIN + bonus);
}
export const KIBBLE_PRICE = 8;
// Foraging (Survival): at a long rest, anyone with a Survival modifier of 1 or
// more rolls a d6, adds the modifier, and finds that many scoops of kibble.
export const FORAGE_MIN_MOD = 1;
export const FORAGE_DIE = 6;

// ---- Field consumables -------------------------------------------------------
// Used from the Consumables page, never mid-fight.
export const ENERGY_CELL_PIPS = 2; // energy pips one cell restores on a slug
export const ENERGY_CELL_PRICE = 25;
export const MEDPACK_HEAL_FRACTION = 0.5; // of the user's max Grit
export const MEDPACK_PRICE = 30;
export const TONIC_PIPS = 1; // knockout pips one Revival Tonic clears
export const TONIC_PRICE = 100;
// Without a working Medbay aboard, a long rest only mends Grit up to this share
// of max and leaves knockout pips alone -- Medpacks and Tonics fill the gap.
export const NO_MEDBAY_REST_HEAL_FRACTION = 0.5;
// Meds cure illness (an outfit that didn't suit the climate at a long rest).
// One dose per long rest, and it takes this many days in a row to clear it.
export const MEDS_PRICE = 35;
export const MEDS_DOSES_NEEDED = 3;

// Consumables that can change hands in a trade: client field -> characters column.
export const TRADEABLE_SUPPLIES = {
  kibble: "kibble",
  repairKits: "repair_kits",
  energyCells: "energy_cells",
  medpacks: "medpacks",
  revivalTonics: "revival_tonics",
  meds: "meds",
};

// ---- Blaster durability ------------------------------------------------------
// Durability is a percentage. Every shot fired wears it down by 100 / (shots a
// weapon of that quality survives), so a Crude blaster is good for about 100.
// Indexed by quality tier (Crude, Standard, Fine, Masterwork, Legendary).
export const DURABILITY_MAX = 100;
export const SHOTS_TO_BREAK = [100, 200, 350, 500, 1000];

export function wearPerShot(quality) {
  return DURABILITY_MAX / (SHOTS_TO_BREAK[quality] ?? SHOTS_TO_BREAK[0]);
}

// Repair kit: d20 + Engineering must beat the DC to restore the weapon fully.
// A failed attempt still burns the kit and chews up the weapon further.
export const REPAIR_DC = 15;
export const REPAIR_FAIL_DAMAGE = 10;
export const REPAIR_KIT_PRICE = 60;

// ---- Merchants' mood after a rest --------------------------------------------
// Weighted toward Neutral so the extremes (Furious, Generous) stay rare.
export const MOOD_WEIGHTS = {
  neutral: 32,
  wary: 20,
  friendly: 20,
  sour: 10,
  cheerful: 8,
  hostile: 5,
  generous: 3,
  furious: 2,
};

export function rollMoodKey(moods, rand = Math.random) {
  const weights = moods.map((m) => MOOD_WEIGHTS[m.key] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rand() * total;
  for (let i = 0; i < moods.length; i += 1) {
    pick -= weights[i];
    if (pick < 0) return moods[i].key;
  }
  return moods[moods.length - 1].key;
}
