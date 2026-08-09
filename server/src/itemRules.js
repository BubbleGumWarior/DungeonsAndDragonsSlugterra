// Range values here are on the same 25x scale as TYPE_BALLISTICS in
// combatRules.js (see RANGE_SCALE there) -- kept as defaults for newly
// created blaster templates so new gear lands on the same scale as slug
// type ranges, which is what actually decides a shot's effective reach in
// combat (combinedRange = max(blaster.range, slug type's range)).
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

const QUALITY_MIN = 0;
const QUALITY_MAX = QUALITY_TIERS.length - 1;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH = 500;
const STAT_MIN = -10;
const STAT_MAX = 20;
// Range lives on its own, much larger scale (see RANGE_SCALE in
// combatRules.js) -- it isn't a small stat like accuracy or mod slots.
const RANGE_MIN = 0;
const RANGE_MAX = 3000;

function validateImage(image, label) {
  if (image === undefined || image === null) return null;
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return `${label} must be a base64 image data URL.`;
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return `${label} image is too large.`;
  }
  return null;
}

function validateText(text, label) {
  if (text === undefined || text === null) return null;
  if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) {
    return `${label} must be a string of ${MAX_TEXT_LENGTH} characters or fewer.`;
  }
  return null;
}

function validateStat(value, label) {
  if (!Number.isInteger(value) || value < STAT_MIN || value > STAT_MAX) {
    return `${label} must be an integer between ${STAT_MIN} and ${STAT_MAX}.`;
  }
  return null;
}

function validateRange(value, label) {
  if (!Number.isInteger(value) || value < RANGE_MIN || value > RANGE_MAX) {
    return `${label} must be an integer between ${RANGE_MIN} and ${RANGE_MAX}.`;
  }
  return null;
}

export function validateBlasterFields({ name, baseType, image, accuracy, reloadApCost, range, modSlots, magazineSize, quality }) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return { valid: false, error: "Name must be a non-empty string of 40 characters or fewer." };
  }
  if (!BASE_TYPE_KEYS.includes(baseType)) {
    return { valid: false, error: `Base type must be one of: ${BASE_TYPE_KEYS.join(", ")}.` };
  }
  const imageError = validateImage(image, "Image");
  if (imageError) return { valid: false, error: imageError };

  const rangeError = validateRange(range, "Range");
  if (rangeError) return { valid: false, error: rangeError };

  for (const [value, label] of [
    [accuracy, "Accuracy"],
    [reloadApCost, "Reload AP Cost"],
    [modSlots, "Mod Slots"],
    [magazineSize, "Magazine Size"],
  ]) {
    const err = validateStat(value, label);
    if (err) return { valid: false, error: err };
  }
  if (modSlots < 0 || modSlots > 10) {
    return { valid: false, error: "Mod Slots must be between 0 and 10." };
  }
  if (!Number.isInteger(quality) || quality < QUALITY_MIN || quality > QUALITY_MAX) {
    return { valid: false, error: `Quality must be an integer between ${QUALITY_MIN} and ${QUALITY_MAX}.` };
  }

  return { valid: true };
}

export function validateModFields({ name, effect, accuracyBonus, reloadApBonus }) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return { valid: false, error: "Name must be a non-empty string of 40 characters or fewer." };
  }

  const effectError = validateText(effect, "Effect");
  if (effectError) return { valid: false, error: effectError };

  const accErr = validateStat(accuracyBonus, "Accuracy Bonus");
  if (accErr) return { valid: false, error: accErr };
  const reloadErr = validateStat(reloadApBonus, "Reload AP Bonus");
  if (reloadErr) return { valid: false, error: reloadErr };

  return { valid: true };
}
