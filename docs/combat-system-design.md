# Combat System Design

Status: **draft for review** — nothing in here is implemented yet. This document is the
spec we build from once you're happy with the numbers. All tunable constants live in
one new file (`server/src/combatRules.js`) so retuning later never means hunting
through UI code, matching how `characterRules.js` / `slugRules.js` / `mechaRules.js`
already centralize their numbers.

---

## 1. Scope of this pass

- Slinger-vs-slinger duels **and** mecha combat, on a shared freeform map.
- Reuses existing entities as-is: characters (grit, knockout pips, AP formula already
  defined in `characterData.js`), slugs (clash power/defense, energy pips, AP cost),
  blasters (accuracy, range, magazine, reload cost, quality tier), mechas (speed,
  handling, armor, ramming power, tier).
- New concept: an **Encounter** — a DM-run combat session with a map, a turn order,
  and a set of combatants (player characters, DM-controlled NPCs, and mechas).

## 2. Map model

Freeform vector canvas, not a grid.

- The map is a black canvas of a DM-chosen size (in abstract "map units", e.g. a
  1600×900 space). Tokens sit at continuous `{x, y}` coordinates.
- **Walls** are DM-drawn line segments (`{x1,y1,x2,y2}`), drawn live during setup or
  mid-encounter, broadcast to everyone instantly (same push pattern as the rest of the
  app). Undo/delete supported.
- **Range** is straight-line distance between two tokens, in map units. Every weapon
  and slug type has a max range in the same units.
- **Line of sight**: shooting and movement both raycast against wall segments.
  A wall blocks a shot unless the slug has `breaksWalls` (see §5), in which case the
  wall segment is shortened/removed at the impact point and the shot continues through
  with reduced power (see §5).
- Movement is a **free drag** up to your remaining movement budget for the action,
  also blocked by walls (no walking through them).

## 3. Turn structure & action points

`AP = max(8, 6 + 3 * DEX modifier)`, refills to full at the start of your
turn. Whatever AP you don't spend carries with you until then, and is what
pays for a counter-clash (below) — so spending your whole turn leaves you
unable to react until your next one.

**Initiative**: at encounter start, everyone (players, NPCs, mechas) rolls
`d20 + DEX modifier` (mecha pilots use their own DEX; riderless/DM-puppeted mechas use
a flat `+0`). Sorted descending, ties broken by DEX modifier then randomly. Fixed order
for the whole encounter.

**Actions** (AP cost in parens):

| Action | AP cost | Effect |
|---|---|---|
| Move | 1 per use | Move up to `MOVE_SPEED_PER_AP` (**80** map units) in any direction/path, blocked by walls. Multiple Move actions in a turn chain together. Intentionally independent of `RANGE_SCALE` (shooting range/speed), so retuning one never silently changes the other. |
| Shoot Slug | `slug.apCost` (1–3, already on the slug) | Fire the slug currently chambered in the active weapon's selected magazine slot at a target in range + line of sight. Triggers the counter-clash window (§6) if the target has a loaded slug they can both react with *and* afford (its `apCost` ≤ their leftover AP). |
| Reload | `blaster.reloadApCost` | Chamber a fresh slug into the blaster (swap the active magazine slot's slug), or clear a "jammed" (failed-quality) shot. |
| Swap Active Weapon | 0 (free, once per turn) | Switch which equipped blaster (Primary/Secondary) is active, matching the existing weapon-cycling UI. |
| Hunker Down | 2 | No movement/attack this turn; heal Grit equal to `HUNKER_HEAL` (default **1d4 + CON modifier**, min 1). Cannot be done the same turn you were hit. |
| Mount / Dismount Mecha | 1 | Board or leave a mecha token you're adjacent to (within `MOUNT_RANGE`, default 5 units). |
| Ram (mecha) | 2 | Drive a mecha into an adjacent target; see §8. |
| Free custom action (DM only) | DM sets cost | Escape hatch for narrative actions the system doesn't model. |

The **knockout roll** reaction doesn't consume AP. A **counter-clash** does: firing
a slug to counter costs its `apCost` out of your leftover (unspent) AP, and you can
only counter with a slug you can afford. It still happens on the *attacker's* turn,
but it's no longer free — holding a couple of AP back is how you stay able to react.

## 4. Slug type ballistics

Right now `type` is flavor + a color only — nothing mechanical reads it. This system
gives every type a mechanical identity, applied **on top of** each slug's own
DM-set `clashPower`/`clashDefense`/`apCost` (those stay per-instance; type just adds
modifiers). Types below are exactly the set used in `Slugs - OG Slugs.csv` (your
planned roster) — no more, no less. Two spellings in the CSV (`Pyschic` on Hypnogrif,
`Electricty` on Xmitter) are normalized here to `Psychic`/`Electricity`.

The numbers below are the original relative-scale numbers (kept for readability); the
actual code multiplies every one by `RANGE_SCALE` (currently 25, in `combatRules.js`)
so the *average* combined range lands at ~25 AP worth of walking distance. Relative
spread between types (Air long, Rock/Earth short, etc.) is unchanged by that scale-up.

| Type | Range | Accuracy mod | Power mod | Reaction-speed | Trait |
|---|---|---|---|---|---|
| Air | Long (32) | +2 | +0 | Fast | — (flies true, long-ranged, accurate) |
| Dark | Medium (20) | −1 | +0 | Medium | Phases through walls: ignores line-of-sight blocking (a ghost-shot), doesn't damage the wall |
| Earth | Short (16) | −2 | +1 | Slow | Large knockback, always (doubled if the slug's `causesKnockback` is also set) — see §5 |
| Electricity | Medium (22) | +1 | +0 | Fast | Chains: 50% power hit to one enemy within 8 units of target |
| Energy | Medium (20) | +1 | +0 | Fast | Recharge: on a hit, regain 1 spent energy pip on another of your loaded slugs |
| Fire | Short (18) | +2 | +0 | Fast | Burns: 50% of the slug's own clashPower (min 1) grit dmg/turn, for 3 turns (DoT; doesn't stack — a fresh hit refreshes duration + damage) |
| Healing* | Short (18) | +1 | n/a | Medium | Heals instead of harms |
| Ice | Medium (20) | 0 | +0 | Medium | Leaves an icy hazard patch on the ground at the shot's impact point — see §5 |
| Light | Long (28) | +3 | −2 | Very fast | Blinds: the target's very next attack roll is made with disadvantage (roll twice, take the lower), then the effect is consumed |
| Metal | Medium (18) | 0 | +1 | Slow | Short knockback, always (doubled if the slug's `causesKnockback` is also set) — see §5 |
| None† | Short (10) | −5 | −10 | Slow | Dud — no combat effect |
| Plant | Short (18) | −1 | +0 | Slow | Snares: target can't take the Move action for `SNARE_DURATION_TURNS` (2) of their own turns |
| Psychic | Medium (18) | 0 | −2 | Medium | Stuns: target loses 1 AP on their next turn |
| Toxic | Medium (20) | +1 | −1 | Medium | Poison: +1 grit dmg/turn per stack, for 3 turns; stacks (each poisoning hit adds a stack **and** resets the shared duration back to 3 turns) |
| Unique‡ | — | — | — | — | No default modifiers — fully custom per template |
| Water | Medium (24) | +1 | +0 | Medium | Douses Fire DoT on hit |

Reaction-speed feeds the counter-clash timer in §6 (Fast = short window for the
*defender* to react, Slow = long window; Very fast shrinks it further still).

**Knockback** is a type default for exactly two types — Earth (large,
`KNOCKBACK_LARGE_DISTANCE`) and Metal (short, `KNOCKBACK_SHORT_DISTANCE`) — rather
than something every type can opt into. The per-slug `causesKnockback` flag doesn't
turn knockback on for those two (it's already on); it doubles their type's own
distance instead, so a DM can build a heavier-hitting Rammstone or Armashelt without
changing every other Earth/Metal slug. For every other type, that same flag is what
turns knockback on at all, always at the flat short distance, never doubled. See
`slugKnockbackDistance()` in `combatRules.js`.

**Ice** no longer roots on hit. Instead, firing an Ice slug always leaves a
circular icy patch (`ICE_PATCH_RADIUS` map units) on the ground at the shot's
impact point — regardless of whether it goes on to hit, miss, or get countered —
and that patch persists for the rest of the encounter. Any non-mecha combatant
whose Move destination lands inside one has a flat `ICE_SLIP_CHANCE` (50%) chance
of slipping: the move still happens, but their remaining AP is immediately zeroed
out, ending their turn on the spot. See `findHazardAt()`/`addIceHazard()`.

**Snare** (Plant) is a full movement lock, not an AP surcharge: while
`SNARE_DURATION_TURNS` is still counting down, the Move action is rejected
outright. It ticks down once per the target's own turn (same moment burn/poison
resolve — see below), so a snare landed mid-round blocks movement for that
target's next two turns.

**Burn and poison are real damage-over-time effects**, not an instant bonus to
the triggering hit. Getting burned or poisoned only *flags* the target on the
hit that inflicts it; `tickStatusEffects()` (in `combatRules.js`) applies the
actual damage at the start of each of the target's own next `BURN_DURATION_TURNS`
/ `POISON_DURATION_TURNS` (3 each) turns, called from `advanceTurn`, alongside
snare's countdown.

- **Burn** doesn't stack. Its damage is set once, from the hit that inflicted
  it, as `BURN_DAMAGE_FRACTION` (50%) of that slug's own `clashPower`, rounded
  and floored at 1. A second Fire hit while already burning doesn't add a
  second DoT — it just refreshes the 3-turn clock and recalculates the damage
  off the new hit's own `clashPower` (so a stronger Fire slug replaces a
  weaker burn rather than stacking with it).
- **Poison** stacks instead: each poisoning hit adds a stack (so the per-turn
  damage grows by `POISON_DAMAGE_PER_STACK`) **and** resets the shared
  duration back to the full 3 turns, so keeping a target poisoned means it
  never has a chance to fall off on its own.

\* **Healing** slugs don't attack. A Shoot Slug action with a Healing slug must
target an ally (or yourself) and restores grit equal to `slug.clashPower` instead of
dealing damage. It never triggers a counter-clash — you can't clash-counter being
healed. (Boon Doc.)

† **None**-type slugs (a dud/joke slug) can still be loaded and fired, but always
resolve as a harmless miss — no attack roll needed, 0 damage, no trait. (Flopper.)

‡ **Unique** slugs (webs, grapples, sticky globs, sonic decoys, etc.) don't follow
the standard range/accuracy/power formula. Build their range/accuracy straight off
the slug's own `clashPower`/`clashDefense`/`apCost` with no type modifier, and
hand-adjudicate the special effect described in its Velocity Ability text — or
promote it to a formal trait later if a specific one comes up often enough to
deserve one. (Arachnet, Jellyish, Lariat, Mimiceo.)

`breaksWalls` stays a per-slug boolean column on `slug_templates`/`slugs` (not a
type default) — so a DM can flag a specific slug like Grenuke as wall-breaking
without it applying to every Fire slug. `causesKnockback` is the same column, but
per the knockback rule above it isn't a plain on/off switch for Earth or Metal —
see "Knockback" earlier in this section.

### Environment-shaping actions (Break Wall / Make Wall / Build Bridge)

Three more per-slug boolean flags — `wallMaker`, `bridgeMaker`, and `breaksWalls`
doing double duty — gate three extra choices under the Shoot Slug action, offered
through a small picker (Attack a Slinger / Break a Wall / Make a Wall / Build a
Bridge) the moment a slug with any of the three flags is armed; a plain slug skips
straight to Attack, same as before. The three environment actions target a bare map
point instead of a combatant, use the same misfire/AP/energy/cooldown economy as an
Attack, but resolve differently:

- **Attack a Slinger** is unchanged, except `breaksWalls` no longer lets a shot
  punch through a wall in passing — a wall always fully blocks an Attack now
  (Dark's phase trait aside). Wall-breaking only happens through the dedicated
  action below.
- **Break a Wall**: the slug flies to the clicked point (clamped to range) and
  breaks the *first* wall or bridge its path actually crosses, stopping exactly
  there. A DM-drawn wall only loses a `WALL_BREAK_RADIUS` chunk (same as before);
  a **player-made wall breaks entirely**. If the path is clear, it also checks
  whether the landing point falls inside a bridge and collapses that instead. Dark
  slugs always phase through and never break anything, even if flagged.
- **Make a Wall**: places a `WALL_MAKER_LENGTH`-long line segment at the target
  point, oriented perpendicular to the shot (facing the shooter, like a raised
  shield), tinted to the slug's type color, source-tagged `"slug"` (see Break Wall
  above). Grows in on the client instead of popping up.
- **Build a Bridge**: places a `BRIDGE_WIDTH` × `BRIDGE_LENGTH` rounded rectangle
  at the target point — width runs parallel to the shooter (same orientation as a
  wall), length extends onward, away from the shooter, past the impact point.

All three roll accuracy against a flat `ENV_ACTION_DC` (12) instead of a target's
DEX-based DC (there's no defender here) — normal accuracy formula, just a fixed
number to beat. A miss runs the *exact same* placement/break logic against a point
rotated a few degrees off target (`missDeflection`, same helper an Attack miss
uses) — so a miss can land a wall somewhere else, break the wrong wall, or find
nothing at all.

### AOE Blast

A fifth per-slug boolean flag, `aoeBlast`. On a landed Attack hit, every other
combatant within `AOE_RADIUS` (120 map units) of the primary target's position
takes the same hit too — full `clashPower` and full trait effect each (burn,
poison, knockback, the lot), not halved like Electricity's chain arc. Each splash
hit is its own automatic `dealHit` call: no attack roll, no counter-clash — the
blast either catches you or it doesn't. Only the primary target's hit goes through
the normal roll/counter-clash flow.

A **miss still detonates** — it just goes off wherever the deflected shot actually
landed (`missDeflection`, same point the visual miss uses) instead of on the
target, and whoever's within `AOE_RADIUS` of *that* point takes the blast, which
can still include the original target if the deflection didn't carry the shot far
enough away. A defender-won counter-clash is the one case that doesn't splash — the
attacker's slug never reaches anywhere near the target there, it gets reflected
back the other way.

The client sizes an AOE Blast's explosion burst to `AOE_RADIUS` itself (its own
copy of the number, kept in sync) — visually, the burst *is* the blast radius —
and grows it in from nothing over a short window instead of popping it in at full
size, on a hit **or** a miss, since either way something real just detonated there.

### Hazard Maker

A sixth per-slug boolean flag, `hazardMaker` — generalizes Ice's "leaves a patch on
the ground" pattern (§4) to any type, except this patch actually hurts. On any
Attack shot from a flagged slug, a `type: "damage"` hazard entry appears at the
impact point — same unconditional hit/miss/out-of-range trigger as Ice, tagged with
the firing slug's own type and `clashPower`, `HAZARD_RADIUS` (180 map units).
Persists for the rest of the encounter, same as Ice's patches. Its actual
appearance (the DB write and the broadcast) is deferred to land only once the
shot's flight/explosion animation would have finished playing (see "Delayed
resolution" below), and it grows in from nothing on the client instead of popping
up, same treatment as a Wall Maker's wall.

Any non-mecha combatant whose Move destination lands inside one takes
`HAZARD_DAMAGE_FRACTION` (50%) of that hazard's `clashPower` as Grit damage, plus
that type's Burn or Poison DoT if it has one (Fire/Toxic) — the exact same
`status_effects` fields a real hit from that type would write, so `tickStatusEffects`
picks them up identically. Types without a Burn/Poison trait just deal the flat
residual damage with no bonus status (a Metal or Earth hazard doesn't reach for a
status effect that wouldn't make sense as "standing in terrain," e.g. a repeated
knockback shove).

### Causes Blind / Causes Snare / Causes Shock / Causes Jam

Four more per-slug boolean flags, same "opt a type without this trait by default
into it" pattern `causesKnockback` already established. Added to give a handful of
Velocity Abilities whose flavor text didn't match their assigned type's mechanical
trait (e.g. Tazerling's "stuns targets" on an Electricity slug, whose only trait is
chain) a real effect instead of silently doing nothing beyond the type's own trait.

- **Causes Blind** reuses Light's `blinded` status verbatim (the target's next
  attack roll is made with disadvantage) on any type. Negashade, Sand Angler.
- **Causes Snare** reuses Plant's `snared` status verbatim (Move rejected outright
  for `SNARE_DURATION_TURNS`) on any type. Sand Angler, Polero.
- **Causes Shock** is a *new*, stronger status — distinct from Psychic's `stunned`
  (which only costs 1 AP) — that skips the target's entire next turn: `advanceTurn`
  still runs their start-of-turn bookkeeping (DoT ticks, slug cooldowns tick down,
  the `shocked` flag itself is consumed) but refills their AP to 0 and immediately
  recurses to the next living combatant instead of ever handing them the turn.
  Tazerling.
- **Causes Jam** forces the target's *next* Shoot Slug attempt (any action type) to
  misfire — reuses the existing quality-tier jam outcome exactly (wastes the AP and
  energy pip already spent, no shot leaves the barrel, self-consuming). Unlike
  Blind/Snare/Shock it fires on a landed **hit or an ordinary miss alike** — the
  disabling field reaches the target either way — but never on the attacker's own
  misfire (the shot never left the barrel to begin with) and never on a shot that
  fell short out of range (it never got near them). Slicksilver, Xmitter, Hexlet.

None of these four apply to mecha targets (no blaster/attack-roll concept exists
for Structure). All four are struck by a counter-clash outcome exactly like a
normal hit, since clash resolution (§6) routes through the same `dealHit`.

### Slug return-to-hand cooldown

A fired slug (shot, or used as a counter) is away in flight/recovering — it can't
be fired again until it's counted down through `SLUG_RETURN_TURNS` (3) of its
owner's own turns, independent of and on top of its energy pips (which model ammo,
not "is the slug physically here to load"). The cooldown starts the moment the slug
actually leaves the blaster (`spendEnergyPip()`, which also spends the pip), ticks
down by one at the start of each of the owner's own turns (`tickSlugCooldowns()`,
called from `advanceTurn`), and blocks both firing it again and offering it as a
counter-clash option while it's still counting down. Ending the encounter clears
every combatant's outstanding cooldowns, so nobody carries a stale one into the
next fight.

## 5. Shooting resolution

1. Range/LoS check: target must be within `blaster.range + type.range` combined
   (simplify: use the **larger** of the two, since the blaster is what actually
   launches the slug) and not blocked by a wall the slug can't break or phase
   through (Dark).
2. Attack roll: `d20 + blaster.accuracy + quality.accuracyBonus + type.accuracyMod +
   loyaltyAccuracyModifier(slug.loyaltyTier)` vs a target DC of `10 + target DEX
   modifier + range penalty` (range penalty: −1 per `RANGE_PENALTY_STEP`, default 8
   units, past half the weapon's range). See "Loyalty tier modifiers" below for the
   last term. Roll the quality tier's `failRate` first (jam chance) — a jam wastes
   the shot and the AP but the magazine slot needs a Reload to clear.
3. If the target has an available (energy-charged) loaded slug and hasn't already
   used their counter this round, open the counter-clash window (§6) **before**
   rolling the attack — a successful counter can win outright regardless of the
   attack roll.
4. On a hit with no counter: grit damage = `slug.clashPower + type.powerMod`, where
   `slug.clashPower` already has `loyaltyClashModifier(slug.loyaltyTier)` folded in
   (see "Loyalty tier modifiers" below) — applied to target's current Grit. Trait effects (burn/poison/snare/chain/blind/
   knockback) apply per the table above — burn/poison/snare only *flag* the target
   here; their actual effect lands later (§4). A **miss** doesn't fly dead-on to the target and
   just fizzle there (used to read as a hit that inexplicably did nothing) --
   `missDeflection()` rotates the true impact point a few degrees around the
   attacker (`MISS_DEFLECTION_DEG = 12`, random left/right, same distance),
   and the `combat-shot-resolved` broadcast carries that point so the bolt
   visibly goes wide instead. The deflected ray gets its own wall check
   (the true path being clear doesn't guarantee the rotated one is) --
   otherwise a miss could visibly clip straight through a wall. The map also
   gets a brief gold/yellow border
   flash on a miss (`combat-map-wrap--miss`, no shake) -- the same treatment
   as the misfire's red border flash, minus the screen shake, since a clean
   whiff isn't a mechanical failure.
5. If the slug's wall-breaking flag is set and the shot's path crosses a wall: the
   wall segment is removed within `WALL_BREAK_RADIUS` (default 24 units) of the
   impact point, and the shot continues to its target at half power. The break
   itself (mutation + broadcast + its own Combat Log line) is deliberately
   **delayed** to match how long the projectile's flight animation would take to
   actually reach that point in space (`windowMs * SHOT_FLIGHT_MULTIPLIER *`
   the wall hit's fraction along the shot's path) — not applied instantly on
   resolution, so the wall doesn't vanish before the bolt visually gets there.
6. If the hit connects and `slugKnockbackDistance(type, causesKnockback)` (§4's
   "Knockback" note) is greater than 0, the target is shoved that many units
   directly away from the shooter — `KNOCKBACK_SHORT_DISTANCE` (16) for Metal,
   `KNOCKBACK_LARGE_DISTANCE` (32) for Earth, either doubled if `causesKnockback`
   is also set, or `KNOCKBACK_SHORT_DISTANCE` for any other type with
   `causesKnockback` set. Same fix as wall-breaking (§5): the destination and hit-wall check are computed
   immediately, but the actual position change (and the broadcast that moves
   the token) is **delayed** to `windowMs * SHOT_FLIGHT_MULTIPLIER` after
   launch (`scheduleKnockback`) — so the shove lands when the client's
   explosion burst is actually showing, not before the projectile visually
   arrives. The knockout-roll consequence of hitting a wall, if any, still
   fires **immediately**, independent of whether Grit hit 0 — that's a
   separate mechanic (a DC save prompt) whose sequencing against the
   grit-hits-0 roll depends on staying synchronous.

**Delayed resolution.** Wall-breaking and knockback aren't special cases anymore —
the whole outcome of a Shoot Slug action (or a counter-clash's resolution, once one
is chosen) is split into two parts, same idea as the launch/resolve broadcast split
in §6:

- **The roll happens immediately** — the attack roll (or the clash's power/defense
  comparison), and the `combat-shot-resolved` reveal telling every client which way
  the shot actually went (hit/miss/out-of-range, or which side won the clash). This
  is "the direction" — safe to know and broadcast right away, since the client
  controls when its own animation actually *shows* that reveal (it always waits for
  its local flight clock to catch up, per §6's animation notes).
- **Applying the outcome is delayed** to `firedAt + windowMs * SHOT_FLIGHT_MULTIPLIER`
  of real time (`scheduleAfterFlight`) — Grit damage, status effects (burn, poison,
  snare, stun, blind), hazard placement, ejects, the Combat Log entry describing
  what happened, and the encounter broadcast that pushes it all to every client. If
  the resolution happens early (a defender counters well before their window
  closes), it still waits out the rest of the flight; if it happens at or after
  that point (the counter timeout, a normal uncontested hit), there's nothing left
  to wait for.

So nobody's Grit bar, status badges, or the Combat Log update before the burst
that's supposed to explain them has actually played — the roster and the map stay
in sync.

### Loyalty tier modifiers

A slug's loyalty tier (0-4: Wild, Indifferent, Friendly, Loyal, Bonded) isn't just
flavor — it shifts the slug's own effective Clash Power/Defense, and its shooter's
accuracy, everywhere in combat:

```
tier:                0        1             2          3       4
label:               Wild     Indifferent   Friendly   Loyal   Bonded
clash modifier:      -2       0             +2         +4      +6
accuracy modifier:   -2       0             +2         +3      +5
```

Tier 1 ("Indifferent") is the neutral baseline (both modifiers 0) — a slug that
hasn't been bonded with performs exactly per its base stats. Tier 0 ("Wild")
actively works against you, below that baseline. The clash modifier is applied to
*both* Clash Power and Clash Defense equally, and can push either stat above
`CLASH_POWER_MAX`/`CLASH_DEFENSE_MAX` (10) once added to an already-maxed base
stat — that's intentional, not a bug, since it's the whole point of bonding with a
slug. The accuracy modifier folds into the attack roll (§5) exactly like
`blaster.accuracy`/`quality.accuracyBonus`/`type.accuracyMod` already do.

Implementation-wise, this is applied exactly once server-side, right where a raw
slug row first enters combat math (`applyLoyaltyToSlug` in `combatRules.js`, called
from `resolveShooterSlugAndBlaster`/`findEligibleCounterSlugs` in
`routes/combat.js`) — everything downstream (grit damage, burn/poison/cone/hazard/
pod damage, the clash power/defense comparison in §6, the counter-offer prompt's
own PWR/DEF display) just reads `clash_power`/`clash_defense` normally and gets the
effective number for free, including through Emberblade's clash-tripling, which
multiplies whatever it's handed.

## 6. Counter-clash

When you're the target of a Shoot Slug action and you have a charged, loaded slug
you can afford, a countdown window opens on your screen: pick a slug to fire back,
or let it expire (no counter — the shot resolves as a normal hit per §5).

**Cost**: countering with a slug spends its `apCost` out of your leftover (unspent)
AP, on top of the energy pip below. Only slugs whose `apCost ≤ your current AP` are
offered; if you can't afford any, no window opens at all. This is why the AP formula
(§3) is generous — you're expected to hold a few points back each turn to stay able
to react.

**Window duration** is now a flat constant, the same for every shot — no more
type/quality/dex-driven variability:
```
SHOT_SOUND_MS          = 1830ms   // slugterra-velocity.mp3's actual length
SHOT_TRANSFORM_LEAD_MS = 1000ms   // transforms this much before the sound ends
SHOT_SLOW_PHASE_MS     = SHOT_SOUND_MS - SHOT_TRANSFORM_LEAD_MS   // 830ms
SHOT_FAST_PHASE_MS     = 2500ms   // fixed "transformed" burst after the slow start
SHOT_FLIGHT_MS         = SHOT_SLOW_PHASE_MS + SHOT_FAST_PHASE_MS   // 3330ms
COUNTER_WINDOW_MS      = SHOT_FLIGHT_MS   // 3330ms
```
Explicit targets the DM asked for: the slug crawls out slowly, then
"transforms" and covers the rest of the distance in a flat burst — while the
launch sound is still playing for its last second, not waiting for the sound
to finish first. The reaction window now runs the *entire* fixed flight
total (3330ms), by construction — a defender can wait right up until the
shot would actually land, and never past it.

On the client, a shot's flight animation always plays for
`windowMs * SHOT_FLIGHT_MULTIPLIER` (currently 1, since the window now *is*
the flight time), regardless of when the server actually resolves it — so a
clash always lands visually right at the end of the flight, right as the
reaction window would have closed, even if the defender responds early.

**The launch and the resolution are two separate broadcasts now**, both keyed
by the same `fxId`. This matters: a shot that offers a counter can take up to
`windowMs` of *real* time to actually resolve (early defender response, or the
full timeout), but the bolt needs to start flying and the sound needs to play
the instant the attacker fires — not once the outcome is finally known.
  - `combat-shot-fx` (`outcome: null`) fires immediately when the shot is
    fired, for every non-jam shot. This is what starts the client's
    `ShotEffect` (and its sound) — it renders as an ordinary, uncountered
    flight toward `impactPoint` until told otherwise.
  - `combat-shot-resolved` arrives later — immediately for an
    out-of-range/uncontested shot, or once the counter window actually closes
    for one that offered a counter — carrying `{outcome, countered,
    counterSlugType}`. The client merges this into the *same* in-flight shot
    (matched by id) without restarting its animation clock, so the reveal
    (miss/hit/clash) lands seamlessly on top of whatever's already playing.
  - A **jam** is the one exception: it's rolled up front, before any launch,
    since a misfire never leaves the barrel and a defender should never be
    offered a counter for a shot that was never really coming. It's a single,
    fully self-contained `combat-shot-fx` broadcast (`outcome: "jam"`) — no
    sound, no flight, just the misfire spark + screen shake.

This also fixes wall-breaking timing for a countered shot specifically:
`scheduleWallBreak`'s delay is anchored to `offer.firedAt` (the real moment
the launch went out), with however much real time has already passed
subtracted back out — not re-anchored to whenever `dealHit` happens to run,
which for a countered shot can be well after launch.

The flight itself isn't constant-speed: the slug crawls out slowly for
`SHOT_SLOW_PHASE_MS` (or the whole leg, if the leg resolves faster than that
— only possible for the countered pre-clash leg, whose duration is half the
total rather than the full slow+fast budget), covering only
`SLOW_PHASE_DISTANCE_FRACTION` (20%) of the distance, then "transforms" and
blazes through the remaining 80% over a flat `SHOT_FAST_PHASE_MS` burst.
Only the first leg of a flight gets this slow start (the launch sound only
plays once) — a post-clash continuation (attacker-wins/defender-wins after a
clash) is already up to speed and animates at constant velocity. A pure
linear ramp from 0 has zero initial velocity, so the first several frames
would barely clear the attacker's own token — reading as "the sound plays but
nothing is flying yet." `LAUNCH_KICK_FRACTION` (8%) fixes that: the bolt pops
that far out the instant the leg starts, then eases through the rest of the
slow phase, so the launch reads as visibly simultaneous with the sound. See
`phasedFraction()` in `CombatMap.jsx`, mirrored by `SHOT_SLOW_PHASE_MS`/
`SHOT_FAST_PHASE_MS`/`COUNTER_WINDOW_MS` in `combatRules.js`.

**Resolution**, once a counter slug is chosen (or the window lapses with no counter):

- **No counter** → normal hit resolution, §5.
- **Counter chosen** → mutual clash (both sides' `clashPower`/`clashDefense` already
  include their own loyalty tier's modifier — see "Loyalty tier modifiers" above):
  - `attackerWins = attacker.clashPower > defender.clashDefense`
  - `defenderWins = defender.clashPower > attacker.clashDefense`
  - Both true → **double break**: both slugs bounce off, no damage either way, both
    slugs spend an energy pip and are ejected from their magazine slots.
  - Only attacker wins → defender takes the hit per §5 damage rules; defender's
    counter slug is ejected/spent for nothing.
  - Only defender wins → **reflected**: attacker takes the damage instead, using the
    defender's slug's power/type; attacker's original slug is ejected.
  - Neither wins → clean **clash bounce**: no damage to either side, both slugs
    spend an energy pip.
- Both participating slugs always spend one energy pip on a counter attempt
  (clash is taxing), regardless of outcome.

The whole exchange (attack → counter window → resolution) is logged to the
dedicated **Combat Log** panel (below the Turn Order roster, scoped to the
active encounter) — not Party Chat, so combat doesn't spam the table's regular
conversation. See §9's `combat-log-entry` note.

A shot that actually leaves the blaster (any outcome except a jam/misfire)
also plays a launch sound (`slugterra-velocity.mp3`) on every client.

## 7. Grit, knockout, unconsciousness

- Grit hits 0 → if the character has any unused knockout pip, a **Knockout Roll**
  prompt opens for that player (same offer/resolve pattern as the existing dice-roll
  prompt): a Constitution save, `d20 + CON modifier` vs `DC = 10 + pips already used`
  (escalating — the second time is harder than the first).
  - Success → mark the next knockout pip used, heal current Grit to max, character
    stays in the fight.
  - Failure → character falls **unconscious**: removed from the initiative order
    until healed/revived by another player's action (medicine check or an item),
    can't act or be targeted by ranged slug attacks (melee/coup-de-grace out of
    scope for this pass).
- Grit hits 0 with **no** knockout pips left → automatic unconscious, no roll.
- Knockback into a wall (§5) triggers this same roll immediately, even if Grit is
  still above 0 — a hard wall impact can knock you out on its own.

## 8. Mecha combat

Mechas don't have Grit; they get a derived **Structure** pool instead, and armor acts
as flat damage reduction rather than an HP multiplier (keeps `armor` meaningful at
every tier without a second stat to invent):

```
maxStructure = 20 + armor * 4 + tier * 5
```

- A mecha token moves at `speed * MECHA_SPEED_UNIT` (default 12) map units per Move
  action AP spent — faster than characters, matching the fiction.
- **Ram** action (2 AP): drive into an adjacent enemy (character or mecha). Attack
  roll `d20 + handling` vs `10 + target evasion` (target DEX mod, or target mecha's
  handling if it's a mecha). On hit: damage = `rammingPower * 2`, reduced by the
  target's armor if it's a mecha, applied to Structure (mecha target) or Grit
  (character target, halved and always triggers a knockback-into-wall check —
  getting rammed by a mecha throws you). The ramming mecha takes `targetRammingPower`
  (or half, for a character target) back as its own Structure damage — a head-on
  hit costs both sides.
- Riding as a passenger doesn't grant extra AP; a passenger can still Shoot Slug from
  a mount as long as the mecha didn't also Ram that turn (one "big" action per mecha
  per turn: either it rams, or its passengers act individually — keeps a mecha from
  being strictly better than dismounting).
- Structure at 0 → mecha is disabled (can't move/ram this encounter); passengers are
  dismounted in place and each immediately makes a knockback-style knockout roll
  check (a wrecked mecha throws its riders).
- Mecha `tier` breakdown chance (already defined in `mechaRules.js`) is rolled once
  per Ram action as a mechanical-failure check on top of the attack roll — high-tier
  mechas rarely misfire.

## 9. Data model additions

New tables (Postgres, same style as the rest of `db.js`):

```sql
CREATE TABLE encounters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'setup',      -- setup | active | finished
  map_width INTEGER NOT NULL DEFAULT 1600,
  map_height INTEGER NOT NULL DEFAULT 900,
  walls JSONB NOT NULL DEFAULT '[]',         -- [{id,x1,y1,x2,y2}]
  turn_order JSONB NOT NULL DEFAULT '[]',    -- [combatantId, ...]
  active_turn_index INTEGER NOT NULL DEFAULT 0,
  round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE combatants (
  id SERIAL PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                        -- character | npc | mecha
  ref_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- for kind=character
  ref_mecha_id INTEGER REFERENCES mechas(id) ON DELETE SET NULL, -- for kind=mecha
  name TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  current_ap INTEGER NOT NULL DEFAULT 0,
  current_grit INTEGER,                      -- null for mecha
  current_structure INTEGER,                 -- null for character/npc
  knockout_pips JSONB,                       -- null for mecha
  unconscious BOOLEAN NOT NULL DEFAULT false,
  initiative INTEGER NOT NULL DEFAULT 0,
  mounted_on INTEGER REFERENCES combatants(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}',          -- npc-only stat overrides
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS breaks_walls BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE slug_templates ADD COLUMN IF NOT EXISTS causes_knockback BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE slugs ADD COLUMN IF NOT EXISTS breaks_walls BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE slugs ADD COLUMN IF NOT EXISTS causes_knockback BOOLEAN NOT NULL DEFAULT false;
```

One **active encounter at a time** (like the existing SlugHunt/Challenge panels) is
enough for a single table's DM — no need for concurrent encounters.

## 10. Real-time architecture

Reuses the app's existing patterns exactly, nothing new to invent:

- `broadcastAll` pushes map/turn/combatant state (wall drawn, token moved, turn
  advanced, shot fired) to everyone — same as `chat-message`/`mecha-updated` today.
- Short-lived reactive moments (counter-clash offer, knockout-roll offer) use the
  **in-memory pending-offer map + REST resolve** pattern from `diceRoll.js`
  (`pendingRolls` → here, `pendingCounters` / `pendingKnockoutRolls`), not new DB
  tables — they're single-use and time-boxed by nature.
- `AccessSocket.jsx`'s `LiveStateContext` gets a handful of new message types:
  `encounter-started`, `encounter-updated` (walls/turn/combatants), `counter-offered`,
  `combat-shot-fx` (flight animation), `knockout-roll-offered`, and
  `combat-log-entry` — a dedicated, per-encounter play-by-play feed, entirely
  separate from Party Chat. Backed by its own `combat_log` table (id,
  encounter_id, body, created_at); `GET /api/combat/encounters/:id/log` loads
  history on mount, new entries arrive live over the socket. Rendered by
  `CombatLog.jsx`, placed directly below the Turn Order roster.

## 11. Build phases

1. **Rules + schema** — `combatRules.js`, new tables/columns, no UI.
2. **Encounter shell** — DM creates/starts an encounter, map canvas renders walls
   (draw/erase), tokens placeable/draggable, turn order + AP display, Move and
   Hunker Down actions working end-to-end.
3. **Shooting** — range/LoS raycasting, attack roll, grit damage, wall-break,
   knockback.
4. **Counter-clash** — the timed reaction window and clash resolution.
5. **Knockout flow** — the roll prompt, unconscious state, revival.
6. **Mecha combat** — Structure pool, mounting, Ram action.

Each phase is independently testable and playable before moving to the next.

---

### Open numbers worth double-checking before I build

Everything above is a reasonable default, but these are the ones most likely to need
your house-rule instinct:

- `MOVE_SPEED_PER_AP = 80` map units, mecha at `12×speed` — depends entirely on how
  big you draw maps; easy to retune once you see a real map.
- Counter-clash `BASE_WINDOW = 3200ms` — is a few seconds the right feel, or should
  it be snappier/more forgiving?
- Knockout DC escalation (`10 + pips used`) and Hunker Down heal (`1d4 + CON`) — both
  arbitrary, said so you can veto.
