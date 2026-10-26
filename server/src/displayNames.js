import { pool } from "./db.js";

// Players are shown to each other by character name, never by login username
// (usernames stay on the account panel and the DM's Admin page). Resolves
// userId -> character name for the given users; anyone without a character
// (e.g. the DM, or a player who hasn't made one yet) is simply absent, and
// the caller picks the fallback.
export async function loadCharacterNames(userIds) {
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(id)))];
  if (ids.length === 0) return new Map();
  const { rows } = await pool.query(
    "SELECT user_id, name FROM characters WHERE user_id = ANY($1::int[])",
    [ids]
  );
  return new Map(rows.map((r) => [r.user_id, r.name]));
}
