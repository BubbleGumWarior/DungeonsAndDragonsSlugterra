import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowsOutIcon, EyeIcon, EyeSlashIcon, RocketLaunchIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { CLUSTERS, UNCLAIMED, PLANETS, planetImageUrl, starImageUrl } from "./planetData.js";
import "./GalaxyMap.css";

const VIEW_W = 1000;
const VIEW_H = 680;

// The three clusters sit on a shared "ring" around a common gravitational
// anchor (the Great Year convergence cycle) -- one slot is front-and-large,
// the other two are small in the background. Clicking a background cluster
// rotates the ring so it swaps to the front.
const RING_CX = 500;
const RING_CY = 300;
const RING_RX = 320;
const RING_RY = 140;
const FRONT_ANGLE = 90; // degrees; front slot sits at the bottom of the ring
const SCALE_FRONT = 1;
const SCALE_BACK = 0.2;
const OPACITY_BACK = 0.3;

// The cluster-name row at the top of the map -- x tracks the same ring angle
// as the cluster itself (so it drifts to center/sides in step with the
// rotation), y stays fixed clear of every planet.
const LABEL_Y = 34;
const LABEL_SPREAD_X = 340;
const LABEL_FONT_FRONT = 26;
const LABEL_FONT_BACK = 9;
const ROTATE_MS = 700;

// The star field is laid out wider than the map itself, so a wide screen can
// reveal more sky on either side of the clusters (the viewBox widens to the
// screen's shape, see the `aspect` prop) without the stars thinning out.
const STAR_X_MIN = -1100;
const STAR_X_MAX = VIEW_W + 1100;

// A fixed scatter of background stars -- generated once from a tiny seeded
// PRNG so the field is stable across renders (no twinkle-jitter from
// Math.random on every frame). Most are faint pinpricks; a few are bright and
// slightly warm or cool.
const STAR_TINTS = ["#cdd6ff", "#cdd6ff", "#cdd6ff", "#ffe9c4", "#e4ecff"];
function starField(count) {
  let seed = 20260909;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const bright = rand() < 0.07;
    return {
      x: STAR_X_MIN + rand() * (STAR_X_MAX - STAR_X_MIN),
      y: rand() * VIEW_H,
      r: bright ? 1.2 + rand() * 0.9 : 0.35 + rand() * 0.9,
      o: bright ? 0.75 + rand() * 0.25 : 0.2 + rand() * 0.6,
      c: STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)],
    };
  });
}

// The Threshold isn't a planet -- it's a graveyard of derelict hulls, so it
// renders as a scatter of tumbling wreckage fragments instead of a sphere.
// Generated once from a tiny seeded PRNG so the field is stable across
// renders.
// Each pair is [lit face, shadowed face] for one hull-fragment tone -- fed to
// a diagonal per-piece gradient (defined once in <defs>) so every chunk of
// debris reads as a small beveled block instead of a flat-colored rectangle.
const DEBRIS_SHADE_PAIRS = [
  ["#c9a988", "#4a3626"],
  ["#9c8268", "#332619"],
  ["#d9c0a3", "#5e4a37"],
  ["#8f8f8f", "#2b2b2b"],
  ["#adadad", "#3d3d3d"],
  ["#736657", "#211c17"],
];
function debrisField(radius, count) {
  let seed = 51423;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * radius * 1.3;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      w: 2.5 + rand() * 6,
      h: 1.5 + rand() * 4,
      rot: rand() * 360,
      shadeIndex: Math.floor(rand() * DEBRIS_SHADE_PAIRS.length),
      spark: i % 4 === 0,
    };
  });
}

// A world's spot on its orbit for a given campaign day. Nothing moves on its
// own: on day 1 a world sits at phaseDeg, and it goes once round every
// `yearDays` days, so a long rest nudges it 360 / yearDays degrees along.
function planetPos(planet, day) {
  const angle = (planet.phaseDeg * Math.PI) / 180 + ((day - 1) / planet.yearDays) * Math.PI * 2;
  return {
    x: planet.orbitRx * Math.cos(angle),
    y: planet.orbitRy * Math.sin(angle),
  };
}

// Where the survey data says "year 3, day 12 of 62" -- how far through its
// current year a world is on a given day.
export function yearProgress(planet, day) {
  if (!planet.yearDays) return null;
  const elapsed = Math.max(0, day - 1);
  return { year: Math.floor(elapsed / planet.yearDays) + 1, dayOfYear: (elapsed % planet.yearDays) + 1 };
}

// Wrap a delta angle to (-180, 180] so a rotation always takes the shorter way round.
function normalizeDelta(deg) {
  let x = deg % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// Where a cluster's angle on the ring places it: position, apparent scale
// (front = big, back = small), and opacity (back slots are dimmed for depth).
function clusterSlot(angleDeg, ringRx = RING_RX, look = {}) {
  const { ringCy = RING_CY, frontScale = SCALE_FRONT, backScale = SCALE_BACK, backOpacity = OPACITY_BACK } = look;
  const rad = (angleDeg * Math.PI) / 180;
  const depth = (Math.sin(rad) + 1) / 2; // 0 = back, 1 = front
  return {
    x: RING_CX + ringRx * Math.cos(rad),
    y: ringCy + RING_RY * Math.sin(rad),
    scale: backScale + (frontScale - backScale) * depth,
    opacity: backOpacity + (1 - backOpacity) * depth,
    depth,
  };
}

// The flat PLANETS index (campaign_settings.slug_hunt_area) split back into
// which cluster it's in and the world's position within that cluster --
// -1 clusterIndex means Unclaimed Space (The Threshold).
function locateFlatIndex(flatIndex) {
  let idx = flatIndex;
  for (let ci = 0; ci < CLUSTERS.length; ci++) {
    if (idx < CLUSTERS[ci].worlds.length) return { clusterIndex: ci, worldIndex: idx };
    idx -= CLUSTERS[ci].worlds.length;
  }
  return { clusterIndex: -1, worldIndex: 0 };
}

// Stars are as still as the worlds: the binary pair and the accretion disc
// only turn as the campaign day does (`clock` is the day, fractional while
// the map is catching up after a rest).
function ClusterStar({ starType, clock }) {
  if (starType === "binary") {
    const angle = (clock / 12) * Math.PI * 2;
    const off = 28;
    const stars = [
      { cx: off * Math.cos(angle), cy: off * Math.sin(angle) * 0.55, r: 23 },
      { cx: -off * Math.cos(angle), cy: -off * Math.sin(angle) * 0.55, r: 19 },
    ].sort((a, b) => a.cy - b.cy); // farther (smaller y) first, nearer (larger y) drawn on top
    return (
      <g className="galaxy-star galaxy-star--binary">
        <circle className="galaxy-star-glow" r={110} fill="url(#galaxy-glow-binary)" />
        {stars.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="url(#galaxy-star-binary)" />
        ))}
      </g>
    );
  }
  if (starType === "black-hole") {
    const discRotate = 18 + (clock % 90) * 0.4;
    const discRx = 80;
    const discRy = 22;
    return (
      <g className="galaxy-star galaxy-star--black-hole">
        <circle className="galaxy-star-glow" r={110} fill="url(#galaxy-glow-blackhole)" />
        {/* Far half of the ring passes behind the event horizon */}
        <path
          className="galaxy-accretion-disc"
          transform={`rotate(${discRotate})`}
          d={`M ${-discRx} 0 A ${discRx} ${discRy} 0 0 0 ${discRx} 0`}
          fill="none"
          stroke="url(#galaxy-disc-grad)"
          strokeWidth={7}
        />
        <circle className="galaxy-blackhole-core" r={28} fill="url(#galaxy-blackhole-core)" />
        {/* Near half of the ring passes in front of the event horizon */}
        <path
          className="galaxy-accretion-disc"
          transform={`rotate(${discRotate})`}
          d={`M ${-discRx} 0 A ${discRx} ${discRy} 0 0 1 ${discRx} 0`}
          fill="none"
          stroke="url(#galaxy-disc-grad)"
          strokeWidth={7}
        />
      </g>
    );
  }
  // red-giant (default)
  return (
    <g className="galaxy-star galaxy-star--red-giant">
      <circle className="galaxy-star-glow" r={150} fill="url(#galaxy-glow-red)" />
      <circle className="galaxy-sun" r={54} fill="url(#galaxy-star-red)" />
    </g>
  );
}

// Illustration at the top of the detail panel; clicking it opens a full-screen
// view. Keyed on src by the caller so a failed load for one world doesn't hide
// the next world's image; a missing file just renders nothing.
function DetailImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (failed) return null;
  return (
    <>
      <button
        type="button"
        className="holo-image-btn"
        aria-label={`View ${alt} full screen`}
        onClick={() => setFullscreen(true)}
      >
        <img className="holo-image" src={src} alt={alt} onError={() => setFailed(true)} />
        <span className="holo-image-hint" aria-hidden="true">
          <ArrowsOutIcon weight="bold" />
        </span>
      </button>
      {fullscreen &&
        createPortal(
          <div
            className="galaxy-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={() => setFullscreen(false)}
          >
            <button
              type="button"
              className="galaxy-lightbox-close"
              aria-label="Close full screen"
              onClick={() => setFullscreen(false)}
            >
              <XIcon weight="bold" />
            </button>
            <img className="galaxy-lightbox-image" src={src} alt={alt} />
            <p className="galaxy-lightbox-caption">{alt}</p>
          </div>,
          document.body
        )}
    </>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A survey value, or ??? while the party has never been there.
function Fact({ label, value }) {
  const unknown = value == null;
  return (
    <div className={`holo-fact ${unknown ? "holo-fact--unknown" : ""}`}>
      <dt>{label}</dt>
      <dd>{unknown ? "???" : value}</dd>
    </div>
  );
}

// The world's dossier: picture, name, survey facts and what the party can do
// about it. Everything the party hasn't surveyed reads ???, but the name and
// the distance stay, since you can still plot a course to a world you haven't seen.
function Dossier({
  detail,
  travel,
  travelBusy,
  travelAct,
  isDungeonMaster,
  partyFlatIndex,
  sendPartyHere,
  sending,
  error,
  onClose,
}) {
  const planet = detail.planet;
  const facts = detail.known ? planet?.facts : null;
  const here = detail.flatIndex === partyFlatIndex;
  const canPropose =
    Boolean(travel) && !travel.traveling && !travel.proposal && Boolean(travel.ship) && travel.navReady && !here;

  let proposeLabel = "Plot a course here";
  if (here) proposeLabel = "The party is here";
  else if (travel?.traveling) proposeLabel = "The ship is under way";
  else if (travel?.proposal) proposeLabel = "A vote is already open";
  else if (!travel?.ship) proposeLabel = "No ship to travel in";
  else if (!travel.navReady) proposeLabel = "The Nav Computer is offline";

  return (
    <aside className="holo-dossier" aria-label={`${detail.name} survey`}>
      <button type="button" className="holo-dossier-close" aria-label="Close" onClick={onClose}>
        <XIcon weight="bold" />
      </button>

      {detail.known ? (
        <DetailImage key={detail.image} src={detail.image} alt={detail.name} />
      ) : (
        <div className="holo-image holo-image--unknown" role="img" aria-label="No survey picture yet">
          <span>???</span>
        </div>
      )}

      <h2 className="holo-dossier-name" style={detail.color && detail.known ? { color: detail.color } : undefined}>
        {detail.name}
      </h2>
      <p className="holo-dossier-where">
        {detail.where ?? "???"}
        {here && " · the party is here"}
      </p>
      {isDungeonMaster && detail.type === "planet" && !detail.playersKnow && (
        <p className="holo-dm-note">Players still see this world as ???.</p>
      )}

      <p className={`holo-dossier-body ${detail.known ? "" : "holo-dossier-body--unknown"}`}>
        {detail.known ? detail.body : "???"}
      </p>

      {detail.type === "planet" && (
        <dl className="holo-facts">
          <Fact
            label="Year"
            value={detail.known ? (planet.yearDays ? `${planet.yearDays} days` : "None, it only drifts") : null}
          />
          <Fact
            label="Today"
            value={
              detail.known
                ? detail.progress
                  ? `Year ${detail.progress.year}, day ${detail.progress.dayOfYear}`
                  : "Adrift"
                : null
            }
          />
          <Fact label="Day length" value={facts ? (facts.dayHours ? `${facts.dayHours} hours` : "None") : null} />
          <Fact label="Temperature" value={facts ? `${facts.temperatureC} °C` : null} />
          <Fact label="Humidity" value={facts ? `${facts.humidityPct}%` : null} />
          <Fact label="Gravity" value={facts ? `${facts.gravityG} g` : null} />
          <Fact label="Atmosphere" value={facts ? facts.atmosphere : null} />
          <Fact label="Moons" value={facts ? facts.moons : null} />
        </dl>
      )}

      {detail.type === "planet" && !here && detail.route && (
        <p className="holo-route">
          {detail.route.distance} units away. <strong>{plural(detail.route.days, "day")}</strong> at speed{" "}
          {travel.ship?.effective ?? "?"}.
        </p>
      )}

      {detail.type === "planet" && (
        <div className="holo-actions">
          <button
            type="button"
            className="holo-btn holo-btn--primary"
            disabled={travelBusy || !canPropose}
            onClick={() => travelAct("propose", { area: detail.flatIndex })}
          >
            <RocketLaunchIcon weight="bold" />
            {proposeLabel}
          </button>

          {isDungeonMaster && (
            <>
              <button
                type="button"
                className="holo-btn"
                disabled={travelBusy || !travel || travel.traveling || !travel.ship || here}
                onClick={() => travelAct("depart", { area: detail.flatIndex })}
              >
                Launch there now, no vote
              </button>
              <button type="button" className="holo-btn" disabled={sending || here} onClick={() => sendPartyHere(detail.flatIndex)}>
                Teleport the party here
              </button>
              {!here && (
                <button
                  type="button"
                  className="holo-btn"
                  disabled={travelBusy}
                  onClick={() => travelAct("visited", { area: detail.flatIndex, visited: !detail.playersKnow })}
                >
                  {detail.playersKnow ? <EyeSlashIcon weight="bold" /> : <EyeIcon weight="bold" />}
                  {detail.playersKnow ? "Hide from players (???)" : "Reveal to players"}
                </button>
              )}
            </>
          )}
          {error && <p className="holo-error">{error}</p>}
        </div>
      )}
    </aside>
  );
}

// The star map itself. `travel` / `travelAct` come from the nav console, which
// owns the one useTravel() subscription for the whole screen.
export default function GalaxyMap({
  travel,
  travelAct,
  travelBusy = false,
  isDungeonMaster = false,
  dossierHost = null,
  aspect = VIEW_W / VIEW_H, // width / height the map is drawn at; wider shows more sky
  look = {}, // { ringCy, frontScale, backScale }: how big and how high the clusters sit
  visibleShare = 1, // how much of the map's width is actually on screen (the rest is cropped)
}) {
  const { token } = useAuth();
  const { slugHuntArea } = useLiveState();
  const partyFlatIndex = Math.min(Math.max(slugHuntArea ?? 0, 0), PLANETS.length - 1);
  const party = locateFlatIndex(partyFlatIndex);
  // The world the ship is flying to, or the one being voted on -- ringed on the map.
  const targetFlatIndex = travel?.traveling ? travel.destination : travel?.proposal?.area ?? null;

  // What the party has surveyed. The DM sees everything (and which worlds the
  // players still see as ???).
  const visited = useMemo(() => new Set(travel?.visited ?? []), [travel?.visited]);
  const clusterFlatBase = (ci) => CLUSTERS.slice(0, ci).reduce((sum, c) => sum + c.worlds.length, 0);
  const isKnown = (flatIndex) => isDungeonMaster || visited.has(flatIndex);
  const isClusterKnown = (ci) =>
    isDungeonMaster || CLUSTERS[ci].worlds.some((_, wi) => visited.has(clusterFlatBase(ci) + wi));

  const stars = useMemo(() => starField(1100), []);
  const debris = useMemo(() => debrisField(UNCLAIMED.worlds[0].sizeR, 11), []);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // The campaign day the map is showing. Worlds only move when the day does:
  // after a long rest it catches up from the old day to the new one over a
  // couple of seconds, so you watch every world sweep along its orbit by
  // exactly one day's worth. Nothing animates between rests.
  const targetDay = travel?.day ?? 1;
  const [clock, setClock] = useState(targetDay);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  useEffect(() => {
    const from = clockRef.current;
    if (reduceMotion || Math.abs(targetDay - from) < 0.001) {
      setClock(targetDay);
      return undefined;
    }
    const duration = Math.min(3200, 1000 + Math.abs(targetDay - from) * 350);
    let raf;
    let startTs = null;
    function frame(ts) {
      if (startTs == null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      setClock(from + (targetDay - from) * easeInOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [targetDay, reduceMotion]);

  const [focusedCluster, setFocusedCluster] = useState(0);
  const [clusterAngles, setClusterAngles] = useState([FRONT_ANGLE, FRONT_ANGLE + 120, FRONT_ANGLE + 240]);
  const rotationRaf = useRef(null);
  useEffect(() => () => cancelAnimationFrame(rotationRaf.current), []);

  // Rotating the ring is the one animation that follows a click.
  function focusCluster(clusterIndex) {
    if (clusterIndex === focusedCluster) return;
    setFocusedCluster(clusterIndex);
    const start = clusterAngles;
    const delta = normalizeDelta(FRONT_ANGLE - start[clusterIndex]);
    const target = start.map((a) => a + delta);
    cancelAnimationFrame(rotationRaf.current);
    if (reduceMotion) {
      setClusterAngles(target);
      return;
    }
    let startTs = null;
    function frame(ts) {
      if (startTs == null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / ROTATE_MS);
      const eased = easeInOutCubic(t);
      setClusterAngles(start.map((a, i) => a + (target[i] - a) * eased));
      if (t < 1) rotationRaf.current = requestAnimationFrame(frame);
    }
    rotationRaf.current = requestAnimationFrame(frame);
  }

  // selected is either a flat-planet detail ({ type: "planet", flatIndex })
  // or a cluster-lore detail ({ type: "cluster", clusterIndex }).
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // The DM's teleport: skips the voyage (and cancels any under way).
  async function sendPartyHere(flatIndex) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/slug-hunt-area", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ area: flatIndex }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not move the party.");
      }
      // The `slug-hunt-area` broadcast updates slugHuntArea for everyone.
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const threshold = UNCLAIMED.worlds[0];
  // The Threshold has no year; it wanders slowly between the clusters.
  // It sits above the front cluster's outer orbits; when the clusters are drawn
  // larger and lifted (`look`), it rides higher so it stays clear of their rings.
  const thresholdBaseY = 150 - (RING_CY - (look.ringCy ?? RING_CY)) * 0.8;
  const thresholdPos = {
    x: RING_CX + 30 * Math.sin((clock * Math.PI * 2) / 120),
    y: thresholdBaseY + 14 * Math.cos((clock * Math.PI * 2) / 170),
  };
  const thresholdFlatIndex = PLANETS.length - 1;
  const thresholdIsParty = party.clusterIndex === -1;

  // On a wide screen the ring opens up: the two background clusters sit out
  // toward the edges instead of crowding the one in front.
  const wideRx = RING_RX + Math.max(0, VIEW_H * aspect - VIEW_W) * 0.4;
  // ...but never past the edge of what is on screen: a background cluster is
  // about 90 units across, so keep its centre that far plus a margin inside.
  const onScreenRx = (VIEW_H * aspect * visibleShare) / 2 - 150;
  const ringRx = Math.max(RING_RX, Math.min(wideRx, onScreenRx));

  const clusterOrder = CLUSTERS.map((_, i) => i).sort(
    (a, b) => clusterSlot(clusterAngles[a], ringRx, look).depth - clusterSlot(clusterAngles[b], ringRx, look).depth
  );

  let selectedDetail = null;
  if (selected?.type === "planet") {
    const p = PLANETS[selected.flatIndex];
    const loc = locateFlatIndex(selected.flatIndex);
    selectedDetail = {
      type: "planet",
      name: p.name,
      color: p.color,
      planet: p,
      known: isKnown(selected.flatIndex),
      playersKnow: visited.has(selected.flatIndex),
      where:
        loc.clusterIndex === -1
          ? "Unclaimed Space"
          : `${CLUSTERS[loc.clusterIndex].name} · world ${loc.worldIndex + 1} of ${CLUSTERS[loc.clusterIndex].worlds.length}`,
      body: p.blurb,
      image: planetImageUrl(p.name),
      progress: yearProgress(p, targetDay),
      flatIndex: selected.flatIndex,
      route: travel?.routes?.find((r) => r.area === selected.flatIndex) ?? null,
    };
  } else if (selected?.type === "cluster") {
    const c = CLUSTERS[selected.clusterIndex];
    selectedDetail = {
      type: "cluster",
      name: c.name,
      color: null,
      known: isClusterKnown(selected.clusterIndex),
      where: c.subtitle ? `Orbiting ${c.subtitle}` : "Star system",
      body: c.blurb,
      image: starImageUrl(c.key),
    };
  }

  // The console gives the dossier a host outside the tilted projection so it
  // stays flat and readable; elsewhere it just sits in the map's own box.
  const dossier = selectedDetail && (
    <Dossier
      detail={selectedDetail}
      travel={travel}
      travelBusy={travelBusy}
      travelAct={travelAct}
      isDungeonMaster={isDungeonMaster}
      partyFlatIndex={partyFlatIndex}
      sendPartyHere={sendPartyHere}
      sending={sending}
      error={error}
      onClose={() => setSelected(null)}
    />
  );

  return (
    <div className="galaxy-wrap">
      <div className="galaxy-stage">
      <svg
        className="galaxy-map"
        viewBox={`${(VIEW_W - VIEW_H * aspect) / 2} 0 ${VIEW_H * aspect} ${VIEW_H}`}
        role="img"
        aria-label="Star map of the Three Clusters"
      >
        <defs>
          <radialGradient id="galaxy-space" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#12131b" />
            <stop offset="100%" stopColor="#07070b" />
          </radialGradient>
          <radialGradient id="galaxy-star-red" cx="42%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#ffd9a0" />
            <stop offset="45%" stopColor="#e8623f" />
            <stop offset="100%" stopColor="#8a2418" />
          </radialGradient>
          <radialGradient id="galaxy-glow-red" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff7a52" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#ff7a52" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ff7a52" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="galaxy-star-binary" cx="42%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#fff8e6" />
            <stop offset="55%" stopColor="#cfe8ff" />
            <stop offset="100%" stopColor="#7fa8d9" />
          </radialGradient>
          <radialGradient id="galaxy-glow-binary" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#dfeeff" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#9fc2ea" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#9fc2ea" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="galaxy-glow-blackhole" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c07bff" stopOpacity="0.3" />
            <stop offset="55%" stopColor="#6a3fae" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#6a3fae" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="galaxy-blackhole-core" cx="42%" cy="38%" r="68%">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="50%" stopColor="#020103" />
            <stop offset="78%" stopColor="#2a1140" />
            <stop offset="100%" stopColor="#4a1f70" />
          </radialGradient>
          <linearGradient id="galaxy-disc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffb35c" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffb35c" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#c07bff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#c07bff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="galaxy-planet-shade" cx="35%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
          </radialGradient>
          {DEBRIS_SHADE_PAIRS.map(([lit, shadow], i) => (
            <linearGradient key={i} id={`galaxy-debris-shade-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={lit} />
              <stop offset="100%" stopColor={shadow} />
            </linearGradient>
          ))}
        </defs>

        {stars.map((s, i) => (
          <circle key={`star-${i}`} cx={s.x} cy={s.y} r={s.r} fill={s.c} opacity={s.o} />
        ))}

        {/* The Threshold -- unclaimed, drifts on its own, no cluster to belong to */}
        <g
          className={`galaxy-threshold ${thresholdIsParty ? "galaxy-planet--party" : ""} ${
            targetFlatIndex === thresholdFlatIndex ? "galaxy-planet--target" : ""
          } ${selected?.type === "planet" && selected.flatIndex === thresholdFlatIndex ? "galaxy-planet--selected" : ""}`}
          transform={`translate(${thresholdPos.x} ${thresholdPos.y})`}
          onClick={() => setSelected({ type: "planet", flatIndex: thresholdFlatIndex })}
          tabIndex={0}
          role="button"
          aria-label={threshold.name}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelected({ type: "planet", flatIndex: thresholdFlatIndex });
            }
          }}
        >
          {(thresholdIsParty ||
            targetFlatIndex === thresholdFlatIndex ||
            (selected?.type === "planet" && selected.flatIndex === thresholdFlatIndex)) && (
            <circle className="galaxy-planet-ring" r={threshold.sizeR + 8} />
          )}
          <circle className="galaxy-planet-hit" r={Math.max(threshold.sizeR + 10, 18)} />
          <g className="galaxy-threshold-debris" transform={`rotate(${(clock * 3) % 360})`}>
            {debris.map((d, i) => (
              <rect
                key={i}
                className="galaxy-debris-piece"
                x={d.x - d.w / 2}
                y={d.y - d.h / 2}
                width={d.w}
                height={d.h}
                rx={0.6}
                fill={`url(#galaxy-debris-shade-${d.shadeIndex})`}
                transform={`rotate(${d.rot} ${d.x} ${d.y})`}
              />
            ))}
            {debris
              .filter((d) => d.spark)
              .map((d, i) => (
                <circle key={`spark-${i}`} className="galaxy-debris-spark" cx={d.x} cy={d.y} r={0.9} />
              ))}
          </g>
          {thresholdIsParty && (
            <g className="galaxy-party-marker" transform={`translate(0 ${-(threshold.sizeR + 16)})`}>
              <path d="M 0 -7 L 6 7 L 0 3 L -6 7 Z" />
            </g>
          )}
          <text className="galaxy-planet-label galaxy-threshold-label" y={threshold.sizeR + 18}>
            {threshold.name}
          </text>
        </g>

        {/* The three clusters, drawn back-to-front so the focused one is on top */}
        {clusterOrder.map((ci) => {
          const cluster = CLUSTERS[ci];
          const slot = clusterSlot(clusterAngles[ci], ringRx, look);
          const isFocused = ci === focusedCluster;
          return (
            <g
              key={cluster.key}
              className={`galaxy-cluster ${isFocused ? "galaxy-cluster--focused" : "galaxy-cluster--back"}`}
              transform={`translate(${slot.x} ${slot.y}) scale(${slot.scale})`}
              style={{ opacity: slot.opacity }}
              onClick={
                isFocused
                  ? undefined
                  : (e) => {
                      e.currentTarget.blur();
                      focusCluster(ci);
                    }
              }
              tabIndex={isFocused ? -1 : 0}
              role={isFocused ? undefined : "button"}
              aria-label={isFocused ? undefined : `Bring ${cluster.name} to the front`}
              onKeyDown={
                isFocused
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        focusCluster(ci);
                      }
                    }
              }
            >
              {cluster.worlds.map((p) => (
                <ellipse
                  key={`orbit-${p.name}`}
                  className={`galaxy-orbit ${isFocused ? "" : "galaxy-orbit--hidden"}`}
                  cx={0}
                  cy={0}
                  rx={p.orbitRx}
                  ry={p.orbitRy}
                />
              ))}

              {(() => {
                // Split each planet by whether it's currently on the far
                // (upper) half of its orbit -- those render behind the star,
                // everything on the near (lower) half renders in front of it.
                const clusterFlatBase = CLUSTERS.slice(0, ci).reduce((sum, c) => sum + c.worlds.length, 0);
                const positioned = cluster.worlds.map((p, wi) => ({
                  p,
                  flatIndex: clusterFlatBase + wi,
                  pos: planetPos(p, clock),
                }));
                const behind = positioned.filter((w) => w.pos.y < 0);
                const front = positioned.filter((w) => w.pos.y >= 0);

                const renderPlanet = ({ p, flatIndex, pos }) => {
                  const isParty = flatIndex === partyFlatIndex;
                  const isTarget = flatIndex === targetFlatIndex;
                  const isSelected = selected?.type === "planet" && selected.flatIndex === flatIndex;
                  const surveyed = visited.has(flatIndex);
                  return (
                    <g
                      key={p.name}
                      className={`galaxy-planet ${isParty ? "galaxy-planet--party" : ""} ${
                        isTarget ? "galaxy-planet--target" : ""
                      } ${isSelected ? "galaxy-planet--selected" : ""} ${surveyed ? "" : "galaxy-planet--unsurveyed"}`}
                      transform={`translate(${pos.x} ${pos.y})`}
                      onClick={
                        isFocused
                          ? (e) => {
                              e.stopPropagation();
                              setSelected({ type: "planet", flatIndex });
                            }
                          : undefined
                      }
                      tabIndex={isFocused ? 0 : -1}
                      role={isFocused ? "button" : undefined}
                      aria-label={p.name}
                      onKeyDown={
                        isFocused
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelected({ type: "planet", flatIndex });
                              }
                            }
                          : undefined
                      }
                    >
                      {(isParty || isSelected || isTarget) && <circle className="galaxy-planet-ring" r={p.sizeR + 8} />}
                      <circle className="galaxy-planet-hit" r={Math.max(p.sizeR + 10, 18)} />
                      <circle className="galaxy-planet-body" r={p.sizeR} style={surveyed ? { fill: p.color } : undefined} />
                      <circle
                        className="galaxy-planet-shade"
                        r={p.sizeR}
                        style={{ fill: "url(#galaxy-planet-shade)" }}
                      />
                      {isParty && (
                        <g className="galaxy-party-marker" transform={`translate(0 ${-(p.sizeR + 16)})`}>
                          <path d="M 0 -7 L 6 7 L 0 3 L -6 7 Z" />
                        </g>
                      )}
                      <text className="galaxy-planet-label" y={p.sizeR + 20}>
                        {p.name}
                      </text>
                    </g>
                  );
                };

                return (
                  <>
                    {behind.map(renderPlanet)}
                    <g
                      className="galaxy-cluster-star-hit"
                      onClick={
                        isFocused
                          ? (e) => {
                              e.stopPropagation();
                              setSelected({ type: "cluster", clusterIndex: ci });
                            }
                          : undefined
                      }
                    >
                      <ClusterStar starType={cluster.starType} clock={clock} />
                    </g>
                    {front.map(renderPlanet)}
                  </>
                );
              })()}
            </g>
          );
        })}

        {/* Cluster names live in one row at the very top, clear of every
            planet, and follow the same ring-rotation tween as the clusters
            themselves -- the focused one drifts to center and grows, the
            other two settle to the sides and shrink. */}
        {CLUSTERS.map((cluster, ci) => {
          const slot = clusterSlot(clusterAngles[ci], ringRx, look);
          const rad = (clusterAngles[ci] * Math.PI) / 180;
          const x = RING_CX + (ringRx + (LABEL_SPREAD_X - RING_RX)) * Math.cos(rad);
          const fontSize = LABEL_FONT_BACK + (LABEL_FONT_FRONT - LABEL_FONT_BACK) * slot.depth;
          const isFocused = ci === focusedCluster;
          return (
            <text
              key={cluster.key}
              className={`galaxy-cluster-label ${isFocused ? "galaxy-cluster-label--focused" : "galaxy-cluster-label--back"}`}
              x={x}
              y={LABEL_Y}
              style={{ fontSize, opacity: slot.opacity }}
              onClick={isFocused ? undefined : () => focusCluster(ci)}
              tabIndex={isFocused ? -1 : 0}
              role={isFocused ? undefined : "button"}
              aria-label={isFocused ? undefined : `Bring ${cluster.name} to the front`}
              onKeyDown={
                isFocused
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        focusCluster(ci);
                      }
                    }
              }
            >
              {cluster.name}
            </text>
          );
        })}
      </svg>

        {dossier && (dossierHost ? createPortal(dossier, dossierHost) : dossier)}
      </div>
    </div>
  );
}
