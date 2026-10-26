# Combat balance simulator

An offline re-play of the 1v1 slice of `server/src/routes/combat.js`, used to ask "which stats, skills and
Secondary-slot items actually win fights?" It imports the game's own pure rule modules
(`combatRules.js`, `characterRules.js`, `equipmentRules.js`, `itemRules.js`, `autoCounter.js`) so every
formula, constant and the NPC auto-counter AI are the real ones; only the *flow* (attack roll -> reaction
window -> clash/dodge -> damage -> knockout roll, turn-start ticks, reload/cooldown, hunker, melee) is
re-implemented in `engine.mjs`, without Postgres or the real-time reaction timers. ~0.2 ms per duel.

Nothing here touches the server, the client or the database.

## Run it

```bash
node scripts/combat-sim/selftest.mjs                       # engine vs. the game's own rules (15 checks)
node scripts/combat-sim/trace.mjs "Triple-14 + longsword" "Hardy gunner (DEX+CON 15)" 7   # one fight, blow by blow
node scripts/combat-sim/exp_landscape.mjs                  # every stat pattern x every Secondary vs a random field (~4 min)
python scripts/combat-sim/analyze_landscape.py <out>/landscape_standard_450_default.json
node scripts/combat-sim/exp_paired.mjs set=skills          # one change at a time (proficiencies, armor), same dice
python scripts/combat-sim/analyze_paired.py <out>/paired_skills.json
node scripts/combat-sim/exp_elite.mjs <landscape.json>     # best builds against each other
node scripts/combat-sim/exp_archetypes.mjs                 # hand-built characters, full matchup matrix
SIM_OUT=<dir> bash scripts/combat-sim/run_robust.sh        # same study under other loadouts / distances / play styles
python scripts/combat-sim/analyze_robust.py <dir>
```

Results go to `SIM_OUT` (default `scripts/combat-sim/out/`). Duels are seeded, so every run is reproducible.

## What is held constant

| | |
|---|---|
| Primary blaster | Revolver (+3 acc, 6 slots, reload 3 AP, range 225, speed 113), Fine quality (+2 acc, 8% misfire) |
| Slugs (`catalog.mjs`, `SLUG_POOLS`) | six real default-roster slugs (Frostfire, Crystalyd, Boltling, Sunshard, Gurglet, Galecrow), Friendly loyalty (+2 clash / +2 accuracy); four more in the pack that only a belt lets you chamber |
| Mods | none |
| Fight | 1v1, open ground, start 450 units apart, d20 + DEX initiative, 30-round cap (a draw) |

Varied: the six ability scores (any legal 27-point buy), the five proficiencies, the Secondary item
(`SECONDARIES` in `catalog.mjs`: melee at several damage/AP points, shields, ammo belts, or nothing) and,
in one study, armor.

## How a "player" decides

`policy.mjs`. Every character uses the same policy, so differences come from the build, not the pilot:
fire the slug with the best expected damage per AP, reload when slugs come back, step into a slug's firing
band if the foe is too close/far, close in and swing a melee weapon with spare AP, keep a few AP back for a
counter/Dodge, patch yourself up with Hunker Down when hurt. Reactions (counter-clash / Dodge) are decided by
the game's own `evaluateAutoCounter`, the same forecast the DM's NPCs use. `exp_policy.mjs` picks the default
parameters empirically (best of 96 variants in a round robin). `POLICY_VARIANTS` are alternative styles used by
the robustness check.

## What is and isn't modelled

Modelled: element traits (burn, poison, snare, stun, blind, knockback, douse), Metal's +25%, range penalty,
"too close" and out-of-range fizzles, misfires and pods, the 3-turn slug cooldown + Reload, energy pips,
counter-clash and Dodge, Hunker Down, First Aid, Intimidate, melee (slash bleed / bludgeon shove / pierce vs
shield), shields, armor, knockout pips and saves, burn/poison/bleed ticks, Athletics move speed, Sleight of
Hand reload discount, Acrobatics (Dodge needs a positive modifier).

Not modelled: walls/cover/terrain, more than two combatants (AoE, chain arcs, simultaneous team turns),
mechas, Perception's early-warning, Stealth/Hide, Performance style shots, Fame, loyalty growth, mods, a
second blaster in the Secondary slot, and every per-slug velocity-ability flag outside the list above. Human
reaction time is assumed good enough to always land an auto-counter's chosen reaction.

Unmodelled skills (Perception, Stealth, Performance, Insight, ...) are inert in a duel *by the rules as
written*, not by an oversight; see `RESULTS.md`.
