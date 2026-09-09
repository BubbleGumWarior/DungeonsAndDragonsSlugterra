// ONE-OFF DEV SCRIPT -- adds a `rarity` key (1..10, from the CSV's "Rarity"
// column) to every entry in server/src/data/defaultSlugTemplates.json, matched
// by name. Run once and commit the updated JSON; the running app never calls
// this. Safe to delete afterwards.
//
// Usage (from the server/ directory):
//   node scripts/backfill-slug-rarity.js

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CSV_PATH = path.join(REPO_ROOT, "docs", "Slugs - OG Slugs.csv");
const JSON_PATH = path.join(__dirname, "..", "src", "data", "defaultSlugTemplates.json");

// Minimal CSV parser -- handles quoted fields with embedded commas/newlines
// and doubled-quote escaping (copied from generate-default-slug-templates.js).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function clampRarity(n) {
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, Math.round(n)));
}

const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
const header = rows[0];
const nameIdx = header.indexOf("Name");
const rarityIdx = header.indexOf("Rarity");
if (nameIdx === -1 || rarityIdx === -1) throw new Error('CSV needs "Name" and "Rarity" columns.');

const rarityByName = new Map();
for (const r of rows.slice(1)) {
  const name = (r[nameIdx] || "").trim();
  if (!name) continue;
  rarityByName.set(name, clampRarity(Number(r[rarityIdx])));
}

if (!existsSync(JSON_PATH)) throw new Error(`Missing ${JSON_PATH}`);
const templates = JSON.parse(readFileSync(JSON_PATH, "utf8"));

let matched = 0;
const unmatched = [];
for (const t of templates) {
  if (rarityByName.has(t.name)) {
    t.rarity = rarityByName.get(t.name);
    matched++;
  } else {
    unmatched.push(t.name);
  }
}

writeFileSync(JSON_PATH, JSON.stringify(templates, null, 2) + "\n");
console.log(`Set rarity on ${matched}/${templates.length} default slug templates.`);
if (unmatched.length) console.log(`No CSV rarity for: ${unmatched.join(", ")}`);
