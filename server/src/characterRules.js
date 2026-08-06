export const STAT_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

export const PROFICIENCY_KEYS = [
  "athletics",
  "acrobatics",
  "sleightOfHand",
  "stealth",
  "arcana",
  "history",
  "investigation",
  "nature",
  "religion",
  "creatureHandling",
  "insight",
  "medicine",
  "perception",
  "survival",
  "deception",
  "intimidation",
  "performance",
  "persuasion",
];

export const PROFICIENCY_STATS = {
  athletics: "strength",
  acrobatics: "dexterity",
  sleightOfHand: "dexterity",
  stealth: "dexterity",
  arcana: "intelligence",
  history: "intelligence",
  investigation: "intelligence",
  nature: "intelligence",
  religion: "intelligence",
  creatureHandling: "wisdom",
  insight: "wisdom",
  medicine: "wisdom",
  perception: "wisdom",
  survival: "wisdom",
  deception: "charisma",
  intimidation: "charisma",
  performance: "charisma",
  persuasion: "charisma",
};

export const PROFICIENCY_LABELS = {
  athletics: "Athletics",
  acrobatics: "Acrobatics",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  arcana: "Arcana",
  history: "History",
  investigation: "Investigation",
  nature: "Nature",
  religion: "Religion",
  creatureHandling: "Creature Handling",
  insight: "Insight",
  medicine: "Medicine",
  perception: "Perception",
  survival: "Survival",
  deception: "Deception",
  intimidation: "Intimidation",
  performance: "Performance",
  persuasion: "Persuasion",
};

const TOTAL_STAT_POINTS = 27;
const REQUIRED_PROFICIENCIES = 5;
const MAX_PORTRAIT_BYTES = 2 * 1024 * 1024;
const MIN_STAT = 8;
const MAX_STAT = 15;
const DM_MIN_STAT = 1;
const DM_MAX_STAT = 30;

const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function statCost(value) {
  return POINT_BUY_COSTS[value] ?? 0;
}

export function validateCharacterPayload({ name, age, portrait, stats, proficiencies }, { unrestricted = false } = {}) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return { valid: false, error: "Name must be a non-empty string of 40 characters or fewer." };
  }

  if (age !== undefined && age !== null) {
    if (!Number.isInteger(age) || age < 1 || age > 999) {
      return { valid: false, error: "Age must be an integer between 1 and 999." };
    }
  }

  if (portrait !== undefined && portrait !== null) {
    if (typeof portrait !== "string" || !portrait.startsWith("data:image/")) {
      return { valid: false, error: "Portrait must be a base64 image data URL." };
    }
    if (portrait.length > MAX_PORTRAIT_BYTES) {
      return { valid: false, error: "Portrait image is too large." };
    }
  }

  if (!stats || typeof stats !== "object") {
    return { valid: false, error: "Stats are required." };
  }
  const minStat = unrestricted ? DM_MIN_STAT : MIN_STAT;
  const maxStat = unrestricted ? DM_MAX_STAT : MAX_STAT;
  let totalCost = 0;
  for (const key of STAT_KEYS) {
    const value = stats[key];
    if (!Number.isInteger(value) || value < minStat || value > maxStat) {
      return { valid: false, error: `Stat "${key}" must be an integer between ${minStat} and ${maxStat}.` };
    }
    if (!unrestricted) {
      totalCost += statCost(value);
    }
  }
  if (Object.keys(stats).length !== STAT_KEYS.length) {
    return { valid: false, error: "Stats contain unexpected keys." };
  }
  if (!unrestricted && totalCost !== TOTAL_STAT_POINTS) {
    return { valid: false, error: `Stat points must total exactly ${TOTAL_STAT_POINTS}.` };
  }

  if (!Array.isArray(proficiencies)) {
    return { valid: false, error: "Proficiencies must be an array." };
  }
  if (!unrestricted && proficiencies.length !== REQUIRED_PROFICIENCIES) {
    return { valid: false, error: `Choose exactly ${REQUIRED_PROFICIENCIES} proficiencies.` };
  }
  const uniqueProficiencies = new Set(proficiencies);
  if (uniqueProficiencies.size !== proficiencies.length) {
    return { valid: false, error: "Proficiencies must be unique." };
  }
  for (const key of proficiencies) {
    if (!PROFICIENCY_KEYS.includes(key)) {
      return { valid: false, error: `Unknown proficiency "${key}".` };
    }
  }

  return { valid: true };
}

export function validateKnockoutPips(pips) {
  if (!Array.isArray(pips) || pips.length !== 3 || !pips.every((p) => typeof p === "boolean")) {
    return { valid: false, error: "Knockout pips must be an array of 3 booleans." };
  }
  return { valid: true };
}

export function statModifier(value) {
  return Math.floor((value - 10) / 2);
}

export function skillModifier(stats, proficiencies, skillKey) {
  const statKey = PROFICIENCY_STATS[skillKey];
  if (!statKey) return 0;
  const isProficient = Array.isArray(proficiencies) && proficiencies.includes(skillKey);
  return statModifier(stats[statKey]) + (isProficient ? 2 : 0);
}

export function computeMaxGrit(stats) {
  return 20 + statModifier(stats.constitution) * 5 + statModifier(stats.dexterity);
}

export function validateCurrentGrit(value, stats) {
  const max = computeMaxGrit(stats);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    return { valid: false, error: `Current Grit must be an integer between 0 and ${max}.` };
  }
  return { valid: true };
}
