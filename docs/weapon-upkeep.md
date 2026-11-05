# Weapon repairs and upgrades

Blasters wear down with every shot (`careRules.js`, `wearPerShot`). Keeping them
working, and making them better, now takes **Weapon Parts** as well as an
Engineering roll.

## Weapon Parts

- A personal supply: `characters.weapon_parts`, shown as `weaponParts` on the
  character, in the Pack ledger, in trades (`TRADEABLE_SUPPLIES`) and in the DM's
  purses (`PATCH /api/market/purse/:userId`, `weaponParts`).
- **Not on the shelves by default.** They are a market listing kind, `weapon_supply`
  (`market_listings.template_id` is always 1), which the DM posts for the current world
  with *Post listing > Weapon Parts* (base price 12, optional stock). Players see them on
  the Market's **Parts** tab, beside the ship's supplies, only once they are listed, and
  buy up to 20 at a time.

## Repairs

`POST /api/blasters/:id/repair` still needs a Repair Kit and the same roll (d20 +
Engineering + Workshop bonus above DC 15), and now also **spare parts by the blaster's
quality**: 2 / 3 / 4 / 5 / 6 for Crude / Standard / Fine / Masterwork / Legendary
(`REPAIR_PARTS`). Kit and parts are spent whatever the roll. Without enough parts the
repair is refused and the button is greyed.

## Upgrades

`POST /api/blasters/:id/upgrade` lifts a player's own blaster one quality tier
(`BLASTER_UPGRADES` in `careRules.js`; mirrored in the client's `careData.js`):

| To | Parts | DC |
| --- | --- | --- |
| Standard | 6 | 10 |
| Fine | 10 | 12 |
| Masterwork | 16 | 14 |
| Legendary | 24 | 16 |

- Roll d20 + Engineering (+ the ship's Workshop repair bonus). A total at or above the DC,
  or a natural 20, succeeds and raises `blasters.quality` (more accuracy, fewer misfires,
  slower wear: see `QUALITY_TIERS` in `itemRules.js`). A miss spends half the parts,
  rounded up, and changes nothing. Success spends them all.
- Refused for a broken blaster (mend it first), for a Legendary one, for the DM, and
  while the player is in a live fight.
- Condition is untouched by an upgrade. The result is shown only to the roller (there is
  no table-wide announcement, unlike ship building).

`node scripts/ship-check.mjs` checks the numbers.
