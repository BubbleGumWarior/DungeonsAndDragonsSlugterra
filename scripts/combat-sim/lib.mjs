// Shared helpers for the experiment scripts.
import fs from "node:fs";
import path from "node:path";
import { enumeratePointBuys, makeBuild, SECONDARIES, INERT_SKILLS, COMBAT_SKILLS, mods } from "./catalog.mjs";
import { mulberry32 } from "./engine.mjs";
import { PROFICIENCY_KEYS } from "../../server/src/characterRules.js";

export const OUT_DIR = process.env.SIM_OUT ?? path.resolve("scripts/combat-sim/out");
export function writeOut(name, data) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
  return file;
}

export const ALL_SECONDARY_KEYS = [
  "none", "dagger", "shortsword", "longsword", "mace", "warhammer", "rapier", "spear",
  "buckler", "roundshield", "kiteshield", "towershield", "belt2", "belt4",
];

const odd = (v) => v % 2 === 1;
export const waste = (st) => Object.values(st).filter(odd).length;

let _pb;
export const legalPointBuys = () => (_pb ??= enumeratePointBuys());

// One representative legal stat array per distinct vector of six modifiers: the one
// that wastes the fewest points on odd scores (9/11/13/15 cost a point more than
// the even score below them and give the same modifier).
export function distinctModVectors() {
  const best = new Map();
  for (const st of legalPointBuys()) {
    const key = mods(st).join(",");
    const cur = best.get(key);
    if (!cur || waste(st) < waste(cur)) best.set(key, st);
  }
  return [...best.values()];
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function sample(rng, arr, k) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

// A random but legal character: any point buy, any 5 proficiencies, any secondary.
export function randomBuild(rng, i, { secondaryKeys = ALL_SECONDARY_KEYS, armor = "none" } = {}) {
  const st = pick(rng, legalPointBuys());
  const profs = sample(rng, PROFICIENCY_KEYS, 5);
  const b = makeBuild(`r${i}`, st, [], pick(rng, secondaryKeys), armor);
  b.profs = profs;
  return b;
}

export const baselineProfs = () => INERT_SKILLS.slice(0, 5);
export function plainBuild(name, st, secondary = "none", profs = baselineProfs(), armor = "none") {
  const b = makeBuild(name, st, [], secondary, armor);
  b.profs = profs;
  return b;
}

export const rate = (r) => (r.w + 0.5 * r.d) / r.n;
export const se = (p, n) => Math.sqrt((p * (1 - p)) / n);
export { mulberry32, SECONDARIES, COMBAT_SKILLS, INERT_SKILLS, mods };
