// Worker thread: receives chunks of jobs, plays the duels, returns aggregates.
//
// A job is { a, bs, n, seed, cfg } where `a` is an index into the shared build
// table, `bs` a list of opponent indices (each played `n` times), and `cfg` the
// duel config (loadout, startDist, policies...). Results are summed so only a
// handful of numbers cross the thread boundary per job.
import { parentPort, workerData } from "node:worker_threads";
import { runDuel, DEFAULT_CFG } from "./duel.mjs";

let table = workerData?.table ?? [];

const STAT_KEYS = [
  "turns", "apUnspent", "shots", "hits", "missed", "jams", "tooClose", "outOfRange", "dmgDealt", "shieldAbsorbed", "dotTaken", "dmgTaken",
  "counters", "countersWon", "dodges", "dodgesWon", "reflectedAtMe", "swings", "swingHits", "hunkerHeal", "hunkers", "firstAids",
  "intimidates", "intimidated", "koSaves", "koFails", "moves", "reloads", "burnDmg", "poisonDmg", "bleedDmg", "gritLeft", "pipsUsed",
];

function blankSum() {
  const o = {};
  for (const k of STAT_KEYS) o[k] = 0;
  return o;
}

function runJob(job) {
  const A = table[job.a];
  const cfg = { ...DEFAULT_CFG, ...(job.cfg || {}) };
  const out = { w: 0, d: 0, l: 0, n: 0, rounds: 0, aFirstW: 0, aFirstN: 0, sumA: blankSum(), sumB: blankSum() };
  let seed = job.seed;
  for (const bi of job.bs) {
    const B = table[bi];
    for (let i = 0; i < job.n; i++) {
      const r = runDuel(A, B, cfg, seed++);
      out.n++;
      out.rounds += r.rounds;
      if (r.winner === 0) out.w++; else if (r.winner === 1) out.l++; else out.d++;
      if (r.aFirst) { out.aFirstN++; if (r.winner === 0) out.aFirstW++; }
      for (const k of STAT_KEYS) { out.sumA[k] += r.a[k] ?? 0; out.sumB[k] += r.b[k] ?? 0; }
    }
  }
  return out;
}

parentPort.on("message", (msg) => {
  if (msg.type === "table") { table = msg.table; parentPort.postMessage({ type: "table-ok" }); return; }
  if (msg.type === "jobs") {
    parentPort.postMessage({ type: "done", chunk: msg.chunk, results: msg.jobs.map(runJob) });
  }
});
