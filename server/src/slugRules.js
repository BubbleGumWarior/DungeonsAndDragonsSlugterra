export const SLUG_TYPES = [
  "Air",
  "Dark",
  "Earth",
  "Electricity",
  "Energy",
  "Fire",
  "Healing",
  "Ice",
  "Light",
  "Metal",
  "None",
  "Plant",
  "Psychic",
  "Toxic",
  "Unique",
  "Water",
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
  breaksWalls,
  causesKnockback,
  wallMaker,
  bridgeMaker,
  aoeBlast,
  hazardMaker,
  causesBlind,
  causesSnare,
  causesShock,
  causesJam,
  piercesWalls,
  causesChain,
  ricochets,
  ultraFast,
  causesInvisible,
  causesFear,
  causesConfusion,
  trailWall,
  clashTripled,
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

  if (breaksWalls !== undefined && typeof breaksWalls !== "boolean") {
    return { valid: false, error: "Breaks Walls must be a boolean." };
  }
  if (causesKnockback !== undefined && typeof causesKnockback !== "boolean") {
    return { valid: false, error: "Causes Knockback must be a boolean." };
  }
  if (wallMaker !== undefined && typeof wallMaker !== "boolean") {
    return { valid: false, error: "Wall Maker must be a boolean." };
  }
  if (bridgeMaker !== undefined && typeof bridgeMaker !== "boolean") {
    return { valid: false, error: "Bridge Maker must be a boolean." };
  }
  if (aoeBlast !== undefined && typeof aoeBlast !== "boolean") {
    return { valid: false, error: "AOE Blast must be a boolean." };
  }
  if (hazardMaker !== undefined && typeof hazardMaker !== "boolean") {
    return { valid: false, error: "Hazard Maker must be a boolean." };
  }
  if (causesBlind !== undefined && typeof causesBlind !== "boolean") {
    return { valid: false, error: "Causes Blind must be a boolean." };
  }
  if (causesSnare !== undefined && typeof causesSnare !== "boolean") {
    return { valid: false, error: "Causes Snare must be a boolean." };
  }
  if (causesShock !== undefined && typeof causesShock !== "boolean") {
    return { valid: false, error: "Causes Shock must be a boolean." };
  }
  if (causesJam !== undefined && typeof causesJam !== "boolean") {
    return { valid: false, error: "Causes Jam must be a boolean." };
  }
  for (const [key, label] of [
    [piercesWalls, "Pierces Walls"],
    [causesChain, "Causes Chain"],
    [ricochets, "Ricochets"],
    [ultraFast, "Ultra Fast"],
    [causesInvisible, "Causes Invisible"],
    [causesFear, "Causes Fear"],
    [causesConfusion, "Causes Confusion"],
    [trailWall, "Trail Wall"],
    [clashTripled, "Clash Tripled"],
  ]) {
    if (key !== undefined && typeof key !== "boolean") {
      return { valid: false, error: `${label} must be a boolean.` };
    }
  }

  return { valid: true };
}

export function validateEnergyPips(pips, maxEnergyPips) {
  if (!Array.isArray(pips) || pips.length !== maxEnergyPips || !pips.every((p) => typeof p === "boolean")) {
    return { valid: false, error: `Energy pips must be an array of ${maxEnergyPips} booleans.` };
  }
  return { valid: true };
}
