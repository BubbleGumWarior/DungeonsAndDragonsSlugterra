import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSlugFields } from "../slugRules.js";

const router = Router();

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

// Player-visible "gallery": name and protoform art only, no stats -- this is
// what the NPC slug-guessing minigame picks from, so a guess is a real guess.
router.get("/gallery", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, protoform_image FROM slug_templates ORDER BY name ASC");
    res.json({ templates: rows.map((row) => ({ id: row.id, name: row.name, protoformImage: row.protoform_image })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the slug gallery." });
  }
});

router.use(requireAuth, requireDungeonMaster);

function toClientTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    protoformImage: row.protoform_image,
    velocityImage: row.velocity_image,
    clashPower: row.clash_power,
    clashDefense: row.clash_defense,
    apCost: row.ap_cost,
    maxEnergyPips: row.max_energy_pips,
    loyaltyTier: row.loyalty_tier,
    velocityAbility: row.velocity_ability,
    protoformUtility: row.protoform_utility,
    breaksWalls: row.breaks_walls,
    causesKnockback: row.causes_knockback,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM slug_templates ORDER BY created_at ASC");
    res.json({ templates: rows.map(toClientTemplate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slug templates." });
  }
});

router.post("/", async (req, res) => {
  const {
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  } = req.body || {};

  const validation = validateSlugFields({
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO slug_templates
        (name, type, protoform_image, velocity_image, clash_power, clash_defense, ap_cost, max_energy_pips, loyalty_tier, velocity_ability, protoform_utility, breaks_walls, causes_knockback)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        name.trim(),
        type,
        protoformImage ?? null,
        velocityImage ?? null,
        clashPower,
        clashDefense,
        apCost,
        maxEnergyPips,
        loyaltyTier,
        velocityAbility ?? null,
        protoformUtility ?? null,
        Boolean(breaksWalls),
        Boolean(causesKnockback),
      ]
    );
    res.status(201).json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create slug template." });
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  } = req.body || {};

  const validation = validateSlugFields({
    name,
    type,
    protoformImage,
    velocityImage,
    clashPower,
    clashDefense,
    apCost,
    maxEnergyPips,
    loyaltyTier,
    velocityAbility,
    protoformUtility,
    breaksWalls,
    causesKnockback,
  });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE slug_templates SET
        name = $1, type = $2, protoform_image = $3, velocity_image = $4,
        clash_power = $5, clash_defense = $6, ap_cost = $7, max_energy_pips = $8, loyalty_tier = $9,
        velocity_ability = $10, protoform_utility = $11, breaks_walls = $12, causes_knockback = $13
       WHERE id = $14
       RETURNING *`,
      [
        name.trim(),
        type,
        protoformImage ?? null,
        velocityImage ?? null,
        clashPower,
        clashDefense,
        apCost,
        maxEnergyPips,
        loyaltyTier,
        velocityAbility ?? null,
        protoformUtility ?? null,
        Boolean(breaksWalls),
        Boolean(causesKnockback),
        id,
      ]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ template: toClientTemplate(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update slug template." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query("DELETE FROM slug_templates WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete slug template." });
  }
});

export default router;
