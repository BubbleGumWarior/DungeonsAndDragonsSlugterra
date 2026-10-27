// DB-side helpers for outfits: granting a copy of a template, finding what a
// player is wearing, and reading the climate they are standing in. The rules
// themselves are pure and live in outfitRules.js / planetRules.js.
import { pool } from "./db.js";
import { broadcastAll } from "./ws.js";
import { climateTemperature } from "./planetRules.js";

export function toClientOutfit(row) {
  return {
    id: row.id,
    userId: row.user_id,
    templateId: row.template_id,
    name: row.name,
    description: row.description,
    comfortMin: row.comfort_min,
    comfortMax: row.comfort_max,
    gritBonus: row.grit_bonus,
    movePct: row.move_pct,
    apBonus: row.ap_bonus,
    accuracyBonus: row.accuracy_bonus,
    equipped: row.equipped,
    createdAt: row.created_at,
  };
}

// Gives a player their own copy of a template. Returns the new row, or null if
// the template is missing or they already own it. The first outfit someone ever
// owns is worn automatically, as is any granted with `equip: true`.
export async function grantOutfit(db, userId, templateId, { equip = false } = {}) {
  const { rows: tpl } = await db.query("SELECT id FROM outfit_templates WHERE id = $1", [templateId]);
  if (!tpl[0]) return null;
  const { rows: owned } = await db.query("SELECT 1 FROM outfits WHERE user_id = $1 AND template_id = $2", [userId, templateId]);
  if (owned[0]) return null;
  const { rows: worn } = await db.query("SELECT 1 FROM outfits WHERE user_id = $1 AND equipped", [userId]);
  const wear = equip || !worn[0];
  if (wear && worn[0]) await db.query("UPDATE outfits SET equipped = false WHERE user_id = $1 AND equipped", [userId]);
  const { rows } = await db.query(
    `INSERT INTO outfits (user_id, template_id, name, description, comfort_min, comfort_max, grit_bonus, move_pct, ap_bonus, accuracy_bonus, equipped)
     SELECT $1, id, name, description, comfort_min, comfort_max, grit_bonus, move_pct, ap_bonus, accuracy_bonus, $3
     FROM outfit_templates WHERE id = $2 RETURNING *`,
    [userId, templateId, wear]
  );
  return rows[0];
}

export async function getWornOutfit(db, userId) {
  const { rows } = await db.query("SELECT * FROM outfits WHERE user_id = $1 AND equipped LIMIT 1", [userId]);
  return rows[0] ?? null;
}

// The temperature the party is standing in right now: the world they are on, or
// the ship's own air while it is under way.
export async function getClimate(db = pool) {
  const { rows: area } = await db.query("SELECT slug_hunt_area FROM campaign_settings WHERE id = 1");
  const { rows: travel } = await db.query("SELECT traveling FROM travel_state WHERE id = 1");
  const index = area[0]?.slug_hunt_area ?? 0;
  const traveling = Boolean(travel[0]?.traveling);
  return { area: index, traveling, temp: climateTemperature(index, traveling) };
}

// One bare "it happened" nudge -- views refetch (see single-slot signals).
export function announceOutfitsChanged(userId) {
  broadcastAll({ type: "outfits-changed", userId, at: Date.now() });
}
