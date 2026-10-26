// Checks the engine against the game's own rules: formulas it should inherit unchanged, and a few
// mechanics (cooldown/reload cycle, burn, knockout saves, hit odds) worked out by hand.
//   node scripts/combat-sim/selftest.mjs
import assert from "node:assert/strict";
import * as R from "../../server/src/combatRules.js";
import { actionPoints, computeMaxGrit } from "../../server/src/characterRules.js";
import { meleeDamageFor } from "../../server/src/equipmentRules.js";
import { QUALITY_TIERS } from "../../server/src/itemRules.js";
import * as E from "./engine.mjs";
import { makeBuild, assertLegal, enumeratePointBuys, SECONDARIES } from "./catalog.mjs";
import { runDuel } from "./duel.mjs";

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };
const st = (str, dex, con, int, wis, cha) => ({ strength: str, dexterity: dex, constitution: con, intelligence: int, wisdom: wis, charisma: cha });
const ctxFor = (seed = 1, fighters = []) => ({ rng: E.mulberry32(seed), fighters, pol: [{ react: "none" }, { react: "none" }] });

console.log("rules the engine inherits");
ok("12,282 legal point buys", () => assert.equal(enumeratePointBuys().length, 12282));
ok("AP by DEX: 8/8/9/12 for mods -1/0/+1/+2", () => {
  assert.deepEqual([8, 10, 12, 14].map((d) => actionPoints(st(10, d, 10, 10, 10, 10))), [8, 8, 9, 12]);
});
ok("max Grit = 20 + 5*CON + DEX (+armor)", () => {
  assert.equal(computeMaxGrit(st(10, 14, 14, 10, 10, 10)), 20 + 10 + 2);
  const c = E.makeCombatant(makeBuild("t", st(10, 14, 14, 10, 10, 10), [], "none", "chain"), "standard", 0);
  assert.equal(c.max_grit, 20 + 10 + 2 + 15);
});
ok("melee damage: STR mod <1 is added, >=1 multiplies", () => {
  assert.deepEqual([-1, 0, 1, 2].map((m) => meleeDamageFor(6, m)), [5, 6, 6, 12]);
});

console.log("engine mechanics");
ok("a fired slug is back after 3 of its owner's turns and needs a Reload", () => {
  const b = makeBuild("t", st(10, 14, 14, 10, 10, 10), [], "none");
  const a = E.makeCombatant(b, "standard", 0), f = E.makeCombatant(b, "standard", 1);
  f.pos = 300;
  const ctx = ctxFor(5, [a, f]);
  const slug = a.slugs[0];
  E.shoot(ctx, a, f, slug);
  assert.equal(slug.cooldown_turns_left, 3);
  assert.equal(slug.loaded, false);
  E.startTurn(ctx, a); E.startTurn(ctx, a);
  assert.equal(slug.cooldown_turns_left, 1);
  assert.ok(!E.returnedSlugs(a).includes(slug), "not back yet");
  E.startTurn(ctx, a);
  assert.ok(E.returnedSlugs(a).includes(slug), "back in hand, unchambered");
  assert.equal(E.readySlugs(a).includes(slug), false);
  assert.ok(E.reload(ctx, a));
  assert.ok(E.readySlugs(a).includes(slug));
});
ok("burn ticks for 3 turns at the slug's own (loyalty-boosted) power", () => {
  const b = makeBuild("t", st(10, 14, 14, 10, 10, 10), [], "none");
  const a = E.makeCombatant(b, "standard", 0), f = E.makeCombatant(b, "standard", 1);
  const ctx = ctxFor(1, [a, f]);
  const fire = a.slugs[0]; // Frostfire, power 5 +2 loyalty at Friendly
  E.dealHit(ctx, a, f, fire.eff);
  assert.equal(f.status_effects.burning.damage, 7);
  let ticks = 0;
  for (let i = 0; i < 5; i++) { const before = f.stats.burnDmg; E.startTurn(ctx, f); if (f.stats.burnDmg > before) ticks++; }
  assert.equal(ticks, 3);
});
ok("Metal gets +25% only when uncountered", () => {
  const b = makeBuild("t", st(10, 14, 14, 10, 10, 10), [], "none");
  const a = E.makeCombatant(b, "standard", 0), f = E.makeCombatant(b, "standard", 1);
  const ctx = ctxFor(1, [a, f]);
  const metal = a.slugs[2]; // Boltling: 4 +2 loyalty +1 Metal = 7 -> 8.75 -> 9 uncountered
  const g0 = f.current_grit;
  E.dealHit(ctx, a, f, metal.eff);
  assert.equal(g0 - f.current_grit, 9);
  f.current_grit = g0;
  E.dealHit(ctx, a, f, metal.eff, { countered: true });
  assert.equal(g0 - f.current_grit, 7);
});
ok("a shield soaks until its absorb is gone; pierce ignores it", () => {
  const sh = makeBuild("s", st(10, 14, 14, 10, 10, 10), [], "buckler");
  const a = E.makeCombatant(makeBuild("a", st(10, 14, 14, 10, 10, 10), [], "none"), "standard", 0);
  const f = E.makeCombatant(sh, "standard", 1);
  const ctx = ctxFor(1, [a, f]);
  const big = { name: "x", type: "None", clash_power: 8, loyalty_tier: 1 };
  E.dealHit(ctx, a, f, big);
  assert.equal(f.shield.used, 8);
  E.dealHit(ctx, a, f, big);
  assert.equal(f.shield.used, 10);
  assert.equal(f.max_grit - f.current_grit, 6);
  const g = f.current_grit;
  E.dealHit(ctx, a, f, { ...big, pierces_shield: true });
  assert.equal(g - f.current_grit, 8);
});
ok("knockout save odds match DC 10/11/12 + CON mod, and success restores full Grit", () => {
  const b = makeBuild("t", st(10, 10, 14, 10, 10, 10), [], "none"); // CON +2
  let first = 0, N = 40000;
  for (let i = 0; i < N; i++) {
    const c = E.makeCombatant(b, "standard", 0);
    c.current_grit = 0;
    E.knockoutRoll(ctxFor(i + 1), c);
    if (!c.unconscious) { first++; assert.equal(c.current_grit, c.max_grit); }
  }
  const expected = (20 - (10 - 2) + 1) / 20; // d20 >= 8 -> 65%
  assert.ok(Math.abs(first / N - expected) < 0.01, `${first / N} vs ${expected}`);
});
ok("ranged hit rate matches the hand-computed odds (no reactions)", () => {
  const b = makeBuild("t", st(10, 10, 10, 10, 10, 10), [], "none");
  let hits = 0, shots = 0;
  for (let i = 0; i < 40000; i++) {
    const a = E.makeCombatant(b, "standard", 0), f = E.makeCombatant(b, "standard", 1);
    f.pos = 300;
    const r = E.shoot(ctxFor(i + 1, [a, f]), a, f, a.slugs[3]); // Sunshard: Light +3 accuracy
    if (r === "jam") continue;
    shots++;
    if (r === "hit") hits++;
  }
  // Revolver +3, Fine +2, Light +3, loyalty +2, range penalty 0 at 300u (half range 175 -> floor(125/200)=0) = +10 vs DC 10
  const expected = 1; // need roll >= 0 -> always
  assert.ok(hits / shots > 0.999, `hit rate ${hits / shots}, expected ${expected}`);
  assert.equal(QUALITY_TIERS[2].failRate, 8);
});
ok("shots inside the windup distance fizzle ('too close'), and still cost AP + a pip", () => {
  const b = makeBuild("t", st(10, 10, 10, 10, 10, 10), [], "none");
  const a = E.makeCombatant(b, "standard", 0), f = E.makeCombatant(b, "standard", 1);
  f.pos = R.shotWindupDistance(a.blaster.speed) - 1;
  const ap = a.current_ap;
  const r = E.shoot(ctxFor(3, [a, f]), a, f, a.slugs[0]);
  // (an 8% misfire is possible; either way the shot is wasted)
  assert.ok(r === "too_close" || r === "jam");
  assert.equal(a.current_ap, ap - 2);
  assert.equal(a.slugs[0].energy_pips.filter(Boolean).length, 5);
});
ok("Dodge needs a positive Acrobatics modifier", () => {
  const no = E.makeCombatant(makeBuild("n", st(10, 10, 10, 10, 10, 10), [], "none"), "standard", 0);
  const yes = E.makeCombatant(makeBuild("y", st(10, 12, 10, 10, 10, 10), [], "none"), "standard", 0);
  const prof = E.makeCombatant(makeBuild("p", st(10, 10, 10, 10, 10, 10), ["acrobatics"], "none"), "standard", 0);
  assert.deepEqual([no, yes, prof].map(E.canDodge), [false, true, true]);
});
ok("a grapple hit reels the target to 40 units from the shooter (max 400), instead of shoving them", () => {
  const b = makeBuild("t", st(10, 10, 10, 10, 10, 10), [], "none");
  const mk = (gap, slugFrom) => { const a = E.makeCombatant(b, "grappleVine", 0), f = E.makeCombatant(b, "grappleVine", 1); f.pos = gap; return [a, f]; };
  let [a, f] = mk(300);
  E.dealHit(ctxFor(1, [a, f]), a, f, a.slugs[5].eff);
  assert.equal(E.dist(a, f), 40);
  [a, f] = mk(900);
  E.dealHit(ctxFor(1, [a, f]), a, f, a.slugs[5].eff);
  assert.equal(E.dist(a, f), 500);
  [a, f] = mk(300);
  E.dealHit(ctxFor(1, [a, f]), a, f, a.slugs[0].eff); // Frostfire: no knockback
  assert.equal(E.dist(a, f), 300);
  assert.ok(a.slugs[5].eff.grapple && R.slugHasTrait(a.slugs[5].eff, "snare"));
});
ok("Hunker Down heals max(1, CON mod) per AP, refused after being hit on your own turn", () => {
  const c = E.makeCombatant(makeBuild("t", st(10, 10, 14, 10, 10, 10), [], "none"), "standard", 0);
  c.current_grit = 1;
  assert.ok(E.hunker(ctxFor(), c));
  assert.equal(c.current_grit, 1 + 2 * 8);
  const d = E.makeCombatant(makeBuild("t", st(10, 10, 14, 10, 10, 10), [], "none"), "standard", 0);
  d.current_grit = 1; d.damaged_this_turn = true;
  assert.equal(E.hunker(ctxFor(), d), false);
});
ok("a duel always ends with a winner or a draw, and seeded duels repeat exactly", () => {
  const b = makeBuild("t", st(12, 13, 13, 12, 13, 12), [], "longsword");
  const x = runDuel(b, b, { loadout: "standard", startDist: 450, maxRounds: 30 }, 99);
  const y = runDuel(b, b, { loadout: "standard", startDist: 450, maxRounds: 30 }, 99);
  assert.deepEqual(x, y);
  assert.ok([-1, 0, 1].includes(x.winner));
});
ok("every archetype and Secondary price comes from the game's own price list", () => {
  assert.equal(SECONDARIES.towershield.price, 60 + 14 * 50);
  assert.equal(SECONDARIES.longsword.price, 60 + 25 * 6 + 10 * 1);
  assert.equal(SECONDARIES.belt2.price, 80 + 45 * 2);
});
console.log(`\n${passed} checks passed`);
