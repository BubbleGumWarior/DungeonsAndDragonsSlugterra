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
  1: "Bonded",
  2: "Trusted",
  3: "Fused",
};

export const CLASH_POWER_MIN = 1;
export const CLASH_POWER_MAX = 10;
export const CLASH_DEFENSE_MIN = 1;
export const CLASH_DEFENSE_MAX = 10;
export const AP_COST_MIN = 1;
export const AP_COST_MAX = 3;
export const ENERGY_PIPS_MIN = 1;
export const ENERGY_PIPS_MAX = 8;
export const LOYALTY_TIER_MIN = 0;
export const LOYALTY_TIER_MAX = 3;

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
  };
}
