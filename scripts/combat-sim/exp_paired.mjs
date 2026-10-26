// Paired comparisons: the SAME stat blocks and Secondary item, changing ONE thing (a proficiency
// pick, armor, ...), each fighting the same fixed random field with the same dice seeds. The
// difference in win rate is the value of that one change.
//   node scripts/combat-sim/exp_paired.mjs set=skills|armor [patterns=400] [field=200] [secs=none,longsword,roundshield]
import { Pool } from "./pool.mjs";
import { POLICY_VARIANTS } from "./policy.mjs";
import { makeBuild, SECONDARIES } from "./catalog.mjs";
import { distinctModVectors, mulberry32, randomBuild, sample as sampleN, writeOut, mods } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const setName = args.set ?? "skills";
const nPatterns = Number(args.patterns ?? 400);
const fieldSize = Number(args.field ?? 200);
const secKeys = (args.secs ?? "none,longsword,roundshield").split(",");
const loadout = args.loadout ?? "standard";
const startDist = Number(args.dist ?? 450);

const SK = ["acrobatics", "athletics", "sleightOfHand", "medicine", "intimidation"];
const pairs = [];
for (let i = 0; i < SK.length; i++) for (let j = i + 1; j < SK.length; j++) pairs.push([SK[i], SK[j]]);

const SETS = {
  skills: [
    { name: "baseline", profs: [] },
    { name: "placebo (history)", profs: ["history"] },
    ...["acrobatics", "athletics", "sleightOfHand", "medicine", "intimidation", "stealth", "perception", "performance"].map((s) => ({ name: s, profs: [s] })),
    ...pairs.map(([a, b]) => ({ name: `${a}+${b}`, profs: [a, b] })),
    { name: "all five combat skills", profs: SK },
    // Intimidate only does anything if the player uses it, so these two are judged under that play style.
    { name: "baseline [uses Intimidate]", profs: [], policy: "intimidateFirst" },
    { name: "intimidation [uses Intimidate]", profs: ["intimidation"], policy: "intimidateFirst" },
  ],
  armor: [
    { name: "no armor", profs: [] },
    { name: "leather (+8 Grit)", profs: [], armor: "leather" },
    { name: "chain (+15 Grit)", profs: [], armor: "chain" },
    { name: "plate (+25 Grit)", profs: [], armor: "plate" },
  ],
};
const variants = SETS[setName];
if (!variants) throw new Error("unknown set " + setName);

const rng = mulberry32(4242);
const fieldRng = mulberry32(777);
const field = Array.from({ length: fieldSize }, (_, i) => randomBuild(fieldRng, i));
const patterns = sampleN(rng, distinctModVectors(), nPatterns);

const table = [...field];
const cands = [];
patterns.forEach((st, pi) => {
  secKeys.forEach((sec, si) => {
    variants.forEach((v) => {
      const b = makeBuild(`${v.name}`, st, v.profs, sec, v.armor ?? "none");
      cands.push({ pi, sec, variant: v.name, st, idx: table.length, seed: 1000003 * (pi * 32 + si + 1), policy: v.policy ?? "default" });
      table.push(b);
    });
  });
});
const fieldIdx = field.map((_, i) => i);
const jobs = cands.map((c) => ({ a: c.idx, bs: fieldIdx, n: 1, seed: c.seed, cfg: { loadout, startDist, polA: POLICY_VARIANTS[c.policy], polB: POLICY_VARIANTS.default } }));

const pool = new Pool();
await pool.setTable(table);
const t0 = Date.now();
const res = await pool.run(jobs, 8);
console.error(`${cands.length} candidates x ${fieldSize} = ${(cands.length * fieldSize / 1e6).toFixed(2)}M duels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const rows = cands.map((c, k) => ({ pi: c.pi, sec: c.sec, variant: c.variant, mods: mods(c.st), win: (res[k].w + 0.5 * res[k].d) / res[k].n, n: res[k].n }));
console.log("wrote", writeOut(args.out ?? `paired_${setName}.json`, { set: setName, loadout, startDist, fieldSize, rows }));
await pool.close();
