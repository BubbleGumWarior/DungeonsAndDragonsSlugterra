// Stat landscape: every distinct stat allocation a player can legally build (1,568 modifier
// patterns from the 12,282 point-buy arrays), crossed with every Secondary-slot item, each
// fighting the same fixed random field. Proficiencies are all inert here so ONLY stats and
// the secondary vary (skills are studied in exp_skills.mjs).
//   node scripts/combat-sim/exp_landscape.mjs [field=300] [loadout=standard] [dist=450] [policy=default] [ablate=conGrit,conKO,...] [sample=N] [secs=a,b] [out=name.json]
import { Pool } from "./pool.mjs";
import { POLICY_VARIANTS } from "./policy.mjs";
import { LOADOUTS } from "./catalog.mjs";
import { ALL_SECONDARY_KEYS, distinctModVectors, mulberry32, plainBuild, randomBuild, sample as sampleN, writeOut, mods, waste } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const fieldSize = Number(args.field ?? 300);
const loadout = args.loadout ?? "standard";
const startDist = Number(args.dist ?? 450);
const policyName = args.policy ?? "default";
const sample = args.sample ? Number(args.sample) : null;       // random subset of the 1,568 stat patterns
const secKeys = args.secs ? args.secs.split(",") : ALL_SECONDARY_KEYS;
const ablate = args.ablate ? Object.fromEntries(args.ablate.split(",").map((k) => [k, true])) : null; // analysis only: see engine.makeCombatant
const outName = args.out ?? `landscape_${loadout}_${startDist}_${policyName}.json`;
if (!LOADOUTS[loadout]) throw new Error("unknown loadout " + loadout);
if (!POLICY_VARIANTS[policyName]) throw new Error("unknown policy " + policyName);
const policy = POLICY_VARIANTS[policyName];

const rng = mulberry32(12345);
const fieldRng = mulberry32(777); // the field is the same for every variant
const field = Array.from({ length: fieldSize }, (_, i) => randomBuild(fieldRng, i));
let vectors = distinctModVectors();
if (sample) vectors = sampleN(rng, vectors, sample);
const candidates = [];
for (const sec of secKeys) for (const st of vectors) candidates.push({ sec, st, build: plainBuild(`${sec}`, st, sec) });

const table = [...field, ...candidates.map((c) => c.build)];
const fieldIdx = field.map((_, i) => i);
const jobs = candidates.map((_, k) => ({ a: fieldSize + k, bs: fieldIdx, n: 1, seed: 1000003 * (k + 1), cfg: { loadout, startDist, polA: policy, polB: policy, ablate } }));

const pool = new Pool();
await pool.setTable(table);
const t0 = Date.now();
const res = await pool.run(jobs, 8);
console.error(`${candidates.length} candidates x ${fieldSize} field = ${(candidates.length * fieldSize / 1e6).toFixed(2)}M duels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const rows = candidates.map((c, k) => {
  const r = res[k];
  return {
    sec: c.sec, stats: c.st, mods: mods(c.st), waste: waste(c.st),
    win: (r.w + 0.5 * r.d) / r.n, n: r.n, draws: r.d, rounds: r.rounds / r.n,
    firstWin: r.aFirstN ? r.aFirstW / r.aFirstN : null,
    dmgDealt: r.sumA.dmgDealt / r.n, dmgTaken: r.sumA.dmgTaken / r.n, hunkerHeal: r.sumA.hunkerHeal / r.n,
    swingHits: r.sumA.swingHits / r.n, shieldAbsorbed: r.sumA.shieldAbsorbed / r.n,
  };
});
const file = writeOut(outName, { loadout, startDist, fieldSize, policyName, policy, rows });
console.log("wrote", file);
await pool.close();
