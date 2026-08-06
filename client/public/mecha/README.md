# Mecha-Beast default images

Drop image files here with these exact names to give the seeded default
Mecha-Beast templates portraits. Any common web image format works
(png/jpg/webp) — just match the filename (extension included).

| Template | Filename |
|----------|----------|
| LK-E (Wolf, Eli's "Lucky")      | `lucky.png`         |
| PNTH-3 (Panther)                | `pnth-3.png`        |
| TH1-DR (Bull, Blakk's "Thundarr")| `thundarr.png`     |
| Forge-Standard Horse            | `forge-standard-horse.png` |
| Forge-Standard Mole             | `forge-standard-mole.png`  |
| Roadworn Warthog                | `roadworn-warthog.png`     |

Files placed here are served at `/mecha/<filename>` — that's exactly the
path already stored on each seeded template, so no other config is needed.
If you use a different extension (e.g. `.jpg`), edit that template's Image
field in the Mecha-Beast Templates page (or the `mecha_templates` DB row)
to match.

> Note: `PNTH-3` replaced the old wolf-frame "Junjie's LK-E" template — if
> you'd already dropped a `junjies-lk-e.png` file here, it's no longer
> referenced by anything; rename/replace it with a panther image saved as
> `pnth-3.png`.
