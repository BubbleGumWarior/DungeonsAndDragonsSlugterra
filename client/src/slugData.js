export const SLUG_TYPES = [
  { key: "Air", color: "#9fd8c9" },
  { key: "Dark", color: "#5b4a70" },
  { key: "Earth", color: "#a97c50" },
  { key: "Electricity", color: "#e0c53f" },
  { key: "Energy", color: "#c98fe0" },
  { key: "Fire", color: "#e0623f" },
  { key: "Healing", color: "#6fd88a" },
  { key: "Ice", color: "#8fd0e0" },
  { key: "Light", color: "#f0e6a0" },
  { key: "Metal", color: "#9aa5ad" },
  { key: "None", color: "#6b6b6b" },
  { key: "Plant", color: "#5a9c4a" },
  { key: "Psychic", color: "#b06fd8" },
  { key: "Toxic", color: "#8fc23f" },
  { key: "Unique", color: "#d8a24a" },
  { key: "Water", color: "#4a9fd8" },
];

export const LOYALTY_TIER_LABELS = {
  0: "Wild",
  1: "Indifferent",
  2: "Friendly",
  3: "Loyal",
  4: "Bonded",
};

// A fixed, theme-independent color per loyalty tier -- deliberately its own
// palette rather than the app's theme gold, so a slug's tier reads at a
// glance and stays legible/consistent no matter which accent theme the DM
// has picked in Settings (unlike --gold-soft, --maroon-*, etc., which rotate
// per theme). Rising, game-rarity-style ramp: gray -> green -> blue ->
// violet -> gold, low tier to high.
export const LOYALTY_TIER_COLORS = {
  0: "#9aa0a8", // Wild -- dull steel gray
  1: "#7fd99a", // Indifferent -- green
  2: "#5ac8e0", // Friendly -- cyan-blue
  3: "#b07adb", // Loyal -- violet
  4: "#f0c419", // Bonded -- radiant gold
};

export function loyaltyTierColor(tier) {
  return LOYALTY_TIER_COLORS[tier] ?? LOYALTY_TIER_COLORS[1];
}

// Ordered {value, label, color} list for rendering the tier legend (see
// SlugCard's loyalty tooltip) -- Object.keys on the maps above would sort
// numeric-looking string keys correctly anyway, but this keeps the render
// side from caring about that.
export const LOYALTY_TIERS = [0, 1, 2, 3, 4].map((value) => ({
  value,
  label: LOYALTY_TIER_LABELS[value],
  color: LOYALTY_TIER_COLORS[value],
}));

// Mirrors LOYALTY_CLASH_MODIFIERS/LOYALTY_ACCURACY_MODIFIERS in
// server/src/combatRules.js -- client-side estimate only, used to preview a
// slug's effective combat stats before firing. The server is always the
// authority on the real modifier when a shot actually resolves. Tier 1
// ("Indifferent") is the neutral baseline (both 0); tier 0 ("Wild") is
// actively worse than an untrained slug.
export const LOYALTY_CLASH_MODIFIERS = { 0: -2, 1: 0, 2: 2, 3: 4, 4: 6 };
export const LOYALTY_ACCURACY_MODIFIERS = { 0: -2, 1: 0, 2: 2, 3: 3, 4: 5 };

export function loyaltyClashModifier(tier) {
  return LOYALTY_CLASH_MODIFIERS[tier] ?? 0;
}

export function loyaltyAccuracyModifier(tier) {
  return LOYALTY_ACCURACY_MODIFIERS[tier] ?? 0;
}

export const CLASH_POWER_MIN = 1;
export const CLASH_POWER_MAX = 10;
export const CLASH_DEFENSE_MIN = 1;
export const CLASH_DEFENSE_MAX = 10;
export const AP_COST_MIN = 1;
export const AP_COST_MAX = 5;
export const ENERGY_PIPS_MIN = 1;
export const ENERGY_PIPS_MAX = 16;
export const LOYALTY_TIER_MIN = 0;
export const LOYALTY_TIER_MAX = 4;
export const RARITY_MIN = 1;
export const RARITY_MAX = 10;

export function typeColor(type) {
  return SLUG_TYPES.find((t) => t.key === type)?.color ?? "#c9a24b";
}

// Mirrors TYPE_BALLISTICS in server/src/combatRules.js -- `range` already
// includes that file's RANGE_SCALE (25). Client-side preview only: it's what
// the slugs page shows on hover and what CombatPage draws the reach ring
// from. The server is always the authority on the real combinedRange,
// accuracy and power when a shot actually resolves.
//
//   band        -- rough reach label (Long / Medium / Short) for the tooltip
//   accuracyMod -- added to the attacker's d20 attack roll
//   powerMod    -- added on top of the slug's own clashPower
//   reaction    -- how long the defender's counter-clash window stays open
//   hitEffect   -- one-line summary of the type's guaranteed on-hit effect
export const TYPE_BALLISTICS = {
  Air: { range: 800, band: "Long", accuracyMod: 2, powerMod: 0, reaction: "Fast", hitEffect: "None -- pure range and accuracy" },
  Dark: { range: 500, band: "Medium", accuracyMod: -1, powerMod: 0, reaction: "Medium", hitEffect: "Phases through walls (ignores cover)" },
  Earth: { range: 400, band: "Short", accuracyMod: -2, powerMod: 1, reaction: "Slow", hitEffect: "Large knockback" },
  Electricity: { range: 550, band: "Medium", accuracyMod: 1, powerMod: 0, reaction: "Fast", hitEffect: "Chains a half-power hit to a nearby enemy. Double damage to mechas." },
  Energy: { range: 500, band: "Medium", accuracyMod: 1, powerMod: 0, reaction: "Fast", hitEffect: "Refunds 1 energy pip on another loaded slug" },
  Fire: { range: 450, band: "Short", accuracyMod: 2, powerMod: 0, reaction: "Fast", hitEffect: "Burn -- damage each turn for 3 turns" },
  Healing: { range: 450, band: "Short", accuracyMod: 1, powerMod: 0, reaction: "Medium", hitEffect: "Heals the target instead of damaging" },
  Ice: { range: 500, band: "Medium", accuracyMod: 0, powerMod: 0, reaction: "Medium", hitEffect: "Leaves an icy slip patch on the ground" },
  Light: { range: 700, band: "Long", accuracyMod: 3, powerMod: -2, reaction: "Very fast", hitEffect: "Blind -- target's next attack has disadvantage" },
  Metal: { range: 450, band: "Medium", accuracyMod: 0, powerMod: 1, reaction: "Slow", hitEffect: "Short knockback" },
  None: { range: 250, band: "Short", accuracyMod: -5, powerMod: -10, reaction: "Slow", hitEffect: "Dud -- always misses" },
  Plant: { range: 450, band: "Short", accuracyMod: -1, powerMod: 0, reaction: "Slow", hitEffect: "Snare -- target can't Move for 2 turns" },
  Psychic: { range: 450, band: "Short", accuracyMod: 0, powerMod: -2, reaction: "Medium", hitEffect: "-1 AP on the target's next turn" },
  Toxic: { range: 500, band: "Medium", accuracyMod: 1, powerMod: -1, reaction: "Medium", hitEffect: "Poison -- stacking damage for 3 turns" },
  Unique: { range: 500, band: "Medium", accuracyMod: 0, powerMod: 0, reaction: "Medium", hitEffect: "Custom -- set by the slug's own ability" },
  Water: { range: 600, band: "Medium", accuracyMod: 1, powerMod: 0, reaction: "Medium", hitEffect: "Douses an active burn on the target" },
};

export function typeBallistics(type) {
  return TYPE_BALLISTICS[type] ?? TYPE_BALLISTICS.Unique;
}

export function typeRange(type) {
  return typeBallistics(type).range;
}

// Single source of truth for the per-slug boolean ability flags: the key on
// the slug record, a short label, and a one-line description of what it does
// on a hit. SlugForm's checkboxes and SlugToolbar's filter chips carry their
// own copy of the labels; this list drives the hover panel on SlugCard.
export const SLUG_TRAITS = [
  { key: "breaksWalls", label: "Wall Breaker", description: "The dedicated Break a Wall action can punch through terrain." },
  { key: "causesKnockback", label: "Knockback", description: "Doubles Earth/Metal's shove, or gives any other type a short one." },
  { key: "wallMaker", label: "Wall Maker", description: "Can raise a barrier on the field (ice or crystal wall)." },
  { key: "bridgeMaker", label: "Bridge Maker", description: "Can create a crossable path (ice bridge, vine swing)." },
  { key: "aoeBlast", label: "AOE Blast", description: "Also hits every combatant near the impact point, at full effect." },
  { key: "hazardMaker", label: "Hazard Maker", description: "Leaves a damaging patch of terrain wherever it lands." },
  { key: "causesBlind", label: "Causes Blind", description: "Gives Light's disadvantage-on-next-attack effect." },
  { key: "causesSnare", label: "Causes Snare", description: "Gives Plant's can't-Move-for-2-turns effect." },
  { key: "causesShock", label: "Causes Shock", description: "Stronger stun -- the target's entire next turn is skipped." },
  { key: "causesJam", label: "Causes Jam", description: "Hit or miss, the target's next shot automatically misfires." },
  { key: "piercesWalls", label: "Pierces Walls", description: "An Attack breaks through the first wall in its path." },
  { key: "causesChain", label: "Causes Chain", description: "Adds Electricity's uncounterable half-power arc to any type." },
  { key: "ricochets", label: "Ricochets", description: "A landed hit bounces to a second target with its own counter-clash." },
  { key: "ultraFast", label: "Ultra Fast", description: "Shrinks the counter window and speeds up the bolt itself." },
  { key: "causesInvisible", label: "Causes Invisible", description: "Self/ally only -- hides the token from other players for 1 turn." },
  { key: "causesFear", label: "Causes Fear", description: "The target's entire next turn is spent fleeing the shooter." },
  { key: "causesConfusion", label: "Causes Confusion", description: "The target's shots risk firing 180 off target for a few turns." },
  { key: "trailWall", label: "Trail Wall", description: "Leaves a wall of fire along the exact path the shot traveled." },
  { key: "clashTripled", label: "Clash Tripled", description: "This slug's power and defense triple while it's in a clash." },
  { key: "coneBlast", label: "Cone Blast", description: "A cone of spikes beyond the target deals reduced damage." },
  { key: "spawnsPods", label: "Spawns Pods", description: "Scatters 3 timed pods that periodically fire a damaging line." },
  { key: "mirageDecoy", label: "Mirage Decoy", description: "Self only -- spawns 2 decoys that mimic the owner until hit." },
  { key: "starWall", label: "Star Wall", description: "A 5-point wall burst on impact that then persists as walls." },
  { key: "anchorZone", label: "Anchor Zone", description: "Creates a zone that suppresses knockback and wall-breaking." },
  { key: "voidsFireClash", label: "Voids Fire Clash", description: "Any clash against a Fire slug cancels instantly, no damage." },
  { key: "clearsFireTerrain", label: "Clears Fire Terrain", description: "Snuffs out a nearby Fire wall/bridge/hazard on landing." },
  { key: "causesDisarm", label: "Causes Disarm", description: "Blocks the target's Shoot Slug action for their next turn." },
  { key: "disarmZone", label: "Disarm Zone", description: "Leaves a field that keeps anyone inside it disarmed." },
  { key: "mindScramble", label: "Mind Scramble", description: "Replaces Psychic's stun with a chosen buff or debuff effect." },
  { key: "swapsPosition", label: "Swaps Position", description: "On a hit, shooter and target instantly trade map positions." },
  { key: "frictionShift", label: "Friction Shift", description: "Chosen effect: root the target, or risk their turn ending on moves." },
  { key: "crosswindZone", label: "Crosswind Zone", description: "Leaves a hazard that randomly bends any shot passing through it." },
  { key: "skipsReload", label: "Skips Reload", description: "Self-chambers on return from cooldown once loyalty is Friendly+." },
  { key: "emotionSurge", label: "Emotion Surge", description: "Self: advantage/range-waiver + longer counter window. Other: confused + blinded." },
  { key: "uncounterable", label: "Uncounterable", description: "Never offers the target a counter -- always a plain accuracy roll." },
  { key: "damageTripled", label: "Damage Tripled", description: "Unconditional x3 damage on every hit, not just while clashing." },
  { key: "staticMark", label: "Static Mark", description: "Tags whoever it hits; 25% of any hit this slug lands also splashes every other marked target." },
];

export function defaultSlugFields() {
  return {
    name: "",
    type: SLUG_TYPES[0].key,
    protoformImage: null,
    velocityImage: null,
    clashPower: 5,
    clashDefense: 5,
    apCost: 1,
    maxEnergyPips: 3,
    loyaltyTier: 0,
    rarity: 5,
    velocityAbility: "",
    protoformUtility: "",
    breaksWalls: false,
    causesKnockback: false,
    wallMaker: false,
    bridgeMaker: false,
    aoeBlast: false,
    hazardMaker: false,
    causesBlind: false,
    causesSnare: false,
    causesShock: false,
    causesJam: false,
    piercesWalls: false,
    causesChain: false,
    ricochets: false,
    ultraFast: false,
    causesInvisible: false,
    causesFear: false,
    causesConfusion: false,
    trailWall: false,
    clashTripled: false,
    coneBlast: false,
    spawnsPods: false,
    mirageDecoy: false,
    starWall: false,
    anchorZone: false,
    voidsFireClash: false,
    clearsFireTerrain: false,
    causesDisarm: false,
    disarmZone: false,
    mindScramble: false,
    swapsPosition: false,
    frictionShift: false,
    crosswindZone: false,
    skipsReload: false,
    emotionSurge: false,
    uncounterable: false,
    damageTripled: false,
    staticMark: false,
  };
}
