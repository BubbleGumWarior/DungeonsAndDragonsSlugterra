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
    // "Blasts" survives the word-swap untouched (it isn't slug/slinger/
    // cavern) but "dodging blasts" is itself a dead giveaway, so this one
    // needs a real rewrite rather than a find-and-replace.
    hiddenDescription: "Agility and reflexes — dodging attacks, fast-draws, initiative, trick shots.",
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
  return Math.max(8, 6 + 3 * statModifier(stats.dexterity));
}

export function defaultKnockoutPips() {
  return [false, false, false];
}

export const REQUIRED_PROFICIENCIES = 5;

export const PROFICIENCIES = [
  { key: "athletics", label: "Athletics", stat: "strength", description: "Climbing cavern walls, forcing doors, feats of raw strength." },
  {
    key: "acrobatics",
    label: "Acrobatics",
    stat: "dexterity",
    description: "Tumbling, balance, and dodging incoming slugs in high-speed duels.",
    // "Dodging incoming creatures in high-speed duels" still reads as
    // dodging thrown/fired projectiles even after the word-swap -- needs an
    // actual rewrite, not just a synonym.
    hiddenDescription: "Tumbling, balance, and dodging incoming attacks in fast-paced duels.",
  },
  {
    key: "sleightOfHand",
    label: "Sleight of Hand",
    stat: "dexterity",
    description: "Fast-draws, quick-loading slugs, pickpocketing.",
    // "Quick-loading creatures" gives away that they get loaded into
    // something like ammunition -- swap the noun itself, not just its name.
    hiddenDescription: "Fast-draws, quick-loading gear, pickpocketing.",
  },
  { key: "stealth", label: "Stealth", stat: "dexterity", description: "Moving silently through the caverns, staying out of sight." },
  {
    key: "arcana",
    label: "Arcana",
    stat: "intelligence",
    description: "Understanding ancient energies and ghoul-slug phenomena.",
    hiddenDescription: "Understanding ancient energies and strange arcane phenomena.",
  },
  { key: "history", label: "History", stat: "intelligence", description: "Recalling cavern civilizations, old feuds, and the buried lore of ancient slugs." },
  {
    key: "investigation",
    label: "Investigation",
    stat: "intelligence",
    description: "Piecing together clues from corporate data logs or cave-ins.",
    // "Cave-ins" isn't slug/slinger/cavern so the word-swap never touches
    // it, but it's the same underground giveaway as "cavern" itself.
    hiddenDescription: "Piecing together clues from corporate data logs or the wreckage of a landslide.",
  },
  { key: "nature", label: "Nature", stat: "intelligence", description: "Knowledge of cavern ecosystems, terrain, and wild slug habitats." },
  { key: "religion", label: "Religion", stat: "intelligence", description: "Understanding the myths and legends surrounding the Elder Slugs." },
  { key: "creatureHandling", label: "Creature Handling", stat: "wisdom", description: "Calming enraged or wild slugs; bonding with your own." },
  { key: "insight", label: "Insight", stat: "wisdom", description: "Reading a slinger's intentions or catching a bluff." },
  { key: "medicine", label: "Medicine", stat: "wisdom", description: "Treating injuries from a duel gone wrong — slinger or slug alike." },
  { key: "perception", label: "Perception", stat: "wisdom", description: "Spotting hidden items, traps, enemies, or a slug about to strike." },
  { key: "survival", label: "Survival", stat: "wisdom", description: "Tracking wild slugs, foraging, and enduring the deep caverns." },
  { key: "deception", label: "Deception", stat: "charisma", description: "Bluffing a rival slinger or talking your way past a guard." },
  { key: "intimidation", label: "Intimidation", stat: "charisma", description: "Cowing an opponent before the duel even starts." },
  {
    key: "performance",
    label: "Performance",
    stat: "charisma",
    description: "Showmanship in the slinging arena — working a crowd with your slug's best tricks.",
    // "Working a crowd with your creature's best tricks" still paints a
    // trained-performing-creature spectacle -- close enough to the real
    // thing that it's worth a genuine rewrite.
    hiddenDescription: "Showmanship in the dueling arena — working a crowd with your own flair.",
  },
  {
    key: "persuasion",
    label: "Persuasion",
    stat: "charisma",
    description: "Winning someone over with words rather than slugs.",
    // The original is a pun ("words instead of a fight"); "words rather
    // than creatures" loses that meaning entirely, so swap the noun instead.
    hiddenDescription: "Winning someone over with words rather than force.",
  },
];

export function statByKey(key) {
  return STATS.find((s) => s.key === key);
}

// Stat/proficiency description text was written slug-first ("bonding with
// slugs", "a rival slinger", "cavern lore") since that's the whole point of
// the app -- but before the DM reveals Slugterra, character creation and
// sheets are supposed to stay as in-the-dark as the nav labels already are
// (see Dashboard/Slugs.jsx's "Slugs" vs "Creatures" toggle). Rather than
// hand-writing a parallel "hidden" copy of every description, swap the
// handful of words that actually give it away wherever they show up.
function swapWord(text, pattern, singular, plural) {
  return text.replace(pattern, (match) => {
    const replacement = /s$/i.test(match) ? plural : singular;
    return match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  });
}

export function veilSlugTerms(text, revealed) {
  if (revealed || !text) return text;
  let result = swapWord(text, /\bslugs?\b/gi, "creature", "creatures");
  result = swapWord(result, /\bslingers?\b/gi, "mage", "mages");
  result = result.replace(/\bslinging\b/gi, (match) => (match[0] === match[0].toUpperCase() ? "Dueling" : "dueling"));
  result = swapWord(result, /\bcaverns?\b/gi, "mountain", "mountains");
  return result;
}

// Some descriptions still read as obviously Slugterra even after every
// giveaway word is swapped out ("dodging incoming creatures in high-speed
// duels" is still very clearly about dodging thrown/fired things) -- those
// get a real hand-written `hiddenDescription` on the entry itself instead.
// Everything else still goes through the generic word-swap above.
export function describeEntry(entry, revealed) {
  if (!revealed && entry.hiddenDescription) return entry.hiddenDescription;
  return veilSlugTerms(entry.description, revealed);
}
