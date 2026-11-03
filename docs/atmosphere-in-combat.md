# Atmosphere in combat

What a world's air, gravity and weather do in a fight. Rules live in
`server/src/atmosphereRules.js` (pure, no DB); `scripts/atmosphere-check.mjs`
checks them.

## Aboard / offboard

Every encounter has a setting the DM picks in staging ("Where is the fight?"):

- **Offboard** (the default): the fight is in the world's own air, gravity and temperature.
- **Aboard**: plain ship air, 21 C, 1 g, no effects.

While the ship is under way a fight is always in ship air, whatever the toggle says
(everyone is inside it; same rule as the climate ladder). The setting is fixed once the
fight starts (`PATCH /api/combat/encounters/:id/aboard`, setup only).

`encounters.aboard` is the DM's toggle; `encounters.atmosphere` is the finished snapshot
(`buildAtmosphere()`), refreshed whenever the toggle changes and again at `/start`, so
travelling mid-staging can't leave it stale. The snapshot also carries the temperature,
and the climate ladder reads it, so an aboard fight at the Threshold is not Lethal. An
encounter with no snapshot (older rows) simply has no effects.

## What each condition does

Derived from the world's survey figures in `planetData.js` (mirrored server-side in
`PLANET_AIR`, `planetRules.js`):

| Condition | Worlds | Effect |
|---|---|---|
| **Zero gravity** (<= 0.05 g) | The Threshold | Walking x2 per AP, knockback x3 |
| **Low gravity** (< 0.5 g) | Drennow Yards, Ossuary Station | Walking x1.5, knockback x2 |
| **Light** (< 0.85 g) | none today | Walking x1.15, knockback x1.25 |
| **Heavy** (> 1.05 g) | 1.1 / 1.15 / 1.2 g worlds | Each 0.1 g over 1: walking -10%, knockback -15% |
| **Vacuum** | Threshold + the two airless Kaeth worlds | Fire slugs can't be fired (or countered with); Air loses its range bonus (falls back to a plain slug's reach); no slug leaves a hazard patch |
| **Haze** (ash / haze / smog) | three Threxa worlds | Light loses its accuracy bonus and its blind; Water slugs leave no hazard patch |
| **Humid** (>= 85%) | steam, spore, salt and toxic worlds | Burns last 1 turn less; Electricity chains x1.5 further |
| **Spores** | the spore world | Plant snares last 1 turn longer |
| **Dry** (<= 15%) | the ash world, the thin cold world | Burns last 1 turn longer; ice patches last 1 round longer |
| **Thin** | same two worlds | The slug *type's* range x0.8 (the weapon's own range is unchanged) |
| **Heat / cold** | by temperature | Ice patches: >= 40 C -2 rounds, >= 25 C -1; <= 0 C +1, <= -40 C +2 (base 4 rounds, min 1) |

Vacuum swallows the other tags. Gravity is separate from all of them.

`atmosphere.effects` holds the same list as readable lines; the setup screen, the active
fight banner and the Wardrobe ("In a fight here") all just print it.

## Where it is applied (`routes/combat.js`)

- Walking: `/actions/move`, on foot only (`walkMultOf`). The client's AP preview
  (`CombatPage.jsx estimateApCost`) reads the same number.
- Knockback: `dealHit` (shots and melee bludgeons) and the mecha ram.
- Fire refused: `/actions/shoot` before any AP/energy is spent, and filtered out of the
  counter-clash options (`launchAndOfferCounter`).
- Range / accuracy: `atmosphereBallistics()` wraps `slugBallistics()` in `/actions/shoot`
  and in `resolveAttackRoll`; the client's range ring uses `atmosphereTypeRange`.
- Hazards: `addIceHazard` and `addDamageHazard` check `hazardBlocked` and log why.
- Burn, snare, blind, chain: `dealHit`, `applyEnvironmentalDamage`, `findChainTarget`.

## Not covered (on purpose, for now)

- Mechas ignore gravity when walking (they have their own speed stat).
- Burn/snare from Panaceon's random statuses and a hazard's burn on a mecha rider use the
  plain lengths in a few spots; mind scramble's "darkness" and a slug's `causes_blind`
  flag still blind in haze (only Light's own trait is scattered).
- "Hazards" means the ice and damage patches. Walls, bridges, pods and zones are unaffected.
- Breathing (suits, filters) isn't modelled.
