// Everything the simulator holds CONSTANT or sweeps over: the slug collection,
// the primary blaster, the Secondary-slot items, and the character builds.
//
// Slug numbers are copied from the default roster in
// server/src/data/defaultSlugTemplates.json (docs/Slugs - OG Slugs.csv) -- only
// slugs whose flags do nothing in a duel (wall/bridge makers, breaks-walls) or
// that the engine models are used, so no velocity ability is silently skipped.
import { BASE_TYPES } from "../../server/src/itemRules.js";
import { PROFICIENCY_KEYS, statCost, statModifier } from "../../server/src/characterRules.js";

// ---- Slugs ------------------------------------------------------------------
// Order = magazine order. The first `magazine_size` are loaded; the rest sit in
// the pack and only get chambered when a belt adds slots (the "slugs stay the
// same" rule: a belt changes how many of the SAME collection you can carry).
const S = (name, type, power, defense, ap, pips, extra = {}) => ({
  name, type, clash_power: power, clash_defense: defense, ap_cost: ap, max_pips: pips, ...extra,
});

export const SLUG_POOLS = {
  // Mid-power, six different elements, one of each trait the engine models.
  standard: [
    S("Frostfire", "Fire", 5, 3, 2, 6),   // burn
    S("Crystalyd", "Earth", 5, 5, 2, 10), // big knockback, +1 power, -2 accuracy
    S("Boltling", "Metal", 4, 3, 2, 8),   // short knockback, +1 power, +25% uncountered
    S("Sunshard", "Light", 4, 5, 2, 8),   // blind, +3 accuracy
    S("Gurglet", "Toxic", 3, 1, 1, 6),    // poison stacks, 1 AP
    S("Galecrow", "Air", 5, 4, 2, 6, { causes_knockback: true }), // +2 accuracy, short shove
    // pack (only loaded with an ammo belt)
    S("Clinker", "Metal", 3, 5, 2, 8),
    S("Gloamling", "Dark", 4, 4, 2, 8),
    S("Joulet", "Electricity", 5, 2, 2, 6),
    S("Brookling", "Water", 4, 3, 2, 10),
  ],
  // Same shape as "standard" but no damage-over-time slug (no Fire / Toxic), to see how much
  // of Medicine's and Hunker's value comes from burn and poison.
  nodot: [
    S("Crystalyd", "Earth", 5, 5, 2, 10),
    S("Boltling", "Metal", 4, 3, 2, 8),
    S("Sunshard", "Light", 4, 5, 2, 8),
    S("Galecrow", "Air", 5, 4, 2, 6, { causes_knockback: true }),
    S("Gloamling", "Dark", 4, 4, 2, 8),
    S("Joulet", "Electricity", 5, 2, 2, 6),
    S("Clinker", "Metal", 3, 5, 2, 8),
    S("Brookling", "Water", 4, 3, 2, 10),
    S("Whirlet", "Air", 3, 3, 2, 8, { causes_knockback: true }),
    S("Cybercut", "Electricity", 7, 7, 3, 4),
  ],
  // Fewer, heavier slugs: AP 3, high power. Tests whether conclusions survive a
  // different damage/AP profile.
  heavy: [
    S("Thresher", "Metal", 9, 4, 3, 6),
    S("Cybercut", "Electricity", 7, 7, 3, 4),
    S("Luxbison", "Light", 8, 5, 3, 6, { causes_knockback: true }),
    S("Adamantor", "Metal", 7, 7, 3, 6, { causes_knockback: true }),
    S("Geoshard", "Earth", 5, 8, 3, 8),
    S("Frostfire", "Fire", 5, 3, 2, 6),
    S("Clinker", "Metal", 3, 5, 2, 8),
    S("Gloamling", "Dark", 4, 4, 2, 8),
    S("Joulet", "Electricity", 5, 2, 2, 6),
    S("Brookling", "Water", 4, 3, 2, 10),
  ],
};

// Same six-slug shape as "standard" with the Air slot swapped for a grapple slug: a landed hit reels the
// target to 40 units from the shooter (up to 400 units) instead of shoving it away. The three real default
// grapple slugs that fit a duel: Vinehook (Plant, so it also snares), Arcwhip (Electricity, power 6), Magnetis (Metal).
const swapSlot = (pool, i, slug) => pool.map((s, k) => (k === i ? slug : s));
SLUG_POOLS.grappleVine = swapSlot(SLUG_POOLS.standard, 5, S("Vinehook", "Plant", 4, 4, 2, 8, { grapple: true }));
SLUG_POOLS.grappleArc = swapSlot(SLUG_POOLS.standard, 5, S("Arcwhip", "Electricity", 6, 3, 2, 8, { grapple: true }));
SLUG_POOLS.grappleMetal = swapSlot(SLUG_POOLS.standard, 5, S("Magnetis", "Metal", 4, 5, 2, 8, { grapple: true }));

// ---- Primary blaster --------------------------------------------------------
export function makeBlaster(baseType, quality) {
  const b = BASE_TYPES[baseType];
  return {
    base_type: baseType,
    accuracy: b.accuracy,
    reload_ap_cost: b.reloadApCost,
    range: b.range,
    speed: b.speed,
    magazine_size: b.magazineSize,
    quality,
  };
}

export const LOADOUTS = {
  // The default for every experiment.
  standard: { name: "Revolver/Fine + standard slugs @ Friendly", pool: "standard", baseType: "Revolver", quality: 2, loyaltyTier: 2 },
  heavy: { name: "Revolver/Fine + heavy slugs @ Friendly", pool: "heavy", baseType: "Revolver", quality: 2, loyaltyTier: 2 },
  // Sensitivity loadouts for the "same conclusions?" checks.
  nodot: { name: "Revolver/Fine + no-DoT slugs @ Friendly", pool: "nodot", baseType: "Revolver", quality: 2, loyaltyTier: 2 },
  grappleVine: { name: "standard slugs, Galecrow -> Vinehook (grapple + snare)", pool: "grappleVine", baseType: "Revolver", quality: 2, loyaltyTier: 2 },
  grappleArc: { name: "standard slugs, Galecrow -> Arcwhip (grapple)", pool: "grappleArc", baseType: "Revolver", quality: 2, loyaltyTier: 2 },
  grappleMetal: { name: "standard slugs, Galecrow -> Magnetis (grapple)", pool: "grappleMetal", baseType: "Revolver", quality: 2, loyaltyTier: 2 },
  wild: { name: "Revolver/Fine + standard slugs @ Indifferent", pool: "standard", baseType: "Revolver", quality: 2, loyaltyTier: 1 },
  bonded: { name: "Revolver/Fine + standard slugs @ Loyal", pool: "standard", baseType: "Revolver", quality: 2, loyaltyTier: 3 },
  pistol: { name: "Pistol/Standard + standard slugs @ Friendly", pool: "standard", baseType: "Pistol", quality: 1, loyaltyTier: 2 },
  repeater: { name: "Repeater/Fine + standard slugs @ Friendly", pool: "standard", baseType: "Repeater", quality: 2, loyaltyTier: 2 },
  sniper: { name: "Sniper Rig/Fine + standard slugs @ Friendly", pool: "standard", baseType: "Sniper Rig", quality: 2, loyaltyTier: 2 },
};

// ---- Secondary-slot items ---------------------------------------------------
// The game's DM defines these per item; the numbers below are the benchmark set
// this analysis uses. Prices come from defaultEquipmentPrice() in marketRules.js
// so "value for money" can be judged by the game's own price list.
export function equipmentPrice(it) {
  if (it.kind === "ammo_belt") return Math.round(80 + 45 * (it.extraSlots ?? 0));
  if (it.kind === "shield") return Math.round(60 + 14 * (it.absorb ?? 0));
  if (it.kind === "armor") return Math.round(60 + 12 * (it.gritBonus ?? 0));
  if (it.kind === "melee") return Math.round(60 + 25 * (it.damage ?? 0) + 10 * Math.max(0, it.accuracy ?? 0) + Math.max(0, (it.reach ?? 80) - 80) / 4);
  return 0;
}

const melee = (name, damage, accuracy, apCost, meleeType, reach = 80) => ({ kind: "melee", name, damage, accuracy, apCost, meleeType, reach });
const shield = (name, absorb) => ({ kind: "shield", name, absorb });
const belt = (name, extraSlots) => ({ kind: "ammo_belt", name, extraSlots });

export const SECONDARIES = {
  none: { kind: "none", name: "Empty" },
  // melee -- slash / bludgeon / pierce at a few damage / AP points
  dagger: melee("Dagger (3 dmg, +2, 1 AP, slash)", 3, 2, 1, "slash"),
  shortsword: melee("Shortsword (4 dmg, +1, 2 AP, slash)", 4, 1, 2, "slash"),
  longsword: melee("Longsword (6 dmg, +1, 2 AP, slash)", 6, 1, 2, "slash"),
  mace: melee("Mace (6 dmg, +0, 3 AP, bludgeon)", 6, 0, 3, "bludgeon"),
  warhammer: melee("Warhammer (9 dmg, -1, 4 AP, bludgeon)", 9, -1, 4, "bludgeon"),
  rapier: melee("Rapier (4 dmg, +3, 1 AP, pierce)", 4, 3, 1, "pierce"),
  spear: melee("Spear (5 dmg, +1, 2 AP, pierce, reach 160)", 5, 1, 2, "pierce", 160),
  // shields
  buckler: shield("Buckler (absorb 10)", 10),
  roundshield: shield("Round Shield (absorb 20)", 20),
  kiteshield: shield("Kite Shield (absorb 30)", 30),
  towershield: shield("Tower Shield (absorb 50)", 50),
  // ammo belts
  belt2: belt("Ammo Belt (+2 slots)", 2),
  belt4: belt("Ammo Belt (+4 slots)", 4),
};
for (const [key, it] of Object.entries(SECONDARIES)) { it.key = key; it.price = equipmentPrice(it); }

export const ARMORS = {
  none: { kind: "armor", name: "No armor", gritBonus: 0 },
  leather: { kind: "armor", name: "Leather (+8 Grit)", gritBonus: 8 },
  chain: { kind: "armor", name: "Chain (+15 Grit)", gritBonus: 15 },
  plate: { kind: "armor", name: "Plate (+25 Grit)", gritBonus: 25 },
};
for (const [key, it] of Object.entries(ARMORS)) { it.key = key; it.price = equipmentPrice(it); }

// ---- Builds -----------------------------------------------------------------
const S6 = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const stats = (str, dex, con, int, wis, cha) => ({ strength: str, dexterity: dex, constitution: con, intelligence: int, wisdom: wis, charisma: cha });

export const pointCost = (st) => S6.reduce((n, k) => n + statCost(st[k]), 0);
export const mods = (st) => S6.map((k) => statModifier(st[k]));

// Skills that actually do something in a fight (see the engine for how each one
// is used). Everything else is an inert pick.
export const COMBAT_SKILLS = ["acrobatics", "athletics", "sleightOfHand", "intimidation", "medicine", "stealth", "perception", "performance"];
export const INERT_SKILLS = PROFICIENCY_KEYS.filter((k) => !COMBAT_SKILLS.includes(k));

// Pad a short list of meaningful picks with inert ones so every build has the 5
// proficiencies the character creator demands.
export function fillProfs(picks) {
  const out = [...picks];
  for (const k of INERT_SKILLS) { if (out.length >= 5) break; if (!out.includes(k)) out.push(k); }
  return out;
}

export function makeBuild(name, st, profs, secondary = "none", armor = "none") {
  return { name, stats: st, profs: fillProfs(profs), secondary: SECONDARIES[secondary], armor: ARMORS[armor] };
}

// Every legal point-buy assignment (27 points, 8..15 per stat). 12,282 of them.
const COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export function enumeratePointBuys() {
  const out = [];
  const vals = [0, 0, 0, 0, 0, 0];
  const rec = (i, sum) => {
    if (i === 6) { if (sum === 27) out.push(stats(...vals)); return; }
    for (let v = 8; v <= 15; v++) {
      if (sum + COSTS[v] > 27) continue;
      vals[i] = v;
      rec(i + 1, sum + COSTS[v]);
    }
  };
  rec(0, 0);
  return out;
}

// Hand-built archetypes: what a player might actually roll up. All legal point
// buys (checked by assertLegal) with 5 proficiencies each.
export const ARCHETYPES = [
  // name, [STR, DEX, CON, INT, WIS, CHA], proficiencies that matter, secondary
  ["Balanced 12s/13s", stats(12, 13, 13, 12, 13, 12), ["acrobatics", "perception"], "none"],
  ["Triple 14s (STR/DEX/CON)", stats(14, 14, 14, 10, 10, 10), ["acrobatics", "athletics"], "none"],
  ["DEX/CON 15s", stats(14, 15, 15, 10, 8, 8), ["acrobatics", "sleightOfHand"], "none"],
  ["STR/CON 15s Longsword", stats(15, 14, 15, 10, 8, 8), ["athletics", "acrobatics"], "longsword"],
  ["Brawler Mace", stats(15, 10, 14, 8, 13, 12), ["athletics"], "mace"],
  ["Duelist Rapier", stats(14, 14, 12, 8, 13, 12), ["acrobatics", "athletics"], "rapier"],
  ["Tank + Round Shield", stats(10, 10, 15, 12, 13, 13), ["medicine"], "roundshield"],
  ["Tank, empty hands", stats(10, 10, 15, 12, 13, 13), ["medicine"], "none"],
  ["Gunner DEX + Belt", stats(8, 15, 13, 12, 13, 12), ["sleightOfHand", "acrobatics"], "belt2"],
  ["Dodger/Medic/Intimidator", stats(10, 15, 8, 10, 14, 14), ["acrobatics", "medicine", "intimidation"], "none"],
  ["Tank+social", stats(8, 10, 15, 10, 14, 14), ["medicine", "intimidation"], "none"],
  ["Brainy 15s (INT/WIS/CHA)", stats(8, 8, 8, 15, 15, 15), ["perception", "medicine"], "none"],
];

export function assertLegal(b) {
  const cost = pointCost(b.stats);
  if (cost !== 27) throw new Error(`${b.name}: costs ${cost} points, not 27`);
  for (const k of S6) if (b.stats[k] < 8 || b.stats[k] > 15) throw new Error(`${b.name}: ${k} out of range`);
  if (new Set(b.profs).size !== 5) throw new Error(`${b.name}: needs 5 unique proficiencies`);
}

export function archetypeBuilds() {
  return ARCHETYPES.map(([name, st, profs, sec]) => makeBuild(name, st, profs, sec));
}
