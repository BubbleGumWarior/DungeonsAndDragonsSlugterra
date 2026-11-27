# Galaxy Map & Ship Deck Plan

Two features that came with the "planets, not caverns" reframe: a star map of
the system, and a top-down plan of the party's ship.

## Navbar

To keep the bar from sprawling, related destinations are grouped into
dropdowns (`NavGroup` in `client/src/NavBar.jsx`):

- **Loadout** — Slugs/Creatures, Inventory
- **Galaxy** — Deck Plan, Chronicle (there is no Galaxy Map link: the map is only reachable through the ship, see below)

Desktop shows a click-to-open popover under the trigger; the mobile hamburger
panel flattens each group into an always-open labelled subsection. Both groups
are gated behind `showSlugterraTabs` (`isDungeonMaster || slugterraRevealed`, where `slugterraRevealed` now means "has created a character"),
same as the tabs they replaced.

## Galaxy Map (the Nav Computer's star console)

The map has no page of its own. `/galaxy` redirects to `/ship`, and the only way
in is the **Nav Computer** compartment on the Deck Plan (template key
`nav-computer`, mirrored in `ShipBlueprint.jsx` and `server/src/shipRules.js`).
A player clicking an **online** Nav Computer pin steps straight into
`NavConsole.jsx`; in any other status the console stays dark. The DM selects the
pin to edit it and has **Enter the star console** in its panel, plus an **Open
the star console** toolbar button that works with no Nav Computer at all.

**The Nav Computer is also required to travel.** Without an online one the
server refuses `POST /api/travel/propose` (and scraps a vote that passes after
it went offline), `GET /api/travel` reports `navReady: false`, and the dossier's
button reads "The Nav Computer is offline". The DM's **Launch now** and
teleport still work. The Nav Computer adds no thrust; **its tier sets how far it
charts** (see "Nav range" below).

`NavConsole.jsx` / `NavConsole.css` is a full-screen, first-person view from the
bridge. The room is the DM's own artwork, `client/public/ship/nav-bridge.webp`
(1935 x 812; the sidecar `.json` records where it came from), and the star map
is gold light projected above the holotable at its centre (a fan of light from
the table's plate, scanlines, a tilted sheet). To swap the picture, replace the
file, and if the table moves, update the plate numbers in the `.nav-stage` block
of `NavConsole.css` (`--sheet-bottom`, `--plate-w`, the emitter's `top`/height)
and `IMAGE_AR` in `NavConsole.jsx`.

**Getting there.** The Deck Plan page is drawn as a crew tablet in the player's
hands (`.tablet*` in `ShipBlueprint.css`). Clicking the Nav Computer drops it:
the tablet slips and falls out of view toward the floor while the console's
backdrop fades in and the room rises as if the head were lifting; then the HUD
and the hologram arrive. Leaving the console picks the tablet back up. Timings
live in `ShipBlueprint.jsx` (`openConsole` / `closeConsole`) and the animation
delays at the end of `NavConsole.css`. An **online** Nav Computer is the only
pin drawn differently (a larger gold ring with a planet icon and a "Star
console" tag); every other pin, including an offline Nav Computer, looks like a
normal compartment.

The hologram has a round foot, not a flat one: the sheet is masked to a bowl
shape whose lowest point is over the middle of the table, and the beam ends on
the plate's centre line with the emitter's glow carrying it round the plate's
front edge. The Threshold rides higher on the map (it follows `look.ringCy`) so
it stays clear of the front cluster's outer orbits.

Everything on the stage is placed as a share of the picture, so the hologram has
the same proportions against the table on every screen. The stage fills the
screen's height; a screen wider than the picture stretches the stage sideways
(up to 1.4x), picture and hologram together, and a narrower one crops the sides.
The star field and the spread of the background clusters stretch with it, and
the clusters are kept inside the part of the sheet that is actually on screen.
Gold (`--gold-soft`) is the projection, so it follows the chosen theme. The only
motion is a one-time power-on and a ring rotation on click. Below 880px the
picture becomes a dimmed backdrop and the map a flat sheet. The ship readout
(`TravelPanel`) sits bottom-left and the world dossier on the right, portalled
out of the tilted map so it stays flat.

The setting is **the Three Clusters** (`docs/the-three-clusters-player-facing.md`):
three rival powers, each its own star system (Threxa Combine/red giant, Verrin
Concord/binary pair, Kaeth Dominion/black hole accretion disc), plus Unclaimed
Space (The Threshold), all orbiting a shared gravitational anchor on the long
"Great Year" cycle described in that doc.

- `client/src/planetData.js` — `CLUSTERS` (3 systems, each with a `worlds`
  array local to that cluster's own star) and `UNCLAIMED` (The Threshold,
  which drifts on its own, outside the cluster cycle). `PLANETS` flattens all
  of it in cluster order — Threxa, Verrin, Kaeth, then Unclaimed — and **that
  flat index is `campaign_settings.slug_hunt_area` (0–16)**. It must stay in
  the same order as `slugHuntOdds.json`'s `areas` (generated by
  `scripts/gen_odds.py`). A dev-only `console.assert` in `planetData.js` fires
  if they drift. To add/reorder/rename worlds: edit `AREAS` in
  `scripts/gen_odds.py` **and** the world's habitat entry (`PLANET_ENV`, keyed
  by name) in `scripts/habitat_model.py`, re-run the script, then mirror the
  order in `planetData.js`. Which slugs can live on which world is explained in
  `docs/slug-habitats.md`.
- `GalaxyMap.jsx` — an SVG (1000×680 viewBox). The three clusters sit on a
  shared ring around a common anchor (`RING_CX/CY/RX/RY`): one slot is
  front-and-large (`focusedCluster` state), the other two are small and dimmed
  in the background. Clicking a background cluster's group animates all three
  clusters' ring angles (`clusterAngles`, tweened over `ROTATE_MS`) so the
  clicked one swaps to the front — only the focused cluster's planets are
  individually clickable. Within a cluster, planet orbits/positions use the
  per-planet `orbitRx/orbitRy/yearDays/phaseDeg`, local to that cluster's own
  star (`ClusterStar`, styled per `starType`: `red-giant` / `binary` /
  `black-hole`). **Nothing moves on its own.** A world's place on its orbit is a
  function of the campaign day (`planetPos`): it sits at `phaseDeg` on day 1 and
  goes once round every `yearDays` days. After a long rest the map catches up
  from the old day to the new one over a couple of seconds (`clock`), so you
  watch each world sweep exactly one day's worth along its orbit. The stars
  follow the same clock. The Threshold (no year) stays put with its three gates;
  only its junk tumbles.
  `prefers-reduced-motion` skips both tweens.
- Illustrations: clicking a world (or a cluster's star) shows `client/public/planets/<name>.jpg`
  at the top of the detail panel, and clicking that image opens it full screen
  (`DetailImage` in `GalaxyMap.jsx`). File names derive from the world name
  (`planetImageUrl`/`starImageUrl` in `planetData.js`); a missing file is simply
  not shown. Generation prompts: `docs/planet-image-prompts.md`.
- Party location: reuses the existing Slug Hunt plumbing — reads `slugHuntArea`
  from `useLiveState()`. The DM's "Teleport the party here" button still posts
  to `POST /api/settings/slug-hunt-area`, which also cancels any voyage or open
  vote. Normal movement goes through the travel system below.
- `TravelPanel.jsx` (fed by `useTravel.js`) is the console's left-hand readout:
  day, the ship's drive, and the current state (docked / vote open / under way, with the leg the ship is on). The
  world being voted on or flown to gets a dashed ring.

## Travel & voting

Players choose where the ship goes; a long rest is one day of the voyage.

### The physics (Veylan Drive, gates)

Travel follows `space_travel_implementation_spec_v1_1_veylan_drive.md`, adapted to
**three** systems. Five files, all pure (no DB):

- `server/src/travelPhysics.js` -- SI constants and `computeFlight(distanceMeters,
  { properAccelerationG, maxSpeedFractionC })`: the exact constant-proper-acceleration
  solution (accelerate, flip at the midpoint, brake; coast at the speed cap if the trip
  is long enough). Returns galactic-frame time *and* time aboard. Never shortcut it
  with `distance / speed`.
- `server/src/universe.js` -- the geography. Three systems, each with one **fixed**
  gate (`gateRadiusAU`, `gateAngleDeg`); worlds' orbital radii come from their
  `yearDays` and the star's mass by Kepler's law (`starMassSolar`), and their place on
  the orbit from the campaign day, so **planets move and trips change length with the
  day; gates never move**. **The Threshold** is the Neutral Transit Zone: open space
  full of wrecks and junk, with each system's twin gate on its outskirts (an
  equilateral triangle, 4,000,000 km sides, debris at the middle). `INTERSTELLAR_LY`
  (Threxa-Verrin 4, Verrin-Kaeth 5, Threxa-Kaeth 6) is only for the no-gates figure.
  Every number is a proposed, editable value; `WORLDS` mirrors `planetData.js` names,
  `yearDays` and `phaseDeg` (a test checks it).
- `server/src/routePlanner.js` -- `planRoute` builds the legs. Inside a system:
  station to station. To/from The Threshold: one jump. System to system: world -> its
  gate -> jump -> across The Threshold -> jump -> world (always through The
  Threshold). `TRAVEL_OVERHEADS` are visible extra legs: 2 h of flip, alignment and
  docking per flight (a Thruster Array cuts it), and gate queue / jump / inspection
  time, all 0 for now. Each leg uses planet positions at the moment it starts. A route
  reports `physicallyReachable`, `gateOperational`, `authorizedForTransit` and
  `launchable`. `directInterstellar` is the no-gates flight (years): information only,
  never launched. Route types: `INTRA_SYSTEM`, `GATE_NETWORK`, `DIRECT_INTERSTELLAR`.
- `server/src/shipRules.js` -- `SHIP_CLASSES` (heavy freighter 0.05 g / 0.75c,
  civilian 0.10 g / 0.75c, courier 0.25 g / 0.85c, warship 0.50 g / 0.90c,
  experimental/elite 1.00 g / 0.95c) and `driveBreakdown(ship)`. **The Traveler is
  experimental/elite.** 0.95c is the hard ceiling.
- `server/test/travel.test.js` -- `cd server && npm test` (Node's built-in runner):
  the spec's reference journeys and tables, validation, property tests over random
  flights, gates, routes, the Nav range and gravity aboard.

Ships dock at each world's orbiting station: there is no launch or landing. Days =
`ceil(galactic seconds / 1 day)`, minimum 1. Typical results: a civilian transport
needs ~3-14 days inside a system (about 9 on average) and ~22 days system to system;
The Traveler at 1 g, 1-5 days inside a system and 5-9 days between systems.

**No artificial gravity.** Under way the drive is always burning (accelerate, flip,
brake), so a fight aboard feels the ship's own acceleration (1 g on The Traveler, 0.1 g
on a civilian ship). Docked at a world's station, aboard means that world's gravity (the
user's call); docked in The Threshold, zero. `aboardGravityG()` in `travelService.js`,
read by `currentAtmosphere` in `outfitService.js`.

**Gates.** `campaign_settings.gate_status` (`{ threxa: { operational, authorized } }`,
missing = open). The DM flips them from a system's dossier (click its star) via `POST
/api/travel/gates`. A route through a shut gate, or one the ship isn't cleared for, is
still drawn and timed but can't be proposed or launched (the DM's launch too). An open
vote is scrapped if a gate on its course closes. Gates are drawn on the map: one just
beyond each system's outer orbit, three on The Threshold's outskirts (red and dashed
when shut).

### Voting and the voyage

- **Vote** (`routes/travel.js`): any player proposes a charted world (one open
  proposal at a time, needs an active ship); the proposer's yes counts at once.
  Voters are everyone with a character who isn't the DM. A strict majority of
  yes votes launches; once a majority can't be reached the proposal is thrown
  out. Votes can be changed. The proposer can withdraw. The DM can **Launch now**
  (skips the vote), **Turn the ship around** (abort, party stays at the origin)
  or teleport.
- **A long rest** calls `advanceDay()` in `server/src/travelService.js`: bumps
  `campaign_settings.campaign_day`, counts `travel_state.days_left` down (the
  party lands on the last day, which moves `slug_hunt_area` and closes markets
  like a DM teleport), and moves compartment builds along. The result is sent in
  the `long-rest` broadcast as `day` and shown in the sleep overlay.
- **A long rest only heals fully with a working Medbay** (`hasWorkingMedbay` in
  `shipRules.js`: an `online` compartment with `templateKey: "medbay"` on the
  active ship, checked before the day advances). Without one, rested characters'
  Grit only rises to 50% of max (`NO_MEDBAY_REST_HEAL_FRACTION` in `careRules.js`,
  mirrored in `client/src/careData.js`; never lowered) and knockout pips are
  left alone, so players need Medpacks (30 cr) and Revival Tonics (100 cr).
  `medbay` is in both the `long-rest` summary and `GET /long-rest/preview`.
- While under way, Slug Hunt attempts are refused (`routes/slugHunt.js`). Markets
  are not gated.
- State: `travel_state` (single row; `route` holds the planned legs, and `GET
  /api/travel` reports `voyage.currentLeg` from the days elapsed), `travel_votes`,
  `campaign_settings.campaign_day`.
  `GET /api/travel` returns everything the UI needs, tailored to the caller, and
  every change sends one bare `travel-updated` WebSocket nudge to refetch.

## Ship Deck Plan (`/ship`)

DM uploads a top-down ship image and drops circular **compartment nodes** on
it; clicking a node opens a detail panel the DM can edit. Ships are DB rows —
the DM can create new ones and switch the active ship as the party upgrades.

### Data

`ships` table (`server/src/db.js`):

| column | notes |
| --- | --- |
| `name` | ship name |
| `image` | downscaled data URL (`client/src/imageDownscale.js`, shared with the combat map), or null |
| `compartments` | jsonb `[{ id, label, description, status, xPct, yPct }]` — `xPct`/`yPct` are 0–100 percentages of the image box; `status` ∈ `empty` \| `online` \| `offline` \| `broken` \| `building` (server coerces anything else to `empty`) |

On the map a compartment is **just a dot** in its flag colour (`STATUS_META` in `ShipBlueprint.jsx` is the single source for the label + colour of each status, mirrored by `COMPARTMENT_STATUSES` server-side). The name shows on hover / when selected, not inline. `empty` renders as a dashed gold ring with a `+`, marking a buildable slot; the DM picks the status from a colour-coded dropdown.

`campaign_settings.active_ship_id` → the ship everyone sees.

### API — `server/src/routes/ships.js`

| route | who | purpose |
| --- | --- | --- |
| `GET /api/ships/active` | all | the active ship (or `null`) |
| `GET /api/ships/blueprints` | all | blueprints with tier costs, the stores, the caller's Engineering modifier |
| `GET /api/ships/effects` | all | what the online compartments give the crew right now |
| `POST /api/ships/compartments/:id/build`, `/upgrade` | players | the engineering roll to build on an empty slot / upgrade an online compartment |
| `PATCH /api/ships/stores` | DM | set the ship's stores |
| `GET /api/ships` | DM | ship registry (no images) |
| `GET /api/ships/:id` | DM | one full ship (for the switcher) |
| `POST /api/ships` | DM | create (first ship auto-activates) |
| `PATCH /api/ships/:id` | DM | `{ name?, image?, compartments? }` |
| `POST /api/ships/:id/activate` | DM | set active |
| `DELETE /api/ships/:id` | DM | delete (falls back to newest remaining) |

Every write broadcasts a bare `{ type: "ship-updated" }` — a "refetch" nudge
(single-slot signal pattern). The client handles it in `AccessSocket.jsx`
(`shipUpdate`); `ShipBlueprint.jsx` re-fetches on change, but keeps the DM
parked on whichever ship they were inspecting.

### Stats and compartment building

- **Ship stats:** `ships.ship_class`, `ships.accel_g` (sustained proper
  acceleration) and `ships.max_speed_c` (speed cap), DM-edited (picking a class resets
  the two ratings to its baseline), and `ships.compartment_slots` (cap on pins; only
  *adding* a pin past it is refused). The old `ships.speed` column is no longer read.
  Effective acceleration = base + every **online** compartment's `accelBonusG`
  (`driveBreakdown` in `shipRules.js`). A stats strip at the top of the page shows the
  Veylan Drive, compartments online / placed / slots, the voyage and the ship's stores.
- **Compartment fields** (inside the `compartments` JSON): `templateKey`, `tier`
  (1-3), `upgradingTo`, `accelBonusG`, `buildDays`, `progressDays`, `engineers`
  (user ids). The server carries `progressDays`, `engineers` and `upgradingTo`
  over from what is stored: the client PATCHes the whole array on every drag, so
  it can't be allowed to overwrite progress that moves on its own or to invent an
  upgrade (it can only cancel one, by sending `upgradingTo: null`). Switching a
  pin to `building` restarts it at 0; leaving `building` clears both. The DM can
  set `tier` by hand, clamped to what the blueprint offers.
- **Custom templates:** the DM's own, in `compartment_templates`
  (`GET/POST /api/ships/templates`, `DELETE /api/ships/templates/:id`, DM only).
  They have one tier and no coded effect beyond an acceleration bonus (g). A pin copies a
  template's fields when applied, so deleting one never changes a ship.
- **Build progress per long rest** (`buildProgressPerRest`): docked, a building
  (or upgrading) compartment gains 1 day. Under way it gains 1 day per
  **engineer** assigned to it, and none otherwise (the overlay reports it as
  stalled). A player signs on with `POST /api/ships/engineer { compartmentId | null }`;
  it needs Engineering proficiency and a player works on one compartment at a time.
  A finished build goes `online`; a finished upgrade raises `tier`. Either clears
  its engineers.

## Building and upgrading (the crew's side)

Players build and upgrade from the Deck Plan, paying in ship supplies and rolling
Engineering. The rules are in `server/src/shipRules.js` (blueprints, `shipEffects`,
`workQuote`, `resolveWorkRoll`); `node scripts/ship-check.mjs` checks them.

- **Blueprints.** The 15 built-in compartments each have up to three tiers (I-III),
  a cost in supplies, build days, an Engineering DC and an effect. **Bridge, Pub,
  Bathroom and Lexical Graft have one tier** (no upgrades). **Thruster Array and
  Lexical Graft are not on the crew's build list**: the DM places them, and the crew
  can still upgrade a Thruster Array. `GET /api/ships/blueprints` (all users) returns
  them with costs, the stores and the caller's own Engineering modifier.
- **Building** happens only on an **empty slot the DM placed** (the dashed `+` pins).
  Clicking one shows the buildable blueprints. Players can't add pins; the DM does.
- **Upgrading** is offered on an **online** compartment below its top tier. It keeps
  working at its old tier while the upgrade runs (`upgradingTo` is set on the pin),
  and the pin pulses gold.
- **Supplies.** Tier I uses **Ship Parts**, Tier II **Ship Components**, Tier III
  **Ship Cores**. They live in the party's *shared* stores
  (`campaign_settings.ship_parts/ship_components/ship_cores`), up to a capacity of 12
  until a Cargo Hold raises it (20 / 40 / 80). The DM can also set them
  (`PATCH /api/ships/stores`, shown as editable fields on the stats strip).
- **Supplies are not on the shelves by default.** They are a market listing kind,
  `ship_supply` (`market_listings.template_id` is the grade, 1-3). The DM posts them
  for the current world with *Post listing > Ship Supplies*, with a price (defaults 15 /
  45 / 120) and optional stock. Players see a "Ship Supplies" tab only once one is
  listed, and buy up to 20 at a time, limited by stock and by room in the stores.
- **The roll** (`POST /api/ships/compartments/:id/build { templateKey }` and `.../upgrade`):
  one player rolls d20 + Engineering (+ the Workshop's build bonus) against the tier's
  DC. A total at or above the DC, or a natural 20, succeeds. Success spends the full
  cost and starts the work (a natural 20 saves a day). A miss spends **half** the
  cost, rounded up, and starts nothing; the party can try again. It runs in one
  transaction that locks the ship row and the stores, so two players can't both spend
  the same supplies.
- **Everyone is told.** The result is written to the Events feed as a System message
  (`meta.type: "ship-build"`: who, what, the dice, DC, outcome) and broadcast as
  `chat-message`, and also as `ship-build-result`, which raises a toast for every
  player (`ShipBuildToasts.jsx`). Finished builds and upgrades show in the long-rest
  overlay.

### What each compartment gives

Read from one place, `shipEffects(compartments)` (online compartments only; duplicates
of a kind don't stack, drive acceleration does). Numbers are placeholders to tune in `shipRules.js`.

| Compartment | Tier I / II / III | Hooks into |
| --- | --- | --- |
| Engine Room (the Veylan main drive) | acceleration +0.05 / +0.10 / +0.15 g | `driveBreakdown` |
| Thruster Array (RCS) | flip, alignment and docking time -25% / -50% / -75%; no thrust | `planRoute` overheads |
| Nav Computer | charts own system + The Threshold / every world / every world + no-gates figures | `navCanReach` |
| Medbay | full long-rest heal + knockout pips / also cures illness overnight / Medpacks heal 75% | `characters.js` long rest, `consumables.js` |
| Galley | 2 / 4 / 6 free kibble per long rest, dealt round-robin to the party | long rest |
| Slug Terrarium | food drain -5 / -10 / -15; III keeps one starving slug a rest from losing loyalty | long rest |
| Crew Quarters | illness chance -25% / -50% / -100% | long rest |
| Workshop | Repair Kit rolls +2 / +4 / +6; ship-build rolls +1 / +2 / +3 | `blasters.js`, build roll |
| Armory | blaster wear -10% / -20% / -30% | `combat.js` `wearBlaster` |
| Cargo Hold | stores hold 20 / 40 / 80 | stores capacity |
| Observatory | unvisited worlds show atmosphere and gravity / every survey fact / picture and text too | the `???` rule in `GalaxyMap.jsx` |
| Bridge, Pub, Bathroom, Lexical Graft | flavour only | |

Combat asks for the effects on every shot, so `getShipEffects()` in `travelService.js`
caches them for 3 seconds and `notifyShipUpdated()` clears the cache.

### Nav range

A Nav Computer charts routes by the gates they use (`routeRange` in `shipRules.js`,
mirrored in the client's `NAV_RANGE_LABELS`): **Tier I** the ship's own system plus
the one-jump run to or from The Threshold (so it can always get out of the debris
field), **Tier II** the other systems too (two jumps through The Threshold), **Tier
III** the same worlds plus the no-gates figures in the dossier. `POST
/api/travel/propose` refuses a route out of range, `GET /api/travel` marks each route
`reachable`, and the dossier's button reads "Beyond the Nav Computer's range". The DM's
**Launch now** and teleport ignore range (never a shut gate). Existing Nav Computers
count as Tier I until the DM sets or upgrades them.

## Survey data, and ??? for worlds nobody has visited

Each world in `planetData.js` has `yearDays` (days to orbit its star) and
`facts`: `dayHours`, `temperatureC`, `humidityPct`, `gravityG`, `atmosphere`,
`moons`. They show in the dossier alongside the year progress ("Year 1, day 8").
The numbers are invented to fit each world's description and its habitat model
entry, so edit them freely.

The party only knows what it has visited:

- `visited_worlds` table. A world is added when the party lands (or is
  teleported) there; the world the party is on always counts, even in a campaign
  that predates tracking. `GET /api/travel` returns `visited`.
- For an **unvisited** world the console keeps the name, the cluster and the
  distance / travel time (you can still plot a course) but shows **???** for the
  picture, description and every fact, and draws the world as a dashed wireframe
  on the map. A cluster's lore stays hidden until one of its worlds has been
  visited.
- The DM sees everything, with a note on worlds players still see as ???, and
  can **Reveal to players** / **Hide from players** (`POST /api/travel/visited`,
  DM only; the world the party is on can't be hidden).
- This is a display rule, not a secret: the text and image paths still ship in
  the client bundle, as the pre-reveal copy elsewhere in the app does.

## The starting ship

A brand-new database is seeded with **The Traveler**, the ship the DM built:
`server/src/seedDefaultShip.js` reads `server/src/seed/default-ship.json` (name,
class experimental/elite at 1 g and 0.95c, 12 slots, all 12 compartments with their positions, statuses and
build numbers) and `default-ship.jpg` (the deck plan), inserts it and makes it
the active ship. It runs once: `campaign_settings.default_ship_seeded` is set
even when nothing was inserted, so an existing campaign, or a DM who deletes
every ship, never gets it back.

The DM's three custom compartments (Pub, Bathroom, Lexical Graft) are built-in
templates now, and the ship's compartments point at their built-in keys
(`pub`, `bathroom`, `lexical-graft`). To change the starting ship, edit that
JSON and image. It only affects databases created afterwards.
