// Sanity checks for the ship rules: blueprints and tiers, what online compartments
// give the crew, the engineering roll, the Nav Computer's reach and ship supplies.
// No database needed:  node scripts/ship-check.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rules = await import(pathToFileURL(path.join(root, "server/src/shipRules.js")).href);
const care = await import(pathToFileURL(path.join(root, "server/src/careRules.js")).href);

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

const online = (templateKey, tier = 1, extra = {}) => ({ id: templateKey, status: "online", templateKey, tier, ...extra });
const bp = (key) => rules.blueprintFor(key);

check("every blueprint has up to three tiers, costing its own grade", () => {
  for (const b of rules.COMPARTMENT_BLUEPRINTS) {
    assert.ok(b.maxTier >= 1 && b.maxTier <= 3, b.key);
    b.tiers.forEach((t, i) => {
      assert.equal(t.tier, i + 1);
      assert.equal(t.grade, rules.SUPPLY_GRADES[i].key, `${b.key} tier ${t.tier}`);
      assert.ok(t.cost >= 1 && t.buildDays >= 1 && t.dc >= 1, `${b.key} tier ${t.tier}`);
    });
  }
});

check("bridge, pub, bathroom and lexical graft have no upgrades", () => {
  for (const key of ["bridge", "pub", "bathroom", "lexical-graft"]) assert.equal(bp(key).maxTier, 1, key);
});

check("thruster array and lexical graft are DM-placed only", () => {
  assert.equal(bp("thruster-array").buildable, false);
  assert.equal(bp("lexical-graft").buildable, false);
  assert.equal(bp("thruster-array").maxTier, 3, "but the crew can upgrade a thruster");
  for (const b of rules.COMPARTMENT_BLUEPRINTS) {
    if (!["thruster-array", "lexical-graft"].includes(b.key)) assert.equal(b.buildable, true, b.key);
  }
});

check("upgrading costs more of a better grade", () => {
  assert.equal(rules.workQuote("medbay", 1).grade, "parts");
  assert.equal(rules.workQuote("medbay", 2).grade, "components");
  assert.equal(rules.workQuote("medbay", 3).grade, "cores");
  assert.equal(rules.workQuote("pub", 2), null, "no second tier to buy");
});

check("speed comes from the tier, and a tier-less compartment from its stored bonus", () => {
  assert.equal(rules.shipEffects([online("thruster-array", 1)]).speedBonus, 3);
  assert.equal(rules.shipEffects([online("thruster-array", 3)]).speedBonus, 6);
  assert.equal(rules.shipEffects([online("engine-room", 2), online("nav-computer", 1)]).speedBonus, 4);
  assert.equal(rules.shipEffects([online("custom-4", 1, { speedBonus: 2 })]).speedBonus, 2);
  const offline = { ...online("thruster-array", 3), status: "offline" };
  assert.equal(rules.shipEffects([offline]).speedBonus, 0, "only online compartments count");
  assert.equal(rules.speedBreakdown({ speed: 5, compartments: [online("thruster-array", 1)] }).effective, 8);
});

check("a Nav Computer's tier sets how far it charts", () => {
  assert.equal(rules.shipEffects([]).navRange, "none");
  assert.equal(rules.shipEffects([online("nav-computer", 1)]).navRange, "close");
  assert.equal(rules.shipEffects([online("nav-computer", 2)]).navRange, "medium");
  assert.equal(rules.shipEffects([online("nav-computer", 3)]).navRange, "all");
});

check("routes sort into close, medium and far by distance", () => {
  // Same system: close. Threxa slot 0 to slot 5 is the longest hop inside a system (13).
  assert.equal(rules.routeRange(0, 5), "close");
  // The Threshold (16) to Threxa's first world is 12; to its last, 22.
  assert.equal(rules.routeRange(16, 0), "close");
  assert.equal(rules.routeRange(16, 5), "medium");
  // Threxa-Verrin: 20 + 2 * (slot + slot). 0 and 6 (slot 0) is 20; 5 and 10 is 38.
  assert.equal(rules.routeRange(0, 6), "medium");
  assert.equal(rules.routeRange(5, 10), "all");
  assert.equal(rules.navCanReach("close", 0, 6), false);
  assert.equal(rules.navCanReach("medium", 0, 6), true);
  assert.equal(rules.navCanReach("medium", 5, 10), false);
  assert.equal(rules.navCanReach("all", 5, 10), true);
  assert.equal(rules.navCanReach("none", 0, 1), false);
});

check("every route from every world is within a Tier III Nav Computer", () => {
  for (let a = 0; a < rules.WORLD_COUNT; a++) {
    for (let b = 0; b < rules.WORLD_COUNT; b++) assert.ok(rules.navCanReach("all", a, b));
  }
});

check("a close Nav Computer can always take a first step", () => {
  // From anywhere there is at least one world within close range, so a Tier I
  // computer never leaves the party stranded.
  for (let a = 0; a < rules.WORLD_COUNT; a++) {
    const close = [...Array(rules.WORLD_COUNT).keys()].filter((b) => b !== a && rules.navCanReach("close", a, b));
    assert.ok(close.length > 0, `world ${a} has nowhere close`);
  }
});

check("the Medbay lifts from full rests to cures to stronger Medpacks", () => {
  assert.equal(rules.shipEffects([]).restHealsFully, false);
  const one = rules.shipEffects([online("medbay", 1)]);
  assert.equal(one.restHealsFully, true);
  assert.equal(one.curesIllness, false);
  assert.equal(rules.shipEffects([online("medbay", 2)]).curesIllness, true);
  assert.equal(rules.shipEffects([online("medbay", 3)]).medpackHealFraction, 0.75);
  assert.equal(one.medpackHealFraction, 0.5);
});

check("the other compartments give what their tiers say", () => {
  const at = (key, tier) => rules.shipEffects([online(key, tier)]);
  assert.equal(at("galley", 3).galleyKibble, 6);
  assert.equal(at("slug-terrarium", 3).foodDrainCut, 15);
  assert.equal(at("slug-terrarium", 3).spareSlugs, 1);
  assert.equal(at("slug-terrarium", 2).spareSlugs, 0);
  assert.equal(at("crew-quarters", 3).illnessCutPct, 100);
  assert.equal(at("armory", 2).wearCutPct, 20);
  assert.equal(at("workshop", 3).repairBonus, 6);
  assert.equal(at("workshop", 3).buildBonus, 3);
  assert.equal(at("observatory", 2).surveyTier, 2);
});

check("a Cargo Hold sets how much the stores hold, and duplicates don't stack", () => {
  assert.equal(rules.shipEffects([]).storesCapacity, rules.BASE_STORES_CAPACITY);
  assert.equal(rules.shipEffects([online("cargo-hold", 2)]).storesCapacity, 40);
  assert.equal(rules.shipEffects([online("cargo-hold", 1), online("cargo-hold", 3)]).storesCapacity, 80);
  assert.equal(rules.shipEffects([online("crew-quarters", 1), online("crew-quarters", 1)]).illnessCutPct, 25);
  assert.equal(rules.storesUsed({ parts: 3, components: 2, cores: 1 }), 6);
});

check("a tier above the blueprint's maximum is clamped", () => {
  assert.equal(rules.compartmentTier(online("bridge", 3)), 1);
  assert.equal(rules.compartmentTier(online("galley", 9)), 3);
  assert.equal(rules.compartmentTier(online("custom-1", 2)), 1);
  assert.equal(rules.compartmentTier({ templateKey: "galley" }), 1);
});

check("the engineering roll: reach the DC, a 20 always lands, a miss costs half", () => {
  const base = { modifier: 3, bonus: 0, dc: 13, cost: 7, buildDays: 5 };
  const hit = rules.resolveWorkRoll({ ...base, die: 10 });
  assert.equal(hit.success, true, "13 meets DC 13");
  assert.equal(hit.spent, 7);
  assert.equal(hit.buildDays, 5);
  const miss = rules.resolveWorkRoll({ ...base, die: 9 });
  assert.equal(miss.success, false);
  assert.equal(miss.spent, 4, "half of 7, rounded up");
  assert.equal(miss.buildDays, 0);
  const crit = rules.resolveWorkRoll({ ...base, modifier: -5, die: 20 });
  assert.equal(crit.success, true, "a natural 20 lands whatever the total");
  assert.equal(crit.buildDays, 4, "and saves a day");
  assert.equal(rules.resolveWorkRoll({ ...base, buildDays: 1, die: 20 }).buildDays, 1, "never below a day");
  assert.equal(rules.resolveWorkRoll({ ...base, bonus: 1, die: 9 }).success, true, "the Workshop's bonus counts");
});

check("repairs cost more parts for a better blaster", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(care.repairPartsFor), [2, 3, 4, 5, 6]);
  assert.equal(care.repairPartsFor(99), 2, "an unknown quality falls back to the cheapest");
});

check("a blaster upgrades one quality tier at a time, up to Legendary", () => {
  assert.equal(care.blasterUpgradeFor(0).to, 1);
  assert.equal(care.blasterUpgradeFor(3).to, 4);
  assert.equal(care.blasterUpgradeFor(4), null, "nothing above Legendary");
  const costs = care.BLASTER_UPGRADES.map((u) => u.parts);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b), "each tier costs more than the last");
  const dcs = care.BLASTER_UPGRADES.map((u) => u.dc);
  assert.deepEqual(dcs, [...dcs].sort((a, b) => a - b), "and is harder");
});

check("weapon parts can change hands in a trade", () => {
  assert.equal(care.TRADEABLE_SUPPLIES.weaponParts, "weapon_parts");
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall ship checks passed");
