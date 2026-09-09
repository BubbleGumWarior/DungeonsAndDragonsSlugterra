import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";

const router = Router();
router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// A bare "the ship data changed, refetch" nudge -- same single-slot pattern
// as slugpedia-updated (see the client AccessSocket). No payload, so a burst
// of DM edits can't lose one.
function notifyShipUpdated() {
  broadcastAll({ type: "ship-updated" });
}

// Compartment status flags -- mirrors STATUS_META in client ShipBlueprint.jsx.
const COMPARTMENT_STATUSES = ["empty", "online", "offline", "broken", "building"];

// The deck-plan nodes the DM drops on the ship image. Percent coords so they
// track the image at any rendered size (mirrors CombatMap's mapPoint math).
function cleanCompartments(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const clean = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") return null;
    const id = String(c.id ?? "").slice(0, 64);
    const label = String(c.label ?? "").slice(0, 120);
    const description = String(c.description ?? "").slice(0, 4000);
    const status = COMPARTMENT_STATUSES.includes(c.status) ? c.status : "empty";
    const xPct = Number(c.xPct);
    const yPct = Number(c.yPct);
    if (!id) return null;
    if (!Number.isFinite(xPct) || xPct < 0 || xPct > 100) return null;
    if (!Number.isFinite(yPct) || yPct < 0 || yPct > 100) return null;
    clean.push({ id, label, description, status, xPct, yPct });
  }
  return clean;
}

function toClientShip(row) {
  return {
    id: row.id,
    name: row.name,
    image: row.image ?? null,
    compartments: Array.isArray(row.compartments) ? row.compartments : [],
  };
}

async function getActiveShipId() {
  const { rows } = await pool.query("SELECT active_ship_id FROM campaign_settings WHERE id = 1");
  return rows[0]?.active_ship_id ?? null;
}

// The active ship -- every approved user can see it (players need the deck
// plan). `null` until the DM creates one.
router.get("/active", async (req, res) => {
  try {
    const activeId = await getActiveShipId();
    if (!activeId) return res.json({ ship: null });
    const { rows } = await pool.query("SELECT * FROM ships WHERE id = $1", [activeId]);
    res.json({ ship: rows[0] ? toClientShip(rows[0]) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the ship." });
  }
});

// Full list for the DM's ship switcher. Images omitted -- the list can get
// heavy and the switcher only needs names.
router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const activeId = await getActiveShipId();
    const { rows } = await pool.query(
      "SELECT id, name, compartments, (image IS NOT NULL) AS has_image, created_at FROM ships ORDER BY created_at ASC"
    );
    res.json({
      activeShipId: activeId,
      ships: rows.map((r) => ({
        id: r.id,
        name: r.name,
        hasImage: r.has_image,
        compartments: Array.isArray(r.compartments) ? r.compartments : [],
        isActive: r.id === activeId,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the ship registry." });
  }
});

// One full ship row (image included) -- the DM switcher needs this to show a
// non-active ship's deck plan.
router.get("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });
  try {
    const { rows } = await pool.query("SELECT * FROM ships WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "No such ship." });
    res.json({ ship: toClientShip(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the ship." });
  }
});

router.post("/", requireDungeonMaster, async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 120) || "The Ship";
  try {
    const { rows } = await pool.query(
      "INSERT INTO ships (name) VALUES ($1) RETURNING *",
      [name]
    );
    const ship = rows[0];
    // First ship ever -> make it active so there's always something to show.
    const activeId = await getActiveShipId();
    if (!activeId) {
      await pool.query("UPDATE campaign_settings SET active_ship_id = $1 WHERE id = 1", [ship.id]);
    }
    notifyShipUpdated();
    res.status(201).json({ ship: toClientShip(ship) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the ship." });
  }
});

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });

  const sets = [];
  const values = [];

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "A ship needs a name." });
    values.push(name);
    sets.push(`name = $${values.length}`);
  }

  if (req.body?.image !== undefined) {
    const image = req.body.image;
    if (image !== null && (typeof image !== "string" || !image.startsWith("data:image/"))) {
      return res.status(400).json({ error: "Image must be a data URL or null." });
    }
    values.push(image);
    sets.push(`image = $${values.length}`);
  }

  if (req.body?.compartments !== undefined) {
    const clean = cleanCompartments(req.body.compartments);
    if (clean === null) return res.status(400).json({ error: "Malformed compartments." });
    values.push(JSON.stringify(clean));
    sets.push(`compartments = $${values.length}::jsonb`);
  }

  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update." });

  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE ships SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: "No such ship." });
    notifyShipUpdated();
    res.json({ ship: toClientShip(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the ship." });
  }
});

router.post("/:id/activate", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });
  try {
    const { rows } = await pool.query("SELECT id FROM ships WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "No such ship." });
    await pool.query("UPDATE campaign_settings SET active_ship_id = $1 WHERE id = 1", [id]);
    notifyShipUpdated();
    res.json({ activeShipId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not switch ships." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad ship id." });
  try {
    const activeId = await getActiveShipId();
    await pool.query("DELETE FROM ships WHERE id = $1", [id]);
    // The FK is ON DELETE SET NULL, so deleting the active ship leaves the
    // party ship-less -- fall back to the most recent remaining one.
    if (activeId === id) {
      const { rows } = await pool.query("SELECT id FROM ships ORDER BY created_at DESC LIMIT 1");
      await pool.query("UPDATE campaign_settings SET active_ship_id = $1 WHERE id = 1", [rows[0]?.id ?? null]);
    }
    notifyShipUpdated();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete the ship." });
  }
});

export default router;
