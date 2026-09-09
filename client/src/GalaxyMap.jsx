import { useEffect, useMemo, useRef, useState } from "react";
import { RocketLaunchIcon, XIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { useLiveState } from "./AccessSocket.jsx";
import { PLANETS } from "./planetData.js";
import "./GalaxyMap.css";

const VIEW_W = 1000;
const VIEW_H = 680;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

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

function planetPos(planet, tSec) {
  const angle = (planet.phaseDeg * Math.PI) / 180 + (tSec / planet.periodSec) * Math.PI * 2;
  return {
    x: CX + planet.orbitRx * Math.cos(angle),
    y: CY + planet.orbitRy * Math.sin(angle),
  };
}

export default function GalaxyMap({ isDungeonMaster = false }) {
  const { token } = useAuth();
  const { slugHuntArea } = useLiveState();
  const partyIndex = Math.min(Math.max(slugHuntArea ?? 0, 0), PLANETS.length - 1);

  const stars = useMemo(() => starField(140), []);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // Seconds of orbital time elapsed -- drives every planet's position. Frozen
  // at 0 when the viewer prefers reduced motion (planets render static at
  // their phase angle).
  const [tSec, setTSec] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  useEffect(() => {
    if (reduceMotion) return undefined;
    function frame(ts) {
      if (startRef.current == null) startRef.current = ts;
      setTSec((ts - startRef.current) / 1000);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reduceMotion]);

  const [selected, setSelected] = useState(null); // planet index or null
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const positions = PLANETS.map((p) => planetPos(p, tSec));

  async function sendPartyHere(index) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/slug-hunt-area", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ area: index }),
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

  const selectedPlanet = selected != null ? PLANETS[selected] : null;

  return (
    <div className="galaxy-wrap">
      <svg
        className="galaxy-map"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Star map of the Slugterra system"
      >
        <defs>
          <radialGradient id="galaxy-space" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#12131b" />
            <stop offset="100%" stopColor="#07070b" />
          </radialGradient>
          <radialGradient id="galaxy-sun" cx="42%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#fff3d0" />
            <stop offset="45%" stopColor="#f2b24d" />
            <stop offset="100%" stopColor="#d97a2b" />
          </radialGradient>
          <radialGradient id="galaxy-sun-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffcf7a" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#f2a04a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f2a04a" stopOpacity="0" />
          </radialGradient>
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

        {/* Orbit rings -- the "ovals around the sun" */}
        {PLANETS.map((p) => (
          <ellipse
            key={`orbit-${p.name}`}
            className="galaxy-orbit"
            cx={CX}
            cy={CY}
            rx={p.orbitRx}
            ry={p.orbitRy}
          />
        ))}

        {/* Sun */}
        <circle className="galaxy-sun-glow" cx={CX} cy={CY} r={130} fill="url(#galaxy-sun-glow)" />
        <circle className="galaxy-sun" cx={CX} cy={CY} r={46} fill="url(#galaxy-sun)" />

        {/* Planets */}
        {PLANETS.map((p, i) => {
          const pos = positions[i];
          const isParty = i === partyIndex;
          const isSelected = i === selected;
          return (
            <g
              key={p.name}
              className={`galaxy-planet ${isParty ? "galaxy-planet--party" : ""} ${
                isSelected ? "galaxy-planet--selected" : ""
              }`}
              transform={`translate(${pos.x} ${pos.y})`}
              onClick={() => setSelected(i)}
              tabIndex={0}
              role="button"
              aria-label={p.name}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
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
        })}
      </svg>

      {selectedPlanet && (
        <div className="galaxy-detail">
          <button
            type="button"
            className="galaxy-detail-close"
            aria-label="Close"
            onClick={() => setSelected(null)}
          >
            <XIcon weight="bold" />
          </button>
          <p className="galaxy-detail-kicker">
            {selected === partyIndex ? "Party is here" : `World ${selected + 1} of ${PLANETS.length}`}
          </p>
          <h2 className="galaxy-detail-name" style={{ color: selectedPlanet.color }}>
            {selectedPlanet.name}
          </h2>
          <p className="galaxy-detail-body">{selectedPlanet.blurb}</p>

          {isDungeonMaster && (
            <div className="galaxy-detail-actions">
              <button
                type="button"
                className="galaxy-jump-btn"
                disabled={sending || selected === partyIndex}
                onClick={() => sendPartyHere(selected)}
              >
                <RocketLaunchIcon weight="bold" />
                {selected === partyIndex ? "Party already here" : "Send the party here"}
              </button>
              {error && <p className="galaxy-detail-error">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
