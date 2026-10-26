// Physical scale of the combat map. Every range/radius in the combat rules is in
// map units, and a unit is a fixed distance: UNITS_PER_METER to the metre. The
// DM sets how many metres the map is across; its width in units follows, so a
// bigger map is just more units wide and every fixed range covers less of it.
// Mirrors server/src/combatRules.js -- keep the numbers in sync.
import { BASE_TYPES } from "./itemData.js";

export const UNITS_PER_METER = 20;
export const MIN_MAP_METERS = 30;
export const MAX_MAP_METERS = 1200;
export const DEFAULT_MAP_METERS = 160; // a new encounter's map: 3200 units wide

// Quick picks for the DM's map-size control.
export const MAP_SIZE_PRESETS = [
  { meters: 40, label: "Room" },
  { meters: 80, label: "Courtyard" },
  { meters: 160, label: "Field" },
  { meters: 400, label: "Valley" },
  { meters: 1000, label: "Region" },
];

export function mapMeters(mapWidth) {
  return (mapWidth || DEFAULT_MAP_METERS * UNITS_PER_METER) / UNITS_PER_METER;
}

// How much to scale the things drawn *on* the map that should read at a steady
// on-screen size whatever the map's size -- tokens, labels, bolts. Ranges and
// areas are never scaled, they must stay true to the ground. Not quite 1:1 with
// the map's size, so a token still reads as a bit smaller on a vast map and a
// bit larger on a tight one instead of being a fixed size regardless.
export function markerScale(mapWidth) {
  const ratio = (mapWidth || 1600) / 1600;
  return Math.min(8, Math.max(0.5, Math.pow(ratio, 0.85)));
}

const NICE = [1, 2, 5];

// A "nice" scale-bar length (1/2/5 x 10^n metres) whose on-screen width is
// closest to, but not over, targetPx. pxPerMeter is the current screen pixels
// per metre (map zoom included).
export function niceScaleLength(pxPerMeter, targetPx = 140) {
  if (!(pxPerMeter > 0)) return { meters: 10, px: 0 };
  const targetMeters = targetPx / pxPerMeter;
  const exp = Math.floor(Math.log10(targetMeters));
  let best = null;
  for (let e = exp - 1; e <= exp + 1; e++) {
    for (const n of NICE) {
      const m = n * Math.pow(10, e);
      if (m * pxPerMeter <= targetPx && (!best || m > best)) best = m;
    }
  }
  const meters = best ?? Math.pow(10, exp);
  return { meters, px: meters * pxPerMeter };
}

export function formatMeters(m) {
  if (m >= 1000) return `${+(m / 1000).toFixed(2)} km`;
  if (m < 1) return `${+(m * 100).toFixed(0)} cm`;
  return `${+m.toFixed(2)} m`;
}

// Reference distances the DM can overlay on the map while planning, to see how
// far things reach at the current map size. `r` is a radius in map units; a
// "line" is a straight length (a Wall Maker's wall). Numbers mirror the server
// (combatRules.js) and the blaster defaults in itemData.js -- blasters can be
// edited per-instance, so these are the stock reaches, before a slug's element
// adds its own.
const REF_COLORS = ["#e8b64c", "#6fb7e8", "#e87b6f", "#8fd16a", "#c28be8", "#e8a0c8", "#6fe0c8", "#d0d0d0", "#f0a050", "#9aa5ff", "#ffd966", "#7fe08a", "#ff8fa3"];
const BLASTER_ENTRIES = Object.entries(BASE_TYPES)
  .sort((a, b) => a[1].range - b[1].range)
  .map(([name, b]) => ({ id: `blaster-${name}`, label: name, group: "Blasters", kind: "ring", r: b.range }));
const OTHER_ENTRIES = [
  { id: "walk", label: "1 AP walk / mount reach", group: "Terrain", kind: "ring", r: 80 },
  { id: "ice", label: "Ice patch", group: "Terrain", kind: "ring", r: 60 },
  { id: "blast", label: "Blast radius", group: "Terrain", kind: "ring", r: 120 },
  { id: "hazard", label: "Hazard patch", group: "Terrain", kind: "ring", r: 180 },
  { id: "wall", label: "Slug wall (length)", group: "Terrain", kind: "line", length: 140 },
];
export const RANGE_REFERENCES = [...BLASTER_ENTRIES, ...OTHER_ENTRIES].map((e, i) => ({
  ...e,
  color: REF_COLORS[i % REF_COLORS.length],
  meters: (e.kind === "line" ? e.length : e.r) / UNITS_PER_METER,
}));
export const DEFAULT_SHOWN_REFERENCES = ["blaster-Pistol", "blaster-Repeater", "blaster-Sniper Rig", "walk", "blast", "hazard", "wall"];
