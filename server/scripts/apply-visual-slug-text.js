// ONE-OFF DEV SCRIPT -- pushes the reworded (visual, non-mechanical) velocity
// and protoform text from defaultSlugTemplates.json into an already-seeded
// database. seedDefaultSlugTemplates() only INSERTs unseen names, so existing
// rows keep their old text. Each row is updated only if it still holds the old
// default text (from .old-slug-text.json), so DM edits are never overwritten.
//
// Usage (from the server/ directory): node scripts/apply-visual-slug-text.js
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaults = JSON.parse(readFileSync(path.join(__dirname, "..", "src", "data", "defaultSlugTemplates.json"), "utf8"));
const old = JSON.parse(readFileSync(path.join(__dirname, ".old-slug-text.json"), "utf8"));

let total = 0;
for (const t of defaults) {
  const o = old[t.name];
  if (!o) continue;
  for (const table of ["slug_templates", "slugs"]) {
    if (o.velocity !== t.velocityAbility) {
      const r = await pool.query(`UPDATE ${table} SET velocity_ability = $1 WHERE name = $2 AND velocity_ability = $3`, [t.velocityAbility, t.name, o.velocity]);
      total += r.rowCount;
    }
    if (o.proto !== t.protoformUtility) {
      const r = await pool.query(`UPDATE ${table} SET protoform_utility = $1 WHERE name = $2 AND protoform_utility = $3`, [t.protoformUtility, t.name, o.proto]);
      total += r.rowCount;
    }
  }
}
console.log(`Updated ${total} row(s).`);
await pool.end();
