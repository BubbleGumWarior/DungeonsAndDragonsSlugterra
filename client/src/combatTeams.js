// Teams a combatant can fight for. "party" and "foes" are the classic two
// sides and stay the default (see combatSide in combatSkills.js); the others
// exist for three-way brawls, rival crews, and turncoats. Ids must match
// COMBAT_TEAM_IDS in server/src/combatRules.js. Colours are CSS tokens
// (index.css) so the same hue paints the roster, the legend and the map ring.
export const COMBAT_TEAMS = [
  { id: "party", label: "Party", token: "var(--team-party)" },
  { id: "foes", label: "Hostiles", token: "var(--team-foes)" },
  { id: "azure", label: "Azure", token: "var(--team-azure)" },
  { id: "verdant", label: "Verdant", token: "var(--team-verdant)" },
  { id: "violet", label: "Violet", token: "var(--team-violet)" },
  { id: "rose", label: "Rose", token: "var(--team-rose)" },
];

export const teamById = (id) => COMBAT_TEAMS.find((t) => t.id === id) || COMBAT_TEAMS[1];
