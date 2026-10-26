"""Habitat model for slug-hunt odds (used by gen_odds.py).

A slug can turn up on a planet only if the planet actually offers somewhere
for it to live. Instead of rating each element against each planet by feel,
we describe

  * every PLANET as a set of habitat NICHES with an abundance (0..1), and
  * every SLUG as the NICHES it can live in, each with an affinity (0..1).

A slug's habitat score on a planet is how much of the planet it can use:

    score = best(affinity * abundance) + 0.3 * (all the other niches added up)

If that score is below MIN_VIABLE the slug is considered unable to sustain a
population there and gets exactly 0%. So a Water slug on a lava world is not
"unlikely" -- it has no niche at all, so it is impossible.

AIRLESS worlds (asteroid yards, stations, wreck fields) add one more rule:
open-air niches (bare rock, deep shadow, starlight, radiation) are exposed to
vacuum, so only vacuum-hardy slugs (those with a `vacuum` affinity: Metal,
Energy, Dark, Light, Earth) can use them. Everything else must live in the
pressurised niches (settlement, industrial, forge, cistern, garden, wreck).

To retune: edit PLANET_ENV (the world), TYPE_HABITAT (the element's default
needs) or ADJUST / REPLACE (individual slugs that differ from their element).
"""

# ---------------------------------------------------------------------------
# Niches
# ---------------------------------------------------------------------------
NICHES = {
    "magma": "lava fields, molten rock, extreme surface heat",
    "ash": "ash-fall, cinders, scorched barren ground, hot dry wasteland",
    "geothermal": "geysers, steam vents, hot springs, mineral crust",
    "rock": "mountains, caves, cliffs, bare stone",
    "soil": "loose soil, sand, dust, open ground to dig in",
    "grass": "open grassland and meadow",
    "forest": "forest, jungle, dense living canopy",
    "farm": "cultivated fields and orchards",
    "garden": "tended gardens, planters, hydroponics",
    "swamp": "bog, marsh, mire, stagnant water",
    "fresh_water": "rivers, lakes, springs, rain-fed pools",
    "ocean": "open sea and deep water",
    "cistern": "man-made water: cisterns, canals, tanks, fountains",
    "ice": "glaciers, frozen ground, snow",
    "sky": "open breathable atmosphere and wind",
    "storm": "lightning and violent weather",
    "toxic_air": "sulphur, chemical vapour, poisonous atmosphere",
    "industrial": "machinery, wiring, gantries, hulls under construction",
    "forge": "furnaces, foundries, smelters, engine heat",
    "settlement": "towns, cities, camps, stations (pressurised habitation)",
    "ruins": "ancient ruins and old halls",
    "dark": "lightless caves, deep shadow",
    "bright": "intense sunlight / starlight",
    "energy_field": "ley energy, accretion-disc radiation, power surges",
    "wreck": "derelict hulls and scrap fields",
    "vacuum": "hard vacuum (hardy slugs only)",
}

# Niches that are open to the sky/void. On an airless world these only count
# for vacuum-hardy slugs.
EXPOSED = {"rock", "soil", "ice", "dark", "bright", "energy_field", "ash", "geothermal", "magma"}

AIRLESS = {"Drennow Yards", "Ossuary Station", "The Threshold"}

# A slug whose usable habitat score is below this cannot sustain a population.
MIN_VIABLE = 0.10
# How much of the slug's other (non-best) niches add on top of its best one.
SECONDARY_WEIGHT = 0.3
# Odds weight = habitat score ** SHARPEN. Above 1 it favours specialists living in a
# planet's signature habitat over slugs that only just scrape by in a minor one.
SHARPEN = 1.6

# ---------------------------------------------------------------------------
# Planets -- abundance of each niche (omitted = 0 = not present at all)
# ---------------------------------------------------------------------------
PLANET_ENV = {
    # --- Threxa Combine: dying red giant, dim red sky ---
    "Cindrath": {  # volcanic: black glass ridges, lava rivers, nothing grows, fleet command
        "magma": 1.0, "ash": 0.9, "rock": 0.8, "soil": 0.2, "forge": 0.3, "industrial": 0.4,
        "settlement": 0.3, "storm": 0.4, "toxic_air": 0.3, "sky": 0.3, "dark": 0.2,
        "bright": 0.2, "energy_field": 0.1,
    },
    "Pyrsis Barrens": {  # scalding geyser flats, steam fog, labour camp
        "geothermal": 1.0, "rock": 0.4, "soil": 0.4, "toxic_air": 0.7, "sky": 0.5,
        "storm": 0.15, "dark": 0.25, "industrial": 0.3, "settlement": 0.25, "forge": 0.1,
        "bright": 0.1, "cistern": 0.1,
    },
    "Ashfall Rift": {  # geothermal mountains, ash, mining labour
        "rock": 1.0, "ash": 0.8, "geothermal": 0.5, "magma": 0.15, "sky": 0.6, "storm": 0.35,
        "toxic_air": 0.4, "industrial": 0.3, "forge": 0.2, "settlement": 0.4, "dark": 0.4,
        "soil": 0.3, "cistern": 0.1, "bright": 0.15,
    },
    "Vorn's Forge": {  # shipyard + slug processing, furnaces
        "industrial": 1.0, "forge": 0.9, "settlement": 0.5, "toxic_air": 0.4, "dark": 0.25,
        "energy_field": 0.3, "wreck": 0.15, "rock": 0.2, "magma": 0.1, "sky": 0.3, "storm": 0.2,
        "cistern": 0.2, "bright": 0.15, "ash": 0.2,
    },
    "The Wellspring": {  # capital in ancient ruins, Grand Coliseum
        "ruins": 1.0, "settlement": 0.8, "rock": 0.5, "dark": 0.5, "energy_field": 0.6,
        "industrial": 0.3, "cistern": 0.6, "fresh_water": 0.15, "garden": 0.15, "sky": 0.5,
        "soil": 0.3, "bright": 0.3, "storm": 0.2, "forge": 0.15,
    },
    "Kessa-9": {  # open grassland hunting reserve, no roads or settlements
        "grass": 1.0, "soil": 0.7, "sky": 0.6, "fresh_water": 0.4, "forest": 0.1, "rock": 0.2,
        "storm": 0.3, "swamp": 0.1, "bright": 0.4, "dark": 0.15, "settlement": 0.1,
    },
    # --- Verrin Concord: close binary, soft double daylight ---
    "Virid Canopy": {  # dense jungle
        "forest": 1.0, "swamp": 0.4, "fresh_water": 0.6, "sky": 0.6, "soil": 0.5, "rock": 0.2,
        "dark": 0.5, "bright": 0.5, "storm": 0.4, "toxic_air": 0.2, "settlement": 0.15,
        "industrial": 0.1, "grass": 0.1,
    },
    "Solenne": {  # agricultural: fields and orchard terraces
        "farm": 1.0, "grass": 0.5, "soil": 0.8, "fresh_water": 0.5, "forest": 0.3, "sky": 0.7,
        "settlement": 0.4, "cistern": 0.2, "industrial": 0.15, "storm": 0.3, "bright": 0.6,
        "rock": 0.15, "dark": 0.2, "swamp": 0.15, "garden": 0.4,
    },
    "Maren's Deep": {  # ocean world, no land, floating city-states
        "ocean": 1.0, "sky": 0.6, "fresh_water": 0.2, "ice": 0.2, "settlement": 0.5,
        "cistern": 0.2, "garden": 0.3, "industrial": 0.2, "dark": 0.3, "bright": 0.6,
        "storm": 0.5,
    },
    "Aurelia Docks": {  # neutral shipyard-and-market world
        "settlement": 1.0, "industrial": 0.7, "forge": 0.2, "cistern": 0.6, "fresh_water": 0.1,
        "ocean": 0.15, "garden": 0.25, "sky": 0.5, "soil": 0.3, "rock": 0.3, "bright": 0.5,
        "storm": 0.2, "dark": 0.3, "toxic_air": 0.15, "energy_field": 0.15, "wreck": 0.1,
        "farm": 0.1,
    },
    "Kethrun Reach": {  # finance / shipping-law towers -- little that's wild
        "settlement": 1.0, "cistern": 0.2, "sky": 0.4, "industrial": 0.2, "dark": 0.3,
        "bright": 0.4, "energy_field": 0.2, "rock": 0.15, "storm": 0.1,
    },
    # --- Kaeth Dominion: black-hole accretion disc, pale restless light ---
    "Marrek's Hold": {  # warm toxic swamp under occupation
        "swamp": 1.0, "fresh_water": 0.5, "forest": 0.4, "toxic_air": 0.8, "dark": 0.5, "sky": 0.4,
        "soil": 0.4, "settlement": 0.3, "industrial": 0.15, "storm": 0.3, "rock": 0.1,
        "energy_field": 0.1, "bright": 0.1,
    },
    "Drennow Yards": {  # asteroid-belt shipyard (airless)
        "vacuum": 1.0, "rock": 0.8, "dark": 0.8, "energy_field": 0.4, "industrial": 0.9,
        "forge": 0.7, "settlement": 0.3, "wreck": 0.1, "cistern": 0.1, "bright": 0.2,
    },
    "Vhalden": {  # wind-scoured conscript training world
        "rock": 0.8, "soil": 0.8, "sky": 0.5, "storm": 0.3, "industrial": 0.2,
        "settlement": 0.3, "dark": 0.2, "ice": 0.1, "bright": 0.5, "cistern": 0.1,
    },
    "Ossuary Station": {  # fortified border outpost (airless)
        "vacuum": 1.0, "rock": 0.6, "dark": 0.8, "energy_field": 0.35, "industrial": 0.6,
        "settlement": 0.3, "wreck": 0.35, "cistern": 0.15, "forge": 0.1, "bright": 0.1,
    },
    "Kaeloth Prime": {  # icebound homeworld, armoured cities
        "ice": 1.0, "sky": 0.5, "storm": 0.5, "settlement": 0.5, "industrial": 0.4,
        "forge": 0.25, "dark": 0.35, "bright": 0.3, "energy_field": 0.3, "rock": 0.4,
        "ocean": 0.15, "fresh_water": 0.15, "cistern": 0.15, "soil": 0.1,
    },
    # --- Unclaimed ---
    "The Threshold": {  # derelict-hull graveyard in open space (airless)
        "vacuum": 1.0, "wreck": 1.0, "industrial": 0.5, "settlement": 0.4, "dark": 0.8,
        "rock": 0.3, "energy_field": 0.3, "cistern": 0.1, "garden": 0.1, "forge": 0.2,
        "bright": 0.1, "ruins": 0.1,
    },
}

# ---------------------------------------------------------------------------
# Slug habitats -- element defaults
# ---------------------------------------------------------------------------
TYPE_HABITAT = {
    "Fire": {"magma": 1.0, "forge": 0.8, "ash": 0.8, "geothermal": 0.6, "industrial": 0.2},
    "Water": {"fresh_water": 1.0, "ocean": 0.8, "swamp": 0.5, "cistern": 0.25, "geothermal": 0.25},
    "Ice": {"ice": 1.0, "ocean": 0.15},
    "Plant": {"forest": 1.0, "grass": 0.7, "farm": 0.8, "garden": 0.8, "swamp": 0.5,
              "ruins": 0.1, "fresh_water": 0.15},
    "Earth": {"rock": 1.0, "soil": 0.8, "ash": 0.3, "geothermal": 0.25, "grass": 0.2,
              "ruins": 0.35, "wreck": 0.1, "vacuum": 0.4},
    "Air": {"sky": 1.0, "storm": 0.5, "settlement": 0.2, "rock": 0.15},
    "Electricity": {"storm": 1.0, "industrial": 1.0, "energy_field": 0.5, "settlement": 0.3,
                    "forge": 0.4, "wreck": 0.4, "ruins": 0.2},
    "Energy": {"energy_field": 1.0, "ruins": 0.6, "industrial": 0.4, "bright": 0.4, "storm": 0.3,
               "forge": 0.3, "settlement": 0.2, "vacuum": 0.7},
    "Light": {"bright": 1.0, "dark": 0.4, "ruins": 0.4, "settlement": 0.3, "energy_field": 0.3,
              "vacuum": 0.5},
    "Dark": {"dark": 1.0, "rock": 0.5, "ruins": 0.5, "wreck": 0.5, "settlement": 0.2, "swamp": 0.3,
             "forest": 0.3, "ocean": 0.3, "vacuum": 0.8},
    "Metal": {"industrial": 1.0, "forge": 0.7, "wreck": 0.8, "rock": 0.4, "settlement": 0.4,
              "magma": 0.25, "ruins": 0.3, "vacuum": 0.5},
    # Healing slugs feed on living plants -- no settlement niche (tame hospital slugs aren't hunted wild).
    "Healing": {"forest": 1.0, "farm": 0.8, "garden": 0.8, "grass": 0.6, "swamp": 0.2},
    "Psychic": {"settlement": 0.8, "ruins": 0.8, "forest": 0.3, "grass": 0.25, "ocean": 0.25,
                "dark": 0.3, "energy_field": 0.3, "wreck": 0.3},
    "Toxic": {"toxic_air": 1.0, "swamp": 1.0, "geothermal": 0.5, "ash": 0.4, "industrial": 0.4,
              "forge": 0.3, "settlement": 0.25, "forest": 0.35, "wreck": 0.3},
    "Unique": {"settlement": 0.7, "wreck": 0.7, "industrial": 0.4, "forest": 0.3, "rock": 0.3,
               "ruins": 0.3},
    "None": {"grass": 0.8, "farm": 0.7, "settlement": 0.8, "forest": 0.5, "soil": 0.5,
             "fresh_water": 0.4, "garden": 0.5, "swamp": 0.3, "rock": 0.2},
}

# ---------------------------------------------------------------------------
# Individual slugs. ADJUST merges onto the element default (0 removes a niche);
# REPLACE throws the default away and uses exactly what's listed.
# ---------------------------------------------------------------------------
ADJUST = {
    # --- Air ---
    "Cumulonid": {"storm": 0.8, "ocean": 0.4, "settlement": 0},
    "Stormpetrel": {"storm": 1.0, "ocean": 0.9, "settlement": 0},
    "Maelstrix": {"storm": 1.0, "ocean": 0.5},
    "Galecrow": {"rock": 0.6, "settlement": 0},
    "Gazzer": {"swamp": 0.3, "toxic_air": 0.3},
    "Whirlcap": {"soil": 0.6, "ash": 0.5, "settlement": 0.3},
    "Whirlet": {"settlement": 0.45, "soil": 0.3},
    "Tormato": {"soil": 0.5, "grass": 0.4, "ash": 0.4, "storm": 0.7},
    "Hoverbug": {"grass": 0.4, "forest": 0.4, "ash": 0.3, "industrial": 0.3, "settlement": 0.3},
    "Ventus": {"rock": 0.3},
    "Fluffwing": {"grass": 0.5, "forest": 0.5, "farm": 0.4},
    "Driftmoth": {"grass": 0.5, "forest": 0.5, "farm": 0.3},
    # --- Dark ---
    "Duskfang": {"rock": 0.7, "dark": 0.9, "ruins": 0.6, "settlement": 0.4},
    "Dreadmoth": {"wreck": 0.7, "settlement": 0.3},
    "Hexlet": {"industrial": 0.8, "settlement": 0.6, "wreck": 0.5, "dark": 0.4},
    "Frightgeist": {"ruins": 0.8, "wreck": 0.6},
    "Voidmaw": {"vacuum": 1.0},
    "Nightveil": {"vacuum": 0.9},
    "Wraithlet": {"ruins": 0.7, "wreck": 0.5},
    "Eclipsling": {"soil": 0.3, "ash": 0.3},
    # --- Earth ---
    "Dustkin": {"soil": 1.0, "ash": 0.6, "rock": 0.4},
    "Sand Angler": {"soil": 1.0, "ash": 0.5, "rock": 0.3},
    "Diggrix": {"soil": 1.0, "rock": 0.7, "farm": 0.3},
    "Hop Rock": {"rock": 1.0, "soil": 0.5},
    "Dirt Urchin": {"soil": 1.0, "rock": 0.5, "grass": 0.3, "farm": 0.3},
    "Cairnback": {"rock": 1.0, "grass": 0.3},
    "Crystalyd": {"geothermal": 0.4, "dark": 0.3},
    "Geoshard": {"geothermal": 0.4, "dark": 0.3},
    "Tectonyx": {"magma": 0.3, "geothermal": 0.5},
    "Titanite": {"ruins": 0.3, "industrial": 0.2},
    "Sinkmaw": {"soil": 1.0, "swamp": 0.6, "farm": 0.3, "fresh_water": 0.2, "rock": 0.3},
    "Rubblerunt": {"ruins": 0.4, "rock": 1.0, "soil": 0.3},
    # --- Electricity ---
    "Zeus": {"storm": 1.0, "industrial": 0.3},
    "Railspark": {"industrial": 1.0, "storm": 0.3},
    "Thundercoil": {"industrial": 1.0, "wreck": 0.5, "storm": 0.3},
    "Voltarch": {"storm": 1.0, "industrial": 0.6},
    "Cybercut": {"industrial": 1.0, "settlement": 0.6, "storm": 0.3},
    "Xmitter": {"industrial": 1.0, "settlement": 0.6, "storm": 0.3},
    "Arcling": {"industrial": 1.0, "settlement": 0.6, "storm": 0.3},
    "Arcwhip": {"industrial": 1.0, "storm": 0.6},
    # --- Energy ---
    "Novaflare": {"bright": 0.6, "vacuum": 0.9},
    "Pulsar": {"vacuum": 1.0, "energy_field": 0.9, "industrial": 0.3},
    "Keystone": {"ruins": 0.8, "rock": 0.4, "industrial": 0.4, "energy_field": 0.5},
    "Tesser": {"energy_field": 0.8, "ruins": 0.5, "settlement": 0.3},
    "Zephur": {"settlement": 0.5, "ruins": 0.5, "energy_field": 0.8},
    "Cartridgeling": {"settlement": 0.6, "industrial": 0.5, "energy_field": 0.5},
    "Lentus": {"settlement": 0.6, "industrial": 0.5, "energy_field": 0.5},
    "Surgeling": {"industrial": 0.8, "forge": 0.4},
    "Psi": {"industrial": 0.7, "settlement": 0.3, "energy_field": 0.5},
    "Fizzlet": {"energy_field": 0.8, "settlement": 0.5, "industrial": 0.4},
    "Flickerbit": {"energy_field": 0.8, "settlement": 0.5, "industrial": 0.4},
    # --- Fire ---
    "Lavalynx": {"magma": 1.0, "ash": 0.6, "geothermal": 0.5, "forge": 0.5},
    "Cinderwyrm": {"industrial": 0.3, "magma": 0.8, "forge": 0.7},
    "Forgesmelter": {"forge": 1.0, "magma": 0.8, "industrial": 0.4},
    "Regulator": {"geothermal": 0.9, "magma": 0.8, "forge": 0.6},
    "Infernox": {"magma": 1.0, "forge": 0.9},
    "Echo-ash": {"ash": 1.0, "magma": 0.5},
    "Infurnus": {"forge": 0.9, "industrial": 0.3},
    "Emberblade": {"forge": 0.8},
    # --- Healing ---
    "Boon Doc": {"forest": 0.5, "garden": 0.5, "farm": 0.5, "grass": 0.4},
    "Mendlet": {"farm": 0.9, "grass": 0.7, "forest": 0.6},
    "Tidbit": {"farm": 0.9, "grass": 0.7, "forest": 0.6},
    "Panaceon": {"forest": 0.8, "swamp": 0.5, "garden": 0.5},
    "Sapheart": {"forest": 1.0, "farm": 0.5},
    "Restoril": {"forest": 0.8, "garden": 0.6},
    "Salvekin": {"swamp": 0.3},
    "Vitalis": {"forest": 0.7, "garden": 0.5},
    "Lifebloom": {"garden": 0.7, "forest": 0.8},
    "Lifeline": {"forest": 1.0},
    "Mendlark": {"grass": 0.7, "forest": 0.7},
    # --- Ice ---
    "Frostcrawler": {"ocean": 0.3},
    "Floeling": {"ocean": 0.3},
    "Narwhaddle": {"ocean": 0.5},
    # --- Light ---
    "Heliarch": {"bright": 1.0, "vacuum": 0.6, "dark": 0.2},
    "Solaris": {"bright": 1.0, "vacuum": 0.6, "dark": 0.2},
    "Pentalux": {"bright": 1.0, "vacuum": 0.6, "dark": 0.2},
    "Mirage Coil": {"bright": 0.8, "ash": 0.5, "soil": 0.4, "dark": 0.1},
    "Prismite": {"storm": 0.3},
    "Luxbison": {"grass": 0.8, "bright": 0.7},
    "Glintmoth": {"dark": 0.7, "forest": 0.5, "swamp": 0.4, "rock": 0.4, "bright": 0.4},
    "Glowdab": {"dark": 0.7, "forest": 0.5, "swamp": 0.4, "rock": 0.4, "bright": 0.4},
    "Lumebug": {"dark": 0.7, "forest": 0.5, "swamp": 0.4, "rock": 0.4, "bright": 0.4},
    "Lanternix": {"bright": 0.6, "settlement": 0.4, "dark": 0.3},
    "Beaconel": {"bright": 0.6, "ocean": 0.5, "rock": 0.4, "swamp": 0.3},
    "Phosphora": {"dark": 1.0, "rock": 0.8, "bright": 0.1},
    "Enigmo": {"ruins": 1.0, "dark": 0.4},
    # --- Metal ---
    "Rivetling": {"industrial": 1.0, "wreck": 0.7, "settlement": 0.5, "rock": 0.3},
    "Boltling": {"industrial": 1.0, "wreck": 0.7, "settlement": 0.5, "rock": 0.3},
    "Clinker": {"industrial": 1.0, "wreck": 0.7, "settlement": 0.5, "rock": 0.3},
    "Cobblet": {"industrial": 1.0, "wreck": 0.7, "settlement": 0.5, "rock": 0.3},
    "Magnetis": {"industrial": 1.0, "wreck": 0.8, "rock": 0.4},
    "Speedstinger": {"settlement": 0.5},
    "Thresher": {"forest": 0.25, "grass": 0.2},
    "Makobreaker": {"rock": 1.0, "industrial": 0.5},
    "Armashelt": {"rock": 0.7, "industrial": 0.6, "wreck": 0.5},
    "Adamantor": {"wreck": 0.8, "industrial": 0.8, "vacuum": 0.6, "rock": 0.6},
    "Cynosure": {"industrial": 1.0, "settlement": 0.5},
    "Slicksilver": {"settlement": 0.5, "industrial": 0.9, "wreck": 0.7},
    "Polero": {"industrial": 0.9, "wreck": 0.6, "forest": 0.3},
    # --- Plant ---
    "Elderoot": {"garden": 0.5, "grass": 0.3},
    # --- Psychic ---
    "Echoling": {"ruins": 0.9},
    "Pieper": {"forest": 0.4, "settlement": 0.4},
    "Phantasmo": {"ruins": 0.8, "settlement": 0.8, "forest": 0.3},
    "Eunoa": {"settlement": 1.0, "ruins": 0.6},
    "Perplexus": {"settlement": 1.0, "ruins": 0.6},
    "Sagepaw": {"settlement": 1.0, "ruins": 0.6},
    # Meduslug is the only slug that does not need water (lore) -- the one psychic that copes
    # with dry, barren ground.
    "Meduslug": {"settlement": 0.6, "grass": 0.4, "ruins": 0.5, "forest": 0.3, "rock": 0.4,
                 "ash": 0.4, "geothermal": 0.3, "swamp": 0.2, "dark": 0.3},
}

REPLACE = {
    # --- Water ---
    "Leviathor": {"ocean": 1.0, "fresh_water": 0.4},
    "Breakwater": {"ocean": 1.0, "fresh_water": 0.4},
    "Torrentail": {"ocean": 1.0, "fresh_water": 0.6},
    "Tidewarden": {"ocean": 0.9, "fresh_water": 0.4, "cistern": 0.2},
    "Bubbaleone": {"ocean": 0.8, "fresh_water": 0.6, "swamp": 0.2},
    "Tidehook": {"ocean": 0.9, "fresh_water": 0.5, "cistern": 0.3},
    "Pressure Tick": {"geothermal": 0.9, "ocean": 0.5, "fresh_water": 0.5},
    "Brookling": {"fresh_water": 1.0, "ocean": 0.3, "swamp": 0.3, "geothermal": 0.3},
    "Driplet": {"fresh_water": 1.0, "cistern": 0.5, "swamp": 0.4, "ocean": 0.4},
    "Aquabeek": {"fresh_water": 1.0, "cistern": 0.4, "ocean": 0.3, "swamp": 0.2},
    "Caligo": {"cistern": 0.6, "fresh_water": 0.7, "ocean": 0.4},
    "Mantis": {"fresh_water": 0.7, "ocean": 0.6, "swamp": 0.4},
    "Ripplet": {"fresh_water": 1.0, "swamp": 0.5, "cistern": 0.5, "ocean": 0.4},
    # --- Fire ---
    # Fire/ice hybrid: lives where cold meets heat.
    "Frostfire": {"ice": 0.4, "geothermal": 0.8},
    # --- Plant ---
    "Puffshroom": {"forest": 0.8, "swamp": 0.6, "farm": 0.3, "grass": 0.2, "garden": 0.3},
    # --- Toxic (all twelve are specific about where they live) ---
    "Bogbelcher": {"swamp": 1.0, "toxic_air": 0.5, "fresh_water": 0.3},
    "Gurglet": {"swamp": 1.0, "toxic_air": 0.5, "fresh_water": 0.3},
    "Spitviper": {"swamp": 0.7, "forest": 0.6, "fresh_water": 0.4, "soil": 0.3, "toxic_air": 0.3},
    "Mildewmite": {"swamp": 0.7, "settlement": 0.6, "farm": 0.5, "forest": 0.5, "dark": 0.3},
    "Rotspawn": {"settlement": 0.6, "swamp": 0.8, "farm": 0.5, "forest": 0.4, "wreck": 0.3},
    "Plaguebell": {"settlement": 0.7, "farm": 0.5, "swamp": 0.5, "wreck": 0.3, "industrial": 0.3},
    "Necrobloom": {"swamp": 0.8, "forest": 0.5, "ruins": 0.4, "toxic_air": 0.5},
    "Miasmara": {"toxic_air": 1.0, "swamp": 0.8, "settlement": 0.4, "wreck": 0.4},
    "Neotox": {"industrial": 0.8, "wreck": 0.7, "swamp": 0.3, "toxic_air": 0.7},
    "Venomaw": {"forest": 0.7, "swamp": 0.8, "rock": 0.3, "grass": 0.3},
    "Flatulorhinkus": {"swamp": 0.6, "grass": 0.5, "toxic_air": 0.4},
    "Soot Pup": {"ash": 0.8, "forge": 0.8, "industrial": 0.7, "toxic_air": 0.5, "magma": 0.2},
    # --- Unique ---
    "Arachnet": {"forest": 0.7, "rock": 0.6, "ruins": 0.5, "wreck": 0.6, "settlement": 0.5, "dark": 0.3},
    "Gantrix": {"industrial": 1.0, "wreck": 0.7, "settlement": 0.5},
    "Jellyish": {"ocean": 0.9, "fresh_water": 0.4, "swamp": 0.4, "settlement": 0.2, "wreck": 0.2},
    "Lariat": {"swamp": 0.7, "forest": 0.7, "fresh_water": 0.4, "settlement": 0.3, "wreck": 0.3},
    "Mimkey": {"forest": 1.0, "settlement": 0.6, "ruins": 0.4},
    "Nibblet": {"settlement": 1.0, "wreck": 0.8, "industrial": 0.4, "ruins": 0.4, "farm": 0.4, "grass": 0.3},
    "Snaptrap": {"swamp": 0.6, "forest": 0.6, "wreck": 0.4, "rock": 0.3},
    "Tetherling": {"settlement": 0.6, "wreck": 0.5, "rock": 0.5, "forest": 0.3, "ruins": 0.3},
    "Wisplet": {"ruins": 0.7, "dark": 0.6, "swamp": 0.5, "forest": 0.4, "wreck": 0.5, "settlement": 0.2},
    # --- None ---
    "Flopper": {"fresh_water": 0.8, "settlement": 0.6, "grass": 0.6},
}

def slug_habitat(name, stype):
    """The niches a slug can live in -> affinity (0..1)."""
    if name in REPLACE:
        return dict(REPLACE[name])
    niches = dict(TYPE_HABITAT[stype])
    for n, w in ADJUST.get(name, {}).items():
        if w:
            niches[n] = w
        else:
            niches.pop(n, None)
    return niches


def is_vacuum_hardy(niches):
    return niches.get("vacuum", 0) > 0


def habitat_score(niches, planet):
    """0..~1 how much of `planet` this slug can actually use (0 = cannot live there)."""
    env = PLANET_ENV[planet]
    airless = planet in AIRLESS
    hardy = is_vacuum_hardy(niches)
    parts = []
    for niche, aff in niches.items():
        if airless and niche in EXPOSED and not hardy:
            continue
        parts.append(aff * env.get(niche, 0.0))
    if not parts:
        return 0.0
    best = max(parts)
    score = best + SECONDARY_WEIGHT * (sum(parts) - best)
    return score if score >= MIN_VIABLE else 0.0
