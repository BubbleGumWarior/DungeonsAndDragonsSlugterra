// Equipment: the non-blaster things a player carries. Two slots hold them:
//
//   Secondary (slot 1) -- ONE of: a second blaster, or a melee weapon, an ammo
//                         belt or a shield. (Shield vs. melee vs. belt vs. a
//                         second blaster is the trade-off.)
//   Armor     (slot 2) -- one suit of armor, worn alongside whatever is in the
//                         Secondary slot.
//
//   melee      -- a close-quarters weapon. Swinging it (combat's Melee action)
//                 rolls d20 + STR modifier (+ the weapon's own `accuracy`)
//                 against the usual 10 + the target's DEX modifier, and a hit
//                 deals `damage` Grit -- plus the STR modifier when that is
//                 below 1, times it when positive (see meleeDamageFor).
//                 Reaches `reach` map units.
//                 Its `melee_type` decides the on-hit effect (MELEE_TYPES).
//   ammo_belt  -- gives the primary blaster `extra_slots` more magazine
//                 slots, so one blaster can carry more slugs (see syncAmmoBelt
//                 in ammoBelt.js).
//   shield     -- soaks `absorb` damage per fight, then breaks until the fight
//                 is over (see absorbRiderDamage in routes/combat.js).
//   armor      -- adds `grit_bonus` to max Grit while worn (characters.grit_bonus,
//                 kept in step by syncAmmoBelt).
import { MOUNT_RANGE } from "./combatRules.js";

export const EQUIPMENT_KINDS = ["melee", "ammo_belt", "shield", "armor"];
export const EQUIPMENT_SLOT = 1; // the Secondary slot
export const ARMOR_SLOT = 2;

export function slotForKind(kind) {
  return kind === "armor" ? ARMOR_SLOT : EQUIPMENT_SLOT;
}

// What a melee weapon does on a hit, beyond its damage.
//   bludgeon -- shoves the target back (MELEE_KNOCKBACK_DISTANCE, into a wall = knockout check)
//   slash    -- leaves the target bleeding (the same bleed Madicus causes)
//   pierce   -- ignores a shield's absorption entirely
export const MELEE_TYPES = ["bludgeon", "slash", "pierce"];
export const DEFAULT_MELEE_TYPE = "slash";

export const MELEE_DEFAULT_AP_COST = 2;
// One step's worth of walking -- the same arm's length a mecha rams at and a
// bloom bites at. A DM can lengthen it per weapon (a spear, a whip).
export const MELEE_DEFAULT_REACH = MOUNT_RANGE;
export const MELEE_MAX_REACH = 400;
export const MELEE_MAX_DAMAGE = 30;
export const MELEE_MAX_AP_COST = 8;
export const BELT_MAX_EXTRA_SLOTS = 12;
export const SHIELD_MAX_ABSORB = 100;
export const ARMOR_MAX_GRIT = 100;

const STAT_MIN = -10;
const STAT_MAX = 20;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function intIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function validateEquipmentFields({ kind, name, image, damage, accuracy, apCost, reach, extraSlots, meleeType, absorb, gritBonus }) {
  if (!EQUIPMENT_KINDS.includes(kind)) {
    return { valid: false, error: `Kind must be one of: ${EQUIPMENT_KINDS.join(", ")}.` };
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    return { valid: false, error: "Name must be a non-empty string of 40 characters or fewer." };
  }
  if (image !== undefined && image !== null) {
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return { valid: false, error: "Image must be a base64 image data URL." };
    }
    if (image.length > MAX_IMAGE_BYTES) return { valid: false, error: "Image is too large." };
  }
  if (kind === "melee") {
    if (!intIn(damage, 0, MELEE_MAX_DAMAGE)) return { valid: false, error: `Damage must be an integer between 0 and ${MELEE_MAX_DAMAGE}.` };
    if (!intIn(accuracy, STAT_MIN, STAT_MAX)) return { valid: false, error: `Accuracy must be an integer between ${STAT_MIN} and ${STAT_MAX}.` };
    if (!intIn(apCost, 1, MELEE_MAX_AP_COST)) return { valid: false, error: `AP Cost must be an integer between 1 and ${MELEE_MAX_AP_COST}.` };
    if (!intIn(reach, 1, MELEE_MAX_REACH)) return { valid: false, error: `Reach must be an integer between 1 and ${MELEE_MAX_REACH}.` };
    if (!MELEE_TYPES.includes(meleeType)) return { valid: false, error: `Melee type must be one of: ${MELEE_TYPES.join(", ")}.` };
  } else if (kind === "ammo_belt") {
    if (!intIn(extraSlots, 1, BELT_MAX_EXTRA_SLOTS)) {
      return { valid: false, error: `Extra Slots must be an integer between 1 and ${BELT_MAX_EXTRA_SLOTS}.` };
    }
  } else if (kind === "shield") {
    if (!intIn(absorb, 1, SHIELD_MAX_ABSORB)) {
      return { valid: false, error: `Absorb must be an integer between 1 and ${SHIELD_MAX_ABSORB}.` };
    }
  } else if (!intIn(gritBonus, 1, ARMOR_MAX_GRIT)) {
    return { valid: false, error: `Bonus Grit must be an integer between 1 and ${ARMOR_MAX_GRIT}.` };
  }
  return { valid: true };
}

// The numbers of a swing, given the swinger's STR modifier. Pure so the client
// preview and the server agree on them. A STR modifier below 1 is added to the
// weapon's damage (a weak swinger hits softer); a positive one multiplies it.
export function meleeDamageFor(weaponDamage, strMod) {
  const damage = weaponDamage ?? 0;
  return Math.max(1, strMod < 1 ? damage + strMod : damage * strMod);
}
