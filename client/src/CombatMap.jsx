import { useEffect, useMemo, useRef, useState } from "react";
import { UploadSimpleIcon, XIcon, RulerIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, CornersInIcon } from "@phosphor-icons/react";
import { UNITS_PER_METER, markerScale, niceScaleLength, formatMeters, mapMeters, RANGE_REFERENCES, DEFAULT_SHOWN_REFERENCES } from "./mapScale.js";
import { typeColor } from "./slugData.js";
import { combatantNameColor } from "./combatDisplay.js";
import { WATER_CELL, makeWaterSet, isBurrowed, combatSide } from "./combatSkills.js";
import { teamById } from "./combatTeams.js";
import { useAuth } from "./AuthContext.jsx";
import { volumeToGain } from "./soundVolume.js";
import { downscaleImageFile } from "./imageDownscale.js";
import HazardPatch from "./HazardPatch.jsx";
import PlacementGhost from "./PlacementGhost.jsx";
import { ROTATE_STEP } from "./buildPlacement.js";
import { diffWalls, WallBreakFx, WallFormFx, BridgePiece, WALL_BREAK_FX_MS, WALL_FORM_FX_MS } from "./TerrainFx.jsx";
import "./CombatMap.css";

// Launch sound for a fired slug -- shared by the fresh-shot and counter-shot
// call sites below. Volume comes from the Sound setting on Settings.jsx
// (persisted per-user; defaults to 0.5 -- full volume was the "can be loud"
// complaint that setting exists to fix). Run through volumeToGain rather
// than applied directly -- see soundVolume.js for why.
function playShotSound(sliderVolume) {
  const audio = new Audio("/slugterra-velocity.mp3");
  audio.volume = volumeToGain(sliderVolume);
  audio.play().catch(() => {});
}

// The rest of the combat SFX, played on every client watching the battle and
// all scaled by the same per-user "Combat shots" volume the launch sound
// uses. Files live in client/public/ alongside slugterra-velocity.mp3.
//   fail   -- the shot misfired; nothing ever left the barrel
//   miss   -- the bolt landed wide of its target (plays with the burst)
//   hit    -- the bolt landed on a combatant (plays with the burst)
//   break  -- a wall (or wall segment) was broken, at the moment it breaks
//   hazard -- a hazard area was created, at the moment it appears
//   geyser -- a Pressure Tick steam pod fired
//   zeus   -- a Zeus slug was shot; plays once the launch sound has finished
//   self   -- a slug fired at the shooter's own combatant, in place of the
//             normal launch sound (see the isSelfShot check below)
// Filenames are capital-cased to match the actual files in client/public/ --
// Vite's static serving is case-sensitive (a lowercase miss falls through to
// the SPA's index.html, which then can't be decoded as audio).
const COMBAT_SFX = {
  fail: "/Fail.mp3",
  miss: "/Miss.mp3",
  hit: "/Hit.mp3",
  break: "/Break.mp3",
  hazard: "/Hazard.mp3",
  geyser: "/Geyser.mp3",
  zeus: "/Zeus.mp3",
  self: "/Self.mp3",
};
function playCombatSfx(name, sliderVolume) {
  const src = COMBAT_SFX[name];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = volumeToGain(sliderVolume);
  audio.play().catch(() => {});
}

// The DM's battle-map image is downscaled before upload -- see
// imageDownscale.js (shared with the ship deck-plan upload).

const DRAG_THRESHOLD = 4; // px of screen movement before a mousedown counts as a drag, not a click
const BURST_LINGER_MS = 400;
// How much longer an uncontested shot's animation waits past its own
// totalMs for the server's resolve update (miss/hit) before giving up --
// see stillWaiting in ShotEffect.
const RESOLUTION_GRACE_MS = 2000;

// A miss's real (deflected) impact point usually reaches the client well
// before the bolt lands, so the bolt just flies its normal curve straight
// there. But a shot the target could have countered and didn't only
// resolves when that reaction window times out -- right as the flight ends,
// sometimes a frame or two after. By then the bolt has already coasted to a
// stop on the target, so rather than letting the burst pop in off to one
// side with nothing connecting the two, the bolt makes a quick final skid
// to the true impact point and bursts once it arrives. This is how long
// that skid lasts, scaled a little by how far it has to travel.
const RESOLVE_SETTLE_MIN_MS = 160;
const RESOLVE_SETTLE_MAX_MS = 380;
const RESOLVE_SETTLE_PX_MS = 3.2; // ms of skid per px of gap, before clamping

// How far the "still waiting on a resolve" bolt is allowed to travel along
// its own flight curve before it must be revealed one way or another. Capped
// below 1 so a shot that offers a counter (whose outcome isn't known until
// the window closes, right at totalMs) never visually completes its approach
// before that reveal arrives -- see the !fx.outcome branch below.
const PENDING_MAX_FRACTION = 0.92;

// Performance's style shot: an uncontested hit flies as a curved arc instead
// of a straight line. The bolt keeps its normal progress along the straight
// attacker->impact line but is pushed sideways by a parabola (4f(1-f)) that is
// zero at both ends -- so it leaves and lands exactly where a normal bolt
// would. STYLE_ARC_FRACTION is the arc's peak height as a share of the shot's
// length; the arc eases in over STYLE_ARC_EASE_MS from the moment the server
// reveals the style, so a late reveal never makes the bolt jump.
const STYLE_ARC_FRACTION = 0.3;
const STYLE_ARC_MAX = 110;
const STYLE_ARC_EASE_MS = 450;
function styleArcGeometry(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { len, nx: -dy / len, ny: dx / len, peak: Math.min(STYLE_ARC_MAX, len * STYLE_ARC_FRACTION) };
}

// Pentalux's surround strike: on a hit the bolt flies straight until
// SPLIT_START_FRACTION of its flight, then splits into SPLIT_COUNT bolts that
// fan out to a ring around the target (SPLIT_RING_RADIUS, shrunk for short
// shots), and from SPLIT_CONVERGE_FRACTION converge on it from all sides.
// Like the style shot it only changes how the hit is drawn -- the server
// still resolves a single shot.
const SPLIT_COUNT = 5;
const SPLIT_START_FRACTION = 0.58;
const SPLIT_CONVERGE_FRACTION = 0.8;
const SPLIT_RING_RADIUS = 70;
function surroundBolts(from, to, f) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const radius = Math.min(SPLIT_RING_RADIUS, len * 0.4);
  const splitPoint = lerp(from, to, SPLIT_START_FRACTION);
  // One bolt always lands from the shooter's side; the other four fill out the pentagon.
  const base = Math.atan2(from.y - to.y, from.x - to.x);
  const out = [];
  for (let k = 0; k < SPLIT_COUNT; k++) {
    const a = base + (k * 2 * Math.PI) / SPLIT_COUNT;
    const ring = { x: to.x + Math.cos(a) * radius, y: to.y + Math.sin(a) * radius };
    if (f < SPLIT_CONVERGE_FRACTION) {
      const t = (f - SPLIT_START_FRACTION) / (SPLIT_CONVERGE_FRACTION - SPLIT_START_FRACTION);
      out.push({ pos: lerp(splitPoint, ring, 1 - Math.pow(1 - t, 2)), angle: headingDeg(splitPoint, ring) });
    } else {
      const t = Math.min(1, (f - SPLIT_CONVERGE_FRACTION) / (1 - SPLIT_CONVERGE_FRACTION));
      out.push({ pos: lerp(ring, to, t * t), angle: headingDeg(ring, to) });
    }
  }
  return out;
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Heading of the segment a -> b in SVG degrees (0 = +x, clockwise), used to
// point a Mega Morph bolt's teardrop along its line of flight.
function headingDeg(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

// Helixel's adaptive strain: the bolt leaves the blaster as one, peels apart into
// two strands over its first HELIX_SPLIT_DISTANCE of travel, and the pair twist
// around each other like a DNA double helix (one twist per HELIX_PITCH, each
// strand swinging HELIX_RADIUS to either side of the line of flight, with a rung
// joining them every HELIX_RUNG_SPACING), fusing back into one on arrival. The
// phase is tied to distance travelled, not time, so the twist keeps its shape
// whatever the shot's speed. Like Pentalux's split it is purely visual. All
// lengths are map units, scaled by `vs` like every other bolt dimension.
const HELIX_RADIUS = 13;
const HELIX_PITCH = 78;
const HELIX_SPLIT_DISTANCE = 70;
const HELIX_TRAIL = 150;
const HELIX_STEP = 7;
const HELIX_RUNG_SPACING = 18;
const HELIX_COLORS = ["#4dffa6", "#eafff3"];
function helixShapes(b, vs, key) {
  const rad = (b.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;
  const travelled = Math.hypot(b.pos.x - b.helixFrom.x, b.pos.y - b.helixFrom.y);
  const remaining = Math.hypot(b.helixTo.x - b.pos.x, b.helixTo.y - b.pos.y);
  const radius = HELIX_RADIUS * vs;
  const pitch = HELIX_PITCH * vs;
  const split = HELIX_SPLIT_DISTANCE * vs;
  const trail = Math.min(travelled, HELIX_TRAIL * vs);
  // Where strand `sign` (+1/-1) is when it is `back` map units behind the head.
  const at = (back, sign) => {
    const s = travelled - back;
    const open = Math.min(1, s / split);
    // The head fuses shut over the same distance on arrival; the tail keeps the shape it was drawn with.
    const fuse = back === 0 ? Math.min(1, remaining / split) : 1;
    const off = sign * radius * open * fuse * Math.sin((2 * Math.PI * s) / pitch);
    return { x: b.pos.x - ux * back + nx * off, y: b.pos.y - uy * back + ny * off };
  };
  const out = [];
  const step = HELIX_STEP * vs;
  for (let back = 0; back < trail; back += step) {
    const fade = 1 - back / Math.max(1, trail);
    for (let j = 0; j < 2; j++) {
      const sign = j === 0 ? 1 : -1;
      const p0 = at(back, sign);
      const p1 = at(Math.min(trail, back + step), sign);
      out.push(
        <line
          key={`${key}-s${j}-${back}`}
          className="shot-fx-helix-strand"
          x1={p0.x}
          y1={p0.y}
          x2={p1.x}
          y2={p1.y}
          strokeWidth={3.2 * vs}
          style={{ "--fx-color": HELIX_COLORS[j], opacity: fade }}
        />
      );
    }
  }
  const rungSpacing = HELIX_RUNG_SPACING * vs;
  for (let back = 0; back < trail; back += rungSpacing) {
    if (travelled - back < split * 0.35) break;
    const a = at(back, 1);
    const c = at(back, -1);
    out.push(
      <line
        key={`${key}-r-${back}`}
        className="shot-fx-helix-rung"
        x1={a.x}
        y1={a.y}
        x2={c.x}
        y2={c.y}
        strokeWidth={1.6 * vs}
        style={{ opacity: 0.75 * (1 - back / Math.max(1, trail)) }}
      />
    );
  }
  for (let j = 0; j < 2; j++) {
    const head = at(0, j === 0 ? 1 : -1);
    out.push(<circle key={`${key}-h${j}`} className="shot-fx-bolt" cx={head.x} cy={head.y} r={5 * vs} style={{ "--fx-color": HELIX_COLORS[j] }} />);
  }
  return out;
}

// Trackjaw's pounce strike: for the first POUNCE_START of its flight the slug is only a
// faint ghost, crouched low and swaying side to side with a few fading afterimages (it is
// stalking); then over the next POUNCE_RAMP it snaps into view and lunges, a bright streak
// stretching out behind it, and on a hit it claws the target (see the `claws` burst).
// Purely visual -- the server still resolves one ordinary shot. Lengths are map units,
// scaled by `vs` like every other bolt dimension.
const POUNCE_START = 0.66;
const POUNCE_RAMP = 0.1;
const POUNCE_STREAK = 90;
const POUNCE_SWAY = 7;
const POUNCE_SWAY_PERIOD = 26;
const POUNCE_COLORS = ["#ff8a3d", "#ffe3b8"];
const CLAW_DRAW_MS = 190;
function pounceShapes(b, vs, key) {
  const rad = (b.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;
  const total = Math.hypot(b.pounceTo.x - b.pounceFrom.x, b.pounceTo.y - b.pounceFrom.y) || 1;
  const travelled = Math.hypot(b.pos.x - b.pounceFrom.x, b.pos.y - b.pounceFrom.y);
  const reveal = Math.min(1, Math.max(0, (travelled / total - POUNCE_START) / POUNCE_RAMP));
  const stalk = 1 - reveal;
  const swayAt = (dist) => POUNCE_SWAY * vs * stalk * Math.sin(dist / (POUNCE_SWAY_PERIOD * vs));
  const head = { x: b.pos.x + nx * swayAt(travelled), y: b.pos.y + ny * swayAt(travelled) };
  const out = [];
  if (stalk > 0) {
    for (let i = 1; i <= 4; i++) {
      const back = i * 14 * vs;
      const off = swayAt(travelled - back);
      out.push(
        <circle
          key={`${key}-g${i}`}
          cx={b.pos.x - ux * back + nx * off}
          cy={b.pos.y - uy * back + ny * off}
          r={(4 - i * 0.6) * vs}
          style={{ fill: POUNCE_COLORS[0], opacity: 0.3 * (1 - i / 5) * stalk }}
          className="shot-fx-pounce-ghost"
        />
      );
    }
  }
  if (reveal > 0) {
    const len = POUNCE_STREAK * vs * reveal;
    const wide = 6.5 * vs;
    const tail = { x: head.x - ux * len, y: head.y - uy * len };
    const shoulder = { x: head.x - ux * 5 * vs, y: head.y - uy * 5 * vs };
    out.push(
      <path
        key={`${key}-streak`}
        className="shot-fx-pounce-streak"
        d={`M ${tail.x} ${tail.y} L ${shoulder.x + nx * wide} ${shoulder.y + ny * wide} L ${head.x + ux * 3 * vs} ${head.y + uy * 3 * vs} L ${shoulder.x - nx * wide} ${shoulder.y - ny * wide} Z`}
        style={{ "--fx-color": POUNCE_COLORS[0], opacity: 0.55 * reveal }}
      />,
      <line
        key={`${key}-core`}
        className="shot-fx-pounce-core"
        x1={tail.x}
        y1={tail.y}
        x2={head.x}
        y2={head.y}
        strokeWidth={2.2 * vs}
        style={{ opacity: 0.9 * reveal }}
      />
    );
  }
  out.push(
    <circle
      key={`${key}-head`}
      className="shot-fx-bolt"
      cx={head.x}
      cy={head.y}
      r={(4.5 + 2.5 * reveal) * vs}
      style={{ "--fx-color": POUNCE_COLORS[reveal > 0.5 ? 1 : 0], opacity: 0.38 + 0.62 * reveal }}
    />
  );
  return out;
}

// Chronix's time skip: the slug transforms and flies for a beat as an ordinary bolt, then --
// SKIP_VANISH_AFTER of the trip past the end of its windup -- it stops time. It vanishes for
// everyone: a clock face blooms where it was (ticks, a sweeping hand) and the whole map dims
// while time is frozen. A converging ring then closes in on a spot SKIP_LAND_GAP map units in
// front of the target, bursts into light there, and the bolt reappears and finishes the flight
// in a quick final leg. All timing is in flight-fraction space (`f`, the bolt's progress along
// from -> to), so it rides the same cruise clock as every other bolt and the shot still lands
// exactly when the server resolves it. Purely visual -- pair it with Uncounterable.
const SKIP_VANISH_AFTER = 0.04;
const SKIP_LAND_GAP = 120;
const SKIP_DIM_OPACITY = 0.26;
const SKIP_COLORS = { glow: "#9fd0ff", ring: "#cfe8ff", white: "#ffffff" };
function timeSkipShapes(b, vs, key) {
  const { skipFrom: from, skipTo: to } = b;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const clamp01 = (n) => Math.min(1, Math.max(0, n));
  const at = (t) => ({ x: from.x + dx * t, y: from.y + dy * t });
  const f = clamp01(((b.pos.x - from.x) * dx + (b.pos.y - from.y) * dy) / (len * len));
  const fVanish = Math.min(0.4, b.skipWindup + SKIP_VANISH_AFTER);
  const fLand = Math.min(0.9, Math.max(fVanish + 0.15, 1 - Math.min(SKIP_LAND_GAP / len, 0.45)));
  const fReturn = Math.min(0.8, fVanish + 0.5 * (1 - fVanish));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const out = [];

  if (f < fVanish) {
    // The ordinary bolt, with a faint halo -- the calm just before time stops.
    out.push(
      <circle key={`${key}-halo`} cx={b.pos.x} cy={b.pos.y} r={12 * vs} fill="none" stroke={SKIP_COLORS.ring} strokeWidth={1.4 * vs} style={{ opacity: 0.45 }} />,
      <circle key={`${key}-bolt`} className="shot-fx-bolt" cx={b.pos.x} cy={b.pos.y} r={7 * vs} style={{ "--fx-color": b.color }} />
    );
    return out;
  }

  if (f < fReturn) {
    // Time is stopped: nothing flies. A clock face where it vanished, the map dimmed, and a ring closing on the landing spot.
    const h = clamp01((f - fVanish) / (fReturn - fVanish));
    const envelope = Math.min(1, h / 0.12, (1 - h) / 0.12);
    const v = at(fVanish);
    const r = (16 + 34 * easeOut(h)) * vs;
    out.push(
      <rect key={`${key}-dim`} className="shot-fx-skip-dim" x={-100000} y={-100000} width={200000} height={200000} style={{ opacity: SKIP_DIM_OPACITY * envelope }} />,
      <circle key={`${key}-face`} className="shot-fx-skip-ring" cx={v.x} cy={v.y} r={r} strokeWidth={2.2 * vs} style={{ opacity: 0.9 * (1 - h * 0.6) }} />
    );
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      const long = k % 3 === 0;
      out.push(
        <line
          key={`${key}-tick${k}`}
          className="shot-fx-skip-ring"
          x1={v.x + Math.cos(a) * (r - (long ? 9 : 5) * vs)}
          y1={v.y + Math.sin(a) * (r - (long ? 9 : 5) * vs)}
          x2={v.x + Math.cos(a) * r}
          y2={v.y + Math.sin(a) * r}
          strokeWidth={(long ? 2.2 : 1.4) * vs}
          style={{ opacity: 0.85 * (1 - h * 0.6) }}
        />
      );
    }
    const hand = -Math.PI / 2 + h * Math.PI * 3;
    out.push(
      <line
        key={`${key}-hand`}
        className="shot-fx-skip-ring"
        x1={v.x}
        y1={v.y}
        x2={v.x + Math.cos(hand) * r * 0.72}
        y2={v.y + Math.sin(hand) * r * 0.72}
        strokeWidth={2.4 * vs}
        style={{ opacity: 0.9 * (1 - h * 0.5) }}
      />
    );
    if (h > 0.55) {
      const g = (h - 0.55) / 0.45;
      const land = at(fLand);
      out.push(
        <circle key={`${key}-converge`} className="shot-fx-skip-ring" cx={land.x} cy={land.y} r={(70 - 62 * easeOut(g)) * vs} strokeWidth={2 * vs} style={{ opacity: 0.85 * g }} />
      );
    }
    return out;
  }

  // Time resumes: a burst of light where it reappears, then the quick final leg to the target.
  const g = clamp01((f - fReturn) / (1 - fReturn));
  const land = at(fLand);
  const q = clamp01(g / 0.2);
  const flashR = (10 + 44 * easeOut(q)) * vs;
  if (q < 1) {
    out.push(
      <circle key={`${key}-flash`} className="shot-fx-skip-flash" cx={land.x} cy={land.y} r={flashR} style={{ opacity: Math.pow(1 - q, 1.2) }} />
    );
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      out.push(
        <line
          key={`${key}-ray${k}`}
          className="shot-fx-skip-ray"
          x1={land.x + Math.cos(a) * flashR * 0.6}
          y1={land.y + Math.sin(a) * flashR * 0.6}
          x2={land.x + Math.cos(a) * flashR * 1.55}
          y2={land.y + Math.sin(a) * flashR * 1.55}
          strokeWidth={2.2 * vs}
          style={{ opacity: 1 - q }}
        />
      );
    }
  }
  const t = easeOut(g);
  const head = { x: land.x + (to.x - land.x) * t, y: land.y + (to.y - land.y) * t };
  const travelled = Math.hypot(head.x - land.x, head.y - land.y);
  const dirLen = Math.hypot(to.x - land.x, to.y - land.y) || 1;
  const tailLen = Math.min(travelled, 70 * vs);
  out.push(
    <line
      key={`${key}-trail`}
      className="shot-fx-skip-ring"
      x1={head.x - ((to.x - land.x) / dirLen) * tailLen}
      y1={head.y - ((to.y - land.y) / dirLen) * tailLen}
      x2={head.x}
      y2={head.y}
      strokeWidth={4 * vs}
      style={{ opacity: 0.6 }}
    />,
    <circle key={`${key}-bolt`} className="shot-fx-bolt" cx={head.x} cy={head.y} r={7 * vs} style={{ "--fx-color": SKIP_COLORS.white }} />
  );
  return out;
}

// Zeus's lightning strike: the bolt is a real lightning bolt -- a jagged, crackling body
// (ZAP_SEGMENTS kinks, up to ZAP_AMPLITUDE off the line of flight and pinched to a point at
// both ends) trailing up to ZAP_BODY behind a white-hot head, with forks branching off it and
// sparks around the head; on a hit it arcs out of the target (see the `arcs` burst).
// The kinks are re-rolled as the bolt travels (the noise is seeded by distance travelled, not
// by the clock), so it crackles and shifts at any flight speed -- Zeus is ultra-fast, so its
// whole flight is short -- and a frozen frame is always the same shape. Purely visual.
// Lengths are map units, scaled by `vs` like every other bolt dimension.
const ZAP_BODY = 150;
const ZAP_SEGMENTS = 16;
const ZAP_AMPLITUDE = 11;
const ZAP_STEP = 9;
const ZAP_FORKS = [3, 7, 10, 13];
const ARC_DRAW_MS = 150;
const zapNoise = (i, tick) => {
  const s = Math.sin(i * 12.9898 + tick * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
const zapPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
function lightningShapes(b, vs, key) {
  const rad = (b.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;
  const travelled = Math.hypot(b.pos.x - b.zapFrom.x, b.pos.y - b.zapFrom.y);
  const tick = Math.floor(travelled / (ZAP_STEP * vs));
  const len = Math.min(travelled, ZAP_BODY * vs);
  const pts = [];
  for (let i = 0; i <= ZAP_SEGMENTS; i++) {
    const t = i / ZAP_SEGMENTS; // 0 at the tail, 1 at the head
    const back = len * (1 - t);
    const off = zapNoise(i, tick) * ZAP_AMPLITUDE * vs * Math.sin(Math.PI * t);
    pts.push({ x: b.pos.x - ux * back + nx * off, y: b.pos.y - uy * back + ny * off });
  }
  const body = zapPath(pts);
  const out = [
    <path key={`${key}-glow`} className="shot-fx-zap-glow" d={body} strokeWidth={8 * vs} style={{ opacity: 0.5 }} />,
    <path key={`${key}-core`} className="shot-fx-zap-core" d={body} strokeWidth={2.8 * vs} />,
  ];
  for (const i of ZAP_FORKS) {
    const base = pts[i];
    const side = zapNoise(i + 50, tick) > 0 ? 1 : -1;
    const spread = 0.55 + 0.5 * Math.abs(zapNoise(i + 99, tick));
    const dirx = ux * Math.cos(spread) + side * nx * Math.sin(spread);
    const diry = uy * Math.cos(spread) + side * ny * Math.sin(spread);
    const forkLen = (20 + 20 * Math.abs(zapNoise(i + 7, tick))) * vs;
    const kink = zapNoise(i + 13, tick) * 7 * vs;
    const mid = { x: base.x + dirx * forkLen * 0.5 - diry * kink, y: base.y + diry * forkLen * 0.5 + dirx * kink };
    const tip = { x: base.x + dirx * forkLen, y: base.y + diry * forkLen };
    out.push(<path key={`${key}-fork${i}`} className="shot-fx-zap-core" d={zapPath([base, mid, tip])} strokeWidth={1.7 * vs} style={{ opacity: 0.85 }} />);
  }
  for (let k = 0; k < 4; k++) {
    const a = zapNoise(k + 31, tick) * Math.PI;
    const r0 = 6 * vs;
    const r1 = (11 + 6 * Math.abs(zapNoise(k + 41, tick))) * vs;
    out.push(
      <line
        key={`${key}-spark${k}`}
        className="shot-fx-zap-core"
        x1={b.pos.x + Math.cos(a) * r0}
        y1={b.pos.y + Math.sin(a) * r0}
        x2={b.pos.x + Math.cos(a) * r1}
        y2={b.pos.y + Math.sin(a) * r1}
        strokeWidth={1.6 * vs}
      />
    );
  }
  out.push(<circle key={`${key}-head`} className="shot-fx-bolt" cx={b.pos.x} cy={b.pos.y} r={5.5 * vs} style={{ "--fx-color": "#ffd83d" }} />);
  return out;
}

// The ricochet streak (Speedstinger, and any slug with Ricochets): the bolt is a steel needle --
// a tapered streak up to STREAK_LEN long in the slug's element colour with a white-hot core,
// a spinning four-point glint at its head and sparks shed along its tail. A bounce leg (see
// fx.noWindup) also opens with a spark ping where it left the last target. The sparks are
// seeded by distance travelled (like Zeus's lightning), so they flicker at any speed. On a hit
// it shatters into steel shards (the `shards` burst). Purely visual. Lengths are map units,
// scaled by `vs` like every other bolt dimension.
const STREAK_LEN = 90;
const STREAK_SPARKS = 6;
const STREAK_PING_MS_DISTANCE = 70;
const SHARD_DRAW_MS = 130;
function streakShapes(b, vs, key) {
  const rad = (b.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;
  const travelled = Math.hypot(b.pos.x - b.streakFrom.x, b.pos.y - b.streakFrom.y);
  const tick = Math.floor(travelled / (8 * vs));
  const len = Math.min(travelled, STREAK_LEN * vs);
  const out = [];
  if (b.streakPing && travelled < STREAK_PING_MS_DISTANCE * vs) {
    // The carom ping: a ring and a handful of rays where the shot just bounced off the last target.
    const t = travelled / (STREAK_PING_MS_DISTANCE * vs);
    const o = b.streakFrom;
    out.push(<circle key={`${key}-ping`} className="shot-fx-streak-ring" cx={o.x} cy={o.y} r={(8 + 30 * t) * vs} strokeWidth={2.4 * vs} style={{ opacity: 1 - t }} />);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + 0.2;
      out.push(
        <line
          key={`${key}-pr${k}`}
          className="shot-fx-streak-spark"
          x1={o.x + Math.cos(a) * (10 + 12 * t) * vs}
          y1={o.y + Math.sin(a) * (10 + 12 * t) * vs}
          x2={o.x + Math.cos(a) * (18 + 26 * t) * vs}
          y2={o.y + Math.sin(a) * (18 + 26 * t) * vs}
          strokeWidth={2 * vs}
          style={{ opacity: 1 - t }}
        />
      );
    }
  }
  if (len > 1) {
    const tail = { x: b.pos.x - ux * len, y: b.pos.y - uy * len };
    const wide = 5.5 * vs;
    out.push(
      <path
        key={`${key}-needle`}
        className="shot-fx-streak-needle"
        d={`M ${tail.x} ${tail.y} L ${b.pos.x - ux * 3 * vs + nx * wide} ${b.pos.y - uy * 3 * vs + ny * wide} L ${b.pos.x + ux * 4 * vs} ${b.pos.y + uy * 4 * vs} L ${b.pos.x - ux * 3 * vs - nx * wide} ${b.pos.y - uy * 3 * vs - ny * wide} Z`}
        style={{ "--fx-color": b.color, opacity: 0.8 }}
      />,
      <line key={`${key}-core`} className="shot-fx-streak-core" x1={tail.x} y1={tail.y} x2={b.pos.x} y2={b.pos.y} strokeWidth={2 * vs} />
    );
    for (let k = 0; k < STREAK_SPARKS; k++) {
      const back = (10 + k * (STREAK_LEN / STREAK_SPARKS) * 0.85) * vs;
      if (back > len) break;
      const side = zapNoise(k, tick) > 0 ? 1 : -1;
      const sl = (5 + 7 * Math.abs(zapNoise(k + 20, tick))) * vs;
      const sx = b.pos.x - ux * back;
      const sy = b.pos.y - uy * back;
      out.push(
        <line
          key={`${key}-sp${k}`}
          className="shot-fx-streak-spark"
          x1={sx}
          y1={sy}
          x2={sx + (-ux * 0.5 + nx * side * 0.85) * sl}
          y2={sy + (-uy * 0.5 + ny * side * 0.85) * sl}
          strokeWidth={1.7 * vs}
          style={{ opacity: 1 - back / (STREAK_LEN * vs) }}
        />
      );
    }
  }
  // The glint: a four-point star at the head, spinning as it travels.
  const spin = travelled / (34 * vs);
  for (let k = 0; k < 2; k++) {
    const a = spin + (k * Math.PI) / 2;
    out.push(
      <line
        key={`${key}-gl${k}`}
        className="shot-fx-streak-core"
        x1={b.pos.x - Math.cos(a) * 11 * vs}
        y1={b.pos.y - Math.sin(a) * 11 * vs}
        x2={b.pos.x + Math.cos(a) * 11 * vs}
        y2={b.pos.y + Math.sin(a) * 11 * vs}
        strokeWidth={1.8 * vs}
      />
    );
  }
  out.push(<circle key={`${key}-head`} className="shot-fx-bolt" cx={b.pos.x} cy={b.pos.y} r={4.5 * vs} style={{ "--fx-color": "#ffffff" }} />);
  return out;
}

// The jagged arcs that crack out of a target a lightning bolt just struck, each drawing itself
// outward over ARC_DRAW_MS (staggered a little). Positions are relative to the impact point --
// the caller translates a <g> there -- and `sinceMs` is how long ago the bolt landed. Shared by
// a lightning-strike hit and a lightning chain arc.
function zapArcs(vs, sinceMs) {
  return Array.from({ length: 7 }, (_, k) => {
    const p = Math.min(1, Math.max(0, sinceMs / ARC_DRAW_MS - (k % 3) * 0.1));
    const a = (k * 2 * Math.PI) / 7 + zapNoise(k, 5) * 0.25;
    const pts = [0, 1, 2, 3].map((s) => {
      const r = (8 + s * 13) * vs;
      const wob = s === 0 ? 0 : zapNoise(k * 4 + s, 9) * 7 * vs;
      return { x: Math.cos(a) * r - Math.sin(a) * wob, y: Math.sin(a) * r + Math.cos(a) * wob };
    });
    return <path key={k} className="shot-fx-zap-core" d={zapPath(pts)} pathLength={1} strokeWidth={2.4 * vs} style={{ strokeDasharray: 1, strokeDashoffset: 1 - p }} />;
  });
}

// Standard bolts: every slug that has no animation of its own flies with a small, deliberately
// modest effect for its element -- a head shape plus a short trail (EL_REACH long at most) of a
// few fading pieces, drawn in the element's own colour (`b.color`). It is the plain neutral
// bolt through the windup and only appears at the transform, easing in over the first
// EL_EASE_IN of travel. Trail pieces are seeded by distance travelled (like the lightning), so
// they shimmer at any speed. Dual shots keep their own look, a Mega Morph draws the same effect
// scaled up (MEGA_ANIM_SCALE), and "None" stays a plain bolt. Lengths are map units, scaled by `vs` like every other bolt dimension.
const EL_REACH = 56;
const EL_EASE_IN = 30;
const elPoly = (cx, cy, r, sides, rot, noise) =>
  Array.from({ length: sides }, (_, k) => {
    const a = rot + (k * 2 * Math.PI) / sides;
    const rr = r * (1 + (noise ? zapNoise(k + 3, 1) * 0.28 : 0));
    return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
  }).join(" ");
function elementShapes(b, vs, key) {
  const rad = (b.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nx = -uy;
  const ny = ux;
  const travelled = Math.hypot(b.pos.x - b.elementFrom.x, b.pos.y - b.elementFrom.y);
  const tick = Math.floor(travelled / (8 * vs));
  const ease = Math.min(1, travelled / (EL_EASE_IN * vs));
  const col = b.color;
  const out = [];
  // A point `back` units behind the head and `off` units to the side (both unscaled).
  const at = (back, off = 0) => ({ x: b.pos.x - ux * back * vs + nx * off * vs, y: b.pos.y - uy * back * vs + ny * off * vs });
  // Whether a trail piece that far back has been drawn yet (nothing exists behind the transform point).
  const has = (back) => back * vs <= travelled && back <= EL_REACH;
  const fade = (i, n) => ease * (1 - i / (n + 1));
  const dot = (id, p, r, fill, o) => out.push(<circle key={`${key}-${id}`} className="shot-fx-el" cx={p.x} cy={p.y} r={Math.max(0.5, r) * vs} style={{ fill, opacity: o }} />);
  const ring = (id, p, r, stroke, o, w = 1.4) =>
    out.push(<circle key={`${key}-${id}`} className="shot-fx-el" cx={p.x} cy={p.y} r={r * vs} fill="none" stroke={stroke} strokeWidth={w * vs} style={{ opacity: o }} />);
  const line = (id, a, c, stroke, o, w = 1.5) =>
    out.push(<line key={`${key}-${id}`} className="shot-fx-el" x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke={stroke} strokeWidth={w * vs} strokeLinecap="round" style={{ opacity: o }} />);
  const star = (id, p, r, stroke, o) => {
    line(`${id}a`, { x: p.x - r * vs, y: p.y }, { x: p.x + r * vs, y: p.y }, stroke, o, 1.4);
    line(`${id}b`, { x: p.x, y: p.y - r * vs }, { x: p.x, y: p.y + r * vs }, stroke, o, 1.4);
  };
  // A cross turned by `ang` radians.
  const starRot = (id, p, r, ang, stroke, o) => {
    const c = Math.cos(ang) * r * vs;
    const s = Math.sin(ang) * r * vs;
    line(`${id}a`, { x: p.x - c, y: p.y - s }, { x: p.x + c, y: p.y + s }, stroke, o, 1.4);
    line(`${id}b`, { x: p.x + s, y: p.y - c }, { x: p.x - s, y: p.y + c }, stroke, o, 1.4);
  };
  const head = (r, fill = col) => out.push(<circle key={`${key}-head`} className="shot-fx-bolt" cx={b.pos.x} cy={b.pos.y} r={r * vs} style={{ "--fx-color": fill }} />);
  const spin = travelled / (40 * vs);

  switch (b.element) {
    case "Fire": {
      // A flickering flame: embers fall away behind a teardrop head.
      for (let i = 1; i <= 6; i++) {
        if (!has(i * 8)) break;
        dot(`e${i}`, at(i * 8, zapNoise(i, tick) * 2.6), 5.2 - i * 0.65, i < 3 ? "#ffb347" : col, 0.85 * fade(i, 6));
      }
      out.push(<path key={`${key}-flame`} className="shot-fx-bolt" d={MEGA_BOLT_PATH} transform={`translate(${b.pos.x} ${b.pos.y}) rotate(${b.angle}) scale(${0.42 * vs})`} style={{ "--fx-color": col }} />);
      dot("core", b.pos, 2.2, "#ffe9a0", 0.95);
      break;
    }
    case "Water": {
      // A droplet with a wavering string of drops behind it.
      for (let i = 1; i <= 5; i++) {
        if (!has(i * 9)) break;
        dot(`d${i}`, at(i * 9, Math.sin(i * 1.2 + travelled / (16 * vs)) * 3.5), 3.4 - i * 0.5, col, 0.75 * fade(i, 5));
      }
      head(5.2);
      dot("hi", at(-1, -1.6), 1.5, "#ffffff", 0.85);
      break;
    }
    case "Ice": {
      // A spinning crystal shedding a few small shards.
      for (let i = 1; i <= 4; i++) {
        if (!has(i * 11)) break;
        const p = at(i * 11, zapNoise(i + 3, tick) * 5);
        out.push(<polygon key={`${key}-s${i}`} className="shot-fx-el" points={elPoly(p.x, p.y, (3.6 - i * 0.45) * vs, 4, spin + i, false)} style={{ fill: "#e8fbff", opacity: 0.85 * fade(i, 4) }} />);
      }
      out.push(<polygon key={`${key}-head`} className="shot-fx-bolt" points={elPoly(b.pos.x, b.pos.y, 7 * vs, 4, spin, false)} style={{ "--fx-color": col }} />);
      break;
    }
    case "Plant": {
      // A seed with a couple of leaves spiralling off it.
      for (let i = 1; i <= 4; i++) {
        if (!has(i * 11)) break;
        const side = i % 2 ? 1 : -1;
        const p = at(i * 11, side * (4 + Math.sin(travelled / (18 * vs) + i)));
        out.push(
          <ellipse key={`${key}-l${i}`} className="shot-fx-el" cx={p.x} cy={p.y} rx={4.5 * vs} ry={2.2 * vs} transform={`rotate(${b.angle + side * 40 + i * 10} ${p.x} ${p.y})`} style={{ fill: i % 2 ? "#7ddc6a" : col, opacity: 0.85 * fade(i, 4) }} />
        );
      }
      head(4.8);
      break;
    }
    case "Earth": {
      // A tumbling rock trailing pebbles and dust.
      for (let i = 1; i <= 5; i++) {
        if (!has(i * 9)) break;
        const p = at(i * 9, zapNoise(i + 7, tick) * 5 + i * 0.8);
        const s = (3.2 - i * 0.4) * vs;
        out.push(<rect key={`${key}-p${i}`} className="shot-fx-el" x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} transform={`rotate(${i * 40 + travelled} ${p.x} ${p.y})`} style={{ fill: "#c9a97a", opacity: 0.8 * fade(i, 5) }} />);
      }
      out.push(<polygon key={`${key}-head`} className="shot-fx-bolt" points={elPoly(b.pos.x, b.pos.y, 6 * vs, 7, spin * 1.4, true)} style={{ "--fx-color": col }} />);
      break;
    }
    case "Air": {
      // A pale puff with a few streaks of wind and a swirl round it.
      for (const s of [-1, 0, 1]) {
        if (!has(14)) break;
        const a = at(8, s * 5);
        const m = at(22, s * 9 + Math.sin(travelled / (14 * vs) + s) * 2.5);
        const e = at(Math.min(46, travelled / vs), s * 5);
        out.push(<path key={`${key}-w${s}`} className="shot-fx-el" d={`M ${a.x} ${a.y} Q ${m.x} ${m.y} ${e.x} ${e.y}`} fill="none" stroke="#ffffff" strokeWidth={1.5 * vs} strokeLinecap="round" style={{ opacity: 0.42 * ease }} />);
      }
      out.push(
        <circle key={`${key}-swirl`} className="shot-fx-el" cx={b.pos.x} cy={b.pos.y} r={10 * vs} fill="none" stroke="#ffffff" strokeWidth={1.6 * vs} strokeLinecap="round" strokeDasharray={`${9 * vs} ${44 * vs}`} transform={`rotate(${spin * 180} ${b.pos.x} ${b.pos.y})`} style={{ opacity: 0.6 * ease }} />
      );
      head(3.8, "#ffffff");
      break;
    }
    case "Electricity": {
      // A white-hot core in the same electric blue as the chain arc, with a small, thin crackle
      // behind it -- nothing like Zeus's yellow lightning bolt.
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const back = Math.min(40, travelled / vs) * (i / 7);
        pts.push(at(back, i === 0 ? 0 : zapNoise(i, tick) * 3.6 * Math.sin((Math.PI * i) / 7)));
      }
      const zig = zapPath(pts);
      out.push(
        <path key={`${key}-zig-glow`} className="shot-fx-chain-glow" d={zig} strokeWidth={4 * vs} style={{ opacity: 0.5 * ease }} />,
        <path key={`${key}-zig`} className="shot-fx-chain-core" d={zig} strokeWidth={1.5 * vs} style={{ opacity: 0.95 * ease }} />
      );
      for (let k = 0; k < 2; k++) {
        const a = zapNoise(k + 31, tick) * Math.PI;
        line(`sp${k}`, { x: b.pos.x + Math.cos(a) * 5 * vs, y: b.pos.y + Math.sin(a) * 5 * vs }, { x: b.pos.x + Math.cos(a) * 11 * vs, y: b.pos.y + Math.sin(a) * 11 * vs }, "#cfeaff", 0.9 * ease, 1.3);
      }
      out.push(<circle key={`${key}-head`} className="shot-fx-chain-dot" cx={b.pos.x} cy={b.pos.y} r={4.4 * vs} />);
      break;
    }
    case "Energy": {
      // A pulsing core with a ring breathing round it and two small orbiting motes.
      ring("pulse", b.pos, 8 + 3 * Math.sin(travelled / (10 * vs)), col, 0.7 * ease);
      for (let k = 0; k < 2; k++) {
        const a = travelled / (14 * vs) + k * Math.PI;
        dot(`m${k}`, { x: b.pos.x + Math.cos(a) * 10 * vs, y: b.pos.y + Math.sin(a) * 10 * vs }, 1.8, "#ffffff", 0.9 * ease);
      }
      for (let i = 1; i <= 3; i++) {
        if (!has(i * 10)) break;
        dot(`t${i}`, at(i * 10), 2.4 - i * 0.4, col, 0.55 * fade(i, 3));
      }
      head(4.5);
      break;
    }
    case "Light": {
      // A bright core with a soft glow and four slow rays.
      dot("glow", b.pos, 12, col, 0.22 * ease);
      for (let k = 0; k < 4; k++) {
        const a = spin * 0.8 + (k * Math.PI) / 2;
        line(`r${k}`, { x: b.pos.x + Math.cos(a) * 5 * vs, y: b.pos.y + Math.sin(a) * 5 * vs }, { x: b.pos.x + Math.cos(a) * 13 * vs, y: b.pos.y + Math.sin(a) * 13 * vs }, "#fffbe0", 0.8 * ease, 1.5);
      }
      for (let i = 1; i <= 3; i++) {
        if (!has(i * 9)) break;
        dot(`t${i}`, at(i * 9), 3.6 - i * 0.7, col, 0.5 * fade(i, 3));
      }
      head(4.6, "#fffbe0");
      break;
    }
    case "Dark": {
      // A shadowy core leaving a thin drifting smoke.
      for (let i = 1; i <= 6; i++) {
        if (!has(i * 8)) break;
        dot(`s${i}`, at(i * 8, zapNoise(i + 11, tick) * 3.5), 4 + i * 0.9, col, 0.42 * fade(i, 6));
      }
      out.push(<circle key={`${key}-head`} className="shot-fx-bolt" cx={b.pos.x} cy={b.pos.y} r={5 * vs} style={{ "--fx-color": col, fill: "#241b30" }} />);
      break;
    }
    case "Metal": {
      // A steel hex nut turning steadily as it flies, with two clean parallel speed lines behind it.
      // (Nothing flashes or flickers.)
      const reach = Math.min(32, travelled / vs);
      if (reach > 8) {
        line("rail1", at(7, 2.7), at(reach, 2.7), col, 0.65 * ease, 1.4);
        line("rail2", at(7, -2.7), at(reach, -2.7), col, 0.65 * ease, 1.4);
      }
      out.push(<polygon key={`${key}-head`} className="shot-fx-bolt" points={elPoly(b.pos.x, b.pos.y, 6.6 * vs, 6, spin * 0.9, false)} style={{ "--fx-color": col }} />);
      out.push(<polygon key={`${key}-inner`} className="shot-fx-el" points={elPoly(b.pos.x, b.pos.y, 3.4 * vs, 6, spin * 0.9 + Math.PI / 6, false)} style={{ fill: "#e3e9ed", opacity: 0.92 }} />);
      break;
    }
    case "Healing": {
      // A soft, breathing green glow that sheds little crosses and sparkles as it flies. Each piece is
      // born at the head and then stays where it was left: it drifts out to one side of the bolt's own
      // line of flight (never toward a screen direction -- the view is top-down), turns, shrinks and
      // fades -- so the trail is always moving. (Seeded by distance travelled, like every trail, so it
      // keeps pace with the bolt at any speed.)
      const HEAL_LIFE = 64;
      const HEAL_SPACING = 9;
      dot("halo", b.pos, 9 + 1.6 * Math.sin(travelled / (9 * vs)), col, 0.22 * ease);
      const newest = Math.floor(travelled / vs / HEAL_SPACING);
      for (let k = newest; k >= 1 && k > newest - Math.ceil(HEAL_LIFE / HEAL_SPACING); k--) {
        const age = travelled / vs - k * HEAL_SPACING;
        if (age < 0 || age > HEAL_LIFE) continue;
        const life = age / HEAL_LIFE;
        const side = zapNoise(k, 7) > 0 ? 1 : -1;
        const born = at(age);
        const lateral = side * (1.5 + age * 0.15 + 2.2 * Math.sin(age / 9 + k));
        const p = { x: born.x + nx * lateral * vs, y: born.y + ny * lateral * vs };
        const o = Math.min(1, age / 5) * (1 - life) * ease;
        if (k % 3 === 0) dot(`h${k}`, p, 2.2 * (1 - life * 0.5), "#e6ffe9", 0.9 * o);
        else starRot(`c${k}`, p, 4.2 * (1 - life * 0.55), age * 0.06 + k, "#e6ffe9", 0.9 * o);
      }
      head(4.8);
      break;
    }
    case "Psychic": {
      // A core with ripples spreading out behind it.
      for (let i = 1; i <= 3; i++) {
        if (!has(i * 10)) break;
        ring(`rp${i}`, at(i * 10), 5 + i * 3.5 + Math.sin(travelled / (12 * vs) + i) * 1.2, col, 0.55 * fade(i, 3));
      }
      head(4.8);
      break;
    }
    case "Toxic": {
      // A sickly core with bubbles rising away behind it.
      for (let i = 1; i <= 5; i++) {
        if (!has(i * 8)) break;
        const p = at(i * 8, zapNoise(i + 5, tick) * 3 + i * 1.1);
        out.push(<circle key={`${key}-b${i}`} className="shot-fx-el" cx={p.x} cy={p.y} r={(3.4 - i * 0.4) * vs} stroke={col} strokeWidth={1.2 * vs} style={{ fill: col, fillOpacity: 0.22, opacity: 0.85 * fade(i, 5) }} />);
      }
      head(5);
      break;
    }
    case "Unique": {
      // A white core with twinkling multicoloured sparkles in its wake.
      const palette = ["#ff9ad5", "#8fe9ff", "#ffe27a"];
      for (let i = 1; i <= 5; i++) {
        if (!has(i * 9)) break;
        star(`sp${i}`, at(i * 9, zapNoise(i + 9, tick) * 6), (3.6 - i * 0.4) * (0.55 + 0.45 * Math.abs(Math.sin(travelled / (7 * vs) + i))), palette[i % 3], 0.9 * fade(i, 5));
      }
      head(4.6, "#ffffff");
      break;
    }
    default:
      head(5.5);
  }
  return out;
}

// A slug's chain arc -- the electric arc that leaps from the target it struck to the next one.
// Deliberately NOT drawn like Zeus's lightning strike (a bright yellow-white head dragging a long
// jagged tail, with forks): this is a thin, tight electric-blue arc anchored at the target it
// struck that whips out to the next one over `totalMs` (CHAIN_ARC_MS on the server, a fixed
// quarter of a second whatever the distance), then holds for CHAIN_ARC_HOLD_MS, crackling,
// joining the two before it fades, with a ring of blue spark flashing where it lands. The kinks
// re-roll on the clock (the arc is anchored, not travelling, so distance can't seed them).
const CHAIN_ARC_HOLD_MS = 220;
function chainArcShapes(fx, elapsed, totalMs, vs) {
  const from = fx.attackerPos;
  const to = fx.impactPoint;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const t = Math.min(1, elapsed / totalMs);
  const reach = 1 - Math.pow(1 - t, 2); // whips out fast, then settles
  const since = Math.max(0, elapsed - totalMs);
  const op = Math.max(0, 1 - since / CHAIN_ARC_HOLD_MS);
  const tick = Math.floor(elapsed / 38);
  const reachLen = len * reach;
  const n = Math.max(5, Math.round(reachLen / (12 * vs)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const off = zapNoise(i, tick) * 7 * vs * Math.sin(Math.PI * f); // pinned at both ends
    pts.push({ x: from.x + ux * reachLen * f + nx * off, y: from.y + uy * reachLen * f + ny * off });
  }
  const d = zapPath(pts);
  const tip = pts[pts.length - 1];
  const out = [
    <path key="arc-glow" className="shot-fx-chain-glow" d={d} strokeWidth={6 * vs} style={{ opacity: 0.5 * op }} />,
    <path key="arc-core" className="shot-fx-chain-core" d={d} strokeWidth={1.8 * vs} style={{ opacity: op }} />,
    <circle key="arc-origin" className="shot-fx-chain-core" cx={from.x} cy={from.y} r={5 * vs} style={{ opacity: 0.8 * op }} />,
  ];
  if (since === 0) {
    out.push(<circle key="arc-tip" className="shot-fx-chain-dot" cx={tip.x} cy={tip.y} r={2.6 * vs} />);
  } else {
    const k = Math.min(1, since / CHAIN_ARC_HOLD_MS);
    out.push(<circle key="arc-land" className="shot-fx-chain-glow" cx={to.x} cy={to.y} r={(6 + 22 * k) * vs} strokeWidth={2 * vs} style={{ opacity: 0.9 * op }} />);
  }
  return out;
}

// Standard bolts explode in their own way, by element -- the impact burst that replaces the flat
// coloured disc. `since` is how long ago the bolt landed; it plays out over BURST_LINGER_MS (a
// miss plays a half-size version). Everything is drawn around the impact point (the caller puts
// a <g> there) and driven by progress alone, so it is the same at any frame rate, and nothing
// pops or flickers: every piece grows, moves and fades monotonically (Electricity's crackle
// re-rolls a few times, as lightning should).
function elementBurst(type, since, vs, col, key) {
  const p = Math.min(1, since / BURST_LINGER_MS);
  const e = 1 - Math.pow(1 - p, 3); // bursts out fast, then settles
  const f = 1 - p;
  const out = [];
  let id = 0;
  const nextKey = () => `${key}-${id++}`;
  const S = (n) => n * vs;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const ang = (k, n, jitter = 0.3) => (k * 2 * Math.PI) / n + zapNoise(k, 2) * jitter;
  const disc = (x, y, r, fill, o) => out.push(<circle key={nextKey()} className="shot-fx-el" cx={S(x)} cy={S(y)} r={Math.max(0.1, S(r))} style={{ fill, opacity: o }} />);
  const ringC = (x, y, r, stroke, o, w = 2) =>
    out.push(<circle key={nextKey()} className="shot-fx-el" cx={S(x)} cy={S(y)} r={Math.max(0.1, S(r))} fill="none" stroke={stroke} strokeWidth={S(w)} style={{ opacity: o }} />);
  const seg = (x1, y1, x2, y2, stroke, o, w = 2) =>
    out.push(<line key={nextKey()} className="shot-fx-el" x1={S(x1)} y1={S(y1)} x2={S(x2)} y2={S(y2)} stroke={stroke} strokeWidth={S(w)} strokeLinecap="round" style={{ opacity: o }} />);
  const poly = (x, y, r, sides, rot, style) =>
    out.push(<polygon key={nextKey()} className="shot-fx-el" points={elPoly(S(x), S(y), S(r), sides, rot, false)} style={style} />);
  const cross = (x, y, r, rot, stroke, o, w = 1.6) => {
    seg(x - Math.cos(rot) * r, y - Math.sin(rot) * r, x + Math.cos(rot) * r, y + Math.sin(rot) * r, stroke, o, w);
    seg(x + Math.sin(rot) * r, y - Math.cos(rot) * r, x - Math.sin(rot) * r, y + Math.cos(rot) * r, stroke, o, w);
  };

  switch (type) {
    case "Fire": {
      // A fireball with a hot core, throwing embers out evenly in every direction that shrink as they burn out.
      disc(0, 0, 12 + 22 * e, "#ff6a2b", 0.55 * f);
      disc(0, 0, 8 + 14 * e, "#ffb347", 0.7 * f);
      disc(0, 0, 4 + 7 * e, "#fff0b0", 0.9 * f);
      for (let k = 0; k < 8; k++) {
        const a = ang(k, 8);
        const d = 14 + 36 * e * (0.7 + 0.3 * Math.abs(zapNoise(k + 9, 2)));
        disc(Math.cos(a) * d, Math.sin(a) * d, 2.6 * (1 - p * 0.7), k % 2 ? "#ffb347" : col, 0.9 * f);
      }
      break;
    }
    case "Water": {
      // A splash: ripples spread out while drops burst outward evenly in every direction and shrink,
      // as if falling away from the camera under gravity (the view is top-down, so "down" is not a
      // screen direction: nothing may drift north or south).
      ringC(0, 0, 8 + 30 * e, "#d8efff", 0.8 * f, 2.2);
      ringC(0, 0, 4 + 18 * e, col, 0.7 * f, 2);
      disc(0, 0, 6 * (1 - p), "#ffffff", 0.6 * f);
      for (let k = 0; k < 10; k++) {
        const a = ang(k, 10);
        const v = 30 + 10 * Math.abs(zapNoise(k + 4, 2));
        disc(Math.cos(a) * v * e * 1.2, Math.sin(a) * v * e * 1.2, 2.8 * (1 - p * 0.75), col, 0.9 * (1 - p * 0.9));
      }
      break;
    }
    case "Ice": {
      // A frozen shatter: a frost ring snaps outward and spinning shards fly off.
      ringC(0, 0, 6 + 34 * e, "#ffffff", 0.75 * f, 2);
      disc(0, 0, 10 * (1 - e) + 2, "#e8fbff", 0.7 * f);
      for (let k = 0; k < 9; k++) {
        const a = ang(k, 9);
        const d = 10 + 34 * e;
        poly(Math.cos(a) * d, Math.sin(a) * d, 5 * (1 - p * 0.5), 3, a + p * 3, { fill: "#bfefff", stroke: "#ffffff", strokeWidth: S(0.8), opacity: 0.95 * f });
      }
      break;
    }
    case "Plant": {
      // A bloom: a green pulse with leaves spinning off it.
      disc(0, 0, 8 + 22 * e, col, 0.35 * f);
      ringC(0, 0, 6 + 26 * e, "#7ddc6a", 0.6 * f, 2);
      for (let k = 0; k < 8; k++) {
        const a = ang(k, 8);
        const d = 10 + 32 * e;
        const x = S(Math.cos(a) * d);
        const y = S(Math.sin(a) * d);
        out.push(
          <ellipse key={nextKey()} className="shot-fx-el" cx={x} cy={y} rx={S(5)} ry={S(2.4)} transform={`rotate(${(a * 180) / Math.PI + p * 120} ${x} ${y})`} style={{ fill: k % 2 ? "#7ddc6a" : col, opacity: 0.9 * f }} />
        );
      }
      break;
    }
    case "Earth": {
      // A rock burst: a puff of dust and chunks that fly outward in every direction and shrink, as if
      // dropping away from the camera (top-down view: no screen-direction fall).
      for (let k = 0; k < 5; k++) {
        const a = ang(k, 5);
        disc(Math.cos(a) * (6 + 16 * e), Math.sin(a) * (6 + 16 * e), 7 + 10 * e, "#c9a97a", 0.28 * f);
      }
      for (let k = 0; k < 8; k++) {
        const a = ang(k, 8);
        const v = 14 + 30 * Math.abs(zapNoise(k + 2, 3));
        poly(Math.cos(a) * v * e * 1.1, Math.sin(a) * v * e * 1.1, 4 * (1 - p * 0.7), 4, k + p * 5, { fill: "#a97c50", stroke: "#5d4630", strokeWidth: S(0.8), opacity: 0.95 * (1 - p * 0.8) });
      }
      break;
    }
    case "Air": {
      // A gust: swirling arcs turn outward with a few streaks of wind.
      for (let k = 0; k < 3; k++) {
        const r = 10 + 28 * e * (0.6 + k * 0.2);
        out.push(
          <circle key={nextKey()} className="shot-fx-el" cx={0} cy={0} r={S(r)} fill="none" stroke="#ffffff" strokeWidth={S(2.2)} strokeLinecap="round" strokeDasharray={`${S(r * 0.9)} ${S(r * 2.2)}`} transform={`rotate(${p * 200 + k * 120})`} style={{ opacity: 0.6 * f }} />
        );
      }
      for (let k = 0; k < 6; k++) {
        const a = ang(k, 6);
        const r0 = 12 + 20 * e;
        seg(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * (r0 + 10), Math.sin(a) * (r0 + 10), "#ffffff", 0.45 * f, 1.6);
      }
      break;
    }
    case "Electricity": {
      // A flash with electric-blue crackles forking out of it (the same blue as the bolt and chain arc).
      disc(0, 0, 6 + 12 * e, "#cfeaff", 0.8 * f);
      ringC(0, 0, 6 + 30 * e, "#4fb0ff", 0.7 * f, 2);
      const tick = Math.floor(p * 8);
      for (let k = 0; k < 6; k++) {
        const a = ang(k, 6, 0.2);
        const reach = 10 + 34 * e;
        const pts = [];
        for (let s = 0; s <= 3; s++) {
          const r = 6 + (reach - 6) * (s / 3);
          const wob = s === 0 || s === 3 ? 0 : zapNoise(k * 4 + s, tick) * 5;
          pts.push({ x: S(Math.cos(a) * r - Math.sin(a) * wob), y: S(Math.sin(a) * r + Math.cos(a) * wob) });
        }
        out.push(<path key={nextKey()} className="shot-fx-chain-core" d={zapPath(pts)} strokeWidth={S(1.8)} style={{ opacity: f }} />);
      }
      break;
    }
    case "Energy": {
      // Concentric shockwaves roll out from a bright core.
      for (let k = 0; k < 3; k++) {
        const pk = clamp01(p * 1.6 - k * 0.25);
        ringC(0, 0, 6 + 34 * pk, col, 0.8 * (1 - pk), 2.4);
      }
      disc(0, 0, 8 * (1 - p) + 2, "#ffffff", 0.9 * f);
      for (let k = 0; k < 6; k++) {
        const a = ang(k, 6, 0.1);
        const d = 10 + 30 * e;
        disc(Math.cos(a) * d, Math.sin(a) * d, 1.8, "#ffffff", 0.8 * f);
      }
      break;
    }
    case "Light": {
      // A flash of white with rays shooting out and a soft glow.
      disc(0, 0, 26 * e, col, 0.25 * f);
      disc(0, 0, 10 + 14 * e, "#fffbe0", 0.9 * Math.pow(f, 1.5));
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.2;
        seg(Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * (14 + 44 * e), Math.sin(a) * (14 + 44 * e), "#fffbe0", 0.85 * f, 2.2);
      }
      break;
    }
    case "Dark": {
      // A collapse into the void: a ring pulls inward while dark tendrils curl out of a black core.
      ringC(0, 0, 36 * (1 - p) + 4, col, 0.8 * f, 2.4);
      disc(0, 0, 5 + 12 * e, "#241b30", 0.85 * f);
      for (let k = 0; k < 6; k++) {
        const a = ang(k, 6);
        const d = 10 + 30 * e;
        const c = a + 0.6;
        out.push(
          <path
            key={nextKey()}
            className="shot-fx-el"
            d={`M ${S(Math.cos(a) * 6)} ${S(Math.sin(a) * 6)} Q ${S(Math.cos(c) * d * 0.6)} ${S(Math.sin(c) * d * 0.6)} ${S(Math.cos(a) * d)} ${S(Math.sin(a) * d)}`}
            fill="none"
            stroke={col}
            strokeWidth={S(2.4)}
            strokeLinecap="round"
            style={{ opacity: 0.6 * f }}
          />
        );
      }
      break;
    }
    case "Metal": {
      // A clang: a steel shockwave and a few straight sparks, all fading smoothly (no flashing).
      ringC(0, 0, 6 + 30 * e, "#dfe6ea", 0.75 * f, 2.2);
      ringC(0, 0, 3 + 14 * e, col, 0.8 * f, 3);
      for (let k = 0; k < 6; k++) {
        const a = ang(k, 6, 0.15);
        seg(Math.cos(a) * (8 + 22 * e), Math.sin(a) * (8 + 22 * e), Math.cos(a) * (16 + 34 * e), Math.sin(a) * (16 + 34 * e), "#f4f7f9", 0.85 * f, 2);
      }
      break;
    }
    case "Healing": {
      // A gentle pulse of green light with little crosses floating outward in every direction, swelling
      // slightly as they rise toward the camera (top-down view: nothing drifts north).
      disc(0, 0, 8 + 22 * e, col, 0.3 * f);
      ringC(0, 0, 6 + 26 * e, "#e6ffe9", 0.65 * f, 2);
      for (let k = 0; k < 6; k++) {
        const a = ang(k, 6, 0.2);
        cross(Math.cos(a) * (10 + 18 * e), Math.sin(a) * (10 + 18 * e), 4 * (1 + p * 0.3), p * 2 + k, "#f2fff4", 0.9 * f);
      }
      break;
    }
    case "Psychic": {
      // Rippling mind-waves: wobbling rings roll outward from a violet core.
      for (let k = 0; k < 3; k++) {
        const pk = clamp01(p * 1.5 - k * 0.2);
        const r = 6 + 34 * pk;
        const pts = Array.from({ length: 29 }, (_, j) => {
          const a = (j / 28) * 2 * Math.PI;
          const rr = r + Math.sin(a * 5 + pk * 10) * 2.2;
          return { x: S(Math.cos(a) * rr), y: S(Math.sin(a) * rr) };
        });
        out.push(<path key={nextKey()} className="shot-fx-el" d={`${zapPath(pts)} Z`} fill="none" stroke={col} strokeWidth={S(2)} style={{ opacity: 0.7 * (1 - pk) }} />);
      }
      disc(0, 0, 6 * (1 - p) + 1, "#e7c5ff", 0.8 * f);
      break;
    }
    case "Toxic": {
      // A noxious cloud: bubbles spread out evenly in every direction, swelling as they rise toward the
      // camera, then pop (top-down view: nothing drifts north).
      disc(0, 0, 10 + 24 * e, col, 0.25 * f);
      for (let k = 0; k < 8; k++) {
        const a = ang(k, 8);
        const d = 8 + 24 * e * (0.6 + 0.4 * Math.abs(zapNoise(k + 6, 2)));
        const o = p < 0.75 ? 0.9 : ((1 - p) / 0.25) * 0.9;
        out.push(
          <circle key={nextKey()} className="shot-fx-el" cx={S(Math.cos(a) * d)} cy={S(Math.sin(a) * d)} r={S(2.5 + 3 * p)} stroke={col} strokeWidth={S(1.2)} style={{ fill: col, fillOpacity: 0.2, opacity: o }} />
        );
      }
      break;
    }
    case "Unique": {
      // A shower of multicoloured sparkles.
      ringC(0, 0, 6 + 30 * e, "#ffffff", 0.5 * f, 1.6);
      const palette = ["#ff9ad5", "#8fe9ff", "#ffe27a"];
      for (let k = 0; k < 10; k++) {
        const a = ang(k, 10);
        const d = 8 + 38 * e;
        const r = 4 * (0.5 + 0.5 * Math.abs(Math.sin(p * 14 + k))) * (1 - p * 0.4);
        cross(Math.cos(a) * d, Math.sin(a) * d, r, 0, palette[k % 3], 0.95 * f, 1.5);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

// Bladier's knife throw: Bladier is the ordinary Metal bolt, transformation and all. When there is a
// wall in its path the bolt throws a small knife ahead of itself shortly before the wall (the server
// says where: `throwT`, and `landT` where the bolt is when the knife lands -- see daggerThrowPlan).
// The knife tumbles to the wall blade-first (a whole number of turns), the wall is cut in a flash of
// light and sparks along its length, and the bolt then flies through the gap it made. With no wall in
// the way nothing is thrown. The knife's place is a function of how far the bolt has flown, so there
// are no timers and it rides the same clock as every other bolt. The server breaks the wall at the
// moment the knife lands. Purely visual.
const KNIFE_TURNS = 2;
const KNIFE_SLICE_ZONE = 90;
const KNIFE_COLORS = { blade: "#dfe8f2", edge: "#ffffff", shade: "#8798ad", grip: "#6a5240", glow: "#a9c4e2" };
function knifeShapes(b, vs, key) {
  const { from, to, pierce } = b.knife;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const at = (t) => ({ x: from.x + dx * t, y: from.y + dy * t });
  const f = Math.min(1, Math.max(0, ((b.pos.x - from.x) * dx + (b.pos.y - from.y) * dy) / (len * len)));
  const fPierce = Math.hypot(pierce.x - from.x, pierce.y - from.y) / len;
  const { throwT, landT } = pierce;
  const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
  const ux = dx / len;
  const uy = dy / len;
  const out = [];
  if (f < throwT) return out;

  if (f < landT) {
    // In the air: faster than the bolt, so it pulls away from it and reaches the wall first.
    const flown = (f - throwT) / (landT - throwT);
    const kf = throwT + (fPierce - throwT) * flown;
    const pos = at(kf);
    for (let i = 0; i < 3; i++) {
      const back = (14 + i * 12) * vs;
      out.push(
        <line
          key={`${key}-streak${i}`}
          x1={pos.x - ux * back}
          y1={pos.y - uy * back}
          x2={pos.x - ux * 3 * vs}
          y2={pos.y - uy * 3 * vs}
          style={{ stroke: KNIFE_COLORS.glow, strokeLinecap: "round", strokeWidth: (2.6 - i * 0.7) * vs, opacity: 0.2 + 0.1 * (2 - i) }}
        />
      );
    }
    // A small ring where it left the bolt.
    if (flown < 0.3) {
      const r = (4 + 14 * (flown / 0.3)) * vs;
      const origin = at(throwT);
      out.push(<circle key={`${key}-release`} cx={origin.x} cy={origin.y} r={r} style={{ fill: "none", stroke: KNIFE_COLORS.edge, strokeWidth: 1.4 * vs, opacity: 0.8 * (1 - flown / 0.3) }} />);
    }
    // The knife, pointing along +x and then turned onto its heading plus the tumble. It's a fraction
    // of a dagger's size: the bolt throws it, it isn't the bolt.
    out.push(
      <g key={`${key}-knife`} transform={`translate(${pos.x} ${pos.y}) rotate(${heading + 360 * KNIFE_TURNS * flown}) scale(${vs * 0.62})`}>
        <path d="M 15 0 L 3 -3.4 L -5 -3 L -5 3 L 3 3.4 Z" style={{ fill: KNIFE_COLORS.blade, stroke: KNIFE_COLORS.shade, strokeWidth: 0.9, strokeLinejoin: "round" }} />
        <line x1="14" y1="0" x2="-5" y2="0" style={{ stroke: KNIFE_COLORS.edge, strokeWidth: 0.9, opacity: 0.9 }} />
        <rect x="-7.4" y="-6" width="2.6" height="12" rx="1" style={{ fill: KNIFE_COLORS.shade }} />
        <rect x="-14" y="-1.6" width="7" height="3.2" rx="1" style={{ fill: KNIFE_COLORS.grip }} />
        <circle cx="-15" cy="0" r="2.3" style={{ fill: KNIFE_COLORS.shade }} />
      </g>
    );
    return out;
  }

  // The cut: a flash along the wall and sparks thrown off it, driven by how far the bolt has got
  // since the knife landed.
  const p = ((f - landT) * len) / (KNIFE_SLICE_ZONE * vs);
  if (p < 1) {
    const ease = 1 - Math.pow(1 - Math.min(1, p * 2.4), 3);
    const wall = (pierce.wallAngle * Math.PI) / 180;
    const wx = Math.cos(wall);
    const wy = Math.sin(wall);
    const half = (8 + 36 * ease) * vs;
    const fade = 1 - p;
    out.push(
      <line key={`${key}-cut-glow`} x1={pierce.x - wx * half} y1={pierce.y - wy * half} x2={pierce.x + wx * half} y2={pierce.y + wy * half} style={{ stroke: KNIFE_COLORS.glow, strokeLinecap: "round", strokeWidth: 7 * vs * fade, opacity: 0.55 * fade }} />,
      <line key={`${key}-cut-core`} x1={pierce.x - wx * half} y1={pierce.y - wy * half} x2={pierce.x + wx * half} y2={pierce.y + wy * half} style={{ stroke: KNIFE_COLORS.edge, strokeLinecap: "round", strokeWidth: 2.2 * vs * fade, opacity: 0.95 * fade }} />
    );
    // Sparks: mostly along the wall both ways, a few kicked back toward the slinger.
    const back = Math.atan2(-dy, -dx);
    const sparks = [
      { a: wall, r: 1 },
      { a: wall + Math.PI, r: 1 },
      { a: wall + 0.35, r: 0.7 },
      { a: wall + Math.PI - 0.35, r: 0.7 },
      { a: wall - 0.35, r: 0.8 },
      { a: wall + Math.PI + 0.35, r: 0.8 },
      { a: back + 0.5, r: 0.9 },
      { a: back - 0.5, r: 0.9 },
    ];
    sparks.forEach((s, i) => {
      const reach = (10 + 44 * s.r * ease) * vs;
      const sx = pierce.x + Math.cos(s.a) * reach;
      const sy = pierce.y + Math.sin(s.a) * reach;
      const tail = 7 * s.r * (1 - ease * 0.6) * vs;
      out.push(
        <line
          key={`${key}-spark${i}`}
          x1={sx - Math.cos(s.a) * tail}
          y1={sy - Math.sin(s.a) * tail}
          x2={sx}
          y2={sy}
          style={{ stroke: i % 2 ? KNIFE_COLORS.blade : KNIFE_COLORS.edge, strokeLinecap: "round", strokeWidth: 1.6 * vs, opacity: fade }}
        />
      );
    });
  }
  return out;
}

// A Mega Morph bolt: a teardrop instead of the ordinary round bolt. Drawn
// pointing along +x (round head leading at the origin, tapering tail behind)
// and rotated into place by the caller.
// How much bigger a Mega Morph draws its slug's animation (bolt effects and impact effects alike).
const MEGA_ANIM_SCALE = 1.7;
const MEGA_BOLT_PATH ="M -30 0 C -18 -3 -8 -10 0 -10 A 10 10 0 0 1 0 10 C -8 10 -18 3 -30 0 Z";

// A shot's flight: attacker -> impactPoint over `windowMs * SHOT_FLIGHT_MULTIPLIER`.
// The reaction window now runs the *entire* flight -- a defender can wait
// right up until the shot would actually land -- so a clash (if any) always
// lands exactly at the end of that flight, the same moment the reaction
// window closes and the shot would otherwise have hit. Mirrors
// server/src/combatRules.js's SHOT_FLIGHT_MULTIPLIER -- keep the two in sync.
const SHOT_FLIGHT_MULTIPLIER = 1;

// The slug crawls out of the blaster slowly, then "transforms" and blazes
// through the rest over a flat FAST_PHASE_MS burst -- while
// public/slugterra-velocity.mp3 (~1.83s, its actual length, SOUND_DURATION_MS)
// is still playing for its last TRANSFORM_LEAD_MS, not waiting for the sound
// to finish first. Only the very first leg of a flight gets this slow start
// (the sound only plays once, at launch); a post-clash continuation is
// already up to speed. Mirrors server/src/combatRules.js's
// SHOT_SOUND_MS/SHOT_TRANSFORM_LEAD_MS/SHOT_SLOW_PHASE_MS/SHOT_FAST_PHASE_MS
// -- keep the numbers in sync.
const SOUND_DURATION_MS = 1830;
const TRANSFORM_LEAD_MS = 1000;
const SLOW_PHASE_MS = SOUND_DURATION_MS - TRANSFORM_LEAD_MS; // 830ms
const FAST_PHASE_MS = 2500; // +1000ms over the original 1500 -- mirrors server/src/combatRules.js's SHOT_FAST_PHASE_MS
const SHOT_FLIGHT_MS = SLOW_PHASE_MS + FAST_PHASE_MS; // 3330ms -- fallback total flight time if fx.windowMs is ever missing
// Fallback windup share (see phasedFraction) for fx with no real
// weapon/distance behind them -- the chain arc, a pod blast -- which don't
// carry their own fx.windupFraction from the server. A real shot's actual
// share (server: shotWindupFraction) varies per shot, since the windup
// covers a *fixed* distance (a weapon stat) that's a bigger slice of a
// close shot's total trip than a far one's -- see combatRules.js's
// shotWindupDistance for why that, and not a flat fraction of every shot's
// own distance, is what keeps the bolt's cruise speed constant regardless
// of range.
const SLOW_PHASE_DISTANCE_FRACTION = 0.2;
// Share of the windup's OWN distance (not the whole trip) covered by the
// instant launch kick below -- mirrors server/src/combatRules.js's
// SHOT_LAUNCH_KICK_RATIO. A pure linear ramp starts at zero velocity, so
// for the first several frames the bolt barely clears the attacker's own
// token -- reads as "the sound is playing but nothing is flying yet."
// Instead it pops out this share of the windup instantly, then eases
// through the rest, so the launch is visibly simultaneous with the sound.
const LAUNCH_KICK_RATIO = 0.4;
// Bolt colour while the slug is still winding up -- see ShotEffect.
const WINDUP_BOLT_COLOR = "#cfd6e4";

// Explosion burst sizing -- three clearly distinct tiers so a glance at the
// map tells you what kind of hit just landed. An AOE Blast slug's burst is
// sized to its actual blast radius (mirrors server/src/combatRules.js's
// AOE_RADIUS -- keep in sync) so it visually reads as "everyone in this
// circle got hit," on a genuine hit *or* a miss (an AOE shot still
// detonates wherever it lands, see the server's resolveNormalHit). A normal
// hit's burst stays well below that, but well above a miss's, so the three
// never get confused for one another.
const AOE_BURST_RADIUS = 120;
const HIT_BURST_RADIUS = 35;
const MISS_BURST_RADIUS = 11;

// Pressure Tick's pod line reach -- mirrors combatRules.js's
// POD_LINE_LENGTH so the dashed aim-line drawn below exactly matches where
// the pod's blast will actually reach server-side. Keep the two in sync.
const POD_LINE_LENGTH = 200;

// How quickly a pod's fire line draws itself out end-to-end (fast, not a
// projectile travel time), and how long it then stays fully opaque before
// it starts fading -- the remainder of its windowMs (broadcastPodFx's
// POD_FX_MS, currently 1200ms) is the fade.
const POD_FX_DRAW_MS = 150;
const POD_FX_HOLD_MS = 700;

function podLineEnd(pod) {
  const rad = (pod.angle * Math.PI) / 180;
  return { x: pod.x + Math.cos(rad) * POD_LINE_LENGTH, y: pod.y + Math.sin(rad) * POD_LINE_LENGTH };
}

// An AOE burst specifically grows in from nothing instead of just popping
// up at full size and fading -- at this size a static circle doesn't read
// as an explosion. BURST_GROW_MS is how long that expansion takes; growth
// is measured from the same trigger point (b.growAt) fadeAfter already
// fades from, so the two animate on the same clock.
const BURST_GROW_MS = 260;
function burstGrowScale(elapsedMs, triggerAt) {
  const t = Math.max(0, Math.min(1, (elapsedMs - triggerAt) / BURST_GROW_MS));
  return 1 - Math.pow(1 - t, 3); // ease-out cubic -- fast start, gentle settle
}

// Maps elapsed-time-into-a-leg -> fraction of that leg's distance covered,
// with a slow start capped to SLOW_PHASE_MS (or the whole leg, if the leg
// resolves before that) followed by a fast burst for the remainder. If a leg
// is too short to fit any fast burst after the slow start, ramps linearly
// across the whole leg instead of snapping to the end -- always continuous,
// never a jump. (In practice only the main flight leg uses this now; the
// post-clash reflect-back leg is already up to speed and ramps linearly.)
function phasedFraction(elapsedMs, legMs, windupFraction = SLOW_PHASE_DISTANCE_FRACTION) {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= legMs) return 1;
  const slowMs = Math.min(SLOW_PHASE_MS, legMs);
  const fastMs = legMs - slowMs;
  const kickFraction = windupFraction * LAUNCH_KICK_RATIO;
  if (fastMs <= 0) return elapsedMs / legMs;
  if (elapsedMs <= slowMs) {
    const t = elapsedMs / slowMs;
    return kickFraction + t * (windupFraction - kickFraction);
  }
  const fastElapsed = elapsedMs - slowMs;
  return windupFraction + (1 - windupFraction) * (fastElapsed / fastMs);
}

// `vs` resizes the bolts/bursts for the map's size (see markerScale) -- the
// AOE burst is a true blast radius and is never scaled.
export function ShotEffect({ fx, vs = 1, onDone }) {
  const [elapsed, setElapsed] = useState(0);
  // Fraction of this leg's distance covered after `e` ms of its `t`-ms flight. A ricochet leg
  // (fx.noWindup) is already at full speed, so it cruises linearly the whole way -- no slow
  // windup crawl; every other shot gets the usual two-phase profile.
  const shotFraction = (e, t) => (fx.noWindup ? Math.min(1, Math.max(0, e / t)) : phasedFraction(e, t, fx.windupFraction));
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);
  // The last on-screen position of an uncontested shot's bolt, and the
  // moment (elapsed ms) the real outcome first reached us -- both frozen at
  // the reveal so a late resolve can skid the bolt to the true impact point
  // instead of the burst teleporting there. See the !fx.countered branch.
  const lastBoltPosRef = useRef(null);
  const revealElapsedRef = useRef(null);
  const settleFromRef = useRef(null);

  // A jam (random misfire) and a too-close failure (the target's inside the
  // weapon's fixed windup distance -- see shotTooClose in combatRules.js)
  // both mean the same thing visually: nothing ever left the barrel. Both
  // arrive as a single self-contained combat-shot-fx with the outcome
  // already set, no flight, no counter.
  const isJam = fx.outcome === "jam" || fx.outcome === "too-close";
  // A chain arc has its own fixed, very short travel time (a quarter of a second for a slug's arc),
  // so unlike a real shot it isn't floored at 400 ms.
  const totalMs = fx.chain && fx.windowMs ? fx.windowMs : Math.max(400, (fx.windowMs || SHOT_FLIGHT_MS) * SHOT_FLIGHT_MULTIPLIER);

  // Freeze the reveal state the first frame the outcome is known (for an
  // ordinary, uncontested shot -- a jam/too-close failure is self-contained,
  // and a countered shot has its own choreography).
  if (fx.outcome != null && !isJam && !fx.countered && revealElapsedRef.current == null) {
    revealElapsedRef.current = elapsed;
    settleFromRef.current = lastBoltPosRef.current;
  }
  // How long the bolt's final skid to a late-revealed impact point takes,
  // and when the burst therefore lands. `skidMode` is true only when the
  // outcome arrived too close to (or after) the landing for the bolt to
  // reach the real point on its normal curve.
  const settleFrom = settleFromRef.current;
  const revealElapsed = revealElapsedRef.current;
  const settleMs = settleFrom
    ? Math.max(
        RESOLVE_SETTLE_MIN_MS,
        Math.min(RESOLVE_SETTLE_MAX_MS, Math.hypot(fx.impactPoint.x - settleFrom.x, fx.impactPoint.y - settleFrom.y) * RESOLVE_SETTLE_PX_MS)
      )
    : RESOLVE_SETTLE_MIN_MS;
  // A shot whose accuracy roll already passed (fx.expectHit) flies straight in
  // and bursts as a hit on arrival, whether or not the server's confirmation
  // has landed yet -- so a late "hit" reveal never needs a skid.
  const pendingHit = Boolean(fx.expectHit) && !isJam && !fx.countered && fx.outcome == null;
  const optimisticHit = Boolean(fx.expectHit) && !isJam && !fx.countered && (fx.outcome == null || fx.outcome === "hit");
  const skidMode = !optimisticHit && revealElapsed != null && settleFrom != null && revealElapsed > totalMs - settleMs;
  const burstAt = skidMode ? revealElapsed + settleMs : totalMs;
  // The clash (if any) always lands right at the end of the approach leg --
  // see SHOT_FLIGHT_MULTIPLIER's comment. Both bolts meet at the geometric
  // midpoint, not the target, so the counter-slug visibly launches out and
  // travels to intercept instead of just sitting on the target. Whichever
  // outcome follows then needs its own leg to finish the trip (the winner
  // continuing on to its actual destination), budgeted as aftermathMs on
  // top of that.
  const clashAt = totalMs;
  const aftermathMs = totalMs / 2;
  // An uncontested shot's resolve update (in particular a miss's deflected
  // point) can land a beat after the flight animation's own clock reaches
  // totalMs -- DB round-trips for the resolve happen server-side before it
  // goes out, with no guarantee they beat the client's own rAF timer. Don't
  // let the effect end (or fall back to guessing "hit") before it's known;
  // wait up to RESOLUTION_GRACE_MS past totalMs for the real outcome.
  const stillWaiting = !isJam && !fx.countered && fx.outcome == null && !pendingHit;
  const lifetimeMs = isJam
    ? 450
    : fx.countered && (fx.outcome === "attacker-wins" || fx.outcome === "defender-wins")
      ? clashAt + aftermathMs + BURST_LINGER_MS
      : stillWaiting
        ? totalMs + RESOLUTION_GRACE_MS
        : burstAt + BURST_LINGER_MS;
  // The tick loop below only starts once (empty deps, so its own timer isn't
  // restarted every time a resolve update swaps in a new `fx`) -- but
  // lifetimeMs can shrink once resolved (e.g. a pending shot defaults to the
  // full totalMs, then turns out to be a "bounce" that should end right at
  // clashAt instead). Route it through a ref so the loop always checks the
  // current value instead of the one captured at mount.
  const lifetimeMsRef = useRef(lifetimeMs);
  lifetimeMsRef.current = lifetimeMs;

  useEffect(() => {
    function tick(ts) {
      if (startRef.current == null) startRef.current = ts;
      const e = ts - startRef.current;
      if (e >= lifetimeMsRef.current) {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
        return;
      }
      setElapsed(e);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = typeColor(fx.slugType);
  // A dual shot's second element -- its bolt is drawn as a pair, one per colour.
  const color2 = fx.secondaryType ? typeColor(fx.secondaryType) : null;
  // Until the slug has left the barrel and transformed (the windup), the
  // bolt is a neutral colour so nobody can read the element off the map
  // early -- matches the counter prompt, which also holds back until the
  // windup ends. A dual shot keeps both bolts through the windup (both neutral)
  // -- collapsing the pair to one made short flights, which spend most of their
  // visible travel in the windup, look like a single projectile.
  const inWindup = !fx.noWindup && elapsed < SLOW_PHASE_MS;
  const boltColor = inWindup ? WINDUP_BOLT_COLOR : color;
  const boltColor2 = color2 ? (inWindup ? WINDUP_BOLT_COLOR : color2) : null;

  if (isJam) {
    const opacity = Math.max(0, 1 - elapsed / lifetimeMs);
    return (
      <circle
        className="shot-fx-spark"
        cx={fx.attackerPos.x}
        cy={fx.attackerPos.y}
        r={(10 + (elapsed / lifetimeMs) * 10) * vs}
        style={{ "--fx-color": color, opacity }}
      />
    );
  }

  function fadeAfter(triggerAt) {
    return Math.max(0, 1 - (elapsed - triggerAt) / BURST_LINGER_MS);
  }

  // The chain arc's own bolt: a quick, forced-yellow dart that just snaps
  // straight to its target (plain lerp, not phasedFraction's slow-crawl
  // launch -- there's no sound/transform beat to sync up with here, unlike
  // a real shot), then a small spark. Never counterable, so there's no
  // clash branch to handle -- outcome is always already "hit" by the time
  // this ever renders.
  if (fx.chain) {
    // A slug's chain arc is its own electric arc (see chainArcShapes -- deliberately nothing like
    // Zeus's flying lightning bolt); only the melee slash flash keeps the plain dart below.
    if (fx.lightning) return <>{chainArcShapes(fx, elapsed, totalMs, vs)}</>;
    const chainColor = "#ffe066";
    if (elapsed < totalMs) {
      const pos = lerp(fx.attackerPos, fx.impactPoint, Math.min(1, elapsed / totalMs));
      return <circle className="shot-fx-bolt shot-fx-bolt--chain" cx={pos.x} cy={pos.y} r={5 * vs} style={{ "--fx-color": chainColor }} />;
    }
    return (
      <circle
        className="shot-fx-burst shot-fx-burst--hit"
        cx={fx.impactPoint.x}
        cy={fx.impactPoint.y}
        r={(MISS_BURST_RADIUS + 4) * vs}
        style={{ "--fx-color": chainColor, opacity: fadeAfter(totalMs) }}
      />
    );
  }

  // Pressure Tick's pod firing -- not a projectile that flies out (the
  // "shot" already happened the instant the pod's counter hit 0), but not a
  // flat instant pop-in either: the line draws itself out along its length
  // over POD_FX_DRAW_MS (quick, not a travel time), the arrowhead appears
  // once it's reached the end, both hold at full opacity through
  // POD_FX_HOLD_MS, then fade out over what's left of totalMs.
  if (fx.pod) {
    const drawProgress = Math.min(1, elapsed / POD_FX_DRAW_MS);
    const opacity = elapsed < POD_FX_HOLD_MS ? 1 : Math.max(0, 1 - (elapsed - POD_FX_HOLD_MS) / Math.max(1, totalMs - POD_FX_HOLD_MS));
    const angleDeg = (Math.atan2(fx.impactPoint.y - fx.attackerPos.y, fx.impactPoint.x - fx.attackerPos.x) * 180) / Math.PI;
    return (
      <g className="shot-fx-pod-line" style={{ opacity }}>
        <line
          x1={fx.attackerPos.x}
          y1={fx.attackerPos.y}
          x2={fx.impactPoint.x}
          y2={fx.impactPoint.y}
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1 - drawProgress }}
        />
        {drawProgress >= 1 && (
          <g transform={`translate(${fx.impactPoint.x} ${fx.impactPoint.y}) rotate(${angleDeg})`}>
            <path d="M -12 -8 L 8 0 L -12 8 Z" />
          </g>
        )}
      </g>
    );
  }

  const bolts = [];
  const bursts = [];
  // Marks the shooter's own bolt as one of the custom bolts: Helixel's double helix (see
  // helixShapes), Trackjaw's stalk-and-pounce (pounceShapes), Chronix's time skip
  // (timeSkipShapes), Zeus's lightning (lightningShapes) or the ricochet streak (streakShapes);
  // Bladier is an ordinary element bolt that also throws a knife at a wall (knifeShapes).
  // `to` is where this leg of the flight ends -- the helix fuses shut and the pounce lands as they
  // arrive. Every one of them is just the ordinary neutral bolt through the windup: the unique
  // look only begins at the transform, and the effects that grow from nothing (the helix
  // splitting, the lightning body, the stalk) start from the point where the windup ended.
  const transformPoint = lerp(fx.attackerPos, fx.impactPoint, fx.noWindup ? 0 : Math.min(1, fx.windupFraction ?? SLOW_PHASE_DISTANCE_FRACTION));
  // A standard bolt: no animation of its own (not one of the custom bolts or a dual shot) and not
  // "None" -- a Mega Morph counts, drawn the same but bigger. It gets a small effect for its element in flight (elementShapes) and
  // explodes in its element's own way on impact (elementBurst).
  const standardElement =
    fx.slugType && fx.slugType !== "None" && !fx.secondaryType && !fx.helix && !fx.pounce && !fx.timeSkip && !fx.lightning && !fx.ricochet
      ? fx.slugType
      : null;
  // A Mega Morph keeps its slug's animation -- custom or element, in flight and on impact -- just
  // scaled up (MEGA_ANIM_SCALE) so the bigger hit reads at a glance. `mvs` is the scale the impact
  // effects below are drawn at.
  const mvs = vs * (fx.mega ? MEGA_ANIM_SCALE : 1);
  const boltShapeOf = (to) => {
    if (inWindup) return {};
    if (fx.helix) return { helixFrom: transformPoint, helixTo: to };
    if (fx.pounce) return { pounceFrom: transformPoint, pounceTo: to };
    if (fx.timeSkip) return { skipFrom: fx.attackerPos, skipTo: to, skipWindup: fx.windupFraction ?? SLOW_PHASE_DISTANCE_FRACTION };
    if (fx.lightning) return { zapFrom: transformPoint, zapTo: to };
    if (fx.ricochet) return { streakFrom: transformPoint, streakTo: to, streakPing: Boolean(fx.noWindup) };
    // A standard bolt: a small effect for its element (a dual shot keeps its own look; a Mega Morph is the same, scaled up).
    // Bladier is the ordinary Metal bolt; with a wall in its path (the server sends no piercePoint
    // otherwise) it also throws a knife at it -- see knifeShapes.
    if (standardElement) {
      const knife = fx.dagger && fx.piercePoint ? { from: fx.attackerPos, to: fx.targetPos ?? fx.impactPoint, pierce: fx.piercePoint } : null;
      return { elementFrom: transformPoint, element: standardElement, knife };
    }
    return {};
  };

  if (!fx.countered) {
    let boltPos = null;
    let styleBolt = false;
    if (pendingHit) {
      // Hit already rolled, only a counter/dodge could change it (and those
      // are revealed the moment they happen, mid-flight): no reason to hold the
      // bolt back. Fly it the whole way, then burst as a hit on arrival.
      if (elapsed < totalMs) {
        boltPos = lerp(fx.attackerPos, fx.impactPoint, shotFraction(elapsed, totalMs));
      } else {
        bursts.push({ pos: fx.impactPoint, color, kind: "hit", opacity: fadeAfter(totalMs), aoe: fx.aoe, aoeScale: fx.aoeScale ?? 1, growAt: totalMs, style: false, element: standardElement, elScale: 1 });
      }
    } else if (!fx.outcome) {
      // The resolve update hasn't landed yet -- ride the phased curve toward
      // the last known impact point, but never quite finish the approach
      // (phasedFraction saturates at 1 past totalMs, which would park the
      // bolt exactly on the target). A shot that offered a counter only
      // resolves once that window closes, right as totalMs is reached -- if
      // the bolt had already fully landed by then, a miss's skid to its real
      // (deflected) point reads as the bolt leaving a target it just hit,
      // not as it missing. Stopping short keeps it visibly still inbound, so
      // the skid below reads as finishing the flight, not reversing out of
      // one. Never guess a burst here: a miss's real, deflected landing spot
      // isn't known until the resolve update arrives, and bursting on this
      // stale point is exactly what used to show an explosion at the target
      // on a shot that really missed. See stillWaiting below.
      boltPos = lerp(
        fx.attackerPos,
        fx.impactPoint,
        Math.min(PENDING_MAX_FRACTION, shotFraction(elapsed, totalMs))
      );
    } else if (skidMode && elapsed < burstAt) {
      // The outcome arrived too late for the bolt to reach the real impact
      // point on its normal curve -- skid it there from wherever it had
      // stopped, ease-out, then burst on arrival.
      const t = Math.min(1, (elapsed - revealElapsed) / settleMs);
      boltPos = lerp(settleFrom, fx.impactPoint, 1 - Math.pow(1 - t, 3));
    } else if (fx.outcome === "miss" && !fx.preMissed && revealElapsed != null && fx.targetPos && elapsed < burstAt) {
      // A miss's deflected impact point differs from where the bolt was
      // aimed. Keep the bolt's natural forward progress along the flight,
      // but bend its aim from the target toward the wide point over the rest
      // of the flight -- a smooth veer, not the sideways snap onto the new
      // deflected line that read as the bolt teleporting.
      const f = shotFraction(elapsed, totalMs);
      const bend = Math.min(1, (elapsed - revealElapsed) / Math.max(1, burstAt - revealElapsed));
      boltPos = lerp(lerp(fx.attackerPos, fx.targetPos, f), lerp(fx.attackerPos, fx.impactPoint, f), bend);
    } else if (elapsed < burstAt) {
      boltPos = lerp(fx.attackerPos, fx.impactPoint, shotFraction(elapsed, totalMs));
    } else {
      bursts.push({ pos: fx.impactPoint, color, kind: fx.outcome, opacity: fadeAfter(burstAt), aoe: fx.aoe && fx.outcome !== "out-of-range", aoeScale: fx.aoeScale ?? 1, growAt: burstAt, style: fx.style && fx.outcome === "hit", claws: Boolean(fx.pounce) && fx.outcome === "hit", arcs: Boolean(fx.lightning) && fx.outcome === "hit", shards: Boolean(fx.ricochet) && fx.outcome === "hit", element: fx.outcome === "hit" || fx.outcome === "miss" ? standardElement : null, elScale: fx.outcome === "hit" ? 1 : 0.5 });
    }
    if (boltPos) {
      lastBoltPosRef.current = boltPos;
      let angle = headingDeg(fx.attackerPos, fx.impactPoint);
      if (fx.style && fx.outcome === "hit" && revealElapsed != null && !skidMode) {
        const geo = styleArcGeometry(fx.attackerPos, fx.impactPoint);
        const f = Math.max(
          0,
          Math.min(1, ((boltPos.x - fx.attackerPos.x) * (fx.impactPoint.x - fx.attackerPos.x) + (boltPos.y - fx.attackerPos.y) * (fx.impactPoint.y - fx.attackerPos.y)) / (geo.len * geo.len))
        );
        const ease = Math.min(1, Math.max(0, (elapsed - revealElapsed) / STYLE_ARC_EASE_MS));
        const off = geo.peak * 4 * f * (1 - f) * ease;
        boltPos = { x: boltPos.x + geo.nx * off, y: boltPos.y + geo.ny * off };
        // Aim along the curve: slope of the parabola at f.
        const slope = geo.peak * 4 * (1 - 2 * f) * ease;
        angle = headingDeg({ x: 0, y: 0 }, { x: geo.len, y: slope });
        const base = headingDeg(fx.attackerPos, fx.impactPoint);
        angle = base + angle;
        styleBolt = true;
      }
      const splitF = fx.split && (fx.outcome === "hit" || pendingHit) && !skidMode ? shotFraction(elapsed, totalMs) : 0;
      if (splitF >= SPLIT_START_FRACTION) {
        for (const sb of surroundBolts(fx.attackerPos, fx.impactPoint, splitF)) {
          bolts.push({ pos: sb.pos, color: boltColor, color2: null, mega: false, angle: sb.angle, style: false });
        }
      } else {
        bolts.push({ pos: boltPos, color: boltColor, color2: boltColor2, mega: fx.mega, angle, style: styleBolt, ...boltShapeOf(fx.impactPoint) });
      }
    }
  } else {
    // The counter doesn't launch until the defender reacts -- until then the
    // incoming shot keeps flying toward the target on its own, exactly as it
    // was already being drawn above, with no jump back toward the attacker.
    // Once the counter is away, both bolts close the remaining gap and
    // collide at fx.clashPoint (server-computed: the later the reaction, the
    // closer to the defender -- see broadcastShotResolved). fx.counterAtMs is
    // how far into the flight that reaction landed.
    const counterColor = typeColor(fx.counterSlugType);
    const counterAtMs = Math.max(0, Math.min(clashAt, fx.counterAtMs ?? clashAt / 2));
    const mid = fx.clashPoint ?? lerp(fx.attackerPos, fx.impactPoint, 0.5);
    const shotPosAtCounter = lerp(fx.attackerPos, fx.impactPoint, shotFraction(counterAtMs, totalMs));
    if (elapsed < clashAt) {
      if (elapsed < counterAtMs) {
        bolts.push({
          pos: lerp(fx.attackerPos, fx.impactPoint, shotFraction(elapsed, totalMs)),
          color: boltColor,
          color2: boltColor2,
          mega: fx.mega,
          angle: headingDeg(fx.attackerPos, fx.impactPoint),
          ...boltShapeOf(fx.impactPoint),
        });
      } else {
        // Linear from each bolt's position when the counter fired -- both are
        // up to speed by now, no slow launch-out to reproduce.
        const t = (elapsed - counterAtMs) / Math.max(1, clashAt - counterAtMs);
        bolts.push({ pos: lerp(shotPosAtCounter, mid, t), color: boltColor, color2: boltColor2, mega: fx.mega, angle: headingDeg(shotPosAtCounter, mid), ...boltShapeOf(mid) });
        bolts.push({ pos: lerp(fx.targetPos, mid, t), color: counterColor });
      }
    } else {
      bursts.push({ pos: mid, kind: "clash", opacity: fadeAfter(clashAt), color, mixColor: counterColor });
      if (fx.outcome === "attacker-wins") {
        const aftermathElapsed = elapsed - clashAt;
        if (aftermathElapsed < aftermathMs) {
          // Linear, not phasedFraction -- a post-clash continuation is
          // already up to speed, no slow launch-out to reproduce.
          bolts.push({
            pos: lerp(mid, fx.impactPoint, aftermathElapsed / aftermathMs),
            color,
            color2,
            mega: fx.mega,
            angle: headingDeg(mid, fx.impactPoint),
            ...boltShapeOf(fx.impactPoint),
          });
        } else {
          bursts.push({
            pos: fx.impactPoint,
            color,
            kind: "hit",
            opacity: fadeAfter(clashAt + aftermathMs),
            aoe: fx.aoe,
            aoeScale: fx.aoeScale ?? 1,
            growAt: clashAt + aftermathMs,
            element: standardElement,
            elScale: 1,
          });
        }
      } else if (fx.outcome === "defender-wins") {
        const aftermathElapsed = elapsed - clashAt;
        if (aftermathElapsed < aftermathMs) {
          bolts.push({ pos: lerp(mid, fx.attackerPos, aftermathElapsed / aftermathMs), color: counterColor });
        } else {
          bursts.push({
            pos: fx.attackerPos,
            color: counterColor,
            kind: "hit",
            opacity: fadeAfter(clashAt + aftermathMs),
            aoe: fx.aoe,
            aoeScale: fx.aoeScale ?? 1,
            growAt: clashAt + aftermathMs,
          });
        }
      }
    }
  }

  // The arc the style shot is following, drawn as a faint golden trail.
  const showStyleTrail = fx.style && fx.outcome === "hit" && !fx.countered && revealElapsed != null && !skidMode && elapsed < burstAt;
  let styleTrail = null;
  if (showStyleTrail) {
    const geo = styleArcGeometry(fx.attackerPos, fx.impactPoint);
    const mid = lerp(fx.attackerPos, fx.impactPoint, 0.5);
    const ease = Math.min(1, Math.max(0, (elapsed - revealElapsed) / STYLE_ARC_EASE_MS));
    // A quadratic bezier's apex is half its control point's offset.
    const ctrl = { x: mid.x + geo.nx * geo.peak * 2 * ease, y: mid.y + geo.ny * geo.peak * 2 * ease };
    styleTrail = (
      <path
        className="shot-fx-style-trail"
        d={`M ${fx.attackerPos.x} ${fx.attackerPos.y} Q ${ctrl.x} ${ctrl.y} ${fx.impactPoint.x} ${fx.impactPoint.y}`}
        style={{ opacity: ease * 0.6 }}
      />
    );
  }

  return (
    <>
      {styleTrail}
      {bolts.flatMap((b, i) => {
        // A Mega Morph flies with the very same animation, simply scaled up to show the mega damage.
        const bvs = b.mega ? vs * MEGA_ANIM_SCALE : vs;
        if (b.helixFrom) return helixShapes(b, bvs, `helix-${i}`);
        if (b.pounceFrom) return pounceShapes(b, bvs, `pounce-${i}`);
        if (b.skipFrom) return timeSkipShapes(b, bvs, `skip-${i}`);
        if (b.zapFrom) return lightningShapes(b, bvs, `zap-${i}`);
        if (b.streakFrom) return streakShapes(b, bvs, `streak-${i}`);
        if (b.elementFrom) return b.knife ? [...elementShapes(b, bvs, `el-${i}`), ...knifeShapes(b, bvs, `knife-${i}`)] : elementShapes(b, bvs, `el-${i}`);
        // A dual shot flies as a side-by-side pair, one bolt per element
        // colour, offset across its line of travel; a Mega Morph's bolts are
        // teardrops instead of circles (both can combine).
        const shapes = b.color2
          ? [
              { color: b.color, offset: -8 * vs },
              { color: b.color2, offset: 8 * vs },
            ]
          : [{ color: b.color, offset: 0 }];
        return shapes.map((shape, j) => {
          const key = `bolt-${i}-${j}`;
          const style = { "--fx-color": shape.color };
          if (b.mega) {
            return (
              <path
                key={key}
                className="shot-fx-bolt shot-fx-bolt--mega"
                d={MEGA_BOLT_PATH}
                transform={`translate(${b.pos.x} ${b.pos.y}) rotate(${b.angle}) translate(0 ${shape.offset}) scale(${(b.color2 ? 0.75 : 1) * vs})`}
                style={style}
              />
            );
          }
          if (b.color2) {
            return (
              <circle
                key={key}
                className="shot-fx-bolt"
                cx={0}
                cy={0}
                r={6 * vs}
                transform={`translate(${b.pos.x} ${b.pos.y}) rotate(${b.angle}) translate(0 ${shape.offset})`}
                style={style}
              />
            );
          }
          return <circle key={key} className={`shot-fx-bolt ${b.style ? "shot-fx-bolt--style" : ""}`} cx={b.pos.x} cy={b.pos.y} r={(b.style ? 9 : 7) * vs} style={style} />;
        });
      })}
      {bursts.map((b, i) =>
        b.kind === "clash" ? (
          // Two overlapping, screen-blended circles (one per slug's type
          // color) instead of one flat tone -- reads as the two colors
          // actually fusing in the explosion, not an arbitrary third color.
          // `isolation: isolate` keeps the blending contained to this pair,
          // not the whole map.
          <g key={`burst-${i}`} className="shot-fx-clash" style={{ opacity: b.opacity }}>
            <circle className="shot-fx-burst shot-fx-burst--clash" cx={b.pos.x} cy={b.pos.y} r={20 * vs} style={{ "--fx-color": b.color }} />
            <circle className="shot-fx-burst shot-fx-burst--clash" cx={b.pos.x} cy={b.pos.y} r={20 * vs} style={{ "--fx-color": b.mixColor }} />
          </g>
        ) : b.element && !b.aoe ? null : (
          // (A standard bolt's element explosion replaces this flat disc -- see elementBurst below.
          // An area blast keeps it, since it shows the blast radius.)
          <circle
            key={`burst-${i}`}
            className={`shot-fx-burst shot-fx-burst--${b.kind} ${b.aoe ? "shot-fx-burst--aoe" : ""}`}
            cx={b.pos.x}
            cy={b.pos.y}
            r={
              b.aoe
                ? AOE_BURST_RADIUS * (b.aoeScale ?? 1) * burstGrowScale(elapsed, b.growAt)
                : b.kind === "hit"
                  ? HIT_BURST_RADIUS * vs
                  : MISS_BURST_RADIUS * vs
            }
            style={{ "--fx-color": b.color, opacity: b.opacity }}
          />
        )
      )}
      {bursts
        .filter((b) => b.style)
        .map((b, i) => (
          <g key={`style-burst-${i}`} className="shot-fx-style-burst" style={{ opacity: b.opacity }}>
            <circle cx={b.pos.x} cy={b.pos.y} r={(HIT_BURST_RADIUS + 14 * (1 - b.opacity)) * vs} />
            <circle cx={b.pos.x} cy={b.pos.y} r={(HIT_BURST_RADIUS * 0.6 + 26 * (1 - b.opacity)) * vs} />
          </g>
        ))}
      {/* Trackjaw's pounce: three claw slashes rake across the target, each drawing itself in a beat after the last. */}
      {bursts
        .filter((b) => b.claws)
        .map((b, i) => (
          <g key={`claws-${i}`} transform={`translate(${b.pos.x} ${b.pos.y})`} style={{ opacity: b.opacity }}>
            {[-1, 0, 1].map((k, j) => {
              const p = Math.min(1, Math.max(0, ((elapsed - b.growAt) / CLAW_DRAW_MS) * 1.5 - j * 0.25));
              return (
                <path
                  key={k}
                  className="shot-fx-claw"
                  d={`M ${(k * 13 - 9) * mvs} ${-24 * mvs} L ${(k * 13 + 9) * mvs} ${24 * mvs}`}
                  pathLength={1}
                  strokeWidth={3.4 * mvs}
                  style={{ strokeDasharray: 1, strokeDashoffset: 1 - p }}
                />
              );
            })}
          </g>
        ))}
      {/* Standard bolts: each element explodes in its own way (see elementBurst). */}
      {bursts
        .filter((b) => b.element)
        .map((b, i) => (
          <g key={`elburst-${i}`} transform={`translate(${b.pos.x} ${b.pos.y}) scale(${b.elScale ?? 1})`}>
            {elementBurst(b.element, Math.max(0, elapsed - b.growAt), mvs, typeColor(b.element), `eb${i}`)}
          </g>
        ))}
      {/* The ricochet streak's impact: eight steel shards fly straight out of the target. */}
      {bursts
        .filter((b) => b.shards)
        .map((b, i) => (
          <g key={`shards-${i}`} transform={`translate(${b.pos.x} ${b.pos.y})`} style={{ opacity: b.opacity }}>
            {Array.from({ length: 8 }, (_, k) => {
              const p = Math.min(1, Math.max(0, (elapsed - b.growAt) / SHARD_DRAW_MS));
              const a = (k * Math.PI) / 4 + zapNoise(k, 3) * 0.2;
              const r0 = 9 * mvs;
              const r1 = (22 + 16 * Math.abs(zapNoise(k + 8, 3))) * mvs;
              return (
                <path
                  key={k}
                  className="shot-fx-streak-spark"
                  d={`M ${Math.cos(a) * r0} ${Math.sin(a) * r0} L ${Math.cos(a) * r1} ${Math.sin(a) * r1}`}
                  pathLength={1}
                  strokeWidth={2.6 * mvs}
                  style={{ strokeDasharray: 1, strokeDashoffset: 1 - p }}
                />
              );
            })}
          </g>
        ))}
      {/* Zeus's lightning strike: jagged arcs crack out of the target, each drawing itself outward. */}
      {bursts
        .filter((b) => b.arcs)
        .map((b, i) => (
          <g key={`arcs-${i}`} transform={`translate(${b.pos.x} ${b.pos.y})`} style={{ opacity: b.opacity }}>
            {zapArcs(mvs, elapsed - b.growAt)}
          </g>
        ))}
    </>
  );
}

// Water is drawn by outlining an area: every WATER_CELL cell whose centre lies
// inside the outline (even-odd rule) is flooded -- or drained -- when the
// outline is released. Returns the cell ids (see waterCellId).
function cellsInOutline(points, mapWidth, mapHeight) {
  if (points.length < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx0 = Math.max(0, Math.floor(minX / WATER_CELL));
  const cy0 = Math.max(0, Math.floor(minY / WATER_CELL));
  const cx1 = Math.min(Math.floor(mapWidth / WATER_CELL), Math.floor(maxX / WATER_CELL));
  const cy1 = Math.min(Math.floor(mapHeight / WATER_CELL), Math.floor(maxY / WATER_CELL));
  const out = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    const y = (cy + 0.5) * WATER_CELL;
    // x of every edge crossing this row, then fill between pairs.
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i];
      const b = points[j];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(cx0, Math.ceil(xs[k] / WATER_CELL - 0.5));
      const to = Math.min(cx1, Math.floor(xs[k + 1] / WATER_CELL - 0.5));
      for (let cx = from; cx <= to; cx++) out.push(cy * 1000 + cx);
    }
  }
  return out;
}

// Flooded cells -> horizontal runs {x, y, w} (in map units), so a big lake is a
// few hundred rectangles instead of thousands.
function waterRuns(cellIds) {
  const rows = new Map();
  for (const id of cellIds) {
    const row = Math.floor(id / 1000);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(id % 1000);
  }
  const runs = [];
  for (const [row, xs] of rows) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1) {
        prev = xs[i];
        continue;
      }
      runs.push({ key: `${row}:${start}`, x: start * WATER_CELL, y: row * WATER_CELL, w: (prev - start + 1) * WATER_CELL });
      start = xs[i];
      prev = xs[i];
    }
  }
  return runs;
}

// Per-viewer zoom/pan of the map. `view` is the window onto the map in map
// units ({ x, y } its top-left corner, `zoom` how many times closer than the
// whole map) -- it becomes the SVG's viewBox, so zooming moves the *entire* map
// (picture, tokens, walls, rings) together and never touches the shared state.
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_STEP = 1.15;

function clampView(zoom, x, y, mapWidth, mapHeight) {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  return {
    zoom: z,
    x: Math.min(mapWidth - mapWidth / z, Math.max(0, x)),
    y: Math.min(mapHeight - mapHeight / z, Math.max(0, y)),
  };
}

// Screen position -> map units, through the current zoom window.
function mapPoint(svgEl, evt, view, mapWidth, mapHeight) {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: view.x + ((evt.clientX - rect.left) / rect.width) * (mapWidth / view.zoom),
    y: view.y + ((evt.clientY - rect.top) / rect.height) * (mapHeight / view.zoom),
  };
}

function gritColor(fraction) {
  const hue = Math.max(0, Math.min(1, fraction)) * 120;
  return `hsl(${hue}, 72%, 46%)`;
}

// A carnivorous bloom's bite reach -- mirrors PLANT_BITE_RANGE (= MOUNT_RANGE) in
// server/src/combatRules.js; keep the number in sync.
const PLANT_BITE_RANGE = 80;
// A little ghost silhouette (domed head, scalloped hem) for Phantasmo's haunter.
function ghostPath(r) {
  const w = r * 0.7;
  const h = r * 0.75;
  return `M ${-w} ${h} L ${-w} ${-0.1 * h} A ${w} ${0.9 * h} 0 0 1 ${w} ${-0.1 * h} L ${w} ${h} q ${-w / 3} ${-0.5 * w} ${(-2 * w) / 3} 0 q ${-w / 3} ${0.5 * w} ${(-2 * w) / 3} 0 q ${-w / 3} ${-0.5 * w} ${(-2 * w) / 3} 0 Z`;
}
// Toothy star drawn on a bloom's token, so it never reads as a person.
function plantStarPoints(r) {
  const spikes = 8;
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? r * 0.95 : r * 0.5;
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    pts.push(`${(Math.cos(a) * rad).toFixed(1)},${(Math.sin(a) * rad).toFixed(1)}`);
  }
  return pts.join(" ");
}

function tokenRadius(kind) {
  return kind === "mecha" ? 24 : 16;
}

// Hover text for a hazard patch. Mirrors ICE_SLIP_CHANCE / HAZARD_DAMAGE_FRACTION
// in server/src/combatRules.js -- display only, the server decides what really happens.
const ICE_SLIP_PERCENT = 75;
const HAZARD_DAMAGE_FRACTION = 0.5;
function hazardDescription(hz) {
  const fades = hz.turnsLeft != null ? ` Fades in ${hz.turnsLeft} round${hz.turnsLeft === 1 ? "" : "s"}.` : "";
  if (hz.type === "ice") {
    return `Ice patch -- ending a Move on it has a ${ICE_SLIP_PERCENT}% chance to slip and lose the rest of that turn's AP.${fades}`;
  }
  if (hz.type === "damage") {
    const dmg = Math.max(1, Math.floor((hz.clashPower || 0) * HAZARD_DAMAGE_FRACTION));
    const dot = hz.slugType === "Fire" ? ", and sets them ablaze" : hz.slugType === "Toxic" ? ", and poisons them" : "";
    const source = hz.slugName ? ` left by ${hz.slugName}` : "";
    return `${hz.slugType || ""} hazard${source} -- anyone moving through it takes ${dmg} damage${dot} (a mecha takes it as Structure damage).${fades}`.trim();
  }
  return `Hazard.${fades}`;
}

// Small colored dots hovering above a token's active ring, one per active
// status effect -- burn/poison/snare/stun/blind are otherwise invisible on
// the map itself (burn and poison in particular don't deal their damage
// until the target's own next turn, so without this a hit that inflicted
// one reads as if nothing happened at all). Hover for the exact effect via
// the <title> tooltip.
function statusEffectBadges(statusEffects) {
  if (!statusEffects) return [];
  const badges = [];
  if (statusEffects.burning) badges.push({ key: "burn", label: "Burning" });
  if (statusEffects.poison?.stacks > 0) {
    badges.push({ key: "poison", label: `Poisoned ×${statusEffects.poison.stacks}` });
  }
  if (statusEffects.snared) badges.push({ key: "snare", label: "Snared" });
  if (statusEffects.slippery?.turnsLeft > 0) {
    badges.push({ key: "slippery", label: "Slippery -- risks their turn ending on any Move" });
  }
  if (statusEffects.stunned) {
    const stunAp = Number(statusEffects.stunned.ap) > 0 ? Math.round(statusEffects.stunned.ap) : 1;
    badges.push({ key: "stun", label: `Stunned -- loses ${stunAp} AP next turn` });
  }
  if (statusEffects.blinded) badges.push({ key: "blind", label: "Blinded" });
  if (statusEffects.confused) badges.push({ key: "confused", label: "Confused -- shots may fire wildly off target" });
  if (statusEffects.disarmed?.turnsLeft > 0) badges.push({ key: "disarm", label: "Disarmed -- can't Shoot Slug" });
  if (statusEffects.reversedDirection?.turnsLeft > 0) {
    badges.push({ key: "reverse", label: "Reversed -- Move goes the exact opposite way" });
  }
  if (statusEffects.slowedReaction?.turnsLeft > 0) {
    badges.push({ key: "slow-reaction", label: "Slowed reaction -- shorter counter window" });
  }
  if (statusEffects.enhancedReaction?.turnsLeft > 0) {
    badges.push({ key: "enhanced-reaction", label: "Enhanced reaction -- longer counter window" });
  }
  if (statusEffects.intimidated) badges.push({ key: "intimidated", label: `Intimidated -- starts next turn ${statusEffects.intimidated.apPenalty} AP short` });
  if (statusEffects.keenVision) badges.push({ key: "keen-vision", label: "Keen vision -- next attack has advantage" });
  if (statusEffects.bleeding) {
    badges.push({ key: "bleeding", label: `Bleeding -- loses 10% of max Grit at the start of each of their next ${statusEffects.bleeding.turnsLeft} turns` });
  }
  if (statusEffects.regen?.turnsLeft > 0) {
    badges.push({ key: "regen", label: `Regenerating -- heals ${statusEffects.regen.amount} Grit at the start of each of their next ${statusEffects.regen.turnsLeft} turns` });
  }
  if (statusEffects.marked) badges.push({ key: "marked", label: "Marked -- takes splash damage from Arcling's static arcs" });
  const adaptedHits = Math.max(0, ...Object.values(statusEffects.adapted || {}).map(Number));
  if (adaptedHits > 0) badges.push({ key: "adapted", label: `Sampled -- the next hit from a Helixel lands ${adaptedHits * 25}% harder` });
  if (statusEffects.powerSurge) badges.push({ key: "power-surge", label: "Power surge -- every other shot this turn has its power doubled" });
  return badges;
}

function Token({ combatant, label, isActive, isSelected, isActing, draggable, isDragging, pos, onMouseDown, dimmed, mountTarget, wallRunning, scale = 1 }) {
  // A mounted rider rides small, tucked onto the upper-right of the mecha's
  // token so the two read as one entity (the server keeps their positions in
  // lockstep -- see /actions/move).
  const mountedRider = combatant.kind === "character" && combatant.mountedOn != null;
  const r = mountedRider ? 11 : tokenRadius(combatant.kind);
  // `scale` keeps the marker readable on very large/small maps -- it only
  // resizes the drawing, never any range (see the bite-range ring below).
  const offX = (mountedRider ? 15 : 0) * scale;
  const offY = (mountedRider ? -15 : 0) * scale;
  const badges = statusEffectBadges(combatant.statusEffects);
  const fraction =
    combatant.kind === "mecha"
      ? combatant.maxStructure > 0
        ? (combatant.currentStructure ?? 0) / combatant.maxStructure
        : 0
      : combatant.maxGrit > 0
        ? (combatant.currentGrit ?? 0) / combatant.maxGrit
        : 0;
  const downed = combatant.unconscious || combatant.disabled;
  const clipId = `combat-token-clip-${combatant.id}`;

  return (
    <g
      className={`combat-token combat-token--${combatant.mimic?.kind ?? combatant.kind} ${downed ? "combat-token--down" : ""} ${isActing ? "combat-token--acting" : ""} ${draggable ? "combat-token--draggable" : ""} ${dimmed ? "combat-token--invisible" : ""} ${isDragging ? "combat-token--dragging" : ""} ${wallRunning ? "combat-token--wallrun" : ""}`}
      transform={`translate(${pos.x + offX}, ${pos.y + offY}) scale(${scale})`}
      style={{ "--team-color": teamById(combatSide(combatant)).token }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown?.(combatant, e);
      }}
    >
      {(combatant.kind === "plant" || combatant.kind === "ghost") && (
        <circle className="combat-token-plant-range" r={(combatant.data?.biteRange ?? PLANT_BITE_RANGE) / scale} />
      )}
      {mountTarget && <circle className="combat-token-mount-target" r={r + 10} />}
      {isActive && <circle className="combat-token-active-ring" r={r + 7} />}
      {isSelected && <circle className="combat-token-selected-ring" r={r + 4} />}
      <circle className="combat-token-grit-ring" r={r + 3} style={{ stroke: gritColor(fraction) }} />
      {combatant.portrait ? (
        <>
          <clipPath id={clipId}>
            <circle r={r} />
          </clipPath>
          <image
            href={combatant.portrait}
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <circle className="combat-token-fill" r={r} />
      )}
      <circle className="combat-token-border" r={r} />
      {combatant.kind === "plant" && <polygon className="combat-token-plant-star" points={plantStarPoints(r)} />}
      {combatant.kind === "ghost" && (
        <g className="combat-token-ghost-glyph">
          <path d={ghostPath(r)} />
          <circle cx={-r * 0.25} cy={-r * 0.2} r={r * 0.12} />
          <circle cx={r * 0.25} cy={-r * 0.2} r={r * 0.12} />
        </g>
      )}
      {combatant.mountedOn != null && <circle className="combat-token-mounted-dot" r={4} cx={r - 4} cy={r - 4} />}
      {badges.length > 0 && (
        <g className="combat-token-effects" transform={`translate(0, ${-(r + 14)})`}>
          {badges.map((b, i) => (
            <g key={b.key} transform={`translate(${(i - (badges.length - 1) / 2) * 13}, 0)`}>
              <circle className={`combat-token-effect-dot combat-token-effect-dot--${b.key}`} r={5} />
              <title>{b.label}</title>
            </g>
          ))}
        </g>
      )}
      <text className="combat-token-label" y={r + 16} style={{ fill: combatantNameColor(combatant) || undefined }}>
        {label ?? combatant.name}
      </text>
      {downed && (
        <text className="combat-token-down-mark" y={5}>
          ×
        </text>
      )}
    </g>
  );
}

export default function CombatMap({
  encounter,
  drawMode = false,
  waterMode = null,
  onPaintWater,
  onAddWall,
  onRemoveWall,
  onBackgroundClick,
  onTokenClick,
  activeCombatantIds,
  actingCombatantId,
  rangeRing,
  placement = null,
  onRotatePlacement,
  mountRing,
  wallRunId,
  isDraggable,
  showDragApCost = false,
  estimateApCost,
  onTokenDragEnd,
  isDM = false,
  seesAll = isDM, // the DM or a DM Assistant: sees hidden tokens and decoys for what they are
  viewerUserId = null,
  shotFx,
  shotResolved,
  onMapUpdate,
}) {
  const { user } = useAuth();
  const soundVolume = user?.soundVolume;
  // Per-sound level for the non-launch combat SFX (fail/miss/hit/break/
  // hazard). Sparse map -- a missing key falls back to 0.5, same default the
  // server and Settings.jsx use. Kept in a ref so the wall/hazard effects
  // don't need it in their dep arrays.
  const combatSfxVolumesRef = useRef(user?.combatSfxVolumes || {});
  combatSfxVolumesRef.current = user?.combatSfxVolumes || {};
  const sfxVolume = (name) => combatSfxVolumesRef.current[name] ?? 0.5;
  const svgRef = useRef(null);
  const mapFileInputRef = useRef(null);
  const [drawing, setDrawing] = useState(null); // {x1,y1,x2,y2} while dragging a wall
  const [drag, setDrag] = useState(null); // {combatant, originX, originY, x, y, moved, startClientX, startClientY}
  // A dropped token's position, held here from the instant of drop until the
  // server confirms the move -- without it, `drag` clearing on mouseup would
  // make the token fall back to its stale pre-move spot (encounter.combatants
  // hasn't updated yet) for one or more frames, then glide forward again once
  // it does. Keyed by combatant id (also the mount partner's id, when a
  // mounted rider is what's being dragged -- see handleMouseUp).
  const [settlePositions, setSettlePositions] = useState(() => new Map());
  const [activeShots, setActiveShots] = useState([]);
  const [misfireFlash, setMisfireFlash] = useState(false);
  const [missFlash, setMissFlash] = useState(false);
  // Seeded from whatever shotFx/shotResolved is already current at mount --
  // that state lives in AccessSocket, one level up, and outlives any single
  // battle. Without this, a fresh CombatMap (new encounter, or a reconnect)
  // would see the previous battle's last shot as "new" and immediately
  // replay its flight animation and launch sound.
  const lastFxId = useRef(shotFx?.id ?? null);
  const lastResolvedId = useRef(shotResolved?.id ?? null);
  // When each in-flight shot launched (client clock) and how long its flight
  // runs -- so the "miss" map-glow can be held back until the bolt actually
  // lands, instead of flashing the outcome while the shot is still crossing
  // the map. Keyed by shot id; cleared in removeShot.
  const shotFlightMeta = useRef(new Map());
  // shot id -> timer for the hit sound of a shot expected to land (see the shotFx effect)
  const optimisticHitSfx = useRef(new Map());

  // A Wall Maker's wall grows in instead of just popping up. Only walls that
  // *appear* after this component has already rendered once get the
  // animation -- walls already on the map when the page loads (or drawn by
  // the DM) render statically from the start.
  const knownWallIds = useRef(null);
  const prevWalls = useRef(null);
  const [growingWallIds, setGrowingWallIds] = useState(() => new Set());
  // Terrain effects (a wall forming, a wall breaking -- see TerrainFx.jsx): mounted for a moment, then removed.
  const [terrainFx, setTerrainFx] = useState([]);
  const terrainFxTimers = useRef([]);
  useEffect(() => () => terrainFxTimers.current.forEach(clearTimeout), []);
  function playTerrainFx(items, ms) {
    const keys = new Set(items.map((i) => i.key));
    setTerrainFx((prev) => [...prev, ...items]);
    terrainFxTimers.current.push(setTimeout(() => setTerrainFx((prev) => prev.filter((i) => !keys.has(i.key))), ms));
  }
  useEffect(() => {
    const currentIds = new Set(encounter.walls.map((w) => w.id));
    if (knownWallIds.current !== null) {
      // Which stretches of wall were broken, and which new walls are only the surviving pieces of one.
      const { breaks, pieceIds } = diffWalls(prevWalls.current || [], encounter.walls);
      // A wall (or a segment of one -- a partial break drops the old id and
      // adds up to two new pieces) that was here and now isn't just broke.
      // The server holds this update back until the shot's burst would have
      // played (scheduleAfterFlight), so "now" is the moment of the break.
      // Skipped while the DM is drawing/erasing walls by hand.
      const broke = [...knownWallIds.current].some((id) => !currentIds.has(id));
      if (broke && !drawMode) {
        playCombatSfx("break", sfxVolume("break"));
        // (A whole encounter's walls vanishing at once -- a new encounter -- is not a fight's break.)
        if (breaks.length > 0 && breaks.length <= 8) {
          playTerrainFx(breaks.map((b) => ({ kind: "break", key: `break-${b.id}-${Date.now()}`, ...b })), WALL_BREAK_FX_MS);
        }
      }

      const newSlugWalls = encounter.walls.filter((w) => w.source === "slug" && !knownWallIds.current.has(w.id) && !pieceIds.has(w.id));
      const newSlugWallIds = newSlugWalls.map((w) => w.id);
      if (newSlugWallIds.length > 0) {
        playTerrainFx(newSlugWalls.map((w) => ({ kind: "form", key: `form-${w.id}-${Date.now()}`, ...w })), WALL_FORM_FX_MS);
        setGrowingWallIds((prev) => new Set([...prev, ...newSlugWallIds]));
        const timer = setTimeout(() => {
          setGrowingWallIds((prev) => {
            const next = new Set(prev);
            newSlugWallIds.forEach((id) => next.delete(id));
            return next;
          });
        }, 550);
        knownWallIds.current = currentIds;
        prevWalls.current = encounter.walls;
        return () => clearTimeout(timer);
      }
    }
    knownWallIds.current = currentIds;
    prevWalls.current = encounter.walls;
  }, [encounter.walls]);

  // A bridge that is built mid-encounter lays its planks down (see BridgePiece); ones already there
  // on first render (or restored on reconnect) just show.
  const knownBridgeIds = useRef(null);
  const [growingBridgeIds, setGrowingBridgeIds] = useState(() => new Set());
  useEffect(() => {
    const currentIds = new Set((encounter.bridges || []).map((b) => b.id));
    if (knownBridgeIds.current !== null) {
      const newIds = (encounter.bridges || []).filter((b) => !knownBridgeIds.current.has(b.id)).map((b) => b.id);
      if (newIds.length > 0) {
        setGrowingBridgeIds((prev) => new Set([...prev, ...newIds]));
        const timer = setTimeout(() => {
          setGrowingBridgeIds((prev) => {
            const next = new Set(prev);
            newIds.forEach((id) => next.delete(id));
            return next;
          });
        }, 700);
        knownBridgeIds.current = currentIds;
        return () => clearTimeout(timer);
      }
    }
    knownBridgeIds.current = currentIds;
  }, [encounter.bridges]);

  // Same idea for hazards (Ice patches, Hazard Maker's damaging terrain) --
  // one that appears mid-encounter grows in from nothing instead of just
  // popping up; ones already there on first render (or restored on
  // reconnect) don't replay the animation. The server already delays a
  // hazard's actual appearance until its shot's explosion would have
  // played (see scheduleAfterFlight in routes/combat.js), so this animation
  // starts right as that burst does.
  const knownHazardIds = useRef(null);
  const [growingHazardIds, setGrowingHazardIds] = useState(() => new Set());
  useEffect(() => {
    const currentIds = new Set((encounter.hazards || []).map((h) => h.id));
    if (knownHazardIds.current !== null) {
      const newIds = (encounter.hazards || []).filter((h) => !knownHazardIds.current.has(h.id)).map((h) => h.id);
      if (newIds.length > 0) {
        // A hazard area was just made -- the server already delayed it to the
        // moment its shot's burst plays, so this is that moment.
        playCombatSfx("hazard", sfxVolume("hazard"));
        setGrowingHazardIds((prev) => new Set([...prev, ...newIds]));
        const timer = setTimeout(() => {
          setGrowingHazardIds((prev) => {
            const next = new Set(prev);
            newIds.forEach((id) => next.delete(id));
            return next;
          });
        }, 550);
        knownHazardIds.current = currentIds;
        return () => clearTimeout(timer);
      }
    }
    knownHazardIds.current = currentIds;
  }, [encounter.hazards]);

  // DM-only battle-map background upload.
  const [mapUploadError, setMapUploadError] = useState(null);
  const [mapImgSize, setMapImgSize] = useState(null); // natural {w,h} of the loaded map image

  const mapImage = encounter.mapImage;

  useEffect(() => {
    if (!mapImage) {
      setMapImgSize(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setMapImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = mapImage;
    return () => {
      cancelled = true;
    };
  }, [mapImage]);

  // A jam is fully self-contained (outcome already "jam", nothing ever
  // launched). Every other shot arrives here with outcome: null -- the bolt
  // starts flying and the sound plays immediately, right now, at the exact
  // moment the shot was fired -- not delayed until it's known whether it
  // hits, misses, or gets countered. See combat-shot-resolved below for how
  // it finds out what actually happened.
  useEffect(() => {
    if (!shotFx || shotFx.id === lastFxId.current) return;
    lastFxId.current = shotFx.id;
    setActiveShots((prev) => [...prev, shotFx]);
    shotFlightMeta.current.set(shotFx.id, {
      at: performance.now(),
      totalMs: Math.max(400, (shotFx.windowMs || SHOT_FLIGHT_MS) * SHOT_FLIGHT_MULTIPLIER),
    });
    // Hit already rolled but unconfirmed until the reaction window closes: play
    // the hit sound with the burst on arrival rather than whenever that late
    // confirmation shows up. A reaction that changes the outcome cancels it.
    if (shotFx.expectHit && shotFx.outcome == null) {
      const flightMs = Math.max(400, (shotFx.windowMs || SHOT_FLIGHT_MS) * SHOT_FLIGHT_MULTIPLIER);
      optimisticHitSfx.current.set(
        shotFx.id,
        setTimeout(() => playCombatSfx("hit", sfxVolume("hit")), flightMs)
      );
    }
    if (shotFx.outcome === "jam" || shotFx.outcome === "too-close") {
      setMisfireFlash(true);
      setTimeout(() => setMisfireFlash(false), 3000);
      // The shot completely failed -- nothing left the barrel, whether from
      // a random misfire (jam) or from being fired too close to arm (see
      // shotTooClose in combatRules.js). No launch sound (nothing flew);
      // the failure gets its own sound instead.
      playCombatSfx("fail", sfxVolume("fail"));
    } else if (shotFx.pod) {
      // A Pressure Tick steam pod going off -- its own sound, not a slug
      // launch (nothing was fired from a blaster).
      playCombatSfx("geyser", sfxVolume("geyser"));
    } else {
      // The slug actually left the blaster -- play the launch sound. Not on
      // a jam/misfire, since then it never went anywhere. A self-targeted
      // shot (same isSelfShot convention as routes/combat.js) is a self-buff,
      // not an attack, so it gets its own distinct cue instead.
      if (shotFx.attackerId != null && shotFx.attackerId === shotFx.targetId) {
        playCombatSfx("self", sfxVolume("self"));
      } else if (!shotFx.noWindup) {
        // (A ricochet bounce is already at full speed -- no transform beat, so no launch sound.)
        playShotSound(soundVolume);
      }
      // Zeus flies as a blur -- its own thunderclap follows once the launch
      // sound has run its course, self-targeted or not.
      if (shotFx.slugName === "Zeus") {
        setTimeout(() => playCombatSfx("zeus", sfxVolume("zeus")), SOUND_DURATION_MS);
      }
    }
  }, [shotFx]);

  // The follow-up to a launch: merges the real outcome into the matching
  // in-flight shot (by id) so its already-playing ShotEffect can reveal what
  // happened, without restarting its animation clock or its sound.
  useEffect(() => {
    if (!shotResolved || shotResolved.id === lastResolvedId.current) return;
    lastResolvedId.current = shotResolved.id;

    // The outcome reveal reaches us the instant it's decided -- for the
    // common uncontested shot that's right at launch, a whole flight before
    // the bolt lands. Everything that should land *with* the burst (the miss
    // glow, and now the hit/miss sounds) is held back until then. `remaining`
    // is how long until this shot's flight animation reaches its impact
    // point; a countered shot resolves at the end of its window, so that's
    // ~0, but its hit burst is a further half-flight out past the clash (see
    // ShotEffect's clashAt + aftermathMs).
    const meta = shotFlightMeta.current.get(shotResolved.id);
    const remaining = meta ? Math.max(0, meta.totalMs - (performance.now() - meta.at)) : 0;
    // A shot that was already expected to hit had its hit sound scheduled for
    // the burst at launch (see the shotFx effect) -- a plain "hit" confirmation
    // has nothing left to play; anything else cancels it and plays as usual.
    const optimisticSfx = optimisticHitSfx.current.get(shotResolved.id);
    if (optimisticSfx) {
      optimisticHitSfx.current.delete(shotResolved.id);
      if (shotResolved.outcome !== "hit" || shotResolved.countered) clearTimeout(optimisticSfx);
    }
    const hitSfxAlreadyScheduled = Boolean(optimisticSfx) && shotResolved.outcome === "hit" && !shotResolved.countered;
    const atBurst = (fn, extraDelay = 0) => {
      const delay = remaining + extraDelay;
      if (delay <= 0) fn();
      else setTimeout(fn, delay);
    };
    const clashAftermath = meta ? meta.totalMs / 2 : 0;

    if (shotResolved.outcome === "miss") {
      atBurst(() => {
        setMissFlash(true);
        setTimeout(() => setMissFlash(false), 3000);
        playCombatSfx("miss", sfxVolume("miss"));
      });
    } else if (shotResolved.outcome === "out-of-range") {
      // Went wide / fell short -- same "missed the target" sound, no glow
      // (that's reserved for a true accuracy miss).
      atBurst(() => playCombatSfx("miss", sfxVolume("miss")));
    } else if (shotResolved.outcome === "hit") {
      if (!hitSfxAlreadyScheduled) atBurst(() => playCombatSfx("hit", sfxVolume("hit")));
    } else if (shotResolved.outcome === "attacker-wins" || shotResolved.outcome === "defender-wins") {
      // A clash one side won -- the winning bolt carries on and lands a hit
      // burst a half-flight after the clash itself.
      atBurst(() => playCombatSfx("hit", sfxVolume("hit")), clashAftermath);
    }

    if (shotResolved.countered) {
      // The counter-slug fires too, right as it's chosen -- give it the same
      // launch sound the original shot got, and Zeus's thunderclap after it.
      playShotSound(soundVolume);
      if (shotResolved.counterSlugName === "Zeus") {
        setTimeout(() => playCombatSfx("zeus", sfxVolume("zeus")), SOUND_DURATION_MS);
      }
    }
    setActiveShots((prev) =>
      prev.map((s) =>
        s.id === shotResolved.id
          ? {
              ...s,
              outcome: shotResolved.outcome,
              style: Boolean(shotResolved.style),
              countered: shotResolved.countered,
              counterSlugType: shotResolved.counterSlugType,
              // Where the incoming shot and the counter actually collide, and
              // how far into the flight the counter launched -- sent only for
              // a countered shot. The clash point rides how late the counter
              // was: a snappy one meets the shot well out from the defender,
              // a last-instant one almost on top of them (server clamps it).
              ...(shotResolved.clashPoint ? { clashPoint: shotResolved.clashPoint } : null),
              ...(shotResolved.counterAtMs != null ? { counterAtMs: shotResolved.counterAtMs } : null),
              // A miss carries a deflected impactPoint (see missDeflection
              // server-side) so the bolt visibly goes wide instead of
              // stopping dead-on the target -- only sent when it applies.
              ...(shotResolved.impactPoint ? { impactPoint: shotResolved.impactPoint } : null),
            }
          : s
      )
    );
  }, [shotResolved]);

  // Drop the settle override for a combatant as soon as the server-confirmed
  // position actually reaches it (or the combatant's gone -- e.g. removed
  // from the encounter mid-drag).
  useEffect(() => {
    setSettlePositions((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [id, pt] of prev) {
        const c = encounter.combatants.find((cc) => cc.id === id);
        if (!c || (Math.abs(c.x - pt.x) < 0.5 && Math.abs(c.y - pt.y) < 0.5)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [encounter.combatants]);

  function removeShot(id) {
    setActiveShots((prev) => prev.filter((s) => s.id !== id));
    shotFlightMeta.current.delete(id);
  }

  const mapWidth = encounter.mapWidth;
  const mapHeight = encounter.mapHeight;
  const dragLocked = drawMode || Boolean(waterMode);

  // This viewer's own zoom/pan (never sent anywhere) and the map's on-screen
  // width, which the scale bar needs to turn map units into pixels.
  // Planning aid (DM, setup only): reference rings for blasters, walls, hazards
  // etc. at the map's real scale, so resizing the map shows them grow/shrink.
  const [previewOn, setPreviewOn] = useState(true);
  const [previewShown, setPreviewShown] = useState(() => new Set(DEFAULT_SHOWN_REFERENCES));
  const [previewOrigin, setPreviewOrigin] = useState(null); // null = map centre
  const showPreview = isDM && encounter.status === "setup" && previewOn;
  const previewAt = previewOrigin ?? { x: mapWidth / 2, y: mapHeight / 2 };
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState(null); // {startClientX, startClientY, startX, startY, moved}
  const [screenW, setScreenW] = useState(0);
  const suppressClickRef = useRef(false); // a pan-drag's mouseup must not also count as a click on the map
  const viewRef = useRef(view);
  viewRef.current = view;
  // Shift + wheel turns a wall / bridge being placed instead of zooming (read through refs: the wheel listener is bound once).
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const rotatePlacementRef = useRef(onRotatePlacement);
  rotatePlacementRef.current = onRotatePlacement;
  const viewW = mapWidth / view.zoom;
  const viewH = mapHeight / view.zoom;
  const markerS = markerScale(mapWidth);
  const viewerCombatant = encounter.combatants.find((c) => c.kind === "character" && c.refUserId === viewerUserId);

  // A different map size (or a new encounter) means the old window is
  // meaningless -- start over from the whole map.
  useEffect(() => {
    setView({ zoom: 1, x: 0, y: 0 });
  }, [encounter.id, mapWidth, mapHeight]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const measure = () => setScreenW(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom by `factor`, keeping the map point at (fx, fy) -- fractions of the
  // visible window -- fixed on screen. Defaults to the centre of the window.
  function zoomBy(factor, fx = 0.5, fy = 0.5) {
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const anchorX = v.x + fx * (mapWidth / v.zoom);
      const anchorY = v.y + fy * (mapHeight / v.zoom);
      return clampView(z, anchorX - fx * (mapWidth / z), anchorY - fy * (mapHeight / z), mapWidth, mapHeight);
    });
  }

  // Wheel zooms toward the cursor. A native (non-passive) listener, since
  // React's onWheel is passive and can't stop the page scrolling underneath.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      e.preventDefault();
      if (e.shiftKey && placementRef.current && rotatePlacementRef.current) {
        // Some browsers report a Shift + wheel as horizontal scroll.
        const d = e.deltaY || e.deltaX;
        rotatePlacementRef.current(d < 0 ? -ROTATE_STEP : ROTATE_STEP);
        return;
      }
      const rect = el.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      zoomBy(e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, fx, fy);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // zoomBy only reads map dimensions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapWidth, mapHeight]);

  const pxPerMeter = screenW > 0 ? (screenW / viewW) * UNITS_PER_METER : 0;
  const scaleBar = niceScaleLength(pxPerMeter);

  // Water the DM paints during setup. Hidden from everyone once the fight is
  // on (the map art shows the water), and never shown to players.
  // The DM outlines an area (the outline is { paint, points } while dragging)
  // and its inside floods/drains on release.
  const [waterOutline, setWaterOutline] = useState(null);
  const showWater = isDM && encounter.status !== "active";
  const waterRunList = useMemo(() => waterRuns([...makeWaterSet(encounter.water)]), [encounter.water]);
  const clampToMap = (pt) => ({ x: Math.min(mapWidth, Math.max(0, pt.x)), y: Math.min(mapHeight, Math.max(0, pt.y)) });
  function finishWaterOutline() {
    if (!waterOutline) return;
    const cells = cellsInOutline(waterOutline.points, mapWidth, mapHeight);
    if (cells.length > 0) onPaintWater?.(cells, waterOutline.paint);
    setWaterOutline(null);
  }

  // Cover-fit the uploaded image to the map (like CSS background-size: cover),
  // centred. Zooming/panning is the viewer's own window onto this, not a
  // property of the picture.
  const mapCoverScale = mapImgSize ? Math.max(mapWidth / mapImgSize.w, mapHeight / mapImgSize.h) : 1;
  const mapDisplayW = mapImgSize ? mapImgSize.w * mapCoverScale : mapWidth;
  const mapDisplayH = mapImgSize ? mapImgSize.h * mapCoverScale : mapHeight;
  const mapImgX = (mapWidth - mapDisplayW) / 2;
  const mapImgY = (mapHeight - mapDisplayH) / 2;

  const pointFor = (e) => mapPoint(svgRef.current, e, viewRef.current, mapWidth, mapHeight);

  function handleBackgroundMouseDown(e) {
    // Middle button always pans; the left button pans an empty spot of the map
    // once zoomed in, unless a DM tool (walls/water) owns the left button.
    const leftPans = e.button === 0 && view.zoom > 1 && !drawMode && !waterMode;
    if (e.button === 1 || leftPans) {
      if (e.button === 1) e.preventDefault();
      suppressClickRef.current = false;
      setPanDrag({ button: e.button, startClientX: e.clientX, startClientY: e.clientY, startX: view.x, startY: view.y, moved: false });
      return;
    }
    suppressClickRef.current = false;
    if (e.button !== 0) return;
    if (waterMode) {
      setWaterOutline({ paint: waterMode === "paint", points: [clampToMap(pointFor(e))] });
      return;
    }
    if (!drawMode) return;
    const pt = pointFor(e);
    setDrawing({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  }

  function handleTokenMouseDown(combatant, e) {
    if (e.button !== 0) return;
    if (dragLocked || !isDraggable?.(combatant)) {
      onTokenClick?.(combatant);
      return;
    }
    setDrag({
      combatant,
      originX: combatant.x,
      originY: combatant.y,
      x: combatant.x,
      y: combatant.y,
      moved: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
    });
  }

  function handleMouseMove(e) {
    if (panDrag) {
      const rect = svgRef.current.getBoundingClientRect();
      const dxPx = e.clientX - panDrag.startClientX;
      const dyPx = e.clientY - panDrag.startClientY;
      const moved = panDrag.moved || Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD;
      if (moved) {
        // Dragging the map: it follows the cursor, so the window moves the other way.
        setView((v) => clampView(v.zoom, panDrag.startX - (dxPx / rect.width) * viewW, panDrag.startY - (dyPx / rect.height) * viewH, mapWidth, mapHeight));
        if (!panDrag.moved) setPanDrag((prev) => (prev ? { ...prev, moved: true } : prev));
      }
      return;
    }
    if (waterOutline) {
      const pt = clampToMap(pointFor(e));
      // Skip points closer than ~3 screen pixels -- plenty for a smooth outline.
      const minStep = (3 * viewW) / (svgRef.current.getBoundingClientRect().width || 1);
      setWaterOutline((prev) => {
        if (!prev) return prev;
        const last = prev.points[prev.points.length - 1];
        return Math.hypot(pt.x - last.x, pt.y - last.y) < minStep ? prev : { ...prev, points: [...prev.points, pt] };
      });
      return;
    }
    if (drawing) {
      const pt = pointFor(e);
      setDrawing((prev) => (prev ? { ...prev, x2: pt.x, y2: pt.y } : prev));
      return;
    }
    if (drag) {
      const screenDist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      const pt = pointFor(e);
      setDrag((prev) => (prev ? { ...prev, x: pt.x, y: pt.y, moved: prev.moved || screenDist > DRAG_THRESHOLD } : prev));
    }
  }

  function handleMouseUp(e) {
    if (panDrag) {
      // The click that follows this mouseup belongs to the pan, not the map.
      if (panDrag.moved && panDrag.button === 0) suppressClickRef.current = true;
      setPanDrag(null);
      return;
    }
    if (waterOutline) {
      finishWaterOutline();
      return;
    }
    if (drawing) {
      const len = Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1);
      if (len > 6) onAddWall?.(drawing);
      setDrawing(null);
      return;
    }
    if (drag) {
      if (drag.moved) {
        const point = { x: drag.x, y: drag.y };
        const overrideIds =
          drag.combatant.mountedOn != null ? [drag.combatant.id, drag.combatant.mountedOn] : [drag.combatant.id];
        setSettlePositions((prev) => {
          const next = new Map(prev);
          overrideIds.forEach((id) => next.set(id, point));
          return next;
        });
        // Safety net: if the move request errors out (no encounter update
        // ever arrives to reconcile against, see the settlePositions effect
        // below), don't leave the token stuck showing the attempted drop
        // spot forever -- fall back to wherever it actually is.
        overrideIds.forEach((id) => {
          setTimeout(() => {
            setSettlePositions((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
          }, 4000);
        });
        // Shift held on drop = the DM's free reposition (see handleTokenDragEnd).
        onTokenDragEnd?.(drag.combatant, point, Boolean(e?.shiftKey));
      } else {
        onTokenClick?.(drag.combatant);
      }
      setDrag(null);
    }
  }

  function handleBackgroundClick(e) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (e.button !== 0 || drawMode || drag || waterMode) return;
    const pt = pointFor(e);
    if (showPreview) setPreviewOrigin(pt);
    onBackgroundClick?.(pt);
  }

  const dragDist = drag ? Math.hypot(drag.x - drag.originX, drag.y - drag.originY) : 0;
  const dragApCost = drag && showDragApCost ? estimateApCost?.(drag.combatant, dragDist, { x: drag.originX, y: drag.originY }, { x: drag.x, y: drag.y }) : null;

  async function handleMapFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMapUploadError(null);
    try {
      const dataUrl = await downscaleImageFile(file);
      onMapUpdate?.({ image: dataUrl });
    } catch (err) {
      setMapUploadError(err.message || "Could not upload that image.");
    }
  }

  return (
    <div
      className={`combat-map-wrap ${misfireFlash ? "combat-map-wrap--misfire" : ""} ${missFlash ? "combat-map-wrap--miss" : ""}`}
      style={{
        aspectRatio: `${mapWidth} / ${mapHeight}`,
        // Fill the available column width, but never grow taller than the
        // viewport allows -- this keeps the box's rendered ratio exactly
        // matching the SVG viewBox (no letterboxing), which the click/drag
        // coordinate math in mapPoint() depends on.
        width: `min(100%, calc((100vh - 120px) * ${mapWidth} / ${mapHeight}))`,
      }}
    >
      <svg
        ref={svgRef}
        className={`combat-map ${drawMode || waterMode ? "combat-map--drawing" : ""} ${view.zoom > 1 && !drawMode && !waterMode ? "combat-map--pannable" : ""} ${panDrag?.moved ? "combat-map--panning" : ""}`}
        viewBox={`${view.x} ${view.y} ${viewW} ${viewH}`}
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setDrawing(null);
          setDrag(null);
          setPanDrag(null);
          finishWaterOutline();
        }}
        onClick={handleBackgroundClick}
      >
        <rect className="combat-map-bg" x="0" y="0" width={mapWidth} height={mapHeight} />
        {mapImage && (
          <image
            className="combat-map-image"
            href={mapImage}
            x={mapImgX}
            y={mapImgY}
            width={mapDisplayW}
            height={mapDisplayH}
            preserveAspectRatio="none"
          />
        )}

        {/* Each hazard is drawn per element (see HazardPatch.jsx) so they can be told apart at a glance. */}
        {(encounter.hazards || []).map((hz) => (
          <HazardPatch key={hz.id} hz={hz} growing={growingHazardIds.has(hz.id)} title={hazardDescription(hz)} />
        ))}

        {(encounter.bridges || []).map((b) => (
          <BridgePiece key={b.id} b={b} growing={growingBridgeIds.has(b.id)} />
        ))}

        {/* Anchorage's zones -- a shimmering field suppressing knockback and
            wall-breaking for anyone/anything inside it. */}
        {(encounter.zones || []).map((z) => (
          <circle key={`zone-${z.id}`} className="combat-map-zone" cx={z.x} cy={z.y} r={z.radius} />
        ))}

        {/* Pressure Tick's pods -- the DM gets the full read (a dashed line
            drawn out to exactly where the blast reaches, an arrowhead, and
            the live countdown); everyone else just gets a small bending
            semicircle hinting at the direction, no exact line and no
            timer -- the DM should know precisely what's coming, players
            should only get a hint. */}
        {(encounter.pods || []).map((pod) =>
          isDM ? (
            (() => {
              const end = podLineEnd(pod);
              return (
                <g key={`pod-${pod.id}`} style={{ "--pod-color": typeColor(pod.slugType) }}>
                  <line className="combat-map-pod-aim" x1={pod.x} y1={pod.y} x2={end.x} y2={end.y} />
                  <g className="combat-map-pod" transform={`translate(${pod.x} ${pod.y})`}>
                    <circle r={6} />
                  </g>
                  <g className="combat-map-pod-arrow" transform={`translate(${end.x} ${end.y}) rotate(${pod.angle})`}>
                    <path d="M -7 -5 L 5 0 L -7 5 Z" />
                  </g>
                  <text className="combat-map-pod-counter" x={pod.x} y={pod.y - 16 * markerS} style={{ fontSize: 24 * markerS }}>
                    {pod.counter}
                  </text>
                </g>
              );
            })()
          ) : (
            <g
              key={`pod-${pod.id}`}
              className="combat-map-pod-hint"
              transform={`translate(${pod.x} ${pod.y}) rotate(${pod.angle})`}
              style={{ "--pod-color": typeColor(pod.slugType) }}
            >
              <path d="M 0 -9 A 9 9 0 0 1 0 9" />
            </g>
          )
        )}

        {showPreview && (
          <g className="combat-map-preview">
            {RANGE_REFERENCES.filter((ref) => previewShown.has(ref.id)).map((ref) =>
              ref.kind === "line" ? (
                <line
                  key={ref.id}
                  className="combat-map-preview-line"
                  x1={previewAt.x - ref.length / 2}
                  y1={previewAt.y}
                  x2={previewAt.x + ref.length / 2}
                  y2={previewAt.y}
                  style={{ stroke: ref.color }}
                />
              ) : (
                <circle key={ref.id} className="combat-map-preview-ring" cx={previewAt.x} cy={previewAt.y} r={ref.r} style={{ stroke: ref.color, fill: ref.color }} />
              )
            )}
            <circle className="combat-map-preview-origin" cx={previewAt.x} cy={previewAt.y} r={4 * markerS} />
          </g>
        )}

        {rangeRing && (
          <circle className="combat-map-range-ring" cx={rangeRing.x} cy={rangeRing.y} r={rangeRing.r} />
        )}

        {mountRing && (
          <circle className="combat-map-mount-ring" cx={mountRing.x} cy={mountRing.y} r={mountRing.r} />
        )}

        {showWater && waterRunList.length > 0 && (
          <g className="combat-map-water" pointerEvents="none">
            {waterRunList.map((r) => (
              <rect key={r.key} x={r.x} y={r.y} width={r.w} height={WATER_CELL} />
            ))}
          </g>
        )}

        {waterOutline && waterOutline.points.length > 1 && (
          <polygon
            className={`combat-map-water-outline ${waterOutline.paint ? "" : "combat-map-water-outline--drain"}`}
            points={waterOutline.points.map((p) => `${p.x},${p.y}`).join(" ")}
            pointerEvents="none"
          />
        )}

        {encounter.walls.map((w) => {
          const isSlugWall = w.source === "slug";
          const isGrowing = growingWallIds.has(w.id);
          return (
            <line
              key={w.id}
              className={`combat-map-wall ${isSlugWall ? "combat-map-wall--slug" : ""} ${isGrowing ? "combat-map-wall--growing" : ""}`}
              x1={w.x1}
              y1={w.y1}
              x2={w.x2}
              y2={w.y2}
              pathLength={isGrowing ? 1 : undefined}
              style={isSlugWall ? { "--wall-color": typeColor(w.slugType) } : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                onRemoveWall?.(w.id);
              }}
            />
          );
        })}

        {/* A wall forming or breaking (see TerrainFx.jsx), over the walls. */}
        {terrainFx.map((fx) =>
          fx.kind === "break" ? <WallBreakFx key={fx.key} fx={fx} vs={markerS} /> : <WallFormFx key={fx.key} fx={fx} vs={markerS} />
        )}

        {placement && <PlacementGhost svgRef={svgRef} getPoint={pointFor} placement={placement} markerS={markerS} />}

        {drawing && (
          <line className="combat-map-wall combat-map-wall--pending" x1={drawing.x1} y1={drawing.y1} x2={drawing.x2} y2={drawing.y2} />
        )}

        {drag && drag.moved && (
          <g className="combat-drag-preview">
            <line x1={drag.originX} y1={drag.originY} x2={drag.x} y2={drag.y} />
            {dragApCost != null && (
              <text
                x={(drag.originX + drag.x) / 2}
                y={(drag.originY + drag.y) / 2 - 10 * markerS}
                style={{ fontSize: 13 * markerS, strokeWidth: 4 * markerS }}
              >
                {dragApCost} AP · {formatMeters(dragDist / UNITS_PER_METER)}
              </text>
            )}
          </g>
        )}

        {encounter.combatants
          .filter((c) => {
            // Thugglet's invisibility: the DM and the combatant's own player
            // still see the token (dimmed, see `dimmed` below) -- every
            // other player never gets it rendered at all, so there's
            // nothing on the map for them to click/target either.
            if (!c.statusEffects?.invisible && !isBurrowed(c)) return true;
            return (
              seesAll ||
              (c.kind === "character" && c.refUserId === viewerUserId) ||
              (c.kind === "npc" && viewerUserId != null && c.controllerUserId === viewerUserId)
            );
          })
          // Mounted riders paint last so they sit on top of their mecha.
          .sort((a, b) => (a.mountedOn != null ? 1 : 0) - (b.mountedOn != null ? 1 : 0))
          .map((c) => {
            // Follow a drag: the dragged token itself, and -- when a mounted
            // rider is being dragged -- the mecha they're riding, so the pair
            // moves as one.
            const followsDrag =
              drag && (drag.combatant.id === c.id || (drag.combatant.mountedOn != null && drag.combatant.mountedOn === c.id));
            const settled = settlePositions.get(c.id);
            const pos = followsDrag ? { x: drag.x, y: drag.y } : settled ?? { x: c.x, y: c.y };
            const inMountRange =
              mountRing &&
              c.kind === "mecha" &&
              !c.disabled &&
              Math.hypot(c.x - mountRing.x, c.y - mountRing.y) <= mountRing.r;
            // A Mirage Coil decoy only gives itself away to the DM and the
            // owner's own side. Everyone else sees the owner's name on it and
            // the same active-turn ring, so neither tells it from the real one.
            const hidesAsOwner = c.kind === "decoy" && !seesAll && !(viewerCombatant && combatSide(viewerCombatant) === combatSide(c));
            const decoyOwner = hidesAsOwner ? encounter.combatants.find((o) => o.id === c.data?.decoyOwnerId) : null;
            return (
              <Token
                key={c.id}
                combatant={c}
                label={decoyOwner?.name}
                pos={pos}
                isActive={Boolean(activeCombatantIds?.includes(hidesAsOwner ? c.data?.decoyOwnerId : c.id))}
                isActing={c.id === actingCombatantId}
                draggable={!dragLocked && Boolean(isDraggable?.(c))}
                isDragging={Boolean(followsDrag)}
                onMouseDown={handleTokenMouseDown}
                dimmed={Boolean(c.statusEffects?.invisible) || isBurrowed(c)}
                mountTarget={Boolean(inMountRange)}
                wallRunning={c.id === wallRunId}
                scale={markerS}
              />
            );
          })}

        {activeShots.map((fx) => (
          <ShotEffect key={fx.id} fx={fx} vs={markerS} onDone={() => removeShot(fx.id)} />
        ))}
      </svg>

      {isDM && (
        <>
          <input
            ref={mapFileInputRef}
            type="file"
            accept="image/*"
            className="combat-map-file-input"
            onChange={handleMapFileChange}
          />
          <div className="combat-map-toolbar">
            <button type="button" className="combat-map-toolbar-btn" onClick={() => mapFileInputRef.current?.click()}>
              <UploadSimpleIcon weight="bold" />
              {mapImage ? "Change Map" : "Upload Map"}
            </button>
            {encounter.status === "setup" && (
              <button
                type="button"
                className={`combat-map-toolbar-btn ${previewOn ? "combat-map-toolbar-btn--on" : ""}`}
                onClick={() => setPreviewOn((v) => !v)}
              >
                <RulerIcon weight="bold" />
                Range preview
              </button>
            )}
            {mapImage && (
              <button
                type="button"
                className="combat-map-toolbar-btn combat-map-toolbar-btn--danger"
                onClick={() => onMapUpdate?.({ image: null })}
              >
                <XIcon weight="bold" />
                Remove
              </button>
            )}
          </div>
          {mapUploadError && <p className="combat-map-upload-error">{mapUploadError}</p>}
          {!mapImage && (
            <button type="button" className="combat-map-upload-cta" onClick={() => mapFileInputRef.current?.click()}>
              <UploadSimpleIcon weight="duotone" />
              <span>Upload a Battle Map</span>
            </button>
          )}
        </>
      )}

      {showPreview && (
        <div className="combat-map-preview-legend">
          <h4>Range preview</h4>
          <ul>
            {RANGE_REFERENCES.map((ref) => (
              <li key={ref.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={previewShown.has(ref.id)}
                    onChange={() =>
                      setPreviewShown((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(ref.id)) next.add(ref.id);
                        return next;
                      })
                    }
                  />
                  <i style={{ background: ref.color }} />
                  <span>{ref.label}</span>
                  <b>{formatMeters(ref.meters)}</b>
                </label>
              </li>
            ))}
          </ul>
          <p>Stock blaster reach, before a slug's element adds its own. Click the map to move the origin.</p>
        </div>
      )}
      {waterMode && (
        <p className="combat-map-hint">
          {waterMode === "paint" ? "Drag around an area -- the inside floods when you let go." : "Drag around water -- the inside drains when you let go."} Only you can see it, and only before combat starts.
        </p>
      )}
      {drawMode && <p className="combat-map-hint">Drag to draw a wall. Right-click a wall to erase it.</p>}

      {/* Your own view of the map: scroll to zoom, drag (or middle-drag) to
          pan. Moves the whole map together -- picture, tokens, rings -- and is
          never shared with anyone else. */}
      <div className="combat-map-zoom" role="group" aria-label="Map zoom">
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={view.zoom <= MIN_ZOOM} title="Zoom out" aria-label="Zoom out">
          <MagnifyingGlassMinusIcon weight="bold" />
        </button>
        <span className="combat-map-zoom-level">{Math.round(view.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} disabled={view.zoom >= MAX_ZOOM} title="Zoom in (or scroll over the map)" aria-label="Zoom in">
          <MagnifyingGlassPlusIcon weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          disabled={view.zoom === 1}
          title="Show the whole map"
          aria-label="Reset view"
        >
          <CornersInIcon weight="bold" />
        </button>
      </div>

      {/* Distance scale for everyone: how far a real distance is on screen,
          at the current zoom -- so ranges can be judged by eye. */}
      {scaleBar.px > 0 && (
        <div className="combat-map-scale" aria-label={`Map scale: ${formatMeters(scaleBar.meters)}`}>
          <div className="combat-map-scale-bar" style={{ width: scaleBar.px }}>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="combat-map-scale-labels" style={{ width: scaleBar.px }}>
            <span>0</span>
            <span>{formatMeters(scaleBar.meters / 2)}</span>
            <span>{formatMeters(scaleBar.meters)}</span>
          </div>
          <div className="combat-map-scale-note">Map {formatMeters(mapMeters(mapWidth))} across</div>
        </div>
      )}
    </div>
  );
}
