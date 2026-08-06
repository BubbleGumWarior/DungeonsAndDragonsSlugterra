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

// Frames that innately grant a terrain mode with no mod required.
export const FRAME_INNATE_MODES = {
  Mole: "burrow",
};

export const TIER_LABELS = [
  { tier: 0, label: "Roadworn", statBonus: 0, breakdownChance: 25 },
  { tier: 1, label: "Forge-Standard", statBonus: 1, breakdownChance: 15 },
  { tier: 2, label: "Forge-Tuned", statBonus: 2, breakdownChance: 8 },
  { tier: 3, label: "Blakk Custom", statBonus: 3, breakdownChance: 3 },
  { tier: 4, label: "Legendary", statBonus: 4, breakdownChance: 0 },
];

export const TIER_MIN = 0;
export const TIER_MAX = TIER_LABELS.length - 1;

export const MODE_KEYS = ["aquatic", "glider", "bike", "burrow"];

export const STAT_MIN = 0;
export const STAT_MAX = 10;
export const PASSENGER_MIN = 1;
export const PASSENGER_MAX = 6;
export const MOD_SLOTS_MIN = 0;
export const MOD_SLOTS_MAX = 6;
export const MOD_BONUS_MIN = -5;
export const MOD_BONUS_MAX = 5;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH = 500;

function validateImage(image, label) {
  if (image === undefined || image === null) return null;
  if (typeof image !== "string") {
    return `${label} must be a string.`;
  }
  // Accept either an uploaded base64 data URL, or a static asset path (for seeded defaults).
  const isDataUrl = image.startsWith("data:image/");
  const isStaticPath = image.startsWith("/");
  if (!isDataUrl && !isStaticPath) {
    return `${label} must be a base64 image data URL or a static asset path.`;
  }
  if (isDataUrl && image.length > MAX_IMAGE_BYTES) {
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

function validateStat(value, label, min = STAT_MIN, max = STAT_MAX) {
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${label} must be an integer between ${min} and ${max}.`;
  }
  return null;
}

export function validateMechaFields({
  name,
  frameType,
  image,
  speed,
  handling,
  armor,
  rammingPower,
  passengerCapacity,
  modSlots,
  tier,
}) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return { valid: false, error: "Name must be a non-empty string of 40 characters or fewer." };
  }
  if (!FRAME_TYPE_KEYS.includes(frameType)) {
    return { valid: false, error: `Frame Type must be one of: ${FRAME_TYPE_KEYS.join(", ")}.` };
  }
  const imageError = validateImage(image, "Image");
  if (imageError) return { valid: false, error: imageError };

  for (const [value, label] of [
    [speed, "Speed"],
    [handling, "Handling"],
    [armor, "Armor"],
    [rammingPower, "Ramming Power"],
  ]) {
    const err = validateStat(value, label);
    if (err) return { valid: false, error: err };
  }

  const passengerErr = validateStat(passengerCapacity, "Passenger Capacity", PASSENGER_MIN, PASSENGER_MAX);
  if (passengerErr) return { valid: false, error: passengerErr };

  const modSlotsErr = validateStat(modSlots, "Mod Slots", MOD_SLOTS_MIN, MOD_SLOTS_MAX);
  if (modSlotsErr) return { valid: false, error: modSlotsErr };

  if (!Number.isInteger(tier) || tier < TIER_MIN || tier > TIER_MAX) {
    return { valid: false, error: `Tier must be an integer between ${TIER_MIN} and ${TIER_MAX}.` };
  }

  return { valid: true };
}

export function validateMechaModFields({ name, effect, speedBonus, handlingBonus, armorBonus, rammingBonus, unlocksMode }) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return { valid: false, error: "Name must be a non-empty string of 40 characters or fewer." };
  }

  const effectError = validateText(effect, "Effect");
  if (effectError) return { valid: false, error: effectError };

  for (const [value, label] of [
    [speedBonus, "Speed Bonus"],
    [handlingBonus, "Handling Bonus"],
    [armorBonus, "Armor Bonus"],
    [rammingBonus, "Ramming Bonus"],
  ]) {
    const err = validateStat(value, label, MOD_BONUS_MIN, MOD_BONUS_MAX);
    if (err) return { valid: false, error: err };
  }

  if (unlocksMode !== null && unlocksMode !== undefined && !MODE_KEYS.includes(unlocksMode)) {
    return { valid: false, error: `Unlocks Mode must be one of: ${MODE_KEYS.join(", ")}, or null.` };
  }

  return { valid: true };
}
