import fs from "node:fs";
import { pool } from "./db.js";

const SEED_DIR = new URL("./seed/", import.meta.url);

// The party's starting ship, "The Traveler": stats, deck plan image and all of
// its compartments exactly as the DM built them (seed/default-ship.json plus
// the image beside it). A brand-new database gets it as its active ship.
//
// It is only ever seeded once: the `default_ship_seeded` flag is set whether or
// not this run inserted anything, so a campaign that already has ships (or a DM
// who later deletes them all) never has it put back.
export async function seedDefaultShip() {
  const { rows } = await pool.query("SELECT default_ship_seeded FROM campaign_settings WHERE id = 1");
  if (rows[0]?.default_ship_seeded) return;

  const { rows: existing } = await pool.query("SELECT 1 FROM ships LIMIT 1");
  if (existing.length === 0) {
    const spec = JSON.parse(fs.readFileSync(new URL("default-ship.json", SEED_DIR), "utf8"));
    const imageFile = new URL(spec.image, SEED_DIR);
    const mime = spec.image.endsWith(".png") ? "image/png" : "image/jpeg";
    const image = `data:${mime};base64,${fs.readFileSync(imageFile).toString("base64")}`;

    const { rows: created } = await pool.query(
      `INSERT INTO ships (name, image, speed, compartment_slots, compartments)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [spec.name, image, spec.speed, spec.compartmentSlots, JSON.stringify(spec.compartments)]
    );
    await pool.query(
      "UPDATE campaign_settings SET active_ship_id = COALESCE(active_ship_id, $1) WHERE id = 1",
      [created[0].id]
    );
    console.log(`Seeded default ship "${spec.name}".`);
  }

  await pool.query("UPDATE campaign_settings SET default_ship_seeded = true WHERE id = 1");
}
