# Outfits, climate, illness and Meds

Clothes matter now. Every world has a surface temperature; every outfit has a
range it is comfortable in. Stand outside that range and combat gets harder, and
sleeping there can make you ill.

## Outfits

- A text-only **Wardrobe** panel on the player's Inventory page (`Wardrobe.jsx`).
  Exactly one outfit is worn at all times; **Wear** swaps. It can't change while the
  player is in a live fight (the fight snapshots it at the start).
- Stats an outfit can carry: comfort range (C), extra max Grit, walking distance %
  (bulky is negative), AP per turn, accuracy. The Grit rides on `characters.grit_bonus`
  together with worn armor (`syncArmorGrit` in `ammoBelt.js`).
- Tables: `outfit_templates` (catalog), `outfit_template_planets` (which worlds sell
  it), `outfits` (a player's own copy, one worn via a partial unique index, one per
  template per player). Outfits are **not** `equipment` rows.
- Everyone starts in the **Museum Tour Outfit** (`starter`, never sold): given in
  `POST /api/characters`, and by `giveStarterOutfits()` at boot to anyone with no outfit.
- The DM sees and edits wardrobes in `DMWardrobe.jsx` (Inventory page): grant from the
  catalog, take away. There is no template editor; to change the catalog edit
  `server/src/data/defaultOutfits.js`. Seeding is insert-if-missing by name, so edits to
  an existing row reach a database only by changing it by hand.

## Where they are sold

Standing market stock, per world. `soldOnWorlds()` in `seedDefaultOutfits.js` decides at
seed time: a world may stock an outfit if its temperature is within the comfort range
widened by 6 C, and a fixed per-world roll then decides (70% when inside the range, 35%
just outside) so neighbouring worlds differ. Worlds colder than -60 C skip the roll. The
**EVA Space Suit** (any temperature, walking -50%, AP -2, +10 Grit) is sold everywhere.
`outfit:<id>` market keys; `POST /api/market/hidden` can pull one from a shelf.
`node scripts/outfit-check.mjs` verifies the catalog and stock (every world sells at
least 3, only the Space Suit survives The Threshold, ...).

## The climate ladder (`server/src/outfitRules.js`, mirrored in `client/src/outfitData.js`)

Degrees outside the comfort range (after Fortitude) set a tier. Applied when a fight
starts, in this order: outfit stats, tier, illness.

| Outside | Tier | In a fight | Illness at long rest |
|---|---|---|---|
| 0 | Comfortable | none | 0% |
| 1-4 | Uncomfortable | reload +1 AP | 10% |
| 5-9 | Strained | reload +1, accuracy -1, walking -10% | 25% |
| 10-19 | Harsh | AP x0.75, max Grit x0.75, reload +1, accuracy -2, walking -20% | 45% |
| 20-34 | Severe | AP x0.5, max Grit x0.5, reload +2, accuracy -3, walking -35% | 70% |
| 35-54 | Brutal | AP x0.25, max Grit x0.25, reload +3, accuracy -5, walking -50% | 90% |
| 55+ | Lethal | 1 AP per turn, max Grit 1, walking -75% | 90% |

World temperatures are `PLANET_TEMPS` in `planetRules.js` (a mirror of each world's
`facts.temperatureC` in `planetData.js`: keep them in step; the check script compares).
While the ship is under way everyone is at 21 C. **Fortitude** (CON skill) stretches
every outfit's range by 5 C at both ends per point of modifier (never narrows).

Combat plumbing: `characterGearSnapshot()` in `routes/combat.js` builds `max_ap`,
`max_grit` and `data.gear` when a character is added to the lobby **and** again at
`/start`. `gearMoveMult` / `gearAccuracyMod` / `gearReloadAp` / `gearDisadvantage`
(`combatRules.js`) read it at the move, reload, melee, ranged and environment-shot sites.
`data.gear` is deliberately not a status effect, so First Aid can't cure it. A Lethal
fight leaves `current_grit` at 1 until the next long rest.

## Illness and Meds

- **Long rest** (`routes/characters.js`, after `advanceDay()`): each rested, healthy
  character rolls the tier's illness chance for the world (or ship) they are on. Failing
  sets `characters.ill`. The sleep overlay tells them.
- **Ill in a fight:** max Grit, AP **and** accuracy are halved when the fight begins
  (accuracy = every attack roll at disadvantage, cancelling keen vision's advantage).
  Outside a fight nothing changes.
- **Meds** (a market supply, `characters.meds`): one dose per long rest from the
  Consumables page, only while ill, three rests in a row (`meds_streak`). The third dose
  clears the illness at once. A long rest with no dose resets the run to 0
  (`meds_taken` marks today's dose and is cleared at every rest).
