import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { broadcastAll } from "./ws.js";

// The Sound Desk's drop-in library (see routes/sounds.js for the rest of the
// sound desk). Files placed in server/default-sounds are listed on the desk
// without being uploaded: the browser upload path is capped at 30 MB, and a
// multi-hour ambience bed is far bigger than that. The file name, minus its
// extension, becomes the sound's name.
//
//   default-sounds/ambient/   looping ambience beds
//   default-sounds/effects/   one-shot soundboard effects
//
// They're re-read when the server starts and whenever the DM presses "Rescan
// folder". A file that has been removed from the folder drops out of the desk;
// one that is renamed or edited on the desk keeps its edits. The files
// themselves are never modified or deleted by the app.

export const DEFAULT_SOUND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../default-sounds");

// The extension picks the mime, never the file's own claims -- and only these
// audio types are ever listed or served.
export const AUDIO_TYPES = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

const FOLDERS = [
  { folder: "ambient", kind: "ambient" },
  { folder: "effects", kind: "effect" },
];
const MAX_NAME_LENGTH = 60;

const README = `Drop-in sounds for the Sound Desk
==================================

Put audio files here and they appear on the DM's Sound Desk (/sound-desk)
without being uploaded -- handy for very large files such as a multi-hour
ambience track. The file name, without its extension, becomes the sound's name.

  ambient/   looping ambience beds (everyone hears them in sync)
  effects/   one-shot soundboard effects

Supported: mp3, ogg, wav, m4a, webm, flac (also aac, opus).

The folder is read when the server starts and when you press "Rescan folder"
on the Sound Desk. Removing a file from here removes it from the desk. The app
never changes or deletes the files in this folder. They are not committed to
git.
`;

export function ensureDefaultSoundFolders() {
  for (const { folder } of FOLDERS) fs.mkdirSync(path.join(DEFAULT_SOUND_DIR, folder), { recursive: true });
  const readme = path.join(DEFAULT_SOUND_DIR, "README.txt");
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, README);
}

function extensionOf(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

async function listFiles() {
  const found = [];
  for (const { folder, kind } of FOLDERS) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(path.join(DEFAULT_SOUND_DIR, folder), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const ext = extensionOf(entry.name);
      // Dotfiles and half-copied downloads (.crdownload, .part) have no audio extension.
      if (!entry.isFile() || entry.name.startsWith(".") || !AUDIO_TYPES[ext]) continue;
      const stat = await fs.promises.stat(path.join(DEFAULT_SOUND_DIR, folder, entry.name));
      found.push({
        libraryPath: `${folder}/${entry.name}`,
        kind,
        ext,
        name: path.basename(entry.name, path.extname(entry.name)).trim().slice(0, MAX_NAME_LENGTH) || entry.name.slice(0, MAX_NAME_LENGTH),
        size: stat.size,
      });
    }
  }
  return found;
}

// Reads the folder and brings the `sounds` table in line with it.
export async function syncDefaultSounds() {
  ensureDefaultSoundFolders();
  const found = await listFiles();
  const foundPaths = new Set(found.map((f) => f.libraryPath));

  const { rows: existing } = await pool.query("SELECT id, library_path FROM sounds WHERE library_path IS NOT NULL");
  const known = new Set(existing.map((row) => row.library_path));

  let added = 0;
  for (const file of found) {
    if (known.has(file.libraryPath)) {
      await pool.query("UPDATE sounds SET size_bytes = $1 WHERE library_path = $2", [file.size, file.libraryPath]);
      continue;
    }
    const { rowCount } = await pool.query(
      `INSERT INTO sounds (kind, name, file_id, mime, size_bytes, library_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (library_path) DO NOTHING`,
      [file.kind, file.name, `${crypto.randomUUID()}.${file.ext}`, AUDIO_TYPES[file.ext], file.size, file.libraryPath]
    );
    added += rowCount;
  }

  const gone = existing.filter((row) => !foundPaths.has(row.library_path));
  let removed = 0;
  if (gone.length > 0) {
    // ON DELETE SET NULL unloads a removed bed from the ambience state; make
    // that state say "stopped" and tell listeners, as deleting an upload does.
    await pool.query("DELETE FROM sounds WHERE id = ANY($1::int[])", [gone.map((row) => row.id)]);
    removed = gone.length;
    const cleared = await pool.query(
      "UPDATE ambient_state SET playing = false, paused_at_ms = 0, version = version + 1 WHERE id = 1 AND sound_id IS NULL AND (playing OR paused_at_ms <> 0) RETURNING 1"
    );
    if (cleared.rowCount) broadcastAll({ type: "ambient-changed" });
  }

  return { added, removed };
}

// The absolute path of a library file, or null. The stored path is only ever
// trusted after checking it still resolves inside the folder.
export function resolveLibraryFile(libraryPath) {
  const absolute = path.resolve(DEFAULT_SOUND_DIR, libraryPath);
  const root = DEFAULT_SOUND_DIR + path.sep;
  return absolute.startsWith(root) && fs.existsSync(absolute) ? absolute : null;
}
