// Display helpers for the Deck Plan's building and upgrading. The rules live on
// the server (server/src/shipRules.js); this only words what it reports.

export const ROMAN = ["", "I", "II", "III"];

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// The routes a Nav Computer charts at each tier, from the server's `navRange`
// (mirrors routeRange in server/src/shipRules.js: by the gates a route uses).
export const NAV_RANGE_LABELS = {
  none: "No worlds",
  close: "Its own system, and one jump to or from The Threshold",
  medium: "Every world, through the gates",
  all: "Every world, plus the no-gates figures",
};

// The label mid-sentence: only its first letter lowered, so names keep their capitals.
export const navRangeText = (range) => {
  const label = NAV_RANGE_LABELS[range] ?? NAV_RANGE_LABELS.none;
  return label.charAt(0).toLowerCase() + label.slice(1);
};

// "Mira rolled to build Medbay (Tier I)" + the roll and what came of it, for a
// toast or an Events entry. `r` is the `ship-build` result the server sends.
export function describeShipWork(r) {
  const what = r.action === "build" ? `${r.compartment} (Tier ${ROMAN[r.tier]})` : `${r.compartment} to Tier ${ROMAN[r.tier]}`;
  const title = `${r.characterName} rolled to ${r.action === "build" ? "build" : "upgrade"} ${what}`;
  const mods = r.modifier + r.bonus;
  const roll = `d20 ${r.die} ${signed(mods)} = ${r.total} against DC ${r.dc}`;
  let detail;
  if (r.success) {
    detail = `${roll}. ${r.crit ? "A natural 20! " : ""}Success: ${r.cost} ${r.gradeName} spent, ${r.buildDays} ${
      r.buildDays === 1 ? "day" : "days"
    } of work begins.`;
  } else {
    detail = `${roll}. Failed: ${r.spent} ${r.gradeName} wasted and nothing started.`;
  }
  return { title, detail };
}
