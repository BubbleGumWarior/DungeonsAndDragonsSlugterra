// Display-side mirror of server/src/outfitRules.js -- the server is always the
// referee; this only decides what the Wardrobe shows. Keep the ladder in step.

export const FORTITUDE_RANGE_PER_MOD = 5;
export const BARE_COMFORT = { min: 16, max: 26 };

// `from` = whole degrees outside the comfort range at which the tier starts.
export const CLIMATE_TIERS = [
  { key: "comfortable", label: "Comfortable", from: 0, apMult: 1, gritMult: 1, reloadAp: 0, accuracy: 0, moveMult: 1, illChance: 0 },
  { key: "uncomfortable", label: "Uncomfortable", from: 1, apMult: 1, gritMult: 1, reloadAp: 1, accuracy: 0, moveMult: 1, illChance: 0.1 },
  { key: "strained", label: "Strained", from: 5, apMult: 1, gritMult: 1, reloadAp: 1, accuracy: -1, moveMult: 0.9, illChance: 0.25 },
  { key: "harsh", label: "Harsh", from: 10, apMult: 0.75, gritMult: 0.75, reloadAp: 1, accuracy: -2, moveMult: 0.8, illChance: 0.45 },
  { key: "severe", label: "Severe", from: 20, apMult: 0.5, gritMult: 0.5, reloadAp: 2, accuracy: -3, moveMult: 0.65, illChance: 0.7 },
  { key: "brutal", label: "Brutal", from: 35, apMult: 0.25, gritMult: 0.25, reloadAp: 3, accuracy: -5, moveMult: 0.5, illChance: 0.9 },
  { key: "lethal", label: "Lethal", from: 55, apFixed: 1, gritFixed: 1, reloadAp: 3, accuracy: -5, moveMult: 0.25, illChance: 0.9 },
];

export function climateTier(degrees) {
  const d = Math.max(0, degrees || 0);
  let found = CLIMATE_TIERS[0];
  for (const tier of CLIMATE_TIERS) if (d >= tier.from) found = tier;
  return found;
}

export function effectiveRange(outfit, fortitudeMod = 0) {
  const base = outfit ? { min: outfit.comfortMin, max: outfit.comfortMax } : BARE_COMFORT;
  const widen = FORTITUDE_RANGE_PER_MOD * Math.max(0, Math.trunc(fortitudeMod) || 0);
  return { min: base.min - widen, max: base.max + widen };
}

export function degreesOutside(range, temp) {
  if (temp < range.min) return Math.ceil(range.min - temp);
  if (temp > range.max) return Math.ceil(temp - range.max);
  return 0;
}

// The tier's effects as short phrases, for the climate banner.
export function tierEffects(tier) {
  const out = [];
  if (tier.apFixed != null) out.push(`only ${tier.apFixed} AP per turn`);
  else if (tier.apMult < 1) out.push(`${Math.round(tier.apMult * 100)}% of your AP per turn`);
  if (tier.gritFixed != null) out.push(`max Grit ${tier.gritFixed}`);
  else if (tier.gritMult < 1) out.push(`${Math.round(tier.gritMult * 100)}% max Grit`);
  if (tier.reloadAp > 0) out.push(`reloads cost +${tier.reloadAp} AP`);
  if (tier.accuracy < 0) out.push(`${tier.accuracy} to attack rolls`);
  if (tier.moveMult < 1) out.push(`walking ${Math.round((tier.moveMult - 1) * 100)}%`);
  return out;
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// An outfit's own stats as chips: only the ones it actually changes.
export function outfitChips(outfit) {
  const chips = [];
  if (outfit.gritBonus) chips.push({ label: `${signed(outfit.gritBonus)} max Grit`, good: outfit.gritBonus > 0 });
  if (outfit.movePct) chips.push({ label: `${signed(outfit.movePct)}% walking`, good: outfit.movePct > 0 });
  if (outfit.apBonus) chips.push({ label: `${signed(outfit.apBonus)} AP per turn`, good: outfit.apBonus > 0 });
  if (outfit.accuracyBonus) chips.push({ label: `${signed(outfit.accuracyBonus)} accuracy`, good: outfit.accuracyBonus > 0 });
  return chips;
}

export const formatRange = (range) => (range.max >= 500 ? "any temperature" : `${range.min} to ${range.max} °C`);
