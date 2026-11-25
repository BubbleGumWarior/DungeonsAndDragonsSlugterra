import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { requireAuth, setCachedRole, forgetCachedRole } from "../middleware/auth.js";
import { requireDmReadOrEdit, isValidRole, VALID_ROLES, ROLE_ASSISTANT, ROLE_PLAYER } from "../roles.js";
import { notifyUser, disconnectUser } from "../ws.js";
import { broadcastEncounter } from "./combat.js";

const router = Router();
const SALT_ROUNDS = 12;
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  }
  return out;
}

router.use(requireAuth, requireDmReadOrEdit);

router.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.role, u.status, u.must_change_password, u.created_at, c.name AS character_name
       FROM users u LEFT JOIN characters c ON c.user_id = u.id
       ORDER BY u.created_at ASC`
    );
    res.json({
      users: rows.map((row) => ({
        id: row.id,
        username: row.username,
        characterName: row.character_name || null,
        role: row.role,
        status: row.status,
        mustChangePassword: row.must_change_password,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load users." });
  }
});

router.post("/users/:id/approve", async (req, res) => {
  await setStatus(req, res, "approved");
});

router.post("/users/:id/revoke", async (req, res) => {
  await setStatus(req, res, "revoked");
});

async function setStatus(req, res, status) {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET status = $1
       WHERE id = $2 AND role != 'Dungeon Master'
       RETURNING id, username, role, status, must_change_password, created_at`,
      [status, id]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "User not found." });
    }

    notifyUser(row.id, {
      type: status === "approved" ? "access-approved" : "access-revoked",
    });

    res.json({
      user: {
        id: row.id,
        username: row.username,
        role: row.role,
        status: row.status,
        mustChangePassword: row.must_change_password,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update user." });
  }
}

// Switches a user between Player, Dungeon Master and DM Assistant. The role
// also sits inside the user's login token, but requireAuth re-reads it from
// the database on every request (cache updated right here), so the change
// takes effect at once; the "role-changed" ping makes their client fetch
// /api/me, which hands back a fresh token with the new role in it.
router.post("/users/:id/role", async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body || {};
  if (!isValidRole(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(", ")}.` });
  }
  if (id === req.user.sub) {
    return res.status(400).json({ error: "You can't change your own role." });
  }

  const client = await pool.connect();
  let releasedEncounterIds = [];
  try {
    await client.query("BEGIN");
    const { rows: current } = await client.query("SELECT id, role FROM users WHERE id = $1 FOR UPDATE", [id]);
    if (!current[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    const previousRole = current[0].role;

    // The DM chose this role for them, so a pending account doesn't also
    // need approving. A Player keeps whatever access status they had.
    const { rows } = await client.query(
      `UPDATE users SET role = $1, status = CASE WHEN $1 = $3 THEN status ELSE 'approved' END
       WHERE id = $2
       RETURNING id, username, role, status, must_change_password, created_at`,
      [role, id, ROLE_PLAYER]
    );

    // No longer an assistant: hand any NPCs they were running back to the DM.
    if (previousRole === ROLE_ASSISTANT && role !== ROLE_ASSISTANT) {
      const { rows: released } = await client.query(
        "UPDATE combatants SET controller_user_id = NULL WHERE controller_user_id = $1 RETURNING encounter_id",
        [id]
      );
      releasedEncounterIds = [...new Set(released.map((r) => r.encounter_id))];
    }
    await client.query("COMMIT");

    const row = rows[0];
    setCachedRole(row.id, row.role);
    notifyUser(row.id, { type: "role-changed", role: row.role, at: Date.now() });
    for (const encounterId of releasedEncounterIds) await broadcastEncounter(encounterId);

    const { rows: chars } = await pool.query("SELECT name FROM characters WHERE user_id = $1", [row.id]);
    res.json({
      user: {
        id: row.id,
        username: row.username,
        characterName: chars[0]?.name || null,
        role: row.role,
        status: row.status,
        mustChangePassword: row.must_change_password,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    forgetCachedRole(id);
    console.error(err);
    res.status(500).json({ error: "Could not change the role." });
  } finally {
    client.release();
  }
});

router.post("/users/:id/reset-password", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = true
       WHERE id = $2 AND role != 'Dungeon Master'
       RETURNING id, username`,
      [passwordHash, id]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ username: row.username, tempPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reset password." });
  }
});

router.delete("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows } = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role != 'Dungeon Master' RETURNING id`,
      [id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "User not found." });
    }

    notifyUser(id, { type: "account-deleted" });
    disconnectUser(id);
    forgetCachedRole(id);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete user." });
  }
});

export default router;
