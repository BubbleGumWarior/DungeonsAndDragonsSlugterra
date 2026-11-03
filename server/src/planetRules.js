// Surface temperature of each world, in degrees Celsius, indexed by the flat
// world index (campaign_settings.slug_hunt_area). The server needs these to
// check outfits against the climate; the client's copy is each world's
// `facts.temperatureC` in client/src/planetData.js. Keep them in step -- the
// order is the same one slugHuntOdds.json and shipRules.js CLUSTER_SIZES use.
export const PLANET_TEMPS = [
  58, 46, 34, 29, 21, 17, // Threxa Combine
  31, 22, 19, 18, 15, // Verrin Concord
  33, -85, -4, -110, -46, // Kaeth Dominion
  -170, // The Threshold
];

// The rest of each world's survey figures that fights care about (atmosphere
// text, humidity, gravity), same order as PLANET_TEMPS. Mirror of the other
// `facts` in planetData.js; scripts/outfit-check.mjs compares them. See
// atmosphereRules.js for what they do in a fight.
export const PLANET_AIR = [
  { humidityPct: 8, gravityG: 1.1, atmosphere: "Thin, sulfurous ash haze" }, // Threxa Combine
  { humidityPct: 92, gravityG: 0.9, atmosphere: "Dense, scalding steam" },
  { humidityPct: 38, gravityG: 1.2, atmosphere: "Breathable, heavy with ash and sulfur" },
  { humidityPct: 24, gravityG: 1, atmosphere: "Breathable, industrial haze" },
  { humidityPct: 45, gravityG: 1, atmosphere: "Breathable, clear" },
  { humidityPct: 55, gravityG: 0.95, atmosphere: "Breathable, mild" },
  { humidityPct: 88, gravityG: 0.95, atmosphere: "Oxygen-rich, humid, thick with spores" }, // Verrin Concord
  { humidityPct: 52, gravityG: 1, atmosphere: "Breathable, mild" },
  { humidityPct: 97, gravityG: 1, atmosphere: "Breathable, salt-laden" },
  { humidityPct: 40, gravityG: 1, atmosphere: "Breathable, recycled" },
  { humidityPct: 35, gravityG: 1, atmosphere: "Breathable, dry" },
  { humidityPct: 94, gravityG: 1.1, atmosphere: "Thick, warm, faintly toxic" }, // Kaeth Dominion
  { humidityPct: 0, gravityG: 0.3, atmosphere: "None (vacuum); pressurised interiors" },
  { humidityPct: 12, gravityG: 0.9, atmosphere: "Breathable, thin and cold" },
  { humidityPct: 0, gravityG: 0.2, atmosphere: "None (vacuum); pressurised interiors" },
  { humidityPct: 30, gravityG: 1.15, atmosphere: "Breathable, bitingly cold" },
  { humidityPct: 0, gravityG: 0, atmosphere: "None (vacuum)" }, // The Threshold
];

// The survey figures of one world, in the shape atmosphereRules.js reads.
export function worldFacts(area) {
  const air = PLANET_AIR[area];
  if (!air) return null;
  return { temperatureC: temperatureForArea(area), ...air };
}

// While the ship is between worlds everyone is inside it.
export const SHIP_TEMPERATURE_C = 21;

export function temperatureForArea(area) {
  return PLANET_TEMPS[area] ?? SHIP_TEMPERATURE_C;
}

// What the party is actually standing in: the ship's own air while under way,
// otherwise the world they are on.
export function climateTemperature(area, traveling) {
  return traveling ? SHIP_TEMPERATURE_C : temperatureForArea(area);
}

// Worlds with no surface to bed down on (The Threshold is a field of derelict
// hulls in vacuum): the party sleeps in the ship's own air, so a long rest
// there never risks illness. Fights still use the world's temperature -- a
// salvage run into a wreck is what the EVA Space Suit is for.
export const REST_ABOARD_WORLDS = new Set([16]);

export const restsAboard = (area) => REST_ABOARD_WORLDS.has(area);

// The air a long rest is slept in.
export function restTemperature(area, traveling) {
  return traveling || restsAboard(area) ? SHIP_TEMPERATURE_C : temperatureForArea(area);
}
