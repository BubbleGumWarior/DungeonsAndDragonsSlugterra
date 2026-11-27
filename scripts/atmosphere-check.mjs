// Sanity checks for the atmosphere rules (what a world's air does in a fight).
// No database needed:  node scripts/atmosphere-check.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(import.meta.dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const rules = await load("server/src/atmosphereRules.js");
const { PLANET_AIR, PLANET_TEMPS, worldFacts } = await load("server/src/planetRules.js");
const combat = await load("server/src/combatRules.js");

// planetData.js can't be imported bare (it pulls in JSON), so read its figures.
const source = fs.readFileSync(path.join(root, "client/src/planetData.js"), "utf8");
const facts = [...source.matchAll(/facts:\s*\{[^}]*\}/g)].map((m) => m[0]);

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log("ok   ", label);
  } catch (err) {
    failures += 1;
    console.log("FAIL ", label, "\n      ", err.message.split("\n")[0]);
  }
}

const air = (i, aboard = false) => rules.buildAtmosphere({ facts: worldFacts(i), aboard });
const VACUUM = [12, 14, 16];

check("server air figures match planetData.js", () => {
  assert.equal(facts.length, PLANET_AIR.length);
  facts.forEach((f, i) => {
    assert.equal(Number(f.match(/humidityPct:\s*(-?[\d.]+)/)[1]), PLANET_AIR[i].humidityPct, `humidity ${i}`);
    assert.equal(Number(f.match(/gravityG:\s*(-?[\d.]+)/)[1]), PLANET_AIR[i].gravityG, `gravity ${i}`);
    assert.equal(f.match(/atmosphere:\s*"([^"]*)"/)[1], PLANET_AIR[i].atmosphere, `atmosphere ${i}`);
    assert.equal(Number(f.match(/temperatureC:\s*(-?[\d.]+)/)[1]), PLANET_TEMPS[i], `temperature ${i}`);
  });
});

check("every world's tags", () => {
  const expect = { 0: ["haze", "thin", "dry"], 1: ["humid"], 2: ["haze"], 3: ["haze"], 6: ["humid", "spores"], 8: ["humid"], 11: ["humid"], 12: ["vacuum"], 13: ["thin", "dry"], 14: ["vacuum"], 16: ["vacuum"] };
  PLANET_AIR.forEach((_, i) => assert.deepEqual([...air(i).tags].sort(), [...(expect[i] ?? [])].sort(), `world ${i}`));
});

check("gravity: walking and knockback", () => {
  const g = rules.gravityEffects;
  assert.deepEqual([g(0).walkMult, g(0).knockbackMult], [2, 3]);
  assert.deepEqual([g(0.2).walkMult, g(0.3).knockbackMult], [1.5, 2]);
  for (const x of [0.9, 0.95, 1]) assert.deepEqual([g(x).walkMult, g(x).knockbackMult], [1, 1], `${x} g`);
  assert.deepEqual([g(1.1).walkMult, g(1.1).knockbackMult], [0.9, 0.85]);
  assert.deepEqual([g(1.2).walkMult, g(1.2).knockbackMult], [0.8, 0.7]);
  assert.ok(g(1.15).walkMult < 1 && g(1.15).knockbackMult < 1, "heavy worlds are slower and shove less");
  // The worlds themselves.
  assert.deepEqual([air(16).walkMult, air(16).knockbackMult], [2, 3]);
  assert.deepEqual([air(2).walkMult, air(2).knockbackMult], [0.8, 0.7]);
  assert.deepEqual([air(4).walkMult, air(4).knockbackMult], [1, 1]);
});

check("vacuum: no Fire, Air loses range, no hazards", () => {
  for (const i of VACUUM) {
    const a = air(i);
    assert.ok(rules.fireBlocked(a, { type: "Fire" }), `world ${i}`);
    assert.ok(rules.fireBlocked(a, { type: "Water", secondary_type: "Fire" }), "a dual shot with Fire is blocked too");
    assert.ok(!rules.fireBlocked(a, { type: "Metal" }));
    assert.ok(rules.hazardBlocked(a, { type: "Ice" }));
    assert.ok(rules.hazardBlocked(a, { type: "Toxic" }));
    const air_ = { type: "Air" };
    const tb = rules.atmosphereBallistics(air_, combat.slugBallistics(air_), a);
    assert.equal(tb.range, combat.typeBallistics("None").range, "Air falls back to a plain slug's reach");
    assert.equal(tb.accuracyMod, 2, "Air keeps its accuracy");
    const metal = rules.atmosphereBallistics({ type: "Metal" }, combat.slugBallistics({ type: "Metal" }), a);
    assert.equal(metal.range, combat.typeBallistics("Metal").range, "other types are unaffected");
  }
  assert.ok(!rules.fireBlocked(air(4), { type: "Fire" }));
  assert.ok(!rules.hazardBlocked(air(4), { type: "Toxic" }));
});

check("haze: Light loses accuracy and blind, Water leaves no hazards", () => {
  for (const i of [0, 2, 3]) {
    const a = air(i);
    const tb = rules.atmosphereBallistics({ type: "Light" }, combat.slugBallistics({ type: "Light" }), a);
    assert.equal(tb.accuracyMod, 0, `Light accuracy, world ${i}`);
    assert.equal(combat.typeBallistics("Light").accuracyMod, 3);
    assert.ok(rules.blindBlocked(a));
    assert.ok(rules.hazardBlocked(a, { type: "Water" }));
    assert.ok(!rules.hazardBlocked(a, { type: "Toxic" }), "other hazards still form");
    assert.ok(!rules.hazardBlocked(a, { type: "Ice" }), "ice still forms");
    assert.ok(!rules.fireBlocked(a, { type: "Fire" }));
  }
  assert.ok(!rules.blindBlocked(air(4)));
});

check("humid, dry, spores, thin air", () => {
  for (const i of [1, 6, 8, 11]) {
    assert.equal(air(i).burnTurns, combat.BURN_DURATION_TURNS - 1, `humid world ${i}`);
    assert.equal(air(i).chainMult, 1.5);
  }
  for (const i of [0, 13]) assert.equal(air(i).burnTurns, combat.BURN_DURATION_TURNS + 1, `dry world ${i}`);
  assert.equal(air(6).snareTurns, combat.SNARE_DURATION_TURNS + 1);
  assert.equal(air(1).snareTurns, combat.SNARE_DURATION_TURNS, "spores only on the spore world");
  assert.equal(air(4).burnTurns, combat.BURN_DURATION_TURNS);
  for (const i of [0, 13]) {
    const a = air(i);
    assert.equal(a.rangeMult, 0.8);
    const tb = rules.atmosphereBallistics({ type: "Fire" }, combat.slugBallistics({ type: "Fire" }), a);
    assert.equal(tb.range, combat.typeBallistics("Fire").range * 0.8, "thin air trims the type's reach");
  }
  assert.equal(air(4).rangeMult, 1);
});

check("ice patches: heat melts, cold and dry keep", () => {
  const base = combat.HAZARD_DURATION_ROUNDS;
  assert.equal(air(4).iceRounds, base, "mild world");
  assert.equal(air(1).iceRounds, base - 2, "46 C");
  assert.equal(air(3).iceRounds, base - 1, "29 C");
  assert.equal(air(0).iceRounds, base - 2 + 1, "58 C but dry");
  assert.equal(air(13).iceRounds, base + 1 + 1, "-4 C and dry");
  assert.equal(air(15).iceRounds, base + 2, "-46 C");
  assert.ok(air(1).iceRounds >= 1);
});

check("aboard is plain ship air, with the world's gravity while docked", () => {
  for (const i of [0, 2, 12, 16]) {
    const a = air(i, true);
    assert.ok(a.aboard);
    assert.equal(a.temperatureC, 21);
    assert.equal(a.gravityG, rules.buildAtmosphere({ facts: worldFacts(i) }).gravityG, `world ${i}`);
    assert.ok(!a.noFire && !a.noHazards && !a.noBlind);
    assert.ok(a.effects.every((e) => /gravity/i.test(e)), `only gravity effects aboard, world ${i}`);
  }
  assert.deepEqual(air(4, true).effects, [], "1 g world: nothing changes");
  assert.equal(air(16, true).gravity, "zero", "docked in the Threshold's debris: no gravity at all");
  assert.equal(rules.buildAtmosphere({ facts: worldFacts(0), aboard: true, aboardGravityG: 0.1 }).gravity, "low", "under way: the drive's thrust");
  assert.equal(air(16).aboard, false);
  assert.equal(air(16).temperatureC, -170, "offboard is the default and keeps the vacuum");
});

check("a missing snapshot changes nothing", () => {
  assert.equal(rules.walkMultOf(null), 1);
  assert.equal(rules.knockbackMultOf(undefined), 1);
  assert.ok(!rules.fireBlocked(null, { type: "Fire" }));
  assert.ok(!rules.hazardBlocked(null, { type: "Water" }));
  assert.ok(!rules.blindBlocked(null));
  assert.equal(rules.burnTurnsOf(null), combat.BURN_DURATION_TURNS);
  assert.equal(rules.snareTurnsOf(null), combat.SNARE_DURATION_TURNS);
  assert.equal(rules.iceRoundsOf(null), combat.HAZARD_DURATION_ROUNDS);
  assert.equal(rules.chainRadiusOf(null), combat.CHAIN_RADIUS);
  const tb = combat.slugBallistics({ type: "Air" });
  assert.equal(rules.atmosphereBallistics({ type: "Air" }, tb, null), tb);
});

check("effects read sensibly", () => {
  const text = air(16).effects.join(" | ");
  assert.match(text, /Zero gravity/);
  assert.match(text, /Fire slugs can't be fired/);
  assert.match(text, /hazard patch/);
  assert.equal(air(4).effects.length, 0, "a clear mild world has nothing to say");
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
