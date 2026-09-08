import pg from "pg";
import "dotenv/config";
import { computeMaxGrit } from "./characterRules.js";

export const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

async function backfillCurrentGrit() {
  const { rows } = await pool.query("SELECT id, stats FROM characters WHERE current_grit IS NULL");
  for (const row of rows) {
    await pool.query("UPDATE characters SET current_grit = $1 WHERE id = $2", [computeMaxGrit(row.stats), row.id]);
  }
}

// Default Mecha-Beast templates, seeded once so the DM has a starting catalog.
// `image` paths point at static files the DM can drop into client/public/mecha/.
const DEFAULT_MECHA_TEMPLATES = [
  {
    name: "LK-E",
    frameType: "Wolf",
    image: "/mecha/lk-e.jpg",
    speed: 4,
    handling: 4,
    armor: 1,
    rammingPower: 1,
    passengerCapacity: 1,
    modSlots: 4,
    tier: 0,
  },
  {
    name: "PNTH-3",
    frameType: "Panther",
    image: "/mecha/pnth-3.jpg",
    speed: 4,
    handling: 5,
    armor: 1,
    rammingPower: 2,
    passengerCapacity: 1,
    modSlots: 4,
    tier: 0,
  },
  {
    name: "TH1-DR",
    frameType: "Bull",
    image: "/mecha/thundarr.jpg",
    speed: 1,
    handling: 1,
    armor: 4,
    rammingPower: 5,
    passengerCapacity: 1,
    modSlots: 6,
    tier: 0,
  },
  {
    name: "H0R-SE",
    frameType: "Horse",
    image: "/mecha/h0r-se.jpg",
    speed: 3,
    handling: 3,
    armor: 2,
    rammingPower: 1,
    passengerCapacity: 2,
    modSlots: 4,
    tier: 0,
  },
  {
    name: "M-0",
    frameType: "Mole",
    image: "/mecha/m-0.jpg",
    speed: 2,
    handling: 2,
    armor: 2,
    rammingPower: 1,
    passengerCapacity: 1,
    modSlots: 3,
    tier: 0,
  },
  {
    name: "WR-TH0G",
    frameType: "Warthog",
    image: "/mecha/wr-th0g.jpg",
    speed: 2,
    handling: 1,
    armor: 3,
    rammingPower: 4,
    passengerCapacity: 1,
    modSlots: 4,
    tier: 0,
  },
];

// Mecha-Beast mod catalog. `speedMultiplier` is applied to the mecha's speed
// *after* every flat bonus is summed (see effectiveStats in mechaData.js), so a
// flat booster and a multiplier stack in that order rather than fighting.
const DEFAULT_MECHA_MOD_TEMPLATES = [
  {
    name: "Turbo Injector",
    effect:
      "A supplementary turbine spliced into the drive train that force-feeds compressed air to the engine on demand. It adds a flat block of raw speed to whatever the frame already puts out, at the cost of a thirstier fuel burn and a good deal more waste heat for the chassis to shed on a long run.",
    speedBonus: 2,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Reinforced Plating",
    effect:
      "Overlapping ablative plates bolted across the hull and the most exposed joints, each layer keyed to peel and spread the force of a hit rather than let it punch straight through. The added mass dulls the mecha's acceleration a touch, but it can wade through fire that would cripple a bare frame.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 2,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Ram Plow",
    effect:
      "A hardened, angled prow welded across the front of the frame and braced back into the roll cage. It lets the mecha shoulder through barricades, rubble and light cover without shredding its own bodywork, and it drives the full weight of a charge into whatever it hits.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 2,
    unlocksMode: null,
  },
  {
    name: "Hydraulic Suspension",
    effect:
      "Active hydraulic struts on every leg or wheel that read the ground a fraction of a second ahead and adjust ride height and damping on the fly. Sharp turns, broken rock and steep grades stop bleeding off control, so the pilot can hold a hard line at speed instead of nursing the mecha through it.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 2,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Aquatic Converter",
    effect:
      "A sealed intake-and-impeller kit that closes off the engine bay and hands the drive over to water jets the moment the mecha is submerged. With it fitted the mecha can ford rivers, cross flooded caverns and run along the bed of open water instead of being turned back at the shoreline.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: "aquatic",
  },
  {
    name: "Glider Fins",
    effect:
      "Retractable membrane fins that deploy from the flanks and tail, paired with a stabiliser bar that snaps out above the cockpit. They cannot lift the mecha from a standstill, but off a ledge or a ramp they turn a killing fall into a long, controlled glide down to lower ground.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: "glider",
  },
  {
    name: "Bike Conversion Kit",
    effect:
      "A full transformation package: the limbs fold in, the frame collapses to a low two-wheeled profile and the pilot drops into a racing tuck. Frontal area and rolling resistance fall away and every bit of drive-train output goes straight into forward motion, doubling the mecha's effective speed once all other tuning has been added in.",
    speedBonus: 0,
    speedMultiplier: 2,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: "bike",
  },
  {
    name: "Auger Drill",
    effect:
      "A heavy helical drill head on a telescoping arm, fed by a spoil auger that clears loosened rock and soil back behind the mecha as it advances. It bites through packed earth, clay and soft sedimentary stone, letting the mecha open its own tunnels or simply dig down and out of a fight.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 1,
    rammingBonus: 0,
    unlocksMode: "burrow",
  },
  {
    name: "Nitro Cell",
    effect:
      "A single-charge canister of nitrous oxide plumbed straight into the intake and dumped in all at once for a violent shove of acceleration. It buys a large jump in top speed, but the sudden power spike leaves the steering vague and twitchy until the bottle is spent.",
    speedBonus: 3,
    speedMultiplier: 1,
    handlingBonus: -1,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Gyro Stabiliser",
    effect:
      "A heavy flywheel spinning low in the frame that resists sudden changes in attitude, keeping the mecha planted through hard cornering and broken footing. The mass it adds down low is dead weight on a straight, shaving a little off outright speed in exchange for far steadier handling.",
    speedBonus: -1,
    speedMultiplier: 1,
    handlingBonus: 3,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Blast Cage",
    effect:
      "An external cage of box-section bar wrapped around the cockpit and power core, built to hold its shape long after the outer panels are gone. It shrugs off impacts that would fold a lighter frame, at the price of bulk that blunts the mecha's agility.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: -1,
    armorBonus: 3,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Weighted Bull Bar",
    effect:
      "A ballasted ram bar loaded with dense metal billets, turning the whole nose of the mecha into a battering mass. Anything it charges is hit with real momentum behind it, though hauling that weight everywhere costs the mecha some of its pace.",
    speedBonus: -1,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 3,
    unlocksMode: null,
  },
  {
    name: "Lightweight Chassis Kit",
    effect:
      "A rebuild around hollow-spar framing and composite panels that strips a large fraction of the mecha's mass. Everything it does becomes quicker and sharper, but the thinner structure gives ground the moment it takes a solid hit.",
    speedBonus: 1,
    speedMultiplier: 1,
    handlingBonus: 1,
    armorBonus: -1,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "All-Terrain Treads",
    effect:
      "Deep-lugged tracks and clawed pads that bite into scree, mud and loose sand where a road tyre would only spin. They keep the mecha moving and under control well off the beaten path, and cost it nothing on the flat.",
    speedBonus: 1,
    speedMultiplier: 1,
    handlingBonus: 2,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Impact Dampeners",
    effect:
      "Sacrificial crush cans and gas struts fitted behind every leading surface, soaking up the first jolt of a collision before it reaches the frame. They spare the mecha the worst of a crash and let it lean into a charge without punishing its own structure.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 2,
    rammingBonus: 1,
    unlocksMode: null,
  },
  {
    name: "Governor Bypass",
    effect:
      "A workshop job that pulls the factory rev limiter and leans the fuel map for maximum output across the whole range. The drive train gives noticeably more of itself, but runs hot and hard enough that the mecha's own plating takes the strain.",
    speedBonus: 0,
    speedMultiplier: 1.5,
    handlingBonus: 0,
    armorBonus: -1,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Spring-Loaded Legs",
    effect:
      "Pre-tensioned leg actuators that store energy on the crouch and release it in one hard extension, launching the mecha into a pounce or a standing leap. The same coiled travel eats awkward landings and throws the mecha's weight forward on a charge.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 1,
    armorBonus: 0,
    rammingBonus: 2,
    unlocksMode: null,
  },
  {
    name: "Ablative Skirt",
    effect:
      "A hanging apron of shed-plate around the lower hull that catches shrapnel, kerb strikes and low fire before it reaches anything vital. It is light enough not to slow the mecha, and it keeps grit out of the joints so the mecha stays cleaner and more responsive on rough ground.",
    speedBonus: 0,
    speedMultiplier: 1,
    handlingBonus: 1,
    armorBonus: 1,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Ramjet Booster",
    effect:
      "A rear-mounted thrust duct that fires in short bursts, kicking the mecha forward independently of its wheels or legs. The shove adds to the mecha's speed on open ground and lands behind a charge, driving a ram home with extra force.",
    speedBonus: 2,
    speedMultiplier: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 1,
    unlocksMode: null,
  },
  {
    name: "Balanced Tuning Package",
    effect:
      "A full workshop session with nothing flashy about it: fluids flushed, geometry set true, every actuator shimmed and every panel re-torqued to spec. The mecha comes out a step better at everything it already did.",
    speedBonus: 1,
    speedMultiplier: 1,
    handlingBonus: 1,
    armorBonus: 1,
    rammingBonus: 1,
    unlocksMode: null,
  },
];

async function seedDefaultMechaTemplates() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM mecha_templates");
  if (rows[0].count > 0) return;
  for (const t of DEFAULT_MECHA_TEMPLATES) {
    await pool.query(
      `INSERT INTO mecha_templates
        (name, frame_type, image, speed, handling, armor, ramming_power, passenger_capacity, mod_slots, tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [t.name, t.frameType, t.image, t.speed, t.handling, t.armor, t.rammingPower, t.passengerCapacity, t.modSlots, t.tier]
    );
  }
}

// Idempotent per name: seeds the full default mod catalog on a fresh install
// and back-fills any entry a later release adds (the catalog grew from 8 to
// 20). A name a DM has deleted comes back on the next boot -- these are the
// house catalog, not curated content.
async function seedDefaultMechaModTemplates() {
  for (const m of DEFAULT_MECHA_MOD_TEMPLATES) {
    await pool.query(
      `INSERT INTO mecha_mod_templates
        (name, effect, speed_bonus, speed_multiplier, handling_bonus, armor_bonus, ramming_bonus, unlocks_mode)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       WHERE NOT EXISTS (SELECT 1 FROM mecha_mod_templates WHERE name = $1)`,
      [m.name, m.effect, m.speedBonus, m.speedMultiplier ?? 1, m.handlingBonus, m.armorBonus, m.rammingBonus, m.unlocksMode]
    );
  }
}

// One-time refresh of the seeded mod catalog: fleshed-out effect text (no
// named characters) and the Bike Conversion Kit's new speed multiplier.
// Guarded on the *old* seed values so it fires once and never touches a mod
// a DM has since hand-edited. Applies to the catalog and to every player copy.
const SEEDED_MOD_REWRITES = [
  { name: "Turbo Injector", oldEffect: "A tuned turbine boost for bursts of speed." },
  { name: "Reinforced Plating", oldEffect: "Layered plating that shrugs off hits." },
  { name: "Ram Plow", oldEffect: "A reinforced prow for bull-rushing obstacles and blockades." },
  { name: "Hydraulic Suspension", oldEffect: "Precision hydraulics for sharp turns and rough terrain." },
  { name: "Aquatic Converter", oldEffect: "Kord Zane's amphibious conversion kit; lets the mecha cross open water." },
  { name: "Glider Fins", oldEffect: "Retractable fins that slow a long drop into a glide." },
  { name: "Bike Conversion Kit", oldEffect: "Folds the mecha down into a lean motorcycle form for tight tunnels." },
  { name: "Auger Drill", oldEffect: "A retractable drilling rig; lets the mecha tunnel through soil and soft rock." },
];

async function refreshSeededMechaMods() {
  for (const rw of SEEDED_MOD_REWRITES) {
    const seed = DEFAULT_MECHA_MOD_TEMPLATES.find((m) => m.name === rw.name);
    if (!seed) continue;
    for (const table of ["mecha_mod_templates", "mecha_mods"]) {
      await pool.query(
        `UPDATE ${table}
           SET effect = $1, speed_bonus = $2, speed_multiplier = $3
         WHERE name = $4 AND effect = $5`,
        [seed.effect, seed.speedBonus, seed.speedMultiplier ?? 1, rw.name, rw.oldEffect]
      );
    }
  }
}

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Player',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
  `);

  // Per-user display/audio preferences -- theme swaps the app's red accent
  // for another hue (black/gold stay constant, see index.css's [data-theme]
  // blocks); sound_volume (0-1) scales the combat shoot sound. Both persist
  // across sign-ins but never gate access, so they're plain user columns
  // rather than their own table.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'burgundy';
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sound_volume REAL NOT NULL DEFAULT 0.5;
  `);

  // Voice chat preferences -- voice_input_mode picks how the mic activates
  // (always-live vs. push-to-talk, chosen in Settings.jsx); voice_peer_volumes
  // is a { [otherUserId]: 0-1 } mixer map so a "how loud I hear them" slider
  // in VoicePanel.jsx survives across sessions, same JSONB-map shape as
  // status_effects/data elsewhere in this schema.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_input_mode TEXT NOT NULL DEFAULT 'live';
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_peer_volumes JSONB NOT NULL DEFAULT '{}';
  `);
  // voice_cue_volume (0-1) scales the Join/Leave chimes every client in a
  // call hears when someone enters or leaves it -- its own slider in
  // Settings.jsx, independent of sound_volume (the combat shoot sound).
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_cue_volume REAL NOT NULL DEFAULT 0.5;
  `);
  // master_volume (0-1) is a convenience control only -- moving it writes
  // its value into every individual sound level at once (sound_volume,
  // voice_cue_volume, every combat_sfx_volumes entry). It never scales
  // playback itself, so once the individual sliders are nudged apart from it
  // they simply differ. Stored so the slider remembers where it was left.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS master_volume REAL NOT NULL DEFAULT 0.5;
  `);
  // combat_sfx_volumes -- a { fail|miss|hit|break|hazard: 0-1 } map, one
  // level per non-launch combat sound (see CombatMap.jsx's COMBAT_SFX). A
  // sparse map: a missing key means "use the 0.5 default", so a new sound
  // needs no migration here. Same JSONB-map shape as voice_peer_volumes.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS combat_sfx_volumes JSONB NOT NULL DEFAULT '{}';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      age INTEGER,
      portrait TEXT,
      stats JSONB NOT NULL,
      proficiencies JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      slugterra_revealed BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
  await pool.query(`
    INSERT INTO campaign_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);

  // The party's current location for the dashboard Slug Hunt panel -- an
  // index (0-7) into the eight layers of the Deep (see slugHuntOdds.json).
  // The DM sets it from the panel's dropdown; players see it and hunt in it.
  await pool.query(`
    ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS slug_hunt_area INTEGER NOT NULL DEFAULT 0;
  `);

  // One "Try Hunt" attempt per player per rest -- a row here means that user
  // has already hunted and the button stays disabled for them until the DM's
  // next "Heal All" (characters.js POST /heal-all) clears the whole table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slug_hunt_locks (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      locked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Consecutive slug-hunt misses per player, tracked across rests (unlike
  // slug_hunt_locks, "Heal All" does NOT clear this) -- a pity counter so a
  // run of bad luck doesn't compound forever. See routes/slugHunt.js.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slug_hunt_streaks (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      misses INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    ALTER TABLE characters ADD COLUMN IF NOT EXISTS knockout_pips JSONB NOT NULL DEFAULT '[false,false,false]';
  `);

  await pool.query(`
    ALTER TABLE characters ADD COLUMN IF NOT EXISTS current_grit INTEGER;
  `);
  await backfillCurrentGrit();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS slug_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      protoform_image TEXT,
      velocity_image TEXT,
      clash_power INTEGER NOT NULL,
      ap_cost INTEGER NOT NULL,
      max_energy_pips INTEGER NOT NULL,
      loyalty_tier INTEGER NOT NULL DEFAULT 0,
      velocity_ability TEXT,
      protoform_utility TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS clash_defense INTEGER NOT NULL DEFAULT 5;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS slugs (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES slug_templates(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      protoform_image TEXT,
      velocity_image TEXT,
      clash_power INTEGER NOT NULL,
      ap_cost INTEGER NOT NULL,
      max_energy_pips INTEGER NOT NULL,
      energy_pips JSONB NOT NULL,
      loyalty_tier INTEGER NOT NULL DEFAULT 0,
      velocity_ability TEXT,
      protoform_utility TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS clash_defense INTEGER NOT NULL DEFAULT 5;
  `);

  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS breaks_walls BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS causes_knockback BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS breaks_walls BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS causes_knockback BOOLEAN NOT NULL DEFAULT false;
  `);

  // Terrain-shaping flags -- see docs/Slugs - OG Slugs.csv's "Wall Maker"/
  // "Bridge Maker" columns. Gate the Break Wall/Make Wall/Build Bridge Shoot
  // Slug actions (same DM-authored, per-slug metadata pattern as
  // breaks_walls/causes_knockback) -- see routes/combat.js.
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS wall_maker BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS bridge_maker BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS wall_maker BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS bridge_maker BOOLEAN NOT NULL DEFAULT false;
  `);

  // On a hit, also splashes every other nearby combatant at full effect --
  // see AOE_RADIUS/findAoeTargets in routes/combat.js.
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS aoe_blast BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS aoe_blast BOOLEAN NOT NULL DEFAULT false;
  `);

  // Leaves a damaging patch of terrain wherever an Attack shot lands -- see
  // HAZARD_RADIUS/applyHazardEffect in routes/combat.js.
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS hazard_maker BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS hazard_maker BOOLEAN NOT NULL DEFAULT false;
  `);

  // "Opt a type without this trait by default into it" flags, same pattern
  // as causes_knockback -- see docs/Slugs - OG Slugs.csv's "Causes Blind"/
  // "Causes Snare"/"Causes Shock"/"Causes Jam" columns and dealHit/
  // resolveNormalHit/advanceTurn in routes/combat.js.
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS causes_blind BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS causes_blind BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS causes_snare BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS causes_snare BOOLEAN NOT NULL DEFAULT false;
  `);
  // Shock is its own status (distinct from Psychic's "stunned" -1 AP) --
  // a shocked combatant's entire next turn is skipped, see advanceTurn.
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS causes_shock BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS causes_shock BOOLEAN NOT NULL DEFAULT false;
  `);
  // Forces the target's *next* Shoot Slug attempt to misfire (reuses the
  // existing quality-tier jam outcome) -- triggers on a landed hit or an
  // ordinary miss, never on the attacker's own misfire (the shot never left
  // the barrel) and never on an out-of-range shot (it never reached them).
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS causes_jam BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS causes_jam BOOLEAN NOT NULL DEFAULT false;
  `);
  // Blocks the Shoot Slug action entirely (see /actions/shoot) for the
  // target's next turn -- unlike causes_jam's single guaranteed misfire,
  // this is a turn-counted status (DISARM_DURATION_TURNS) that can also be
  // kept up indefinitely by Cynosure's disarm_zone field. Triggers on a
  // landed hit or an ordinary miss, same rule as causes_jam.
  await pool.query(`
    ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS causes_disarm BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS causes_disarm BOOLEAN NOT NULL DEFAULT false;
  `);

  // Bespoke one-off Velocity Abilities -- one dedicated flag each, same
  // per-slug-metadata convention as every column above. See
  // combatRules.js's "Bespoke unique-slug mechanics" section and
  // routes/combat.js for what each actually does.
  const bespokeFlags = [
    "pierces_walls", // Bladier -- Attack breaks through the first wall in its path instead of being blocked
    "causes_chain", // Speedstinger -- generalizes Electricity's chain arc to any type
    "ricochets", // Speedstinger -- a landed hit bounces on to a second target with its own full counter window
    "ultra_fast", // Zeus -- shrinks the counter window (and bolt flight time) way down
    "causes_invisible", // Thugglet -- self-targeted, hides the token from other players for 1 turn
    "causes_fear", // Frightgeist -- target's whole next turn is spent fleeing away from the shooter
    "causes_confusion", // Fandango -- target's own next shots have a flat chance of firing a full 180 off
    "trail_wall", // Emberblade / Flaringo -- leaves a wall of fire along the shot's own path
    "clash_tripled", // Emberblade -- triples this slug's own power/defense specifically while it's in a clash
    "cone_blast", // Thornlash -- travels to its target, then a cone of spikes fans out beyond the impact point at reduced power
    "spawns_pods", // Pressure Tick -- scatters 3 permanent, independently-timed steam pods that periodically fire a damaging line
    "mirage_decoy", // Mirage Coil -- self-targeted, spawns 2 decoys that mimic the owner until hit
    "star_wall", // Regulator -- forms a 5-point damaging wall burst on impact, then the segments persist as normal walls
    "anchor_zone", // Anchorage -- creates a zone that suppresses knockback and wall-breaking for anyone/anything inside it
    "voids_fire_clash", // Caligo -- any clash against a Fire-type slug, either side, cancels instantly with no damage to either slug
    "clears_fire_terrain", // Caligo -- on landing, snuffs out any Fire-origin wall/bridge/hazard within HAZARD_RADIUS; otherwise leaves its own steam hazard patch instead
    "disarm_zone", // Cynosure -- on landing, leaves a lingering electromagnetic field that keeps anyone standing in it (and for a turn after they leave) disarmed
    "mind_scramble", // Perplexus -- replaces Psychic's baseline stun with a chosen/rolled effect: 3 debuffs fired at someone else, 2 buffs fired at yourself
    "swaps_position", // Tesser -- on a landed hit, the shooter and the target slinger instantly trade map positions
    "friction_shift", // Psi -- on a landed hit, chosen/rolled between rooting the target in place (harsh friction) or a personal ice-slip risk on their next Moves (slippery)
    "crosswind_zone", // Lentus -- on landing, leaves a lingering hazard that randomly bends the course of any shot (anyone's) passing through it
    "skips_reload", // Lentus -- self-chambers immediately on returning from cooldown once its loyalty tier is Friendly or higher, no manual Reload needed
    "emotion_surge", // Eunoa -- self-shot stacks keenVision + enhancedReaction, other-shot stacks confused + blinded
    "uncounterable", // Meduslug -- never offers the target a counter at all, the shot always resolves as a plain accuracy roll
    "damage_tripled", // Meduslug -- unconditional x3 damage (unlike Emberblade's clash-only clash_tripled)
    "static_mark", // Arcling -- tags whoever it hits as `marked`, and splashes 25% of any hit this slug lands onto every other marked combatant, global
  ];
  for (const col of bespokeFlags) {
    await pool.query(`ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS ${col} BOOLEAN NOT NULL DEFAULT false;`);
    await pool.query(`ALTER TABLE slugs ADD COLUMN IF NOT EXISTS ${col} BOOLEAN NOT NULL DEFAULT false;`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blaster_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      base_type TEXT NOT NULL,
      image TEXT,
      accuracy INTEGER NOT NULL,
      reload_ap_cost INTEGER NOT NULL,
      range INTEGER NOT NULL,
      mod_slots INTEGER NOT NULL,
      magazine_size INTEGER NOT NULL,
      quality INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blasters (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES blaster_templates(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      base_type TEXT NOT NULL,
      image TEXT,
      accuracy INTEGER NOT NULL,
      reload_ap_cost INTEGER NOT NULL,
      range INTEGER NOT NULL,
      mod_slots INTEGER NOT NULL,
      magazine_size INTEGER NOT NULL,
      quality INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    ALTER TABLE blasters ADD COLUMN IF NOT EXISTS equipped BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE blasters ADD COLUMN IF NOT EXISTS equip_slot SMALLINT;
  `);

  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS equipped_blaster_id INTEGER REFERENCES blasters(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS magazine_slot INTEGER;
  `);

  // A fired slug is away in flight/recovering -- it can't be fired again
  // (as a shot or a counter) until it's counted down through this many of
  // its owner's own turns. See combatRules.js's SLUG_RETURN_TURNS.
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS cooldown_turns_left INTEGER NOT NULL DEFAULT 0;
  `);

  // Once a fired slug's return-to-hand cooldown (above) counts all the way
  // down it's back in the shooter's hand but NOT chambered -- it sits out of
  // the weapon until the owner spends a Reload action (AP cost = the active
  // blaster's reload_ap_cost) to load it back in. `loaded` false + cooldown 0
  // is the "returned, not loaded" state the combat UI marks in vertigo.
  await pool.query(`
    ALTER TABLE slugs ADD COLUMN IF NOT EXISTS loaded BOOLEAN NOT NULL DEFAULT true;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mod_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT,
      effect TEXT,
      accuracy_bonus INTEGER NOT NULL DEFAULT 0,
      reload_ap_bonus INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mods (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES mod_templates(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image TEXT,
      effect TEXT,
      accuracy_bonus INTEGER NOT NULL DEFAULT 0,
      reload_ap_bonus INTEGER NOT NULL DEFAULT 0,
      equipped_blaster_id INTEGER REFERENCES blasters(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mecha_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      frame_type TEXT NOT NULL,
      image TEXT,
      speed INTEGER NOT NULL,
      handling INTEGER NOT NULL,
      armor INTEGER NOT NULL,
      ramming_power INTEGER NOT NULL,
      passenger_capacity INTEGER NOT NULL,
      mod_slots INTEGER NOT NULL,
      tier INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mechas (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES mecha_templates(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      frame_type TEXT NOT NULL,
      image TEXT,
      speed INTEGER NOT NULL,
      handling INTEGER NOT NULL,
      armor INTEGER NOT NULL,
      ramming_power INTEGER NOT NULL,
      passenger_capacity INTEGER NOT NULL,
      mod_slots INTEGER NOT NULL,
      tier INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Terrain-traversal flags -- whether this mecha can currently glide, cross
  // open water, or tunnel. No mecha can do any of these by default; a flag
  // flips true while a mod granting that mode is equipped (kept in sync by
  // routes/mechaMods.js's syncMechaModeFlags) and false again once it is
  // removed. `bike` mode stays a badge-only affair with no persistent flag.
  await pool.query(`ALTER TABLE mechas ADD COLUMN IF NOT EXISTS can_glide BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE mechas ADD COLUMN IF NOT EXISTS can_aquatic BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE mechas ADD COLUMN IF NOT EXISTS can_burrow BOOLEAN NOT NULL DEFAULT false;`);
  // (The self-heal backfill for these flags runs further down, once mecha_mods
  // exists and the seeded mods have been (re)equipped -- see below.)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mecha_mod_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      effect TEXT,
      speed_bonus INTEGER NOT NULL DEFAULT 0,
      handling_bonus INTEGER NOT NULL DEFAULT 0,
      armor_bonus INTEGER NOT NULL DEFAULT 0,
      ramming_bonus INTEGER NOT NULL DEFAULT 0,
      unlocks_mode TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mecha_mods (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES mecha_mod_templates(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      effect TEXT,
      speed_bonus INTEGER NOT NULL DEFAULT 0,
      handling_bonus INTEGER NOT NULL DEFAULT 0,
      armor_bonus INTEGER NOT NULL DEFAULT 0,
      ramming_bonus INTEGER NOT NULL DEFAULT 0,
      unlocks_mode TEXT,
      equipped_mecha_id INTEGER REFERENCES mechas(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // A speed multiplier applied to the mecha's speed after every flat bonus is
  // summed (see effectiveStats in mechaData.js). Default 1 = no effect; the
  // Bike Conversion Kit is the only seeded mod that sets it (to 2).
  await pool.query(`ALTER TABLE mecha_mod_templates ADD COLUMN IF NOT EXISTS speed_multiplier REAL NOT NULL DEFAULT 1;`);
  await pool.query(`ALTER TABLE mecha_mods ADD COLUMN IF NOT EXISTS speed_multiplier REAL NOT NULL DEFAULT 1;`);

  await seedDefaultMechaTemplates();
  await seedDefaultMechaModTemplates();
  await refreshSeededMechaMods();

  // Self-heal / backfill: derive the terrain-mode flags on `mechas` from
  // whatever mod is equipped right now. Runs here -- after `mecha_mods` exists
  // and the seeded mods have been (re)equipped -- so it's safe on a brand-new
  // database as well as one edited straight in SQL.
  await pool.query(`
    UPDATE mechas m SET
      can_glide   = EXISTS (SELECT 1 FROM mecha_mods x WHERE x.equipped_mecha_id = m.id AND x.unlocks_mode = 'glider'),
      can_aquatic = EXISTS (SELECT 1 FROM mecha_mods x WHERE x.equipped_mecha_id = m.id AND x.unlocks_mode = 'aquatic'),
      can_burrow  = EXISTS (SELECT 1 FROM mecha_mods x WHERE x.equipped_mecha_id = m.id AND x.unlocks_mode = 'burrow')
    WHERE
      m.can_glide   IS DISTINCT FROM EXISTS (SELECT 1 FROM mecha_mods x WHERE x.equipped_mecha_id = m.id AND x.unlocks_mode = 'glider')
      OR m.can_aquatic IS DISTINCT FROM EXISTS (SELECT 1 FROM mecha_mods x WHERE x.equipped_mecha_id = m.id AND x.unlocks_mode = 'aquatic')
      OR m.can_burrow  IS DISTINCT FROM EXISTS (SELECT 1 FROM mecha_mods x WHERE x.equipped_mecha_id = m.id AND x.unlocks_mode = 'burrow');
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB;
  `);
  await pool.query(`
    ALTER TABLE messages ALTER COLUMN user_id DROP NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenges (
      id SERIAL PRIMARY KEY,
      target INTEGER NOT NULL,
      reward TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenge_rolls (
      id SERIAL PRIMARY KEY,
      challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      value INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (challenge_id, user_id)
    );
  `);

  // Combat: one active encounter at a time, run by the DM. See
  // docs/combat-system-design.md for the full rules these tables back.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS encounters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'setup',
      map_width INTEGER NOT NULL DEFAULT 1600,
      map_height INTEGER NOT NULL DEFAULT 900,
      walls JSONB NOT NULL DEFAULT '[]',
      next_wall_id INTEGER NOT NULL DEFAULT 1,
      turn_order JSONB NOT NULL DEFAULT '[]',
      active_turn_index INTEGER NOT NULL DEFAULT 0,
      round INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS combatants (
      id SERIAL PRIMARY KEY,
      encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      ref_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ref_mecha_id INTEGER REFERENCES mechas(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      portrait TEXT,
      x DOUBLE PRECISION NOT NULL DEFAULT 0,
      y DOUBLE PRECISION NOT NULL DEFAULT 0,
      max_ap INTEGER NOT NULL DEFAULT 0,
      current_ap INTEGER NOT NULL DEFAULT 0,
      max_grit INTEGER,
      current_grit INTEGER,
      max_structure INTEGER,
      current_structure INTEGER,
      knockout_pips JSONB,
      unconscious BOOLEAN NOT NULL DEFAULT false,
      disabled BOOLEAN NOT NULL DEFAULT false,
      initiative INTEGER NOT NULL DEFAULT 0,
      mounted_on INTEGER REFERENCES combatants(id) ON DELETE SET NULL,
      hunkered_last_turn BOOLEAN NOT NULL DEFAULT false,
      damaged_this_turn BOOLEAN NOT NULL DEFAULT false,
      rammed_this_round BOOLEAN NOT NULL DEFAULT false,
      status_effects JSONB NOT NULL DEFAULT '{}',
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // NPCs: a reusable DM roster (name, portrait, base stats, a loadout of
  // slug/blaster/mecha *templates*). Pulling one into an encounter clones
  // fresh, independently-tracked gear for that specific instance -- so
  // "Bandit 1" and "Bandit 2" from the same template don't share ammo.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS npc_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT,
      max_grit INTEGER NOT NULL DEFAULT 20,
      max_ap INTEGER NOT NULL DEFAULT 2,
      dex_modifier INTEGER NOT NULL DEFAULT 0,
      con_modifier INTEGER NOT NULL DEFAULT 0,
      slug_template_ids JSONB NOT NULL DEFAULT '[]',
      blaster_template_ids JSONB NOT NULL DEFAULT '[]',
      mecha_template_id INTEGER REFERENCES mecha_templates(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // The DM's uploaded battle-map image, plus the pan/zoom transform applied
  // on top of a "cover" fit -- see CombatMap.jsx's mapImgSize/coverScale math
  // for how these two combine into the final placement.
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS map_image TEXT;`);
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS map_image_scale DOUBLE PRECISION NOT NULL DEFAULT 1;`);
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS map_image_offset_x DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS map_image_offset_y DOUBLE PRECISION NOT NULL DEFAULT 0;`);

  // Ground hazards (currently just Ice slugs' icy patches) -- see
  // addIceHazard/findHazardAt. Same {id, ...} + counter pattern as walls/next_wall_id.
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS hazards JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS next_hazard_id INTEGER NOT NULL DEFAULT 1;`);

  // Player-made bridges (Bridge Maker slugs) -- rectangles {id, x, y, angle,
  // width, length, slugType}, see pointInBridge()/BRIDGE_WIDTH/BRIDGE_LENGTH
  // in combatRules.js. Walls stay on the existing `walls` column -- a
  // player-made wall is just a normal wall entry with source: "slug".
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS bridges JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS next_bridge_id INTEGER NOT NULL DEFAULT 1;`);

  // Pressure Tick's steam pods -- {id, x, y, angle, counter, ownerCombatantId,
  // clashPower}, see spawnPods/tickPods in routes/combat.js and
  // POD_MIN_TIMER/POD_MAX_TIMER/POD_LINE_LENGTH in combatRules.js. Permanent
  // for the rest of the encounter -- a pod re-arms (new random counter)
  // after it fires instead of being removed.
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS pods JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS next_pod_id INTEGER NOT NULL DEFAULT 1;`);

  // Anchorage's protective zones -- {id, x, y, radius, turnsLeft}, see
  // isInsideAnyZone/ANCHOR_RADIUS/ANCHOR_DURATION_ROUNDS in combatRules.js.
  // Ticks down once per full round (round wrap in advanceTurn), not per
  // combatant turn -- it's a battlefield fixture, not a status on a person.
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS zones JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS next_zone_id INTEGER NOT NULL DEFAULT 1;`);

  // Whether players know about this NPC exists at all -- set on the NPCs
  // tab, not per-encounter or per-combatant. Combat itself never touches
  // this: revealing/hiding and slug-guessing are entirely an NPCs-tab
  // concern (see routes/npcTemplates.js), and pulling a template into a
  // fight doesn't change or care about it.
  await pool.query(`
    ALTER TABLE npc_templates ADD COLUMN IF NOT EXISTS revealed BOOLEAN NOT NULL DEFAULT false;
  `);

  // NPC AP and Grit are no longer hand-set fields -- they're derived from
  // the DEX/CON modifiers on the same curves players use (see npcActionPoints
  // / npcMaxGrit in characterRules.js). Recompute them for every existing
  // template so old rows stop showing stale, manually-entered values.
  await pool.query(`
    UPDATE npc_templates SET
      max_ap = GREATEST(8, 6 + 3 * dex_modifier),
      max_grit = GREATEST(1, 20 + con_modifier * 5 + dex_modifier);
  `);

  // The NPCs tab is now "The Chronicle" -- a codex of everyone the party has
  // met, not just a combat-prep list. `profile` holds the biographical lines
  // (age, faction, relationship, status, bio paragraphs, connections), each
  // with its own `shown` flag so the DM reveals a card one line at a time
  // (see routes/npcTemplates.js's toPlayerTemplate). `dm_notes` is a private
  // scratchpad that never reaches a player. `combat_ready` marks whether the
  // stat block applies at all -- a shopkeeper card has it off and never shows
  // up in Combat's NPC picker. Existing rows already carry stat blocks, so it
  // defaults true.
  await pool.query(`ALTER TABLE npc_templates ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}';`);
  await pool.query(`ALTER TABLE npc_templates ADD COLUMN IF NOT EXISTS dm_notes TEXT;`);
  await pool.query(`ALTER TABLE npc_templates ADD COLUMN IF NOT EXISTS combat_ready BOOLEAN NOT NULL DEFAULT true;`);

  await pool.query(`
    ALTER TABLE combatants ADD COLUMN IF NOT EXISTS ref_npc_template_id INTEGER REFERENCES npc_templates(id) ON DELETE SET NULL;
  `);
  // An earlier design redacted an NPC combatant's stats in combat until
  // revealed; that's gone (combat always shows everyone fully) so this
  // per-combatant flag is unused.
  await pool.query(`ALTER TABLE combatants DROP COLUMN IF EXISTS revealed;`);

  // NPC-owned gear isn't tied to a real user account -- it belongs to the
  // specific spawned combatant instance instead, and is cleaned up with it.
  await pool.query(`ALTER TABLE slugs ALTER COLUMN user_id DROP NOT NULL;`);
  await pool.query(`ALTER TABLE slugs ADD COLUMN IF NOT EXISTS owner_combatant_id INTEGER REFERENCES combatants(id) ON DELETE CASCADE;`);
  await pool.query(`ALTER TABLE blasters ALTER COLUMN user_id DROP NOT NULL;`);
  await pool.query(`ALTER TABLE blasters ADD COLUMN IF NOT EXISTS owner_combatant_id INTEGER REFERENCES combatants(id) ON DELETE CASCADE;`);

  // Collective "what slugs does this NPC have?" guesses -- shared by
  // everyone (any player or the DM can add/remove any entry), scoped to the
  // NPC template itself rather than a specific combat instance or a
  // specific guesser. Pure flavor/strategy bookkeeping; never consulted by
  // combat resolution. Replaces an earlier per-player, per-combatant design.
  await pool.query(`DROP TABLE IF EXISTS npc_slug_guesses;`);
  await pool.query(`
    CREATE TABLE npc_slug_guesses (
      id SERIAL PRIMARY KEY,
      npc_template_id INTEGER NOT NULL REFERENCES npc_templates(id) ON DELETE CASCADE,
      slug_template_id INTEGER NOT NULL REFERENCES slug_templates(id) ON DELETE CASCADE,
      added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (npc_template_id, slug_template_id)
    );
  `);

  // The blow-by-blow battle log lives on its own, separate from Party Chat --
  // scoped per-encounter so it clears naturally when a fight ends.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS combat_log (
      id SERIAL PRIMARY KEY,
      encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // The party's collective "slugpedia" -- every distinct slug *variant* (by
  // its full stat block, not just its template) that's ever been assigned to
  // a player or carried by an NPC that's joined combat. Entries are never
  // deleted when the underlying slug is later removed/edited/deleted -- once
  // seen, always known. `signature` is a hash of every stat-defining column
  // below (see slugpediaStore.js), used to dedupe an identical re-assignment
  // down to a single row while still keeping distinct variants (same name,
  // different AP cost, etc.) as separate rows grouped by name on the client.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slugpedia_entries (
      id SERIAL PRIMARY KEY,
      signature TEXT NOT NULL UNIQUE,
      template_id INTEGER REFERENCES slug_templates(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      protoform_image TEXT,
      velocity_image TEXT,
      clash_power INTEGER NOT NULL,
      clash_defense INTEGER NOT NULL,
      ap_cost INTEGER NOT NULL,
      max_energy_pips INTEGER NOT NULL,
      loyalty_tier INTEGER NOT NULL,
      velocity_ability TEXT,
      protoform_utility TEXT,
      breaks_walls BOOLEAN NOT NULL DEFAULT false,
      causes_knockback BOOLEAN NOT NULL DEFAULT false,
      wall_maker BOOLEAN NOT NULL DEFAULT false,
      bridge_maker BOOLEAN NOT NULL DEFAULT false,
      aoe_blast BOOLEAN NOT NULL DEFAULT false,
      hazard_maker BOOLEAN NOT NULL DEFAULT false,
      causes_blind BOOLEAN NOT NULL DEFAULT false,
      causes_snare BOOLEAN NOT NULL DEFAULT false,
      causes_shock BOOLEAN NOT NULL DEFAULT false,
      causes_jam BOOLEAN NOT NULL DEFAULT false,
      pierces_walls BOOLEAN NOT NULL DEFAULT false,
      causes_chain BOOLEAN NOT NULL DEFAULT false,
      ricochets BOOLEAN NOT NULL DEFAULT false,
      ultra_fast BOOLEAN NOT NULL DEFAULT false,
      causes_invisible BOOLEAN NOT NULL DEFAULT false,
      causes_fear BOOLEAN NOT NULL DEFAULT false,
      causes_confusion BOOLEAN NOT NULL DEFAULT false,
      trail_wall BOOLEAN NOT NULL DEFAULT false,
      clash_tripled BOOLEAN NOT NULL DEFAULT false,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
