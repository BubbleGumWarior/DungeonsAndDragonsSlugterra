// Display-side helpers for the air a fight is fought in. The server builds the
// finished `atmosphere` object (server/src/atmosphereRules.js) and is the
// referee; these only keep the client's previews (the range ring, the move
// cost, which slugs to refuse) in step with it.
import { typeRange } from "./slugData.js";

// The reach a slug type adds to its weapon, after the air has had its say:
// Air's range bonus is gone in vacuum and thin air shortens every type's reach.
export function atmosphereTypeRange(type, atmosphere) {
  if (!atmosphere) return typeRange(type);
  const base = atmosphere.airNoRange && type === "Air" ? typeRange("None") : typeRange(type);
  return base * (atmosphere.rangeMult ?? 1);
}

// Vacuum: a Fire slug can't be fired at all.
export const fireBlocked = (atmosphere, slug) =>
  Boolean(atmosphere?.noFire) && (slug?.type === "Fire" || slug?.secondaryType === "Fire" || slug?.secondary_type === "Fire");

export const walkMultOf = (atmosphere) => atmosphere?.walkMult ?? 1;

// "Vacuum, -170 °C, 0 g" for a header line.
export function atmosphereSummary(atmosphere) {
  if (!atmosphere) return "";
  const bits = [atmosphere.aboard ? "Ship air" : atmosphere.label];
  if (Number.isFinite(atmosphere.temperatureC)) bits.push(`${atmosphere.temperatureC} °C`);
  if (Number.isFinite(atmosphere.gravityG)) bits.push(`${atmosphere.gravityG} g`);
  return bits.join(" · ");
}
