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
export const KNOCKBACK_DISTANCE = 16; // map units a knockback shove covers

// Slug type ballistics table -- see docs/combat-system-design.md §4.
// Kept in sync with the DM's planned roster (docs/Slugs - OG Slugs.csv):
// exactly these 16 types, no more, no less.
export const TYPE_BALLISTICS = {
  Air: { range: 32 * RANGE_SCALE, accuracyMod: 2, powerMod: 0, reactionSpeed: "Fast", trait: null },
  Dark: { range: 20 * RANGE_SCALE, accuracyMod: -1, powerMod: 0, reactionSpeed: "Medium", trait: "phase" },
  Earth: { range: 16 * RANGE_SCALE, accuracyMod: -2, powerMod: 1, reactionSpeed: "Slow", trait: "knockback" },
  Electricity: { range: 22 * RANGE_SCALE, accuracyMod: 1, powerMod: 0, reactionSpeed: "Fast", trait: "chain" },
  Energy: { range: 20 * RANGE_SCALE, accuracyMod: 1, powerMod: 0, reactionSpeed: "Fast", trait: "recharge" },
  Fire: { range: 18 * RANGE_SCALE, accuracyMod: 2, powerMod: 0, reactionSpeed: "Fast", trait: "burn" },
  Healing: { range: 18 * RANGE_SCALE, accuracyMod: 1, powerMod: 0, reactionSpeed: "Medium", trait: "heal" },
  Ice: { range: 20 * RANGE_SCALE, accuracyMod: 0, powerMod: 0, reactionSpeed: "Medium", trait: "root" },
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
