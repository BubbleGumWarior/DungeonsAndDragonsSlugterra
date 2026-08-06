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
    image: "/mecha/lucky.png",
    speed: 4,
    handling: 4,
    armor: 1,
    rammingPower: 1,
    passengerCapacity: 1,
    modSlots: 3,
    tier: 4,
  },
  {
    name: "PNTH-3",
    frameType: "Panther",
    image: "/mecha/pnth-3.png",
    speed: 4,
    handling: 5,
    armor: 1,
    rammingPower: 2,
    passengerCapacity: 1,
    modSlots: 2,
    tier: 2,
  },
  {
    name: "TH1-DR",
    frameType: "Bull",
    image: "/mecha/thundarr.png",
    speed: 1,
    handling: 1,
    armor: 4,
    rammingPower: 5,
    passengerCapacity: 1,
    modSlots: 3,
    tier: 4,
  },
  {
    name: "Forge-Standard Horse",
    frameType: "Horse",
    image: "/mecha/forge-standard-horse.png",
    speed: 3,
    handling: 3,
    armor: 2,
    rammingPower: 1,
    passengerCapacity: 2,
    modSlots: 3,
    tier: 1,
  },
  {
    name: "Forge-Standard Mole",
    frameType: "Mole",
    image: "/mecha/forge-standard-mole.png",
    speed: 2,
    handling: 2,
    armor: 2,
    rammingPower: 1,
    passengerCapacity: 1,
    modSlots: 2,
    tier: 1,
  },
  {
    name: "Roadworn Warthog",
    frameType: "Warthog",
    image: "/mecha/roadworn-warthog.png",
    speed: 2,
    handling: 1,
    armor: 3,
    rammingPower: 4,
    passengerCapacity: 1,
    modSlots: 3,
    tier: 0,
  },
];

const DEFAULT_MECHA_MOD_TEMPLATES = [
  {
    name: "Turbo Injector",
    effect: "A tuned turbine boost for bursts of speed.",
    speedBonus: 2,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Reinforced Plating",
    effect: "Layered plating that shrugs off hits.",
    speedBonus: 0,
    handlingBonus: 0,
    armorBonus: 2,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Ram Plow",
    effect: "A reinforced prow for bull-rushing obstacles and blockades.",
    speedBonus: 0,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 2,
    unlocksMode: null,
  },
  {
    name: "Hydraulic Suspension",
    effect: "Precision hydraulics for sharp turns and rough terrain.",
    speedBonus: 0,
    handlingBonus: 2,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: null,
  },
  {
    name: "Aquatic Converter",
    effect: "Kord Zane's amphibious conversion kit; lets the mecha cross open water.",
    speedBonus: 0,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: "aquatic",
  },
  {
    name: "Glider Fins",
    effect: "Retractable fins that slow a long drop into a glide.",
    speedBonus: 0,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: "glider",
  },
  {
    name: "Bike Conversion Kit",
    effect: "Folds the mecha down into a lean motorcycle form for tight tunnels.",
    speedBonus: 1,
    handlingBonus: 0,
    armorBonus: 0,
    rammingBonus: 0,
    unlocksMode: "bike",
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

async function seedDefaultMechaModTemplates() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM mecha_mod_templates");
  if (rows[0].count > 0) return;
  for (const m of DEFAULT_MECHA_MOD_TEMPLATES) {
    await pool.query(
      `INSERT INTO mecha_mod_templates
        (name, effect, speed_bonus, handling_bonus, armor_bonus, ramming_bonus, unlocks_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [m.name, m.effect, m.speedBonus, m.handlingBonus, m.armorBonus, m.rammingBonus, m.unlocksMode]
    );
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

  await seedDefaultMechaTemplates();
  await seedDefaultMechaModTemplates();

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
}
