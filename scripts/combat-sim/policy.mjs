// What a competent player does with a turn. Every build uses the SAME policy --
// only its stats, skills and Secondary item differ -- so differences in results
// come from the build, not from the player.
//
// The decision loop works on an `io` object so the exact same logic runs twice:
//   * dry-run  -> expected damage for "shoot only" vs "shoot then melee" vs Hunker
//   * real run -> actually performs the actions through engine.mjs
// (and shot choice uses the game's own forecast for how the foe will react).
import * as R from "../../server/src/combatRules.js";
import { QUALITY_TIERS } from "../../server/src/itemRules.js";
import { meleeDamageFor } from "../../server/src/equipmentRules.js";
import * as E from "./engine.mjs";

export const DEFAULT_POLICY = {
  reserveMax: 4,          // AP held back for a counter-clash / Dodge during the foe's turn (capped at the cheapest reaction's cost)
  hunkerFullBelow: 0.6,   // spend the whole turn Hunkering when at/below this Grit fraction (and it out-values attacking)
  hunkerLeftoverBelow: 0.8, // ...and sink leftover AP into a Hunker when at/below this fraction
  firstAid: true,
  intimidate: false,
  react: "auto",          // "auto" = the game's NPC auto-counter forecast; "none" = never react
  assumedStop: 0.3,       // share of an attack a shooter assumes a reactive foe will negate (shot choice only)
  patientAp: 0,           // >0: don't open fire while the foe can still react and holds at least this much AP
  intimidateFirst: false, // try to Intimidate (when the modifier is positive) before doing anything else
  kite: true,             // a shooter facing a melee weapon spends spare AP backing away, so the foe burns AP closing instead of swinging
};

// P(d20 + mod >= dc), with optional disadvantage (roll twice, keep lower).
function pRoll(mod, dc, disadvantage) {
  const need = dc - mod;
  const p = need <= 1 ? 1 : need > 20 ? 0 : (21 - need) / 20;
  return disadvantage ? p * p : p;
}

// ---- Dry-run / real io -------------------------------------------------------------
function foeFlags(f) {
  return {
    burning: Boolean(f.status_effects.burning),
    bleeding: Boolean(f.status_effects.bleeding),
    blinded: Boolean(f.status_effects.blinded),
    shieldLeft: f.shield ? f.shield.absorb - f.shield.used : 0,
  };
}

function realIO(ctx, c, foe) {
  return {
    dry: false,
    ap: () => c.current_ap,
    dist: () => E.dist(c, foe),
    ready: () => E.readySlugs(c).map((slug) => ({ slug, cost: R.gatlingShotApCost(c.blaster, slug.eff.ap_cost) })),
    returnedCount: () => E.returnedSlugs(c).length,
    reloadCost: () => E.reloadCost(c),
    counterCosts: () => E.readySlugs(c).map((s) => s.ap_cost),
    dodgeOk: () => E.canDodge(c),
    blinded: () => Boolean(c.status_effects.blinded),
    foe: () => foeFlags(foe),
    shoot: (v) => { E.shoot(ctx, c, foe, v.slug); },
    reload: () => { E.reload(ctx, c); },
    moveBy: (delta) => E.moveBy(ctx, c, foe, delta),
    swing: () => { E.swing(ctx, c, foe); },
    done: () => foe.unconscious || c.unconscious,
  };
}

function dryIO(ctx, c, foe) {
  const s = {
    ap: c.current_ap, d: E.dist(c, foe), ev: 0, blinded: Boolean(c.status_effects.blinded), foe: foeFlags(foe),
    slugs: c.slugs.filter((x) => x.inMag).map((x) => ({ ref: x, loaded: x.loaded, cd: x.cooldown_turns_left, pips: x.energy_pips.some(Boolean) })),
    snared: c.status_effects.snared?.turnsLeft > 0,
  };
  const readyV = () => s.slugs.filter((x) => x.loaded && x.cd === 0 && x.pips);
  return {
    dry: true, state: s,
    ap: () => s.ap,
    dist: () => s.d,
    ready: () => readyV().map((x) => ({ slug: x.ref, v: x, cost: R.gatlingShotApCost(c.blaster, x.ref.eff.ap_cost) })),
    returnedCount: () => s.slugs.filter((x) => !x.loaded && x.cd === 0 && x.pips).length,
    reloadCost: () => E.reloadCost(c),
    counterCosts: () => readyV().map((x) => x.ref.ap_cost),
    dodgeOk: () => !s.snared && c.data.skills.acrobatics > 0,
    blinded: () => s.blinded,
    foe: () => s.foe,
    shoot: (v) => {
      s.ap -= v.cost; v.v.loaded = false; v.v.cd = R.SLUG_RETURN_TURNS;
      s.ev += v.a.ev; s.blinded = false;
      const eff = v.slug.eff;
      if (R.slugHasTrait(eff, "burn")) s.foe.burning = true;
      if (R.slugHasTrait(eff, "blind")) s.foe.blinded = true;
      if (eff.grapple) s.d -= Math.min(R.GRAPPLE_MAX_DISTANCE, Math.max(0, s.d - R.GRAPPLE_STOP_DISTANCE));
      else { const kb = R.shotKnockbackDistance(eff); if (kb > 0) s.d += kb; }
    },
    reload: () => { s.ap -= E.reloadCost(c); for (const x of s.slugs) if (!x.loaded && x.cd === 0 && x.pips) x.loaded = true; },
    moveBy: (delta) => {
      if (s.snared) return false;
      const target = Math.max(1, s.d + delta);
      const cost = E.moveCost(c, Math.abs(target - s.d));
      if (s.ap < cost) return false;
      s.ap -= cost; s.d = target; return true;
    },
    swing: () => {
      const w = c.melee;
      s.ap -= w.apCost; s.ev += meleeAnalysis(c, foe, s.blinded, s.foe).ev; s.blinded = false;
      if (w.meleeType === "slash") s.foe.bleeding = true;
      if (w.meleeType === "bludgeon") s.d += R.MELEE_KNOCKBACK_DISTANCE;
    },
    done: () => false,
  };
}

// ---- Shot / swing valuation --------------------------------------------------------
function meleeAnalysis(c, foe, blinded, ff) {
  const w = c.melee;
  const strMod = c.data.strMod;
  const dc = 10 + foe.data.dexMod;
  const pHit = pRoll(strMod + w.accuracy, dc, blinded);
  let dmg = meleeDamageFor(w.damage, strMod);
  if (ff.shieldLeft > 0 && w.meleeType !== "pierce") dmg *= 0.5; // soaked damage only chips the shield
  let extra = 0;
  if (w.meleeType === "slash") extra += ff.bleeding ? 0.1 * foe.max_grit : 0.3 * foe.max_grit;
  if (w.meleeType === "bludgeon") extra -= 0.4;
  return { pHit, ev: pHit * (dmg + extra) };
}

function slugAnalysis(ctx, io, c, foe, slug, d) {
  const eff = slug.eff;
  const tb = R.slugBallistics(eff);
  const feasible = d > R.shotWindupDistance(c.blaster.speed) && d <= c.blaster.range + tb.range;
  if (!feasible) return { feasible: false, ev: 0 };
  const q = QUALITY_TIERS[c.blaster.quality];
  const mod = c.blaster.accuracy + q.accuracyBonus + tb.accuracyMod + R.rangePenalty(d, Math.max(c.blaster.range, tb.range))
    + R.loyaltyAccuracyModifier(eff.loyalty_tier) + R.blasterTypeAccuracyBonus(c.blaster, c);
  const dc = 10 + foe.data.dexMod;
  const pHit = pRoll(mod, dc, io.blinded());
  let amount = R.slugBaseHitAmount(eff);
  if (R.slugHasType(eff, "Metal")) amount = Math.round(amount * R.METAL_UNCOUNTERED_MULTIPLIER);
  const ff = io.foe();
  if (ff.shieldLeft > 0) amount *= 0.5;
  let extra = 0;
  if (R.slugHasTrait(eff, "burn")) extra += ff.burning ? 0.8 * R.computeBurnDamage(eff.clash_power) : 2.5 * R.computeBurnDamage(eff.clash_power);
  if (R.slugHasTrait(eff, "poison")) extra += 4;
  if (R.slugHasTrait(eff, "blind") && !ff.blinded) extra += 1.2;
  if (R.slugHasTrait(eff, "stun") || eff.causes_stun) extra += 0.5 * R.computeStunAp(amount);
  // a snared foe can't Move: harmless to a shooter's range game, but it pins a ranged foe inside a melee user's reach
  if (R.slugHasTrait(eff, "snare") || eff.causes_snare) extra += foe.melee ? 0.3 : c.melee ? 3 : 0;
  if (eff.grapple) {
    // reeled in to melee range: the walk the melee user no longer has to pay for
    const gap = Math.max(0, d - (c.melee?.reach ?? 0) - 1);
    if (c.melee && gap > 0) extra += E.moveCost(c, Math.min(gap, R.GRAPPLE_MAX_DISTANCE)) * (meleeAnalysis(c, foe, false, ff).ev / c.melee.apCost);
  } else if (R.shotKnockbackDistance(eff) > 0) extra += c.melee ? -0.4 : foe.melee ? 0.8 : 0;
  // A real shooter can't see the foe's counter slugs, so this is a flat discount for "they
  // might counter or dodge" -- applied only when the foe actually has a reaction available.
  const foeCanReact = (E.eligibleCounters(foe).length > 0 || E.canDodge(foe)) && ctx.pol[foe.idx].react !== "none";
  const f = foeCanReact ? 1 - ctx.pol[c.idx].assumedStop : 1;
  const pOk = 1 - q.failRate / 100;
  const ev = pOk * pHit * f * (amount + extra);
  return { feasible: true, ev, pHit };
}

// ---- The turn loop -------------------------------------------------------------------
function reserveFor(io, pol) {
  const costs = io.counterCosts();
  const r = costs.length ? Math.min(...costs) : io.dodgeOk() ? R.DODGE_AP_COST : 0;
  return Math.min(pol.reserveMax, r);
}

function bestShot(ctx, io, c, foe, d, budget) {
  let best = null;
  for (const v of io.ready()) {
    if (v.cost > budget) continue;
    const a = slugAnalysis(ctx, io, c, foe, v.slug, d);
    if (!a.feasible || a.ev <= 0.3) continue;
    const score = a.ev / v.cost;
    if (!best || score > best.score + 1e-9) best = { ...v, a, score };
  }
  return best;
}

// stance "shoot": fire, reload, and step into range if the foe is too close / far.
// stance "mixed": same, but spend what's left closing in and swinging the melee weapon.
function runOffense(ctx, io, c, foe, pol, stance) {
  const meleeAvail = stance === "mixed" && c.melee;
  for (let guard = 0; guard < 30; guard++) {
    if (io.done()) return;
    const budget = io.ap() - reserveFor(io, pol);
    if (budget < 1) return;
    const d = io.dist();

    // A) the best shot that works from here
    const shot = bestShot(ctx, io, c, foe, d, budget);
    if (shot) { io.shoot(shot); continue; }

    // B) chamber slugs that have come back
    if (io.returnedCount() > 0 && budget >= io.reloadCost()) { io.reload(); continue; }

    // C) shooters: step into a slug's firing band (retreat if too close, advance if too far)
    if (!meleeAvail) {
      let bestMove = null;
      for (const v of io.ready()) {
        const tb = R.slugBallistics(v.slug.eff);
        const lo = R.shotWindupDistance(c.blaster.speed) + 2;
        const hi = c.blaster.range + tb.range - 2;
        const delta = d < lo ? lo - d : d > hi ? hi - d : 0; // signed change in gap
        if (delta === 0) continue;
        const mc = E.moveCost(c, Math.abs(delta));
        if (mc + v.cost > budget) continue;
        const a = slugAnalysis(ctx, io, c, foe, v.slug, d + delta);
        if (!a.feasible || a.ev <= 0.3) continue;
        const score = a.ev / (mc + v.cost);
        if (!bestMove || score > bestMove.score) bestMove = { delta, score };
      }
      if (bestMove && io.moveBy(bestMove.delta)) continue;
      return;
    }

    // D) melee: close to reach, then swing
    const w = c.melee;
    if (d <= w.reach) {
      if (budget >= w.apCost) { io.swing(); continue; }
      return;
    }
    const walk = d - w.reach + 1;
    if (budget >= E.moveCost(c, walk) + w.apCost && io.moveBy(-walk)) continue;
    return;
  }
}

function dryOffense(ctx, c, foe, pol, stance) {
  const io = dryIO(ctx, c, foe);
  runOffense(ctx, io, c, foe, pol, stance);
  return io.state.ev;
}

// First Aid on yourself: only worth the AP when what it cures would cost more than it does.
function maybeFirstAid(ctx, c, pol) {
  if (!pol.firstAid) return;
  const s = c.status_effects;
  let val = 0;
  if (s.burning) val += s.burning.damage * s.burning.turnsLeft;
  if (s.poison) val += s.poison.stacks * 4;
  if (s.bleeding) val += 0.1 * c.max_grit * s.bleeding.turnsLeft;
  if (s.blinded) val += 1.2;
  if (val === 0) return;
  const cost = R.firstAidApCost(c.data.skills.medicine);
  if (cost <= 0.6 * c.current_ap && val >= 1.5 * cost) E.firstAid(ctx, c);
}

export function takeTurn(ctx, c, foe, pol) {
  maybeFirstAid(ctx, c, pol);
  if (foe.unconscious || c.unconscious) return;

  if (pol.intimidateFirst && c.data.skills.intimidation > 0 && !foe.status_effects.intimidated && c.current_ap >= R.INTIMIDATE_AP_COST + 2) E.intimidate(ctx, c, foe);

  // 0) patient play: a foe with AP to spare and a slug to counter with eats an attack for free,
  //    so just get your slugs back in hand and let them make the first move.
  if (pol.patientAp > 0 && foe.current_ap >= pol.patientAp && (E.eligibleCounters(foe).length > 0 || E.canDodge(foe))) {
    const io = realIO(ctx, c, foe);
    while (io.returnedCount() > 0 && io.ap() - io.reloadCost() >= 0 && E.reload(ctx, c)) { /* chambered */ }
    if (!c.damaged_this_turn && c.current_grit < c.max_grit && c.current_ap >= 1) {
      const heal = R.hunkerHeal(c.data.conMod, c.current_ap);
      if (c.current_grit / c.max_grit <= pol.hunkerLeftoverBelow && heal >= 3) E.hunker(ctx, c);
    }
    return;
  }

  // 1) pick a stance by expected damage
  const evShoot = dryOffense(ctx, c, foe, pol, "shoot");
  let stance = "shoot";
  let bestEv = evShoot;
  if (c.melee) {
    const evMixed = dryOffense(ctx, c, foe, pol, "mixed");
    if (evMixed > evShoot) { stance = "mixed"; bestEv = evMixed; }
  }

  // 2) a whole turn of Hunker Down when hurt and attacking isn't worth more
  const frac = c.current_grit / c.max_grit;
  if (!c.damaged_this_turn && frac <= pol.hunkerFullBelow) {
    const heal = Math.min(c.max_grit - c.current_grit, R.hunkerHeal(c.data.conMod, c.current_ap));
    if (heal >= bestEv) { E.hunker(ctx, c); return; }
  }

  // 3) attack
  runOffense(ctx, realIO(ctx, c, foe), c, foe, pol, stance);
  if (foe.unconscious || c.unconscious) return;

  // 3b) kiting: every AP the foe spends closing the gap is an AP it doesn't swing with, and a shooter's AP is mostly spare
  //     (slug cooldowns, not AP, limit its shots). Back off towards the edge of the slugs' reach.
  if (pol.kite && stance === "shoot" && foe.melee) {
    const spare = c.current_ap - reserveFor(realIO(ctx, c, foe), pol);
    const cap = c.blaster.range + 225;
    const walk = Math.min(Math.max(0, cap - E.dist(c, foe)), spare * c.speedPerAp);
    if (spare >= 1 && walk >= 1) E.moveBy(ctx, c, foe, walk);
  }

  // 4) spare AP: intimidate, then patch yourself up
  if (pol.intimidate && c.data.skills.intimidation > 0 && c.current_ap - reserveFor(realIO(ctx, c, foe), pol) >= R.INTIMIDATE_AP_COST) {
    E.intimidate(ctx, c, foe);
  }
  if (!c.damaged_this_turn && c.current_ap >= 1 && c.current_grit / c.max_grit <= pol.hunkerLeftoverBelow) {
    const heal = R.hunkerHeal(c.data.conMod, c.current_ap);
    if (heal >= 3) E.hunker(ctx, c);
  }
}

// Alternative ways of playing, used to check that the build rankings don't just reflect one style.
export const POLICY_VARIANTS = {
  default: DEFAULT_POLICY,
  noKite: { ...DEFAULT_POLICY, kite: false },
  noReserve: { ...DEFAULT_POLICY, reserveMax: 0 },
  noReactions: { ...DEFAULT_POLICY, react: "none" },
  noHunkerLeftover: { ...DEFAULT_POLICY, hunkerLeftoverBelow: 0 },
  eagerHunker: { ...DEFAULT_POLICY, hunkerFullBelow: 0.8, hunkerLeftoverBelow: 1 },
  stubborn: { ...DEFAULT_POLICY, hunkerFullBelow: 0, hunkerLeftoverBelow: 0 },
  intimidator: { ...DEFAULT_POLICY, intimidate: true },
  intimidateFirst: { ...DEFAULT_POLICY, intimidate: true, intimidateFirst: true },
  noFirstAid: { ...DEFAULT_POLICY, firstAid: false },
};
