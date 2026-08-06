import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const SALT_ROUNDS = 12;

router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required." });
  }
  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
    return res.status(400).json({ error: "Username must be 3-32 characters." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: countRows } = await client.query("SELECT COUNT(*)::int AS count FROM users");
    const role = countRows[0].count === 0 ? "Dungeon Master" : "Player";
    const status = role === "Dungeon Master" ? "approved" : "pending";

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, role, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, status, must_change_password`,
      [trimmedUsername, passwordHash, role, status]
    );

    await client.query("COMMIT");

    const row = rows[0];
    const token = jwt.sign(
      { sub: row.id, username: row.username, role: row.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.status(201).json({
      token,
      user: {
        id: row.id,
        username: row.username,
        role: row.role,
        status: row.status,
        mustChangePassword: row.must_change_password,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username is already taken." });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed." });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, username, password_hash, role, status, must_change_password FROM users WHERE username = $1",
      [username.trim()]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        mustChangePassword: user.must_change_password,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed." });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return res.status(400).json({ error: "Current and new password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = $1",
      [req.user.sub]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      "UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2",
      [passwordHash, user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not change password." });
  }
});

export default router;
