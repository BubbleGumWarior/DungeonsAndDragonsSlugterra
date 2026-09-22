// Fandango's passive, the `tempo_aura` slug flag (see TEMPO_* in combatRules.js).
//
// While any of an owner's slugs carrying that flag is loaded in one of their
// equipped weapons, all of that owner's slugs come back from a shot in fewer
// turns (see slugReturnTurns, used wherever a cooldown is started) and hold
// 50% more energy pips. The pips live in each slug's stored `energy_pips`
// array -- every reader (combat, the slug cards, the DM tools) already just
// looks at that array's length -- so instead of layering a second "effective
// max" over all of them, syncTempoAura resizes the stored array whenever the
// aura switches on or off. It's idempotent: call it after anything that can
// change who has the aura (loading/unloading/deleting/editing a slug,
// unequipping or deleting a weapon, a rest, an NPC joining a fight).
import { pool } from "./db.js";
import { broadcastAll } from "./ws.js";
import { toClientSlug } from "./routes/slugs.js";
import { SLUG_RETURN_TURNS, TEMPO_RETURN_TURNS, tempoMaxPips } from "./combatRules.js";

// A player's slugs are keyed to their user, an NPC's to its combatant row.
function ownerClause(owner) {
  if (owner.ownerCombatantId != null) return { where: "owner_combatant_id = $1", value: owner.ownerCombatantId };
  if (owner.userId != null) return { where: "user_id = $1", value: owner.userId };
  return null;
}

export async function ownerHasTempoAura(owner) {
  const clause = ownerClause(owner);
  if (!clause) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM slugs s
     JOIN blasters b ON b.id = s.equipped_blaster_id
     WHERE s.${clause.where} AND s.tempo_aura AND b.equip_slot IS NOT NULL
     LIMIT 1`,
    [clause.value]
  );
  return rows.length > 0;
}

// How many of its owner's turns a slug that just flew is away for.
export async function slugReturnTurns(slugRow) {
  const aura = await ownerHasTempoAura({ userId: slugRow.user_id, ownerCombatantId: slugRow.owner_combatant_id });
  return aura ? TEMPO_RETURN_TURNS : SLUG_RETURN_TURNS;
}

// Resizes every one of this owner's energy_pips arrays to match whether the
// aura is currently up, broadcasting each slug it changes, and returns the
// updated rows. Newly gained pips arrive full when `fill` is true (a rest, a
// freshly created slug, an NPC spawning in) and empty otherwise -- gaining
// the aura by loading Fandango mid-fight is not a free refill; the extra
// capacity fills at the next rest. Losing it trims pips off the end.
export async function syncTempoAura(owner, { fill = false } = {}) {
  const clause = ownerClause(owner);
  if (!clause) return [];
  const active = await ownerHasTempoAura(owner);
  const { rows } = await pool.query(`SELECT id, max_energy_pips, energy_pips FROM slugs WHERE ${clause.where}`, [clause.value]);

  const changed = [];
  for (const slug of rows) {
    const pips = Array.isArray(slug.energy_pips) ? slug.energy_pips : [];
    const target = active ? tempoMaxPips(slug.max_energy_pips) : slug.max_energy_pips;
    if (pips.length === target) continue;
    const next = pips.length > target ? pips.slice(0, target) : [...pips, ...Array(target - pips.length).fill(fill)];
    const { rows: updated } = await pool.query("UPDATE slugs SET energy_pips = $1 WHERE id = $2 RETURNING *", [
      JSON.stringify(next),
      slug.id,
    ]);
    if (!updated[0]) continue;
    changed.push(updated[0]);
    broadcastAll({ type: "slug-updated", userId: updated[0].user_id, slug: toClientSlug(updated[0]) });
  }
  // The per-slug broadcasts above are a burst, and the client only keeps the
  // latest of a burst (see the single-slot note in AccessSocket) -- so when
  // several slugs were resized at once, also send the one authoritative
  // "re-sync everything" signal the views already refetch on.
  if (changed.length > 1) broadcastAll({ type: "party-healed", at: Date.now() });
  return changed;
}
