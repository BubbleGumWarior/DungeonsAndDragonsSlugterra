// Do the best builds from the landscape still win when they fight EACH OTHER instead of a random
// field? Takes the top stat blocks per Secondary item and runs a full round robin.
//   node scripts/combat-sim/exp_elite.mjs <landscape.json> [perItem=25] [dupsPerPair=24]
import fs from "node:fs";
import { Pool } from "./pool.mjs";
import { plainBuild, writeOut } from "./lib.mjs";
import { SECONDARIES } from "./catalog.mjs";

const file = process.argv[2];
const perItem = Number(process.argv[3] ?? 25);
const reps = Number(process.argv[4] ?? 24);
const land = JSON.parse(fs.readFileSync(file, "utf8"));

const bySec = {};
for (const r of land.rows) (bySec[r.sec] ??= []).push(r);
const elite = [];
for (const [sec, rs] of Object.entries(bySec)) {
  rs.sort((a, b) => b.win - a.win);
  for (const r of rs.slice(0, perItem)) elite.push({ sec, st: r.stats, landWin: r.win });
}
const table = elite.map((e, i) => plainBuild(e.sec, e.st, e.sec));
const idx = table.map((_, i) => i);
const jobs = table.map((_, i) => ({ a: i, bs: idx.filter((j) => j !== i), n: reps, seed: 7919 * (i + 1), cfg: { loadout: land.loadout, startDist: land.startDist } }));

const pool = new Pool();
await pool.setTable(table);
const t0 = Date.now();
const res = await pool.run(jobs, 2);
console.error(`${table.length} elite builds, ${(table.length * (table.length - 1) * reps / 1e6).toFixed(2)}M duels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const rows = elite.map((e, i) => ({ ...e, eliteWin: (res[i].w + 0.5 * res[i].d) / res[i].n, draws: res[i].d / res[i].n, rounds: res[i].rounds / res[i].n }));
rows.sort((a, b) => b.eliteWin - a.eliteWin);
console.log(`ELITE FIELD (${table.length} builds = top ${perItem} per item), loadout=${land.loadout}, start ${land.startDist}`);
console.log("rank  item          STR DEX CON INT WIS CHA   vs-random  vs-elite   rounds");
rows.slice(0, 25).forEach((r, k) => {
  const s = r.st;
  console.log(`${String(k + 1).padStart(3)}   ${r.sec.padEnd(12)} ${String(s.strength).padStart(3)} ${String(s.dexterity).padStart(3)} ${String(s.constitution).padStart(3)} ${String(s.intelligence).padStart(3)} ${String(s.wisdom).padStart(3)} ${String(s.charisma).padStart(3)}   ${(100 * r.landWin).toFixed(1).padStart(8)}%  ${(100 * r.eliteWin).toFixed(1).padStart(7)}%  ${r.rounds.toFixed(1).padStart(6)}`);
});
console.log("\nBy item (top-" + perItem + " builds averaged):  vs-random -> vs-elite");
const agg = {};
for (const r of rows) { const a = (agg[r.sec] ??= { l: 0, e: 0, n: 0, best: 0 }); a.l += r.landWin; a.e += r.eliteWin; a.n++; a.best = Math.max(a.best, r.eliteWin); }
Object.entries(agg).sort((x, y) => y[1].e / y[1].n - x[1].e / x[1].n).forEach(([sec, a]) => {
  console.log(`  ${sec.padEnd(12)} ${(100 * a.l / a.n).toFixed(1).padStart(6)}% -> ${(100 * a.e / a.n).toFixed(1).padStart(6)}%   best ${(100 * a.best).toFixed(1)}%   price ${SECONDARIES[sec].price}`);
});
writeOut("elite.json", { rows });
await pool.close();
