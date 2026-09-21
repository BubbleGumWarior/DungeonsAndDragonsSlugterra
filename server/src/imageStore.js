// Keeps large embedded images out of JSON.
//
// Slugs, templates, blasters, combatants, encounter maps and so on store their
// art as base64 data URIs (100-500 KB each), and every list response and live
// broadcast used to carry all of it -- the DM's Slugs tab alone downloaded
// ~80 MB. Instead, on the way OUT any big data-URI image in a payload is
// replaced with a short content-addressed URL (/api/img/<md5>) that the
// browser fetches once and caches forever; on the way IN, those URLs are
// swapped back to the real data URI, so route code and the database never see
// the difference (a form that re-submits an untouched image just sends its URL
// back). Identical images -- a slug cloned from a template, say -- share one
// URL, so the browser downloads them once.
//
// Nothing here changes what is stored, only what crosses the wire. See
// routes/images.js for the endpoint and index.js / ws.js for where it's wired.

import crypto from "crypto";
import { pool } from "./db.js";

// Small icons aren't worth a round trip; only genuinely big images are swapped.
const MIN_IMAGE_LENGTH = 2000;
const DATA_IMAGE = /^data:(image\/[a-z0-9.+-]+);base64,/i;
const IMAGE_URL = /^\/api\/img\/([a-f0-9]{32})$/;
const MAX_REGISTRY_CHARS = 300 * 1024 * 1024; // in-memory cap; older entries are dropped first (and re-found in the DB on demand)

const registry = new Map(); // md5 -> data URI, oldest first
let registryChars = 0;

function remember(hash, dataUri) {
  if (registry.has(hash)) return;
  registry.set(hash, dataUri);
  registryChars += dataUri.length;
  for (const [oldHash, oldUri] of registry) {
    if (registryChars <= MAX_REGISTRY_CHARS) break;
    registry.delete(oldHash);
    registryChars -= oldUri.length;
  }
}

function isBigImage(value) {
  return typeof value === "string" && value.length >= MIN_IMAGE_LENGTH && DATA_IMAGE.test(value);
}

function hashOf(dataUri) {
  return crypto.createHash("md5").update(dataUri).digest("hex"); // same as Postgres md5(text)
}

// Where a data URI might live, for finding an image the registry doesn't
// have (after a server restart, say). Each is tried with md5(column) = hash.
const IMAGE_COLUMNS = [
  ["slugs", "velocity_image"],
  ["slugs", "protoform_image"],
  ["slug_templates", "velocity_image"],
  ["slug_templates", "protoform_image"],
  ["slugpedia_entries", "velocity_image"],
  ["slugpedia_entries", "protoform_image"],
  ["encounters", "map_image"],
  ["combatants", "portrait"],
  ["characters", "portrait"],
  ["blasters", "image"],
  ["blaster_templates", "image"],
  ["mechas", "image"],
  ["mecha_templates", "image"],
  ["npc_templates", "image"],
  ["grunt_templates", "image"],
  ["ships", "image"],
];

// The data URI for a /api/img hash: from memory, else scanned out of the
// database (then remembered). null if nothing matches.
export async function findImageByHash(hash) {
  const cached = registry.get(hash);
  if (cached) return cached;
  for (const [table, column] of IMAGE_COLUMNS) {
    try {
      const { rows } = await pool.query(`SELECT ${column} AS image FROM ${table} WHERE md5(${column}) = $1 LIMIT 1`, [hash]);
      if (rows[0]?.image) {
        remember(hash, rows[0].image);
        return rows[0].image;
      }
    } catch {
      // a table/column this install doesn't have -- keep looking
    }
  }
  return null;
}

// Outgoing: a copy of `value` with every big data-URI image replaced by its
// URL. Never mutates its input (payloads share objects with live state) --
// unchanged branches are returned as the very same reference.
export function imagifyPayload(value) {
  if (typeof value === "string") {
    if (!isBigImage(value)) return value;
    const hash = hashOf(value);
    remember(hash, value);
    return `/api/img/${hash}`;
  }
  if (Array.isArray(value)) {
    let out = null;
    for (let i = 0; i < value.length; i++) {
      const next = imagifyPayload(value[i]);
      if (next !== value[i]) {
        out ??= value.slice();
        out[i] = next;
      }
    }
    return out ?? value;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    let out = null;
    for (const key of Object.keys(value)) {
      const next = imagifyPayload(value[key]);
      if (next !== value[key]) {
        out ??= { ...value };
        out[key] = next;
      }
    }
    return out ?? value;
  }
  return value; // Dates, Buffers, null, numbers...
}

// Incoming: the reverse -- swaps any /api/img/<hash> URL in a request body
// back to the real data URI (mutating the freshly parsed body is fine).
export async function resolveIncomingImages(value) {
  if (typeof value === "string") {
    const match = IMAGE_URL.exec(value);
    return match ? ((await findImageByHash(match[1])) ?? value) : value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = await resolveIncomingImages(value[i]);
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = await resolveIncomingImages(value[key]);
  }
  return value;
}

// For the /api/img endpoint: { mime, body } decoded from a data URI.
export function decodeDataUri(dataUri) {
  const match = DATA_IMAGE.exec(dataUri);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), body: Buffer.from(dataUri.slice(match[0].length), "base64") };
}

// Express middleware for everything under /api (except /api/img itself):
// wraps res.json so responses go out imagified, and resolves image URLs in the
// request body back to data URIs before any route sees it.
export async function imageMiddleware(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => json(imagifyPayload(body));
  try {
    if (req.body && typeof req.body === "object") await resolveIncomingImages(req.body);
    next();
  } catch (err) {
    next(err);
  }
}
