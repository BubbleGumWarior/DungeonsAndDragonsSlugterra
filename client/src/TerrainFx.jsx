// Effects for the terrain a fight reshapes: a wall forming, a wall being broken, and a bridge being
// built. All are drawn top-down and tinted by the slug that made (or broke) the terrain, and none
// has a screen direction -- chips and sparks fly outward from the wall or the point of origin, and
// "falling" is shown by shrinking. Motion is CSS (see TerrainFx.css), driven by custom properties,
// so each effect plays itself and costs nothing once it ends; CombatMap just mounts them for a
// moment (see terrainFx in CombatMap.jsx). Scatter is seeded by the effect's id, so every client
// draws the same debris. Lengths are map units scaled by `vs`, like every other map marker.
import { typeColor } from "./slugData.js";
import "./TerrainFx.css";

const TAU = Math.PI * 2;
const DM_WALL_COLOR = "#d9d4c7";

function seeded(seed) {
  let s = (Math.imul(Math.floor(seed) || 1, 2654435761) >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (str) => [...String(str)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const wallColor = (w) => (w.slugType ? typeColor(w.slugType) : DM_WALL_COLOR);
const px = (n) => `${Math.round(n * 10) / 10}px`;

// How long each effect plays (ms): CombatMap unmounts it after this.
export const WALL_BREAK_FX_MS = 1000;
export const WALL_FORM_FX_MS = 900;

// Compares the walls before and after an update. Returns the stretches that were broken --
// `{ id, x1, y1, x2, y2, slugType, source }` each -- and the ids of the new walls that are just the
// surviving pieces of a wall that was broken (so they don't replay the grow-in animation).
// A wall that vanished whole was destroyed along its full length; a wall replaced by one or two
// collinear pieces (breakWallSegment on the server) was broken in the gap between them.
export function diffWalls(prev, cur) {
  const prevIds = new Set(prev.map((w) => w.id));
  const curIds = new Set(cur.map((w) => w.id));
  const removed = prev.filter((w) => !curIds.has(w.id));
  const added = cur.filter((w) => !prevIds.has(w.id));
  const pieceIds = new Set();
  const breaks = [];
  for (const r of removed) {
    const dx = r.x2 - r.x1;
    const dy = r.y2 - r.y1;
    const len = Math.hypot(dx, dy) || 1;
    const along = (x, y) => ((x - r.x1) * dx + (y - r.y1) * dy) / (len * len);
    const off = (x, y) => Math.abs((x - r.x1) * dy - (y - r.y1) * dx) / len;
    const spans = [];
    for (const a of added) {
      if (pieceIds.has(a.id) || off(a.x1, a.y1) > 3 || off(a.x2, a.y2) > 3) continue;
      const t1 = along(a.x1, a.y1);
      const t2 = along(a.x2, a.y2);
      if (Math.min(t1, t2) >= -0.02 && Math.max(t1, t2) <= 1.02) {
        spans.push([Math.min(t1, t2), Math.max(t1, t2)]);
        pieceIds.add(a.id);
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    const gaps = [];
    for (const [a, b] of spans) {
      if (a - cursor > 0.01) gaps.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (1 - cursor > 0.01) gaps.push([cursor, 1]);
    for (const [a, b] of gaps) {
      breaks.push({ id: `${r.id}-${a.toFixed(3)}`, x1: r.x1 + dx * a, y1: r.y1 + dy * a, x2: r.x1 + dx * b, y2: r.y1 + dy * b, slugType: r.slugType, source: r.source });
    }
  }
  return { breaks, pieceIds };
}

// A wall breaking: a bright snap along the broken stretch, chips of it flung out to either side of
// the wall (shrinking as they go, as if dropping away from the camera), and puffs of dust.
export function WallBreakFx({ fx, vs = 1 }) {
  const dx = fx.x2 - fx.x1;
  const dy = fx.y2 - fx.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const rnd = seeded(hash(fx.id));
  const color = wallColor(fx);
  const chipCount = Math.max(8, Math.min(26, Math.round(len / (10 * vs))));
  const puffCount = Math.max(3, Math.min(7, Math.round(len / (40 * vs))));
  const chips = Array.from({ length: chipCount }, (_, i) => {
    const t = (i + 0.5) / chipCount;
    const side = i % 2 ? 1 : -1;
    const dist = (22 + rnd() * 46) * vs;
    const slide = (rnd() - 0.5) * 30 * vs;
    const size = (4.2 + rnd() * 4.6) * vs;
    const sides = 3 + Math.floor(rnd() * 2);
    const a0 = rnd() * TAU;
    const points = Array.from({ length: sides }, (_, k) => `${Math.cos(a0 + (k / sides) * TAU) * size * (0.7 + rnd() * 0.5)},${Math.sin(a0 + (k / sides) * TAU) * size * (0.7 + rnd() * 0.5)}`).join(" ");
    return { x: fx.x1 + dx * t, y: fx.y1 + dy * t, mx: nx * side * dist + ux * slide, my: ny * side * dist + uy * slide, rot: (rnd() - 0.5) * 420, points };
  });
  const puffs = Array.from({ length: puffCount }, (_, i) => ({ x: fx.x1 + dx * ((i + 0.5) / puffCount), y: fx.y1 + dy * ((i + 0.5) / puffCount), r: (5 + rnd() * 5) * vs, delay: rnd() * 0.08 }));
  return (
    <g className="tfx" style={{ "--fx-color": color }}>
      <line className="tfx-snap" x1={fx.x1} y1={fx.y1} x2={fx.x2} y2={fx.y2} strokeWidth={14 * vs} />
      <line className="tfx-snap tfx-snap--core" x1={fx.x1} y1={fx.y1} x2={fx.x2} y2={fx.y2} strokeWidth={5 * vs} />
      {puffs.map((p, i) => (
        <circle key={`p${i}`} className="tfx-dust" cx={p.x} cy={p.y} r={p.r} style={{ animationDelay: `${p.delay}s` }} />
      ))}
      {chips.map((c, i) => (
        <g key={`c${i}`} transform={`translate(${c.x} ${c.y})`}>
          <polygon className="tfx-chip" points={c.points} style={{ "--dx": px(c.mx), "--dy": px(c.my), "--rot": `${Math.round(c.rot)}deg` }} />
        </g>
      ))}
    </g>
  );
}

// A wall forming: the wall's own grow-in is drawn by the wall line itself (CombatMap.css); this adds a
// halo that fades, a bright tip racing along the wall as it grows, a burst of sparks at the base and a
// ring where the tip arrives.
export function WallFormFx({ fx, vs = 1 }) {
  const dx = fx.x2 - fx.x1;
  const dy = fx.y2 - fx.y1;
  const rnd = seeded(hash(fx.id));
  const color = wallColor(fx);
  const sparks = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * TAU + rnd() * 0.5;
    const d = (12 + rnd() * 18) * vs;
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: (1.8 + rnd() * 1.6) * vs };
  });
  return (
    <g className="tfx" style={{ "--fx-color": color }}>
      <line className="tfx-halo" x1={fx.x1} y1={fx.y1} x2={fx.x2} y2={fx.y2} strokeWidth={16 * vs} />
      {sparks.map((s, i) => (
        <circle key={`s${i}`} className="tfx-spark" cx={fx.x1} cy={fx.y1} r={s.r} style={{ "--dx": px(s.dx), "--dy": px(s.dy) }} />
      ))}
      <circle className="tfx-tip" cx={fx.x1} cy={fx.y1} r={5.5 * vs} style={{ "--dx": px(dx), "--dy": px(dy) }} />
      <circle className="tfx-ring" cx={fx.x2} cy={fx.y2} r={10 * vs} strokeWidth={2.4 * vs} />
    </g>
  );
}

// One bridge. A bridge that has just been built (`growing`) lays its planks down one by one from the
// near end to the far end with a bright bar running ahead of them; an existing bridge just shows its
// planks. Drawn in the bridge's own frame (x along its length from 0, y across it).
export function BridgePiece({ b, growing = false }) {
  const planks = Math.max(2, Math.floor(b.length / 38));
  const buildMs = 500;
  return (
    <g
      className={`combat-map-bridge ${growing ? "combat-map-bridge--building" : ""}`}
      transform={`translate(${b.x} ${b.y}) rotate(${b.angle})`}
      style={{ "--bridge-color": typeColor(b.slugType), "--bridge-len": px(b.length), "--bridge-ms": `${buildMs}ms` }}
    >
      <rect x={0} y={-b.width / 2} width={b.length} height={b.width} rx={18} ry={18} />
      {Array.from({ length: planks }, (_, i) => {
        const x = ((i + 0.5) * b.length) / planks;
        return (
          <line
            key={i}
            className={`bridge-plank ${growing ? "bridge-plank--building" : ""}`}
            x1={x}
            x2={x}
            y1={-b.width / 2 + 7}
            y2={b.width / 2 - 7}
            style={growing ? { animationDelay: `${Math.round((i / planks) * (buildMs - 120))}ms` } : undefined}
          />
        );
      })}
      {growing && <rect className="bridge-lead" x={-4} y={-b.width / 2} width={8} height={b.width} rx={3} />}
    </g>
  );
}
