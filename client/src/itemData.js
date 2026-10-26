// Range values are on the same 25x scale as TYPE_BALLISTICS in
// server/src/combatRules.js -- see RANGE_SCALE there. Mirrors
// server/src/itemRules.js's BASE_TYPES -- keep the two in sync.
// `speed` (map units/second) is the bolt's own actual travel speed --
// separate from `range`, which only decides how far a shot can reach.
// Editable per-instance same as range (see BlasterForm.jsx).
export const BASE_TYPES = {
  Pistol: { accuracy: 1, reloadApCost: 2, range: 7 * 25, speed: 88, modSlots: 2, magazineSize: 6 },
  Revolver: { accuracy: 3, reloadApCost: 3, range: 9 * 25, speed: 113, modSlots: 2, magazineSize: 6 },
  Repeater: { accuracy: 1, reloadApCost: 4, range: 11 * 25, speed: 138, modSlots: 3, magazineSize: 10 },
  Bow: { accuracy: 2, reloadApCost: 2, range: 13 * 25, speed: 163, modSlots: 4, magazineSize: 1 },
  Gatling: { accuracy: -2, reloadApCost: 6, range: 7 * 25, speed: 88, modSlots: 4, magazineSize: 20 },
  Cannon: { accuracy: -2, reloadApCost: 4, range: 5 * 25, speed: 63, modSlots: 3, magazineSize: 1 },
  "Twin Slinger": { accuracy: 0, reloadApCost: 3, range: 5 * 25, speed: 63, modSlots: 4, magazineSize: 12 },
  "Sniper Rig": { accuracy: 4, reloadApCost: 3, range: 18 * 25, speed: 225, modSlots: 4, magazineSize: 4 },
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
export const SPEED_BONUS_MIN = -150;
export const SPEED_BONUS_MAX = 150;

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
    quality: 0,
    grantsDualShot: false,
    grantsRangeFinder: false,
  };
}

// How many slugs a blaster holds: its own magazine plus any slots an equipped
// ammo belt adds (the server sends totalMagazineSize; see ammoBelt.js).
export function magazineCapacity(blaster) {
  return blaster?.totalMagazineSize ?? blaster?.magazineSize ?? 0;
}

// ---- Equipment (the Secondary slot's non-blaster occupants) ----------------

export const EQUIPMENT_KINDS = {
  melee: { label: "Melee Weapon", short: "Melee" },
  ammo_belt: { label: "Ammo Belt", short: "Ammo Belt" },
  shield: { label: "Shield", short: "Shield" },
  armor: { label: "Armor", short: "Armor" },
};
// Mirrors server/src/equipmentRules.js: melee, belts and shields share the
// Secondary slot (1); armor has its own (2).
export const SECONDARY_SLOT = 1;
export const ARMOR_SLOT = 2;
export function slotForKind(kind) {
  return kind === "armor" ? ARMOR_SLOT : SECONDARY_SLOT;
}
export const SHIELD_MAX_ABSORB = 100;
export const ARMOR_MAX_GRIT = 100;
export const MELEE_TYPES = {
  bludgeon: { label: "Bludgeon", note: "Knocks the target back" },
  slash: { label: "Slash", note: "Leaves the target bleeding" },
  pierce: { label: "Pierce", note: "Ignores shields" },
};
export const MELEE_TYPE_KEYS = Object.keys(MELEE_TYPES);
export const EQUIPMENT_KIND_KEYS = Object.keys(EQUIPMENT_KINDS);
export const MELEE_MAX_DAMAGE = 30;
export const MELEE_MAX_AP_COST = 8;
export const MELEE_MAX_REACH = 400;
export const BELT_MAX_EXTRA_SLOTS = 12;
// Mirrors server/src/equipmentRules.js (MELEE_DEFAULT_REACH = one Move's worth).
export const MELEE_DEFAULT_REACH = 80;

export function defaultEquipmentFields(kind = "melee") {
  return {
    kind,
    name: "",
    image: null,
    damage: 4,
    accuracy: 0,
    apCost: 2,
    reach: MELEE_DEFAULT_REACH,
    extraSlots: 4,
    meleeType: "slash",
    absorb: 10,
    gritBonus: 10,
  };
}

// What one swing does for a given STR modifier -- mirrors meleeDamageFor on the server.
export function meleeDamageFor(weaponDamage, strMod) {
  const damage = weaponDamage ?? 0;
  return Math.max(1, strMod < 1 ? damage + strMod : damage * strMod);
}

// How STR shapes a swing, for descriptions: a positive modifier multiplies the
// weapon's damage, anything lower is added to it.
export const MELEE_STR_NOTE = "x STR modifier if it is positive, otherwise + STR modifier (min 1)";

// One line on what a piece of equipment does -- shared by the card and the loadout slot.
export function equipmentSummary(item) {
  switch (item.kind) {
    case "melee":
      return `${MELEE_TYPES[item.meleeType]?.label ?? "Melee"} -- ${item.damage} damage, x STR if positive`;
    case "shield":
      return `Absorbs ${item.absorb} damage, then breaks until the fight ends`;
    case "armor":
      return `+${item.gritBonus} max Grit`;
    default:
      return `+${item.extraSlots} slug slots for your Primary`;
  }
}
