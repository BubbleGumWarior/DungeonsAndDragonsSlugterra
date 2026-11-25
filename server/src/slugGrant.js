import { pool } from "./db.js";
import { broadcastAll } from "./ws.js";
import { syncTempoAura } from "./slugAura.js";
import { recordSlugpediaEntry } from "./slugpediaStore.js";
import { toClientSlug } from "./routes/slugs.js";

// Hands a player a fresh copy of a slug template, exactly as the DM's one-click
// Give does: every column the two tables share is copied (all the ability
// flags, art, stats, loyalty), energy starts full, and the owner's Tempo Aura
// is re-fit. Used by the Slug Bundle claims and by approved slug hunts.
//
// Sends one slug-updated for the new slug and records it in the party
// slugpedia. Returns the client-shaped slug, or null if the template is gone.
export async function grantSlugFromTemplate(templateId, userId) {
  const { rows: cols } = await pool.query(
    `SELECT a.column_name FROM information_schema.columns a
     JOIN information_schema.columns b ON b.column_name = a.column_name AND b.table_name = 'slugs' AND b.table_schema = a.table_schema
     WHERE a.table_name = 'slug_templates' AND a.table_schema = current_schema()
       AND a.column_name NOT IN ('id', 'created_at')`
  );
  const names = cols.map((c) => `"${c.column_name}"`).join(", ");
  const sources = cols.map((c) => `t."${c.column_name}"`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO slugs (template_id, user_id, energy_pips, ${names})
     SELECT t.id, $2, (SELECT COALESCE(jsonb_agg(true), '[]'::jsonb) FROM generate_series(1, t.max_energy_pips)), ${sources}
     FROM slug_templates t WHERE t.id = $1 RETURNING *`,
    [templateId, userId]
  );
  if (!rows[0]) return null;

  // A new slug arrives full, Tempo Aura stamina included (see slugAura.js).
  const changed = await syncTempoAura({ userId }, { fill: true });
  const row = changed.find((r) => r.id === rows[0].id) ?? rows[0];
  const slug = toClientSlug(row);
  broadcastAll({ type: "slug-updated", userId, slug });
  await recordSlugpediaEntry(rows[0]);
  return slug;
}
