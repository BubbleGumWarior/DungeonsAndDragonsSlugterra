// Round robin between hand-built "what a player might actually make" characters, so the
// stat/skill/secondary findings can be read as matchups.
//   node scripts/combat-sim/exp_archetypes.mjs [dupsPerPair=2000] [loadout=standard] [dist=450]
import { Pool } from "./pool.mjs";
import { makeBuild, assertLegal } from "./catalog.mjs";
import { writeOut } from "./lib.mjs";

const reps = Number(process.argv[2] ?? 2000);
const loadout = process.argv[3] ?? "standard";
const startDist = Number(process.argv[4] ?? 450);

const st = (str, dex, con, int, wis, cha) => ({ strength: str, dexterity: dex, constitution: con, intelligence: int, wisdom: wis, charisma: cha });
// name, stats, proficiencies (the ones that matter), secondary
const A = [
  ["Balanced (12/13s), no gear", st(12, 13, 13, 12, 13, 12), ["perception"], "none"],
  ["Hardy gunner (DEX+CON 15)", st(8, 15, 15, 11, 13, 9), ["acrobatics", "medicine"], "none"],
  ["Hardy gunner + ammo belt", st(10, 15, 15, 8, 12, 11), ["acrobatics", "sleightOfHand"], "belt2"],
  ["Tank + tower shield", st(8, 14, 15, 10, 15, 8), ["medicine", "acrobatics"], "towershield"],
  ["Tank + round shield", st(8, 14, 14, 10, 14, 12), ["medicine", "acrobatics"], "roundshield"],
  ["Triple-14 + longsword", st(14, 14, 14, 10, 10, 10), ["athletics", "acrobatics"], "longsword"],
  ["Triple-14 + rapier", st(14, 14, 14, 10, 10, 10), ["athletics", "acrobatics"], "rapier"],
  ["Triple-14 + mace", st(14, 14, 14, 10, 10, 10), ["athletics", "acrobatics"], "mace"],
  ["Pure brawler STR15/CON14 + mace", st(15, 10, 14, 8, 13, 12), ["athletics"], "mace"],
  ["Glass cannon DEX15 + dagger", st(14, 15, 8, 12, 12, 11), ["acrobatics"], "dagger"],
  ["Charismatic face (CHA15)", st(10, 12, 12, 12, 12, 15), ["intimidation", "performance"], "none"],
  ["Scholar (INT/WIS/CHA 15)", st(8, 8, 8, 15, 15, 15), ["perception", "medicine"], "none"],
];
const builds = A.map(([name, s, profs, sec]) => makeBuild(name, s, profs, sec));
builds.forEach(assertLegal);

const pool = new Pool();
await pool.setTable(builds);
const short = (n) => n.replace(/\(.*?\)/g, "").replace(/ +/g, " ").trim().slice(0, 22);
console.log(`ARCHETYPE ROUND ROBIN (${reps} duels per pairing, row's win rate vs column), loadout=${loadout}, start ${startDist}u
`);
const pairJobs = [];
for (let i = 0; i < builds.length; i++) for (let j = 0; j < builds.length; j++) pairJobs.push({ a: i, bs: [j], n: reps, seed: 104729 * (i * 31 + j + 1), cfg: { loadout, startDist } });
const pr = await pool.run(pairJobs, 4);
const M = builds.map((_, i) => builds.map((_, j) => { const r = pr[i * builds.length + j]; return (r.w + 0.5 * r.d) / r.n; }));
const mean = M.map((row, i) => row.reduce((s, v, j) => s + (j === i ? 0 : v), 0) / (builds.length - 1));
const order = builds.map((_, i) => i).sort((a, b) => mean[b] - mean[a]);
console.log("overall (average win rate vs the other 11):");
order.forEach((i, k) => console.log(`  ${String(k + 1).padStart(2)}. ${(100 * mean[i]).toFixed(1).padStart(5)}%  ${builds[i].name}`));
console.log("\nmatrix (rows = attacker build, win% vs column; same order as above):");
console.log("".padEnd(26) + order.map((_, k) => String(k + 1).padStart(5)).join(""));
order.forEach((i, k) => console.log(`${String(k + 1).padStart(2)} ${short(builds[i].name).padEnd(23)}` + order.map((j) => (i === j ? "  -  " : String(Math.round(100 * M[i][j])).padStart(5))).join("")));
writeOut(`archetypes_${loadout}_${startDist}.json`, { names: builds.map((b) => b.name), M, mean });
await pool.close();
