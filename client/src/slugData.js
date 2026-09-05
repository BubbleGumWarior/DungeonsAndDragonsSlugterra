export const SLUG_TYPES = [
  { key: "Air", color: "#9fd8c9" },
  { key: "Dark", color: "#5b4a70" },
  { key: "Earth", color: "#a97c50" },
  { key: "Electricity", color: "#e0c53f" },
  { key: "Energy", color: "#c98fe0" },
  { key: "Fire", color: "#e0623f" },
  { key: "Healing", color: "#6fd88a" },
  { key: "Ice", color: "#8fd0e0" },
  { key: "Light", color: "#f0e6a0" },
  { key: "Metal", color: "#9aa5ad" },
  { key: "None", color: "#6b6b6b" },
  { key: "Plant", color: "#5a9c4a" },
  { key: "Psychic", color: "#b06fd8" },
  { key: "Toxic", color: "#8fc23f" },
  { key: "Unique", color: "#d8a24a" },
  { key: "Water", color: "#4a9fd8" },
];

export const LOYALTY_TIER_LABELS = {
  0: "Wild",
  1: "Indifferent",
  2: "Friendly",
  3: "Loyal",
  4: "Bonded",
};

// A fixed, theme-independent color per loyalty tier -- deliberately its own
// palette rather than the app's theme gold, so a slug's tier reads at a
// glance and stays legible/consistent no matter which accent theme the DM
// has picked in Settings (unlike --gold-soft, --maroon-*, etc., which rotate
// per theme). Rising, game-rarity-style ramp: gray -> green -> blue ->
// violet -> gold, low tier to high.
export const LOYALTY_TIER_COLORS = {
  0: "#9aa0a8", // Wild -- dull steel gray
  1: "#7fd99a", // Indifferent -- green
  2: "#5ac8e0", // Friendly -- cyan-blue
  3: "#b07adb", // Loyal -- violet
  4: "#f0c419", // Bonded -- radiant gold
};

export function loyaltyTierColor(tier) {
  return LOYALTY_TIER_COLORS[tier] ?? LOYALTY_TIER_COLORS[1];
}

// Ordered {value, label, color} list for rendering the tier legend (see
// SlugCard's loyalty tooltip) -- Object.keys on the maps above would sort
// numeric-looking string keys correctly anyway, but this keeps the render
// side from caring about that.
export const LOYALTY_TIERS = [0, 1, 2, 3, 4].map((value) => ({
  value,
  label: LOYALTY_TIER_LABELS[value],
  color: LOYALTY_TIER_COLORS[value],
}));

// Mirrors LOYALTY_CLASH_MODIFIERS/LOYALTY_ACCURACY_MODIFIERS in
// server/src/combatRules.js -- client-side estimate only, used to preview a
// slug's effective combat stats before firing. The server is always the
// authority on the real modifier when a shot actually resolves. Tier 1
// ("Indifferent") is the neutral baseline (both 0); tier 0 ("Wild") is
// actively worse than an untrained slug.
export const LOYALTY_CLASH_MODIFIERS = { 0: -2, 1: 0, 2: 2, 3: 4, 4: 6 };
export const LOYALTY_ACCURACY_MODIFIERS = { 0: -2, 1: 0, 2: 2, 3: 3, 4: 5 };

export function loyaltyClashModifier(tier) {
  return LOYALTY_CLASH_MODIFIERS[tier] ?? 0;
}

export function loyaltyAccuracyModifier(tier) {
  return LOYALTY_ACCURACY_MODIFIERS[tier] ?? 0;
}

export const CLASH_POWER_MIN = 1;
export const CLASH_POWER_MAX = 10;
export const CLASH_DEFENSE_MIN = 1;
export const CLASH_DEFENSE_MAX = 10;
export const AP_COST_MIN = 1;
export const AP_COST_MAX = 5;
export const ENERGY_PIPS_MIN = 1;
export const ENERGY_PIPS_MAX = 16;
export const LOYALTY_TIER_MIN = 0;
export const LOYALTY_TIER_MAX = 4;

export function typeColor(type) {
  return SLUG_TYPES.find((t) => t.key === type)?.color ?? "#c9a24b";
}

// Mirrors TYPE_BALLISTICS' `range` in server/src/combatRules.js (already
// includes that file's RANGE_SCALE) -- client-side estimate only, used to
// preview a slug's reach before firing. The server is always the authority
// on the real combinedRange when a shot actually resolves.
const TYPE_RANGES = {
  Air: 800,
  Dark: 500,
  Earth: 400,
  Electricity: 550,
  Energy: 500,
  Fire: 450,
  Healing: 450,
  Ice: 500,
  Light: 700,
  Metal: 450,
  None: 250,
  Plant: 450,
  Psychic: 450,
  Toxic: 500,
  Unique: 500,
  Water: 600,
};

export function typeRange(type) {
  return TYPE_RANGES[type] ?? TYPE_RANGES.Unique;
}

export function defaultSlugFields() {
  return {
    name: "",
    type: SLUG_TYPES[0].key,
    protoformImage: null,
    velocityImage: null,
    clashPower: 5,
    clashDefense: 5,
    apCost: 1,
    maxEnergyPips: 3,
    loyaltyTier: 0,
    velocityAbility: "",
    protoformUtility: "",
    breaksWalls: false,
    causesKnockback: false,
    wallMaker: false,
    bridgeMaker: false,
    aoeBlast: false,
    hazardMaker: false,
    causesBlind: false,
    causesSnare: false,
    causesShock: false,
    causesJam: false,
    piercesWalls: false,
    causesChain: false,
    ricochets: false,
    ultraFast: false,
    causesInvisible: false,
    causesFear: false,
    causesConfusion: false,
    trailWall: false,
    clashTripled: false,
    coneBlast: false,
    spawnsPods: false,
    mirageDecoy: false,
    starWall: false,
    anchorZone: false,
  };
}
