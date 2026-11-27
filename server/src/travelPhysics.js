// The travel-time physics core: SI units, pure functions, no DB or UI.
//
// A ship's Veylan Drive (a fusion-powered reaction drive) gives it a constant
// *proper* acceleration -- what the crew's accelerometer reads. A journey is
// flip-and-burn: accelerate, flip at the midpoint (orientation only, not
// velocity), brake with the same main engine. Long enough journeys hit the
// ship's speed cap and coast in between. This is the exact flat-spacetime
// solution for constant proper acceleration, so it is right at 0.0001c and at
// 0.95c alike (at low speed it converges on T = 2 * sqrt(D / a)).
//
// Model boundaries (deliberate, not physics claims): one-dimensional,
// straight-line, rest-to-rest in one shared frame (the galactic frame). No
// gravity wells, orbital velocity matching, propellant, heat or engine limits:
// the acceleration is an idealised sustained rating, not proof a ship can do it.
// Flip time, docking and gate overheads belong to the route layer, never here.
//
// Inputs and outputs are unrounded SI (metres, seconds). Format at the edges.

export const PHYSICS = Object.freeze({
  C: 299_792_458, // m/s
  G0: 9.80665, // m/s^2, standard gravity
  AU: 149_597_870_700, // m
  DAY: 86_400, // s
  YEAR: 31_557_600, // s, Julian year
  LY: 299_792_458 * 31_557_600, // m, light-year (Julian)
  KM: 1000,
});

const ZERO_FLIGHT = Object.freeze({
  distanceMeters: 0,
  coordinateSeconds: 0,
  shipProperSeconds: 0,
  peakSpeedFractionC: 0,
  reachedSpeedCap: false,
  accelerationCoordinateSeconds: 0,
  accelerationProperSeconds: 0,
  cruiseCoordinateSeconds: 0,
  cruiseProperSeconds: 0,
  brakingCoordinateSeconds: 0,
  brakingProperSeconds: 0,
});

// One rest-to-rest flight of `distanceMeters` for a ship rated at
// `properAccelerationG` (multiples of g0) with a speed cap of
// `maxSpeedFractionC` (0 < cap < 1). Throws a RangeError on bad input.
//
// coordinateSeconds is galactic-frame time; shipProperSeconds is time aboard.
export function computeFlight(distanceMeters, ship) {
  const { C, G0 } = PHYSICS;
  const a = Number(ship?.properAccelerationG) * G0;
  const betaMax = Number(ship?.maxSpeedFractionC);

  if (![distanceMeters, a, betaMax].every(Number.isFinite)) {
    throw new RangeError("Flight inputs must be finite numbers");
  }
  if (distanceMeters < 0) throw new RangeError("Distance can't be negative");
  if (a <= 0) throw new RangeError("Acceleration must be above zero");
  if (betaMax <= 0 || betaMax >= 1) throw new RangeError("Speed cap must be between 0 and 1 c");
  if (distanceMeters === 0) return { ...ZERO_FLIGHT };

  // Rapidity at the cap, and how far the ship goes getting there from rest.
  const etaCap = Math.atanh(betaMax);
  const accelDistanceToCap = ((C * C) / a) * (Math.cosh(etaCap) - 1);

  let etaPeak;
  let cruiseCoordinateSeconds = 0;
  let reachedSpeedCap;
  if (2 * accelDistanceToCap >= distanceMeters) {
    // Never reaches the cap: accelerate half way, flip, brake half way.
    etaPeak = Math.acosh(1 + (distanceMeters * a) / (2 * C * C));
    reachedSpeedCap = false;
  } else {
    // Reaches the cap, coasts, then brakes.
    etaPeak = etaCap;
    cruiseCoordinateSeconds = (distanceMeters - 2 * accelDistanceToCap) / (betaMax * C);
    reachedSpeedCap = true;
  }

  const accelCoordinateSeconds = (C / a) * Math.sinh(etaPeak);
  const accelProperSeconds = (C / a) * etaPeak;
  // Coasting is the only segment where the plain t / gamma relation applies.
  const cruiseProperSeconds = cruiseCoordinateSeconds / Math.cosh(etaPeak);

  return {
    distanceMeters,
    coordinateSeconds: 2 * accelCoordinateSeconds + cruiseCoordinateSeconds,
    shipProperSeconds: 2 * accelProperSeconds + cruiseProperSeconds,
    peakSpeedFractionC: reachedSpeedCap ? betaMax : Math.tanh(etaPeak),
    reachedSpeedCap,
    accelerationCoordinateSeconds: accelCoordinateSeconds,
    accelerationProperSeconds: accelProperSeconds,
    cruiseCoordinateSeconds,
    cruiseProperSeconds,
    brakingCoordinateSeconds: accelCoordinateSeconds,
    brakingProperSeconds: accelProperSeconds,
  };
}

// ---- Formatting (presentation only) ------------------------------------------

export const secondsToDays = (s) => s / PHYSICS.DAY;
export const secondsToYears = (s) => s / PHYSICS.YEAR;

// "3.4 days", "18 hours", "6.9 years" -- days/weeks for gate travel, years for
// direct interstellar flights.
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "?";
  const years = secondsToYears(seconds);
  if (years >= 1) return `${years.toFixed(years >= 10 ? 1 : 2)} years`;
  const days = secondsToDays(seconds);
  if (days >= 1) return `${days.toFixed(1)} days`;
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)} hours`;
  return `${Math.round(seconds / 60)} minutes`;
}

// "0.42 AU", "2.3 million km", "4 ly".
export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return "?";
  const ly = meters / PHYSICS.LY;
  if (ly >= 0.1) return `${+ly.toFixed(2)} ly`;
  const au = meters / PHYSICS.AU;
  if (au >= 0.05) return `${au.toFixed(2)} AU`;
  return `${(meters / 1e9).toFixed(1)} million km`;
}
