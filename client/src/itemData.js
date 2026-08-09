// Range values are on the same 25x scale as TYPE_BALLISTICS in
// server/src/combatRules.js -- see RANGE_SCALE there.
export const BASE_TYPES = {
  Pistol: { accuracy: 3, reloadApCost: 1, range: 4 * 25, modSlots: 2, magazineSize: 6 },
  Revolver: { accuracy: 2, reloadApCost: 1, range: 5 * 25, modSlots: 2, magazineSize: 6 },
  Repeater: { accuracy: 1, reloadApCost: 2, range: 5 * 25, modSlots: 3, magazineSize: 10 },
  Bow: { accuracy: 2, reloadApCost: 1, range: 6 * 25, modSlots: 2, magazineSize: 1 },
  Gatling: { accuracy: -1, reloadApCost: 3, range: 4 * 25, modSlots: 4, magazineSize: 20 },
  Cannon: { accuracy: -2, reloadApCost: 3, range: 3 * 25, modSlots: 3, magazineSize: 1 },
  "Twin Slinger": { accuracy: 1, reloadApCost: 2, range: 4 * 25, modSlots: 3, magazineSize: 12 },
  "Sniper Rig": { accuracy: 4, reloadApCost: 2, range: 9 * 25, modSlots: 2, magazineSize: 3 },
};

export const BASE_TYPE_KEYS = Object.keys(BASE_TYPES);

export const QUALITY_TIERS = [
  { tier: 0, label: "Crude", accuracyBonus: 0, failRate: 25 },
  { tier: 1, label: "Standard", accuracyBonus: 1, failRate: 15 },
  { tier: 2, label: "Fine", accuracyBonus: 2, failRate: 8 },
  { tier: 3, label: "Masterwork", accuracyBonus: 3, failRate: 3 },
  { tier: 4, label: "Legendary", accuracyBonus: 4, failRate: 0 },
];

export const QUALITY_MIN = 0;
export const QUALITY_MAX = QUALITY_TIERS.length - 1;

export const STAT_MIN = -10;
export const STAT_MAX = 20;
export const MOD_SLOTS_MIN = 0;
export const MOD_SLOTS_MAX = 10;
// Range lives on its own, much larger scale -- not a small stat like
// accuracy or mod slots. Mirrors RANGE_MIN/RANGE_MAX in server/itemRules.js.
export const RANGE_MIN = 0;
export const RANGE_MAX = 3000;

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

export function defaultBlasterFields(baseType = BASE_TYPE_KEYS[0]) {
  const base = BASE_TYPES[baseType];
  return {
    name: "",
    baseType,
    image: null,
    accuracy: base.accuracy,
    reloadApCost: base.reloadApCost,
    range: base.range,
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
  };
}
