// Which "reasonably smart" way of playing a turn is hardest to beat? Every policy
// plays every other (mirror builds, so only the policy differs) and is scored by its
// average win rate. The winner becomes the default policy for the build experiments.
//   node scripts/combat-sim/exp_policy.mjs [dupsPerPair=100]
import { archetypeBuilds } from "./catalog.mjs";
import { DEFAULT_POLICY } from "./policy.mjs";
import { Pool } from "./pool.mjs";

const reps = Number(process.argv[2] ?? 100);
const builds = archetypeBuilds();
const mirrorSet = [0, 2, 3].map((i) => builds[i]); // balanced, DEX/CON, STR/CON+sword
const pool = new Pool();
await pool.setTable(mirrorSet);

const grid = [];
for (const reserveMax of [0, 2, 4, 6])
  for (const hunkerFullBelow of [0.25, 0.4, 0.6])
    for (const hunkerLeftoverBelow of [0, 0.5, 0.8, 1.0])
      for (const assumedStop of [0, 0.3])
        grid.push({ ...DEFAULT_POLICY, reserveMax, hunkerFullBelow, hunkerLeftoverBelow, assumedStop });

const jobs = [];
const meta = [];
let seed = 1;
for (let i = 0; i < grid.length; i++) {
  for (let j = 0; j < grid.length; j++) {
    if (i === j) continue;
    for (let b = 0; b < mirrorSet.length; b++) {
      jobs.push({ a: b, bs: [b], n: reps, seed: (seed += 100000), cfg: { polA: grid[i], polB: grid[j] } });
      meta.push(i);
    }
  }
}
const t0 = Date.now();
const res = await pool.run(jobs, 32);
console.error(`${jobs.length} jobs, ${(jobs.length * reps / 1000).toFixed(0)}k duels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const score = grid.map(() => ({ w: 0, n: 0 }));
res.forEach((r, k) => { score[meta[k]].w += r.w + 0.5 * r.d; score[meta[k]].n += r.n; });
const rows = grid.map((p, i) => ({ ...p, win: score[i].w / score[i].n }));
rows.sort((x, y) => y.win - x.win);
const fmt = (r) => `reserve=${r.reserveMax} hunkFull<=${r.hunkerFullBelow} hunkLeft<=${r.hunkerLeftoverBelow} assumedStop=${r.assumedStop}  win=${(r.win * 100).toFixed(1)}%`;
console.log("TOP 12");
rows.slice(0, 12).forEach((r) => console.log("  " + fmt(r)));
console.log("BOTTOM 6");
rows.slice(-6).forEach((r) => console.log("  " + fmt(r)));
// marginal effect of each knob
for (const knob of ["reserveMax", "hunkerFullBelow", "hunkerLeftoverBelow", "assumedStop"]) {
  const m = new Map();
  for (const r of rows) { const e = m.get(r[knob]) ?? { s: 0, n: 0 }; e.s += r.win; e.n++; m.set(r[knob], e); }
  console.log(`${knob}: ` + [...m].map(([k, e]) => `${k} -> ${(e.s / e.n * 100).toFixed(1)}%`).join("   "));
}
await pool.close();
