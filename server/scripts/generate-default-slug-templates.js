// TEMPORARY SCRIPT -- run once to turn docs/Slugs - OG Slugs.csv +
// docs/Images/*.png into server/src/data/defaultSlugTemplates.json, which
// seedDefaultSlugs.js then loads on every server startup to populate the
// slug_templates table with the default OG roster (see there for the
// startup side). Not part of the running app itself -- safe to delete this
// file (and `npm uninstall sharp`) once you're happy with the generated
// JSON.
//
// Usage (from the server/ directory):
//   npm install sharp
//   node scripts/generate-default-slug-templates.js
//   npm uninstall sharp   (optional -- only this script needs it)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CSV_PATH = path.join(REPO_ROOT, "docs", "Slugs - OG Slugs.csv");
const IMAGES_DIR = path.join(REPO_ROOT, "docs", "Images");
const OUT_PATH = path.join(__dirname, "..", "src", "data", "defaultSlugTemplates.json");

// The image filenames don't all match the CSV's Name column exactly -- a
// couple are outright typo'd. Anything not listed here is looked up as the
// CSV name with spaces stripped (e.g. "Hop Rock" -> "HopRock_Proto.png",
// which is how most of them are actually named).
const NAME_TO_FILE_BASE = {
  Frightgeist: "Freightgeist",
  Hypnogrif: "Hypnogriff",
};

const MAX_DIMENSION = 800; // px, long edge -- these render small (token icons, gallery thumbs), no need for more
const JPEG_QUALITY = 82;

// Minimal CSV parser -- handles quoted fields with embedded commas/newlines
// and doubled-quote escaping, which is all this file actually uses.
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

function toBool(v) {
  return String(v).trim().toUpperCase() === "TRUE";
}

function fileNameFor(fileBase, suffix) {
  const name = `${fileBase}_${suffix}.png`;
  return name;
}

async function imageToDataUrl(filePath) {
  if (!existsSync(filePath)) return null;
  const resized = await sharp(filePath)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

async function main() {
  const csvText = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csvText);
  const header = rows[0];
  const col = (name) => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`CSV is missing a "${name}" column.`);
    return idx;
  };
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));

  const templates = [];
  const missing = [];

  for (const r of dataRows) {
    const name = r[col("Name")].trim();
    const fileBase = NAME_TO_FILE_BASE[name] || name.replace(/\s+/g, "");

    const protoPath = path.join(IMAGES_DIR, fileNameFor(fileBase, "Proto"));
    const velocityPath = path.join(IMAGES_DIR, fileNameFor(fileBase, "Velocity"));

    const protoformImage = await imageToDataUrl(protoPath);
    const velocityImage = await imageToDataUrl(velocityPath);
    if (!protoformImage || !velocityImage) missing.push(name);

    templates.push({
      name,
      type: r[col("Type")].trim(),
      protoformUtility: r[col("Protoform Utility")].trim(),
      velocityAbility: r[col("Velocity Ability")].trim(),
      clashPower: Number(r[col("Clash Power")]),
      clashDefense: Number(r[col("Clash Defense")]),
      apCost: Number(r[col("AP Cost")]),
      maxEnergyPips: Number(r[col("Max Energy Pips")]),
      loyaltyTier: 0,
      breaksWalls: toBool(r[col("Wall Breaker")]),
      causesKnockback: toBool(r[col("Knockback")]),
      wallMaker: toBool(r[col("Wall Maker")]),
      bridgeMaker: toBool(r[col("Bridge Maker")]),
      aoeBlast: toBool(r[col("AOE Blast")]),
      hazardMaker: toBool(r[col("Hazard Maker")]),
      causesBlind: toBool(r[col("Causes Blind")]),
      causesSnare: toBool(r[col("Causes Snare")]),
      causesShock: toBool(r[col("Causes Shock")]),
      causesJam: toBool(r[col("Causes Jam")]),
      piercesWalls: toBool(r[col("Pierces Walls")]),
      causesChain: toBool(r[col("Causes Chain")]),
      ricochets: toBool(r[col("Ricochets")]),
      ultraFast: toBool(r[col("Ultra Fast")]),
      causesInvisible: toBool(r[col("Causes Invisible")]),
      causesFear: toBool(r[col("Causes Fear")]),
      causesConfusion: toBool(r[col("Causes Confusion")]),
      trailWall: toBool(r[col("Trail Wall")]),
      clashTripled: toBool(r[col("Clash Tripled")]),
      protoformImage,
      velocityImage,
    });

    console.log(`${protoformImage && velocityImage ? "  ok  " : "MISSING"}  ${name}`);
  }

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(templates, null, 2));

  console.log(`\nWrote ${templates.length} templates to ${path.relative(REPO_ROOT, OUT_PATH)}`);
  if (missing.length > 0) {
    console.log(
      `\nNo image found for: ${missing.join(", ")} -- these were saved with a blank protoform/velocity ` +
        `image. Add "<Name>_Proto.png" / "<Name>_Velocity.png" to docs/Images and re-run this script to fill them in.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
