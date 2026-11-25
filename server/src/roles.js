// The three account roles, and the two questions every route actually asks
// about them. "Can view as DM" covers the Dungeon Master and the DM
// Assistant (read access to every player's slugs, sheets, purses, ...);
// "can edit as DM" is the Dungeon Master alone. A DM Assistant fails every
// edit check, so any route that still compares against "Dungeon Master"
// directly treats an assistant like a player who owns nothing -- the safe
// default.
export const ROLE_PLAYER = "Player";
export const ROLE_DM = "Dungeon Master";
export const ROLE_ASSISTANT = "DM Assistant";

export const VALID_ROLES = [ROLE_PLAYER, ROLE_DM, ROLE_ASSISTANT];

export function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function roleOf(userOrRole) {
  return typeof userOrRole === "string" ? userOrRole : userOrRole?.role;
}

export function canViewAsDm(userOrRole) {
  const role = roleOf(userOrRole);
  return role === ROLE_DM || role === ROLE_ASSISTANT;
}

export function canEditAsDm(userOrRole) {
  return roleOf(userOrRole) === ROLE_DM;
}

export function isAssistant(userOrRole) {
  return roleOf(userOrRole) === ROLE_ASSISTANT;
}

// Players are the only role that has a character, votes on travel, or
// takes part in any other party vote.
export function isPlayerRole(userOrRole) {
  return roleOf(userOrRole) === ROLE_PLAYER;
}

// Express middleware versions of the checks above. They read req.user.role,
// which requireAuth (middleware/auth.js) has already replaced with the
// current role from the database.
export function requireDmView(req, res, next) {
  if (!canViewAsDm(req.user)) {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// For routers that are DM-only as a whole (the template catalogs, admin):
// reads are open to anyone who can view as DM, writes need the DM.
export function requireDmReadOrEdit(req, res, next) {
  const isRead = req.method === "GET" || req.method === "HEAD";
  return isRead ? requireDmView(req, res, next) : requireDmEdit(req, res, next);
}

export function requireDmEdit(req, res, next) {
  if (!canEditAsDm(req.user)) {
    return res.status(403).json({
      error: isAssistant(req.user)
        ? "DM Assistants can view this but not change it."
        : "Dungeon Master access required.",
    });
  }
  next();
}
