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

# The Three Clusters (see docs/the-three-clusters-player-facing.md), flattened
# in cluster order -- Threxa Combine, then Verrin Concord, then Kaeth
# Dominion, then Unclaimed Space -- because the index (= campaign_settings
# .slug_hunt_area, and the flat PLANETS index on the Galaxy Map) has no other
# natural ordering once there are three separate star systems instead of one.
# This exact order must be mirrored by client/src/planetData.js's PLANETS
# array; a dev-only console.assert there fires if the two ever drift.
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

DEFAULT = 0.15
AFF = [
    # Cindrath (volcanic world, fleet command and Warden training grounds)
    {"Fire": 1.0, "Metal": 0.7, "Electricity": 0.5, "Energy": 0.4, "Earth": 0.3, "Dark": 0.3,
     "Toxic": 0.3, "Light": 0.3, "Air": 0.2, "Psychic": 0.15, "Unique": 0.15, "None": 0.1},
    # Pyrsis Barrens (geyser flats, scalding vapor, labor camp)
    {"Water": 0.8, "Toxic": 0.8, "Air": 0.6, "Fire": 0.5, "Electricity": 0.5, "Earth": 0.4,
     "Energy": 0.3, "Metal": 0.3, "Dark": 0.3, "Ice": 0.2, "Light": 0.15, "Psychic": 0.15, "None": 0.2},
    # Ashfall Rift (geothermal mountains, occupied labor population)
    {"Earth": 1.0, "Fire": 0.6, "Metal": 0.6, "Air": 0.5, "Dark": 0.4, "Electricity": 0.3,
     "Energy": 0.3, "Toxic": 0.3, "Light": 0.2, "Psychic": 0.2, "Water": 0.2, "Ice": 0.2, "None": 0.2},
    # Vorn's Forge (shipyard world, industrial-scale slug processing and bonding)
    {"Metal": 1.0, "Fire": 0.7, "Electricity": 0.6, "Energy": 0.5, "Toxic": 0.3, "Dark": 0.3,
     "Air": 0.2, "None": 0.3, "Unique": 0.2, "Earth": 0.2},
    # The Wellspring (capital in ancient ruins, Grand Coliseum -- spectacle and old mystery)
    {"Energy": 1.0, "Unique": 0.9, "Psychic": 0.8, "Dark": 0.6, "Light": 0.6, "Metal": 0.5,
     "Electricity": 0.4, "Earth": 0.3, "Healing": 0.3, "None": 0.3, "Fire": 0.3, "Air": 0.2},
    # Kessa-9 (open grassland, deliberately low-tech, sanctioned hunting reserve -- broad wildlife by design)
    {"None": 1.0, "Plant": 0.9, "Air": 0.8, "Earth": 0.7, "Water": 0.6, "Energy": 0.4,
     "Light": 0.4, "Healing": 0.4, "Psychic": 0.3, "Unique": 0.3, "Toxic": 0.2, "Electricity": 0.2},
    # Virid Canopy (dense jungle world, Concord resource concession)
    {"Plant": 1.0, "Healing": 0.9, "Toxic": 0.8, "Water": 0.6, "Psychic": 0.5, "Unique": 0.4,
     "Air": 0.3, "Earth": 0.3, "Light": 0.3, "Dark": 0.3, "Energy": 0.25, "Electricity": 0.2, "None": 0.3},
    # Solenne (agricultural world, cultivated fields and orchard terraces)
    {"Plant": 1.0, "Healing": 0.8, "None": 0.7, "Earth": 0.6, "Water": 0.5, "Air": 0.4,
     "Light": 0.4, "Energy": 0.3, "Psychic": 0.2, "Unique": 0.2, "Toxic": 0.2},
    # Maren's Deep (ocean world, floating city-states)
    {"Water": 1.0, "Ice": 0.6, "Light": 0.6, "Psychic": 0.5, "Unique": 0.5, "Healing": 0.4,
     "Electricity": 0.3, "Dark": 0.3, "Air": 0.2, "None": 0.3, "Energy": 0.2},
    # Aurelia Docks (shipyard-and-market world, neutral ground -- anything passes through)
    {"Unique": 1.0, "Metal": 0.6, "Energy": 0.5, "Electricity": 0.4, "None": 0.5, "Water": 0.4,
     "Air": 0.4, "Fire": 0.3, "Earth": 0.3, "Light": 0.3, "Dark": 0.3, "Psychic": 0.3,
     "Toxic": 0.3, "Healing": 0.3, "Plant": 0.25, "Ice": 0.25},
    # Kethrun Reach (finance and shipping-law world -- towers and ledgers, little that's wild)
    {"None": 1.0, "Psychic": 0.6, "Energy": 0.5, "Unique": 0.5, "Metal": 0.4, "Electricity": 0.3,
     "Light": 0.3, "Dark": 0.2, "Air": 0.2},
    # Marrek's Hold (swamp world under Dominion occupation)
    {"Toxic": 1.0, "Plant": 0.7, "Water": 0.7, "Dark": 0.6, "Healing": 0.3, "Earth": 0.3,
     "Air": 0.2, "Psychic": 0.2, "None": 0.2},
    # Drennow Yards (asteroid-belt shipyard complex, building the Dominion's warships)
    {"Metal": 1.0, "Dark": 0.6, "Electricity": 0.5, "Energy": 0.4, "Earth": 0.3, "Fire": 0.3,
     "Ice": 0.2, "None": 0.3, "Unique": 0.2},
    # Vhalden (conscript training world, harsh obstacle ranges)
    {"Earth": 1.0, "Metal": 0.6, "Air": 0.5, "Fire": 0.4, "Electricity": 0.3, "Energy": 0.3,
     "None": 0.3, "Dark": 0.2, "Psychic": 0.15},
    # Ossuary Station (fortified border outpost -- stark, almost nothing lives here)
    {"Dark": 1.0, "Metal": 0.6, "Psychic": 0.5, "Energy": 0.4, "Electricity": 0.3, "None": 0.3,
     "Unique": 0.3, "Earth": 0.2},
    # Kaeloth Prime (icebound homeworld, Dominion military capital)
    {"Ice": 1.0, "Metal": 0.7, "Dark": 0.5, "Air": 0.5, "Water": 0.4, "Electricity": 0.3,
     "Energy": 0.3, "Psychic": 0.2, "Earth": 0.2, "None": 0.2, "Light": 0.2},
    # The Threshold (derelict shipyard graveyard, unclaimed -- the old rules don't apply)
    {"Unique": 0.8, "Metal": 0.7, "Dark": 0.6, "Energy": 0.5, "Electricity": 0.4, "None": 0.5,
     "Psychic": 0.4, "Air": 0.35, "Earth": 0.35, "Water": 0.3, "Fire": 0.3, "Ice": 0.3,
     "Light": 0.3, "Toxic": 0.3, "Plant": 0.25, "Healing": 0.25},
]

# Types that simply do not occur on a given planet -> hard 0%.
EXCLUDE = [
    {"Ice", "Plant", "Water"},                              # Cindrath
    {"Plant", "Healing"},                                   # Pyrsis Barrens
    {"Plant", "Healing"},                                   # Ashfall Rift
    {"Plant", "Healing", "Ice", "Water"},                   # Vorn's Forge
    {"Plant", "Ice"},                                       # The Wellspring
    {"Fire", "Ice", "Dark", "Metal"},                       # Kessa-9
    {"Ice", "Metal"},                                       # Virid Canopy
    {"Fire", "Ice", "Dark", "Metal"},                       # Solenne
    {"Fire", "Plant"},                                      # Maren's Deep
    set(),                                                  # Aurelia Docks
    {"Fire", "Ice", "Plant", "Water", "Toxic", "Healing"},  # Kethrun Reach
    {"Ice", "Fire", "Light"},                               # Marrek's Hold
    {"Plant", "Healing", "Water", "Toxic"},                 # Drennow Yards
    {"Plant", "Healing", "Water", "Ice"},                   # Vhalden
    {"Plant", "Healing", "Water", "Fire", "Ice", "Toxic", "Light"},  # Ossuary Station
    {"Fire", "Plant", "Toxic", "Healing"},                  # Kaeloth Prime
    set(),                                                  # The Threshold
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
