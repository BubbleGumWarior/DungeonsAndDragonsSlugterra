// Offline re-implementation of the 1v1 slice of server/src/routes/combat.js.
//
// Every number and formula comes from the game's own pure modules
// (combatRules.js, characterRules.js, equipmentRules.js, itemRules.js,
// autoCounter.js) -- this file only re-plays the *flow* those routes run
// (attack roll -> reaction window -> clash/dodge -> dealHit -> knockout roll,
// turn start ticks, reload/cooldown, hunker, melee) without Postgres or the
// real-time reaction timers, so thousands of fights take seconds.
//
// What is modelled: slug elements' own traits (burn, poison, snare, stun, blind,
// knockback, douse), the +25% Metal bonus, range penalty, "too close" and
// out-of-range fizzles, blaster misfires and pods, the 3-turn slug cooldown +
// Reload, energy pips, counter-clash and Dodge (decided by the game's own NPC
// auto-counter), Hunker Down, First Aid, Intimidate, melee (slash/bludgeon/
// pierce), shields, armor, knockout pips and saves, DoTs (burn/poison/bleed),
// Athletics move speed, Sleight of Hand reload discount.
//
// What is NOT modelled: walls/cover/terrain, more than two combatants (AoE,
// chain arcs, simultaneous team turns), mechas, Perception's early-warning
// reveal, Stealth/Hide, Performance style shots, Fame, loyalty growth, and
// every per-slug "velocity ability" flag beyond the list above.
import * as R from "../../server/src/combatRules.js";
import { actionPoints, computeMaxGrit, skillModifier, statModifier, PROFICIENCY_KEYS } from "../../server/src/characterRules.js";
import { QUALITY_TIERS } from "../../server/src/itemRules.js";
import { meleeDamageFor } from "../../server/src/equipmentRules.js";
import { evaluateAutoCounter } from "../../server/src/autoCounter.js";
import { SLUG_POOLS, makeBlaster, LOADOUTS } from "./catalog.mjs";

// ---- RNG ----------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const d20 = (rng) => 1 + Math.floor(rng() * 20);

// ---- Combatants ---------------------------------------------------------------
function blankStats() {
  return {
    turns: 0, apUnspent: 0, shots: 0, hits: 0, missed: 0, jams: 0, tooClose: 0, outOfRange: 0,
    dmgDealt: 0, shieldAbsorbed: 0, dotTaken: 0, dmgTaken: 0,
    counters: 0, countersWon: 0, dodges: 0, dodgesWon: 0, reflectedAtMe: 0,
    swings: 0, swingHits: 0, hunkerHeal: 0, hunkers: 0, firstAids: 0, intimidates: 0, intimidated: 0,
    koSaves: 0, koFails: 0, moves: 0, reloads: 0, burnDmg: 0, poisonDmg: 0, bleedDmg: 0,
  };
}

// `ablate` (analysis only) switches individual channels of CON / DEX off for everyone, to see
// where a stat's value comes from: conGrit, conKO, conHunker, dexAP, dexDC, dexInit, dexSkills.
export function makeCombatant(build, loadout, idx, ablate = null) {
  const lo = typeof loadout === "string" ? LOADOUTS[loadout] : loadout;
  const st = build.stats;
  const ab = ablate || {};
  const skillStats = ab.dexSkills ? { ...st, dexterity: 10 } : st;
  const skills = Object.fromEntries(PROFICIENCY_KEYS.map((k) => [k, skillModifier(skillStats, build.profs, k)]));
  const blaster = makeBlaster(lo.baseType, lo.quality);
  const beltSlots = build.secondary.kind === "ammo_belt" ? build.secondary.extraSlots : 0;
  const mag = blaster.magazine_size + beltSlots;
  const slugs = SLUG_POOLS[lo.pool].map((t, i) => {
    const base = {
      id: i, name: t.name, type: t.type, clash_power: t.clash_power, clash_defense: t.clash_defense, ap_cost: t.ap_cost,
      loyalty_tier: lo.loyaltyTier, causes_knockback: Boolean(t.causes_knockback), grapple: Boolean(t.grapple),
      energy_pips: new Array(t.max_pips).fill(true), inMag: i < mag, loaded: i < mag, cooldown_turns_left: 0, pod_broken: false,
    };
    // Effective numbers (loyalty folded in, exactly once -- see applyLoyaltyToSlug).
    base.eff = R.applyLoyaltyToSlug({ ...base, energy_pips: undefined });
    base.eff = { ...base.eff, id: i };
    return base;
  });
  const maxGrit = computeMaxGrit(ab.conGrit ? { ...st, constitution: 10 } : st, build.armor?.gritBonus ?? 0);
  const conReal = statModifier(st.constitution);
  const dexReal = statModifier(st.dexterity);
  const maxAp = actionPoints(ab.dexAP ? { ...st, dexterity: 10 } : st);
  return {
    idx, id: idx, name: build.name, build, kind: "character",
    // data.conMod is the Hunker Down modifier; koMod the knockout-save one; initMod the initiative one.
    data: { dexMod: ab.dexDC ? 0 : dexReal, conMod: ab.conHunker ? 0 : conReal, strMod: statModifier(st.strength), skills },
    koMod: ab.conKO ? 0 : conReal, initMod: ab.dexInit ? 0 : dexReal,
    max_ap: maxAp, current_ap: maxAp,
    max_grit: maxGrit, current_grit: maxGrit,
    knockout_pips: [false, false, false], unconscious: false,
    status_effects: {}, damaged_this_turn: false,
    pos: 0, speedPerAp: R.moveSpeedPerAp(skills.athletics),
    blaster, slugs, pods: 6,
    melee: build.secondary.kind === "melee" ? build.secondary : null,
    shield: build.secondary.kind === "shield" ? { absorb: build.secondary.absorb, used: 0 } : null,
    stats: blankStats(),
  };
}

export const dist = (a, b) => Math.abs(a.pos - b.pos);
const hasPips = (s) => s.energy_pips.some(Boolean);

export const readySlugs = (c) => c.slugs.filter((s) => s.inMag && s.loaded && s.cooldown_turns_left === 0 && hasPips(s));
export const returnedSlugs = (c) => c.slugs.filter((s) => s.inMag && !s.loaded && s.cooldown_turns_left === 0 && hasPips(s) && (!s.pod_broken || c.pods > 0));
export const eligibleCounters = (c) => (c.unconscious ? [] : readySlugs(c).filter((s) => s.ap_cost <= c.current_ap));
export const canDodge = (c) =>
  !c.unconscious && !(c.status_effects.snared?.turnsLeft > 0) && c.current_ap >= R.DODGE_AP_COST && c.data.skills.acrobatics > 0;
export const reloadCost = (c) => R.reloadApCostFor(Math.max(1, c.blaster.reload_ap_cost), c.data.skills.sleightOfHand);

function spendPip(slug) {
  const i = slug.energy_pips.indexOf(true);
  if (i !== -1) slug.energy_pips[i] = false;
  slug.cooldown_turns_left = R.SLUG_RETURN_TURNS;
  slug.loaded = false;
}

// ---- Knockout -----------------------------------------------------------------
export function knockoutRoll(ctx, c) {
  if (c.unconscious) return;
  const used = R.countKnockoutPipsUsed(c.knockout_pips);
  if (used >= 3) { c.unconscious = true; c.stats.koFails++; return; }
  const total = d20(ctx.rng) + c.koMod;
  if (total >= R.knockoutDC(used)) {
    c.knockout_pips[c.knockout_pips.findIndex((p) => !p)] = true;
    c.current_grit = c.max_grit;
    c.stats.koSaves++;
    ctx.log?.(`  ${c.name} KO save ${total} vs ${R.knockoutDC(used)}: back up at full Grit`);
  } else {
    c.unconscious = true;
    c.stats.koFails++;
    ctx.log?.(`  ${c.name} KO save ${total} vs ${R.knockoutDC(used)}: DOWN`);
  }
}

// ---- Damage -------------------------------------------------------------------
// `slug` is an EFFECTIVE slug (loyalty already applied) or a synthetic melee slug.
export function dealHit(ctx, shooter, target, slug, { countered = false } = {}) {
  let amount = R.slugBaseHitAmount(slug);
  if (R.slugHasType(slug, "Metal") && !countered) amount = Math.round(amount * R.METAL_UNCOUNTERED_MULTIPLIER);

  let grit = amount;
  if (target.shield && grit > 0 && !slug.pierces_shield) {
    const left = target.shield.absorb - target.shield.used;
    if (left > 0) {
      const taken = Math.min(left, grit);
      target.shield.used += taken;
      grit -= taken;
      target.stats.shieldAbsorbed += taken;
    }
  }

  const before = target.current_grit;
  const after = Math.max(0, before - grit);
  const st = target.status_effects;
  if (R.slugHasTrait(slug, "burn") || slug.causes_burn) st.burning = { turnsLeft: R.BURN_DURATION_TURNS, damage: R.computeBurnDamage(slug.clash_power), by: shooter.idx };
  if (R.slugHasTrait(slug, "poison")) st.poison = { stacks: (st.poison?.stacks || 0) + 1, turnsLeft: R.POISON_DURATION_TURNS, by: shooter.idx };
  if (R.slugHasTrait(slug, "snare") || slug.causes_snare) st.snared = { turnsLeft: R.SNARE_DURATION_TURNS };
  if ((R.slugHasTrait(slug, "stun") && !slug.mind_scramble) || slug.causes_stun) st.stunned = { ap: R.stunApOf(st.stunned) + R.computeStunAp(amount) };
  if (R.slugHasTrait(slug, "blind") || slug.causes_blind) st.blinded = true;
  if (slug.causes_bleed) st.bleeding = { turnsLeft: R.BLEED_DURATION_TURNS, by: shooter.idx };
  if (R.slugHasTrait(slug, "douse")) {
    delete st.burning;
    const live = target.slugs.filter((s) => s.inMag && hasPips(s));
    if (live.length) { const s = live[Math.floor(ctx.rng() * live.length)]; s.energy_pips[s.energy_pips.lastIndexOf(true)] = false; }
  }

  target.current_grit = after;
  target.damaged_this_turn = true;
  const applied = Math.min(grit, before);
  shooter.stats.dmgDealt += applied;
  target.stats.dmgTaken += applied;

  if (slug.grapple) {
    // Grapple: the hit hooks the target and reels them toward the shooter, in place of any knockback.
    const travel = Math.min(R.GRAPPLE_MAX_DISTANCE, Math.max(0, dist(shooter, target) - R.GRAPPLE_STOP_DISTANCE));
    if (travel >= 1) target.pos += (shooter.pos > target.pos ? 1 : -1) * travel;
  } else {
    const kb = R.shotKnockbackDistance(slug);
    if (kb > 0) target.pos += (target.pos >= shooter.pos ? 1 : -1) * kb;
  }
  if (after === 0 && !target.unconscious) knockoutRoll(ctx, target);
  return applied;
}

// ---- Attack rolls -------------------------------------------------------------
// A "blinded" roll is made twice taking the lower (and consumed); keen vision the
// mirror image. Neither is used by the standard loadout's foes except Light's blind.
function rollWithStatus(ctx, c) {
  let roll = d20(ctx.rng);
  if (c.status_effects.blinded) { roll = Math.min(roll, d20(ctx.rng)); delete c.status_effects.blinded; }
  else if (c.status_effects.keenVision) { roll = Math.max(roll, d20(ctx.rng)); delete c.status_effects.keenVision; }
  return roll;
}

// ---- Actions ------------------------------------------------------------------
export function shoot(ctx, att, def, slug) {
  const eff = slug.eff;
  const cost = R.gatlingShotApCost(att.blaster, eff.ap_cost);
  att.current_ap -= cost;
  spendPip(slug);
  att.stats.shots++;

  const quality = QUALITY_TIERS[att.blaster.quality];
  if (ctx.rng() * 100 < quality.failRate) { att.stats.jams++; slug.pod_broken = true; ctx.log?.(`${att.name} fires ${slug.name}: MISFIRE`); return "jam"; }

  const d = dist(att, def);
  if (R.shotTooClose(d, att.blaster.speed, eff)) { att.stats.tooClose++; ctx.log?.(`${att.name} fires ${slug.name} at ${Math.round(d)}u: TOO CLOSE`); return "too_close"; }
  const tb = R.slugBallistics(eff);
  if (d > att.blaster.range + tb.range) { att.stats.outOfRange++; ctx.log?.(`${att.name} fires ${slug.name} at ${Math.round(d)}u: OUT OF RANGE`); return "out_of_range"; }
  const windowMs = R.shotFlightMs(d, att.blaster.speed, eff);

  const hadKeen = Boolean(att.status_effects.keenVision);
  const roll = rollWithStatus(ctx, att);
  const penalty = hadKeen ? 0 : R.rangePenalty(d, Math.max(att.blaster.range, tb.range));
  const attackTotal = roll + att.blaster.accuracy + quality.accuracyBonus + tb.accuracyMod + penalty
    + R.loyaltyAccuracyModifier(eff.loyalty_tier) + R.blasterTypeAccuracyBonus(att.blaster, att);
  const dc = 10 + def.data.dexMod;
  if (attackTotal < dc) { att.stats.missed++; ctx.log?.(`${att.name} fires ${slug.name} at ${Math.round(d)}u: miss (${attackTotal} vs DC ${dc})`); return "miss"; } // a miss never opens a reaction window

  // ---- the reaction window (only a shot that will land opens one) ----
  const eligible = eligibleCounters(def);
  const dodgeOk = canDodge(def);
  let react = { action: "none" };
  if ((eligible.length > 0 || dodgeOk) && ctx.pol[def.idx].react !== "none") {
    react = evaluateAutoCounter({
      incoming: eff, attacker: att, defender: def, counters: eligible.map((s) => s.eff), canDodge: dodgeOk,
      acrobaticsMod: def.data.skills.acrobatics, windowMs, attackRoll: { attackTotal, roll, dc }, rand: ctx.rng,
    });
  }

  if (react.action === "dodge") {
    def.current_ap -= R.DODGE_AP_COST;
    def.stats.dodges++;
    const dodgeTotal = d20(ctx.rng) + def.data.skills.acrobatics;
    if (dodgeTotal > attackTotal) { def.stats.dodgesWon++; ctx.log?.(`${att.name} fires ${slug.name} (${attackTotal}): ${def.name} DODGES (${dodgeTotal})`); return "dodged"; }
    att.stats.hits++;
    const dn = dealHit(ctx, att, def, eff);
    ctx.log?.(`${att.name} fires ${slug.name} (${attackTotal}): dodge fails (${dodgeTotal}) -> ${dn} dmg`);
    return "hit";
  }

  if (react.action === "counter") {
    const cs = eligible.find((s) => s.id === react.slugId);
    def.current_ap -= cs.ap_cost;
    spendPip(cs);
    def.stats.counters++;
    const outcome = R.resolveClash({
      attackerPower: eff.clash_power, attackerDefense: eff.clash_defense,
      defenderPower: cs.eff.clash_power, defenderDefense: cs.eff.clash_defense,
    });
    if (outcome === "attacker-wins") { att.stats.hits++; const cn = dealHit(ctx, att, def, eff, { countered: true }); ctx.log?.(`${att.name} fires ${slug.name}: ${def.name} counters with ${cs.name} -> smashed through, ${cn} dmg`); return "clash_won"; }
    if (outcome === "defender-wins") {
      def.stats.countersWon++;
      att.stats.reflectedAtMe++;
      const cn = dealHit(ctx, def, att, cs.eff, { countered: true });
      ctx.log?.(`${att.name} fires ${slug.name}: ${def.name} counters with ${cs.name} -> REFLECTED, ${cn} dmg to ${att.name}`);
      return "clash_lost";
    }
    ctx.log?.(`${att.name} fires ${slug.name}: ${def.name} counters with ${cs.name} -> ${outcome}`);
    return outcome === "double-break" ? "clash_double" : "clash_bounce";
  }

  att.stats.hits++;
  const hn = dealHit(ctx, att, def, eff);
  ctx.log?.(`${att.name} fires ${slug.name} at ${Math.round(d)}u (${attackTotal} vs ${dc}): HIT ${hn} dmg`);
  return "hit";
}

export function swing(ctx, att, def) {
  const w = att.melee;
  att.current_ap -= w.apCost;
  att.stats.swings++;
  const roll = rollWithStatus(ctx, att);
  const dc = 10 + def.data.dexMod;
  if (roll + att.data.strMod + w.accuracy < dc) { ctx.log?.(`${att.name} swings ${w.name}: miss`); return "miss"; }
  att.stats.swingHits++;
  const slug = {
    name: w.name, type: "None", clash_power: meleeDamageFor(w.damage, att.data.strMod), loyalty_tier: 1,
    ...(w.meleeType === "bludgeon" ? { melee_knockback: R.MELEE_KNOCKBACK_DISTANCE } : {}),
    ...(w.meleeType === "slash" ? { causes_bleed: true } : {}),
    ...(w.meleeType === "pierce" ? { pierces_shield: true } : {}),
  };
  const sn = dealHit(ctx, att, def, slug);
  ctx.log?.(`${att.name} swings ${w.name}: HIT ${sn} dmg`);
  return "hit";
}

export function reload(ctx, c) {
  const list = returnedSlugs(c);
  if (list.length === 0) return false;
  const cost = reloadCost(c);
  if (c.current_ap < cost) return false;
  c.current_ap -= cost;
  // Pod-broken slugs (a misfire) each burn a spare pod.
  for (const s of c.slugs.filter((x) => x.inMag && !x.loaded && x.cooldown_turns_left === 0)) {
    if (s.pod_broken) { if (c.pods <= 0) continue; c.pods--; s.pod_broken = false; }
    s.loaded = true;
  }
  c.stats.reloads++;
  ctx.log?.(`${c.name} reloads (${cost} AP)`);
  return true;
}

export function hunker(ctx, c) {
  if (c.damaged_this_turn || c.current_ap < 1 || c.current_grit <= 0) return false;
  const heal = R.hunkerHeal(c.data.conMod, c.current_ap);
  const next = Math.min(c.max_grit, c.current_grit + heal);
  c.stats.hunkerHeal += next - c.current_grit;
  c.stats.hunkers++;
  c.current_grit = next;
  c.current_ap = 0;
  ctx.log?.(`${c.name} hunkers down -> ${c.current_grit}/${c.max_grit}`);
  return true;
}

// Move so the gap changes by `delta` (negative = close in). Costs AP like the
// real Move action (distance / speedPerAp, rounded up, never less than 1).
export function moveBy(ctx, c, foe, delta) {
  if (c.status_effects.snared?.turnsLeft > 0) return false;
  const d = dist(c, foe);
  const target = Math.max(1, d + delta);
  const walked = Math.abs(target - d);
  if (walked === 0) return false;
  const cost = Math.max(1, Math.ceil(walked / c.speedPerAp));
  if (c.current_ap < cost) return false;
  c.current_ap -= cost;
  const dir = c.pos >= foe.pos ? 1 : -1; // away from the foe
  c.pos += dir * (target - d);
  c.stats.moves++;
  ctx.log?.(`${c.name} moves ${delta < 0 ? "in" : "out"} -> gap ${Math.round(target)}u (${cost} AP)`);
  return true;
}
export const moveCost = (c, walked) => Math.max(1, Math.ceil(walked / c.speedPerAp));

export function firstAid(ctx, c) {
  const cost = R.firstAidApCost(c.data.skills.medicine);
  const cured = R.NEGATIVE_STATUS_KEYS.filter((k) => c.status_effects[k]);
  if (cured.length === 0 || c.current_ap < cost) return false;
  c.current_ap -= cost;
  for (const k of cured) delete c.status_effects[k];
  c.stats.firstAids++;
  return true;
}

export function intimidate(ctx, c, foe) {
  const mod = c.data.skills.intimidation;
  if (mod <= 0 || c.current_ap < R.INTIMIDATE_AP_COST || dist(c, foe) > R.INTIMIDATE_RANGE) return false;
  c.current_ap -= R.INTIMIDATE_AP_COST;
  c.stats.intimidates++;
  if (d20(ctx.rng) + mod > R.INTIMIDATE_DC) { foe.status_effects.intimidated = { apPenalty: R.INTIMIDATE_AP_PENALTY }; foe.stats.intimidated++; }
  return true;
}

// ---- Turn start ---------------------------------------------------------------
// Mirrors beginCombatantTurn: stun / intimidate dock the AP refill, burn / bleed /
// poison tick (and can drop you to 0 Grit -> knockout roll), snare etc. count
// down, slug cooldowns tick.
export function startTurn(ctx, c) {
  const stunAp = R.stunApOf(c.status_effects.stunned);
  const intim = c.status_effects.intimidated?.apPenalty ?? 0;
  const refill = Math.max(0, (stunAp > 0 ? Math.max(0, c.max_ap - stunAp) : c.max_ap) - intim);
  const after = { ...c.status_effects };
  delete after.stunned; delete after.shocked; delete after.feared; delete after.intimidated;
  const tick = R.tickStatusEffects(after, false, c.max_grit);
  for (const s of c.slugs) if (s.cooldown_turns_left > 0) s.cooldown_turns_left -= 1;
  c.current_ap = refill;
  c.damaged_this_turn = false;
  c.status_effects = tick.statusEffects;
  ctx.log?.(`-- ${c.name} turn: AP ${refill}/${c.max_ap}, Grit ${c.current_grit}/${c.max_grit}${tick.damage ? `, DoT ${tick.damage}` : ""}`);
  if (tick.damage > 0) {
    const applied = Math.min(tick.damage, c.current_grit);
    c.current_grit = Math.max(0, c.current_grit - tick.damage);
    c.stats.dotTaken += applied;
    for (const src of tick.sources) {
      if (src.kind === "burn") c.stats.burnDmg += src.amount;
      else if (src.kind === "poison") c.stats.poisonDmg += src.amount;
      else if (src.kind === "bleed") c.stats.bleedDmg += src.amount;
    }
    // Credit DoT damage to whoever applied it.
    const by = ctx.fighters[tick.sources[0]?.by ?? -1];
    if (by && by !== c) by.stats.dmgDealt += applied;
    if (c.current_grit === 0 && !c.unconscious) knockoutRoll(ctx, c);
  }
  if (tick.heal > 0 && c.current_grit > 0) c.current_grit = Math.min(c.max_grit, c.current_grit + tick.heal);
}
