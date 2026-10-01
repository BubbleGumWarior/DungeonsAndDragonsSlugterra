// Range values are on the same 25x scale as TYPE_BALLISTICS in
// server/src/combatRules.js -- see RANGE_SCALE there. Mirrors
// server/src/itemRules.js's BASE_TYPES -- keep the two in sync.
// `speed` (map units/second) is the bolt's own actual travel speed --
// separate from `range`, which only decides how far a shot can reach.
// Editable per-instance same as range (see BlasterForm.jsx).
export const BASE_TYPES = {
  Pistol: { accuracy: 1, reloadApCost: 1, range: 7 * 25, speed: 7 * 8, modSlots: 2, magazineSize: 6 },
  Revolver: { accuracy: 3, reloadApCost: 2, range: 9 * 25, speed: 9 * 8, modSlots: 2, magazineSize: 6 },
  Repeater: { accuracy: 1, reloadApCost: 3, range: 11 * 25, speed: 11 * 8, modSlots: 3, magazineSize: 10 },
  Bow: { accuracy: 2, reloadApCost: 1, range: 13 * 25, speed: 13 * 8, modSlots: 4, magazineSize: 1 },
  Gatling: { accuracy: -2, reloadApCost: 5, range: 7 * 25, speed: 7 * 8, modSlots: 4, magazineSize: 20 },
  Cannon: { accuracy: -2, reloadApCost: 3, range: 5 * 25, speed: 5 * 8, modSlots: 3, magazineSize: 1 },
  "Twin Slinger": { accuracy: 0, reloadApCost: 2, range: 5 * 25, speed: 5 * 8, modSlots: 4, magazineSize: 12 },
  "Sniper Rig": { accuracy: 4, reloadApCost: 2, range: 18 * 25, speed: 18 * 8, modSlots: 4, magazineSize: 4 },
};

// A few base types carry a combat effect beyond their raw stats (resolved
// server-side in routes/combat.js -- see BASE_TYPE_EFFECTS in itemRules.js):
//   Bow     -- the attack roll also gets the shooter's own DEX modifier.
//   Gatling -- every slug it fires costs 2 less AP to shoot (never below 1).
//   Cannon  -- the slug it fires gets +3 clash power.
export const BASE_TYPE_EFFECT_NOTES = {
  Bow: "Attack roll adds the shooter's DEX modifier.",
  Gatling: "Slug AP cost to shoot is reduced by 2 (minimum 1).",
  Cannon: "The fired slug gets +3 clash power.",
};

export const BASE_TYPE_KEYS = Object.keys(BASE_TYPES);

export const QUALITY_TIERS = [
  { tier: 0, label: "Crude", accuracyBonus: 0, failRate: 25, color: "#dd7a4a" },
  { tier: 1, label: "Standard", accuracyBonus: 1, failRate: 15, color: "#c9d1d9" },
  { tier: 2, label: "Fine", accuracyBonus: 2, failRate: 8, color: "#7fd99a" },
  { tier: 3, label: "Masterwork", accuracyBonus: 3, failRate: 3, color: "#8fb8f0" },
  { tier: 4, label: "Legendary", accuracyBonus: 4, failRate: 0, color: "#e6cd93" },
];

export const QUALITY_MIN = 0;
export const QUALITY_MAX = QUALITY_TIERS.length - 1;

export function qualityColor(tier) {
  return (QUALITY_TIERS[tier] ?? QUALITY_TIERS[0]).color;
}

export const STAT_MIN = -10;
export const STAT_MAX = 20;
export const MOD_SLOTS_MIN = 0;
export const MOD_SLOTS_MAX = 10;
// Range lives on its own, much larger scale -- not a small stat like
// accuracy or mod slots. Mirrors RANGE_MIN/RANGE_MAX in server/itemRules.js.
export const RANGE_MIN = 0;
export const RANGE_MAX = 3000;
// Speed (map units/second) -- must be positive. Mirrors SPEED_MIN/SPEED_MAX
// in server/itemRules.js.
export const SPEED_MIN = 1;
export const SPEED_MAX = 2000;
// A mod's speed bonus lives on the same rough scale as blaster.speed itself
// (tens, not the small -10..20 accuracy/reload bonus range). Mirrors
// SPEED_BONUS_MIN/SPEED_BONUS_MAX in server/itemRules.js.
export const SPEED_BONUS_MIN = -100;
export const SPEED_BONUS_MAX = 100;

export function qualityInfo(tier) {
  return QUALITY_TIERS[tier] ?? QUALITY_TIERS[0];
}

export function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function effectiveAccuracy(blaster, equippedMods) {
  const quality = qualityInfo(blaster.quality);
  const modBonus = equippedMods.reduce((sum, m) => sum + m.accuracyBonus, 0);
  return blaster.accuracy + quality.accuracyBonus + modBonus;
}

export function effectiveReloadApCost(blaster, equippedMods) {
  const modBonus = equippedMods.reduce((sum, m) => sum + m.reloadApBonus, 0);
  return Math.max(1, blaster.reloadApCost + modBonus);
}

// Mirrors the server's blasterEffectiveSpeed (routes/combat.js) -- a real,
// applied bonus (drives actual shot timing), not just a cosmetic number.
export function effectiveSpeed(blaster, equippedMods) {
  const modBonus = equippedMods.reduce((sum, m) => sum + (m.speedBonus || 0), 0);
  return Math.max(1, blaster.speed + modBonus);
}

export function defaultBlasterFields(baseType = BASE_TYPE_KEYS[0]) {
  const base = BASE_TYPES[baseType];
  return {
    name: "",
    baseType,
    image: null,
    accuracy: base.accuracy,
    reloadApCost: base.reloadApCost,
    range: base.range,
    speed: base.speed,
    modSlots: base.modSlots,
    magazineSize: base.magazineSize,
    quality: 0,
  };
}

export function defaultModFields() {
  return {
    name: "",
    effect: "",
    accuracyBonus: 0,
    reloadApBonus: 0,
    speedBonus: 0,
    grantsDualShot: false,
    grantsRangeFinder: false,
  };
}
