// Auto-counter: lets the DM hand an NPC's or grunt's counter window to the
// server instead of answering every prompt by hand (see launchAndOfferCounter
// in routes/combat.js, which calls evaluateAutoCounter).
//
// The evaluation is a forecast of the "grit swing" each reaction would
// produce, using the same rules the real resolution does (resolveClash,
// slugBaseHitAmount, the Metal uncountered bonus, rider soak, the counter's
// AP/energy cost, Dodge's opposed roll). The defender reacts only when the
// best option beats doing nothing by AUTO_COUNTER_MIN_GAIN -- so a grunt
// won't burn AP and a slug into a clash it can't win, but will jump on a
// counter that reflects the shot or a dodge that likely saves a lethal hit.
//
// Pure: no DB, no randomness except the optional reaction-delay jitter, so
// every number here is unit-testable.
import {
  resolveClash,
  slugBaseHitAmount,
  slugHasTrait,
  slugHasType,
  splitRiderDamage,
  CLASH_TRIPLE_MULTIPLIER,
  METAL_UNCOUNTERED_MULTIPLIER,
  SHOT_SLOW_PHASE_MS,
  DODGE_AP_COST,
} from "./combatRules.js";

// What a reaction is worth, all in Grit-equivalents.
export const AUTO_COUNTER_AP_VALUE = 2; // one leftover AP is worth ~2 Grit of tempo on the NPC's own turn
export const AUTO_COUNTER_PIP_COST = 0.5; // the energy pip a counter spends
export const AUTO_COUNTER_SLUG_LOSS = 1.5; // the counter slug gets knocked away (ejected, then cooling down)
export const AUTO_COUNTER_RIDER_HARM = 1; // each status rider (burn, stun, snare...) a hit would land
export const AUTO_COUNTER_LETHAL_HARM = 6; // extra harm when a hit would drop someone to 0 Grit
export const AUTO_COUNTER_MIN_GAIN = 1; // a reaction must beat "do nothing" by this much, or the NPC lets it fly
// A counter fired inside this slack of the "never wound up" cutoff is a coin
// flip against network/timer jitter -- not worth attempting.
const WINDUP_SLACK_MS = 60;

// Status riders a landed hit carries, from its element's trait and its own
// "causes ..." flags. Counted once each -- a Fire slug with causes_burn is one
// burn, not two.
const RIDER_TRAITS = ["burn", "poison", "snare", "stun", "blind"];
// Flag -> the rider it lands. A flag that duplicates an element trait maps to
// that trait's name so the two collapse into one rider.
const RIDER_FLAGS = {
  causes_burn: "burn", causes_stun: "stun", causes_blind: "blind", causes_snare: "snare",
  causes_shock: "shock", causes_jam: "jam", causes_disarm: "disarm", causes_fear: "fear",
  causes_confusion: "confusion", causes_bleed: "bleed", causes_knockback: "knockback",
  grapple: "grapple", stalls_slugs: "stall", swaps_position: "swap", mind_scramble: "scramble",
  friction_shift: "friction", emotion_surge: "emotion", life_drain: "drain",
};

export function slugRiderCount(slug) {
  const riders = new Set();
  for (const trait of RIDER_TRAITS) if (slugHasTrait(slug, trait)) riders.add(trait);
  for (const [flag, rider] of Object.entries(RIDER_FLAGS)) if (slug?.[flag]) riders.add(rider);
  return riders.size;
}

// Harm of losing `loss` Grit out of `hp`: the Grit actually lost (overkill
// doesn't count) plus a lethal bump, since dropping to 0 is far worse than the
// same number of points off a healthy bar.
function harm(loss, hp) {
  if (!(loss > 0) || !(hp > 0)) return 0;
  return Math.min(loss, hp) + (loss >= hp ? AUTO_COUNTER_LETHAL_HARM : 0);
}

const hpOf = (c) => c?.current_grit ?? c?.current_structure ?? 0;

// Grit a hit of `amount` takes off `defender` -- a mounted rider's mecha soaks
// 75% of it (see absorbRiderDamage).
function gritLossFor(defender, amount) {
  return defender?.mounted_on != null ? splitRiderDamage(amount).rider : amount;
}

// P(d20 + acrobaticsMod > attackTotal) -- Dodge is an opposed roll where a tie
// favors the attacker (see resolveDodgeAttempt).
export function dodgeSuccessChance(acrobaticsMod, attackTotal) {
  const needAbove = attackTotal - acrobaticsMod;
  return Math.max(0, Math.min(20, 20 - Math.floor(needAbove))) / 20;
}

// Dodge odds against a shot that is known to land. A window only ever opens
// for a hit, so the shooter's die is conditioned on `roll + modifier >= dc`
// (the defender's own static DC) -- a high-skill shooter's hits skew high, and
// averaging over a plain d20 would flatter the dodge. `modifier` is the
// shooter's attack total minus their die, i.e. their skill, not the die itself.
export function expectedDodgeChance(acrobaticsMod, modifier, dc) {
  let sum = 0;
  let n = 0;
  for (let roll = 1; roll <= 20; roll++) {
    if (roll + modifier < dc) continue;
    sum += dodgeSuccessChance(acrobaticsMod, roll + modifier);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

// How long after the shot launches the NPC "clicks" -- quicker for a nimble
// one, with jitter so grunts in a volley don't all answer on the same frame.
// Capped so a counter still has its windup (SHOT_SLOW_PHASE_MS) to get moving
// before the clash lands; otherwise the counter would auto-lose.
export function autoCounterDelayMs({ windowMs, dexMod = 0, forCounter, rand = Math.random }) {
  const base = Math.max(150, Math.min(800, 550 - dexMod * 40)) + rand() * 250;
  const latest = forCounter ? windowMs - SHOT_SLOW_PHASE_MS - WINDUP_SLACK_MS : windowMs - 150;
  return Math.round(Math.max(0, Math.min(base, latest)));
}

/**
 * Decide how an auto-countering defender answers an incoming hit.
 *
 * @param {object} p
 * @param {object} p.incoming     the shot's slug (loyalty already applied)
 * @param {object} p.attacker     attacker's combatant row
 * @param {object} p.defender     defender's combatant row (current_grit, current_ap, data.dexMod...)
 * @param {object[]} p.counters   eligible counter slug rows (findEligibleCounterSlugs)
 * @param {boolean} p.canDodge    Dodge is available (AP + acrobatics)
 * @param {number} p.acrobaticsMod
 * @param {number} p.windowMs     the shot's reaction window
 * @param {object} p.attackRoll   { attackTotal, roll, dc } already rolled at launch -- only the
 *                                shooter's modifier (total - roll) and the defender's own dc are
 *                                used, so the NPC reasons from skill rather than peeking at the die
 * @returns {{action:"counter"|"dodge"|"none", slugId?:number, delayMs?:number, swing:number, baseline:number, reason:string}}
 */
export function evaluateAutoCounter({ incoming, attacker, defender, counters, canDodge, acrobaticsMod = 0, windowMs, attackRoll, rand = Math.random }) {
  const defenderHp = hpOf(defender);
  const attackerHp = hpOf(attacker);
  const ambushed = Boolean(incoming.ambush_tripled && attacker?.status_effects?.invisible);
  const incomingRiders = slugRiderCount(incoming) * AUTO_COUNTER_RIDER_HARM;

  // Do nothing: the shot lands as a plain, uncountered hit (Metal's bonus applies).
  const uncounteredAmount = Math.round(
    slugBaseHitAmount(incoming, { ambushed }) * (slugHasType(incoming, "Metal") ? METAL_UNCOUNTERED_MULTIPLIER : 1)
  );
  const uncounteredHarm = harm(gritLossFor(defender, uncounteredAmount), defenderHp) + incomingRiders;
  const baseline = -uncounteredHarm;

  const options = [];

  // Counter-slug options. Impossible when the window is too short for the
  // counter to wind up -- it would lose the clash outright (resolveCounterOffer's
  // counterNeverWoundUp).
  const counterFeasible = windowMs - SHOT_SLOW_PHASE_MS - WINDUP_SLACK_MS > 0;
  if (counterFeasible) {
    const incomingMult = incoming.clash_tripled ? CLASH_TRIPLE_MULTIPLIER : 1;
    for (const c of counters) {
      const counterMult = c.clash_tripled ? CLASH_TRIPLE_MULTIPLIER : 1;
      const cost = (c.ap_cost || 0) * AUTO_COUNTER_AP_VALUE + AUTO_COUNTER_PIP_COST;
      const voided = (incoming.voids_fire_clash && c.type === "Fire") || (c.voids_fire_clash && slugHasType(incoming, "Fire"));
      const outcome =
        voided || c.mirrors_clash
          ? "bounce"
          : resolveClash({
              attackerPower: incoming.clash_power * incomingMult,
              attackerDefense: incoming.clash_defense * incomingMult,
              defenderPower: c.clash_power * counterMult,
              defenderDefense: c.clash_defense * counterMult,
            });

      let swing;
      let label;
      if (outcome === "defender-wins") {
        // Reflected: the counter hits the attacker, the incoming slug is knocked away.
        const reflected = slugBaseHitAmount({ ...c, clash_power: c.clash_power * counterMult });
        const dealt = harm(reflected, attackerHp) + slugRiderCount(c) * AUTO_COUNTER_RIDER_HARM;
        swing = dealt - cost;
        label = `reflects for ${reflected}`;
      } else if (outcome === "attacker-wins") {
        // Smashed through: the hit still lands (no Metal bonus once countered) and the counter slug is lost.
        const landed = slugBaseHitAmount({ ...incoming, clash_power: incoming.clash_power * incomingMult }, { ambushed });
        swing = -(harm(gritLossFor(defender, landed), defenderHp) + incomingRiders) - cost - AUTO_COUNTER_SLUG_LOSS;
        label = "would be smashed through";
      } else if (outcome === "double-break") {
        swing = -cost - AUTO_COUNTER_SLUG_LOSS;
        label = "both slugs break";
      } else {
        swing = -cost;
        label = "bounces the shot";
      }
      options.push({ action: "counter", slugId: c.id, swing, label: `${c.name} ${label}` });
    }
  }

  // Dodge: costs flat AP, and a failed dodge falls through to the uncountered hit.
  if (canDodge) {
    const p = expectedDodgeChance(acrobaticsMod, (attackRoll?.attackTotal ?? 0) - (attackRoll?.roll ?? 0), attackRoll?.dc ?? 10);
    options.push({
      action: "dodge",
      swing: -(1 - p) * uncounteredHarm - DODGE_AP_COST * AUTO_COUNTER_AP_VALUE,
      label: `dodge (${Math.round(p * 100)}% to clear)`,
    });
  }

  const best = options.sort((a, b) => b.swing - a.swing)[0];
  if (!best || best.swing - baseline < AUTO_COUNTER_MIN_GAIN) {
    return {
      action: "none",
      swing: baseline,
      baseline,
      reason: best ? `best reaction (${best.label}) isn't worth it` : "no workable reaction",
    };
  }
  const delayMs = autoCounterDelayMs({ windowMs, dexMod: defender?.data?.dexMod ?? 0, forCounter: best.action === "counter", rand });
  return { action: best.action, slugId: best.slugId, delayMs, swing: best.swing, baseline, reason: best.label };
}
