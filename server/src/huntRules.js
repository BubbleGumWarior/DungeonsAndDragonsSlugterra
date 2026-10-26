// Slug Hunt rules: how many tries a rest allows and how skill tilts what turns
// up. Display-only mirrors live in the status the hunt route sends -- the
// server is always the referee.

// Nature: one hunt a rest, plus one more per point of modifier, up to five.
export const HUNT_BASE_ATTEMPTS = 1;
export const HUNT_MAX_ATTEMPTS = 5;

export function huntAttemptsFor(natureMod) {
  const extra = Math.max(0, Math.trunc(natureMod || 0));
  return Math.min(HUNT_MAX_ATTEMPTS, HUNT_BASE_ATTEMPTS + extra);
}

// Nature below 1: you can't read the land well enough to find anything but
// the most harmless slug there is, wherever you hunt.
export const FLOPPER_NAME = "Flopper";

export function huntFindsOnlyFloppers(natureMod) {
  return (natureMod || 0) < 1;
}

// Arcana: each point of modifier tilts a find toward the rarer slugs. A slug's
// odds are scaled by 1 + ARCANA_RARITY_BONUS x modifier x (rarity - 1), so a
// commonest-rarity slug (1) never changes and the rarest gain the most.
// Negative modifiers do nothing -- a poor arcanist just gets the plain odds.
export const ARCANA_RARITY_BONUS = 0.06;
export const DEFAULT_RARITY = 5; // a template with no rarity counts as mid

export function arcanaOddsFactor(arcanaMod, rarity) {
  const mod = Math.max(0, arcanaMod || 0);
  const step = Math.max(0, (rarity ?? DEFAULT_RARITY) - 1);
  return 1 + ARCANA_RARITY_BONUS * mod * step;
}
