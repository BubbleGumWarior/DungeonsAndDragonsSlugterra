export const STATS = [
  {
    key: "strength",
    label: "Strength",
    abbr: "STR",
    description: "Physical power — melee scuffles, hauling gear, forcing stuck cavern doors.",
  },
  {
    key: "dexterity",
    label: "Dexterity",
    abbr: "DEX",
    description: "Agility and reflexes — dodging blasts, fast-draws, initiative, trick shots.",
  },
  {
    key: "constitution",
    label: "Constitution",
    abbr: "CON",
    description: "Toughness and stamina — enduring cavern hazards, resisting fatigue, max Grit.",
  },
  {
    key: "intelligence",
    label: "Intelligence",
    abbr: "INT",
    description: "Knowledge and reasoning — ancient tech, cavern lore, tactical analysis.",
  },
  {
    key: "wisdom",
    label: "Wisdom",
    abbr: "WIS",
    description: "Perception and instinct — reading a room, bonding with slugs, survival smarts.",
  },
  {
    key: "charisma",
    label: "Charisma",
    abbr: "CHA",
    description: "Force of personality — persuasion, showmanship, rallying your team.",
  },
];

const SCORE_BANDS = [
  { max: 7, label: "Feeble" },
  { max: 9, label: "Below Average" },
  { max: 11, label: "Average" },
  { max: 13, label: "Above Average" },
  { max: 15, label: "Exceptional" },
  { max: 17, label: "Superhuman" },
  { max: 20, label: "Legendary" },
  { max: 25, label: "Mythic" },
  { max: Infinity, label: "Godlike" },
];

export function scoreLabel(score) {
  return SCORE_BANDS.find((band) => score <= band.max)?.label ?? "Godlike";
}

export const TOTAL_STAT_POINTS = 27;
export const MIN_STAT = 8;
export const MAX_STAT = 15;
export const DM_MIN_STAT = 1;
export const DM_MAX_STAT = 30;

const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function statCost(value) {
  return POINT_BUY_COSTS[value] ?? 0;
}

export function totalStatCost(stats) {
  return STATS.reduce((sum, { key }) => sum + statCost(stats[key]), 0);
}

export function defaultStats() {
  return STATS.reduce((acc, { key }) => ({ ...acc, [key]: MIN_STAT }), {});
}

export function statModifier(value) {
  return Math.floor((value - 10) / 2);
}

export function skillModifier(statValue, isProficient) {
  return statModifier(statValue) + (isProficient ? 2 : 0);
}

export function formatModifier(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function maxGrit(stats) {
  return 20 + statModifier(stats.constitution) * 5 + statModifier(stats.dexterity);
}

export function initiativeBonus(stats) {
  return statModifier(stats.dexterity);
}

export function actionPoints(stats) {
  return Math.max(3, 3 * statModifier(stats.dexterity));
}

export function defaultKnockoutPips() {
  return [false, false, false];
}

export const REQUIRED_PROFICIENCIES = 5;

export const PROFICIENCIES = [
  { key: "athletics", label: "Athletics", stat: "strength", description: "Climbing cavern walls, forcing doors, feats of raw strength." },
  { key: "acrobatics", label: "Acrobatics", stat: "dexterity", description: "Tumbling, balance, and dodging incoming slugs in high-speed duels." },
  { key: "sleightOfHand", label: "Sleight of Hand", stat: "dexterity", description: "Fast-draws, quick-loading slugs, pickpocketing." },
  { key: "stealth", label: "Stealth", stat: "dexterity", description: "Moving silently through the caverns, staying out of sight." },
  { key: "arcana", label: "Arcana", stat: "intelligence", description: "Understanding ancient energies and ghoul-slug phenomena." },
  { key: "history", label: "History", stat: "intelligence", description: "Recalling cavern civilizations, old feuds, and the buried lore of ancient slugs." },
  { key: "investigation", label: "Investigation", stat: "intelligence", description: "Piecing together clues from corporate data logs or cave-ins." },
  { key: "nature", label: "Nature", stat: "intelligence", description: "Knowledge of cavern ecosystems, terrain, and wild slug habitats." },
  { key: "religion", label: "Religion", stat: "intelligence", description: "Understanding the myths and legends surrounding the Elder Slugs." },
  { key: "creatureHandling", label: "Creature Handling", stat: "wisdom", description: "Calming enraged or wild slugs; bonding with your own." },
  { key: "insight", label: "Insight", stat: "wisdom", description: "Reading a slinger's intentions or catching a bluff." },
  { key: "medicine", label: "Medicine", stat: "wisdom", description: "Treating injuries from a duel gone wrong — slinger or slug alike." },
  { key: "perception", label: "Perception", stat: "wisdom", description: "Spotting hidden items, traps, enemies, or a slug about to strike." },
  { key: "survival", label: "Survival", stat: "wisdom", description: "Tracking wild slugs, foraging, and enduring the deep caverns." },
  { key: "deception", label: "Deception", stat: "charisma", description: "Bluffing a rival slinger or talking your way past a guard." },
  { key: "intimidation", label: "Intimidation", stat: "charisma", description: "Cowing an opponent before the duel even starts." },
  { key: "performance", label: "Performance", stat: "charisma", description: "Showmanship in the slinging arena — working a crowd with your slug's best tricks." },
  { key: "persuasion", label: "Persuasion", stat: "charisma", description: "Winning someone over with words rather than slugs." },
];

export function statByKey(key) {
  return STATS.find((s) => s.key === key);
}
