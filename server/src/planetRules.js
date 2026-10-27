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
