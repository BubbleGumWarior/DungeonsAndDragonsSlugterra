// The boolean ability flags a slugpedia entry records, as `slugs` columns.
// Keep this in step with SLUG_TRAITS in client/src/slugData.js: a flag missing
// here never reaches the book, so it can't show as a trait or tell two
// variants apart.
//
// BASE flags were recorded from the start and are part of every signature.
// EXTRA flags were added later; they only enter a signature when set (see
// slugpediaStore.js), so a slug without any of them keeps the signature it
// had before they existed and doesn't turn into a duplicate entry.
export const BASE_FLAG_COLUMNS = [
  "breaks_walls",
  "causes_knockback",
  "wall_maker",
  "bridge_maker",
  "aoe_blast",
  "hazard_maker",
  "causes_blind",
  "causes_snare",
  "causes_shock",
  "causes_jam",
  "pierces_walls",
  "causes_chain",
  "ricochets",
  "ultra_fast",
  "causes_invisible",
  "causes_fear",
  "causes_confusion",
  "trail_wall",
  "clash_tripled",
];

export const EXTRA_FLAG_COLUMNS = [
  "cone_blast",
  "spawns_pods",
  "mirage_decoy",
  "star_wall",
  "anchor_zone",
  "voids_fire_clash",
  "clears_fire_terrain",
  "causes_disarm",
  "disarm_zone",
  "mind_scramble",
  "swaps_position",
  "friction_shift",
  "crosswind_zone",
  "skips_reload",
  "emotion_surge",
  "uncounterable",
  "damage_tripled",
  "static_mark",
  "tempo_aura",
  "heal_over_time",
  "grapple",
  "causes_stun",
  "stalls_slugs",
  "amplifies_partner",
  "pulls_metal",
  "phases_walls",
  "mirrors_clash",
  "surrounds_target",
  "ambush_tripled",
  "summons_plant",
  "causes_burn",
  "massive_aoe",
  "random_statuses",
  "summons_ghost",
  "potent_poison",
  "causes_bleed",
  "power_surge",
  "life_drain",
  "adaptive_strain",
  "pounce_strike",
  "time_skip",
  "lightning_strike",
  "dagger_throw",
];

export const ALL_FLAG_COLUMNS = [...BASE_FLAG_COLUMNS, ...EXTRA_FLAG_COLUMNS];

export const camelCase = (col) => col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
