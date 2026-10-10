# Product

<!-- impeccable:product-schema 1 -->

> Facts below come from the codebase, the docs folder and the user's own instructions. Anything marked *(inferred)* was not confirmed in an interview; correct it when you can.

## Platform

web

## Stack

React 18 + Vite client (`client/`), Express + PostgreSQL server (`server/`), a WebSocket layer for live state, Phosphor icons. Fonts are self-hosted: Cinzel (display) and Manrope (body).

## Users

A private D&D table: one Dungeon Master and a small party of players, playing a Slugterra-flavoured campaign in a shared galaxy of planets. Players use it mid-session on laptops and phones; the DM runs encounters, NPCs, markets and slug hunts from the same app. *(inferred)*

## Product Purpose

A campaign companion that replaces paper sheets and loose rules: character sheets, slugs, blasters, mechas, inventory, a market and trading, galaxy and ship pages, a Chronicle of NPCs, and a live tactical Combat page with turn order, map, counter-clashes and a combat log. Success is the table staying in the game instead of looking things up.

## Positioning

It is built around Slugterra's own mechanics (slugs, protoform and velocity forms, clashes, loyalty tiers, mecha) and the DM's own world, not generic D&D tooling. No other tool knows this campaign's slugs, planets and house rules.

## Operating Context

Played live, in real time, with voice chat running alongside. The DM and players see the same encounter at once, so screens must read quickly under pressure. Data arrives over a socket and a page may be left open for hours.

## Capabilities and Constraints

- Roles: Dungeon Master and Player. Some pages are hidden from players until Slugterra is revealed.
- Combat is real-time with reaction windows; the server is the authority on all rolls and damage.
- The setting is moving from underground caverns toward a star system of planets and space travel; copy should favour the planets framing.
- A Battle Report is generated when the DM ends an encounter and sent to each participant and the DM.

## Brand Commitments

**Look and feel: a dark, gilded fantasy ledger.** Near-black charcoal surfaces, hairline gold rules, and one deep accent colour. Established tokens in `client/src/index.css`:

- **Surfaces:** `--charcoal-950` through `--charcoal-600` (#0c0d0f to #383b40). Black does not change with the theme.
- **Gold:** `--gold` #c9a24b, `--gold-soft` #e0c584, `--gold-dim` #8a6f38. Gold means emphasis, the best result, the thing to read first. It does not change with the theme.
- **Ink:** `--ink` #f3e7e2 for text, `--ink-dim` #cbb4ac for secondary text. Status colours: `--success` #7fd99a, `--danger` #ff7a6b.
- **Accent ramp (the only thing that changes):** `--maroon-950` to `--maroon-400`, used for buttons, borders and the page background glow. Burgundy is the default, but the player picks an accent in Settings and the whole ramp is repainted via `:root[data-theme]`. **Never hard-code burgundy or maroon hex values.** Always reference `var(--maroon-*)`, so every theme works. Themes (see `client/src/theme.js`): Burgundy, Navy, Verdant, Royal Purple, Dark Orange, Dark Pink, Deep Teal, Indigo. Every ramp holds burgundy's exact lightness per step, so contrast stays the same across themes; verify new UI in more than one.
- **Type:** Cinzel 600/700/800 for titles, names and numerals that matter; Manrope 400-800 for everything else. Tabular numerals for data.
- **Shape and motion:** panels are 16px-radius with a soft inner highlight (`.panel`), buttons 8px (`.panel-btn`), ease `cubic-bezier(0.23, 1, 0.32, 1)`. Content rises in once; no decorative looping motion.
- **Slug element colours** (`SLUG_TYPES` in `slugData.js`) are the only multi-hue palette and carry meaning; do not reuse them for decoration.

## Evidence on Hand

Real rules and lore in `docs/` (`combat-system-design.md`, `galaxy-and-ship.md`, `slug-hunt-odds.md`, `the-three-clusters-player-facing.md`) and the slug roster in `docs/Slugs - OG Slugs.csv`. There are no marketing assets, testimonials or screenshots; none should be invented.

## Product Principles

1. **Legible under pressure.** Combat and market screens are read mid-turn; the next decision comes first, flavour second.
2. **The server is the referee.** The UI shows what happened and never invents outcomes.
3. **One accent, many themes.** Black and gold are constant; only the accent ramp moves, always through tokens.
4. **Gold is earned.** Reserve it for the best, the current and the important.
5. **Lore is part of the interface.** Names, slug art and planets carry the world; keep them present and accurate.

## Accessibility & Inclusion

Body text must hold 4.5:1 contrast on charcoal in every accent theme. Honour `prefers-reduced-motion`. Layouts must work on a phone, since players join from them. Do not rely on colour alone to tell states apart.
