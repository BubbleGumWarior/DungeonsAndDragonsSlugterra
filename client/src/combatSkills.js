// Client mirror of the character-skill rules in server/src/combatRules.js --
// keep the numbers in sync. Used for button costs / enable state only; the
// server re-checks everything.

export const MOVE_SPEED_PER_AP = 80;
export const ATHLETICS_MOVE_BONUS_PER_MOD = 0.1;
export const WALL_RUN_BASE_AP = 6;
export const HIDE_AP_COST = 2;
export const HIDE_RANGE = 400;
export const INTIMIDATE_AP_COST = 2;
export const INTIMIDATE_RANGE = 400;
export const FIRST_AID_BASE_AP = 6;
export const FIRST_AID_RANGE = 120;

// Characters carry every skill modifier on data.skills (snapshotted when they
// joined the fight); NPCs and grunts use their DEX modifier for all of them.
export function combatantSkillMod(combatant, skillKey) {
  const data = combatant?.data || {};
  if (combatant?.kind === "character") return data.skills?.[skillKey] ?? data.dexMod ?? 0;
  return data.dexMod ?? 0;
}

const PARTY_RELATIONSHIPS = ["Ally", "Friend", "Party"];
export function combatSide(combatant) {
  if (combatant?.kind === "character" || combatant?.kind === "mecha") return "party";
  const rel = combatant?.relationship ?? combatant?.data?.relationship ?? null;
  return PARTY_RELATIONSHIPS.includes(rel) ? "party" : "foes";
}
export const areAllies = (a, b) => combatSide(a) === combatSide(b);

export const moveSpeedPerAp = (athleticsMod) =>
  MOVE_SPEED_PER_AP * (1 + ATHLETICS_MOVE_BONUS_PER_MOD * Math.max(0, athleticsMod || 0));
export const reloadApCostFor = (baseCost, sleightMod) => Math.max(1, (baseCost || 1) - Math.max(0, sleightMod || 0));
export const wallRunApCost = (acrobaticsMod) => Math.max(1, WALL_RUN_BASE_AP - (acrobaticsMod || 0));
export const firstAidApCost = (medicineMod) => Math.max(1, FIRST_AID_BASE_AP - (medicineMod || 0));

// ---- Water terrain + mecha modes (mirrors server/src/combatRules.js) ----------
export const WATER_CELL = 25;
export const WATER_MOVE_COST_MULT = 2;
export const WATER_FOOT_COST_MULT = 4; // wading on foot (unmounted) is far slower than a mecha ploughing through
export const waterCellId = (x, y) => Math.floor(y / WATER_CELL) * 1000 + Math.floor(x / WATER_CELL);
export const makeWaterSet = (water) => new Set(Array.isArray(water) ? water : []);
export const isWaterAt = (waterSet, point) => waterSet.has(waterCellId(point.x, point.y));

export function pathApCost(from, to, waterSet, speedPerAp, ignoresWater = false, waterMult = WATER_MOVE_COST_MULT) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  let effective = len;
  if (!ignoresWater && waterSet.size > 0 && len > 0) {
    const steps = Math.max(1, Math.ceil(len / 10));
    let wet = 0;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      if (isWaterAt(waterSet, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })) wet += 1;
    }
    effective = len + len * (wet / steps) * (waterMult - 1);
  }
  return Math.max(1, Math.ceil(effective / speedPerAp));
}

export const modeBlasterSpeedFactor = (mode, inWater) =>
  mode === "bike" ? 2 : mode === "glider" ? 0.5 : mode === "aquatic" ? (inWater ? 1.5 : 0.5) : 1;
export const modeMechaSpeedFactor = (mode, inWater) =>
  mode === "burrow" ? 0.75 : modeBlasterSpeedFactor(mode, inWater);
export const modeIgnoresWater = (mode) => mode === "glider" || mode === "aquatic";
export const effectiveMode = (c) => (c?.kind === "mecha" || c?.mountedOn != null ? c.data?.mode ?? null : null);
export const isBurrowed = (c) => effectiveMode(c) === "burrow";
