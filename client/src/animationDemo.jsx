// TEMPORARY demo page (see ../animation-demo.html): fires the real ShotEffect from CombatMap.jsx
// with mock tokens so each custom slug animation can be watched without a server or a fight.
// Flight times use the same formulas as server/src/combatRules.js (shotFlightMs / shotCruiseMs).
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ShotEffect } from "./CombatMap.jsx";
import HazardPatch from "./HazardPatch.jsx";
import { diffWalls, WallBreakFx, WallFormFx, BridgePiece, WALL_BREAK_FX_MS } from "./TerrainFx.jsx";
import { typeColor } from "./slugData.js";

const MAP = { w: 1600, h: 700 };
const SPEED = 88; // default blaster speed, map units per second
const WINDUP_MS = 830;
const CRUISE_MULT = 2;
const VS = 1.4; // marker scale, like the real map's markerScale

const SLINGER = { id: 1, name: "Slinger", x: 130, y: 350, color: "#5fc78a" };
const FOES = [
  { id: 2, name: "A", x: 720, y: 350 },
  { id: 3, name: "B", x: 1050, y: 140 },
  { id: 4, name: "C", x: 1330, y: 520 },
  { id: 5, name: "D", x: 880, y: 590 },
];

const SLUGS = {
  Helixel: { type: "Unique", note: "DNA double helix", flags: { helix: true } },
  Trackjaw: { type: "Unique", note: "stalks, then pounces + claws", flags: { pounce: true } },
  Chronix: { type: "Energy", note: "vanishes, time freezes, reappears", flags: { timeSkip: true } },
  Zeus: { type: "Electricity", note: "lightning bolt (ultra-fast), then its chain arc to B", ultra: true, arc: true, flags: { lightning: true } },
  Tazerling: { type: "Electricity", note: "a plain Electricity bolt, then its chain arc to B -- also lightning now", arc: true, flags: {} },
  Speedstinger: { type: "Metal", note: "steel streak, 3 bounces, NO windup after the first", ricochet: true, flags: { ricochet: true } },
  "Speedstinger (old)": { type: "Metal", note: "old behaviour: windup again on every bounce", ricochet: true, old: true, flags: { ricochet: true } },
  "Standard bolt": { type: "Fire", note: "for comparison", flags: {} },
  "Bladier (through a wall)": { type: "Metal", note: "a wall is in its path: the bolt throws a small knife that cuts the wall open before the bolt passes through", dagger: true, wall: true, flags: { dagger: true } },
  "Bladier (no wall)": { type: "Metal", note: "no wall in the way: nothing is thrown, just the ordinary Metal bolt", dagger: true, flags: { dagger: true } },
};

// A standard bolt of each element (no custom animation), for the per-element effects.
const ELEMENTS = ["Fire", "Water", "Ice", "Plant", "Earth", "Air", "Electricity", "Energy", "Light", "Dark", "Metal", "Healing", "Psychic", "Toxic", "Unique", "None"];
for (const t of ELEMENTS) SLUGS[`el:${t}`] = { type: t, note: `a standard ${t} bolt`, flags: {} };

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// Same maths as the server's daggerThrowPlan.
function knifePlan(pierceT, pathLength, windup) {
  const throwT = Math.min(pierceT, Math.max(windup, pierceT - 110 / pathLength));
  return { throwT, landT: throwT + (pierceT - throwT) / 3 };
}

// Same maths as the server: a first leg has the windup crawl then the cruise; a ricochet leg is pure cruise.
function flightMs(d, { ultra = false, noWindup = false } = {}) {
  const cruise = ((SPEED * CRUISE_MULT) / (ultra ? 0.5 : 1)) / 1000; // units per ms
  if (noWindup) return Math.max(400, Math.round(d / cruise));
  const windupDist = (SPEED / 1000) * WINDUP_MS;
  if (d <= windupDist) return Math.round(d / (SPEED / 1000));
  return Math.round(WINDUP_MS + (d - windupDist) / cruise);
}

function App() {
  const [shots, setShots] = useState([]);
  const [flash, setFlash] = useState({});
  const [status, setStatus] = useState("Pick a slug to fire.");
  const [labels, setLabels] = useState([]);
  const [hazards, setHazards] = useState([]);
  // Terrain: walls, bridges and the effects for them forming / breaking (the same pieces the real map uses).
  const [walls, setWalls] = useState([]);
  const [bridges, setBridges] = useState([]);
  const [growWalls, setGrowWalls] = useState(() => new Set());
  const [growBridges, setGrowBridges] = useState(() => new Set());
  const [terrain, setTerrain] = useState([]);
  const prevWallsRef = useRef([]);
  const [mega, setMega] = useState(false); // fire everything as a Mega Morph (same animation, scaled up)
  const idRef = useRef(0);
  const timers = useRef([]);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  function launchLeg(slugName, from, to, legIndex) {
    const def = SLUGS[slugName];
    const noWindup = Boolean(def.ricochet && !def.old && legIndex > 0);
    const d = dist(from, to);
    const ms = flightMs(d, { ultra: def.ultra, noWindup });
    const id = `${legIndex > 0 ? "ricochet" : "demo"}-${++idRef.current}`;
    const fx = {
      id,
      attackerId: 1,
      targetId: to.id,
      attackerPos: { x: from.x, y: from.y },
      targetPos: { x: to.x, y: to.y },
      impactPoint: { x: to.x, y: to.y },
      slugType: def.type,
      slugName,
      windowMs: ms,
      windupFraction: noWindup ? 0 : Math.min(1, (SPEED / 1000) * WINDUP_MS / d),
      noWindup,
      countered: false,
      counterSlugType: null,
      outcome: null,
      preMissed: false,
      expectHit: true,
      aoe: false,
      aoeScale: 1,
      mega,
      split: false,
      secondaryType: null,
      helix: Boolean(def.flags.helix),
      pounce: Boolean(def.flags.pounce),
      timeSkip: Boolean(def.flags.timeSkip),
      lightning: Boolean(def.flags.lightning),
      ricochet: Boolean(def.flags.ricochet),
      dagger: Boolean(def.flags.dagger),
      // The server's piercePoint: where the path crosses the wall (a vertical wall 40% of the way along)
      // and when the knife is thrown / lands (daggerThrowPlan).
      piercePoint: def.wall ? { x: from.x + (to.x - from.x) * 0.4, y: from.y + (to.y - from.y) * 0.4, wallAngle: 90, ...knifePlan(0.4, d, Math.min(1, (SPEED / 1000) * WINDUP_MS / d)) } : null,
    };
    setShots((s) => [...s, fx]);
    if (def.wall) {
      // The server splits the wall the moment the knife lands (shotTimeAtFraction).
      const w = fx.windupFraction;
      const kick = w * 0.4;
      const slow = Math.min(WINDUP_MS, ms);
      const f = fx.piercePoint.landT;
      const hitMs = f <= kick ? 0 : f <= w ? (slow * (f - kick)) / (w - kick) : slow + ((f - w) / (1 - w)) * (ms - slow);
      const x = fx.piercePoint.x;
      later(() => applyWalls([{ id: 20, x1: x, y1: 220, x2: x, y2: 330, source: "dm" }, { id: 21, x1: x, y1: 370, x2: x, y2: 480, source: "dm" }]), hitMs);
    }
    // The real server reveals the outcome a moment after launch.
    later(() => setShots((s) => s.map((x) => (x.id === id ? { ...x, outcome: "hit" } : x))), 60);
    later(() => {
      setFlash((f) => ({ ...f, [to.id]: Date.now() }));
      later(() => setFlash((f) => ({ ...f, [to.id]: 0 })), 350);
    }, ms);
    return ms;
  }

  // The chain arc a slug's hit throws to the nearest other target (broadcastChainFx on the server).
  function launchChain(from, to) {
    const id = `chain-${++idRef.current}`;
    const fx = {
      id,
      attackerId: null,
      targetId: null,
      attackerPos: { x: from.x, y: from.y },
      targetPos: { x: to.x, y: to.y },
      impactPoint: { x: to.x, y: to.y },
      slugType: null,
      windowMs: 250, // CHAIN_ARC_MS on the server: a fixed quarter of a second whatever the distance
      countered: false,
      counterSlugType: null,
      outcome: "hit",
      aoe: false,
      chain: true,
      lightning: true,
    };
    setShots((s) => [...s, fx]);
    later(() => {
      setFlash((f) => ({ ...f, [to.id]: Date.now() }));
      later(() => setFlash((f) => ({ ...f, [to.id]: 0 })), 350);
    }, 250);
  }

  // One standard bolt per element, side by side in lanes (top to bottom in ELEMENTS order).
  function fireAll() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    setLabels([]);
    setHazards([]);
    clearTerrain();
    ELEMENTS.forEach((type, i) => {
      const y = 38 + i * 41;
      launchLeg(`el:${type}`, { id: 100 + i, x: 150, y }, { id: 100 + i, x: 640, y }, 0);
    });
    setStatus(`All elements, top to bottom: ${ELEMENTS.join(", ")}`);
  }

  function clearTerrain() {
    prevWallsRef.current = [];
    setWalls([]);
    setBridges([]);
    setTerrain([]);
    setGrowWalls(new Set());
    setGrowBridges(new Set());
  }

  // Applies a new set of walls the way CombatMap does: works out which stretches broke and which walls are new.
  function applyWalls(next) {
    const prev = prevWallsRef.current;
    const { breaks, pieceIds } = diffWalls(prev, next);
    const added = next.filter((w) => w.source === "slug" && !prev.some((p) => p.id === w.id) && !pieceIds.has(w.id));
    const items = [
      ...breaks.map((b) => ({ kind: "break", key: `b-${b.id}-${Date.now()}`, ...b })),
      ...added.map((w) => ({ kind: "form", key: `f-${w.id}-${Date.now()}`, ...w })),
    ];
    if (items.length) {
      setTerrain((t) => [...t, ...items]);
      later(() => setTerrain((t) => t.filter((i) => !items.some((x) => x.key === i.key))), WALL_BREAK_FX_MS + 100);
    }
    if (added.length) {
      setGrowWalls(new Set(added.map((w) => w.id)));
      later(() => setGrowWalls(new Set()), 550);
    }
    prevWallsRef.current = next;
    setWalls(next);
  }

  const SLUG_WALLS = [
    { id: 1, x1: 330, y1: 160, x2: 330, y2: 540, slugType: "Fire", source: "slug" },
    { id: 2, x1: 620, y1: 160, x2: 620, y2: 540, slugType: "Ice", source: "slug" },
    { id: 3, x1: 910, y1: 160, x2: 910, y2: 540, slugType: "Earth", source: "slug" },
    { id: 4, x1: 1200, y1: 160, x2: 1200, y2: 540, slugType: "Electricity", source: "slug" },
  ];

  // Four walls (Fire, Ice, Earth, Electricity) form one after another.
  function wallsForm() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    setLabels([]);
    setHazards([]);
    clearTerrain();
    SLUG_WALLS.forEach((w, i) => later(() => applyWalls([...prevWallsRef.current, w]), 100 + i * 700));
    setStatus("Walls forming: Fire, Ice, Earth, Electricity (tinted by the slug that made them)");
  }

  // Three slug walls are smashed outright and a DM wall is blasted through its middle (two pieces remain).
  function wallsBreak() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    setLabels([]);
    setHazards([]);
    clearTerrain();
    const dm = { id: 9, x1: 150, y1: 620, x2: 1450, y2: 620, source: "dm" };
    const start = [SLUG_WALLS[0], SLUG_WALLS[2], SLUG_WALLS[3], dm];
    prevWallsRef.current = start;
    setWalls(start);
    later(() => applyWalls([{ id: 10, x1: 150, y1: 620, x2: 640, y2: 620, source: "dm" }, { id: 11, x1: 900, y1: 620, x2: 1450, y2: 620, source: "dm" }]), 900);
    setStatus("Walls breaking: three slug walls smashed whole, one DM wall blasted through its middle");
  }

  // Two bridges (Plant, Water) are built.
  function bridgesForm() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    setLabels([]);
    setHazards([]);
    clearTerrain();
    const made = [
      { id: 1, x: 250, y: 250, angle: 0, length: 560, width: 80, slugType: "Plant" },
      { id: 2, x: 650, y: 480, angle: 20, length: 640, width: 80, slugType: "Water" },
    ];
    made.forEach((b, i) =>
      later(() => {
        setBridges((prev) => [...prev, b]);
        setGrowBridges(new Set([b.id]));
        later(() => setGrowBridges(new Set()), 700);
      }, 150 + i * 1000)
    );
    setStatus("Bridges forming: planks laid one by one from the near end, with a bright bar running ahead");
  }

  // One hazard patch per element (plus the ice slick) in a labelled grid, drawn by the real HazardPatch.
  function showHazards() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    const kinds = [...ELEMENTS, "Ice slick"];
    const R = 70;
    const hz = kinds.map((k, i) => ({ id: 11 + i * 3, type: k === "Ice slick" ? "ice" : "damage", slugType: k === "Ice slick" ? null : k, x: 170 + (i % 5) * 315, y: 95 + Math.floor(i / 5) * 170, radius: R }));
    setHazards(hz);
    setLabels(hz.map((h, i) => ({ x: h.x, y: h.y + R + 24, name: kinds[i] })));
    setStatus("Hazard gallery: one patch per element, plus the ice slick");
  }

  // One standard bolt per element in a labelled 4x4 grid, each with room for its impact explosion.
  function fireBursts() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    const cells = ELEMENTS.map((type, i) => ({ type, x: 330 + (i % 4) * 330, y: 100 + Math.floor(i / 4) * 160 }));
    setLabels(cells.map((c) => ({ x: c.x, y: c.y + 78, name: c.type })));
    cells.forEach((c, i) => launchLeg(`el:${c.type}`, { id: 200 + i, x: c.x - 190, y: c.y }, { id: 200 + i, x: c.x, y: c.y }, 0));
    setStatus("Burst gallery: each element's standard bolt and its explosion");
  }

  // Two chain arcs at once, a near one and a far one: both take the same 250 ms.
  function fireArcs() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    setLabels([]);
    setHazards([]);
    clearTerrain();
    launchChain(FOES[0], FOES[3]);
    launchChain(SLINGER, FOES[2]);
    setStatus(
      `Chain arcs: near ${Math.round(dist(FOES[0], FOES[3]))} units and far ${Math.round(dist(SLINGER, FOES[2]))} units -- both 250 ms`
    );
  }

  function fire(slugName) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShots([]);
    setLabels([]);
    setHazards([]);
    clearTerrain();
    const def = SLUGS[slugName];
    if (def.wall) {
      // A DM wall across the Slinger -> A path, 40% of the way along.
      const x = SLINGER.x + (FOES[0].x - SLINGER.x) * 0.4;
      const w = [{ id: 19, x1: x, y1: 220, x2: x, y2: 480, source: "dm" }];
      prevWallsRef.current = w;
      setWalls(w);
    }
    const route = def.ricochet ? [FOES[0], FOES[1], FOES[2], FOES[3]] : [FOES[0]];
    let t = 0;
    let from = SLINGER;
    const lines = [];
    route.forEach((to, i) => {
      const at = t;
      const ms = (() => {
        // schedule each leg when the previous one lands
        const d = dist(from, to);
        const noWindup = Boolean(def.ricochet && !def.old && i > 0);
        return flightMs(d, { ultra: def.ultra, noWindup });
      })();
      const legFrom = from;
      later(() => launchLeg(slugName, legFrom, to, i), at);
      lines.push(`${i === 0 ? "launch" : `bounce ${i}`}: ${ms} ms`);
      t += ms;
      from = to;
    });
    if (def.arc) later(() => launchChain(FOES[0], FOES[1]), t);
    setStatus(`${slugName} -- ${def.note}.  ${lines.join("  |  ")}`);
  }

  const tokens = [SLINGER, ...FOES];
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#d8dde6", padding: 14 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14, color: "#f0d48a", cursor: "pointer" }}>
        <input type="checkbox" data-slug="mega" checked={mega} onChange={(e) => setMega(e.target.checked)} />
        Mega Morph (same animations, scaled up)
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.keys(SLUGS).filter((n) => !n.startsWith("el:")).map((name) => (
          <button
            key={name}
            data-slug={name}
            onClick={() => fire(name)}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #3a4252", background: "#1b2029", color: "#e8ecf3", cursor: "pointer", fontSize: 14 }}
          >
            {name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button
          data-slug="all-elements"
          onClick={fireAll}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #6b8f4a", background: "#1f2a19", color: "#e8f3de", cursor: "pointer", fontSize: 13 }}
        >
          All elements
        </button>
        <button
          data-slug="walls-form"
          onClick={wallsForm}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #6f8f6a", background: "#18221a", color: "#e0f0dc", cursor: "pointer", fontSize: 13 }}
        >
          Walls form
        </button>
        <button
          data-slug="walls-break"
          onClick={wallsBreak}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #b0705a", background: "#2a1c18", color: "#fbe1d6", cursor: "pointer", fontSize: 13 }}
        >
          Walls break
        </button>
        <button
          data-slug="bridges-form"
          onClick={bridgesForm}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #6a8ab0", background: "#16202c", color: "#dcebff", cursor: "pointer", fontSize: 13 }}
        >
          Bridges form
        </button>
        <button
          data-slug="hazards"
          onClick={showHazards}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #8a6ab0", background: "#201a2c", color: "#eadcfb", cursor: "pointer", fontSize: 13 }}
        >
          Hazard gallery
        </button>
        <button
          data-slug="bursts"
          onClick={fireBursts}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #b08a4a", background: "#2a2216", color: "#fbeccc", cursor: "pointer", fontSize: 13 }}
        >
          Burst gallery
        </button>
        <button
          data-slug="arcs"
          onClick={fireArcs}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #4a7fb0", background: "#16222f", color: "#dcecff", cursor: "pointer", fontSize: 13 }}
        >
          Chain arcs (near + far)
        </button>
        {ELEMENTS.map((t) => (
          <button
            key={t}
            data-slug={`el:${t}`}
            onClick={() => fire(`el:${t}`)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2f3646", background: "#161b24", color: "#cfd7e4", cursor: "pointer", fontSize: 12 }}
          >
            {t}
          </button>
        ))}
      </div>
      <div id="status" style={{ minHeight: 22, fontSize: 14, color: "#9fb0c8", marginBottom: 8 }}>
        {status}
      </div>
      <svg viewBox={`0 0 ${MAP.w} ${MAP.h}`} style={{ width: "100%", background: "#10141b", border: "1px solid #2a3140", borderRadius: 8 }}>
        {tokens.map((t) => (
          <g key={t.id}>
            <circle cx={t.x} cy={t.y} r={26} fill={t.color || "#6b3040"} stroke={flash[t.id] ? "#fff" : "#00000055"} strokeWidth={flash[t.id] ? 5 : 2} />
            <text x={t.x} y={t.y + 5} textAnchor="middle" fontSize={15} fill="#fff" fontWeight={600}>
              {t.name}
            </text>
          </g>
        ))}
        {bridges.map((b) => (
          <BridgePiece key={b.id} b={b} growing={growBridges.has(b.id)} />
        ))}
        {walls.map((w) => (
          <line
            key={w.id}
            className={`combat-map-wall ${w.source === "slug" ? "combat-map-wall--slug" : ""} ${growWalls.has(w.id) ? "combat-map-wall--growing" : ""}`}
            x1={w.x1}
            y1={w.y1}
            x2={w.x2}
            y2={w.y2}
            pathLength={growWalls.has(w.id) ? 1 : undefined}
            style={w.source === "slug" ? { "--wall-color": typeColor(w.slugType) } : undefined}
          />
        ))}
        {terrain.map((fx) => (fx.kind === "break" ? <WallBreakFx key={fx.key} fx={fx} vs={VS} /> : <WallFormFx key={fx.key} fx={fx} vs={VS} />))}
        {hazards.map((hz) => (
          <HazardPatch key={hz.id} hz={hz} title={`${hz.slugType || "Ice slick"} hazard`} />
        ))}
        {labels.map((l) => (
          <text key={l.name} x={l.x} y={l.y} textAnchor="middle" fontSize={16} fill="#8d9bb3">
            {l.name}
          </text>
        ))}
        {shots.map((fx) => (
          <ShotEffect key={fx.id} fx={fx} vs={VS} onDone={() => setShots((s) => s.filter((x) => x.id !== fx.id))} />
        ))}
      </svg>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
