// Upkeep rules shown to players: feeding slugs and keeping blasters in repair.
// Mirrors server/src/careRules.js -- display only, the server is the referee.

export const FOOD_MAX = 100;
export const FOOD_DRAIN_PER_REST = 25;
// A scoop restores KIBBLE_FOOD_MIN %, stretched by the feeder's Slug Handling.
export const KIBBLE_FOOD_MIN = 10;
export const KIBBLE_FOOD_MAX = 50;
export const KIBBLE_FOOD_PER_HANDLING = 8;

export function kibbleFoodFor(handlingMod) {
  const bonus = Math.max(0, Math.trunc(handlingMod || 0)) * KIBBLE_FOOD_PER_HANDLING;
  return Math.min(KIBBLE_FOOD_MAX, KIBBLE_FOOD_MIN + bonus);
}

export const DURABILITY_MAX = 100;
export const SHOTS_TO_BREAK = [100, 200, 350, 500, 1000];
export const REPAIR_DC = 15;
export const REPAIR_FAIL_DAMAGE = 10;

// How many scoops of kibble it takes to fill a slug from where it is.
export function kibbleNeeded(food, perScoop = KIBBLE_FOOD_MIN) {
  return Math.max(0, Math.ceil((FOOD_MAX - food) / perScoop));
}

// tone drives colour; the label always carries the meaning too.
export function foodState(food) {
  if (food <= 0) return { key: "starving", label: "Starving", tone: "bad" };
  if (food <= 25) return { key: "hungry", label: "Hungry", tone: "warn" };
  if (food <= 50) return { key: "peckish", label: "Peckish", tone: "warn" };
  if (food < FOOD_MAX) return { key: "fed", label: "Well fed", tone: "good" };
  return { key: "full", label: "Full", tone: "good" };
}

// Shown as a whole percent; only a truly broken weapon reads 0%.
export function durabilityPercent(durability) {
  return durability <= 0 ? 0 : Math.min(DURABILITY_MAX, Math.ceil(durability));
}

export function durabilityState(durability) {
  if (durability <= 0) return { key: "broken", label: "Broken", tone: "bad" };
  if (durability < 25) return { key: "failing", label: "Failing", tone: "bad" };
  if (durability < 50) return { key: "damaged", label: "Damaged", tone: "warn" };
  if (durability < 75) return { key: "worn", label: "Worn", tone: "warn" };
  return { key: "sound", label: "Sound", tone: "good" };
}

// Roughly how many more shots a blaster of this quality has left in it.
export function shotsLeft(durability, quality) {
  const wearPerShot = DURABILITY_MAX / (SHOTS_TO_BREAK[quality] ?? SHOTS_TO_BREAK[0]);
  return Math.max(0, Math.floor(durability / wearPerShot));
}

// ---- Field consumables (mirrors careRules.js) --------------------------------
export const ENERGY_CELL_PIPS = 2;
export const MEDPACK_HEAL_FRACTION = 0.5;
// Mirrors careRules.js: a long rest without a working Medbay only mends this
// share of max Grit and leaves knockout pips alone.
export const NO_MEDBAY_REST_HEAL_FRACTION = 0.5;
export const TONIC_PIPS = 1;
export const MEDS_DOSES_NEEDED = 3;

// Everything a player carries that gets used up. `field` is the key on the
// character record; `effect` is the one-line promise, `rules` the full hover.
export const SUPPLIES = [
  {
    key: "pods",
    field: "pods",
    name: "Slug Pods",
    effect: "Loads a slug into a magazine slot",
    rules: [
      "Each slug in a magazine rides in its own pod. A reload spends a spare pod for every slug whose pod broke.",
      "A misfire shatters the fired slug's pod, so keep at least a full magazine in reserve.",
    ],
  },
  {
    key: "kibble",
    field: "kibble",
    name: "Slug Kibble",
    effect: `Feeds a slug ${KIBBLE_FOOD_MIN}-${KIBBLE_FOOD_MAX}% food`,
    rules: [
      `Each scoop restores at least ${KIBBLE_FOOD_MIN}% of one slug's food, and up to ${KIBBLE_FOOD_MAX}% in the hands of a skilled Slug Handler. Feed them below, under Slug Care.`,
      `A long rest drains ${FOOD_DRAIN_PER_REST}% of every slug's food. Sleep with a slug at 0% and it loses a loyalty level -- or leaves for good if it has none left.`,
    ],
  },
  {
    key: "repair-kit",
    field: "repairKits",
    name: "Repair Kits",
    effect: `Mends a worn blaster (d20 + Engineering over ${REPAIR_DC})`,
    rules: [
      `Use a kit from the Repair button on a blaster in your Inventory. Roll d20 + Engineering: above ${REPAIR_DC} and it is restored to 100%.`,
      `On a fail the kit is used up and the blaster loses a further ${REPAIR_FAIL_DAMAGE}%. At 0% it is past a kit's help -- only an expert can mend it.`,
    ],
  },
  {
    key: "energy-cell",
    field: "energyCells",
    name: "Energy Cells",
    effect: `Recharges a slug by ${ENERGY_CELL_PIPS} energy pips`,
    rules: [
      `Each cell refills ${ENERGY_CELL_PIPS} spent energy pips on one slug. Use them below, under Slug Care.`,
      "A long rest recharges every slug in full anyway -- cells are for when you can't wait for one.",
      "Can't be used while you're in a fight.",
    ],
  },
  {
    key: "medpack",
    field: "medpacks",
    name: "Medpacks",
    effect: `Heals ${Math.round(MEDPACK_HEAL_FRACTION * 100)}% of your max Grit`,
    rules: [
      `Each Medpack heals ${Math.round(MEDPACK_HEAL_FRACTION * 100)}% of your maximum Grit. Use one below, under Field Medicine.`,
      `A long rest only mends up to ${Math.round(NO_MEDBAY_REST_HEAL_FRACTION * 100)}% of max Grit unless the ship has a working Medbay, so keep some spare.`,
      "Can't be used while you're in a fight.",
    ],
  },
  {
    key: "revival-tonic",
    field: "revivalTonics",
    name: "Revival Tonics",
    effect: `Clears ${TONIC_PIPS} knockout pip`,
    rules: [
      `Each tonic clears ${TONIC_PIPS} of your knockout pips. Use one below, under Field Medicine.`,
      "A long rest only clears knockout pips if the ship has a working Medbay.",
      "Can't be used while you're in a fight.",
    ],
  },
  {
    key: "meds",
    field: "meds",
    name: "Meds",
    effect: `${MEDS_DOSES_NEEDED} daily doses cure illness`,
    rules: [
      "Sleeping in the wrong clothes for the climate can make you ill. While ill, your max Grit, AP and accuracy are all halved when a fight begins.",
      `Take one dose per long rest, ${MEDS_DOSES_NEEDED} rests in a row, and the sickness clears. Miss a rest and the count starts over. Use it below, under Field Medicine.`,
      "Can't be used while you're in a fight.",
    ],
  },
];
