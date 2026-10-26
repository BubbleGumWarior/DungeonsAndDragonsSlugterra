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

// A Mega Morph bolt: a teardrop instead of the ordinary round bolt. Drawn
// pointing along +x (round head leading at the origin, tapering tail behind)
// and rotated into place by the caller.
const MEGA_BOLT_PATH = "M -30 0 C -18 -3 -8 -10 0 -10 A 10 10 0 0 1 0 10 C -8 10 -18 3 -30 0 Z";

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
function ShotEffect({ fx, vs = 1, onDone }) {
  const [elapsed, setElapsed] = useState(0);
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
  const totalMs = Math.max(400, (fx.windowMs || SHOT_FLIGHT_MS) * SHOT_FLIGHT_MULTIPLIER);

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
  const skidMode = revealElapsed != null && settleFrom != null && revealElapsed > totalMs - settleMs;
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
  const stillWaiting = !isJam && !fx.countered && fx.outcome == null;
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
  const inWindup = elapsed < SLOW_PHASE_MS;
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

  if (!fx.countered) {
    let boltPos = null;
    let styleBolt = false;
    if (!fx.outcome) {
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
        Math.min(PENDING_MAX_FRACTION, phasedFraction(elapsed, totalMs, fx.windupFraction))
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
      const f = phasedFraction(elapsed, totalMs, fx.windupFraction);
      const bend = Math.min(1, (elapsed - revealElapsed) / Math.max(1, burstAt - revealElapsed));
      boltPos = lerp(lerp(fx.attackerPos, fx.targetPos, f), lerp(fx.attackerPos, fx.impactPoint, f), bend);
    } else if (elapsed < burstAt) {
      boltPos = lerp(fx.attackerPos, fx.impactPoint, phasedFraction(elapsed, totalMs, fx.windupFraction));
    } else {
      bursts.push({ pos: fx.impactPoint, color, kind: fx.outcome, opacity: fadeAfter(burstAt), aoe: fx.aoe && fx.outcome !== "out-of-range", aoeScale: fx.aoeScale ?? 1, growAt: burstAt, style: fx.style && fx.outcome === "hit" });
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
      const splitF = fx.split && fx.outcome === "hit" && !skidMode ? phasedFraction(elapsed, totalMs, fx.windupFraction) : 0;
      if (splitF >= SPLIT_START_FRACTION) {
        for (const sb of surroundBolts(fx.attackerPos, fx.impactPoint, splitF)) {
          bolts.push({ pos: sb.pos, color: boltColor, color2: null, mega: false, angle: sb.angle, style: false });
        }
      } else {
        bolts.push({ pos: boltPos, color: boltColor, color2: boltColor2, mega: fx.mega, angle, style: styleBolt });
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
    const shotPosAtCounter = lerp(fx.attackerPos, fx.impactPoint, phasedFraction(counterAtMs, totalMs, fx.windupFraction));
    if (elapsed < clashAt) {
      if (elapsed < counterAtMs) {
        bolts.push({
          pos: lerp(fx.attackerPos, fx.impactPoint, phasedFraction(elapsed, totalMs, fx.windupFraction)),
          color: boltColor,
          color2: boltColor2,
          mega: fx.mega,
          angle: headingDeg(fx.attackerPos, fx.impactPoint),
        });
      } else {
        // Linear from each bolt's position when the counter fired -- both are
        // up to speed by now, no slow launch-out to reproduce.
        const t = (elapsed - counterAtMs) / Math.max(1, clashAt - counterAtMs);
        bolts.push({ pos: lerp(shotPosAtCounter, mid, t), color: boltColor, color2: boltColor2, mega: fx.mega, angle: headingDeg(shotPosAtCounter, mid) });
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
        ) : (
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
  mountRing,
  wallRunId,
  isDraggable,
  showDragApCost = false,
  estimateApCost,
  onTokenDragEnd,
  isDM = false,
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

  // A Wall Maker's wall grows in instead of just popping up. Only walls that
  // *appear* after this component has already rendered once get the
  // animation -- walls already on the map when the page loads (or drawn by
  // the DM) render statically from the start.
  const knownWallIds = useRef(null);
  const [growingWallIds, setGrowingWallIds] = useState(() => new Set());
  useEffect(() => {
    const currentIds = new Set(encounter.walls.map((w) => w.id));
    if (knownWallIds.current !== null) {
      // A wall (or a segment of one -- a partial break drops the old id and
      // adds up to two new pieces) that was here and now isn't just broke.
      // The server holds this update back until the shot's burst would have
      // played (scheduleAfterFlight), so "now" is the moment of the break.
      // Skipped while the DM is drawing/erasing walls by hand.
      const broke = [...knownWallIds.current].some((id) => !currentIds.has(id));
      if (broke && !drawMode) playCombatSfx("break", sfxVolume("break"));

      const newSlugWallIds = encounter.walls
        .filter((w) => w.source === "slug" && !knownWallIds.current.has(w.id))
        .map((w) => w.id);
      if (newSlugWallIds.length > 0) {
        setGrowingWallIds((prev) => new Set([...prev, ...newSlugWallIds]));
        const timer = setTimeout(() => {
          setGrowingWallIds((prev) => {
            const next = new Set(prev);
            newSlugWallIds.forEach((id) => next.delete(id));
            return next;
          });
        }, 550);
        knownWallIds.current = currentIds;
        return () => clearTimeout(timer);
      }
    }
    knownWallIds.current = currentIds;
  }, [encounter.walls]);

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
      } else {
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
      atBurst(() => playCombatSfx("hit", sfxVolume("hit")));
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

        {(encounter.hazards || []).map((hz) => (
          <circle
            key={hz.id}
            className={`combat-map-hazard combat-map-hazard--${hz.type} ${growingHazardIds.has(hz.id) ? "combat-map-hazard--growing" : ""}`}
            cx={hz.x}
            cy={hz.y}
            r={hz.radius}
            style={hz.type === "damage" ? { "--hazard-color": typeColor(hz.slugType) } : undefined}
          >
            <title>{hazardDescription(hz)}</title>
          </circle>
        ))}

        {(encounter.bridges || []).map((b) => (
          <g key={b.id} className="combat-map-bridge" transform={`translate(${b.x} ${b.y}) rotate(${b.angle})`} style={{ "--bridge-color": typeColor(b.slugType) }}>
            <rect x={0} y={-b.width / 2} width={b.length} height={b.width} rx={18} ry={18} />
          </g>
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
            return isDM || (c.kind === "character" && c.refUserId === viewerUserId);
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
            const hidesAsOwner = c.kind === "decoy" && !isDM && !(viewerCombatant && combatSide(viewerCombatant) === combatSide(c));
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
