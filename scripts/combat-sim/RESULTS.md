# Combat simulation results (26 Oct 2026)

Method and limits: see `README.md`. Everything below is **1v1, open ground, start 450 units apart**, a Revolver
(Fine) with six real default slugs at Friendly loyalty, no mods. Win rates are against a fixed field of 300
random legal characters (any point buy, any 5 proficiencies, any Secondary item) unless stated; "pp" = percentage
points of win rate. About 30 million duels in total; every cell is a mean over many stat blocks, so 95% error
bars are mostly under ±1 pp (shown where they matter).

## 1. Stats

Effect of each modifier level against a -1 modifier (scores 8-9), no Secondary item, all other stats averaged:

| | 0 (10-11) | +1 (12-13) | +2 (14-15) |
|---|---|---|---|
| **CON** | +8.9 | +18.5 | **+34.4** |
| **DEX** | +2.1 | +8.7 | **+23.2** |
| STR | -0.3 | -0.2 | 0.0 (but see melee, section 2) |
| WIS | 0.0 | +1.1 | +3.0 |
| INT, CHA | about -0.7 per +1 (pure opportunity cost) | | |

* **Only 8 / 10 / 12 / 14 matter.** 9, 11, 13 and 15 cost a point more for the same modifier. Scores 14 and 15 are
  identical (15 wastes 2 points).
* **Where CON's power comes from** (switching one channel off for everyone; CON +2 is worth +35.8 pp in total):
  max Grit is the bulk (without it: +11.3), then Hunker Down (+29.0 without) and knockout saves (+29.6 without).
  They overlap: a successful knockout save refills Grit to *max*, so every point of max Grit is multiplied by up
  to four "lives".
* **Where DEX's power comes from** (DEX +2 = +24.2): defence DC (+8.4), AP 8 -> 12 (+6.8), Dodge/Sleight of Hand
  skills (+2.5). **Initiative is a penalty**: switching the initiative bonus off *raises* DEX +2 to +28.2 (see
  section 5). DEX 12-13 only gives 9 AP, which is why +1 is worth far less than +2.
* **STR** does nothing without a melee weapon. With one, +2 (scores 14-15) doubles weapon damage
  (`meleeDamageFor`): STR +2 is worth **+19.6** with a rapier, +11.6 longsword, +4.6 mace; STR 12-13 gives
  nothing over 10.
* Point budget: exactly 27 must be spent, and INT/WIS/CHA are free dumps, so **14/14/14/10/10/10 (or 15/15/15/8/8/8)
  is affordable** -- there is no real trade-off between the three stats that matter.

Best stat blocks (STR/DEX/CON/INT/WIS/CHA, vs the random field): no item `10/14/14/12/12/11` 83%, longsword
`14/14/14/12/10/8` 92%, rapier `14/14/15/8/10/10` 95%. Worst: DEX and CON at 8-9 with the points spent on INT/WIS/CHA
or STR: 13-15%.

## 2. Secondary slot

Gain = same stat blocks with vs without the item (pp), averaged over all 1,568 stat patterns; the "triple +2"
column only counts STR, DEX and CON all at +2. "vs elite" = average win rate of the item's top-25 builds in a
round robin of the 350 best builds.

| item (game price) | gain, all patterns | gain, STR+DEX+CON all +2 | vs elite | pp per 100 gold (DEX/CON >= +1 builds) |
|---|---|---|---|---|
| Tower Shield, absorb 50 (760) | **+22.1** | +9.5 | 48.0% | 2.4 |
| Ammo Belt +4 (260) | +14.3 | +10.6 | 55.7% | **5.8** |
| Kite Shield, 30 (480) | +13.5 | +5.9 | 44.1% | 2.4 |
| Rapier, 4 dmg +3 acc 1 AP pierce (190) | +11.3 | **+15.6** | **76.4%** | 4.8 |
| Dagger, 3 dmg +2 1 AP slash (155) | +10.8 | +13.0 | 66.8% | 5.3 |
| Ammo Belt +2 (170) | +8.8 | +3.0 | 45.3% | 4.4 |
| Round Shield, 20 (340) | +8.4 | +3.3 | 41.7% | 2.2 |
| Longsword, 6 dmg +1 2 AP slash (220) | +7.8 | +10.9 | 62.3% | 3.0 |
| Shortsword, 4 dmg +1 2 AP slash (170) | +4.9 | +5.9 | 54.0% | 2.3 |
| Buckler, 10 (200) | +4.0 | 0.0 | 38.1% | 1.7 |
| Spear, 5 dmg +1 2 AP pierce, reach 160 (215) | +3.3 | +4.7 | 48.7% | 0.7 |
| Warhammer, 9 dmg -1 4 AP bludgeon (285) | +1.3 | +1.3 | 40.5% | 0.2 |
| Mace, 6 dmg 3 AP bludgeon (210) | +0.7 | +0.8 | 40.9% | -0.2 |
| (nothing) | 0 | 0 | 37.1% | |

* **Melee is the strongest thing in the game for a STR+DEX+CON build**, and it is a function of **damage per AP**,
  not damage. Melee has no cooldown, no energy pips and **no counter/Dodge window**; slugs are limited to about
  2 shots a turn by the 3-turn return cooldown, so AP beyond ~6 is spare, and 1-AP weapons turn all of it into
  swings (a 12-AP rapier user swings ~6 times a turn at 2x damage). Mace and warhammer (3-4 AP) are worth almost
  nothing; rapier/dagger are worth the most.
* The melee advantage is the *reaction system being unable to touch it*: with reactions switched off it shrinks to
  about +2 (rapier) from +10; with a Repeater (10 slots) or a far start (900 units) it also shrinks.
* **Shields** help every build, most when stats are weak, and they replace some of CON's value (CON +2 is worth
  +20.6 with a Tower Shield against +34.4 with nothing). Shield absorption is "per fight", so it scales with
  neither stats nor time.
* **Ammo belts** are the best value per gold; +2 does nothing on a 10-slot Repeater.
* Armor (separate slot, tested on its own, viable builds): Leather +8 Grit = **+9.1 pp**, Chain +15 = **+14.0**,
  Plate +25 = **+19.4** -- roughly 0.8 pp per bonus Grit.

## 3. Skills

Paired comparison (same stats and item, one proficiency added), viable builds (DEX and CON >= +1), pp:

| proficiency | none | longsword | round shield | comment |
|---|---|---|---|---|
| **Medicine** | **+3.0** | +1.9 | +2.9 | First Aid cures burn / poison / bleed. Only because the loadout has Fire and Toxic: with no DoT slugs it is -0.1 to -0.9 |
| Sleight of Hand | +0.2 | +0.9 | 0.0 | reload AP -2. Averaged over *all* stat blocks it is worth +2.7 (low-DEX builds gain), nothing once DEX +2 already cuts the reload to 1 AP |
| Athletics | 0.0 | +0.7 | 0.0 | walking speed; only matters when closing on or leaving a melee user |
| Acrobatics | +0.1 | +0.2 | +0.2 | Dodge needs a positive modifier and wins ~20% of rolls against an attack total of d20+10 |
| Intimidation | 0.0 | 0.0 | 0.0 | **-0.5 to -1.3 if actually used** (2 AP to take 3 AP off a foe with AP to spare) |
| Perception, Stealth, Performance | 0 | 0 | 0 | no mechanical effect in a duel |

The five best picks together (Sleight of Hand, Medicine, Athletics, Acrobatics, Intimidation) are worth
+3.5 to +5.5 pp -- **about half a level of CON** (one CON level is +9 to +18). All other skills are inert in combat.

## 4. Characters, head to head (2,000 duels per pairing)

| rank | build | avg win vs the other 11 |
|---|---|---|
| 1 | STR 14 DEX 14 CON 14 + **rapier** | 86.6% |
| 2 | STR 14 DEX 14 CON 14 + longsword | 75.6% |
| 3 | DEX 14 CON 15 + **tower shield** | 65.9% |
| 4 | STR 14 DEX 14 CON 14 + mace | 61.2% |
| 5 | DEX 14 CON 14 + round shield | 60.8% |
| 6 | DEX 15 CON 15 + ammo belt +2 | 60.3% |
| 7 | DEX 15 CON 15, nothing | 56.0% |
| 8 | STR 14 DEX 15 CON 8 + dagger ("glass cannon") | 53.7% |
| 9 | STR 15 DEX 10 CON 14 + mace ("pure brawler") | 24.5% |
| 10 | 12/13/13/12/13/12, nothing ("balanced") | 23.5% |
| 11 | CHA 15 face | 23.2% |
| 12 | INT/WIS/CHA 15 scholar | 7.9% |

Same ranking at 250 and 900 units (rapier 81% / 84.5%). Matchups worth knowing: rapier beats everything (the
closest, longsword, is 69%), a tower shield roughly breaks even with the other shield / belt / gunner builds (50-55%)
but loses to the rapier and longsword triples (17% / 41%), and the "balanced" and "face" builds are beaten ~90% by anything optimised.

## 5. Things the simulation shows about the rules (not about builds)

1. **Acting first is a handicap.** Pooled over all fights, the side that wins initiative wins 37% of the time;
   in an equal-build mirror match the second mover wins ~70-75%. Everyone starts with full AP and a full magazine,
   so the first volley is countered and reflected; the opener ends with ~2 AP and half a magazine on cooldown. A
   player who simply waits beats one who opens fire 72% of the time, and two patient players never fight (100%
   draws). DEX's initiative bonus therefore *costs* about 4 pp.
2. **Burn is huge.** One Fire hit = power now + power x3 over three turns (a power-7 slug is 28 damage), which is
   why Medicine only pays against Fire/Toxic.
3. **CON is the strongest stat by far** and scales superlinearly (+8.9, +18.5, +34.4) because Grit, Hunker and
   knockout saves all stack. A -1 CON is rarely survivable.
4. **INT / CHA have no combat value at all, WIS very little.** Perception, Stealth, Performance, Intimidation and
   (mostly) Acrobatics do nothing in a duel. If those stats are meant to matter in fights, they currently don't.
5. **Slug cooldown, not AP, limits ranged output** (6 slugs / 3-turn return = 2 shots a turn), so extra AP from DEX
   is spent on Hunker, kiting and melee rather than on more shots.

## 6. Robustness

The same study re-run with a different loadout, start distance or play style (400 stat patterns, 200-build field):

| variant | CON +2 | DEX +2 | STR +2 (longsword) | Tower Shield | Rapier |
|---|---|---|---|---|---|
| base | +35.8 | +24.2 | +11.2 | +22.5 | +10.3 |
| heavy slugs (AP 3) | +35.0 | +40.3 | +5.1 | +19.7 | +3.8 |
| no DoT slugs | +44.0 | +33.1 | +12.3 | +10.8 | +13.4 |
| loyalty Indifferent / Loyal | +41.6 / +32.0 | +25.5 / +12.6 | +13.3 / +9.0 | +14.0 / +24.2 | +14.3 / +8.3 |
| Pistol / Repeater / Sniper | +35.5 / +32.8 / +41.0 | +21.1 / +27.2 / +15.1 | +11.5 / +3.2 / +7.6 | +19.3 / +23.6 / +20.1 | +13.5 / +1.3 / +9.4 |
| start 250 / 900 | +30.3 / +35.0 | +14.2 / +23.5 | +9.7 / +6.2 | +21.8 / +22.6 | +9.0 / +5.2 |
| no reactions (nobody counters/dodges) | +32.5 | +35.0 | +4.0 | +24.6 | +2.0 |
| no AP reserve | +29.9 | +17.3 | +12.6 | +23.9 | +14.2 |
| never hunker with spare AP / hunker eagerly | +35.4 / +33.9 | +20.0 / +32.4 | +10.5 / +11.2 | +22.5 / +21.4 | +12.0 / +9.0 |
| no kiting by shooters | +36.5 | +24.2 | +12.1 | +22.4 | +12.2 |

* **Stable everywhere:** CON +2 is +26 to +44; a tower shield is +11 to +28 and the single most-gained item in
  15 of 17 variants (rapier in the other two: no-DoT slugs and Indifferent loyalty); INT/CHA never matter.
* **Depends on the setup:** DEX +2 (+5 to +40: it is worth most when slugs cost 3 AP or nobody reacts), and melee
  (+0 to +17: strongest when reactions are on and the slug magazine is small, weakest with a 10-slot Repeater, with
  no reactions, or at long range).

## 7. Caveats

* 1v1 only. Teams (simultaneous phases, AoE, chain arcs), terrain, mecha, mods and a second blaster are not
  modelled. A real party-vs-NPC fight rewards different things (healing slugs, AoE, focus fire).
* One policy plays every build. It is the best of 96 variants in a round robin and a sensible human would
  recognise it, but it is not optimal (e.g. it never baits a reaction; a patient opponent beats it 72%). The
  reaction side uses the game's own NPC auto-counter, which reads the incoming slug's real numbers and never
  mistimes a click; real players are worse at both.
* The slug magazine is a fixed six-slug set (Fire, Earth, Metal, Light, Toxic, Air). A different mix moves the
  value of Medicine and shields noticeably (see the no-DoT and heavy rows above).
* Melee weapons, shields and belts are the benchmark set in `catalog.mjs`, priced with the game's own default
  price formula; the DM-set values in the real campaign will differ, and the findings scale with them (damage
  per AP for melee, absorb per gold for shields).
