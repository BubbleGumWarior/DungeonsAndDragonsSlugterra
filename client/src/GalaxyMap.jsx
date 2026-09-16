import { useEffect, useMemo, useRef, useState } from "react";
import { RocketLaunchIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { CLUSTERS, UNCLAIMED, PLANETS } from "./planetData.js";
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

// A fixed scatter of background stars -- generated once from a tiny seeded
// PRNG so the field is stable across renders (no twinkle-jitter from
// Math.random on every frame).
function starField(count) {
  let seed = 20260909;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: rand() * VIEW_W,
    y: rand() * VIEW_H,
    r: 0.4 + rand() * 1.1,
    o: 0.2 + rand() * 0.6,
  }));
}

// The Threshold isn't a planet -- it's a graveyard of derelict hulls, so it
// renders as a scatter of tumbling wreckage fragments instead of a sphere.
// Generated once from a tiny seeded PRNG so the field is stable across
// renders.
const DEBRIS_SHADES = ["#8a6a52", "#6b5643", "#a98a6e", "#5c5c5c", "#7d7d7d", "#4a4038"];
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
      fill: DEBRIS_SHADES[Math.floor(rand() * DEBRIS_SHADES.length)],
      spark: i % 4 === 0,
    };
  });
}

function planetPos(planet, tSec) {
  const angle = (planet.phaseDeg * Math.PI) / 180 + (tSec / planet.periodSec) * Math.PI * 2;
  return {
    x: planet.orbitRx * Math.cos(angle),
    y: planet.orbitRy * Math.sin(angle),
  };
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
function clusterSlot(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const depth = (Math.sin(rad) + 1) / 2; // 0 = back, 1 = front
  return {
    x: RING_CX + RING_RX * Math.cos(rad),
    y: RING_CY + RING_RY * Math.sin(rad),
    scale: SCALE_BACK + (SCALE_FRONT - SCALE_BACK) * depth,
    opacity: OPACITY_BACK + (1 - OPACITY_BACK) * depth,
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

function ClusterStar({ starType, tSec }) {
  if (starType === "binary") {
    const angle = (tSec / 34) * Math.PI * 2;
    const off = 28;
    return (
      <g className="galaxy-star galaxy-star--binary">
        <circle className="galaxy-star-glow" r={110} fill="url(#galaxy-glow-binary)" />
        <circle cx={off * Math.cos(angle)} cy={off * Math.sin(angle) * 0.55} r={23} fill="url(#galaxy-star-binary)" />
        <circle
          cx={-off * Math.cos(angle)}
          cy={-off * Math.sin(angle) * 0.55}
          r={19}
          fill="url(#galaxy-star-binary)"
        />
      </g>
    );
  }
  if (starType === "black-hole") {
    const spin = (tSec / 20) % 360;
    const discRotate = 18 + spin * 0.05;
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

export default function GalaxyMap({ isDungeonMaster = false }) {
  const { token } = useAuth();
  const { slugHuntArea } = useLiveState();
  const partyFlatIndex = Math.min(Math.max(slugHuntArea ?? 0, 0), PLANETS.length - 1);
  const party = locateFlatIndex(partyFlatIndex);

  const stars = useMemo(() => starField(140), []);
  const debris = useMemo(() => debrisField(UNCLAIMED.worlds[0].sizeR, 11), []);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // Seconds of orbital time elapsed -- drives every planet's (and star's)
  // position, and doubles as the driver for the ring-rotation tween below.
  // Frozen at 0 when the viewer prefers reduced motion.
  const [tSec, setTSec] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  const [focusedCluster, setFocusedCluster] = useState(0);
  const [clusterAngles, setClusterAngles] = useState([FRONT_ANGLE, FRONT_ANGLE + 120, FRONT_ANGLE + 240]);
  const rotationRef = useRef(null); // { start, target, startTs, duration }

  useEffect(() => {
    if (reduceMotion) return undefined;
    function frame(ts) {
      if (startRef.current == null) startRef.current = ts;
      setTSec((ts - startRef.current) / 1000);

      const anim = rotationRef.current;
      if (anim) {
        if (anim.startTs == null) anim.startTs = ts;
        const t = Math.min(1, (ts - anim.startTs) / anim.duration);
        const eased = easeInOutCubic(t);
        setClusterAngles(anim.start.map((a, i) => a + (anim.target[i] - a) * eased));
        if (t >= 1) rotationRef.current = null;
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reduceMotion]);

  function focusCluster(clusterIndex) {
    if (clusterIndex === focusedCluster) return;
    setFocusedCluster(clusterIndex);
    const delta = normalizeDelta(FRONT_ANGLE - clusterAngles[clusterIndex]);
    const target = clusterAngles.map((a) => a + delta);
    if (reduceMotion) {
      setClusterAngles(target);
    } else {
      rotationRef.current = { start: clusterAngles, target, startTs: null, duration: ROTATE_MS };
    }
  }

  // selected is either a flat-planet detail ({ type: "planet", flatIndex })
  // or a cluster-lore detail ({ type: "cluster", clusterIndex }).
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

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
  const thresholdPos = {
    x: RING_CX + 30 * Math.sin(tSec / 43),
    y: 145 + 18 * Math.cos(tSec / 57),
  };
  const thresholdFlatIndex = PLANETS.length - 1;
  const thresholdIsParty = party.clusterIndex === -1;

  const clusterOrder = CLUSTERS.map((_, i) => i).sort(
    (a, b) => clusterSlot(clusterAngles[a]).depth - clusterSlot(clusterAngles[b]).depth
  );

  let selectedDetail = null;
  if (selected?.type === "planet") {
    const p = PLANETS[selected.flatIndex];
    const loc = locateFlatIndex(selected.flatIndex);
    selectedDetail = {
      kicker:
        selected.flatIndex === partyFlatIndex
          ? "Party is here"
          : loc.clusterIndex === -1
          ? "Unclaimed Space"
          : `${CLUSTERS[loc.clusterIndex].name} — world ${loc.worldIndex + 1} of ${CLUSTERS[loc.clusterIndex].worlds.length}`,
      name: p.name,
      color: p.color,
      body: p.blurb,
      canSend: true,
      flatIndex: selected.flatIndex,
    };
  } else if (selected?.type === "cluster") {
    const c = CLUSTERS[selected.clusterIndex];
    selectedDetail = {
      kicker: c.subtitle ? `Orbiting ${c.subtitle}` : "Star system",
      name: c.name,
      color: null,
      body: c.blurb,
      canSend: false,
    };
  }

  return (
    <div className="galaxy-wrap">
      <svg
        className="galaxy-map"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
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
        </defs>

        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#galaxy-space)" />
        {stars.map((s, i) => (
          <circle key={`star-${i}`} cx={s.x} cy={s.y} r={s.r} fill="#cdd6ff" opacity={s.o} />
        ))}

        {/* The Threshold -- unclaimed, drifts on its own, no cluster to belong to */}
        <g
          className={`galaxy-threshold ${thresholdIsParty ? "galaxy-planet--party" : ""} ${
            selected?.type === "planet" && selected.flatIndex === thresholdFlatIndex ? "galaxy-planet--selected" : ""
          }`}
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
          {(thresholdIsParty || (selected?.type === "planet" && selected.flatIndex === thresholdFlatIndex)) && (
            <circle className="galaxy-planet-ring" r={threshold.sizeR + 8} />
          )}
          <circle className="galaxy-planet-hit" r={Math.max(threshold.sizeR + 10, 18)} />
          <g className="galaxy-threshold-debris" transform={`rotate(${(tSec / 45) % 360})`}>
            {debris.map((d, i) => (
              <rect
                key={i}
                className="galaxy-debris-piece"
                x={d.x - d.w / 2}
                y={d.y - d.h / 2}
                width={d.w}
                height={d.h}
                rx={0.6}
                fill={d.fill}
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
          const slot = clusterSlot(clusterAngles[ci]);
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
                  pos: planetPos(p, tSec),
                }));
                const behind = positioned.filter((w) => w.pos.y < 0);
                const front = positioned.filter((w) => w.pos.y >= 0);

                const renderPlanet = ({ p, flatIndex, pos }) => {
                  const isParty = flatIndex === partyFlatIndex;
                  const isSelected = selected?.type === "planet" && selected.flatIndex === flatIndex;
                  return (
                    <g
                      key={p.name}
                      className={`galaxy-planet ${isParty ? "galaxy-planet--party" : ""} ${
                        isSelected ? "galaxy-planet--selected" : ""
                      }`}
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
                      {(isParty || isSelected) && <circle className="galaxy-planet-ring" r={p.sizeR + 8} />}
                      <circle className="galaxy-planet-hit" r={Math.max(p.sizeR + 10, 18)} />
                      <circle className="galaxy-planet-body" r={p.sizeR} style={{ fill: p.color }} />
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
                      <ClusterStar starType={cluster.starType} tSec={tSec} />
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
          const slot = clusterSlot(clusterAngles[ci]);
          const rad = (clusterAngles[ci] * Math.PI) / 180;
          const x = RING_CX + LABEL_SPREAD_X * Math.cos(rad);
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

      {selectedDetail && (
        <div className="galaxy-detail">
          <button
            type="button"
            className="galaxy-detail-close"
            aria-label="Close"
            onClick={() => setSelected(null)}
          >
            <XIcon weight="bold" />
          </button>
          <p className="galaxy-detail-kicker">{selectedDetail.kicker}</p>
          <h2 className="galaxy-detail-name" style={selectedDetail.color ? { color: selectedDetail.color } : undefined}>
            {selectedDetail.name}
          </h2>
          <p className="galaxy-detail-body">{selectedDetail.body}</p>

          {isDungeonMaster && selectedDetail.canSend && (
            <div className="galaxy-detail-actions">
              <button
                type="button"
                className="galaxy-jump-btn"
                disabled={sending || selectedDetail.flatIndex === partyFlatIndex}
                onClick={() => sendPartyHere(selectedDetail.flatIndex)}
              >
                <RocketLaunchIcon weight="bold" />
                {selectedDetail.flatIndex === partyFlatIndex ? "Party already here" : "Send the party here"}
              </button>
              {error && <p className="galaxy-detail-error">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
