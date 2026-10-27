// Seeds the outfit catalog and hands every character without one the starter
// outfit. Idempotent: templates are inserted by name (a row a DM edited is left
// alone, a deleted one returns on the next boot), and a template's world stock
// is only written when the template itself is new.
import { pool } from "./db.js";
import { DEFAULT_OUTFITS, SELL_MARGIN, ALWAYS_STOCK_BELOW, STOCK_CHANCE_INSIDE, STOCK_CHANCE_MARGIN } from "./data/defaultOutfits.js";
import { PLANET_TEMPS } from "./planetRules.js";
import { grantOutfit } from "./outfitService.js";

export function defaultOutfitPrice(o) {
  const width = Math.min(150, (o.max ?? 0) - (o.min ?? 0));
  const raw = 25 + 0.9 * width + 12 * (o.g ?? 0) + Math.max(0, -(o.ap ?? 0)) * 20;
  return Math.max(5, Math.round(raw / 5) * 5);
}

// A fixed 0-99 number for a (world, outfit) pair, so a world's racks are the
// same on every fresh database.
function localRoll(world, name) {
  let h = world * 7919 + 17;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 100;
}

// Worlds that stock an outfit: the climate rule and the local-stock roll, plus
// its explicit extras.
export function soldOnWorlds(o) {
  if (o.starter) return [];
  if (o.everywhere) return PLANET_TEMPS.map((_, i) => i);
  const worlds = new Set(o.also ?? []);
  PLANET_TEMPS.forEach((temp, i) => {
    if (temp < o.min - SELL_MARGIN || temp > o.max + SELL_MARGIN) return;
    const inside = temp >= o.min && temp <= o.max;
    const chance = temp < ALWAYS_STOCK_BELOW ? 100 : inside ? STOCK_CHANCE_INSIDE : STOCK_CHANCE_MARGIN;
    if (localRoll(i, o.name) < chance) worlds.add(i);
  });
  return [...worlds].sort((a, b) => a - b);
}

export async function seedDefaultOutfits() {
  for (const o of DEFAULT_OUTFITS) {
    const { rows } = await pool.query(
      `INSERT INTO outfit_templates (name, description, comfort_min, comfort_max, grit_bonus, move_pct, ap_bonus, accuracy_bonus, base_price, starter)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (name) DO NOTHING RETURNING id`,
      [o.name, o.desc, o.min, o.max, o.g ?? 0, o.mv ?? 0, o.ap ?? 0, o.ac ?? 0, o.starter ? 0 : (o.price ?? defaultOutfitPrice(o)), Boolean(o.starter)]
    );
    if (!rows[0]) continue;
    for (const world of soldOnWorlds(o)) {
      await pool.query("INSERT INTO outfit_template_planets (template_id, planet_index) VALUES ($1, $2) ON CONFLICT DO NOTHING", [rows[0].id, world]);
    }
  }
  await giveStarterOutfits();
}

// Everyone owns the starter outfit; anyone who owns no outfit at all (existing
// characters when this shipped) is given it, worn.
export async function giveStarterOutfits() {
  const { rows: starter } = await pool.query("SELECT id FROM outfit_templates WHERE starter ORDER BY id LIMIT 1");
  if (!starter[0]) return;
  const { rows: bare } = await pool.query(
    "SELECT c.user_id FROM characters c WHERE NOT EXISTS (SELECT 1 FROM outfits o WHERE o.user_id = c.user_id)"
  );
  for (const c of bare) await grantOutfit(pool, c.user_id, starter[0].id, { equip: true });
}
