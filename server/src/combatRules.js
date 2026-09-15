// Combat system constants and pure-function rules. Centralized here (same
// spirit as characterRules.js / slugRules.js / mechaRules.js) so retuning a
// number never means hunting through route handlers.
//
// See docs/combat-system-design.md for the full spec these implement.

import { statModifier } from "./characterRules.js";
import { GATLING_AP_DISCOUNT, CANNON_CLASH_BONUS } from "./itemRules.js";

export { statModifier };
export { GATLING_AP_DISCOUNT, CANNON_CLASH_BONUS };

// ---- Movement -------------------------------------------------------------

export const MOVE_SPEED_PER_AP = 80; // map units moved per Move action -- walking distance only, shooting range/speed untouched (was 200; cut to 80 so a given walk costs 2.5x the AP)
// A mecha covers a character's normal walking distance times its own `speed`
// stat per Move-action AP -- speed 1 walks like a person, speed 3 covers three
// times the ground. A mounted rider moves at their mecha's rate, spending the
// mecha's AP (see /actions/move). Was a flat 12 units/speed-point, wholly
// disconnected from the walking scale.
export const MECHA_SPEED_PER_AP = (speed) => MOVE_SPEED_PER_AP * Math.max(1, speed || 1);
export const MOUNT_RANGE = MOVE_SPEED_PER_AP; // 1 AP of walking -- how close you must be to mount/dismount, and how close a mecha must be to ram

// ---- Action costs -----------------------------------------------------

export const MOVE_AP_COST = 1;
// Hunker Down no longer has a fixed cost -- it sinks *all* remaining AP into
// the heal (see hunkerHeal / routes/combat.js). Kept only as the threshold
// above which the client asks for confirmation first.
export const HUNKER_MIN_AP = 1;
export const MOUNT_AP_COST = 1;
export const RAM_AP_COST = 2; // spent from the mecha's AP pool, on the rider's turn
export const SWITCH_WEAPON_AP_COST = 1;

// ---- Weapons ------------------------------------------------------------

// Exactly two equip slots exist per player (see blasters.js's equip route):
// 0 = primary, 1 = secondary. A character always starts a fight on their
// primary; Switch Weapon toggles between the two. Only slugs loaded into
// the *currently active* slot's blaster can be fired.
export const PRIMARY_WEAPON_SLOT = 0;
export const SECONDARY_WEAPON_SLOT = 1;

// ---- Base-type combat effects ----------------------------------------
// A handful of blaster base types (see BASE_TYPES in itemRules.js) do
// something in combat beyond their raw accuracy/range/mag stat line. Each
// helper is keyed on the fired blaster's `base_type` and no-ops for every
// other type, so the Shoot Slug flow can call them unconditionally.

// Bow: the one base type whose attack roll also folds in the shooter's own
// DEX modifier, on top of the usual blaster/quality/type/loyalty accuracy
// terms. `shooter` is the acting combatant row (dexMod lives on its data
// blob, defaulting to 0 for NPCs that never had one).
export function blasterTypeAccuracyBonus(blaster, shooter) {
  if (blaster?.base_type !== "Bow") return 0;
  return shooter?.data?.dexMod ?? 0;
}

// Gatling: every slug it fires costs GATLING_AP_DISCOUNT less AP to shoot,
// never dropping below 1.
export function gatlingShotApCost(blaster, baseApCost) {
  if (blaster?.base_type !== "Gatling") return baseApCost;
  return Math.max(1, baseApCost - GATLING_AP_DISCOUNT);
}

// Cannon: the slug it fires gets +CANNON_CLASH_BONUS clash power. Returns a
// cloned slug (never mutates the caller's row) so the boost can flow through
// both resolveClash and the eventual dealHit damage; a "None"-type dud stays
// a dud. Any other base type returns the slug untouched.
export function applyBlasterTypeToSlug(blaster, slug) {
  if (!slug || blaster?.base_type !== "Cannon" || slug.type === "None") return slug;
  return { ...slug, clash_power: slug.clash_power + CANNON_CLASH_BONUS };
}

// ---- Loyalty tier modifiers -------------------------------------------

// A slug's loyalty tier (0-4, see LOYALTY_TIER_MIN/MAX in slugRules.js) isn't
// just flavor -- it shifts the slug's own effective clash power/defense, and
// its shooter's accuracy, everywhere in combat. Tier 1 ("Indifferent") is the
// neutral baseline (both modifiers 0); tier 0 ("Wild") actively works against
// you, and each tier above 1 scales the bonus further, topping out at tier 4
// ("Bonded"). Both tables index directly on the tier number.
export const LOYALTY_CLASH_MODIFIERS = [-2, 0, 2, 4, 6];
export const LOYALTY_ACCURACY_MODIFIERS = [-2, 0, 2, 3, 5];

export function loyaltyClashModifier(tier) {
  return LOYALTY_CLASH_MODIFIERS[tier] ?? 0;
}

export function loyaltyAccuracyModifier(tier) {
  return LOYALTY_ACCURACY_MODIFIERS[tier] ?? 0;
}

// Clones a raw slug row (or ad-hoc DM stat block) with its clash_power/
// clash_defense bumped by its own loyalty tier's modifier -- applied exactly
// once, right where a slug first enters combat math (see
// resolveShooterSlugAndBlaster/findEligibleCounterSlugs in routes/combat.js),
// so everything downstream (dealHit, burn/poison/cone/hazard/pod damage,
// resolveClash, the counter-offer prompt) just reads clash_power/
// clash_defense normally and gets the effective number for free -- including
// through Emberblade's clash-tripling, which multiplies whatever it's handed.
// The result can end up above CLASH_POWER_MAX/CLASH_DEFENSE_MAX (10) once
// this is added on top of an already-maxed base stat -- that's intentional,
// not a bug. loyalty_tier itself is left untouched on the clone, since
// loyaltyAccuracyModifier is looked up separately, off the original tier,
// wherever an attack roll is made.
export function applyLoyaltyToSlug(slug) {
  if (!slug) return slug;
  const mod = loyaltyClashModifier(slug.loyalty_tier);
  if (!mod) return slug;
  return { ...slug, clash_power: slug.clash_power + mod, clash_defense: slug.clash_defense + mod };
}

// ---- Slug cooldown --------------------------------------------------------

// A fired slug (shot or used as a counter) is away in flight/recovering --
// it can't be fired again until it's counted down through this many of its
// owner's own turns. Ticks down once per owner turn-start (see advanceTurn
// in routes/combat.js), independent of energy pips (which model ammo, not
// "is the slug physically here to load").
export const SLUG_RETURN_TURNS = 3;

// ---- Hunker Down ------------------------------------------------------

// Hunker Down spends every remaining AP on patching yourself up: a flat
// `max(1, CON modifier)` Grit per AP consumed, no roll. The per-AP floor of 1
// means a zero or negative CON still gets something back rather than a wasted
// turn.
export function hunkerHeal(conModifier, apSpent = 1) {
  return Math.max(1, conModifier) * Math.max(1, apSpent);
}

// ---- Shooting -----------------------------------------------------------

// The type ranges below were originally hand-tuned as small numbers (10-32)
// with sensible relative spread (Air long, Rock/Earth short, etc.) but no
// real-world scale. RANGE_SCALE blows that spread up so the *average*
// combined range lands at ~500 map units, while keeping every type's range
// relative to the others exactly as originally tuned. Fixed in absolute map
// units -- intentionally independent of MOVE_SPEED_PER_AP, so retuning
// walking distance never silently changes shooting range.
const RANGE_SCALE = 25;

export const RANGE_PENALTY_STEP = 8 * RANGE_SCALE; // -1 accuracy per this many units past half range
export const WALL_BREAK_RADIUS = 24; // map units of wall removed on a wall-breaking hit
export const KNOCKBACK_DISTANCE = 16; // map units a knockback shove covers -- also Metal's base shove, see below

// Metal always gives a short shove on hit; Earth always gives a large one --
// these two are the only types with a *default* knockback, per
// docs/combat-system-design.md §4. Ticking `causesKnockback` on a Metal or
// Earth slug template doesn't turn knockback on (it's already on for those
// two types) -- it doubles that type's own base distance instead. For every
// other type, that same flag is what turns knockback on at all, always at
// the flat short distance, never doubled.
export const KNOCKBACK_SHORT_DISTANCE = KNOCKBACK_DISTANCE; // 16
export const KNOCKBACK_LARGE_DISTANCE = KNOCKBACK_DISTANCE * 2; // 32

// A knockback hit that lands on a mounted rider has this chance of jarring
// them clean out of the saddle -- the shove throws the rider, the mecha stays
// put (see the dismount roll in dealHit's knockback block).
export const KNOCKBACK_DISMOUNT_CHANCE = 0.6;

export function slugKnockbackDistance(type, causesKnockback) {
  if (type === "Metal") return causesKnockback ? KNOCKBACK_SHORT_DISTANCE * 2 : KNOCKBACK_SHORT_DISTANCE;
  if (type === "Earth") return causesKnockback ? KNOCKBACK_LARGE_DISTANCE * 2 : KNOCKBACK_LARGE_DISTANCE;
  return causesKnockback ? KNOCKBACK_SHORT_DISTANCE : 0;
}

// ---- Status effects (damage-over-time / crowd control) --------------------

// Burn (Fire) and Poison (Toxic) are both persistent DoTs that tick at the
// start of the affected combatant's own next turn (see tickStatusEffects,
// called from advanceTurn) -- neither one deals its damage on the
// triggering hit itself. Burn doesn't stack: getting burned again just
// refreshes it back to BURN_DURATION_TURNS turns, with its damage
// recalculated off the new hit's own clashPower (so a second, stronger Fire
// slug replaces a weaker burn rather than adding to it). Poison instead
// stacks: each poisoning hit adds a stack (so the per-turn damage grows)
// *and* resets the shared duration back to POISON_DURATION_TURNS, so it
// never falls off while it's being kept up. Snare (Plant) fully blocks the
// Move action (see /actions/move) for SNARE_DURATION_TURNS of the target's
// own turns, ticking down the same way. See docs/combat-system-design.md §4.
export const BURN_DURATION_TURNS = 3;
export const BURN_DAMAGE_FRACTION = 0.5; // of the burning slug's own clashPower, per turn
export const POISON_DAMAGE_PER_STACK = 1;
export const POISON_DURATION_TURNS = 3;
export const SNARE_DURATION_TURNS = 2;

// -- Cynosure: causes_disarm fries the target's blaster on hit or miss
// alike (same "regardless of hit/miss" rule as causes_jam), blocking the
// Shoot Slug action entirely (see /actions/shoot) for their next
// DISARM_DURATION_TURNS - 1 turns -- same "duration constant is one more
// than the turns it actually blocks" convention as SNARE_DURATION_TURNS.
// Its disarm_zone flag leaves a lingering electromagnetic field that pins
// anyone standing in it to fully disarmed every one of their turns (never
// decaying while they stay put), then lets it decay normally -- exactly
// DISARM_DURATION_TURNS - 1 more turns of grace -- once they actually step
// out. See tickStatusEffects' `insideDisarmZone` param below and
// addDisarmZone/DISARM_ZONE_RADIUS/DISARM_ZONE_DURATION_ROUNDS in
// routes/combat.js.
export const DISARM_DURATION_TURNS = 2;

// -- Perplexus: mind_scramble replaces Psychic's own baseline "stunned" trait
// entirely (see the tb.trait === "stun" gate in dealHit) with a chosen
// effect instead of a roll -- 3 debuffs when fired at someone else, 2 buffs
// when fired at yourself. The shoot route narrows an incoming effectChoice
// to whichever pool actually applies to this shot's targeting and falls
// back to a random pick from that same pool if none was given (an NPC fired
// without the client's picker, or an invalid/mismatched choice) -- see
// dealHit's own mind_scramble block, which does this same narrowing again
// as its actual source of truth (the route's own check is just an early,
// friendlier rejection).
export const MIND_SCRAMBLE_ENEMY_EFFECTS = ["reverse", "darkness", "slow"];
export const MIND_SCRAMBLE_SELF_EFFECTS = ["enhance", "vision"];
export const MIND_SCRAMBLE_EFFECT_LABELS = {
  reverse: "their sense of direction flips -- their next Move goes the exact opposite way",
  darkness: "darkness falls over them -- their next attack roll has disadvantage",
  slow: "their reaction time slows -- less time to react to incoming shots",
  enhance: "their reaction time sharpens -- more time to react to incoming shots",
  vision: "their vision sharpens -- their next attack roll has advantage and ignores range falloff",
};
// reverse/slow/enhance are turn-counted (tickStatusEffects, same "duration
// constant is one more than the turns it actually blocks" convention as
// SNARE_DURATION_TURNS); darkness reuses the existing one-shot `blinded`
// status as-is, and vision is its own one-shot `keenVision` status, both
// consumed the instant the affected combatant's next attack roll happens
// (see the blinded/keenVision checks in resolveNormalHit/resolveCounterOffer).
export const MIND_SCRAMBLE_DURATION_TURNS = 2;
// Slower reaction shrinks the counter-clash window on the *next* incoming
// shot(s) aimed at the target -- same shrink Zeus's ultra_fast already
// applies to whoever Zeus itself shoots, just target-driven instead of
// shooter-driven. Enhanced reaction is the mirror buff.
export const REACTION_SLOW_FACTOR = 0.5;
export const REACTION_ENHANCE_FACTOR = 1.5;

// Multiplies a shot's windowMs based on the *target's* own reaction status
// (independent of whatever the shooter's own slug does, e.g. ultra_fast) --
// see the two call sites in routes/combat.js that compute windowMs for a
// shot aimed at a real combatant.
export function reactionWindowFactor(statusEffects) {
  if (statusEffects?.slowedReaction?.turnsLeft > 0) return REACTION_SLOW_FACTOR;
  if (statusEffects?.enhancedReaction?.turnsLeft > 0) return REACTION_ENHANCE_FACTOR;
  return 1;
}

// Mirrors `to` through `from` -- same distance, exactly opposite direction.
// Used for Perplexus's reversed-direction effect on a Move action (see
// /actions/move): the destination the combatant actually asked for gets
// flipped to its exact opposite before the wall-check/AP-cost math runs.
export function reverseMoveDestination(from, to) {
  return { x: from.x * 2 - to.x, y: from.y * 2 - to.y };
}

// -- Tesser: swaps_position, on a landed hit (never a self-shot, and mecha
// never reach this branch of dealHit to begin with), instantly trades the
// shooter's and target's map positions. No numbers to tune here -- it's a
// straight swap of two already-legal positions, so there's nothing to wall-
// check or clamp to map bounds either. If the target was riding a mecha (and
// the shooter is on foot), the swap also hijacks the ride: the shooter lands
// in the saddle the target just occupied and the target is dumped on the
// ground at the shooter's old spot. See the swapsPosition block in
// routes/combat.js's dealHit.

// -- Psi: friction_shift picks (via the same offer.effectChoice the shoot
// route already threads through for Perplexus) between two frictions,
// always a debuff (no self-target branch, unlike Perplexus's split pools --
// there's no "buff yourself with friction" reading of the source text):
// "harsh" cranks it up, rooting the target in place -- reuses the ordinary
// `snared` status outright, no separate mechanic needed. "slippery" drops
// it to nothing, giving the target ICE_SLIP_CHANCE odds of their turn
// ending abruptly on *any* Move attempt for the duration -- the exact same
// roll Ice's own hazard patch already uses (see ICE_SLIP_CHANCE), just
// carried on the combatant as a personal `slippery` status instead of
// requiring them to stand in a patch of terrain. Falls back to a random
// pick between the two if no valid choice came through (an NPC fired
// without the client's picker, e.g.) -- see dealHit's friction_shift block.
export const FRICTION_EFFECTS = ["harsh", "slippery"];
export const FRICTION_EFFECT_LABELS = {
  harsh: "their friction cranks up -- rooted in place, they can't Move for a turn",
  slippery: "their friction drops to nothing -- any Move risks their turn ending abruptly",
};
export const SLIPPERY_DURATION_TURNS = 2;

export function computeBurnDamage(clashPower) {
  return Math.max(1, Math.round(clashPower * BURN_DAMAGE_FRACTION));
}

// Called once, right as a combatant's own turn starts (see advanceTurn) --
// applies any pending burn/poison damage and counts snare/poison/burn/
// confusion/invisibility/disarm down, all in one pass. Pure function: takes
// the combatant's current status_effects (with `stunned` already stripped by
// the caller, since that one only affects AP refill, not damage) and returns
// the damage to apply plus the status_effects to write back. `insideDisarmZone`
// -- whether this combatant is currently standing inside a live Cynosure
// field -- is the one exception to "pure duration countdown": while true, it
// re-pins `disarmed` to the full duration every call instead of decrementing
// it, so the effect never lapses while they're still in the field.
export function tickStatusEffects(statusEffects, insideDisarmZone = false) {
  const next = { ...(statusEffects || {}) };
  let damage = 0;
  const notes = [];

  if (next.burning) {
    damage += next.burning.damage;
    notes.push(`${next.burning.damage} burn`);
    const turnsLeft = next.burning.turnsLeft - 1;
    if (turnsLeft > 0) next.burning = { ...next.burning, turnsLeft };
    else delete next.burning;
  }

  if (next.poison) {
    const poisonDamage = next.poison.stacks * POISON_DAMAGE_PER_STACK;
    damage += poisonDamage;
    notes.push(`${poisonDamage} poison`);
    const turnsLeft = next.poison.turnsLeft - 1;
    if (turnsLeft > 0) next.poison = { ...next.poison, turnsLeft };
    else delete next.poison;
  }

  if (next.snared) {
    const turnsLeft = (next.snared.turnsLeft ?? 1) - 1;
    if (turnsLeft > 0) next.snared = { turnsLeft };
    else delete next.snared;
  }

  // Fandango's confusion (a chance of a full 180-degree misfire on the
  // confused combatant's own shots) and Thugglet's invisibility both tick
  // down the same way -- pure duration countdowns, no per-turn damage.
  if (next.confused) {
    const turnsLeft = (next.confused.turnsLeft ?? 1) - 1;
    if (turnsLeft > 0) next.confused = { turnsLeft };
    else delete next.confused;
  }

  if (next.invisible) {
    const turnsLeft = (next.invisible.turnsLeft ?? 1) - 1;
    if (turnsLeft > 0) next.invisible = { turnsLeft };
    else delete next.invisible;
  }

  // Perplexus's reversedDirection/slowedReaction/enhancedReaction all tick
  // down the same pure-duration-countdown way -- see MIND_SCRAMBLE_DURATION_TURNS.
  if (next.reversedDirection) {
    const turnsLeft = next.reversedDirection.turnsLeft - 1;
    if (turnsLeft > 0) next.reversedDirection = { turnsLeft };
    else delete next.reversedDirection;
  }
  if (next.slowedReaction) {
    const turnsLeft = next.slowedReaction.turnsLeft - 1;
    if (turnsLeft > 0) next.slowedReaction = { turnsLeft };
    else delete next.slowedReaction;
  }
  if (next.enhancedReaction) {
    const turnsLeft = next.enhancedReaction.turnsLeft - 1;
    if (turnsLeft > 0) next.enhancedReaction = { turnsLeft };
    else delete next.enhancedReaction;
  }

  // Psi's slippery -- same pure duration countdown, checked against
  // ICE_SLIP_CHANCE on each Move attempt in /actions/move rather than here.
  if (next.slippery) {
    const turnsLeft = next.slippery.turnsLeft - 1;
    if (turnsLeft > 0) next.slippery = { turnsLeft };
    else delete next.slippery;
  }

  // Cynosure's disarm: standing inside the field re-pins to the full
  // duration every turn (so it can never lapse while you're still in it);
  // outside it, an existing disarm just counts down like every other status
  // above.
  if (insideDisarmZone) {
    next.disarmed = { turnsLeft: DISARM_DURATION_TURNS };
  } else if (next.disarmed) {
    const turnsLeft = next.disarmed.turnsLeft - 1;
    if (turnsLeft > 0) next.disarmed = { turnsLeft };
    else delete next.disarmed;
  }

  return { damage, statusEffects: next, notes };
}

// ---- AOE blast ----------------------------------------------------------

// A per-slug flag (like breaksWalls/causesKnockback/wallMaker/bridgeMaker) --
// on a hit, every other combatant within AOE_RADIUS of the primary target's
// position takes the same hit too (full clashPower + trait effects, not
// halved like Electricity's chain), each resolved as its own automatic hit
// with no attack roll and no counter-clash of its own -- the blast either
// catches you or it doesn't. See dealHit's aoe_blast block in
// routes/combat.js and findAoeTargets there. The client's AOE explosion
// burst is sized to exactly match this (see CombatMap.jsx's own copy of the
// number) so the visual always reads as the real blast radius -- keep them
// in sync if this changes again.
export const AOE_RADIUS = 120; // map units

// ---- Ice hazards ------------------------------------------------------

// An Ice slug leaves a patch of ice on the ground wherever its shot lands
// (hit, miss, or clamped short by range/a wall) -- see
// docs/combat-system-design.md §4's Ice row. Persists on the encounter until
// the fight ends. Any non-mecha combatant whose Move destination lands
// inside one has a flat ICE_SLIP_CHANCE of slipping and immediately losing
// the rest of their AP for the turn.
export const ICE_PATCH_RADIUS = 60; // map units
export const ICE_SLIP_CHANCE = 0.5;

// Returns the first hazard (optionally filtered by `type`) whose radius
// contains `point`, or null.
export function findHazardAt(point, hazards, type) {
  for (const hz of hazards || []) {
    if (type && hz.type !== type) continue;
    if (distance(point, hz) <= (hz.radius ?? 0)) return hz;
  }
  return null;
}

// ---- Damaging hazard terrain (Hazard Maker) --------------------------

// A sixth per-slug flag, `hazardMaker` -- generalizes Ice's "leaves a patch
// on the ground" pattern to any type, but this patch actually hurts instead
// of just risking a slip. On any Attack shot, a flagged slug leaves a
// `type: "damage"` hazard entry (tagged with the firing slug's own type and
// clashPower) wherever it lands, same unconditional hit/miss/out-of-range
// rule as Ice -- but its actual appearance is delayed to land only once the
// shot's flight/explosion animation would have finished, same as the rest
// of that shot's effects (see scheduleAfterFlight in routes/combat.js), and
// it grows in from nothing client-side instead of popping up. Any non-mecha
// combatant whose Move destination lands inside one takes
// HAZARD_DAMAGE_FRACTION of that slug's clashPower as Grit damage, plus that
// type's Burn/Poison DoT if it has one (Fire/Toxic) -- see
// applyHazardEffect in routes/combat.js. Persists for the rest of the
// encounter, same as Ice's patches.
export const HAZARD_RADIUS = 180; // map units
export const HAZARD_DAMAGE_FRACTION = 0.5; // of the leaving slug's own clashPower

// ---- Environment-shaping slug actions (Break Wall / Make Wall / Build Bridge) --

// A Shoot Slug action against a bare map point instead of a combatant --
// there's no defender to compute `10 + target DEX modifier` from, so
// accuracy is judged against a single flat difficulty instead.
export const ENV_ACTION_DC = 12;

// Player-made walls/bridges are both centered on the shot's (possibly
// deflected) impact point:
//  - a Wall Maker's wall is one line segment, its length running
//    perpendicular to the shot -- it faces the shooter like a shield raised
//    in their own line of fire, not laid out along the shot's direction.
//  - a Bridge Maker's bridge is a rectangle: its WIDTH runs that same
//    perpendicular direction (parallel to the shooter's stance), its LENGTH
//    extends onward, away from the shooter, past the impact point.
export const WALL_MAKER_LENGTH = 140; // map units, total line length
export const BRIDGE_WIDTH = 90; // map units, perpendicular to the shot
export const BRIDGE_LENGTH = 160; // map units, extending away from the shooter

// Direction from `from` to `to`, in degrees -- atan2 in SVG's own (y-down)
// convention, so this can be handed straight to an SVG `rotate()` transform
// client-side with no sign-flipping.
export function angleBetween(from, to) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

// Endpoints of a line segment of `length`, centered on `point`, perpendicular
// to the direction from `shooterPos` to `point`. See WALL_MAKER_LENGTH.
export function perpendicularSegment(shooterPos, point, length) {
  const angleRad = (angleBetween(shooterPos, point) * Math.PI) / 180 + Math.PI / 2;
  const dx = Math.cos(angleRad) * (length / 2);
  const dy = Math.sin(angleRad) * (length / 2);
  return { x1: point.x - dx, y1: point.y - dy, x2: point.x + dx, y2: point.y + dy };
}

// Is `point` inside the (possibly rotated) rectangle described by a bridge
// {x, y, angle, width, length} -- x/y is the near edge's center (closest to
// the shooter that built it), angle is the direction (degrees) it extends
// away from the shooter, width is perpendicular to that, length is along it.
export function pointInBridge(point, bridge) {
  const rad = (bridge.angle * Math.PI) / 180;
  const dx = point.x - bridge.x;
  const dy = point.y - bridge.y;
  // Rotate the point into the bridge's own frame: "along" runs from the near
  // edge (0) to the far edge (length); "across" is the perpendicular offset.
  const along = dx * Math.cos(rad) + dy * Math.sin(rad);
  const across = -dx * Math.sin(rad) + dy * Math.cos(rad);
  return along >= 0 && along <= bridge.length && Math.abs(across) <= bridge.width / 2;
}

// Slug type ballistics table -- see docs/combat-system-design.md §4.
// Kept in sync with the DM's planned roster (docs/Slugs - OG Slugs.csv):
// exactly these 16 types, no more, no less.
export const TYPE_BALLISTICS = {
  Air: { range: 32 * RANGE_SCALE, accuracyMod: 2, powerMod: 0, reactionSpeed: "Fast", trait: null },
  Dark: { range: 20 * RANGE_SCALE, accuracyMod: -1, powerMod: 0, reactionSpeed: "Medium", trait: "phase" },
  Earth: { range: 16 * RANGE_SCALE, accuracyMod: -2, powerMod: 1, reactionSpeed: "Slow", trait: "knockback-large" },
  Electricity: { range: 22 * RANGE_SCALE, accuracyMod: 1, powerMod: 0, reactionSpeed: "Fast", trait: "chain" },
  Energy: { range: 20 * RANGE_SCALE, accuracyMod: 1, powerMod: 0, reactionSpeed: "Fast", trait: "recharge" },
  Fire: { range: 18 * RANGE_SCALE, accuracyMod: 2, powerMod: 0, reactionSpeed: "Fast", trait: "burn" },
  Healing: { range: 18 * RANGE_SCALE, accuracyMod: 1, powerMod: 0, reactionSpeed: "Medium", trait: "heal" },
  Ice: { range: 20 * RANGE_SCALE, accuracyMod: 0, powerMod: 0, reactionSpeed: "Medium", trait: "ice" },
  Light: { range: 28 * RANGE_SCALE, accuracyMod: 3, powerMod: -2, reactionSpeed: "Very fast", trait: "blind" },
  Metal: { range: 18 * RANGE_SCALE, accuracyMod: 0, powerMod: 1, reactionSpeed: "Slow", trait: "knockback-short" },
  None: { range: 10 * RANGE_SCALE, accuracyMod: -5, powerMod: -10, reactionSpeed: "Slow", trait: "dud" },
  Plant: { range: 18 * RANGE_SCALE, accuracyMod: -1, powerMod: 0, reactionSpeed: "Slow", trait: "snare" },
  Psychic: { range: 18 * RANGE_SCALE, accuracyMod: 0, powerMod: -2, reactionSpeed: "Medium", trait: "stun" },
  Toxic: { range: 20 * RANGE_SCALE, accuracyMod: 1, powerMod: -1, reactionSpeed: "Medium", trait: "poison" },
  Unique: { range: 20 * RANGE_SCALE, accuracyMod: 0, powerMod: 0, reactionSpeed: "Medium", trait: null },
  Water: { range: 24 * RANGE_SCALE, accuracyMod: 1, powerMod: 0, reactionSpeed: "Medium", trait: "douse" },
};

export function typeBallistics(type) {
  return TYPE_BALLISTICS[type] || TYPE_BALLISTICS.Unique;
}

export function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

// Applied to the attacker's roll (not the defender's DC) -- shooting past
// half a weapon's range gets harder, not easier. -1 per RANGE_PENALTY_STEP
// units past the halfway point, always <= 0.
export function rangePenalty(dist, weaponRange) {
  const half = weaponRange / 2;
  if (dist <= half) return 0;
  return -Math.floor((dist - half) / RANGE_PENALTY_STEP);
}

// ---- Counter-clash --------------------------------------------------------

// A shot's flight is a fixed two-phase animation, the same for every shot
// (no more type/quality/dex-driven variability): it crawls out slowly, then
// "transforms" and covers the rest of the distance in a flat
// SHOT_FAST_PHASE_MS burst -- while the launch sound (public/slugterra-
// velocity.mp3, ~1.83s, SHOT_SOUND_MS) is still playing for its last
// SHOT_TRANSFORM_LEAD_MS, not waiting for the sound to finish first. Mirrors
// client/src/CombatMap.jsx -- keep the numbers in sync.
export const SHOT_SOUND_MS = 1830;
export const SHOT_TRANSFORM_LEAD_MS = 1000;
export const SHOT_SLOW_PHASE_MS = SHOT_SOUND_MS - SHOT_TRANSFORM_LEAD_MS; // 830ms
export const SHOT_FAST_PHASE_MS = 2500; // +1000ms over the original 1500 -- gives the reaction window (below) another second too
// Total time a shot's bolt takes to reach its target, start to impact.
export const SHOT_FLIGHT_MS = SHOT_SLOW_PHASE_MS + SHOT_FAST_PHASE_MS; // 3330ms

// The defender's reaction window always runs the entire flight -- a
// defender can wait right up until the shot would actually land, and never
// past it, since there's nothing left to react to once it's already hit.
export const COUNTER_WINDOW_MS = SHOT_FLIGHT_MS; // 3330ms

// A shot's *actual* flight time (and so its reaction window, which always
// matches it) scales down for a target that's close relative to the
// equipped weapon's own range -- a long-reach weapon (e.g. a Sniper Rig)
// makes a close shot feel snappy, a short-reach weapon stays at the full
// fixed duration even at short range. Scales on the weapon's own range, not
// the type-vs-weapon combinedRange used for reach -- that's what actually
// ties *speed* specifically to the equipped weapon. Never drops below
// SHOT_MIN_SPEED_FRACTION of the full flight, so even a point-blank shot is
// still readable.
export const SHOT_MIN_SPEED_FRACTION = 0.35;

export function shotFlightMs(dist, weaponRange) {
  const fraction = Math.max(SHOT_MIN_SPEED_FRACTION, Math.min(1, dist / Math.max(1, weaponRange)));
  return Math.round(COUNTER_WINDOW_MS * fraction);
}

// The client's ShotEffect animation always plays for windowMs *
// SHOT_FLIGHT_MULTIPLIER, regardless of when the server actually resolves
// the shot (see CombatMap.jsx) -- that's what keeps a clash landing exactly
// at the moment the reaction window closes even when a player responds
// early. Now that the window runs the whole flight, this is 1: windowMs
// *is* the flight time. Wall-breaking hits mirror this value on the server
// (see scheduleWallBreak in routes/combat.js) so the wall doesn't vanish
// before the bolt visually reaches it. Keep this in sync with
// CombatMap.jsx's own copy of the number.
export const SHOT_FLIGHT_MULTIPLIER = 1;

// A bolt's two-phase speed profile, as a fraction (0..1) of the
// attacker->target distance covered after `elapsedMs` of a flight that
// takes `flightMs` end to end: a slow crawl out capped at SHOT_SLOW_PHASE_MS
// (with a small instant kick so it visibly leaves the barrel), then a fast
// linear burst for the rest. Mirrors client/src/CombatMap.jsx's
// phasedFraction exactly -- keep the two in sync. Used server-side to work
// out where an incoming shot actually was when a counter launched, so the
// clash lands where the two bolts really meet rather than always at the
// geometric midpoint.
export const SHOT_LAUNCH_KICK_FRACTION = 0.08;
export const SHOT_SLOW_PHASE_DISTANCE_FRACTION = 0.2;

export function shotDistanceFraction(elapsedMs, flightMs) {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= flightMs) return 1;
  const slowMs = Math.min(SHOT_SLOW_PHASE_MS, flightMs);
  const fastMs = flightMs - slowMs;
  if (fastMs <= 0) return elapsedMs / flightMs;
  if (elapsedMs <= slowMs) {
    const t = elapsedMs / slowMs;
    return SHOT_LAUNCH_KICK_FRACTION + t * (SHOT_SLOW_PHASE_DISTANCE_FRACTION - SHOT_LAUNCH_KICK_FRACTION);
  }
  const fastElapsed = elapsedMs - slowMs;
  return SHOT_SLOW_PHASE_DISTANCE_FRACTION + (1 - SHOT_SLOW_PHASE_DISTANCE_FRACTION) * (fastElapsed / fastMs);
}

// Straight-line interpolation between two map points, t in 0..1.
export function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// A supportive shot helps whoever it lands on rather than hurting them -- a
// Healing slug, or an inert None slug. Fired at an ally (or yourself) it's a
// boon, not an attack: it never offers the target a counter-clash and never
// lands a type's negative trait effects, whoever it hits. Keyed on type
// alone so it holds for custom slugs too.
export function isSupportiveSlug(slug) {
  return slug?.type === "Healing" || slug?.type === "None";
}

// Mutual clash resolution. Returns one of:
//  "double-break" | "attacker-wins" | "defender-wins" | "bounce"
export function resolveClash({ attackerPower, attackerDefense, defenderPower, defenderDefense }) {
  const attackerWins = attackerPower > defenderDefense;
  const defenderWins = defenderPower > attackerDefense;
  if (attackerWins && defenderWins) return "double-break";
  if (attackerWins) return "attacker-wins";
  if (defenderWins) return "defender-wins";
  return "bounce";
}

// ---- Knockout ---------------------------------------------------------

export const KNOCKOUT_BASE_DC = 10;

export function knockoutDC(pipsUsed) {
  return KNOCKOUT_BASE_DC + pipsUsed;
}

export function countKnockoutPipsUsed(pips) {
  return Array.isArray(pips) ? pips.filter(Boolean).length : 0;
}

// ---- Mecha --------------------------------------------------------------

// A ram hit lands rammingPower * this against a mecha target (then cut by the
// target's armor, applied to Structure). Against a *character* the figure is
// ignored entirely -- a mecha slamming a person always deals
// RAM_CHARACTER_MAX_GRIT_FRACTION of that character's max Grit, regardless of
// how the mecha is built.
export const RAM_DAMAGE_MULTIPLIER = 5;
export const RAM_CHARACTER_MAX_GRIT_FRACTION = 0.5;

// Electricity slugs fry circuitry -- every point of damage that actually lands
// on a mecha's Structure (a direct hit, or the share a mounted rider's mecha
// soaks for them) is multiplied by this. The rider's own portion of a split
// hit is NOT multiplied -- only what the mecha eats.
export const ELECTRIC_MECHA_DAMAGE_MULTIPLIER = 2;

// When a mounted rider takes damage, their mecha soaks up this fraction of it
// (as Structure), rounded UP -- so a small hit that can't be cleanly quartered
// lands entirely on the mecha (2 or 3 damage -> all to the mecha; 5 -> 4 to
// the mecha, 1 to the rider). The rider takes whatever is left.
export const RIDER_DAMAGE_MECHA_FRACTION = 0.75;

export function splitRiderDamage(amount) {
  const mecha = Math.ceil(amount * RIDER_DAMAGE_MECHA_FRACTION);
  return { mecha, rider: Math.max(0, amount - mecha) };
}

export function computeMaxStructure({ armor, tier }) {
  return 20 + armor * 4 + tier * 5;
}

// ---- Geometry (freeform map: continuous coords, walls as segments) --------

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// A shot that fails its accuracy roll (but was in range) used to still fly
// dead-on to the target and just pop a small "miss" burst there -- reads as
// a hit that inexplicably did nothing. Rotates the true impact point a few
// degrees around the attacker, same distance, random left/right, so a miss
// visibly goes wide instead. That deflected ray gets its own wall check
// (`walls`, optional) -- the original path being clear doesn't guarantee the
// deflected one is, so without this a miss could visibly clip straight
// through a wall the true shot never would have reached.
const MISS_DEFLECTION_DEG = 12;
export function missDeflection(attackerPos, trueImpactPoint, walls = []) {
  const dx = trueImpactPoint.x - attackerPos.x;
  const dy = trueImpactPoint.y - attackerPos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sign = Math.random() < 0.5 ? -1 : 1;
  const angle = (sign * MISS_DEFLECTION_DEG * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  const len = Math.hypot(rx, ry) || 1;
  const scale = dist / len;
  const deflected = { x: attackerPos.x + rx * scale, y: attackerPos.y + ry * scale };

  const wallHit = firstWallHit(attackerPos, deflected, walls);
  if (!wallHit) return deflected;
  // The deflected ray hits a wall the true shot's path didn't -- stop it
  // there instead of letting the animation pass straight through.
  return { x: wallHit.hit.x, y: wallHit.hit.y };
}

// Point along the ray from `from` toward `to`, `dist` units out. Used to find
// where a shot that can't reach its target actually fizzles out, without
// exposing the target's exact range to the shooter.
export function pointAtDistance(from, to, dist) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(1, dist / len);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

// Returns the intersection point of segments (p1,p2) and (p3,p4), or null.
export function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // parallel

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: p1.x + t * d1x, y: p1.y + t * d1y, t };
}

// Walks the shot path from `from` to `to` against a list of wall segments
// {id, x1, y1, x2, y2}. Returns the nearest blocking wall (with impact point)
// or null if the path is clear. `ignoreWallIds` lets a shot skip walls it
// already broke through earlier in its own path resolution.
export function firstWallHit(from, to, walls, ignoreWallIds = []) {
  let nearest = null;
  for (const wall of walls) {
    if (ignoreWallIds.includes(wall.id)) continue;
    const hit = segmentIntersection(from, to, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
    if (!hit) continue;
    if (!nearest || hit.t < nearest.hit.t) {
      nearest = { wall, hit };
    }
  }
  return nearest;
}

// Trims/removes a wall segment around an impact point, radius `WALL_BREAK_RADIUS`.
// Returns the replacement list of segments for that wall id (0, 1, or 2 pieces),
// or null if the wall is untouched (impact point not actually on it).
export function breakWallSegment(wall, impact, radius = WALL_BREAK_RADIUS) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const ux = dx / len;
  const uy = dy / len;
  const t = (impact.x - wall.x1) * ux + (impact.y - wall.y1) * uy; // distance along wall
  const segments = [];
  if (t - radius > 1) {
    segments.push({ x1: wall.x1, y1: wall.y1, x2: wall.x1 + ux * (t - radius), y2: wall.y1 + uy * (t - radius) });
  }
  if (t + radius < len - 1) {
    segments.push({ x1: wall.x1 + ux * (t + radius), y1: wall.y1 + uy * (t + radius), x2: wall.x2, y2: wall.y2 });
  }
  return segments;
}

// Moves `from` a step of length KNOCKBACK_DISTANCE directly away from `shooter`,
// clamped to the first wall it would cross (character stops at the wall).
export function knockbackTarget(shooter, target, walls, distanceUnits = KNOCKBACK_DISTANCE) {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const len = Math.hypot(dx, dy) || 1;
  const dest = { x: target.x + (dx / len) * distanceUnits, y: target.y + (dy / len) * distanceUnits };
  const blocked = firstWallHit(target, dest, walls);
  if (!blocked) return { point: dest, hitWall: false };
  // Stop a little short of the wall itself.
  const t = Math.max(0, blocked.hit.t - 0.05);
  return {
    point: { x: target.x + (dest.x - target.x) * t, y: target.y + (dest.y - target.y) * t },
    hitWall: true,
  };
}

// Clamps a point into the map's own bounds -- used alongside a wall-clamped
// push (knockbackTarget) so a forced move never puts anyone off the edge of
// the map, only up against it. See Frightgeist's fear below.
export function clampToMapBounds(point, mapWidth, mapHeight) {
  return {
    x: Math.max(0, Math.min(mapWidth, point.x)),
    y: Math.max(0, Math.min(mapHeight, point.y)),
  };
}

// ---- Bespoke unique-slug mechanics -----------------------------------------
// One-off Velocity Abilities that don't fit the generic type/trait or
// "Causes X" flag pattern -- each gets its own dedicated per-slug boolean
// (same DM-authored, per-slug-metadata convention as breaksWalls etc.), and
// whatever bespoke logic that flag needs lives in routes/combat.js. The pure
// math/constants for each live here.

// -- Bladier: pierces walls on a normal Attack (instead of the shot being
// fully blocked, or needing the separate Break Wall action) -- the dagger
// clears the obstacle in passing, then keeps going to hit the real target at
// full power. Reuses WALL_BREAK_RADIUS for the actual break.

// -- Speedstinger: generalizes Electricity's "chain" trait to any type via
// causesChain (see TYPE_BALLISTICS's trait === "chain" check), *and* adds a
// second, independent "ricochet" flag: after a shot connects, the same
// full-power shot caroms on to another target, who gets their own completely
// separate counter-clash opportunity -- unlike the chain arc (fixed half
// power, never counterable), a ricochet is exactly as counterable and as
// strong as the original shot, just visually launched from the hit target's
// position instead of the shooter's. A shot "connects" for this purpose when
// it's uncountered (hit OR miss -- the bolt still glances off), when it's
// countered but the attacker still wins the clash, *and* when Speedstinger
// is the counter slug and wins -- the reflected shot caroms off the attacker
// on to another enemy, owned by the defender.
//
// It bounces RICOCHET_MAX_BOUNCES times total (each leg carries its own
// ricochetCount; the chain stops when that reaches the cap, or when a wall
// blocks a leg, or a clash bounces one dead). Each leg's target is the
// nearest combatant to the bounce point that isn't the shooter -- with no
// range cap ("always the closest") -- preferring one other than the target
// it's leaving, but falling back to that same target when it's the only one
// left (so a 1v1 still ping-pongs the full count). A target hit early in the
// chain is fair game again on a later bounce.
//
// Reuses findChainTarget's own search (fixed below to a real map-scale
// radius -- it was still using a pre-RANGE_SCALE literal -- though the
// ricochet path opts out of that radius entirely).
export const CHAIN_RADIUS = 32 * RANGE_SCALE; // 4x the original 8 -- the chain arc's search radius (the ricochet passes maxRadius: Infinity instead)
export const RICOCHET_MAX_BOUNCES = 4; // Speedstinger: caroms this many times after the shot first connects

// -- Zeus: shrinks the counter-clash window (and, for free, the projectile's
// own flight time -- the client's bolt speed is already driven directly off
// windowMs) to this fraction of what the shot's distance/weapon range would
// otherwise produce. "Near impossible", not literally impossible -- a
// lightning-fast reaction can still land inside it.
export const ULTRA_FAST_WINDOW_FACTOR = 0.5;

// -- Thugglet: self-targeted invisibility, 1 turn. Ticks down like
// snare/poison (see tickStatusEffects); cleared early the instant the
// invisible combatant takes any hit (including an AOE splash -- "AOE...
// reveals invisible targets" is just the general "any hit reveals you" rule,
// AOE included). Purely a visibility/targeting-UI effect, not an auto-miss:
// see CombatMap.jsx for the per-viewer opacity/hide rendering.
export const INVISIBLE_DURATION_TURNS = 1;

// -- Frightgeist: fear doesn't just skip the turn like Shock -- the target's
// AP is spent running FLEE_AP_EQUIVALENT worth of Move directly away from
// whoever shot them, clamped by walls (reuses knockbackTarget's own ray-step
// math, just with a much longer distance) and by the map's own edges
// (clampToMapBounds). Distance stays independent of MOVE_SPEED_PER_AP
// changing on its own accord? No -- unlike knockback (a fixed shove), a
// flee is explicitly "AP worth of movement", so it *does* scale with
// MOVE_SPEED_PER_AP, same as an ordinary Move action would.
export const FEAR_FLEE_AP_EQUIVALENT = 3;

// -- Fandango: redefined away from the original "field-wide beacon" idea --
// only the specific combatant Fandango hits gets confused (not a beacon
// everyone's shots might drift toward), and confusion is a *complete*
// 180-degree misfire chance, not the ordinary small missDeflection wobble.
export const CONFUSION_DURATION_TURNS = 3;
export const CONFUSION_CHANCE = 0.4; // flat chance per Attack while confused

// Rotates `trueImpactPoint` a full 180 degrees around `attackerPos` -- same
// distance, exactly opposite direction. Used for Fandango's confusion
// (a *complete* misfire, unlike missDeflection's small wobble) with its own
// wall check, same reasoning as missDeflection: the flipped ray isn't
// guaranteed clear just because the real path was.
export function confusedDeflection(attackerPos, trueImpactPoint, walls = []) {
  const dx = trueImpactPoint.x - attackerPos.x;
  const dy = trueImpactPoint.y - attackerPos.y;
  const flipped = { x: attackerPos.x - dx, y: attackerPos.y - dy };
  const wallHit = firstWallHit(attackerPos, flipped, walls);
  if (!wallHit) return flipped;
  return { x: wallHit.hit.x, y: wallHit.hit.y };
}

// -- Lentus: crosswind_zone, a lingering hazard (same battlefield-fixture
// lifecycle as Anchorage's/Cynosure's zones, tagged kind: "crosswind",
// ticked down by the same tickZones) that bends the course of ANY shot
// whose straight-line path passes within it -- not gated on the shooter's
// own slug at all, since this is a purely environmental hazard anyone's
// bolt can fly through. See the crosswind check in routes/combat.js's
// shoot route (right after Fandango's confusion check, which it can't fire
// alongside -- confusion already short-circuits the shot before this ever
// runs).
export const CROSSWIND_ZONE_RADIUS = 140; // map units, same as Anchorage's/Cynosure's
export const CROSSWIND_ZONE_DURATION_ROUNDS = 3;

// Rolls 0-180 inclusive, recentered on 90 as "no change" -- so the shot
// keeps flying wherever it was already headed (a roughly 1-in-181 chance)
// on exactly 90, and anything else is how many degrees off course it gets
// bent, -90..+90.
export function rollCrosswindOffset() {
  return Math.floor(Math.random() * 181) - 90;
}

// Rotates `trueImpactPoint` by `angleDeg` around `attackerPos` -- same
// distance, a different direction -- with the same wall-clamp fallback as
// confusedDeflection just above (which is this same operation at a fixed
// 180 degrees; kept as its own function rather than refactored out from
// under Fandango's already-tested path).
export function rotateDeflection(attackerPos, trueImpactPoint, angleDeg, walls = []) {
  const dx = trueImpactPoint.x - attackerPos.x;
  const dy = trueImpactPoint.y - attackerPos.y;
  const rad = (angleDeg * Math.PI) / 180;
  const rotated = {
    x: attackerPos.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: attackerPos.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
  const wallHit = firstWallHit(attackerPos, rotated, walls);
  if (!wallHit) return rotated;
  return { x: wallHit.hit.x, y: wallHit.hit.y };
}

// -- Lentus: skips_reload, straight out of its own protoform lore ("can be
// trained to enter blasters all by themselves") -- once its loyalty tier
// reaches LOYALTY_FRIENDLY_TIER or higher, it self-chambers the instant it
// returns from its ordinary cooldown instead of coming back `loaded: false`
// and waiting on a manual Reload -- see the selfLoads check in
// spendEnergyPip, routes/combat.js. Cooldown itself is untouched; only the
// separate reload step is skipped.
export const LOYALTY_FRIENDLY_TIER = 2; // see LOYALTY_TIER_LABELS in client/src/slugData.js

// -- Arcling: static_mark tags whoever it hits with a persistent `marked`
// status (no duration -- the source text never says it wears off) that
// makes them a lightning rod for every *other* hit this same slug lands:
// MARK_SPLASH_FRACTION of that other hit's own damage also lands on them,
// global -- no radius, no chain-style single bounce -- see
// applyMarkedSplash in routes/combat.js.
export const MARK_SPLASH_FRACTION = 0.25;

// -- Meduslug: uncounterable (its gaze locks the target in place before
// they can even react, so it never offers a counter -- see
// launchAndOfferCounter) and damage_tripled (unconditional x3, unlike
// Emberblade's clash-only clash_tripled -- reuses CLASH_TRIPLE_MULTIPLIER
// since it's the same factor) combine with the plain existing causes_shock
// flag to give the full "damage triples, target is fully shocked, and
// there's no clashing your way out of it" ability -- no bespoke status of
// its own needed beyond those three flags.

// -- Zephur: clash_tripled, Emberblade's own existing flag, reused outright
// -- no new mechanic, just a second slug built around the same "weak
// baseline, triples specifically while clashing" identity.

// -- Eunoa: emotion_surge, see its own block in dealHit (routes/combat.js)
// -- stacks two of Perplexus's existing buffs together on a self-shot, or
// two of its existing debuffs together on anyone else, no new statuses.

// -- Emberblade / Flaringo: both leave a wall of fire along the exact line
// the shot traveled (attacker's position -> impact point), not the
// perpendicular "shield" a Wall Maker slug raises. Unconditional on any
// Attack (hit, miss, or out-of-range), same trigger rule as Ice's patch --
// see routes/combat.js's shoot handler. This is pure geometry (the segment
// *is* the shot's own path), so no helper function is needed beyond the two
// endpoints already on hand there.

// Emberblade also triples its own clashPower/clashDefense specifically while
// it's the slug on either side of a counter-clash (not on an ordinary
// uncountered hit) -- see clash_tripled in routes/combat.js's
// resolveCounterOffer.
export const CLASH_TRIPLE_MULTIPLIER = 3;

// -- Thornlash: not a circular AOE Blast -- the shot travels to its target
// as an ordinary hit (full clashPower), then a cone of spikes fans out
// *beyond* the impact point, continuing the same line of travel, dealing
// CONE_DAMAGE_FRACTION of clashPower to anyone else it catches. See
// cone_blast in dealHit's routes/combat.js.
export const CONE_HALF_ANGLE_DEG = 30; // total cone width is double this
export const CONE_LENGTH = 160; // map units, measured from the impact point
export const CONE_DAMAGE_FRACTION = 0.5;

// Is `point` inside the cone whose apex is `apex`, opening away from `from`
// (i.e. continuing the from->apex line), `halfAngleDeg` to each side, out to
// `length`. Used for Thornlash's cone (apex = impact point, from = shooter).
export function pointInCone(apex, from, point, halfAngleDeg, length) {
  const dirX = apex.x - from.x;
  const dirY = apex.y - from.y;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const vx = point.x - apex.x;
  const vy = point.y - apex.y;
  const vLen = Math.hypot(vx, vy);
  if (vLen > length) return false;
  if (vLen < 1e-6) return true; // right on the apex
  const cos = (dirX * vx + dirY * vy) / (dirLen * vLen);
  const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  return angle <= halfAngleDeg;
}

// -- Pressure Tick: drops 3 permanent, independently-timed steam pods
// scattered near the impact point. Each pod gets a random fixed direction
// (set once, at creation) and a random counter -- ticking down on *every*
// combatant's turn-start, not just its owner's (see spawnPods/tickPods in
// routes/combat.js). At 0, it fires a damaging line along its own fixed
// direction, then re-arms with a fresh random counter instead of being
// consumed -- it stays live for the rest of the encounter.
export const POD_COUNT = 3;
export const POD_SCATTER_RADIUS = 180; // map units around the impact point -- wide enough that the 3 pods land clearly apart, not stacked
export const POD_MIN_TIMER = 3;
export const POD_MAX_TIMER = 10;
export const POD_LINE_LENGTH = 200; // map units the steam line reaches
export const POD_LINE_HIT_TOLERANCE = 24; // how close a combatant must be to the line to be caught in it

// -- Caligo: two flags, both Water-flavored counters to Fire. voidsFireClash
// forces any clash it's part of against a Fire-type slug straight to the
// "bounce" outcome (no damage, no ejects, no resolveClash roll at all) --
// see resolveCounterOffer in routes/combat.js. clearsFireTerrain fires on
// every Attack, same unconditional hit/miss/out-of-range trigger as every
// other terrain flag: within HAZARD_RADIUS of wherever the shot actually
// stopped, it snuffs out any Fire-tagged wall/bridge/hazard it finds, or
// leaves its own steam damage patch (an ordinary Hazard Maker-style patch,
// reusing addDamageHazard) if there was nothing to put out -- see
// clearOrCreateSteamTerrain in routes/combat.js.

export function rollPodTimer() {
  return POD_MIN_TIMER + Math.floor(Math.random() * (POD_MAX_TIMER - POD_MIN_TIMER + 1));
}

// A point scattered within `radius` of `center`. The distance is
// sqrt-weighted so points spread evenly across the whole disc -- a plain
// Math.random() * radius biases hard toward the center, which is what made
// the pods pile up on top of each other.
export function scatterPoint(center, radius) {
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.sqrt(Math.random()) * radius;
  return { x: center.x + Math.cos(angle) * dist, y: center.y + Math.sin(angle) * dist };
}

// Shortest distance from `point` to the line SEGMENT from `from` to `to`.
export function distanceToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return distance(point, from);
  let t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: from.x + t * dx, y: from.y + t * dy };
  return distance(point, proj);
}

// The line segment a pod fires along, given its fixed angle (degrees).
export function podLineEnd(pod) {
  const rad = (pod.angle * Math.PI) / 180;
  return { x: pod.x + Math.cos(rad) * POD_LINE_LENGTH, y: pod.y + Math.sin(rad) * POD_LINE_LENGTH };
}

// -- Regulator: on impact, forms a STAR_POINTS-segment star of fire walls
// radiating from the impact point. Anyone caught in a segment as it forms
// takes full clashPower damage (unconditional, once) -- after that the
// segments persist as ordinary walls, same as any other player-made wall
// (no further damage-on-touch). See formStarWall in routes/combat.js.
export const STAR_POINTS = 5;
export const STAR_SEGMENT_LENGTH = WALL_MAKER_LENGTH; // reuse the same wall-segment scale
export const STAR_HIT_TOLERANCE = 24;

// The STAR_POINTS line segments (each {x1,y1,x2,y2}) of a star centered on
// `center`, evenly spaced around the full circle.
export function starSegments(center, length = STAR_SEGMENT_LENGTH, points = STAR_POINTS) {
  const segments = [];
  for (let i = 0; i < points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    segments.push({
      x1: center.x,
      y1: center.y,
      x2: center.x + Math.cos(angle) * length,
      y2: center.y + Math.sin(angle) * length,
    });
  }
  return segments;
}

// -- Anchorage: creates a zone that suppresses knockback and wall-breaking
// for anyone/anything inside it for its duration. Ticks down once per full
// round (not per combatant turn) -- it's a battlefield fixture, not a status
// on a person. See addAnchorZone/isInsideAnyZone in routes/combat.js.
export const ANCHOR_RADIUS = 140; // map units
export const ANCHOR_DURATION_ROUNDS = 3;

// -- Cynosure: a persistent electromagnetic field, same battlefield-fixture
// lifecycle as Anchorage's zone (see addDisarmZone/tickZones in
// routes/combat.js), just tagged its own `kind` so the two don't cross-wire
// -- Anchorage's suppresses knockback/wall-breaking, Cynosure's disarms
// blasters (see DISARM_DURATION_TURNS below). Radius/duration match
// Anchorage's own for now; tune independently if the field should feel
// bigger/longer-lived.
export const DISARM_ZONE_RADIUS = 140; // map units
export const DISARM_ZONE_DURATION_ROUNDS = 3;

// True if `point` falls inside any active zone (each {x, y, radius}).
// `kind`, if given, restricts the check to zones of that kind (e.g.
// "anchor", "disarm") -- zones of other kinds sharing the same `zones`
// array/lifecycle are otherwise invisible to this check. Omit it only for a
// generic "is anything at all here" query.
export function isInsideAnyZone(zones, point, kind) {
  return (zones || []).some((z) => (!kind || z.kind === kind) && distance(point, z) <= z.radius);
}

// -- Mirage Coil: self-targeted, spawns DECOY_COUNT decoys that mimic the
// owner's movement and (visually) their shots, until one of the three (a
// decoy or the real owner) is actually hit. A decoy popping removes just
// that one decoy; the real owner being hit clears all remaining decoys at
// once. See spawnMirageDecoys/moveDecoysWith in routes/combat.js.
export const DECOY_COUNT = 2;
// Each decoy sits at its own random offset from the owner -- a random angle
// and a random distance in [DECOY_MIN_RADIUS, DECOY_MAX_RADIUS], rolled
// independently per decoy. They scatter unpredictably (they can both land on
// the same side, or roughly in a line with the owner) instead of snapping
// into a fixed formation that gives away which token is the real one. The
// offset is fixed once, at spawn, and the decoy keeps it as it mimics the
// owner's movement -- see spawnMirageDecoys/moveDecoysWith in routes/combat.js.
export const DECOY_MIN_RADIUS = 40;
export const DECOY_MAX_RADIUS = 95;

export function randomDecoyOffset() {
  const angle = Math.random() * 2 * Math.PI;
  const dist = DECOY_MIN_RADIUS + Math.random() * (DECOY_MAX_RADIUS - DECOY_MIN_RADIUS);
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
}
