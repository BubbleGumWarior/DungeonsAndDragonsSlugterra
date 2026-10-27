// Outfits and climate. Every outfit has a range of temperatures it is
// comfortable in; stand outside that range (after Fortitude has stretched it)
// and combat gets harder, and a night's sleep in the wrong clothes can make you
// ill. Pure rules -- no DB -- mirrored for display by client/src/outfitData.js.

// Fortitude (CON): each point of modifier stretches an outfit's comfort range
// by this many degrees at both ends. A negative modifier never shrinks it.
export const FORTITUDE_RANGE_PER_MOD = 5;

// What a character with nothing on the Wardrobe's "worn" slot is treated as
// wearing (a DM removed their outfit): plain indoor clothes.
export const BARE_COMFORT = { min: 16, max: 26 };

export function effectiveRange(outfit, fortitudeMod = 0) {
  const base = outfit ? { min: outfit.comfort_min ?? outfit.comfortMin, max: outfit.comfort_max ?? outfit.comfortMax } : BARE_COMFORT;
  const widen = FORTITUDE_RANGE_PER_MOD * Math.max(0, Math.trunc(fortitudeMod) || 0);
  return { min: base.min - widen, max: base.max + widen };
}

// How many whole degrees `temp` sits outside the range (0 when inside).
// Which way the temperature falls outside the range, for labels.
export function climateSide(range, temp) {
  return temp < range.min ? "cold" : temp > range.max ? "hot" : null;
}

export function degreesOutside(range, temp) {
  if (temp < range.min) return Math.ceil(range.min - temp);
  if (temp > range.max) return Math.ceil(temp - range.max);
  return 0;
}

// The climate ladder. `from` is the first number of degrees outside the range
// that lands in a tier. apMult / gritMult scale a character's AP per turn and
// max Grit for the fight; apFixed / gritFixed pin them outright (Lethal);
// reloadAp is extra AP per reload ("cold fingers"); accuracy is added to every
// attack roll; moveMult scales walking distance per AP; illChance is the chance
// of falling ill at a long rest spent this far out of range.
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

// "-5 to 20 C" / "any temperature", for market tags.
export function formatOutfitRange(min, max) {
  return max >= 500 ? "at any temperature" : `${min} to ${max} °C`;
}

export const illnessChance = (degrees) => climateTier(degrees).illChance;

const MIN_OUTFIT_AP = 2;
const MIN_MOVE_MULT = 0.1;

// The one place a character's gear and climate become combat numbers.
//   baseMaxAp / baseMaxGrit: from stats (and worn armor + outfit Grit, which
//     already sit in characters.grit_bonus).
//   outfit: the worn outfit row (or null).
// Order: outfit's own stats, then the climate tier, then illness.
export function buildGearSnapshot({ baseMaxAp, baseMaxGrit, outfit, fortitudeMod = 0, temp, ill = false }) {
  const range = effectiveRange(outfit, fortitudeMod);
  const outside = degreesOutside(range, temp);
  const tier = climateTier(outside);

  let maxAp = Math.max(MIN_OUTFIT_AP, baseMaxAp + (outfit?.ap_bonus ?? outfit?.apBonus ?? 0));
  let maxGrit = baseMaxGrit;
  if (tier.apFixed != null) maxAp = tier.apFixed;
  else maxAp = Math.max(1, Math.floor(maxAp * tier.apMult));
  if (tier.gritFixed != null) maxGrit = tier.gritFixed;
  else maxGrit = Math.max(1, Math.floor(maxGrit * tier.gritMult));

  if (ill) {
    maxAp = Math.max(1, Math.floor(maxAp / 2));
    maxGrit = Math.max(1, Math.floor(maxGrit / 2));
  }

  const outfitMove = 1 + (outfit?.move_pct ?? outfit?.movePct ?? 0) / 100;
  const outfitAccuracy = outfit?.accuracy_bonus ?? outfit?.accuracyBonus ?? 0;
  return {
    maxAp,
    maxGrit,
    gear: {
      outfit: outfit?.name ?? null,
      temp,
      outside,
      tier: tier.key,
      tierLabel: tier.label,
      side: climateSide(range, temp),
      moveMult: Math.max(MIN_MOVE_MULT, outfitMove * tier.moveMult),
      accuracyMod: outfitAccuracy + tier.accuracy,
      reloadApBonus: tier.reloadAp,
      disadvantage: Boolean(ill),
      ill: Boolean(ill),
    },
  };
}
