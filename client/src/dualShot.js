// Client mirror of the dual-shot rules in server/src/combatRules.js (see
// DUAL_COMBOS / dualShotPairError / buildDualShotSlug) -- used by the partner
// picker to preview a pairing and grey out illegal ones. The server re-checks
// everything, so a drift here only ever means a wrong preview, never a wrong
// result. Keep the combo names/summaries and the numbers in sync.

import { loyaltyClashModifier } from "./slugData.js";

export const DUAL_SHOT_MIN_LOYALTY = 3;
export const DUAL_SHOT_BASE_TYPE = "Twin Slinger";

const DUAL_COMBOS = {
  "Fire+Water": { name: "Steam", summary: "A scalding steam cloud at the impact point, and the target is blinded. No burn -- the two cancel out." },
  "Fire+Ice": { name: "Thermal Shock", summary: "x1.5 damage. No burn and no ice patch." },
  "Air+Fire": { name: "Firestorm", summary: "Burn, plus a blast radius -- everyone caught is burned." },
  "Fire+Plant": { name: "Wildfire", summary: "Burn plus snare, and the burn deals double damage." },
  "Fire+Toxic": { name: "Noxious Blaze", summary: "Burn plus poison, and the poison adds 2 stacks." },
  "Earth+Fire": { name: "Magma", summary: "Large knockback, and a damaging hazard patch where it lands." },
  "Fire+Metal": { name: "Molten", summary: "Pierces the first wall in its path, plus burn." },
  "Electricity+Fire": { name: "Plasma", summary: "Burn, and the chain arc burns too." },
  "Fire+Light": { name: "Solar Flare", summary: "Blind plus burn." },
  "Ice+Water": { name: "Deep Freeze", summary: "A large ice patch plus snare." },
  "Electricity+Water": { name: "Conduction", summary: "The chain arc hits at full power instead of half." },
  "Earth+Water": { name: "Mudslide", summary: "Snare plus a slippery patch." },
  "Air+Water": { name: "Tempest", summary: "Large knockback." },
  "Air+Ice": { name: "Whiteout", summary: "Snare plus blind." },
  "Electricity+Ice": { name: "Cryo Shock", summary: "Stun." },
  "Electricity+Metal": { name: "Railgun", summary: "Pierces the first wall in its path, plus a chain arc." },
  "Electricity+Psychic": { name: "Overload", summary: "Stun plus disarm." },
  "Dark+Light": { name: "Eclipse", summary: "Blind, and the shot phases through walls." },
  "Dark+Psychic": { name: "Nightmare", summary: "Fear -- the target flees -- plus -1 AP." },
  "Dark+Toxic": { name: "Blight", summary: "Poison, and the shot phases through walls." },
  "Earth+Metal": { name: "Avalanche", summary: "Large knockback, and breaks through the first wall in its path." },
  "Earth+Plant": { name: "Rootquake", summary: "Snare plus large knockback." },
  "Plant+Toxic": { name: "Venom Vine", summary: "Poison with an extra stack, plus snare." },
  "Light+Psychic": { name: "Hallucination", summary: "Confusion -- the target's shots risk firing wildly off target." },
};

const OVERCHARGE = { name: "Overcharge", summary: "The partner's effect plus a 2-pip refund instead of 1." };
const BOTH_APPLY = { name: null, summary: "Both elements' effects apply." };

export function dualCombo(typeA, typeB) {
  const combo = DUAL_COMBOS[[typeA, typeB].sort().join("+")];
  if (combo) return combo;
  if (typeA === "Energy" || typeB === "Energy") return OVERCHARGE;
  return BOTH_APPLY;
}

// Error string if the two slugs can't be fired together, else null.
export function dualShotPairError(a, b) {
  if (!a || !b || a.id === b.id) return "Pick two different slugs.";
  for (const s of [a, b]) {
    if (s.type === "Healing" || s.type === "None") return `${s.name} can't be fired in a dual shot.`;
    if ((s.loyaltyTier ?? 0) < DUAL_SHOT_MIN_LOYALTY) return `${s.name} isn't loyal enough (needs tier ${DUAL_SHOT_MIN_LOYALTY}+).`;
    if (s.uncounterable) return `${s.name} is uncounterable.`;
    if (s.ultraFast) return `${s.name} is ultra-fast.`;
  }
  if (a.type === b.type) return "Same element -- needs two different elements.";
  const needsPicker = (s) => Boolean(s.mindScramble || s.frictionShift);
  if (needsPicker(a) && needsPicker(b)) return "Both slugs need an effect picked.";
  return null;
}

// Whether a slug could take part in a dual shot at all (before picking a
// partner) -- enough loyalty and not a slug that's barred outright.
export function canJoinDualShot(slug) {
  return (
    (slug.loyaltyTier ?? 0) >= DUAL_SHOT_MIN_LOYALTY &&
    slug.type !== "Healing" &&
    slug.type !== "None" &&
    !slug.uncounterable &&
    !slug.ultraFast
  );
}

// The fused shot's headline numbers, for the preview card. Power/defense fold
// in each slug's loyalty bonus (as the server does) and Mega Morph's doubling;
// they don't include a Cannon's +3 or a Gatling's AP discount.
export function dualPreview(a, b, { mega = false } = {}) {
  const combo = dualCombo(a.type, b.type);
  const powerOf = (s) => s.clashPower + loyaltyClashModifier(s.loyaltyTier);
  const defenseOf = (s) => s.clashDefense + loyaltyClashModifier(s.loyaltyTier);
  return {
    comboName: combo.name,
    comboSummary: combo.summary,
    power: (powerOf(a) + powerOf(b)) * (mega ? 2 : 1),
    defense: Math.max(defenseOf(a), defenseOf(b)),
    apCost: Math.max(a.apCost || 0, b.apCost || 0) + 1,
  };
}
