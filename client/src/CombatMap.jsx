import { useEffect, useRef, useState } from "react";
import { UploadSimpleIcon, ArrowsOutCardinalIcon, XIcon } from "@phosphor-icons/react";
import { typeColor } from "./slugData.js";
import { useAuth } from "./AuthContext.jsx";
import { volumeToGain } from "./soundVolume.js";
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
};
function playCombatSfx(name, sliderVolume) {
  const src = COMBAT_SFX[name];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = volumeToGain(sliderVolume);
  audio.play().catch(() => {});
}

// The DM's map image is stored at whatever resolution it was uploaded --
// this caps it before it ever reaches the server, so a phone photo doesn't
// balloon the encounters table (and every websocket broadcast of it).
const MAP_IMAGE_MAX_DIMENSION = 2200;
const MAP_IMAGE_QUALITY = 0.85;

function downscaleImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const scale = Math.min(1, MAP_IMAGE_MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", MAP_IMAGE_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

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

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

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
const SLOW_PHASE_DISTANCE_FRACTION = 0.2;
// A pure linear ramp starts at zero velocity, so for the first several
// frames the bolt barely clears the attacker's own token -- reads as "the
// sound is playing but nothing is flying yet." Instead it pops this far out
// the instant the leg starts, then eases through the rest of the slow phase,
// so the launch is visibly simultaneous with the sound.
const LAUNCH_KICK_FRACTION = 0.08;

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
function phasedFraction(elapsedMs, legMs) {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= legMs) return 1;
  const slowMs = Math.min(SLOW_PHASE_MS, legMs);
  const fastMs = legMs - slowMs;
  if (fastMs <= 0) return elapsedMs / legMs;
  if (elapsedMs <= slowMs) {
    const t = elapsedMs / slowMs;
    return LAUNCH_KICK_FRACTION + t * (SLOW_PHASE_DISTANCE_FRACTION - LAUNCH_KICK_FRACTION);
  }
  const fastElapsed = elapsedMs - slowMs;
  return SLOW_PHASE_DISTANCE_FRACTION + (1 - SLOW_PHASE_DISTANCE_FRACTION) * (fastElapsed / fastMs);
}

function ShotEffect({ fx, onDone }) {
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

  const isJam = fx.outcome === "jam";
  const totalMs = Math.max(400, (fx.windowMs || SHOT_FLIGHT_MS) * SHOT_FLIGHT_MULTIPLIER);

  // Freeze the reveal state the first frame the outcome is known (for an
  // ordinary, uncontested shot -- a jam is self-contained, and a countered
  // shot has its own choreography).
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

  if (isJam) {
    const opacity = Math.max(0, 1 - elapsed / lifetimeMs);
    return (
      <circle
        className="shot-fx-spark"
        cx={fx.attackerPos.x}
        cy={fx.attackerPos.y}
        r={10 + (elapsed / lifetimeMs) * 10}
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
      return <circle className="shot-fx-bolt shot-fx-bolt--chain" cx={pos.x} cy={pos.y} r={5} style={{ "--fx-color": chainColor }} />;
    }
    return (
      <circle
        className="shot-fx-burst shot-fx-burst--hit"
        cx={fx.impactPoint.x}
        cy={fx.impactPoint.y}
        r={MISS_BURST_RADIUS + 4}
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
    if (!fx.outcome) {
      // The resolve update hasn't landed yet -- ride the phased curve to the
      // last known impact point and hold there (phasedFraction saturates at
      // 1 past totalMs). Never guess a burst here: a miss's real, deflected
      // landing spot isn't known until that update arrives, and bursting on
      // this stale point is exactly what used to show an explosion at the
      // target on a shot that really missed. See stillWaiting below.
      boltPos = lerp(fx.attackerPos, fx.impactPoint, phasedFraction(elapsed, totalMs));
    } else if (skidMode && elapsed < burstAt) {
      // The outcome arrived too late for the bolt to reach the real impact
      // point on its normal curve -- skid it there from wherever it had
      // stopped, ease-out, then burst on arrival.
      const t = Math.min(1, (elapsed - revealElapsed) / settleMs);
      boltPos = lerp(settleFrom, fx.impactPoint, 1 - Math.pow(1 - t, 3));
    } else if (elapsed < burstAt) {
      boltPos = lerp(fx.attackerPos, fx.impactPoint, phasedFraction(elapsed, totalMs));
    } else {
      bursts.push({ pos: fx.impactPoint, color, kind: fx.outcome, opacity: fadeAfter(burstAt), aoe: fx.aoe, growAt: burstAt });
    }
    if (boltPos) {
      lastBoltPosRef.current = boltPos;
      bolts.push({ pos: boltPos, color });
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
    const shotPosAtCounter = lerp(fx.attackerPos, fx.impactPoint, phasedFraction(counterAtMs, totalMs));
    if (elapsed < clashAt) {
      if (elapsed < counterAtMs) {
        bolts.push({ pos: lerp(fx.attackerPos, fx.impactPoint, phasedFraction(elapsed, totalMs)), color });
      } else {
        // Linear from each bolt's position when the counter fired -- both are
        // up to speed by now, no slow launch-out to reproduce.
        const t = (elapsed - counterAtMs) / Math.max(1, clashAt - counterAtMs);
        bolts.push({ pos: lerp(shotPosAtCounter, mid, t), color });
        bolts.push({ pos: lerp(fx.targetPos, mid, t), color: counterColor });
      }
    } else {
      bursts.push({ pos: mid, kind: "clash", opacity: fadeAfter(clashAt), color, mixColor: counterColor });
      if (fx.outcome === "attacker-wins") {
        const aftermathElapsed = elapsed - clashAt;
        if (aftermathElapsed < aftermathMs) {
          // Linear, not phasedFraction -- a post-clash continuation is
          // already up to speed, no slow launch-out to reproduce.
          bolts.push({ pos: lerp(mid, fx.impactPoint, aftermathElapsed / aftermathMs), color });
        } else {
          bursts.push({
            pos: fx.impactPoint,
            color,
            kind: "hit",
            opacity: fadeAfter(clashAt + aftermathMs),
            aoe: fx.aoe,
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
            growAt: clashAt + aftermathMs,
          });
        }
      }
    }
  }

  return (
    <>
      {bolts.map((b, i) => (
        <circle key={`bolt-${i}`} className="shot-fx-bolt" cx={b.pos.x} cy={b.pos.y} r={7} style={{ "--fx-color": b.color }} />
      ))}
      {bursts.map((b, i) =>
        b.kind === "clash" ? (
          // Two overlapping, screen-blended circles (one per slug's type
          // color) instead of one flat tone -- reads as the two colors
          // actually fusing in the explosion, not an arbitrary third color.
          // `isolation: isolate` keeps the blending contained to this pair,
          // not the whole map.
          <g key={`burst-${i}`} className="shot-fx-clash" style={{ opacity: b.opacity }}>
            <circle className="shot-fx-burst shot-fx-burst--clash" cx={b.pos.x} cy={b.pos.y} r={20} style={{ "--fx-color": b.color }} />
            <circle className="shot-fx-burst shot-fx-burst--clash" cx={b.pos.x} cy={b.pos.y} r={20} style={{ "--fx-color": b.mixColor }} />
          </g>
        ) : (
          <circle
            key={`burst-${i}`}
            className={`shot-fx-burst shot-fx-burst--${b.kind} ${b.aoe ? "shot-fx-burst--aoe" : ""}`}
            cx={b.pos.x}
            cy={b.pos.y}
            r={
              b.aoe
                ? AOE_BURST_RADIUS * burstGrowScale(elapsed, b.growAt)
                : b.kind === "hit"
                  ? HIT_BURST_RADIUS
                  : MISS_BURST_RADIUS
            }
            style={{ "--fx-color": b.color, opacity: b.opacity }}
          />
        )
      )}
    </>
  );
}

function mapPoint(svgEl, evt, mapWidth, mapHeight) {
  const rect = svgEl.getBoundingClientRect();
  const scaleX = mapWidth / rect.width;
  const scaleY = mapHeight / rect.height;
  return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
}

function gritColor(fraction) {
  const hue = Math.max(0, Math.min(1, fraction)) * 120;
  return `hsl(${hue}, 72%, 46%)`;
}

function tokenRadius(kind) {
  return kind === "mecha" ? 24 : 16;
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
  if (statusEffects.stunned) badges.push({ key: "stun", label: "Stunned" });
  if (statusEffects.blinded) badges.push({ key: "blind", label: "Blinded" });
  if (statusEffects.confused) badges.push({ key: "confused", label: "Confused -- shots may fire wildly off target" });
  return badges;
}

function Token({ combatant, isActive, isSelected, isActing, draggable, pos, onMouseDown, dimmed }) {
  const r = tokenRadius(combatant.kind);
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
      className={`combat-token combat-token--${combatant.kind} ${downed ? "combat-token--down" : ""} ${isActing ? "combat-token--acting" : ""} ${draggable ? "combat-token--draggable" : ""} ${dimmed ? "combat-token--invisible" : ""}`}
      transform={`translate(${pos.x}, ${pos.y})`}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown?.(combatant, e);
      }}
    >
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
      <text className="combat-token-label" y={r + 16}>
        {combatant.name}
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
  onAddWall,
  onRemoveWall,
  onBackgroundClick,
  onTokenClick,
  activeCombatantId,
  actingCombatantId,
  rangeRing,
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

  // DM-only battle-map background: upload, pan ("move" mode drags the
  // background instead of drawing/selecting), and zoom.
  const [mapEditMode, setMapEditMode] = useState(false);
  const [mapDrag, setMapDrag] = useState(null); // {startClientX, startClientY, startOffsetX, startOffsetY, offsetX, offsetY, moved}
  const [zoomDraft, setZoomDraft] = useState(null); // live slider value while dragging, committed on release
  const [mapUploadError, setMapUploadError] = useState(null);
  const [mapImgSize, setMapImgSize] = useState(null); // natural {w,h} of the loaded map image

  const mapImage = encounter.mapImage;
  const mapScale = encounter.mapImageScale ?? 1;
  const mapOffsetX = encounter.mapImageOffsetX ?? 0;
  const mapOffsetY = encounter.mapImageOffsetY ?? 0;

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
    if (shotFx.outcome === "jam") {
      setMisfireFlash(true);
      setTimeout(() => setMisfireFlash(false), 3000);
      // The shot completely failed -- nothing left the barrel. No launch
      // sound (nothing flew); the misfire gets its own sound instead.
      playCombatSfx("fail", sfxVolume("fail"));
    } else if (shotFx.pod) {
      // A Pressure Tick steam pod going off -- its own sound, not a slug
      // launch (nothing was fired from a blaster).
      playCombatSfx("geyser", sfxVolume("geyser"));
    } else {
      // The slug actually left the blaster -- play the launch sound. Not on
      // a jam/misfire, since then it never went anywhere.
      playShotSound(soundVolume);
      // Zeus flies as a blur -- its own thunderclap follows once the launch
      // sound has run its course.
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

  function removeShot(id) {
    setActiveShots((prev) => prev.filter((s) => s.id !== id));
    shotFlightMeta.current.delete(id);
  }

  const mapWidth = encounter.mapWidth;
  const mapHeight = encounter.mapHeight;
  const dragLocked = drawMode || mapEditMode;

  // Cover-fit the uploaded image to the map (like CSS background-size:
  // cover), then layer the DM's own zoom multiplier and pan offset on top.
  const mapCoverScale = mapImgSize ? Math.max(mapWidth / mapImgSize.w, mapHeight / mapImgSize.h) : 1;
  const effectiveMapScale = zoomDraft ?? mapScale;
  const effectiveOffsetX = mapDrag ? mapDrag.offsetX : mapOffsetX;
  const effectiveOffsetY = mapDrag ? mapDrag.offsetY : mapOffsetY;
  const mapDisplayScale = mapCoverScale * effectiveMapScale;
  const mapDisplayW = mapImgSize ? mapImgSize.w * mapDisplayScale : mapWidth;
  const mapDisplayH = mapImgSize ? mapImgSize.h * mapDisplayScale : mapHeight;
  const mapImgX = mapWidth / 2 - mapDisplayW / 2 + effectiveOffsetX;
  const mapImgY = mapHeight / 2 - mapDisplayH / 2 + effectiveOffsetY;

  function handleBackgroundMouseDown(e) {
    if (mapEditMode) {
      setMapDrag({
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: mapOffsetX,
        startOffsetY: mapOffsetY,
        offsetX: mapOffsetX,
        offsetY: mapOffsetY,
        moved: false,
      });
      return;
    }
    if (!drawMode) return;
    const pt = mapPoint(svgRef.current, e, mapWidth, mapHeight);
    setDrawing({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  }

  function handleTokenMouseDown(combatant, e) {
    if (mapEditMode) return;
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
    if (mapDrag) {
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = mapWidth / rect.width;
      const scaleY = mapHeight / rect.height;
      const dx = (e.clientX - mapDrag.startClientX) * scaleX;
      const dy = (e.clientY - mapDrag.startClientY) * scaleY;
      setMapDrag((prev) =>
        prev ? { ...prev, offsetX: prev.startOffsetX + dx, offsetY: prev.startOffsetY + dy, moved: true } : prev
      );
      return;
    }
    if (drawing) {
      const pt = mapPoint(svgRef.current, e, mapWidth, mapHeight);
      setDrawing((prev) => (prev ? { ...prev, x2: pt.x, y2: pt.y } : prev));
      return;
    }
    if (drag) {
      const screenDist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      const pt = mapPoint(svgRef.current, e, mapWidth, mapHeight);
      setDrag((prev) => (prev ? { ...prev, x: pt.x, y: pt.y, moved: prev.moved || screenDist > DRAG_THRESHOLD } : prev));
    }
  }

  function handleMouseUp() {
    if (mapDrag) {
      if (mapDrag.moved) onMapUpdate?.({ offsetX: mapDrag.offsetX, offsetY: mapDrag.offsetY });
      setMapDrag(null);
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
        onTokenDragEnd?.(drag.combatant, { x: drag.x, y: drag.y });
      } else {
        onTokenClick?.(drag.combatant);
      }
      setDrag(null);
    }
  }

  function handleBackgroundClick(e) {
    if (drawMode || drag || mapEditMode) return;
    const pt = mapPoint(svgRef.current, e, mapWidth, mapHeight);
    onBackgroundClick?.(pt);
  }

  const dragDist = drag ? Math.hypot(drag.x - drag.originX, drag.y - drag.originY) : 0;
  const dragApCost = drag && showDragApCost ? estimateApCost?.(drag.combatant, dragDist) : null;

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

  function handleZoomInput(e) {
    setZoomDraft(Number(e.target.value));
  }

  function commitZoom(e) {
    onMapUpdate?.({ scale: Number(e.target.value) });
    setZoomDraft(null);
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
        className={`combat-map ${drawMode ? "combat-map--drawing" : ""} ${mapEditMode ? "combat-map--map-edit" : ""}`}
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setDrawing(null);
          setDrag(null);
          setMapDrag(null);
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
          />
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
                  <text className="combat-map-pod-counter" x={pod.x} y={pod.y - 16}>
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

        {rangeRing && (
          <circle className="combat-map-range-ring" cx={rangeRing.x} cy={rangeRing.y} r={rangeRing.r} />
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
              <text x={(drag.originX + drag.x) / 2} y={(drag.originY + drag.y) / 2 - 10}>
                {dragApCost} AP
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
            if (!c.statusEffects?.invisible) return true;
            return isDM || (c.kind === "character" && c.refUserId === viewerUserId);
          })
          .map((c) => (
            <Token
              key={c.id}
              combatant={c}
              pos={drag && drag.combatant.id === c.id ? { x: drag.x, y: drag.y } : { x: c.x, y: c.y }}
              isActive={c.id === activeCombatantId}
              isActing={c.id === actingCombatantId}
              draggable={!dragLocked && Boolean(isDraggable?.(c))}
              onMouseDown={handleTokenMouseDown}
              dimmed={Boolean(c.statusEffects?.invisible)}
            />
          ))}

        {activeShots.map((fx) => (
          <ShotEffect key={fx.id} fx={fx} onDone={() => removeShot(fx.id)} />
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
            {mapImage && (
              <>
                <button
                  type="button"
                  className={`combat-map-toolbar-btn ${mapEditMode ? "combat-map-toolbar-btn--on" : ""}`}
                  onClick={() => setMapEditMode((v) => !v)}
                >
                  <ArrowsOutCardinalIcon weight="bold" />
                  {mapEditMode ? "Done" : "Move / Zoom"}
                </button>
                {mapEditMode && (
                  <label className="combat-map-toolbar-zoom">
                    Zoom
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="0.02"
                      value={effectiveMapScale}
                      onInput={handleZoomInput}
                      onChange={commitZoom}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="combat-map-toolbar-btn combat-map-toolbar-btn--danger"
                  onClick={() => {
                    setMapEditMode(false);
                    onMapUpdate?.({ image: null });
                  }}
                >
                  <XIcon weight="bold" />
                  Remove
                </button>
              </>
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

      {mapEditMode && <p className="combat-map-hint">Drag the map to reposition it. Use the slider to zoom.</p>}
      {!mapEditMode && drawMode && <p className="combat-map-hint">Drag to draw a wall. Right-click a wall to erase it.</p>}
    </div>
  );
}
