// Where a Make Wall / Build Bridge shot would put its structure, and which way
// it would face -- the single source for both the map's placement ghost and the
// `buildAngle` sent with the shot. Mirrors the sizes in server/src/combatRules.js
// (WALL_MAKER_LENGTH, BRIDGE_WIDTH, BRIDGE_LENGTH, LOYALTY_ENV_SCALES) -- keep in sync.
// The server re-derives the real impact point (accuracy can nudge it); the facing it
// is given is what the player saw here.

export const WALL_MAKER_LENGTH = 140;
export const BRIDGE_WIDTH = 90;
export const BRIDGE_LENGTH = 160;
export const LOYALTY_ENV_SCALES = [0.75, 1, 1.2, 1.4, 1.6];
export const ROTATE_STEP = 15; // degrees per Q / E press or button tap
export const ROTATE_FINE_STEP = 5; // with Shift held
export const ROTATE_QUARTER = 90;

export const PLACEMENT_KINDS = { "make-wall": "wall", "build-bridge": "bridge" };

export const envScale = (tier) => LOYALTY_ENV_SCALES[tier] ?? 1;

// Degrees in (-180, 180].
export function normalizeAngle(deg) {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export const angleBetween = (from, to) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

// The direction the structure faces: the way the shot travels, turned by `rotation`.
export const facingFor = (shooter, aim, rotation = 0) => normalizeAngle(angleBetween(shooter, aim) + rotation);

// { point, facing, kind, ... }. `range` (optional) clamps the aim along the line of fire,
// the way the server pulls an out-of-reach shot short. A wall adds its two endpoints;
// a bridge adds width/length (its x/y is the near edge's centre, running out along `facing`).
export function placementGeometry({ kind, shooter, aim, rotation = 0, tier = 1, range = null }) {
  let point = aim;
  const dist = Math.hypot(aim.x - shooter.x, aim.y - shooter.y);
  if (range != null && dist > range && dist > 0) {
    point = { x: shooter.x + ((aim.x - shooter.x) / dist) * range, y: shooter.y + ((aim.y - shooter.y) / dist) * range };
  }
  const facing = facingFor(shooter, aim, rotation);
  const scale = envScale(tier);
  if (kind === "wall") {
    const length = Math.round(WALL_MAKER_LENGTH * scale);
    const rad = ((facing + 90) * Math.PI) / 180;
    const dx = Math.cos(rad) * (length / 2);
    const dy = Math.sin(rad) * (length / 2);
    return { kind, point, facing, length, x1: point.x - dx, y1: point.y - dy, x2: point.x + dx, y2: point.y + dy };
  }
  return {
    kind,
    point,
    facing,
    width: Math.round(BRIDGE_WIDTH * scale),
    length: Math.round(BRIDGE_LENGTH * scale),
  };
}
