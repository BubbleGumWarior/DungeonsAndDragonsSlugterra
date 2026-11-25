// Client mirror of server/src/roles.js. Three roles; pages ask one of two
// questions: "can this user see what the DM sees?" (DM + DM Assistant) and
// "can this user change things as the DM?" (DM only). Hide edit controls
// behind canEditAsDm; widen read-only views with canViewAsDm.
export const ROLE_PLAYER = "Player";
export const ROLE_DM = "Dungeon Master";
export const ROLE_ASSISTANT = "DM Assistant";

export const ROLES = [ROLE_PLAYER, ROLE_DM, ROLE_ASSISTANT];

export function canViewAsDm(user) {
  return user?.role === ROLE_DM || user?.role === ROLE_ASSISTANT;
}

export function canEditAsDm(user) {
  return user?.role === ROLE_DM;
}

export function isAssistant(user) {
  return user?.role === ROLE_ASSISTANT;
}

// Only Players have a character, vote on travel, buy, trade, and so on.
export function isPlayer(user) {
  return user?.role === ROLE_PLAYER;
}
