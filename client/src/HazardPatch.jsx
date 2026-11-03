// One hazard patch on the combat map, drawn as a top-down piece of ground. Every element has its
// own outline shape, ground texture and (gentle) ambient motion, so a glance at the map tells
// which patch is which: Fire a scorched crust with glowing cracks, Water a rippling puddle, Ice a
// cracked pale sheet, Plant a thorny overgrowth, Earth rubble and fissures, Air a slow whirlwind,
// Electricity a field of flickering arcs, Energy a turning rune circle, Light a radiant sunburst,
// Dark a void drawing everything inward, Metal scattered scrap, Healing a soft glow with crosses,
// Psychic warped rippling rings, Toxic bubbling sludge, Unique a twinkle of sparkles.
//
// The top-down view has no "down": nothing here drifts or falls in a screen direction -- motion is
// spinning, pulsing, spreading or collapsing around the patch's own centre. Each patch's scatter
// (cracks, rocks, leaves...) is seeded by its id, so it looks identical on every client and never
// reshuffles on a re-render. Coordinates are relative to the patch centre; `hz.radius` is in map
// units, and everything scales from it.
import "./HazardPatch.css";

const TAU = Math.PI * 2;

// A small seeded generator (mulberry32): the same id always draws the same patch.
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

const pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
const f = (n) => Math.round(n * 10) / 10;
const lineTo = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"} ${f(x)} ${f(y)}`).join(" ");
const closed = (pts) => `${lineTo(pts)} Z`;

// A smooth, wobbly closed blob.
function blob(R, n, wobble, rnd) {
  const pts = Array.from({ length: n }, (_, i) => pt((i / n) * TAU, R * (1 + (rnd() - 0.5) * 2 * wobble)));
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M ${f(mid(pts[0], pts[1])[0])} ${f(mid(pts[0], pts[1])[1])}`;
  for (let i = 1; i <= n; i++) {
    const c = pts[i % n];
    const m = mid(c, pts[(i + 1) % n]);
    d += ` Q ${f(c[0])} ${f(c[1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d} Z`;
}
// A star-like edge: alternating outer points and inner notches.
function spiky(R, n, inner, rnd) {
  return closed(Array.from({ length: n * 2 }, (_, i) => pt((i / (n * 2)) * TAU, R * (i % 2 ? inner - rnd() * 0.04 : 1))));
}
// A straight-edged polygon with radii between `lo` and 1.
function angular(R, n, lo, rnd) {
  return closed(Array.from({ length: n }, (_, i) => pt(((i + rnd() * 0.4) / n) * TAU, R * (lo + rnd() * (1 - lo)))));
}
// A wavy circle.
function wavy(R, waves, depth, steps = 48, phase = 0) {
  return closed(Array.from({ length: steps }, (_, i) => pt((i / steps) * TAU, R * (1 + depth * Math.sin((i / steps) * TAU * waves + phase)))));
}
// A jagged polyline from `a` to `b`.
function zig(a, b, kinks, amp, rnd) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [a];
  for (let i = 1; i < kinks; i++) {
    const t = i / kinks;
    const off = (rnd() - 0.5) * 2 * amp;
    pts.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
  }
  pts.push(b);
  return lineTo(pts);
}
// A spiral arm from radius r0 to r1 sweeping `sweep` radians from angle a0.
function spiral(a0, r0, r1, sweep, steps = 22) {
  return lineTo(Array.from({ length: steps + 1 }, (_, i) => pt(a0 + (i / steps) * sweep, r0 + (r1 - r0) * (i / steps))));
}
const star = (x, y, r, rot = 0) => `M ${f(x - Math.cos(rot) * r)} ${f(y - Math.sin(rot) * r)} L ${f(x + Math.cos(rot) * r)} ${f(y + Math.sin(rot) * r)} M ${f(x + Math.sin(rot) * r)} ${f(y - Math.cos(rot) * r)} L ${f(x - Math.sin(rot) * r)} ${f(y + Math.cos(rot) * r)}`;
const scatter = (rnd, count, maxR) => Array.from({ length: count }, () => pt(rnd() * TAU, maxR * Math.sqrt(rnd())));
const delay = (rnd, span) => ({ animationDelay: `${f(-rnd() * span)}s` });

// Each artist returns { outline: [d, fill, fillOpacity, stroke], parts: [...jsx] } for a patch of radius R.
const ART = {
  Fire({ R, rnd }) {
    const sw = R * 0.017;
    const cracks = Array.from({ length: 7 }, (_, k) => {
      const a = (k / 7) * TAU + rnd() * 0.4;
      return <path key={`c${k}`} className="hz-pulse" style={delay(rnd, 2.4)} d={zig(pt(a, R * 0.1), pt(a, R * (0.55 + rnd() * 0.35)), 5, R * 0.05, rnd)} fill="none" stroke="#ff9a3c" strokeWidth={sw * 1.6} strokeLinecap="round" strokeLinejoin="round" />;
    });
    const embers = scatter(rnd, 8, R * 0.8).map(([x, y], k) => <circle key={`e${k}`} className="hz-twinkle" style={delay(rnd, 2)} cx={f(x)} cy={f(y)} r={R * (0.018 + rnd() * 0.02)} fill="#ffd27a" />);
    return { outline: [spiky(R * 0.97, 20, 0.86, rnd), "#3a1608", 0.62, "#ff7a2b"], parts: [<circle key="core" className="hz-pulse" r={R * 0.3} fill="#ff7a2b" fillOpacity="0.22" />, ...cracks, ...embers] };
  },
  Water({ R, rnd }) {
    const ripples = [0, 1.1, 2.2].map((d, k) => <circle key={`r${k}`} className="hz-ripple" style={{ animationDelay: `${-d}s` }} r={R * 0.9} fill="none" stroke="#cfeaff" strokeWidth={R * 0.014} />);
    const glints = Array.from({ length: 3 }, (_, k) => {
      const a = rnd() * TAU;
      return <path key={`g${k}`} d={lineTo(Array.from({ length: 8 }, (_, i) => pt(a + i * 0.07, R * 0.62)))} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth={R * 0.014} strokeLinecap="round" />;
    });
    return { outline: [blob(R * 0.97, 12, 0.05, rnd), "#2a7fc0", 0.36, "#8fd0ff"], parts: [...ripples, ...glints] };
  },
  Ice({ R, rnd, slick }) {
    const cracks = Array.from({ length: 5 }, (_, k) => {
      const a = (k / 5) * TAU + rnd() * 0.6;
      return <path key={`c${k}`} d={zig(pt(a, R * 0.08), pt(a + (rnd() - 0.5) * 0.4, R * (0.55 + rnd() * 0.35)), 4, R * 0.04, rnd)} fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth={R * 0.011} strokeLinecap="round" />;
    });
    const facets = Array.from({ length: 4 }, (_, k) => {
      const a = rnd() * TAU;
      return <path key={`f${k}`} d={closed([pt(a, R * 0.15), pt(a + 0.9, R * (0.6 + rnd() * 0.25)), pt(a + 1.6, R * (0.45 + rnd() * 0.3))])} fill="#ffffff" fillOpacity="0.13" />;
    });
    const glints = scatter(rnd, 4, R * 0.75).map(([x, y], k) => <path key={`s${k}`} className="hz-twinkle hz-slowtw" style={delay(rnd, 4)} d={star(x, y, R * 0.045, 0)} stroke="#ffffff" strokeWidth={R * 0.012} strokeLinecap="round" />);
    // A slick is the bare sheet; a damaging ice patch adds a few jagged spikes round the rim.
    return { outline: [angular(R * 0.97, 10, 0.86, rnd), "#bfeaff", slick ? 0.3 : 0.34, "#eaffff"], parts: [...facets, ...cracks, ...glints] };
  },
  Plant({ R, rnd }) {
    const vines = Array.from({ length: 4 }, (_, k) => {
      const a = (k / 4) * TAU + rnd() * 0.5;
      const [x1, y1] = pt(a, R * 0.92);
      const [cx, cy] = pt(a + 0.7, R * 0.55);
      const [x2, y2] = pt(a + 0.2, R * 0.12);
      return <path key={`v${k}`} d={`M ${f(x1)} ${f(y1)} Q ${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`} fill="none" stroke="#4fa23e" strokeWidth={R * 0.022} strokeLinecap="round" />;
    });
    const leaves = scatter(rnd, 9, R * 0.78).map(([x, y], k) => (
      <g key={`l${k}`} transform={`translate(${f(x)} ${f(y)}) rotate(${f(rnd() * 360)})`}>
        <ellipse className="hz-sway" style={delay(rnd, 3)} rx={R * 0.07} ry={R * 0.032} fill={k % 2 ? "#7ddc6a" : "#58b04a"} fillOpacity="0.85" />
      </g>
    ));
    return { outline: [spiky(R * 0.97, 16, 0.88, rnd), "#2f6b2c", 0.46, "#7ddc6a"], parts: [...vines, ...leaves] };
  },
  Earth({ R, rnd }) {
    const cracks = Array.from({ length: 5 }, (_, k) => {
      const a = (k / 5) * TAU + rnd() * 0.5;
      return <path key={`c${k}`} d={zig(pt(a, R * 0.05), pt(a, R * (0.6 + rnd() * 0.3)), 5, R * 0.05, rnd)} fill="none" stroke="#3b2a18" strokeOpacity="0.85" strokeWidth={R * 0.02} strokeLinecap="round" strokeLinejoin="round" />;
    });
    const rocks = scatter(rnd, 8, R * 0.75).map(([x, y], k) => {
      const r = R * (0.06 + rnd() * 0.07);
      const sides = 5 + Math.floor(rnd() * 2);
      return <path key={`k${k}`} d={closed(Array.from({ length: sides }, (_, i) => [x + Math.cos((i / sides) * TAU + k) * r * (0.75 + rnd() * 0.4), y + Math.sin((i / sides) * TAU + k) * r * (0.75 + rnd() * 0.4)]))} fill="#a97c50" stroke="#4a3320" strokeWidth={R * 0.01} />;
    });
    return { outline: [angular(R * 0.97, 13, 0.82, rnd), "#7a5a38", 0.5, "#c9a97a"], parts: [...cracks, ...rocks] };
  },
  Air({ R, rnd }) {
    const arms = (n, r0, r1, sweep, key) => Array.from({ length: n }, (_, k) => <path key={`${key}${k}`} d={spiral((k / n) * TAU, r0, r1, sweep)} fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth={R * 0.02} strokeLinecap="round" />);
    return {
      outline: [`M ${R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${-R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${R * 0.97} 0 Z`, "#bfeee0", 0.14, "#ffffff", true],
      parts: [
        <g key="o" className="hz-spin hz-slow">{arms(4, R * 0.1, R * 0.92, 1.3, "o")}</g>,
        <g key="i" className="hz-spin hz-rev">{arms(3, R * 0.06, R * 0.5, 1.5, "i")}</g>,
      ],
    };
  },
  Electricity({ R, rnd }) {
    const arcs = Array.from({ length: 7 }, (_, k) => {
      const a = (k / 7) * TAU + rnd() * 0.5;
      return <path key={`a${k}`} className="hz-flicker" style={{ animationDuration: `${f(0.9 + rnd() * 0.8)}s`, ...delay(rnd, 1.6) }} d={zig(pt(a, R * 0.14), pt(a + (rnd() - 0.5) * 0.3, R * 0.9), 6, R * 0.06, rnd)} fill="none" stroke="#eaf9ff" strokeWidth={R * 0.018} strokeLinecap="round" strokeLinejoin="round" />;
    });
    const sparks = scatter(rnd, 7, R * 0.8).map(([x, y], k) => <circle key={`s${k}`} className="hz-flicker" style={delay(rnd, 1.4)} cx={f(x)} cy={f(y)} r={R * 0.02} fill="#cfeaff" />);
    return { outline: [angular(R * 0.97, 22, 0.94, rnd), "#2a6fc0", 0.2, "#4fb0ff"], parts: [<circle key="core" className="hz-pulse" r={R * 0.1} fill="#cfeaff" fillOpacity="0.8" />, ...arcs, ...sparks] };
  },
  Energy({ R }) {
    const ticks = Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * TAU;
      const [x1, y1] = pt(a, R * 0.78);
      const [x2, y2] = pt(a, R * 0.92);
      return <path key={`t${k}`} d={`M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`} stroke="#e7b5f5" strokeWidth={R * 0.016} strokeLinecap="round" />;
    });
    return {
      outline: [`M ${R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${-R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${R * 0.97} 0 Z`, "#c98fe0", 0.16, "#e7b5f5"],
      parts: [
        ...ticks,
        <circle key="ra" className="hz-spin" r={R * 0.68} fill="none" stroke="#e7b5f5" strokeWidth={R * 0.02} strokeDasharray={`${R * 0.09} ${R * 0.05}`} />,
        <circle key="rb" className="hz-spin hz-rev" r={R * 0.42} fill="none" stroke="#f5d9ff" strokeWidth={R * 0.014} strokeDasharray={`${R * 0.04} ${R * 0.05}`} />,
        <circle key="pr" className="hz-ripple" r={R * 0.6} fill="none" stroke="#e7b5f5" strokeWidth={R * 0.012} />,
        <circle key="core" className="hz-pulse" r={R * 0.07} fill="#ffffff" />,
      ],
    };
  },
  Light({ R, rnd }) {
    const rays = Array.from({ length: 14 }, (_, k) => {
      const a = (k / 14) * TAU;
      const [x1, y1] = pt(a, R * 0.3);
      const [x2, y2] = pt(a, R * (k % 2 ? 0.7 : 0.95));
      return <path key={`r${k}`} d={`M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`} stroke="#fff3b0" strokeOpacity="0.6" strokeWidth={R * 0.022} strokeLinecap="round" />;
    });
    return {
      outline: [`M ${R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${-R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${R * 0.97} 0 Z`, "#fff3b0", 0.2, "#fff8cc"],
      parts: [<circle key="g" r={R * 0.55} fill="#fff3b0" fillOpacity="0.12" />, <g key="rays" className="hz-spin hz-slow">{rays}</g>, <circle key="core" className="hz-pulse" r={R * 0.16} fill="#fffbe0" fillOpacity="0.9" />],
    };
  },
  Dark({ R, rnd }) {
    const swirls = Array.from({ length: 6 }, (_, k) => <path key={`s${k}`} d={spiral((k / 6) * TAU, R * 0.85, R * 0.12, -1.5)} fill="none" stroke="#5b4a70" strokeOpacity="0.8" strokeWidth={R * 0.03} strokeLinecap="round" />);
    const rings = [0, 1.1, 2.2].map((d, k) => <circle key={`i${k}`} className="hz-implode" style={{ animationDelay: `${-d}s` }} r={R * 0.85} fill="none" stroke="#9a7cc4" strokeWidth={R * 0.014} />);
    return { outline: [blob(R * 0.97, 12, 0.1, rnd), "#1c1428", 0.74, "#7b5aa3"], parts: [<g key="sw" className="hz-spin hz-slow hz-rev">{swirls}</g>, ...rings, <circle key="core" r={R * 0.14} fill="#0c0714" fillOpacity="0.9" />] };
  },
  Metal({ R, rnd }) {
    const shards = scatter(rnd, 11, R * 0.78).map(([x, y], k) => {
      const a = rnd() * TAU;
      const len = R * (0.1 + rnd() * 0.09);
      const w = R * 0.035;
      const [tx, ty] = [x + Math.cos(a) * len, y + Math.sin(a) * len];
      const [bx, by] = [x - Math.cos(a) * len * 0.35, y - Math.sin(a) * len * 0.35];
      return <path key={`h${k}`} d={closed([[tx, ty], [bx - Math.sin(a) * w, by + Math.cos(a) * w], [bx + Math.sin(a) * w, by - Math.cos(a) * w]])} fill="#aab4bb" stroke="#e9eef1" strokeWidth={R * 0.008} />;
    });
    const nuts = scatter(rnd, 3, R * 0.65).map(([x, y], k) => (
      <path key={`n${k}`} d={closed(Array.from({ length: 6 }, (_, i) => [x + Math.cos((i / 6) * TAU + k) * R * 0.055, y + Math.sin((i / 6) * TAU + k) * R * 0.055]))} fill="none" stroke="#dfe6ea" strokeWidth={R * 0.012} />
    ));
    return { outline: [angular(R * 0.97, 8, 0.9, rnd), "#5c666e", 0.44, "#cfd8de"], parts: [...shards, ...nuts] };
  },
  Healing({ R, rnd }) {
    const crosses = scatter(rnd, 6, R * 0.72).map(([x, y], k) => <path key={`c${k}`} className="hz-pulse" style={delay(rnd, 2.4)} d={star(x, y, R * (0.05 + rnd() * 0.035), 0)} stroke="#f2fff4" strokeWidth={R * 0.02} strokeLinecap="round" />);
    return { outline: [blob(R * 0.97, 10, 0.06, rnd), "#6fd88a", 0.22, "#c9ffd5"], parts: [<circle key="g" className="hz-pulse" r={R * 0.5} fill="#6fd88a" fillOpacity="0.14" />, ...crosses] };
  },
  Psychic({ R }) {
    const ring = (r, k, cls) => <path key={`w${k}`} className={cls} d={wavy(r, 6 + k, 0.05, 48, k)} fill="none" stroke="#d9b3f0" strokeOpacity={0.75 - k * 0.15} strokeWidth={R * 0.018} />;
    return {
      outline: [wavy(R * 0.97, 7, 0.035), "#b06fd8", 0.17, "#d9b3f0"],
      parts: [<g key="a" className="hz-spin hz-slow">{ring(R * 0.8, 0)}</g>, <g key="b" className="hz-spin hz-rev">{ring(R * 0.55, 1)}</g>, <g key="c" className="hz-spin hz-slow">{ring(R * 0.3, 2)}</g>, <circle key="core" className="hz-pulse" r={R * 0.07} fill="#e7c5ff" />],
    };
  },
  Toxic({ R, rnd }) {
    const sludge = Array.from({ length: 4 }, (_, k) => {
      const [x, y] = pt(rnd() * TAU, R * 0.5 * Math.sqrt(rnd()));
      return <path key={`s${k}`} transform={`translate(${f(x)} ${f(y)})`} d={blob(R * (0.18 + rnd() * 0.12), 8, 0.2, rnd)} fill="#3f5a12" fillOpacity="0.38" />;
    });
    const bubbles = scatter(rnd, 10, R * 0.78).map(([x, y], k) => (
      <circle key={`b${k}`} className="hz-bubble" style={delay(rnd, 3.2)} cx={f(x)} cy={f(y)} r={R * (0.03 + rnd() * 0.04)} fill="#b6e04a" fillOpacity="0.28" stroke="#d8ff7a" strokeWidth={R * 0.01} />
    ));
    return { outline: [blob(R * 0.97, 11, 0.1, rnd), "#6a8f1f", 0.44, "#b6e04a"], parts: [...sludge, ...bubbles] };
  },
  Unique({ R, rnd }) {
    const palette = ["#ff9ad5", "#8fe9ff", "#ffe27a"];
    const sparkles = scatter(rnd, 12, R * 0.82).map(([x, y], k) => <path key={`s${k}`} className="hz-twinkle" style={delay(rnd, 2.6)} d={star(x, y, R * (0.04 + rnd() * 0.04), rnd())} stroke={palette[k % 3]} strokeWidth={R * 0.017} strokeLinecap="round" />);
    return { outline: [`M ${R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${-R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${R * 0.97} 0 Z`, "#ffffff", 0.06, "#ffffff", true], parts: sparkles };
  },
  None({ R }) {
    return { outline: [`M ${R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${-R * 0.97} 0 A ${R * 0.97} ${R * 0.97} 0 1 1 ${R * 0.97} 0 Z`, "#c9a24b", 0.18, "#c9a24b"], parts: [] };
  },
};

const DASH_TYPES = new Set(["Air", "Unique", "None"]);

// `hz`: { id, type: "ice" | "damage", slugType, x, y, radius }. `growing` plays the grow-in
// animation; `title` is the hover text.
export default function HazardPatch({ hz, growing = false, title = "" }) {
  const R = hz.radius;
  const kind = hz.type === "ice" ? "Ice" : ART[hz.slugType] ? hz.slugType : "None";
  const rnd = seeded((Number(hz.id) || 1) * 7919 + kind.length * 131);
  const art = ART[kind]({ R, rnd, slick: hz.type === "ice" });
  const [d, fill, fillOpacity, stroke, dashed] = art.outline;
  const damaging = hz.type !== "ice";
  return (
    <g transform={`translate(${hz.x} ${hz.y})`}>
      <g className={`combat-map-hazard hz hz--${kind.toLowerCase()} ${growing ? "combat-map-hazard--growing" : ""}`} data-hazard={kind}>
        <title>{title}</title>
        <path className="hz-outline" d={d} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeOpacity="0.85" strokeWidth={R * 0.017} strokeLinejoin="round" strokeDasharray={dashed || DASH_TYPES.has(kind) ? `${R * 0.025} ${R * 0.05}` : undefined} strokeLinecap="round" />
        {art.parts}
        {/* A damaging patch gets a thin dashed hazard rim in its element's colour; a slick (ice) does not. */}
        {damaging && <circle className="hz-rim" r={R} fill="none" stroke={stroke} strokeOpacity="0.45" strokeWidth={R * 0.01} strokeDasharray={`${R * 0.035} ${R * 0.05}`} />}
      </g>
    </g>
  );
}
