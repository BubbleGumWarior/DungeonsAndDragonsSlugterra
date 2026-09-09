import csv
import json
import os

# Paths are relative to the repo root (the parent of this scripts/ folder) so the
# script is portable -- run it from anywhere after editing the CSV.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "Slugs - OG Slugs.csv")
OUT = os.path.join(ROOT, "docs", "slug-hunt-odds.md")
OUT_JSON = os.path.join(ROOT, "client", "src", "slugHuntOdds.json")
OUT_JSON_SERVER = os.path.join(ROOT, "server", "src", "data", "slugHuntOdds.json")

# Ordered inner -> outer, so the index (= campaign_settings.slug_hunt_area,
# and the Galaxy Map orbit position) tracks distance from the sun: scorching
# worlds near the star, temperate ones mid-system, frozen/sunless ones far out.
AREAS = [
    "Cindraxis",
    "Vapenar",
    "Sylvoss",
    "Aurelon",
    "Tesalune",
    "Vharsk",
    "Keldrath",
    "Noctavel",
]

# Relative "how much of this planet's population is this rarity band" weight (1-10).
PEAK_BY_RARITY = {1: 72, 2: 66, 3: 56, 4: 46, 5: 36, 6: 27, 7: 19, 8: 13, 9: 8, 10: 5}

DEFAULT = 0.15
AFF = [
    # 1 - Cindraxis (volcanic world, lava rivers, ash-fall, oppressive constant heat)
    {"Fire": 1.0, "Metal": 0.7, "Electricity": 0.5, "Energy": 0.4, "Earth": 0.3, "Dark": 0.3,
     "Toxic": 0.3, "Light": 0.3, "Air": 0.2, "Psychic": 0.15, "Unique": 0.15, "None": 0.1},
    # 2 - Vapenar (geyser flats, scalding vapor, mineral crust, dense fog)
    {"Water": 0.8, "Toxic": 0.7, "Air": 0.6, "Fire": 0.5, "Electricity": 0.5, "Earth": 0.4,
     "Energy": 0.4, "Metal": 0.3, "Ice": 0.2, "Light": 0.2, "Psychic": 0.2, "Dark": 0.2,
     "Plant": 0.15, "Unique": 0.2, "Healing": 0.2, "None": 0.2},
    # 3 - Sylvoss (hot wet jungle world, permanent canopy, steaming pools, spores)
    {"Plant": 1.0, "Healing": 0.9, "Toxic": 0.8, "Water": 0.6, "Psychic": 0.5, "Unique": 0.4,
     "Air": 0.3, "Earth": 0.3, "Light": 0.3, "Dark": 0.3, "Energy": 0.25, "Electricity": 0.2,
     "None": 0.3},
    # 4 - Aurelon (pale sun-starved grassland, ponds, one still lake, low ruins, quiet)
    {"None": 1.0, "Plant": 0.9, "Air": 0.8, "Water": 0.7, "Earth": 0.6, "Energy": 0.5,
     "Light": 0.4, "Healing": 0.4, "Psychic": 0.3, "Unique": 0.3, "Toxic": 0.2},
    # 5 - Tesalune (open ocean world, bioluminescent plankton, wind-worn spires)
    {"Water": 1.0, "Ice": 0.8, "Light": 0.6, "Psychic": 0.6, "Unique": 0.5, "Dark": 0.4,
     "Healing": 0.3, "Electricity": 0.3, "Air": 0.2, "Metal": 0.2, "Earth": 0.15,
     "Energy": 0.2, "Toxic": 0.15, "None": 0.2},
    # 6 - Vharsk (deep rift canyons, raw vertical rock, howling updrafts, cold glow below)
    {"Earth": 0.9, "Metal": 0.8, "Dark": 0.7, "Air": 0.5, "Unique": 0.4, "Ice": 0.3,
     "Electricity": 0.3, "Psychic": 0.3, "Water": 0.2, "Light": 0.2, "Fire": 0.15,
     "Energy": 0.2, "Toxic": 0.15, "None": 0.2},
    # 7 - Keldrath (cold grey mountains, heat-breathing fissures, hot springs, wind)
    {"Air": 1.0, "Earth": 0.7, "Energy": 0.6, "Metal": 0.6, "Electricity": 0.5, "Fire": 0.4,
     "Ice": 0.4, "Light": 0.3, "Psychic": 0.3, "Water": 0.3, "Toxic": 0.3, "Dark": 0.3,
     "Plant": 0.2, "Unique": 0.2, "Healing": 0.2, "None": 0.2},
    # 8 - Noctavel (sunless world, cool mineral stillness, glowing veins, aware)
    {"Energy": 1.0, "Light": 0.9, "Psychic": 0.9, "Dark": 0.8, "Healing": 0.7, "Unique": 0.7,
     "Electricity": 0.5, "Earth": 0.4, "Metal": 0.4, "Ice": 0.3, "Toxic": 0.3, "Fire": 0.2,
     "Air": 0.2, "Water": 0.2, "Plant": 0.2, "None": 0.2},
]

# Types that simply do not occur on a given planet -> hard 0%.
EXCLUDE = [
    {"Ice", "Plant", "Water"},                         # 1 Cindraxis
    set(),                                             # 2 Vapenar
    {"Ice", "Metal"},                                  # 3 Sylvoss
    {"Fire", "Ice", "Dark", "Electricity", "Metal"},  # 4 Aurelon
    {"Fire", "Plant"},                                 # 5 Tesalune
    {"Plant", "Healing"},                              # 6 Vharsk
    set(),                                             # 7 Keldrath
    set(),                                             # 8 Noctavel
]


def raw_weight(rarity, stype, area_idx):
    if stype in EXCLUDE[area_idx]:
        return 0.0
    peak = PEAK_BY_RARITY.get(rarity, 30)
    return peak * AFF[area_idx].get(stype, DEFAULT)


def fmt(p):
    if p <= 0:
        return "0%"
    if abs(p - round(p)) < 0.05:
        return f"{round(p)}%"
    return f"{p:.1f}%"


rows = []
with open(SRC, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rows.append((r["Name"].strip(), r["Type"].strip(), int(r["Rarity"].strip())))
rows.sort(key=lambda x: x[0].lower())

# One normalized distribution per area (each column sums to 100%).
columns = {}
for ai in range(len(AREAS)):
    weights = [raw_weight(rar, st, ai) for _, st, rar in rows]
    total = sum(weights)
    pcts = [round(w / total * 100, 1) for w in weights]
    for i, w in enumerate(weights):
        if w > 0 and pcts[i] == 0.0:
            pcts[i] = 0.1
    drift = round(100.0 - sum(pcts), 1)
    if drift:
        big = max(range(len(pcts)), key=lambda i: pcts[i])
        pcts[big] = round(pcts[big] + drift, 1)
    columns[ai] = pcts

lines = []
lines.append("# Slug Hunt — Encounter Odds by Planet")
lines.append("")
lines.append(
    "Draft values, auto-generated from `Slugs - OG Slugs.csv` as a starting point. "
    "**Each planet column is a probability distribution that sums to 100%** — i.e. \"if you "
    "hunt on this planet, here is the chance the slug you turn up is each one\". Weights come "
    "from the slug's element vs. the planet's environment and its rarity; elements that don't "
    "belong on a planet are set to 0%. **Review and adjust before this goes live.**"
)
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
print("wrote", OUT_JSON)
print("wrote", OUT_JSON_SERVER)
for ai in range(len(AREAS)):
    print(f"  {AREAS[ai]:<18} sum={sum(columns[ai]):.1f}  max={max(columns[ai]):.1f}")
