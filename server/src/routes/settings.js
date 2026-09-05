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

// Personal display/audio preferences -- every signed-in user tunes their
// own, no DM gate. See index.css's [data-theme] blocks for what each theme
// id maps to and CombatMap.jsx for where sound_volume gets applied.
const THEMES = ["burgundy", "navy", "green", "purple", "orange", "pink", "teal", "indigo"];
const VOICE_INPUT_MODES = ["live", "push_to_talk"];
// Keys allowed in the combat_sfx_volumes map -- mirrors CombatMap.jsx's
// COMBAT_SFX / Settings.jsx's COMBAT_SFX list.
const COMBAT_SFX_KEYS = ["fail", "miss", "hit", "break", "hazard", "geyser", "zeus"];

router.post("/preferences", async (req, res) => {
  const { theme, soundVolume, voiceInputMode, voiceCueVolume, masterVolume, combatSfxVolumes } = req.body ?? {};
  const updates = [];
  const values = [];

  if (theme !== undefined) {
    if (!THEMES.includes(theme)) {
      return res.status(400).json({ error: "Unknown theme." });
    }
    values.push(theme);
    updates.push(`theme = $${values.length}`);
  }

  if (soundVolume !== undefined) {
    const volume = Number(soundVolume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      return res.status(400).json({ error: "Sound volume must be between 0 and 1." });
    }
    values.push(volume);
    updates.push(`sound_volume = $${values.length}`);
  }

  if (voiceInputMode !== undefined) {
    if (!VOICE_INPUT_MODES.includes(voiceInputMode)) {
      return res.status(400).json({ error: "Unknown voice input mode." });
    }
    values.push(voiceInputMode);
    updates.push(`voice_input_mode = $${values.length}`);
  }

  if (voiceCueVolume !== undefined) {
    const volume = Number(voiceCueVolume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      return res.status(400).json({ error: "Voice cue volume must be between 0 and 1." });
    }
    values.push(volume);
    updates.push(`voice_cue_volume = $${values.length}`);
  }

  if (masterVolume !== undefined) {
    const volume = Number(masterVolume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      return res.status(400).json({ error: "Master volume must be between 0 and 1." });
    }
    values.push(volume);
    updates.push(`master_volume = $${values.length}`);
  }

  if (combatSfxVolumes !== undefined) {
    if (typeof combatSfxVolumes !== "object" || combatSfxVolumes === null || Array.isArray(combatSfxVolumes)) {
      return res.status(400).json({ error: "combatSfxVolumes must be an object." });
    }
    const clean = {};
    for (const [key, raw] of Object.entries(combatSfxVolumes)) {
      if (!COMBAT_SFX_KEYS.includes(key)) {
        return res.status(400).json({ error: `Unknown combat sound "${key}".` });
      }
      const volume = Number(raw);
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
        return res.status(400).json({ error: "Each combat sound volume must be between 0 and 1." });
      }
      clean[key] = volume;
    }
    if (Object.keys(clean).length > 0) {
      // Merge the sent keys into whatever's already stored (jsonb ||, right
      // side wins) so a single-slider save never wipes the others -- same
      // reason /voice-peer-volume uses a targeted write.
      values.push(JSON.stringify(clean));
      updates.push(`combat_sfx_volumes = combat_sfx_volumes || $${values.length}::jsonb`);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }

  values.push(req.user.sub);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING theme, sound_volume, voice_input_mode, voice_cue_volume, master_volume, combat_sfx_volumes`,
      values
    );
    const row = rows[0];
    res.json({
      theme: row.theme,
      soundVolume: row.sound_volume,
      voiceInputMode: row.voice_input_mode,
      voiceCueVolume: row.voice_cue_volume,
      masterVolume: row.master_volume,
      combatSfxVolumes: row.combat_sfx_volumes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update preferences." });
  }
});

// Per-peer voice mixer volume -- a targeted jsonb_set rather than round-
// tripping the whole voice_peer_volumes map, so two different sliders being
// dragged around the same time can't clobber each other's write.
router.post("/voice-peer-volume", async (req, res) => {
  const { peerUserId, volume } = req.body ?? {};
  const peerId = Number(peerUserId);
  const vol = Number(volume);

  if (!Number.isInteger(peerId) || peerId <= 0) {
    return res.status(400).json({ error: "A valid peerUserId is required." });
  }
  if (!Number.isFinite(vol) || vol < 0 || vol > 1) {
    return res.status(400).json({ error: "Volume must be between 0 and 1." });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET voice_peer_volumes = jsonb_set(voice_peer_volumes, ARRAY[$1::text], to_jsonb($2::float8), true)
       WHERE id = $3
       RETURNING voice_peer_volumes`,
      [String(peerId), vol, req.user.sub]
    );
    const row = rows[0];
    res.json({ voicePeerVolumes: row.voice_peer_volumes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update voice volume." });
  }
});

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT slugterra_revealed, slug_hunt_area FROM campaign_settings WHERE id = 1");
    res.json({
      slugterraRevealed: rows[0]?.slugterra_revealed ?? false,
      slugHuntArea: rows[0]?.slug_hunt_area ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load settings." });
  }
});

// The DM points the party at one of the eight layers (0-7) -- drives the
// dashboard Slug Hunt panel for everyone (see client SlugHuntPanel.jsx).
router.post("/slug-hunt-area", requireDungeonMaster, async (req, res) => {
  const area = Number(req.body?.area);
  if (!Number.isInteger(area) || area < 0 || area > 7) {
    return res.status(400).json({ error: "Area must be a whole number between 0 and 7." });
  }
  try {
    await pool.query("UPDATE campaign_settings SET slug_hunt_area = $1 WHERE id = 1", [area]);
    broadcastAll({ type: "slug-hunt-area", area });
    res.json({ slugHuntArea: area });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the party's location." });
  }
});

router.post("/slugterra", requireDungeonMaster, async (req, res) => {
  const revealed = Boolean(req.body?.revealed);
  try {
    await pool.query("UPDATE campaign_settings SET slugterra_revealed = $1 WHERE id = 1", [revealed]);
    broadcastAll({ type: "slugterra-revealed", revealed });
    res.json({ slugterraRevealed: revealed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update settings." });
  }
});

export default router;
