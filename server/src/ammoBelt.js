// Keeps what equipment drives in step with what a player has equipped:
//
//   * blasters.magazine_bonus -- an ammo belt (equipment.kind = 'ammo_belt', in
//     the Secondary slot) gives the blaster in the PRIMARY slot `extra_slots`
//     more magazine slots; every other blaster of theirs gets none. A smaller
//     magazine than before (belt removed, primary swapped) leaves slugs in
//     slots that no longer exist, so those are unloaded.
//   * characters.grit_bonus -- worn armor (kind = 'armor', Armor slot) and the
//     worn outfit add their `grit_bonus` to max Grit (computeMaxGrit); current Grit rises by the
//     bonus when armor goes on, and is capped to the new maximum when it comes off.
//
// Idempotent -- call syncAmmoBelt (inside the same transaction, with that
// transaction's client) after anything that can change which blaster is
// primary or what is equipped: equipping/unequipping either, deleting or
// trading one away.
import { pool } from "./db.js";
import { broadcastAll } from "./ws.js";
import { syncTempoAura } from "./slugAura.js";
import { computeMaxGrit } from "./characterRules.js";
import { toClientCharacter } from "./routes/characters.js";

// Worn armor and the worn outfit (outfits table) both add Grit, so the stored
// bonus is their sum.
export async function syncArmorGrit(db, userId) {
  const { rows: armor } = await db.query(
    "SELECT grit_bonus FROM equipment WHERE user_id = $1 AND kind = 'armor' AND equip_slot IS NOT NULL LIMIT 1",
    [userId]
  );
  const { rows: outfit } = await db.query("SELECT grit_bonus FROM outfits WHERE user_id = $1 AND equipped LIMIT 1", [userId]);
  const bonus = (armor[0]?.grit_bonus ?? 0) + (outfit[0]?.grit_bonus ?? 0);
  const { rows } = await db.query("SELECT stats, grit_bonus FROM characters WHERE user_id = $1", [userId]);
  if (!rows[0] || rows[0].grit_bonus === bonus) return false;
  // Putting armor on heals the extra Grit it adds; taking it off only caps
  // current Grit to the smaller maximum.
  const gained = Math.max(bonus - rows[0].grit_bonus, 0);
  await db.query("UPDATE characters SET grit_bonus = $2, current_grit = LEAST(current_grit + $4, $3) WHERE user_id = $1", [
    userId,
    bonus,
    computeMaxGrit(rows[0].stats, bonus),
    gained,
  ]);
  return true;
}

export async function syncAmmoBelt(db, userId) {
  const { rows: belts } = await db.query(
    "SELECT extra_slots FROM equipment WHERE user_id = $1 AND kind = 'ammo_belt' AND equip_slot IS NOT NULL LIMIT 1",
    [userId]
  );
  const bonus = belts[0]?.extra_slots ?? 0;

  // Only the primary carries the belt's slots...
  await db.query(
    "UPDATE blasters SET magazine_bonus = 0 WHERE user_id = $1 AND owner_combatant_id IS NULL AND equip_slot IS DISTINCT FROM 0 AND magazine_bonus <> 0",
    [userId]
  );
  await db.query(
    "UPDATE blasters SET magazine_bonus = $2 WHERE user_id = $1 AND owner_combatant_id IS NULL AND equip_slot = 0 AND magazine_bonus <> $2",
    [userId, bonus]
  );
  // ...so anything loaded past the (possibly shrunken) magazine comes out.
  const { rows: unloaded } = await db.query(
    `UPDATE slugs s SET equipped_blaster_id = NULL, magazine_slot = NULL
     FROM blasters b
     WHERE s.equipped_blaster_id = b.id AND b.user_id = $1 AND s.magazine_slot >= b.magazine_size + b.magazine_bonus
     RETURNING s.id`,
    [userId]
  );
  const armorChanged = await syncArmorGrit(db, userId);
  return { unloadedSlugCount: unloaded.length, armorChanged };
}

// Post-commit: tell every client this player's loadout changed. Equipment,
// blaster magazines and loaded slugs can all move at once, and the live socket
// only keeps the last message of a burst, so this is one "it happened" signal
// the views refetch on rather than a payload per row.
export async function announceEquipmentChange(userId, sync = null) {
  broadcastAll({ type: "equipment-changed", userId, at: Date.now() });
  // An unloaded slug may have been a Tempo Aura carrier (see slugAura.js).
  if (sync?.unloadedSlugCount > 0) await syncTempoAura({ userId });
  // Armor changes max Grit -- push the character so every sheet/ring updates.
  if (sync?.armorChanged) {
    const { rows } = await pool.query("SELECT * FROM characters WHERE user_id = $1", [userId]);
    if (rows[0]) broadcastAll({ type: "character-updated", userId, character: toClientCharacter(rows[0]) });
  }
}
