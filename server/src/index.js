import http from "http";
import express from "express";
import cors from "cors";
import "dotenv/config";
import { initSchema, pool } from "./db.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import charactersRouter from "./routes/characters.js";
import settingsRouter from "./routes/settings.js";
import slugTemplatesRouter from "./routes/slugTemplates.js";
import slugsRouter from "./routes/slugs.js";
import blasterTemplatesRouter from "./routes/blasterTemplates.js";
import blastersRouter from "./routes/blasters.js";
import modTemplatesRouter from "./routes/modTemplates.js";
import modsRouter from "./routes/mods.js";
import mechaTemplatesRouter from "./routes/mechaTemplates.js";
import mechasRouter from "./routes/mechas.js";
import mechaModTemplatesRouter from "./routes/mechaModTemplates.js";
import mechaModsRouter from "./routes/mechaMods.js";
import chatRouter from "./routes/chat.js";
import challengeRouter from "./routes/challenge.js";
import diceRollRouter from "./routes/diceRoll.js";
import combatRouter from "./routes/combat.js";
import npcTemplatesRouter from "./routes/npcTemplates.js";
import { requireAuth } from "./middleware/auth.js";
import { setupWebSocket, getOnlineUserIds } from "./ws.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/slug-templates", slugTemplatesRouter);
app.use("/api/slugs", slugsRouter);
app.use("/api/blaster-templates", blasterTemplatesRouter);
app.use("/api/blasters", blastersRouter);
app.use("/api/mod-templates", modTemplatesRouter);
app.use("/api/mods", modsRouter);
app.use("/api/mecha-templates", mechaTemplatesRouter);
app.use("/api/mechas", mechasRouter);
app.use("/api/mecha-mod-templates", mechaModTemplatesRouter);
app.use("/api/mecha-mods", mechaModsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/challenge", challengeRouter);
app.use("/api/dice-roll", diceRollRouter);
app.use("/api/combat", combatRouter);
app.use("/api/npc-templates", npcTemplatesRouter);

app.get("/api/presence/online", requireAuth, (req, res) => {
  res.json({ onlineUserIds: getOnlineUserIds() });
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, username, role, status, must_change_password FROM users WHERE id = $1",
      [req.user.sub]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({
      user: {
        id: row.id,
        username: row.username,
        role: row.role,
        status: row.status,
        mustChangePassword: row.must_change_password,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load user." });
  }
});

const port = process.env.PORT || 4000;
const server = http.createServer(app);
setupWebSocket(server);

initSchema()
  .then(() => {
    server.listen(port, () => console.log(`Server listening on port ${port}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
