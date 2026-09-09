export const STATS = [
  {
    key: "strength",
    label: "Strength",
    abbr: "STR",
    description: "Physical power — melee scuffles, hauling gear, forcing open jammed blast doors.",
    // Pre-reveal the party think they're on an ordinary present-day job, so
    // the hidden copy stays firmly modern-Earth: no blasters, no "worlds".
    hiddenDescription: "Physical power — melee scuffles, hauling gear, forcing a jammed door.",
  },
  {
    key: "dexterity",
    label: "Dexterity",
    abbr: "DEX",
    description: "Agility and reflexes — dodging blaster fire, fast-draws, initiative, trick shots.",
    hiddenDescription: "Agility and reflexes — dodging a punch, quick hands, initiative, trick shots.",
  },
  {
    key: "constitution",
    label: "Constitution",
    abbr: "CON",
    description: "Toughness and stamina — weathering hostile worlds, resisting fatigue, max Grit.",
    hiddenDescription: "Toughness and stamina — weathering rough conditions, resisting fatigue, max Grit.",
  },
  {
    key: "intelligence",
    label: "Intelligence",
    abbr: "INT",
    description: "Knowledge and reasoning — ancient tech, slug lore, tactical analysis.",
    hiddenDescription: "Knowledge and reasoning — obscure tech, research, tactical analysis.",
  },
  {
    key: "wisdom",
    label: "Wisdom",
    abbr: "WIS",
    description: "Perception and instinct — reading a room, bonding with slugs, survival smarts.",
    hiddenDescription: "Perception and instinct — reading a room, trusting your gut, survival smarts.",
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

// Each entry's `description` is the revealed, Slugterra-aware text (slugs,
// slingers, blasters, other worlds). `hiddenDescription` is the version the
// party sees before the DM reveals Slugterra -- and it has to read like an
// ordinary modern-day Earth campaign: no slugs, no blasters, no alien worlds,
// just present-day people doing present-day things.
export const PROFICIENCIES = [
  { key: "athletics", label: "Athletics", stat: "strength", description: "Climbing, swimming, forcing doors — feats of raw strength." },
  {
    key: "acrobatics",
    label: "Acrobatics",
    stat: "dexterity",
    description: "Tumbling, balance, and dodging incoming slugs in a fast-moving duel.",
    hiddenDescription: "Tumbling, balance, and keeping your feet when things get physical.",
  },
  {
    key: "sleightOfHand",
    label: "Sleight of Hand",
    stat: "dexterity",
    description: "Fast-draws, quick-loading slugs, pickpocketing.",
    hiddenDescription: "Quick fingers — palming objects, lockpicking, pickpocketing.",
  },
  { key: "stealth", label: "Stealth", stat: "dexterity", description: "Moving silently, staying out of sight and out of mind." },
  {
    key: "arcana",
    label: "Arcana",
    stat: "intelligence",
    description: "Understanding ancient energies and ghoul-slug phenomena.",
    hiddenDescription: "Making sense of fringe science and things that shouldn't be possible.",
  },
  {
    key: "history",
    label: "History",
    stat: "intelligence",
    description: "Recalling lost colonies, old feuds, and the lore of ancient slugs.",
    hiddenDescription: "Recalling past events, old feuds, and half-forgotten history.",
  },
  {
    key: "investigation",
    label: "Investigation",
    stat: "intelligence",
    description: "Piecing together clues from corporate data logs or the wreckage of a crash site.",
  },
  {
    key: "nature",
    label: "Nature",
    stat: "intelligence",
    description: "Knowledge of alien ecosystems, terrain, and wild slug habitats.",
    hiddenDescription: "Knowledge of ecosystems, terrain, weather, and wildlife.",
  },
  {
    key: "religion",
    label: "Religion",
    stat: "intelligence",
    description: "Understanding the myths and legends surrounding the Elder Slugs.",
    hiddenDescription: "Understanding the world's religions, myths, and legends.",
  },
  {
    key: "creatureHandling",
    label: "Creature Handling",
    stat: "wisdom",
    description: "Calming enraged or wild slugs; bonding with your own.",
    hiddenDescription: "Calming frightened or aggressive animals; bonding with your own.",
  },
  {
    key: "insight",
    label: "Insight",
    stat: "wisdom",
    description: "Reading a slinger's intentions or catching a bluff.",
    hiddenDescription: "Reading someone's intentions or catching a bluff.",
  },
  {
    key: "medicine",
    label: "Medicine",
    stat: "wisdom",
    description: "Treating injuries from a duel gone wrong — slinger or slug alike.",
    hiddenDescription: "Treating injuries — breaks, bleeding, burns, shock.",
  },
  {
    key: "perception",
    label: "Perception",
    stat: "wisdom",
    description: "Spotting hidden items, traps, enemies, or a slug about to strike.",
    hiddenDescription: "Spotting hidden objects, traps, enemies, or an ambush about to spring.",
  },
  {
    key: "survival",
    label: "Survival",
    stat: "wisdom",
    description: "Tracking wild slugs, foraging, and enduring hostile worlds.",
    hiddenDescription: "Tracking, foraging, navigating, and enduring the wilderness.",
  },
  {
    key: "deception",
    label: "Deception",
    stat: "charisma",
    description: "Bluffing a rival slinger or talking your way past a guard.",
    hiddenDescription: "Bluffing a rival or talking your way past a guard.",
  },
  { key: "intimidation", label: "Intimidation", stat: "charisma", description: "Cowing an opponent before the fight even starts." },
  {
    key: "performance",
    label: "Performance",
    stat: "charisma",
    description: "Showmanship in the slinging arena — working a crowd with your slug's best tricks.",
    hiddenDescription: "Showmanship on a stage — working a crowd with your own flair.",
  },
  {
    key: "persuasion",
    label: "Persuasion",
    stat: "charisma",
    description: "Winning someone over with words rather than slugs.",
    // The original is a pun ("words instead of a fight"); keep that meaning
    // in the hidden copy rather than a literal swap.
    hiddenDescription: "Winning someone over with words rather than force.",
  },
];

export function statByKey(key) {
  return STATS.find((s) => s.key === key);
}

// Most entries carry a hand-written `hiddenDescription` for the pre-reveal
// (modern-Earth) view -- see the comment above PROFICIENCIES. This word-swap
// is only the safety net for the few that don't: it catches the obvious
// giveaway nouns and keeps the pre-reveal copy sounding like a present-day
// campaign (a "slinger" reads as a plain "fighter", not a mage).
function swapWord(text, pattern, singular, plural) {
  return text.replace(pattern, (match) => {
    const replacement = /s$/i.test(match) ? plural : singular;
    return match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  });
}

export function veilSlugTerms(text, revealed) {
  if (revealed || !text) return text;
  let result = swapWord(text, /\bslugs?\b/gi, "creature", "creatures");
  result = swapWord(result, /\bslingers?\b/gi, "fighter", "fighters");
  result = result.replace(/\bslinging\b/gi, (match) => (match[0] === match[0].toUpperCase() ? "Fighting" : "fighting"));
  return result;
}

// Pre-reveal, prefer the hand-written modern-Earth copy; otherwise fall back
// to the generic word-swap above.
export function describeEntry(entry, revealed) {
  if (!revealed && entry.hiddenDescription) return entry.hiddenDescription;
  return veilSlugTerms(entry.description, revealed);
}
