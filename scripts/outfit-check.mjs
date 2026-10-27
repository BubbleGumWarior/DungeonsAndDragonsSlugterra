// Sanity checks for the outfit / climate rules and the default catalog.
// No database needed:  node scripts/outfit-check.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(import.meta.dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const rules = await load("server/src/outfitRules.js");
const { PLANET_TEMPS } = await load("server/src/planetRules.js");
const { DEFAULT_OUTFITS } = await load("server/src/data/defaultOutfits.js");
const { soldOnWorlds, defaultOutfitPrice } = await load("server/src/seedDefaultOutfits.js");
// planetData.js imports a JSON file Node can't load bare, so read the figures
// (and world names) straight out of its source, in the order they are written
// (clusters in order, then The Threshold) -- the same order as the flat index.
const planetSource = fs.readFileSync(path.join(root, "client/src/planetData.js"), "utf8");
const temps = [...planetSource.matchAll(/temperatureC:\s*(-?\d+)/g)].map((m) => Number(m[1]));
const names = [...planetSource.matchAll(/^\s{6}name:\s*"([^"]+)"/gm)].map((m) => m[1]);
const PLANETS = temps.map((t, i) => ({ name: names[i] ?? `world ${i}`, facts: { temperatureC: t } }));

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

check("server temperatures match planetData.js", () => {
  assert.equal(PLANETS.length, PLANET_TEMPS.length);
  PLANETS.forEach((p, i) => assert.equal(p.facts.temperatureC, PLANET_TEMPS[i], `${p.name} (${i})`));
});

check("climate ladder boundaries", () => {
  const expect = { 0: "comfortable", 1: "uncomfortable", 4: "uncomfortable", 5: "strained", 9: "strained", 10: "harsh", 19: "harsh", 20: "severe", 34: "severe", 35: "brutal", 54: "brutal", 55: "lethal", 300: "lethal" };
  for (const [deg, key] of Object.entries(expect)) assert.equal(rules.climateTier(Number(deg)).key, key, `${deg} degrees`);
});

check("range and Fortitude", () => {
  const outfit = { comfort_min: 10, comfort_max: 20 };
  assert.deepEqual(rules.effectiveRange(outfit, 0), { min: 10, max: 20 });
  assert.deepEqual(rules.effectiveRange(outfit, 1), { min: 5, max: 25 });
  assert.deepEqual(rules.effectiveRange(outfit, 3), { min: -5, max: 35 });
  assert.deepEqual(rules.effectiveRange(outfit, -2), { min: 10, max: 20 });
  assert.equal(rules.degreesOutside({ min: 10, max: 20 }, 25), 5);
  assert.equal(rules.degreesOutside({ min: 10, max: 20 }, -3), 13);
  assert.equal(rules.degreesOutside({ min: 10, max: 20 }, 15), 0);
});

check("gear snapshot: comfortable, uncomfortable, lethal, ill", () => {
  const outfit = { name: "T", comfort_min: 10, comfort_max: 20, move_pct: -10, ap_bonus: -1, accuracy_bonus: 0 };
  const base = { baseMaxAp: 12, baseMaxGrit: 40, outfit };
  const ok = rules.buildGearSnapshot({ ...base, temp: 15 });
  assert.equal(ok.maxAp, 11);
  assert.equal(ok.maxGrit, 40);
  assert.equal(ok.gear.reloadApBonus, 0);
  assert.ok(Math.abs(ok.gear.moveMult - 0.9) < 1e-9);
  const cold = rules.buildGearSnapshot({ ...base, temp: 8 });
  assert.equal(cold.gear.tier, "uncomfortable");
  assert.equal(cold.gear.reloadApBonus, 1);
  assert.equal(cold.maxAp, 11);
  const dead = rules.buildGearSnapshot({ ...base, temp: -100 });
  assert.equal(dead.maxAp, 1);
  assert.equal(dead.maxGrit, 1);
  const ill = rules.buildGearSnapshot({ ...base, temp: 15, ill: true });
  assert.equal(ill.maxAp, 5);
  assert.equal(ill.maxGrit, 20);
  assert.equal(ill.gear.disadvantage, true);
  const widened = rules.buildGearSnapshot({ ...base, temp: 8, fortitudeMod: 1 });
  assert.equal(widened.gear.tier, "comfortable");
});

check("catalog size and shape", () => {
  assert.ok(DEFAULT_OUTFITS.length >= 48 && DEFAULT_OUTFITS.length <= 56, `${DEFAULT_OUTFITS.length} outfits`);
  const names = new Set(DEFAULT_OUTFITS.map((o) => o.name));
  assert.equal(names.size, DEFAULT_OUTFITS.length, "duplicate name");
  for (const o of DEFAULT_OUTFITS) {
    assert.ok(o.min < o.max, `${o.name} range`);
    assert.ok(o.desc && o.desc.length > 10, `${o.name} description`);
  }
  assert.equal(DEFAULT_OUTFITS.filter((o) => o.starter).length, 1);
  assert.equal(DEFAULT_OUTFITS.find((o) => o.starter).name, "Museum Tour Outfit");
});

check("market stock", () => {
  const stock = PLANET_TEMPS.map(() => []);
  for (const o of DEFAULT_OUTFITS) for (const w of soldOnWorlds(o)) stock[w].push(o.name);
  stock.forEach((names, i) => assert.ok(names.length >= 3, `${PLANETS[i].name} sells only ${names.length}`));
  const space = DEFAULT_OUTFITS.find((o) => o.name === "EVA Space Suit");
  assert.equal(soldOnWorlds(space).length, PLANET_TEMPS.length);
  const starter = DEFAULT_OUTFITS.find((o) => o.starter);
  assert.equal(soldOnWorlds(starter).length, 0);
  // not every world has the same wardrobe
  const sizes = new Set(stock.map((s) => s.join("|")));
  assert.equal(sizes.size, stock.length, "two worlds stock identical outfits");
  console.log("      stock per world:", PLANETS.map((p, i) => `${p.name} ${stock[i].length}`).join(", "));
});

check("only the Space Suit covers every world", () => {
  const covers = (o, t) => t >= o.min && t <= o.max;
  const all = DEFAULT_OUTFITS.filter((o) => PLANET_TEMPS.every((t) => covers(o, t)));
  assert.deepEqual(all.map((o) => o.name), ["EVA Space Suit"]);
  const threshold = DEFAULT_OUTFITS.filter((o) => covers(o, -170));
  assert.deepEqual(threshold.map((o) => o.name), ["EVA Space Suit"]);
});

check("every world has a comfortable outfit for sale", () => {
  PLANET_TEMPS.forEach((t, i) => {
    const fits = DEFAULT_OUTFITS.filter((o) => !o.starter && soldOnWorlds(o).includes(i) && t >= o.min && t <= o.max);
    assert.ok(fits.length >= 1, `${PLANETS[i].name} (${t} C) has no comfortable outfit for sale`);
  });
});

check("prices are sensible", () => {
  for (const o of DEFAULT_OUTFITS.filter((x) => !x.starter)) {
    const p = o.price ?? defaultOutfitPrice(o);
    assert.ok(p >= 25 && p <= 1000, `${o.name} costs ${p}`);
  }
});

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
