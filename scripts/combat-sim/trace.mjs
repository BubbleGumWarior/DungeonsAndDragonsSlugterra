// Prints one fight blow by blow, e.g.
//   node scripts/combat-sim/trace.mjs "Brawler (STR) Longsword" "Tank (CON)" 7 450
import { archetypeBuilds, assertLegal } from "./catalog.mjs";
import { runDuel, DEFAULT_CFG } from "./duel.mjs";

const [an = "Balanced", bn = "Balanced", seed = "1", startDist = "450"] = process.argv.slice(2);
const builds = archetypeBuilds();
builds.forEach(assertLegal);
const find = (n) => {
  const b = builds.find((x) => x.name === n);
  if (!b) throw new Error(`unknown build: ${n}\n${builds.map((x) => "  " + x.name).join("\n")}`);
  return b;
};
const A = find(an);
const B = find(bn);
const lines = [];
const r = runDuel(A, B, { ...DEFAULT_CFG, startDist: Number(startDist), log: (m) => lines.push(m) }, Number(seed));
console.log(lines.join("\n"));
console.log(`\nwinner: ${r.winner === -1 ? "draw" : r.winner === 0 ? A.name : B.name} after ${r.rounds} rounds`);
