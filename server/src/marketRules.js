// Market pricing rules, shared by routes/market.js and the schema seed.
//
// Final price = round(base * planetPct * barterPct), see finalPrice(). A
// template's own `base_price` column (null by default) overrides the derived
// default below -- the DM never has to price anything by hand.

export const POD_PRICE = 10;
export const DEFAULT_PODS = 6;

// Barter: d20 + Persuasion. 10 is the break-even; every point above/below it
// is worth 2%, capped at +/-20% (so a 20 is the full discount and a 0 the
// full markup).
export const BARTER_BREAK_EVEN = 10;
export const BARTER_PCT_PER_POINT = 2;
export const BARTER_MAX_PCT = 20;

export function barterPctForTotal(total) {
  const raw = (total - BARTER_BREAK_EVEN) * BARTER_PCT_PER_POINT;
  return Math.max(-BARTER_MAX_PCT, Math.min(BARTER_MAX_PCT, raw));
}

// Planet price modifier is a plain percentage (100 = list price).
export const PLANET_PCT_MIN = 10;
export const PLANET_PCT_MAX = 500;

// `planetPct` e.g. 85; `personalDiscountPct` is the rolling player's barter
// discount (0-20); `planetBarterPct` is the planet-wide barter markup (0-20)
// left behind by a poor roll.
export function finalPrice(basePrice, planetPct = 100, { personalDiscountPct = 0, planetBarterPct = 0 } = {}) {
  const mult = (planetPct / 100) * (1 + planetBarterPct / 100) * (1 - personalDiscountPct / 100);
  const raw = Math.max(1, basePrice * mult);
  return raw >= 100 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
}

// ---- default (derived) base prices ----------------------------------------

export function blasterModScore(t) {
  return Math.abs(t.accuracy_bonus ?? 0) + 2 * Math.abs(t.reload_ap_bonus ?? 0) + Math.abs(t.speed_bonus ?? 0) / 6;
}

export function isStandingBlasterMod(t) {
  return !t.grants_dual_shot && !t.grants_range_finder && blasterModScore(t) <= 3;
}

export function defaultBlasterModPrice(t) {
  const flags = (t.grants_dual_shot ? 1 : 0) + (t.grants_range_finder ? 1 : 0);
  return Math.round(40 + 20 * blasterModScore(t) + flags * 150);
}

export function mechaModScore(t) {
  return (
    Math.abs(t.speed_bonus ?? 0) +
    Math.abs(t.handling_bonus ?? 0) +
    Math.abs(t.armor_bonus ?? 0) +
    Math.abs(t.ramming_bonus ?? 0)
  );
}

export function isStandingMechaMod(t) {
  return !t.unlocks_mode && (t.speed_multiplier ?? 1) === 1 && mechaModScore(t) <= 2;
}

export function defaultMechaModPrice(t) {
  const extras = (t.unlocks_mode ? 1 : 0) + ((t.speed_multiplier ?? 1) !== 1 ? 1 : 0);
  return Math.round(60 + 30 * mechaModScore(t) + extras * 200);
}

export function defaultBlasterPrice(t) {
  return Math.round(100 + (t.quality ?? 0) * 75 + (t.mod_slots ?? 0) * 25 + (t.magazine_size ?? 0) * 5);
}

export function defaultMechaPrice(t) {
  return Math.round(300 + (t.tier ?? 0) * 250 + (t.mod_slots ?? 0) * 50);
}

export function defaultSlugPrice(t) {
  return Math.round(100 + (t.rarity ?? 5) * 60);
}

export const LISTING_KINDS = ["blaster", "mod", "mecha", "mecha_mod", "slug"];

// Template table + the base-price default per listing kind.
export const KIND_TABLES = {
  blaster: { table: "blaster_templates", price: defaultBlasterPrice },
  mod: { table: "mod_templates", price: defaultBlasterModPrice },
  mecha: { table: "mecha_templates", price: defaultMechaPrice },
  mecha_mod: { table: "mecha_mod_templates", price: defaultMechaModPrice },
  slug: { table: "slug_templates", price: defaultSlugPrice },
};

export function templateBasePrice(kind, row) {
  const def = KIND_TABLES[kind];
  if (!def) return 0;
  return row.base_price != null ? row.base_price : def.price(row);
}
