---
version: 1
slug: "client-src-sounddesk-jsx"
primary_target: "client/src/SoundDesk.jsx"
related_targets: []
---

# Sound Desk (DM-only page, /sound-desk)

Scope: new Operate surface inside the established charcoal/gold app world. Visitor: the Dungeon Master, mid-session, one hand on the mouse, dim room, voice chat running. Players never see this page; they hear its output through a global ambience/effects listener.

Task: know exactly what the table is hearing, fire an effect with one tap and no confirmation, switch the looping ambience bed, and add a new sound in under ten seconds. Constraints: phone-usable, 4.5:1 text contrast in every accent theme, honour prefers-reduced-motion, no decorative looping motion, accent colours only through var(--maroon-*) tokens.

## Direction contract

THESIS: A ship's bridge audio panel: one pinned Now Playing band over banked pads, refusing the flat list of play buttons; state is always visible and every action is one tap.

OWN-WORLD: Charcoal panels with 16px radius and hairline gold rules; accent ramp only on the active bank tab and primary controls; gold only for "playing now" and the instant a pad fires. Pads are inset square wells, 12px radius, name in Manrope 700, hotkey digit in a tiny tabular corner chip. Cinzel only for the page title and the playing track's name. Times in tabular numerals.

STORY: The DM glances at the band and knows what the table hears; taps a pad and sees it light and sweep; picks a bank to swap the scene; uploads by dropping a file into the add tile. Players hear the same bed on the same beat.

FIRST VIEWPORT: Desktop 1440: nav, title row "Sound Desk" with Upload and Edit buttons right, bank tab row (All first, banks, Manage), full-width Now Playing band (~96px: track name, synced position bar, play/pause, stop, level slider), then ambience list (320px column) beside the effect pad grid (auto-fill squares, 1-9 hotkeys). Primary action: the pads.

FORM: Bank Console, dealt structure #6 of my ranked list (lead card), seed key c3e5b9a9, mode operate.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Adaptations from the dealt wireframe
- "Manage" (bank management) became the header "Edit sounds" toggle plus an "Unfiled" bank tab: banks are just a label on each sound, set in the inspector or at upload, so no separate manage view is needed.
- Bank tabs are a group of toggle buttons (aria-pressed), not an ARIA tablist: they filter one view rather than switch panels.
- The Now Playing band pins to the viewport top at 960px and wider; on phones it stays in flow and the effect pads come before the ambience list.
