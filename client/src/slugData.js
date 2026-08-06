export const SLUG_TYPES = [
  { key: "Fire", color: "#e0623f" },
  { key: "Water", color: "#4a9fd8" },
  { key: "Earth", color: "#a97c50" },
  { key: "Air", color: "#9fd8c9" },
  { key: "Electric", color: "#e0c53f" },
  { key: "Ice", color: "#8fd0e0" },
  { key: "Flash", color: "#e0a23f" },
  { key: "Rock", color: "#8a7d6b" },
  { key: "Metal", color: "#9aa5ad" },
  { key: "Toxic", color: "#8fc23f" },
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
  };
}
