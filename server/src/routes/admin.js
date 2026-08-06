import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyUser, disconnectUser } from "../ws.js";

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

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Dungeon Master access required." });
  }
  next();
}

router.use(requireAuth, requireDungeonMaster);

router.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, role, status, must_change_password, created_at
       FROM users ORDER BY created_at ASC`
    );
    res.json({
      users: rows.map((row) => ({
        id: row.id,
        username: row.username,
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

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete user." });
  }
});

export default router;
