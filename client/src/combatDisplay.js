import { COMBAT_TEAMS } from "./combatTeams.js";

// How a combatant's name is tinted in the combat roster, the setup list, and
// on the map. Party members always read gold; an NPC or grunt takes its
// relationship hue (from encounter serialization -- see loadFullEncounter in
// server/src/routes/combat.js) so friend and foe read apart at a glance. Mecha
// and anything without a relationship inherit the default text colour.
const REL_COLOR = {
  Ally: "var(--rel-ally)",
  Friend: "var(--rel-friend)",
  Neutral: "var(--rel-neutral)",
  Rival: "var(--rel-rival)",
  Enemy: "var(--rel-enemy)",
  Unknown: "var(--rel-unknown)",
};

export function combatantNameColor(combatant) {
  if (!combatant) return null;
  // A Mirage Coil decoy is tinted exactly like its owner.
  if (combatant.mimic) combatant = combatant.mimic;
  const team = COMBAT_TEAMS.find((t) => t.id === combatant.team);
  if (team) return team.token;
  if (combatant.kind === "character") return "var(--gold-soft)";
  if (combatant.kind === "npc") return REL_COLOR[combatant.relationship] || REL_COLOR.Unknown;
  return null;
}
