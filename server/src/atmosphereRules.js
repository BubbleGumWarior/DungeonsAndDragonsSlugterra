// What a world's air, gravity and weather do in a fight. Pure rules -- no DB.
// A fight on a world ("offboard", the default) reads that world's survey facts;
// a fight aboard the ship (or while it is under way) gets plain ship air.
// buildAtmosphere() is snapshotted onto the encounter (encounters.atmosphere)
// and the client reads the finished object, so this file has no client mirror.
//
// Gravity: walking per AP and knockback distance.
// Vacuum:  Fire can't be fired, Air loses its range bonus, no hazard patches.
// Haze:    Light loses its accuracy bonus and its blind; Water leaves no hazards.
// Humid:   burns last a turn less, Electricity chains further (spores: Plant
//          snares last a turn longer).
// Dry:     burns last a turn longer, ice patches last a round longer.
// Thin:    the slug type's own range is cut (the weapon's range is not).
// Heat:    ice patches melt faster when hot and last longer when cold.
import {
  BURN_DURATION_TURNS,
  CHAIN_RADIUS,
  HAZARD_DURATION_ROUNDS,
  SNARE_DURATION_TURNS,
  slugHasType,
  typeBallistics,
} from "./combatRules.js";

// Plain ship air: what an aboard fight (or one in transit) is fought in.
export const STANDARD_AIR = { temperatureC: 21, humidityPct: 45, gravityG: 1, atmosphere: "Breathable, clear" };

export const THIN_AIR_RANGE_MULT = 0.8; // of the slug type's range
export const HUMID_CHAIN_MULT = 1.5; // of CHAIN_RADIUS
const MAX_ICE_ROUNDS = 8;

const round2 = (n) => Math.round(n * 100) / 100;

// How a world's gravity changes walking per AP and knockback distance.
// Between 0.85 and 1.05 g nothing changes; above it, every 0.1 g costs 10% of
// walking and 15% of knockback.
export function gravityEffects(g) {
  const gravity = Number.isFinite(g) ? Math.max(0, g) : 1;
  if (gravity <= 0.05) return { key: "zero", label: "Zero gravity", walkMult: 2, knockbackMult: 3 };
  if (gravity < 0.5) return { key: "low", label: "Low gravity", walkMult: 1.5, knockbackMult: 2 };
  if (gravity < 0.85) return { key: "light", label: "Light gravity", walkMult: 1.15, knockbackMult: 1.25 };
  if (gravity <= 1.05) return { key: "normal", label: "Normal gravity", walkMult: 1, knockbackMult: 1 };
  return {
    key: "heavy",
    label: "Heavy gravity",
    walkMult: round2(Math.max(0.5, 1 - (gravity - 1))),
    knockbackMult: round2(Math.max(0.5, 1 - 1.5 * (gravity - 1))),
  };
}

// The words a world's survey uses, as tags. Vacuum swallows the rest (nothing
// to be hazy, humid or thin about).
export function atmosphereTags(facts) {
  const text = String(facts?.atmosphere ?? "");
  const humidity = Number(facts?.humidityPct);
  if (/vacuum/i.test(text)) return ["vacuum"];
  const tags = [];
  if (/\b(haze|ash|smog)\b/i.test(text)) tags.push("haze");
  if (/\bthin\b/i.test(text)) tags.push("thin");
  if (Number.isFinite(humidity) && humidity >= 85) tags.push("humid");
  if (Number.isFinite(humidity) && humidity <= 15) tags.push("dry");
  if (/spore/i.test(text)) tags.push("spores");
  return tags;
}

// Rounds an ice patch lasts, from the heat and dryness of the place.
export function iceRoundsFor(temperatureC, dry) {
  const t = Number(temperatureC);
  let delta = 0;
  if (t >= 40) delta = -2;
  else if (t >= 25) delta = -1;
  else if (t <= -40) delta = 2;
  else if (t <= 0) delta = 1;
  if (dry) delta += 1;
  return Math.min(MAX_ICE_ROUNDS, Math.max(1, HAZARD_DURATION_ROUNDS + delta));
}

const pct = (mult) => `${mult > 1 ? "+" : ""}${Math.round((mult - 1) * 100)}%`;
const times = (mult) => `×${mult}`;

// The full set of fight effects for a place. `aboard` marks the plain ship-air
// case (the facts are replaced with STANDARD_AIR).
export function buildAtmosphere({ facts, aboard = false } = {}) {
  const used = aboard || !facts ? STANDARD_AIR : facts;
  const tags = atmosphereTags(used);
  const has = (t) => tags.includes(t);
  const gravity = gravityEffects(used.gravityG);
  const temperatureC = Number(used.temperatureC);

  const vacuum = has("vacuum");
  const haze = has("haze");
  const humid = has("humid");
  const dry = has("dry");
  const thin = has("thin");
  const spores = has("spores");

  const atmo = {
    aboard: Boolean(aboard || !facts),
    label: used.atmosphere,
    tags,
    temperatureC,
    humidityPct: used.humidityPct,
    gravityG: used.gravityG,
    gravity: gravity.key,
    walkMult: gravity.walkMult,
    knockbackMult: gravity.knockbackMult,
    noFire: vacuum,
    airNoRange: vacuum,
    noHazards: vacuum,
    noWaterHazards: haze,
    lightAccuracyLost: haze,
    noBlind: haze,
    rangeMult: thin ? THIN_AIR_RANGE_MULT : 1,
    burnTurns: BURN_DURATION_TURNS + (humid ? -1 : 0) + (dry ? 1 : 0),
    snareTurns: SNARE_DURATION_TURNS + (spores ? 1 : 0),
    chainMult: humid ? HUMID_CHAIN_MULT : 1,
    iceRounds: iceRoundsFor(temperatureC, dry),
  };

  const effects = [];
  if (gravity.walkMult !== 1) effects.push(`${gravity.label}: walking ${times(gravity.walkMult)} per AP, knockback ${times(gravity.knockbackMult)}`);
  if (vacuum) {
    effects.push("Vacuum: Fire slugs can't be fired", "Vacuum: Air slugs lose their range bonus", "Vacuum: no slug can leave a hazard patch");
  }
  if (haze) {
    effects.push("Haze: Light slugs lose their accuracy bonus and can't blind", "Haze: Water slugs can't leave hazard patches");
  }
  if (thin) effects.push(`Thin air: slug type range ${pct(THIN_AIR_RANGE_MULT)}`);
  if (humid) effects.push("Humid: burns last 1 turn less", `Humid: Electricity chains ${pct(HUMID_CHAIN_MULT)} further`);
  if (spores) effects.push("Spores: Plant snares last 1 turn longer");
  if (dry) effects.push("Dry: burns last 1 turn longer");
  if (atmo.iceRounds !== HAZARD_DURATION_ROUNDS) {
    effects.push(`${atmo.iceRounds < HAZARD_DURATION_ROUNDS ? "Ice patches melt after" : "Ice patches last"} ${atmo.iceRounds} rounds`);
  }
  atmo.effects = effects;
  return atmo;
}

// ---- Reading a snapshot -------------------------------------------------------
// All of these accept a missing/legacy snapshot (an encounter from before this
// existed) and then change nothing.

export const walkMultOf = (atmo) => atmo?.walkMult ?? 1;
export const knockbackMultOf = (atmo) => atmo?.knockbackMult ?? 1;

// Vacuum: a Fire slug can't be fired at all (either half of a dual shot).
export const fireBlocked = (atmo, slug) => Boolean(atmo?.noFire) && slugHasType(slug, "Fire");

// Hazard patches: none in vacuum; none from a Water slug in haze. `type` is the
// leaving slug's own type ("Ice" for an ice patch).
export function hazardBlocked(atmo, slug) {
  if (atmo?.noHazards) return true;
  return Boolean(atmo?.noWaterHazards) && slugHasType(slug, "Water");
}

// Blind is Light's on-hit trait; haze scatters it.
export const blindBlocked = (atmo) => Boolean(atmo?.noBlind);

// The slug's ballistics (combatRules slugBallistics) after the air has had its
// say: Air's range bonus is gone in vacuum, Light's accuracy bonus in haze, and
// thin air shortens what the slug type contributes to range. A fused shot keeps
// its rule of taking the worst of its two elements, after each is adjusted.
export function atmosphereBallistics(slug, tb, atmo) {
  if (!atmo || !(atmo.airNoRange || atmo.lightAccuracyLost || atmo.rangeMult !== 1)) return tb;
  const types = [slug?.type, slug?.secondary_type].filter(Boolean);
  if (types.length === 0) return tb;
  const rangeOf = (type) => (atmo.airNoRange && type === "Air" ? typeBallistics("None").range : typeBallistics(type).range);
  const accuracyOf = (type) => (atmo.lightAccuracyLost && type === "Light" ? 0 : typeBallistics(type).accuracyMod);
  return {
    ...tb,
    range: Math.min(...types.map(rangeOf)) * atmo.rangeMult,
    accuracyMod: Math.min(...types.map(accuracyOf)),
  };
}

// The slug type's reach for the range ring the client draws: base type range
// after the same adjustments.
export function atmosphereTypeRange(type, atmo) {
  return atmosphereBallistics({ type }, typeBallistics(type), atmo).range;
}

export const chainRadiusOf = (atmo) => CHAIN_RADIUS * (atmo?.chainMult ?? 1);
export const burnTurnsOf = (atmo) => atmo?.burnTurns ?? BURN_DURATION_TURNS;
export const snareTurnsOf = (atmo) => atmo?.snareTurns ?? SNARE_DURATION_TURNS;
export const iceRoundsOf = (atmo) => atmo?.iceRounds ?? HAZARD_DURATION_ROUNDS;
