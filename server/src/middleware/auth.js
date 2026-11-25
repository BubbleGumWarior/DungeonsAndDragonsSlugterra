import jwt from "jsonwebtoken";
import { pool } from "../db.js";

// The login token carries the role it was signed with, but the DM can change
// a user's role from the admin panel at any time (Player <-> DM Assistant <->
// Dungeon Master). So the token's role is never trusted for access: every
// request swaps in the current role from `users.role`. A small in-memory cache
// keeps that from costing a query per request; admin.js updates it the moment
// a role changes (setCachedRole), and entries expire on their own as a
// backstop.
const ROLE_CACHE_TTL_MS = 60 * 1000;
const roleCache = new Map();

export function setCachedRole(userId, role) {
  roleCache.set(userId, { role, at: Date.now() });
}

export function forgetCachedRole(userId) {
  roleCache.delete(userId);
}

export async function currentRole(userId) {
  const hit = roleCache.get(userId);
  if (hit && Date.now() - hit.at < ROLE_CACHE_TTL_MS) return hit.role;
  const { rows } = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
  const role = rows[0]?.role ?? null;
  if (role) setCachedRole(userId, role);
  else roleCache.delete(userId);
  return role;
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  try {
    const role = await currentRole(payload.sub);
    // A deleted account keeps whatever its token said; the routes that
    // matter already 404 on a missing user row.
    req.user = role ? { ...payload, tokenRole: payload.role, role } : payload;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not check your account." });
  }
}

// A DM Assistant sees what the DM sees but changes nothing. The per-route
// checks (roles.js) already say so route by route; this is the backstop for
// every write a route forgot to guard. Only these writes get through for an
// assistant -- their own account, chat, their own notes book, and playing
// the NPCs the DM assigned them in combat (combat.js checks each action
// against the combatant's controller, exactly like a player's own character).
const ASSISTANT_WRITE_ALLOWLIST = [
  /^\/auth\//,
  /^\/settings\/(preferences|voice-peer-volume)$/,
  /^\/chat\/messages$/,
  /^\/notes(\/\d+)?$/,
  /^\/combat\/actions\/(?!revive$)[a-z-]+$/,
  /^\/combat\/(counters|knockout)\/[^/]+\/resolve$/,
  /^\/combat\/reports\/\d+\/seen$/,
];

export async function assistantWriteGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();
  let payload;
  try {
    payload = jwt.verify(header.slice("Bearer ".length), process.env.JWT_SECRET);
  } catch {
    return next(); // the route's own requireAuth answers with the 401
  }
  try {
    if ((await currentRole(payload.sub)) !== "DM Assistant") return next();
    if (ASSISTANT_WRITE_ALLOWLIST.some((re) => re.test(req.path))) return next();
    res.status(403).json({ error: "DM Assistants can view this but not change it." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not check your account." });
  }
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}
