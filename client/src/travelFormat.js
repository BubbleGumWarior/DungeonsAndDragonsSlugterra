// Display helpers for travel. The physics runs on the server
// (server/src/travelPhysics.js and routePlanner.js); this only words what it
// sends: SI seconds and metres, speeds as a fraction of c.

const DAY = 86_400;
const YEAR = 31_557_600;
const AU = 149_597_870_700;
const LY = 299_792_458 * YEAR;
const C_KMS = 299_792.458;

// "3.4 days", "18 hours", "6.9 years". Gate travel reads in days, direct
// interstellar flights in years.
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "?";
  const years = seconds / YEAR;
  if (years >= 1) return `${years.toFixed(years >= 10 ? 1 : 2)} years`;
  const days = seconds / DAY;
  if (days >= 1) return `${days.toFixed(1)} days`;
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)} hours`;
  return `${Math.max(1, Math.round(seconds / 60))} minutes`;
}

// "0.42 AU", "2.3 million km", "4 ly".
export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return "?";
  const ly = meters / LY;
  if (ly >= 0.1) return `${+ly.toFixed(2)} ly`;
  const au = meters / AU;
  if (au >= 0.05) return `${au.toFixed(2)} AU`;
  return `${(meters / 1e9).toFixed(1)} million km`;
}

// Peak speed: km/s while it's a sliver of light speed, a fraction of c after.
export function formatSpeed(fractionC) {
  if (!Number.isFinite(fractionC)) return "?";
  if (fractionC >= 0.05) return `${fractionC.toFixed(2)}c`;
  return `${Math.round(fractionC * C_KMS).toLocaleString()} km/s`;
}

// "1 g", "0.15 g".
export const formatG = (g) => `${+Number(g).toFixed(3)} g`;

export const ROUTE_TYPE_LABELS = {
  INTRA_SYSTEM: "Inside the system",
  GATE_NETWORK: "Through the gates",
  DIRECT_INTERSTELLAR: "Direct, no gates",
};

// "Through the gates (2 jumps)" / "Inside the system".
export function routeTypeLabel(route) {
  if (!route) return "";
  const base = ROUTE_TYPE_LABELS[route.routeType] ?? route.routeType;
  return route.jumps ? `${base} · ${route.jumps} ${route.jumps === 1 ? "jump" : "jumps"}` : base;
}

// Why a planned route can't launch, or null.
export function blockedText(route) {
  const b = route?.blockedBy?.[0];
  if (!b) return null;
  return b.reason === "offline"
    ? `The ${b.gate} is shut down.`
    : `The ${b.gate}'s control station hasn't cleared the ship to jump.`;
}
