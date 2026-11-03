import { Router, raw } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastAll } from "../ws.js";
import { AUDIO_TYPES, resolveLibraryFile, syncDefaultSounds } from "../defaultSounds.js";

const router = Router();

// The DM's sound library. Audio files sit on disk (not in Postgres) so the
// browser can stream them with Range requests -- a 10-minute ambience bed
// needs to seek and start before it has fully downloaded.
const SOUND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads/sounds");
fs.mkdirSync(SOUND_DIR, { recursive: true });

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_NAME_LENGTH = 60;
const MAX_BANK_LENGTH = 24;

const FILE_ID_PATTERN = /^[a-f0-9-]{36}\.[a-z0-9]{2,5}$/;

// ---------------------------------------------------------------- file serving
// Deliberately outside requireAuth: an <audio> element can't send an
// Authorization header, and (like /api/img) the unguessable id in the URL is
// the capability. sendFile answers Range requests, which streaming needs.
router.get("/file/:fileId", async (req, res) => {
  const { fileId } = req.params;
  if (!FILE_ID_PATTERN.test(fileId)) return res.status(404).end();
  const ext = fileId.split(".").pop();
  if (!AUDIO_TYPES[ext]) return res.status(404).end();

  res.setHeader("Content-Type", AUDIO_TYPES[ext]);
  const uploaded = path.join(SOUND_DIR, fileId);
  if (fs.existsSync(uploaded)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(uploaded, { acceptRanges: true }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }

  // Not an upload: it may be a file from the drop-in default-sounds folder.
  // That file can be replaced in place, so it isn't cached as immutable.
  try {
    const { rows } = await pool.query("SELECT library_path FROM sounds WHERE file_id = $1 AND library_path IS NOT NULL", [fileId]);
    const absolute = rows[0] ? resolveLibraryFile(rows[0].library_path) : null;
    if (!absolute) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(absolute, { acceptRanges: true }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

router.use(requireAuth);

function requireDungeonMaster(req, res, next) {
  if (req.user.role !== "Dungeon Master") {
    return res.status(403).json({ error: "Only the Dungeon Master can do that." });
  }
  next();
}

function toSound(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    bank: row.bank,
    url: `/api/sounds/file/${row.file_id}`,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    library: row.library_path != null,
    durationMs: row.duration_ms,
    volume: row.volume,
    createdAt: row.created_at,
  };
}

function cleanName(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_NAME_LENGTH) : "";
}

function cleanBank(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_BANK_LENGTH) : "";
}

function cleanUnit(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

// ---------------------------------------------------------------- ambient state
// One shared "now playing" bed. The server never ticks: it stores when the
// loop's position 0 happened (started_at_ms, in server time) and everyone
// derives the current position from the clock, so a client that joins or
// reconnects mid-track lands on the same beat as everyone else.
async function loadAmbient() {
  const { rows } = await pool.query(
    `SELECT a.*, s.name, s.file_id, s.volume AS sound_volume, s.duration_ms
       FROM ambient_state a LEFT JOIN sounds s ON s.id = a.sound_id
      WHERE a.id = 1`
  );
  const row = rows[0];
  const hasSound = row.sound_id != null;
  return {
    version: row.version,
    soundId: row.sound_id,
    name: hasSound ? row.name : null,
    url: hasSound ? `/api/sounds/file/${row.file_id}` : null,
    durationMs: hasSound ? row.duration_ms : null,
    soundVolume: hasSound ? row.sound_volume : 1,
    volume: row.volume,
    playing: hasSound && row.playing,
    startedAtMs: Number(row.started_at_ms),
    pausedAtMs: Number(row.paused_at_ms),
    serverNow: Date.now(),
  };
}

// A single "something changed" ping, not the state itself: clients refetch,
// which also gives each one a fresh round trip to measure its clock offset
// against (and a burst of changes can't lose anything -- see AccessSocket).
function announceAmbientChange() {
  broadcastAll({ type: "ambient-changed" });
}

router.get("/ambient", async (req, res) => {
  try {
    res.json({ ambient: await loadAmbient() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the ambient track." });
  }
});

async function updateAmbient(res, sqlSet, values) {
  try {
    await pool.query(`UPDATE ambient_state SET ${sqlSet}, version = version + 1 WHERE id = 1`, values);
    announceAmbientChange();
    res.json({ ambient: await loadAmbient() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the ambient track." });
  }
}

router.post("/ambient/play", requireDungeonMaster, async (req, res) => {
  const soundId = Number(req.body?.soundId);
  if (!Number.isInteger(soundId)) return res.status(400).json({ error: "A soundId is required." });
  const { rows } = await pool.query("SELECT kind FROM sounds WHERE id = $1", [soundId]);
  if (!rows[0]) return res.status(404).json({ error: "Sound not found." });
  if (rows[0].kind !== "ambient") return res.status(400).json({ error: "Only ambience sounds can loop as ambience." });
  await updateAmbient(res, "sound_id = $1, playing = true, started_at_ms = $2, paused_at_ms = 0", [soundId, Date.now()]);
});

router.post("/ambient/pause", requireDungeonMaster, async (req, res) => {
  await updateAmbient(res, "paused_at_ms = CASE WHEN playing THEN $1 - started_at_ms ELSE paused_at_ms END, playing = false", [Date.now()]);
});

router.post("/ambient/resume", requireDungeonMaster, async (req, res) => {
  await updateAmbient(
    res,
    "started_at_ms = CASE WHEN NOT playing THEN $1 - paused_at_ms ELSE started_at_ms END, playing = (sound_id IS NOT NULL)",
    [Date.now()]
  );
});

router.post("/ambient/stop", requireDungeonMaster, async (req, res) => {
  await updateAmbient(res, "playing = false, paused_at_ms = 0", []);
});

router.post("/ambient/volume", requireDungeonMaster, async (req, res) => {
  await updateAmbient(res, "volume = $1", [cleanUnit(req.body?.volume, 0.8)]);
});

// ---------------------------------------------------------------- library
// Re-read server/default-sounds (also done at startup) so a file just dropped
// in -- say, a multi-hour ambience track -- shows up without a restart.
router.post("/rescan", requireDungeonMaster, async (req, res) => {
  try {
    const result = await syncDefaultSounds();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not read the default sounds folder." });
  }
});

router.get("/", requireDungeonMaster, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM sounds ORDER BY kind, lower(name), id");
    res.json({ sounds: rows.map(toSound) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the sound library." });
  }
});

// Raw audio bytes in the body, metadata in the query string -- no multipart
// parser needed, and the browser can send a File straight through fetch().
router.post(
  "/",
  requireDungeonMaster,
  raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    const kind = req.query.kind === "ambient" ? "ambient" : req.query.kind === "effect" ? "effect" : null;
    const ext = String(req.query.ext || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const name = cleanName(req.query.name);
    const body = req.body;

    if (!kind) return res.status(400).json({ error: "Choose whether this is ambience or an effect." });
    if (!AUDIO_TYPES[ext]) return res.status(400).json({ error: "Unsupported audio type. Use mp3, ogg, wav, m4a, webm or flac." });
    if (!name) return res.status(400).json({ error: "Give the sound a name." });
    if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: "The audio file was empty." });

    const fileId = `${crypto.randomUUID()}.${ext}`;
    const durationMs = Number(req.query.durationMs);
    try {
      await fs.promises.writeFile(path.join(SOUND_DIR, fileId), body);
      const { rows } = await pool.query(
        `INSERT INTO sounds (kind, name, bank, file_id, mime, size_bytes, duration_ms, volume)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          kind,
          name,
          cleanBank(req.query.bank),
          fileId,
          AUDIO_TYPES[ext],
          body.length,
          Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null,
          cleanUnit(req.query.volume, 1),
        ]
      );
      res.status(201).json({ sound: toSound(rows[0]) });
    } catch (err) {
      console.error(err);
      fs.promises.unlink(path.join(SOUND_DIR, fileId)).catch(() => {});
      res.status(500).json({ error: "Could not save that sound." });
    }
  }
);

router.patch("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid sound." });

  const updates = [];
  const values = [];
  const { name, bank, volume, durationMs } = req.body ?? {};
  if (name !== undefined) {
    const clean = cleanName(name);
    if (!clean) return res.status(400).json({ error: "Give the sound a name." });
    values.push(clean);
    updates.push(`name = $${values.length}`);
  }
  if (bank !== undefined) {
    values.push(cleanBank(bank));
    updates.push(`bank = $${values.length}`);
  }
  if (volume !== undefined) {
    values.push(cleanUnit(volume, 1));
    updates.push(`volume = $${values.length}`);
  }
  // Drop-in files have no duration until a browser has read it; the desk
  // measures one and reports it here so the progress bar can show.
  if (durationMs !== undefined) {
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms <= 0) return res.status(400).json({ error: "Invalid duration." });
    values.push(Math.round(ms));
    updates.push(`duration_ms = $${values.length}`);
  }
  if (updates.length === 0) return res.status(400).json({ error: "Nothing to update." });

  try {
    values.push(id);
    const { rows } = await pool.query(`UPDATE sounds SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`, values);
    if (!rows[0]) return res.status(404).json({ error: "Sound not found." });
    // Renaming or re-leveling the bed that's playing: listeners pick it up.
    if ((await pool.query("SELECT 1 FROM ambient_state WHERE sound_id = $1", [id])).rowCount) announceAmbientChange();
    res.json({ sound: toSound(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update that sound." });
  }
});

router.delete("/:id", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid sound." });
  try {
    const { rows: library } = await pool.query("SELECT library_path FROM sounds WHERE id = $1", [id]);
    if (library[0]?.library_path) {
      return res.status(400).json({ error: "This sound comes from the default-sounds folder. Remove the file there, then rescan." });
    }
    const { rows } = await pool.query("DELETE FROM sounds WHERE id = $1 RETURNING file_id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Sound not found." });
    fs.promises.unlink(path.join(SOUND_DIR, rows[0].file_id)).catch(() => {});

    // If that was the loaded bed, ON DELETE SET NULL already unloaded it; make
    // the shared state say "stopped" and tell listeners.
    const cleared = await pool.query(
      "UPDATE ambient_state SET playing = false, paused_at_ms = 0, version = version + 1 WHERE id = 1 AND sound_id IS NULL AND (playing OR paused_at_ms <> 0) RETURNING 1"
    );
    if (cleared.rowCount) announceAmbientChange();
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not delete that sound." });
  }
});

// ---------------------------------------------------------------- soundboard
// Effects are fire-and-forget: the DM's press is broadcast once and every
// client plays it from its own cached copy. Each carries a fresh playId so a
// client can tell a rapid second press from a re-delivery.
router.post("/stop-effects", requireDungeonMaster, (req, res) => {
  broadcastAll({ type: "sound-stop" });
  res.status(204).end();
});

router.post("/:id/play", requireDungeonMaster, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid sound." });
  try {
    const { rows } = await pool.query("SELECT * FROM sounds WHERE id = $1", [id]);
    const sound = rows[0];
    if (!sound) return res.status(404).json({ error: "Sound not found." });
    if (sound.kind !== "effect") return res.status(400).json({ error: "Ambience plays from the ambience deck." });
    broadcastAll({
      type: "sound-play",
      playId: crypto.randomUUID(),
      soundId: sound.id,
      name: sound.name,
      url: `/api/sounds/file/${sound.file_id}`,
      volume: sound.volume,
    });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not play that sound." });
  }
});

export default router;
