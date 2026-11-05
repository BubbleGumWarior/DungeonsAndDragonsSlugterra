// Display helpers for the Deck Plan's building and upgrading. The rules live on
// the server (server/src/shipRules.js); this only words what it reports.

export const ROMAN = ["", "I", "II", "III"];

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// The routes a Nav Computer charts at each tier, from the server's `navRange`
// (the distances mirror CLOSE_RANGE_MAX / MEDIUM_RANGE_MAX in shipRules.js).
export const NAV_RANGE_LABELS = {
  none: "No worlds",
  close: "Worlds up to 13 units away",
  medium: "Worlds up to 30 units away",
  all: "Every world",
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
