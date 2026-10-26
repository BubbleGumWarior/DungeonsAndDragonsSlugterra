import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import habitat_model as hm  # noqa: E402

# Paths are relative to the repo root (the parent of this scripts/ folder) so the
# script is portable -- run it from anywhere after editing the CSV.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "Slugs - OG Slugs.csv")
OUT = os.path.join(ROOT, "docs", "slug-hunt-odds.md")
OUT_HAB = os.path.join(ROOT, "docs", "slug-habitats.md")
OUT_JSON = os.path.join(ROOT, "client", "src", "slugHuntOdds.json")
OUT_JSON_SERVER = os.path.join(ROOT, "server", "src", "data", "slugHuntOdds.json")

# The Three Clusters (see docs/the-three-clusters-player-facing.md), flattened
# in cluster order -- Threxa Combine, then Verrin Concord, then Kaeth
# Dominion, then Unclaimed Space -- because the index (= campaign_settings
# .slug_hunt_area, and the flat PLANETS index on the Galaxy Map) has no other
# natural ordering once there are three separate star systems instead of one.
# This exact order must be mirrored by client/src/planetData.js's PLANETS
# array; a dev-only console.assert there fires if the two ever drift.
# (Each planet's environment lives in habitat_model.PLANET_ENV, keyed by name.)
AREAS = [
    # Threxa Combine -- the Thresh Expanse (dying red giant), inner -> outer
    "Cindrath",
    "Pyrsis Barrens",
    "Ashfall Rift",
    "Vorn's Forge",
    "The Wellspring",
    "Kessa-9",
    # Verrin Concord -- the Lattice (close binary star), inner -> outer
    "Virid Canopy",
    "Solenne",
    "Maren's Deep",
    "Aurelia Docks",
    "Kethrun Reach",
    # Kaeth Dominion -- the Ironvault (black hole accretion disc), inner -> outer
    "Marrek's Hold",
    "Drennow Yards",
    "Vhalden",
    "Ossuary Station",
    "Kaeloth Prime",
    # Unclaimed Space
    "The Threshold",
]

# Relative "how much of this planet's population is this rarity band" weight (1-10).
PEAK_BY_RARITY = {1: 72, 2: 66, 3: 56, 4: 46, 5: 36, 6: 27, 7: 19, 8: 13, 9: 8, 10: 5}

# Hard rules: element types that must be exactly 0% on a planet, whatever the
# tables above say. These guard the habitat model against a bad edit (a slug
# type slipping onto a world that can't support it) -- the script refuses to
# write anything if one fails.
MUST_BE_ZERO = {
    "Cindrath": {"Water", "Plant", "Ice", "Healing"},          # lava world
    "Pyrsis Barrens": {"Plant", "Ice", "Healing"},              # scalding geyser flats
    "Ashfall Rift": {"Plant", "Ice", "Healing"},                # volcanic mountains (steam vents allow a few hot-spring water slugs)
    "Vorn's Forge": {"Plant", "Ice", "Healing"},                # industrial
    "Kessa-9": {"Ice", "Fire"},                                 # open grassland (a little exposed ore allows a few Metal slugs)
    "Virid Canopy": {"Ice"},                                    # jungle
    "Solenne": {"Ice", "Fire"},                                 # farmland
    "Maren's Deep": {"Earth", "Fire"},                          # no land at all
    "Marrek's Hold": {"Ice", "Fire"},                           # warm swamp
    "Drennow Yards": {"Plant", "Healing", "Water", "Ice"},                       # airless
    "Ossuary Station": {"Plant", "Healing", "Water", "Ice"},                       # airless
    "The Threshold": {"Plant", "Healing", "Water", "Ice"},                       # airless
    "Kaeloth Prime": {"Plant", "Healing"},                      # frozen
}


def fmt(p):
    if p <= 0:
        return "0%"
    if abs(p - round(p)) < 0.05:
        return f"{round(p)}%"
    return f"{p:.1f}%"


assert set(AREAS) == set(hm.PLANET_ENV), "AREAS and habitat_model.PLANET_ENV must list the same planets"

rows = []
with open(SRC, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rows.append((r["Name"].strip(), r["Type"].strip(), int(r["Rarity"].strip())))
rows.sort(key=lambda x: x[0].lower())

# Every override has to point at a real slug, and every element needs a default.
names = {n for n, _, _ in rows}
for table in (hm.ADJUST, hm.REPLACE):
    unknown = set(table) - names
    assert not unknown, f"habitat_model refers to slugs that are not in the CSV: {sorted(unknown)}"
for _, stype, _ in rows:
    assert stype in hm.TYPE_HABITAT, f"no habitat defaults for element type {stype!r}"
for name, stype, _ in rows:
    for niche in hm.slug_habitat(name, stype):
        assert niche in hm.NICHES, f"{name}: unknown niche {niche!r}"
for planet, env in hm.PLANET_ENV.items():
    for niche in env:
        assert niche in hm.NICHES, f"{planet}: unknown niche {niche!r}"

habitats = {name: hm.slug_habitat(name, stype) for name, stype, _ in rows}

# One normalized distribution per area (each column sums to 100%).
columns = {}
viable = {}
for ai, area in enumerate(AREAS):
    weights = []
    for name, _, rarity in rows:
        score = hm.habitat_score(habitats[name], area)
        weights.append(PEAK_BY_RARITY.get(rarity, 30) * score ** hm.SHARPEN)
    total = sum(weights)
    assert total > 0, f"{area}: no slug can live there"
    pcts = [round(w / total * 100, 1) for w in weights]
    for i, w in enumerate(weights):
        if w > 0 and pcts[i] == 0.0:
            pcts[i] = 0.1
    drift = round(100.0 - sum(pcts), 1)
    if drift:
        big = max(range(len(pcts)), key=lambda i: pcts[i])
        pcts[big] = round(pcts[big] + drift, 1)
    columns[ai] = pcts
    viable[area] = sum(1 for w in weights if w > 0)

# --- Sanity checks -----------------------------------------------------------
problems = []
for area, banned in MUST_BE_ZERO.items():
    ai = AREAS.index(area)
    for idx, (name, stype, _) in enumerate(rows):
        if stype in banned and columns[ai][idx] > 0:
            problems.append(f"{area}: {stype} slug {name} has {columns[ai][idx]}% but must be 0")
if problems:
    print("\n".join(problems))
    raise SystemExit("habitat sanity checks failed -- nothing written")

# --- docs/slug-hunt-odds.md ----------------------------------------------------
lines = []
lines.append("# Slug Hunt — Encounter Odds by Planet")
lines.append("")
lines.append(
    "Auto-generated by `scripts/gen_odds.py` from `Slugs - OG Slugs.csv` and the habitat model in "
    "`scripts/habitat_model.py`. **Each planet column is a probability distribution that sums to 100%** "
    "— i.e. \"if you hunt on this planet, here is the chance the slug you turn up is each one\"."
)
lines.append("")
lines.append(
    "**A slug can only appear on a planet that gives it somewhere to live.** Every planet is described "
    "as a set of habitats (lava fields, ocean, jungle, ruins, derelict hulls, …) and every slug as the "
    "habitats it can live in (see [slug-habitats.md](slug-habitats.md)). If a planet offers none of a "
    "slug's habitats — a Water slug on a lava world, a Plant slug in open space — its chance is exactly "
    "**0%**, not just \"unlikely\". Where it can live, the chance scales with how much of its habitat the "
    "planet has, and with its rarity. Airless worlds (Drennow Yards, Ossuary Station, The Threshold) only "
    "allow vacuum-hardy slugs outside the pressurised structures."
)
lines.append("")
lines.append("| Planet | Slugs that can live here | Slugs that can't |")
lines.append("| --- | ---: | ---: |")
for area in AREAS:
    lines.append(f"| {area} | {viable[area]} | {len(rows) - viable[area]} |")
lines.append("")
header = "| Slug | Type | Rarity | " + " | ".join(AREAS) + " |"
sep = "| --- | --- | --- | " + " | ".join(["---:"] * len(AREAS)) + " |"
lines.append(header)
lines.append(sep)
for idx, (name, stype, rarity) in enumerate(rows):
    cells = [fmt(columns[ai][idx]) for ai in range(len(AREAS))]
    lines.append(f"| {name} | {stype} | {rarity} | " + " | ".join(cells) + " |")
totals = ["**100%**" if abs(sum(columns[ai]) - 100) < 0.11 else f"**{sum(columns[ai]):.1f}%**"
          for ai in range(len(AREAS))]
lines.append("| **Column total** | | | " + " | ".join(totals) + " |")
lines.append("")

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(lines))

# --- docs/slug-habitats.md -----------------------------------------------------
hab = []
hab.append("# Slug Habitats & Planet Environments")
hab.append("")
hab.append(
    "Companion to [slug-hunt-odds.md](slug-hunt-odds.md). Generated by `scripts/gen_odds.py` from "
    "`scripts/habitat_model.py` — edit the model, not this file."
)
hab.append("")
hab.append("## How a slug's chance is worked out")
hab.append("")
hab.append(
    "1. Each **planet** has a set of habitats, each with an abundance from 0 (absent) to 1 (dominant).\n"
    "2. Each **slug** lists the habitats it can live in, each with an affinity from 0 to 1. Defaults come "
    "from its element (e.g. every Water slug wants fresh water, ocean, swamp…) and individual slugs "
    "override that where their biology differs (Pressure Tick lives at geysers, Jellyish in the sea, "
    "Frostfire where ice meets heat, Meduslug can live without water).\n"
    "3. The slug's **habitat score** is its best `affinity × abundance` plus "
    f"{hm.SECONDARY_WEIGHT:g} × everything else it can use. If the score is under {hm.MIN_VIABLE:g} the habitat "
    "is too marginal to keep a population alive and the slug is **0%** on that planet.\n"
    "4. On **airless** worlds, open-air habitats (bare rock, shadow, starlight, radiation) are exposed to "
    "vacuum, so only vacuum-hardy slugs (Metal, Energy, Dark, Light, Earth, plus a few) can use them; "
    "everything else is limited to the pressurised habitats (settlement, industry, forge, cisterns, gardens, wrecks).\n"
    f"5. Chance = (habitat score ^ {hm.SHARPEN:g}) × a rarity weight, then every planet's column is scaled to total 100%. "
    "The exponent favours specialists in a planet's signature habitat over slugs scraping by in a minor one."
)
hab.append("")
hab.append("## Habitats")
hab.append("")
hab.append("| Habitat | Meaning |")
hab.append("| --- | --- |")
for k, v in hm.NICHES.items():
    hab.append(f"| `{k}` | {v} |")
hab.append("")
hab.append("## Planet environments")
hab.append("")
hab.append("Abundance of each habitat (blank = not present). Airless worlds are marked ⌀.")
hab.append("")
used = [k for k in hm.NICHES if any(k in hm.PLANET_ENV[a] for a in AREAS)]
hab.append("| Planet | " + " | ".join(f"`{k}`" for k in used) + " |")
hab.append("| --- | " + " | ".join(["---:"] * len(used)) + " |")
for area in AREAS:
    env = hm.PLANET_ENV[area]
    mark = " ⌀" if area in hm.AIRLESS else ""
    hab.append(f"| {area}{mark} | " + " | ".join(f"{env[k]:g}" if k in env else "" for k in used) + " |")
hab.append("")
hab.append("## Which element types can live where")
hab.append("")
hab.append("Share of each planet's slug-hunt odds by element (0% = no slug of that element can live there).")
hab.append("")
types = sorted({t for _, t, _ in rows})
hab.append("| Planet | " + " | ".join(types) + " |")
hab.append("| --- | " + " | ".join(["---:"] * len(types)) + " |")
for ai, area in enumerate(AREAS):
    share = {t: 0.0 for t in types}
    for idx, (_, stype, _) in enumerate(rows):
        share[stype] += columns[ai][idx]
    hab.append(f"| {area} | " + " | ".join(fmt(share[t]) for t in types) + " |")
hab.append("")
hab.append("## Slug habitats")
hab.append("")
hab.append("Top habitats for each slug, strongest first. ⌀ = vacuum-hardy (can live outside pressurised structures on airless worlds).")
hab.append("")
hab.append("| Slug | Type | Rarity | Lives in |")
hab.append("| --- | --- | --- | --- |")
for name, stype, rarity in rows:
    ns = habitats[name]
    ordered = sorted(ns.items(), key=lambda kv: (-kv[1], kv[0]))
    text = ", ".join(f"{k}" for k, _ in ordered[:6])
    mark = " ⌀" if hm.is_vacuum_hardy(ns) else ""
    hab.append(f"| {name}{mark} | {stype} | {rarity} | {text} |")
hab.append("")
with open(OUT_HAB, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(hab))

# Machine-readable version for the client: per area, slugs sorted high->low, 0% dropped.
odds_by_area = {}
for ai, area in enumerate(AREAS):
    entries = []
    for idx, (name, stype, rarity) in enumerate(rows):
        chance = columns[ai][idx]
        if chance > 0:
            entries.append({"name": name, "type": stype, "chance": chance})
    entries.sort(key=lambda e: (-e["chance"], e["name"]))
    odds_by_area[area] = entries

payload = {"areas": AREAS, "oddsByArea": odds_by_area}
for dest in (OUT_JSON, OUT_JSON_SERVER):
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

print("wrote", OUT, "-", len(rows), "slugs")
print("wrote", OUT_HAB)
print("wrote", OUT_JSON)
print("wrote", OUT_JSON_SERVER)
for ai in range(len(AREAS)):
    print(f"  {AREAS[ai]:<18} sum={sum(columns[ai]):.1f}  max={max(columns[ai]):.1f}  slugs={viable[AREAS[ai]]}")
