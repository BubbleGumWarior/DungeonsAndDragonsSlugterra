export const SLUG_TYPES = [
  "Fire",
  "Water",
  "Earth",
  "Air",
  "Electric",
  "Ice",
  "Flash",
  "Rock",
  "Metal",
  "Toxic",
];

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

const MAX_TEXT_LENGTH = 500;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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

export function validateSlugFields({
  name,
  type,
  protoformImage,
  velocityImage,
  clashPower,
  clashDefense,
  apCost,
  maxEnergyPips,
  loyaltyTier,
  velocityAbility,
  protoformUtility,
}) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return { valid: false, error: "Name must be a non-empty string of 40 characters or fewer." };
  }

  if (!SLUG_TYPES.includes(type)) {
    return { valid: false, error: `Type must be one of: ${SLUG_TYPES.join(", ")}.` };
  }

  const protoformError = validateImage(protoformImage, "Protoform");
  if (protoformError) return { valid: false, error: protoformError };

  const velocityError = validateImage(velocityImage, "Velocity");
  if (velocityError) return { valid: false, error: velocityError };

  if (!Number.isInteger(clashPower) || clashPower < CLASH_POWER_MIN || clashPower > CLASH_POWER_MAX) {
    return { valid: false, error: `Clash Power must be an integer between ${CLASH_POWER_MIN} and ${CLASH_POWER_MAX}.` };
  }

  if (!Number.isInteger(clashDefense) || clashDefense < CLASH_DEFENSE_MIN || clashDefense > CLASH_DEFENSE_MAX) {
    return { valid: false, error: `Clash Defense must be an integer between ${CLASH_DEFENSE_MIN} and ${CLASH_DEFENSE_MAX}.` };
  }

  if (!Number.isInteger(apCost) || apCost < AP_COST_MIN || apCost > AP_COST_MAX) {
    return { valid: false, error: `AP Cost must be an integer between ${AP_COST_MIN} and ${AP_COST_MAX}.` };
  }

  if (!Number.isInteger(maxEnergyPips) || maxEnergyPips < ENERGY_PIPS_MIN || maxEnergyPips > ENERGY_PIPS_MAX) {
    return { valid: false, error: `Max Energy Pips must be an integer between ${ENERGY_PIPS_MIN} and ${ENERGY_PIPS_MAX}.` };
  }

  if (!Number.isInteger(loyaltyTier) || loyaltyTier < LOYALTY_TIER_MIN || loyaltyTier > LOYALTY_TIER_MAX) {
    return { valid: false, error: `Loyalty Tier must be an integer between ${LOYALTY_TIER_MIN} and ${LOYALTY_TIER_MAX}.` };
  }

  const velocityAbilityError = validateText(velocityAbility, "Velocity Ability");
  if (velocityAbilityError) return { valid: false, error: velocityAbilityError };

  const protoformUtilityError = validateText(protoformUtility, "Protoform Utility");
  if (protoformUtilityError) return { valid: false, error: protoformUtilityError };

  return { valid: true };
}

export function validateEnergyPips(pips, maxEnergyPips) {
  if (!Array.isArray(pips) || pips.length !== maxEnergyPips || !pips.every((p) => typeof p === "boolean")) {
    return { valid: false, error: `Energy pips must be an array of ${maxEnergyPips} booleans.` };
  }
  return { valid: true };
}
