// Combat system constants and pure-function rules. Centralized here (same
// spirit as characterRules.js / slugRules.js / mechaRules.js) so retuning a
// number never means hunting through route handlers.
//
// See docs/combat-system-design.md for the full spec these implement.

import { statModifier } from "./characterRules.js";

export { statModifier };

// ---- Movement -------------------------------------------------------------

export const MOVE_SPEED_PER_AP = 200; // map units moved per Move action (10x the original 20 -- walking distance only, shooting range/speed untouched)
export const MECHA_SPEED_UNIT = 12; // map units per point of `speed`, per Move action
export const MOUNT_RANGE = 5; // max distance to mount/dismount a mecha

// ---- Action costs -----------------------------------------------------

export const MOVE_AP_COST = 1;
export const HUNKER_AP_COST = 2;
export const MOUNT_AP_COST = 1;
export const RAM_AP_COST = 2;
export const SWITCH_WEAPON_AP_COST = 1;

// ---- Weapons ------------------------------------------------------------

// Exactly two equip slots exist per player (see blasters.js's equip route):
// 0 = primary, 1 = secondary. A character always starts a fight on their
// primary; Switch Weapon toggles between the two. Only slugs loaded into
// the *currently active* slot's blaster can be fired.
export const PRIMARY_WEAPON_SLOT = 0;
export const SECONDARY_WEAPON_SLOT = 1;

// ---- Slug cooldown --------------------------------------------------------

// A fired slug (shot or used as a counter) is away in flight/recovering --
// it can't be fired again until it's counted down through this many of its
// owner's own turns. Ticks down once per owner turn-start (see advanceTurn
// in routes/combat.js), independent of energy pips (which model ammo, not
// "is the slug physically here to load").
export const SLUG_RETURN_TURNS = 3;

// ---- Hunker Down ------------------------------------------------------

export function hunkerHeal(conModifier) {
  const roll = 1 + Math.floor(Math.random() * 4); // 1d4
  return Math.max(1, roll + conModifier);
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

export function computeBurnDamage(clashPower) {
  return Math.max(1, Math.round(clashPower * BURN_DAMAGE_FRACTION));
}

// Called once, right as a combatant's own turn starts (see advanceTurn) --
// applies any pending burn/poison damage and counts snare/poison/burn down,
// all in one pass. Pure function: takes the combatant's current
// status_effects (with `stunned` already stripped by the caller, since that
// one only affects AP refill, not damage) and returns the damage to apply
// plus the status_effects to write back.
export function tickStatusEffects(statusEffects) {
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
// second, independent "ricochet" flag: after a primary hit actually lands
// (uncountered, or countered but the attacker still won the clash), the same
// full-power shot continues on to a second nearby target, who gets their own
// completely separate counter-clash opportunity -- unlike the chain arc
// (fixed half power, never counterable), a ricochet is exactly as
// counterable and as strong as the original shot, just visually launched
// from the first target's position instead of the shooter's. Only bounces
// once (B -> C, not C -> D...). Reuses findChainTarget's own search (fixed
// below to a real map-scale radius -- it was still using a pre-RANGE_SCALE
// literal).
export const CHAIN_RADIUS = 32 * RANGE_SCALE; // 4x the original 8 -- shared by both the chain arc and Speedstinger's ricochet search

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
