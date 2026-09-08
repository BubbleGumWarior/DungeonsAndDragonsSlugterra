export const FRAME_TYPES = {
  Wolf: { speed: 4, handling: 4, armor: 1, rammingPower: 1, passengerCapacity: 1, modSlots: 3 },
  Panther: { speed: 4, handling: 5, armor: 1, rammingPower: 2, passengerCapacity: 1, modSlots: 2 },
  Jackal: { speed: 4, handling: 4, armor: 1, rammingPower: 2, passengerCapacity: 1, modSlots: 2 },
  Horse: { speed: 3, handling: 3, armor: 2, rammingPower: 1, passengerCapacity: 2, modSlots: 3 },
  Donkey: { speed: 2, handling: 2, armor: 2, rammingPower: 1, passengerCapacity: 2, modSlots: 2 },
  Bull: { speed: 1, handling: 1, armor: 4, rammingPower: 5, passengerCapacity: 1, modSlots: 3 },
  "Mammoth/Elephant": { speed: 1, handling: 0, armor: 5, rammingPower: 5, passengerCapacity: 3, modSlots: 4 },
  Warthog: { speed: 2, handling: 1, armor: 3, rammingPower: 4, passengerCapacity: 1, modSlots: 3 },
  Hyena: { speed: 3, handling: 3, armor: 1, rammingPower: 3, passengerCapacity: 1, modSlots: 2 },
  Snake: { speed: 2, handling: 5, armor: 1, rammingPower: 1, passengerCapacity: 1, modSlots: 2 },
  Mole: { speed: 2, handling: 2, armor: 2, rammingPower: 1, passengerCapacity: 1, modSlots: 2 },
  Chicken: { speed: 3, handling: 3, armor: 0, rammingPower: 0, passengerCapacity: 1, modSlots: 1 },
  "Saber Tooth": { speed: 3, handling: 2, armor: 2, rammingPower: 4, passengerCapacity: 1, modSlots: 3 },
};

export const FRAME_TYPE_KEYS = Object.keys(FRAME_TYPES);

// The three terrain abilities tracked as persistent flags on a mecha
// (server columns can_glide / can_aquatic / can_burrow). None is granted by
// default -- each turns on only while a mod that unlocks it is equipped.
export const TERRAIN_MODES = [
  { key: "glide", label: "Glide", flag: "canGlide", modeKey: "glider" },
  { key: "aquatic", label: "Aquatic", flag: "canAquatic", modeKey: "aquatic" },
  { key: "burrow", label: "Burrow", flag: "canBurrow", modeKey: "burrow" },
];

export const TIER_LABELS = [
  { tier: 0, label: "Roadworn", statBonus: 0, breakdownChance: 25, color: "#dd7a4a" },
  { tier: 1, label: "Forge-Standard", statBonus: 1, breakdownChance: 15, color: "#c9d1d9" },
  { tier: 2, label: "Forge-Tuned", statBonus: 2, breakdownChance: 8, color: "#7fd99a" },
  { tier: 3, label: "Blakk Custom", statBonus: 3, breakdownChance: 3, color: "#8fb8f0" },
  { tier: 4, label: "Legendary", statBonus: 4, breakdownChance: 0, color: "#e6cd93" },
];

export const TIER_MIN = 0;
export const TIER_MAX = TIER_LABELS.length - 1;

export function tierColor(tier) {
  return (TIER_LABELS[tier] ?? TIER_LABELS[0]).color;
}

export const MODES = [
  { key: "aquatic", label: "Aquatic" },
  { key: "glider", label: "Glider" },
  { key: "bike", label: "Bike" },
  { key: "burrow", label: "Burrow" },
];

export const MODE_KEYS = MODES.map((m) => m.key);

export const STAT_MIN = 0;
export const STAT_MAX = 10;
export const PASSENGER_MIN = 1;
export const PASSENGER_MAX = 6;
export const MOD_SLOTS_MIN = 0;
export const MOD_SLOTS_MAX = 8;
export const MOD_BONUS_MIN = -5;
export const MOD_BONUS_MAX = 5;
export const SPEED_MULT_MIN = 0.25;
export const SPEED_MULT_MAX = 5;

export function tierInfo(tier) {
  return TIER_LABELS[tier] ?? TIER_LABELS[0];
}

export function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function effectiveStats(mecha, equippedMods = []) {
  const tier = tierInfo(mecha.tier);
  // Speed resolves in two stages: every flat bonus (frame + tier + each mod's
  // speedBonus) is summed first, then the running product of every mod's
  // speedMultiplier is applied to that total. So a flat booster and the Bike
  // Conversion Kit's x2 stack -- boost, then double -- rather than one washing
  // out the other.
  const flatSpeed = mecha.speed + tier.statBonus + equippedMods.reduce((sum, m) => sum + m.speedBonus, 0);
  const speedMult = equippedMods.reduce((product, m) => product * (m.speedMultiplier ?? 1), 1);
  return {
    speed: Math.round(flatSpeed * speedMult),
    handling: mecha.handling + tier.statBonus + equippedMods.reduce((sum, m) => sum + m.handlingBonus, 0),
    armor: mecha.armor + tier.statBonus + equippedMods.reduce((sum, m) => sum + m.armorBonus, 0),
    rammingPower: mecha.rammingPower + tier.statBonus + equippedMods.reduce((sum, m) => sum + m.rammingBonus, 0),
  };
}

// Modes granted purely by the currently-equipped mods. Used for the "bike"
// badge; glide / aquatic / burrow are read from the mecha's own flags instead.
export function unlockedModes(equippedMods = []) {
  const modes = new Set();
  for (const mod of equippedMods) {
    if (mod.unlocksMode) modes.add(mod.unlocksMode);
  }
  return modes;
}

export function defaultMechaFields(frameType = FRAME_TYPE_KEYS[0]) {
  const base = FRAME_TYPES[frameType];
  return {
    name: "",
    frameType,
    image: null,
    speed: base.speed,
    handling: base.handling,
    armor: base.armor,
    rammingPower: base.rammingPower,
    passengerCapacity: base.passengerCapacity,
    modSlots: base.modSlots,
    tier: 0,
  };
}

export function defaultMechaModFields() {
  return {
    name: "",
    effect: "",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  };
}
