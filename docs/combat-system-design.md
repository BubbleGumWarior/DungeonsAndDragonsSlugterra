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
- **The map's outer edge is a wall.** Four invisible segments (`mapEdgeWalls` in `combatRules.js`) are added to the DM's walls wherever a body moves -- Move, knockback, grapple, dodge sidestep, flee, wall-run landing, ram throw -- so nobody can walk, be shoved or be reeled off the board. They're never stored (they follow the map size), can't be deleted or broken, and shots ignore them. Every position write is also clamped `MAP_EDGE_INSET` (1) unit inside the map (`updateCombatant`), so nobody ever rests exactly on the edge. A delayed knockback re-checks walls when it lands, so a wall raised mid-flight still stops it. The DM roster has a **Reset position** button that teleports a combatant (and any mecha/riders paired with them) to the center of the map.
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

**Simultaneous turns**: combatants on the same team (see `combatSide`) who sit next
to each other in the initiative order act *at the same time* as one phase. Everyone
in the phase starts their turn together (AP refill, status ticks) and can act in any
order; each presses **End Turn** for themselves, and play only passes to the next
team once the last of them is done. A defender being shot at by several teammates at
once gets several counter prompts but only so much AP and so little time to answer
them. Fallen combatants are skipped without breaking a run, and a phase never
straddles the end of a round. Stored as `encounters.active_group` (the ids still to
act); `activeCombatantIds` on the client encounter.

**Actions** (AP cost in parens):

| Action | AP cost | Effect |
|---|---|---|
| Move | 1 per use | Move up to `MOVE_SPEED_PER_AP` (**80** map units) in any direction/path, blocked by walls. Multiple Move actions in a turn chain together. Intentionally independent of `RANGE_SCALE` (shooting range/speed), so retuning one never silently changes the other. |
| Shoot Slug | `slug.apCost` (1–3, already on the slug) | Fire the slug currently chambered in the active weapon's selected magazine slot at a target in range + line of sight. Triggers the counter-clash window (§6) if the target has a loaded slug they can both react with *and* afford (its `apCost` ≤ their leftover AP). |
| Reload | `blaster.reloadApCost` (flat, one action) | Re-chamber **every** slug in the active weapon that has returned to hand but is sitting unloaded (`loaded = false`, cooldown done — see §4's return-to-hand cooldown), and clear any "jammed" (failed-quality) shot. |
| Swap Active Weapon | 0 (free, once per turn) | Switch which equipped blaster (Primary/Secondary) is active, matching the existing weapon-cycling UI. |
| Melee | weapon's own AP (default 2) | Swing the melee weapon equipped in the Secondary slot at a hostile target within its reach (default `MOUNT_RANGE`, 80 units; no walls in the way). Hit roll `d20 + STR modifier (+ the weapon's accuracy)` vs `10 + target DEX modifier` (a mecha's handling for a mecha); a hit deals `weapon damage + STR modifier` (min 1) Grit/Structure through the normal damage path, as a plain "None"-element hit. No reaction window -- no counter-clash or dodge. Blinded / keen-vision effects are consumed by the swing like a shot. See "Melee & equipment" below. |
| Hunker Down | **all remaining AP** | Sinks every remaining AP into a heal — a flat **`max(1, CON modifier)` Grit per AP spent**, no roll. Ends the turn. Cannot be done the same turn you were hit. The client asks for confirmation first whenever more than 1 AP would be spent. |
| Mount / Dismount Mecha | 1 | Board or leave a mecha token within `MOUNT_RANGE` (**one Move's worth of walking**, `MOVE_SPEED_PER_AP` units). While armed, the map shows the range ring and highlights every in-range mecha. |
| Ram (mecha) | 2, **from the mecha's AP** | Drive a mounted mecha into a target in `MOUNT_RANGE`; happens on the *rider's* turn. An unmounted mecha cannot ram. See §8. |
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

Ranges below are halved from their original tuning (Air was 32, Earth was 16, etc.)
-- a deliberate rebalance against the blaster base-type ranges in `itemRules.js`
(also rescaled up, Sniper Rig now topping out at 450), since a type's own range and
the equipped weapon's own range now *stack* into the shot's actual reach (§5's
`combinedRange = blaster.range + type.range`) rather than either alone deciding it.

| Type | Range | Accuracy mod | Power mod | Reaction-speed | Trait |
|---|---|---|---|---|---|
| Air | Long (16) | +2 | +0 | Fast | — (flies true, long-ranged, accurate) |
| Dark | Medium (10) | −1 | +0 | Medium | Phases through walls: ignores line-of-sight blocking (a ghost-shot), doesn't damage the wall |
| Earth | Short (8) | −2 | +1 | Slow | Large knockback, always (doubled if the slug's `causesKnockback` is also set) — see §5 |
| Electricity | Medium (11) | +1 | +0 | Fast | Chains: 50% power hit to one enemy within 8 units of target. **Also fries mechas** — every point of damage that lands on a mecha's Structure (a direct hit, or the 75% a mounted rider's mecha soaks) is doubled (`ELECTRIC_MECHA_DAMAGE_MULTIPLIER`); the rider's own share of a split hit is *not* doubled |
| Energy | Medium (10) | +1 | +0 | Fast | Recharge: on a hit, regain 1 spent energy pip on another of your loaded slugs |
| Fire | Short (9) | +2 | +0 | Fast | Burns: 100% of the slug's own clashPower (min 1) grit dmg/turn, for 3 turns (DoT; doesn't stack — a fresh hit refreshes duration + damage) |
| Healing* | Short (9) | +1 | n/a | Medium | Heals instead of harms — **double** the slug's clashPower (`HEAL_POWER_MULTIPLIER`) |
| Ice | Medium (10) | 0 | +0 | Medium | Leaves an icy hazard patch on the ground at the shot's impact point — see §5 |
| Light | Long (14) | +3 | +0 | Very fast | Blinds: the target's very next attack roll is made with disadvantage (roll twice, take the lower), then the effect is consumed |
| Metal | Medium (9) | 0 | +1 | Slow | Short knockback, always (doubled if the slug's `causesKnockback` is also set) — see §5. **+25% damage** (`METAL_UNCOUNTERED_MULTIPLIER`) on any hit that wasn't the outcome of a counter-clash |
| None† | Short (5) | 0 | +0 | Slow | A plain hit — no type benefits, but no penalties either |
| Plant | Short (9) | −1 | +0 | Slow | Snares: target can't take the Move action on their next turn (`SNARE_DURATION_TURNS` is 2 because the countdown ticks at the start of that turn) |
| Psychic | Medium (9) | 0 | −2 | Medium | Stuns: target loses AP equal to 50% of the damage the hit dealt (min 1) on their next turn (`STUN_AP_FRACTION`); stuns from several hits add up |
| Toxic | Medium (10) | +1 | −1 | Medium | Poison: +1 grit dmg/turn per stack; stacks with each poisoning hit and **never wears off** until First Aid cures it |
| Unique‡ | — | — | — | — | No default modifiers — fully custom per template |
| Water | Medium (12) | +1 | +0 | Medium | Douses Fire DoT on hit, and soaks 1 energy pip from a random one of the target's slugs (any loaded in a blaster with a live pip) |

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
circular icy patch (`ICE_PATCH_RADIUS` map units) on the ground where the bolt
actually came to rest — dead on the target for a hit, out at the deflected wide
point for a miss, the clash point for a countered shot, the fizzle point for one
that fell short — and that patch fades after 4 rounds (`HAZARD_DURATION_ROUNDS`). It never
lands on a target the shot visibly sailed past. Any non-mecha combatant
whose Move destination lands inside one has a flat `ICE_SLIP_CHANCE` (75%) chance
of slipping: the move still happens, but their remaining AP is immediately zeroed
out, ending their turn on the spot. See `findHazardAt()`/`addIceHazard()`.

**Snare** (Plant) is a full movement lock, not an AP surcharge: while
`SNARE_DURATION_TURNS` is still counting down, the Move action is rejected
outright. It ticks down once per the target's own turn (same moment burn/poison
resolve — see below), so a snare landed mid-round blocks movement for exactly
that target's next turn (the constant is 2 because the first tick happens at the
start of that turn).

**Burn and poison are real damage-over-time effects**, not an instant bonus to
the triggering hit. Getting burned or poisoned only *flags* the target on the
hit that inflicts it; `tickStatusEffects()` (in `combatRules.js`) applies the
actual damage at the start of each of the target's own next `BURN_DURATION_TURNS`
(3) turns — and, for poison, every turn until cured — called from `advanceTurn`,
alongside snare's countdown.

- **Burn** doesn't stack. Its damage is set once, from the hit that inflicted
  it, as `BURN_DAMAGE_FRACTION` (100%) of that slug's own `clashPower`, rounded
  and floored at 1. A second Fire hit while already burning doesn't add a
  second DoT — it just refreshes the 3-turn clock and recalculates the damage
  off the new hit's own `clashPower` (so a stronger Fire slug replaces a
  weaker burn rather than stacking with it).
- **Poison** stacks instead: each poisoning hit adds a stack (so the per-turn
  damage grows by `POISON_DAMAGE_PER_STACK`). It has no expiry: it ticks every
  turn until someone cures it with First Aid (`poison` is in `NEGATIVE_STATUS_KEYS`).

\* **Healing** slugs don't attack. A Shoot Slug action with a Healing slug must
target an ally (or yourself) and restores grit equal to `slug.clashPower × HEAL_POWER_MULTIPLIER` (2) instead of
dealing damage. It never triggers a counter-clash — you can't clash-counter being
healed. (Boon Doc.)

† **None**-type slugs have no type trait, but they're an ordinary attack otherwise:
normal accuracy, normal power, normal clash and counter rules. (Flopper.)

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
Attack shot from a flagged slug, a `type: "damage"` hazard entry appears where the
bolt actually came to rest (same rule as Ice above — target on a hit, the
deflected wide point on a miss, the clash/fizzle point otherwise), tagged with
the firing slug's own type and `clashPower`, `HAZARD_RADIUS` (180 map units).
Fades after 4 rounds (`HAZARD_DURATION_ROUNDS`), same as Ice's patches. Its actual
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
  (which only costs some AP) — that skips the target's entire next turn: `advanceTurn`
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

### Heal Over Time (`healOverTime`) and Grapple (`grapple`)

**Heal Over Time** is a per-slug flag backed by a `regen` status effect
(`{ turnsLeft, amount, by }`). A Healing-type slug carrying it doesn't heal on
impact; it leaves `regen` on whoever it hits instead, and `tickStatusEffects`
(called from `advanceTurn`) heals that combatant at the start of each of their own
next `REGEN_DURATION_TURNS` (3) turns, after any burn/poison has ticked, up to
max Grit. Each tick is `computeRegenAmount(power)` = `round(power * 1.5 / 3)`, so
waiting pays back 1.5x the slug's power in total. It never stacks: re-applying
refreshes the duration and keeps the stronger per-turn amount. Any other type
only gets the effect when fired at its own shooter (a self-buff). AOE Blast on a
Healing HoT slug regens everyone caught in the blast. A regen shows as a green dot
on the token and a "Regen +N" chip in the roster.

**Grapple** is a per-slug flag with two uses, both capped at `GRAPPLE_MAX_DISTANCE`
(5 AP of walking, 400 units) and stopped by the first wall in the way:

- *Attack a Slinger:* a landed primary hit hooks the target and reels them toward
  the shooter (`grappleDestination`, landing `GRAPPLE_STOP_DISTANCE` short of them),
  in place of any knockback. Mecha, mounted riders and anyone standing inside an
  Anchorage zone can't be dragged. Splash, chain and ricochet hits never pull.
- *Grapple to a Spot* (a fourth entry in the slug action picker, action type
  `grapple`): an environment shot at a map point. If the line hooks a wall (the
  first one along the shot) or a bridge at the aimed point, the *shooter* is reeled
  across to it, stopping `GRAPPLE_WALL_STOP_DISTANCE` short of a wall or right on a
  bridge. That is much more ground than Move gives for one slug's AP
  (`MOVE_SPEED_PER_AP` = 80 per AP). Not available while snared, riding a mecha, or
  from inside an Anchorage zone; landing in a damaging hazard hurts as it does on
  a Move.

### Stun, slug stall, amplifier, metal pull, burrowing

Five more per-slug flags, added to make several Velocity Abilities real:

- **Causes Stun** (`causesStun`): the hit target gets the same `stunned` status Psychic's
  trait gives (AP loss equal to half the hit's damage on their next turn), whatever the slug's element. Bubbaleone,
  Jellyish, Gazzer, Flatulorhinkus and Neotox.
- **Stalls Slugs** (`stallsSlugs`, Pieper): every slug the hit target owns goes on
  cooldown for one of their turns (`STALL_COOLDOWN_TURNS` = 2, because a cooldown
  ticks at the start of its owner's turn), or has its existing cooldown extended by
  one. `loaded` is untouched. Only a landed hit on a slinger does it (not a mecha).
- **Amplifies Partner** (`amplifiesPartner`, Enigmo): in a dual shot the *other* slug's
  power is tripled (`AMPLIFY_PARTNER_MULTIPLIER`) before the two are added; the
  partner picker preview shows it. Fired alone it's just a Light slug.
- **Pulls Metal** (`pullsMetal`, Slicksilver): where the shot lands, walls and bridges
  that a Metal-type slug built (tagged `slugType: "Metal"`) within
  `METAL_PULL_RADIUS` slide `METAL_PULL_DISTANCE` units toward the impact point, never
  past it. DM-drawn walls have no material and don't move; Anchorage zones hold things
  in place. Note no Metal slug currently has Wall Maker/Bridge Maker, so there's
  nothing for it to pull until one does.
- **Phases Walls** (`phasesWalls`, Graspvine): `slugHasTrait(slug, "phase")` is true,
  so the shot passes through walls exactly like a Dark slug's.

**Mirror Counter** (`mirrorsClash`, Mimkey): when it's the slug fired as a *counter*,
`resolveCounterOffer` treats the clash as a guaranteed bounce (no damage, no ejects,
no roll) -- it transforms into the opposing slug, so the two always cancel out. Same
end state as Caligo's voided Fire clash, but for any attacker. Only applies as the
counter, not when Mimkey is the one shooting.

**Surround Strike** (`surroundsTarget`, Pentalux): purely a visual, like Performance's
style shot. On a hit, the bolt flies straight until about 58% of its flight, splits
into five bolts that fan out to a ring around the target, then converges on it from
all sides (`surroundBolts` in `CombatMap.jsx`). The server still resolves one shot;
Pentalux also carries **Uncounterable**, so the target never gets a counter or Dodge
window. A miss is drawn as an ordinary single wide bolt.

**Summons Plant** (`summonsPlant`, Necrobloom): adds a fifth entry to the slug action
picker, "Summon a Plant" (action type `summon-plant`, an environment shot at a map point
with the usual accuracy roll). It plants a stationary **carnivorous bloom**: a combatant
of kind `plant` on the summoner's team with `PLANT_MAX_GRIT` (50) Grit, no knockout
pips, and no turn in the order. It's shootable like anyone else, but a landing shot is
plain Grit damage (`damagePlant`) -- no statuses, knockback or knockout roll -- and at 0
Grit the row is deleted. It bites any enemy within `PLANT_BITE_RANGE` (= `MOUNT_RANGE`,
80 units, the same reach as boarding a mecha) for the summoning slug's clash power plus its
element's DoT. It bites every enemy in reach once as it sprouts (`plantBiteNearby`), and after
that only when an enemy's movement goes into, out of, or straight through its reach
(`pathCrossesRange` / `plantBites`): on a Move, a terrified slinger's flight, a knockback or
pull, or a grapple reel. Standing beside it, or shuffling about inside its reach, never sets it off. On the map the token is a green toothy star with a dashed circle
showing the bite range. Blooms are excluded from splash hazards, pods, cones and marks,
and can't be First Aided or Intimidated.

**Causes Burn** (`causesBurn`) puts Fire's burning status on whatever the slug hits, whatever its
element. **Massive Blast** (`massiveAoe`, with AOE Blast) doubles the blast radius
(`MASSIVE_AOE_MULTIPLIER`, so 240 instead of `AOE_RADIUS` 120) for who gets caught, including on
a miss, and the explosion is drawn twice as large (`aoeScale`). Novaflare uses both plus Causes Blind.

**Random Statuses** (`randomStatuses`, Panaceon): a hit applies `RANDOM_STATUS_COUNT` (3) distinct
effects, each exactly as the dedicated flag applies it. Thrown at an **enemy** they come only from `RANDOM_STATUS_NEGATIVE`
(burn, poison, blind, snare, shock, stun, jam, fear, confusion, disarm, reversed direction, slowed reaction, slippery, marked);
thrown at an **ally** (3 effects) or **yourself** (only `RANDOM_STATUS_SELF_COUNT` = 2) they come only from `RANDOM_STATUS_POSITIVE`
(regen, invisible, keen vision, enhanced reaction) and the shot does no damage and offers no counter window. Rolled fresh on every hit, rolled fresh on every hit (including
splash). On a Healing-type slug it turns the shot into an ordinary attack: it deals damage instead of
healing, and (via `isSupportiveSlug`) offers the target a normal counter window.

**Potent Poison** (`potentPoison`, Plaguebell): each poisoning hit adds `POTENT_POISON_MULTIPLIER` (2) times the usual
poison stacks, so the damage per turn doubles. A Hazard Maker patch it leaves carries the same multiplier
(`poisonStacks` on the hazard), so stepping into it poisons twice as hard too.

**Causes Bleed** (`causesBleed`, Madicus): a hit leaves a `bleeding` status (`{ turnsLeft, by }`). At the start of
each of the target's next `BLEED_DURATION_TURNS` (3) turns they lose `BLEED_MAX_GRIT_FRACTION` (10%) of their own
**max** Grit (at least 1), whatever the slug's power -- so it hurts a tough target more. It ticks in `tickStatusEffects`
alongside burn and poison, doesn't stack (a fresh bleed just resets the duration), shows as a red dot / "Bleeding" chip,
and First Aid cures it. Mechas (Structure-only) don't bleed.

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

Once the cooldown reaches 0 the slug is back in hand but **not chambered** —
`spendEnergyPip()` also set `slug.loaded = false`, and it stays that way (blocking
firing and countering, marked in the combat UI with a vertigo "Not Loaded" overlay
on the slug card, the loaded-state twin of the "Exhausted" overlay) until the owner
spends a **Reload** action. Reload (`POST /actions/reload`, `tickSlugCooldowns`'s
counterpart) chambers *every* returned-but-unloaded slug in the currently active
weapon at once for a flat AP cost of that blaster's own `reload_ap_cost`. Ending
the encounter re-loads everything along with clearing cooldowns.

## 5. Shooting resolution

1. Range/LoS check: target must be within `combinedRange = blaster.range +
   type.range` — the weapon's own range and the slug type's own range stack,
   so a long-reach type (Air) in a long-range Sniper Rig reaches further than
   either alone — and not blocked by a wall the slug can't break or phase
   through (Dark).
2. Attack roll: `d20 + blaster.accuracy + quality.accuracyBonus + type.accuracyMod +
   loyaltyAccuracyModifier(slug.loyaltyTier) + blasterTypeAccuracyBonus(blaster, shooter)`
   vs a target DC of `10 + target DEX modifier + range penalty` (range penalty: −1 per
   `RANGE_PENALTY_STEP`, default 8 units, past half the weapon's range). See "Loyalty
   tier modifiers" below for the loyalty term, and "Base-type combat effects" below
   for the last term. Roll the quality tier's `failRate` first (jam chance) — a jam
   wastes the shot and the AP but the magazine slot needs a Reload to clear.
3. If the target has an available (energy-charged) loaded slug, **or** can afford
   the flat Dodge AP cost (see §6a), open the counter-clash window (§6) **before**
   rolling the attack — a successful counter or dodge can avoid the hit outright
   regardless of the attack roll. Gated purely on affordability, not on whether a
   reaction has already been used this round — both counter-clash and Dodge are
   usable as many times per round as the defender's AP allows.
4. On a hit with no counter: grit damage = `slug.clashPower + type.powerMod`, where
   `slug.clashPower` already has `loyaltyClashModifier(slug.loyaltyTier)` folded in
   (see "Loyalty tier modifiers" below) — applied to target's current Grit. Trait effects (burn/poison/snare/chain/blind/
   knockback) apply per the table above — burn/poison/snare only *flag* the target
   here; their actual effect lands later (§4). A **miss** doesn't fly dead-on to the target and
   just fizzle there (used to read as a hit that inexplicably did nothing) --
   `missDeflection()` rotates the true impact point a few degrees around the
   attacker (`MISS_DEFLECTION_DEG = 12`, random left/right, same distance),
   and the `combat-shot-resolved` broadcast carries that point so the bolt
   visibly goes wide instead. Once that point arrives, the client bends the
   bolt's aim from the target toward the wide point over the rest of the
   flight — a smooth veer, not a sideways snap onto the new deflected line.
   The deflected ray gets its own wall check
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
   grit-hits-0 roll depends on staying synchronous. If the shoved target is a
   **mounted rider**, the shove also has a flat `KNOCKBACK_DISMOUNT_CHANCE`
   (60%) of throwing them out of the saddle: the rider tumbles off (and is
   still shoved), the mecha holds its ground.
7. **Out of range / wall-blocked.** A shot that can't reach its target never
   gets close enough to be worth animating — nothing launches, no
   `combat-shot-resolved` reveal goes out, so there's no bolt, no burst and no
   miss sound. Only the Combat Log records the wasted shot; any terrain the
   slug leaves still appears where the shot fizzled out.

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

### Base-type combat effects

Three blaster base types (`BASE_TYPES` in `itemRules.js`) carry a combat effect
beyond their raw accuracy/range/magazine/reload stat line. All three are resolved
in the Shoot Slug flow (`routes/combat.js`), keyed on the fired blaster's
`base_type`, and no-op for every other type:

| Base type | Effect | Where |
|---|---|---|
| **Bow** | Attack roll also adds the **shooter's own DEX modifier** (on top of the usual accuracy terms). | `blasterTypeAccuracyBonus` — folded into the attack roll in `resolveNormalHit` / `resolveEnvironmentShot` |
| **Gatling** | Every slug it fires costs **`GATLING_AP_DISCOUNT` (2) less AP** to shoot, floored at 1. Applies to Attack and to Break/Make Wall & Build Bridge alike. | `gatlingShotApCost` — `shotApCost` replaces `slug.ap_cost` for the whole shoot route's AP check + spend |
| **Cannon** | The fired slug gets **`+CANNON_CLASH_BONUS` (+3) clash power**, which rides through both the §6 clash comparison and the eventual hit damage (`clash_power` drives both). | `applyBlasterTypeToSlug` — clones the slug at fire time, stored on the pending offer |

A DM-puppeted NPC opts into one of these by setting `npcBlaster.baseType` to the
matching type; leaving it unset (the default) means no base-type effect.

## 6. Counter-clash

When you're the target of a Shoot Slug action and you have a charged, loaded slug
you can afford, a countdown window opens on your screen: pick a slug to fire back,
or let it expire (no counter — the shot resolves as a normal hit per §5).

**Cost**: countering with a slug spends its `apCost` out of your leftover (unspent)
AP, on top of the energy pip below. Only slugs whose `apCost ≤ your current AP` are
offered; if you can't afford any, no window opens at all. This is why the AP formula
(§3) is generous — you're expected to hold a few points back each turn to stay able
to react.

**No window opens** if you're unconscious/disabled, or **disarmed** (Cynosure) —
a counter-clash is a Shoot Slug on someone else's turn, so the same blanket
lockout as §5's `disarmed` check applies. See `findEligibleCounterSlugs`.

**Window duration** no longer takes type/quality/dex into account — it's
driven purely by the equipped weapon's own range and the actual shot
distance:
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
to finish first. The reaction window always runs the shot's *entire* flight,
by construction — a defender can wait right up until the shot would
actually land, and never past it.

**The bolt's speed is constant per weapon, never per shot** (`shotFlightMs(dist,
weaponRange, slug)` in `combatRules.js`) — range changes how much *reaction
time* a shot gives, never how fast the bolt itself moves. Concretely:

```
shotWindupDistance(weaponRange) = weaponRange * SHOT_WINDUP_DISTANCE_FRACTION (0.2)
shotCruiseSpeed(weaponRange, slug) = (weaponRange - shotWindupDistance(weaponRange))
                                      / SHOT_FAST_PHASE_MS  [/ slugWindowFactor(slug)]
shotFlightMs(dist, weaponRange, slug) = SHOT_SLOW_PHASE_MS
                                       + max(0, dist - shotWindupDistance(weaponRange))
                                         / shotCruiseSpeed(weaponRange, slug)
```

The windup covers a *fixed slice of the weapon's own range* (not of this
particular shot's distance) during the fixed `SHOT_SLOW_PHASE_MS` — so two
shots from the same weapon, one close and one far, cover identical ground
during their windup and then cruise at the identical speed afterward. A shot
at exactly the weapon's own max range still takes the full
`COUNTER_WINDOW_MS` (830ms windup + 2500ms cruise = 3330ms) — the same fixed
ceiling every weapon's own max-range shot has always taken — but a shot
*closer* than that just has less ground left to cross at that same speed, so
it arrives (and gives up its reaction window) sooner without ever moving any
faster. A longer-range weapon (a Sniper Rig) is still a strictly *faster*
weapon than a short-range one at the same absolute distance, since its
cruise speed (tied to its own, larger range) is itself higher — Zeus's
`ultra_fast` and a Mega Morph shot speed up the cruise the same way, never
the windup, which stays exactly `SHOT_SLOW_PHASE_MS` for every slug and every
blaster alike.

The windup is a fixed animation beat that never compresses to fit a shorter
flight. That puts a hard floor on how close a target can be:
`shotTooClose(dist, weaponRange)` is true whenever `dist <=
shotWindupDistance(weaponRange)` — the target is close enough that the slug
would have to land before it's even done leaving the barrel. Rather than
compress the windup or let the shot land instantly, that shot fails outright
instead — no launch, no counter offered, resolved exactly like a jam
(`combat-shot-fx` with `outcome: "too-close"`, checked in the Attack flow in
`routes/combat.js` right after distance is known). **Being too close is
bad.** (Note `combinedRange` in §5 is `blaster.range + type.range` — the two
stack, so `dist` routinely exceeds `blaster.range` on its own.
`shotCruiseSpeed` is still purely a function of `blaster.range`, so ground
covered past the weapon's own range crosses at that same speed, just taking
proportionally longer — there's no ceiling on `shotFlightMs` beyond the
too-close floor.)

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

**The counter slug has the same fixed windup as the original shot.** The clash
always lands at `offer.windowMs` (the moment the original shot would have
landed — see above), no matter when the defender actually fires; that leaves
the counter slug with `counterFlightMs = offer.windowMs - counterAtMs` of its
own flight time before the collision. If that's less than `SHOT_SLOW_PHASE_MS`
— the reaction came in late enough that the counter slug can't even finish
leaving the barrel before the clash — it **loses the clash outright**
(`shotTooClose`'s same "the windup never compresses" rule, applied to the
defender's side): forced to `attacker-wins`, skipping the power/defense
comparison and the fire-void check entirely, since there's no counter slug
up to speed yet to smother anything or bounce off of. A snappy counter has
(nearly) the full flight to itself and clashes normally; one thrown right as
the window is about to close has almost none, and just loses. See
`counterNeverWoundUp` in `routes/combat.js`.

**Resolution**, once a counter slug is chosen (or the window lapses with no counter):

- **No counter** → normal hit resolution, §5.
- **Counter chosen too late to wind up** → **attacker wins automatically**, per above.
- **Counter chosen (and wound up in time)** → mutual clash (both sides' `clashPower`/
  `clashDefense` already include their own loyalty tier's modifier — see
  "Loyalty tier modifiers" above):
  - `attackerWins = attacker.clashPower > defender.clashDefense`
  - `defenderWins = defender.clashPower > attacker.clashDefense`
  - Both true → **double break**: both slugs bounce off, no damage either way, both
    slugs spend an energy pip and are ejected.
  - Only attacker wins → defender takes the hit per §5 damage rules; defender's
    counter slug is ejected/spent for nothing.
  - Only defender wins → **reflected**: attacker takes the damage instead, using the
    defender's slug's power/type; attacker's original slug is ejected.

  An **ejected** slug is flung out of the barrel exactly like a fired one — it
  keeps its magazine slot, counts down the same `SLUG_RETURN_TURNS`
  return-to-hand cooldown, then waits on a Reload. It is *not* stripped out of
  the weapon (which would make a countered slug vanish from the combat slug
  panel with no in-combat way to re-equip it).
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

### 6a. Dodge

A third option in the same reaction window as a counter-clash, hotkeyed to
Spacebar on the client: instead of firing a slug back, the defender rolls
`d20 + DEX modifier`, opposed **directly** against the attacker's own attack
roll (not the target's static DC). No slug or energy pip is spent — just a
flat `DODGE_AP_COST` (1) out of the defender's leftover AP, spent whether or
not the dodge actually succeeds (same rule a slug counter already follows).
Gated on unconscious/disabled, **not** `disarmed` — disarm is about firing a
blaster, and Dodge never fires one.

- **Success**: the shot resolves as a miss for damage/status purposes, and
  the defender's token sidesteps `DODGE_SIDESTEP_DISTANCE` (40 units)
  perpendicular to the attacker→defender line, wall- and map-clamped exactly
  like a knockback shove (`sidestepTarget` in `combatRules.js`). An **AOE
  Blast** slug still detonates at its real impact point — the defender's new,
  sidestepped position is checked against `AOE_RADIUS` (120) exactly like any
  other combatant, so dodging the direct hit doesn't reliably get you clear
  of a blast (`DODGE_SIDESTEP_DISTANCE` is deliberately well under
  `AOE_RADIUS`).
- **Failure**: falls through to *exactly* the same hit-or-miss determination
  an unanswered shot would get — the attacker's own accuracy roll might still
  miss on its own, independent of the failed dodge. Dodging isn't a second
  chance to avoid a shot that was going to miss anyway; only a genuine dodge
  success skips damage, moves the token, and grants Fame.
- A tie on the opposed roll favors the attacker.
- Dodge and counter-clash are both offered whenever the defender can afford
  either — a defender with no usable counter slug but enough AP for just the
  flat Dodge cost still gets a reaction window, showing only the Dodge
  option.

See `resolveDodgeAttempt` in `routes/combat.js`.

### 6b. Auto-counter (NPCs and grunts)

The DM can switch **Auto-counter** on per NPC/grunt (the robot button on its Turn Order row) or for a whole group (the *Grunts* / *NPCs* chips above the list). While it's on, that combatant never sends the DM a counter prompt: when a shot that will land opens its reaction window, the server runs the forecast in `server/src/autoCounter.js` and acts for them. Stored as `combatants.data.autoCounter`.

The forecast scores each reaction as a **Grit swing** and compares it to doing nothing (the shot lands uncountered, Metal's +25% included):

| Option | Swing |
| --- | --- |
| Do nothing | -(harm of the uncountered hit + its status riders) |
| Counter, defender wins the clash | + harm the reflected slug does to the attacker - AP/pip cost |
| Counter, bounce | -(cost) -- the shot is stopped |
| Counter, double-break | -(cost) - lost counter slug |
| Counter, attacker wins | -(harm of the hit, no Metal bonus) - cost - lost counter slug |
| Dodge | -(1 - P(dodge)) x (harm of the hit) - Dodge's AP cost |

* The clash uses the real `resolveClash` with the x3 `clash_tripled` multipliers, fire-voiding (Caligo) and mimic (Mimkey); damage uses the shared `slugBaseHitAmount` that `dealHit` also uses, so the forecast can't drift from what lands. A mounted rider only eats 25% of a hit.
* "Harm" is the Grit actually lost (overkill ignored) plus a lethal bump when it would drop them to 0 -- so a grunt on its last Grit reaches for a bounce or dodge that a healthy one wouldn't bother with. The same bump applies to a reflected hit that would kill the attacker.
* Each status rider on the incoming slug (burn, poison, snare, stun, blind, `causes_*`...) adds a point of harm.
* P(dodge) is the opposed `d20 + acrobatics > attack` odds. A window only opens for a shot that already hit, so the shooter's die is averaged over just the rolls that would hit the defender's DC -- skewed high, which makes dodging a skilled shooter a long shot. The NPC reasons from the shooter's modifier, it doesn't read the actual roll.
* The best option is taken only if it beats doing nothing by at least `AUTO_COUNTER_MIN_GAIN` (1). Otherwise the shot resolves as a plain hit, with no prompt and no AP spent.
* A counter isn't attempted if the window is too short for the counter slug to finish its windup (it would auto-lose), only Dodge.
* The reaction is sent after a delay (quicker for a high-DEX NPC, with jitter) through the same resolve path a human click uses, timestamped at that moment so the clash point is where a real reaction would put it.

Tunables (all at the top of `autoCounter.js`): `AUTO_COUNTER_AP_VALUE`, `_PIP_COST`, `_SLUG_LOSS`, `_RIDER_HARM`, `_LETHAL_HARM`, `_MIN_GAIN`.

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

- A mecha token moves a character's normal walking distance (`MOVE_SPEED_PER_AP`)
  times its own `speed` per Move-action AP — speed 1 walks like a person, speed 3
  covers three times the ground.
- **Unmounted mecha**: only its owning player (or the DM) can move it, and only on
  its own initiative turn. It can take no other action — no ram, no shooting.
- **Mounting** ties the rider and mecha into one entity: they share the *rider's*
  turn (the mecha is skipped in initiative), move together at the mecha's speed
  spending the mecha's AP, and the rider's token rides small on the mecha's. The
  mecha's AP refills at the start of the rider's turn.
- **Ram** action (2 AP, spent from the mecha's pool, taken on the rider's turn):
  drive into a target within `MOUNT_RANGE`. Attack roll `d20 + handling` vs
  `10 + target evasion` (target DEX mod, or target mecha's handling). On hit:
  damage = `rammingPower * RAM_DAMAGE_MULTIPLIER` (**×5**), reduced by the target's
  armor if it's a mecha and applied to Structure; against a **character** the raw
  figure is ignored — they take a flat `RAM_CHARACTER_MAX_GRIT_FRACTION` (**50%**)
  of their max Grit, always with a knockback-into-wall check. The ramming mecha
  takes `targetRammingPower * 5 - armor` (mecha target) or `rammingPower / 2`
  (character target) back as Structure damage.
- A **failed** ram — missed attack roll, or a `tier` breakdown mechanical failure —
  plays the same misfire feedback as a jammed slug shot (Fail.mp3 + the red-border
  map shake).
- A passenger can still Shoot Slug from a mount.
- **Damage soak**: any Grit hit that would land on a mounted rider is split with
  the mecha — the mecha takes `RIDER_DAMAGE_MECHA_FRACTION` (**75%**, rounded up)
  as Structure, the rider takes the rest. A hit too small to quarter lands
  entirely on the mecha (2–3 damage → all to the mecha; 5 → 4 mecha / 1 rider).
  Covers direct hits, clash outcomes, chain/AOE/cone splash, static-mark arcs,
  and being rammed. Burn/poison DoTs still tick on the rider. If the soak drops
  the mecha to 0 Structure it's wrecked (and throws its riders). An **Electricity**
  slug doubles the mecha's soaked share (not the rider's) — see §4.
- Structure at 0 → mecha is disabled (can't move/ram this encounter); passengers are
  dismounted in place and each immediately makes a knockback-style knockout roll
  check (a wrecked mecha throws its riders).

## Melee & equipment

The **Secondary** slot (slot 1) holds *one* thing: a second blaster, **or** a piece of
equipment (`equipment` table, `server/src/equipmentRules.js`, routes in
`routes/equipment.js`; kinds: melee weapon, ammo belt, shield -- armor has its own slot). The DM grants equipment from Inventory Management ("Grant
Equipment"); players equip it by dragging onto the Secondary slot. Equipping into the
slot bumps whatever was there (a bumped blaster is unloaded), and equipping a blaster
into slot 1 sends equipment back to the pack. Equipment can be traded like any item.

- **Melee weapon** -- damage, accuracy, AP cost and reach are all DM-set per weapon. It
  adds a hotbar **Melee** button (see the action table in section 3). It is not a
  "weapon switch": having it equipped is enough, Switch Weapon only toggles blasters.
- **Melee types** -- each melee weapon is a **bludgeon** (shoves the target `MELEE_KNOCKBACK_DISTANCE`, half a
  step, with the usual into-a-wall knockout check), a **slash** (leaves the target bleeding, same as Madicus's bleed)
  or a **pierce** (ignores shields). All three go through the normal hit path as a plain "None"-element hit.
- **Shield** (Secondary slot) -- the DM sets how much damage it `absorb`s. It soaks that much per fight, then it's
  **broken for the rest of that fight** and works again in the next one. The tally lives on the combatant
  (`data.shieldUsed`, keyed by equipment id, so unequipping and re-equipping a broken shield doesn't mend it;
  `data.shield` is the snapshot the roster draws). It acts in `absorbRiderDamage`, after a mounted rider's mecha has
  soaked its share, so it covers slug hits, melee, rams, hazards and cones -- but not burn/poison/bleed ticks.
  Pierce weapons skip it.
- **Armor** (its own Armor slot, worn with a Secondary item) -- adds flat max Grit (`characters.grit_bonus`, folded
  into `computeMaxGrit`). Current Grit is not raised on equip -- it fills at the next rest -- but is capped when armor
  comes off. Armor can't be changed during a fight; a fight picks up whatever is worn when it starts.
- **Ammo belt** -- gives the *Primary* blaster `extra_slots` more magazine slots (one
  blaster, more slugs). Stored as `blasters.magazine_bonus`, kept in step by
  `syncAmmoBelt` (`server/src/ammoBelt.js`) whenever a belt or the primary changes;
  slugs sitting in slots that no longer exist are unloaded. Anything that reads a
  player's magazine uses `totalMagazineSize` (`magazine_size + magazine_bonus`);
  `magazineSize` stays the DM-edited base.
- Changes broadcast a single `equipment-changed` signal (not per-row payloads --
  the live socket only keeps the last message of a burst) and clients refetch.

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

## 11. Fame and Heat

Two new per-character integers on the `characters` table (`fame`/`heat`,
both `INTEGER NOT NULL DEFAULT 0`), tracking a rebel's growing (and
dangerous) reputation across the galaxy over the course of the campaign —
entirely separate from anything reset by a rest.

**Fame** is generated automatically, from combat only (see `grantFame` in
`routes/combat.js`), from four sources:

- **Raw power landed**: any hit funnels through `dealHit`, which grants Fame
  equal to the slug's own `clash_power` (the raw base stat, not the type/
  triple/dual-modified damage `amount`) — a bigger slug earns more on its
  own, with no need to separately model "restraint."
- **Overkill**: damage beyond what the target had left (Grit or Structure),
  added on top of the raw-power term above.
- **Clash margin**: winning a counter-clash outright (`attacker-wins` or
  `defender-wins`) grants the winner the margin by which their power beat
  the loser's defense, on top of the raw-power/overkill Fame the resulting
  hit/reflect already earns via `dealHit`. A forced win (the counter never
  wound up in time) or a result with no winner (`bounce`/`double-break`)
  grants no margin bonus.
- **Dodge**: a successful Dodge (§6a) grants a flat `DODGE_FAME_BONUS` — set
  higher than a *typical* clash-margin bonus, since dodging is the flashier
  of the two reactions.

A DM can also manually adjust Fame (`PATCH /:userId/fame`), either direction.

**Heat** mirrors every Fame *increase*, from either source, by the same
amount, automatically, in the same query (`grantFame` updates both columns
at once, `GREATEST(0, ...)`-floored). A manual Fame change (either
direction) never touches Heat. On top of that automatic mirror, the DM has
its own free +/- manual override (`PATCH /:userId/heat`), entirely separate
from Fame's — used both to raise Heat narratively (a bounty gets posted) and
to lower it (a mission burns that bounty in the character's name). Heat is
visible to both the DM and the player (sheet and Roster) but purely
informational — nothing auto-triggers off it; the DM narrates the
consequences of a high Heat by hand.

**Fame tiers**: the client maps a raw Fame integer to one of ten titled
tiers by threshold (`fameTierLabel` in `client/src/characterData.js`, same
`{max, label}`-array `.find()` pattern already used for stat score bands) —
display-only, nothing server-side branches on tier.

**Known scope limit**: cone splash, steam pods, hazard tiles, and star-wall
touch damage resolve through `applyEnvironmentalDamage` rather than
`dealHit`, which carries no shooter/attacker reference — these don't
currently generate Fame.

## 12. Build phases

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
- Knockout DC escalation (`10 + pips used`) and Hunker Down heal (`max(1, CON) per AP`) — both
  arbitrary, said so you can veto.
- Fame's per-hit weights (raw `clash_power` + overkill, both currently 1:1 with no
  scaling constant) and `DODGE_FAME_BONUS = 8` — all placeholders until real numbers
  from actual play show whether Fame climbs too fast, too slow, or unevenly across
  playstyles.
- `DODGE_SIDESTEP_DISTANCE = 40` vs `AOE_RADIUS = 120` — tuned so a dodge usually but
  not always ducks a blast too; worth revisiting once you've seen it land in practice.

## Map size and view

- Every range/radius/length in `combatRules.js` is in map units, and a unit is a fixed distance: `MAP_UNITS_PER_METER = 20` (so `MOVE_SPEED_PER_AP = 80` is a 4 m step). The DM sets how many **metres wide** the map is during setup (`PATCH /encounters/:id/size`, 30-1200 m, default 160 m = 3200 units); the width in units follows and the height keeps the aspect ratio. A bigger map is just more units, so blaster range, melee reach, hazards, mount range etc. cover less of it with no per-rule scaling. Resizing rescales placed combatants, walls and water so they stay over the same spot of the map picture. Mirrored client-side in `client/src/mapScale.js`.
- A distance scale bar (round metres at the current zoom) is drawn along the bottom of the map for everyone.
- The DM no longer pans/zooms the map picture (it is always cover-fitted). Every viewer, DM included, has their own zoom/pan: scroll to zoom toward the cursor, drag an empty spot (or middle-drag) to pan, buttons bottom-right. It is the SVG `viewBox`, so picture, tokens, walls and rings move together, and it is never sent to anyone else.
