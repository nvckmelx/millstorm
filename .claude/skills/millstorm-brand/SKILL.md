---
name: millstorm-brand
description: "Millstorm brand identity and 'Workshop' (Мельничная мастерская) UI style — the painted windmill logo with the gold 'Millstorm' wordmark, Art Pack 01 painted sprites and icons, the oak/cream/gold/teal/red-tile palette, Rubik + Yeseva One type, and chunky painted components (oak plank buttons with a thick dark outline, gold call-to-action, teal selected state, cream sail-canvas panels in oak frames with teal corner plates and gold rivets, outlined gold lettering, painted sky background). Use this skill for ANY visual or UI work on Millstorm, even when the user doesn't say 'brand': new or changed screens, buttons, HUD, lobby, results, menus, icons, favicons, loading screens, field sprites, marketing or landing pages, artifacts or mockups about the game, key-art or icon prompts, choosing colors or fonts, or reviewing whether something 'looks like Millstorm'."
---

# Millstorm brand — "Workshop" (Мельничная мастерская)

Millstorm is a browser PvP tower defense about rival farmers who defend their windmills and
send pests at each other. The look is a **painted, chunky, cartoon workshop**: oak planks,
cream sail canvas, teal iron plates with gold rivets, red roof tiles, all with a thick dark
outline, under a bright painted sky. Everything should feel hand-built and a little toy-like,
the way the logo does. Friendly, readable at a glance, never grim.

The UI and the field art share one language: the logo and Art Pack 01 set it, the CSS
follows. Source of truth for live styles is `client/src/style.css` (tokens at the top,
components below). Read it before changing UI; extend its tokens and classes instead of
inventing parallel ones. `references/components.md` explains each component recipe.

## Logo

The logo is the user's painted art: a windmill with a lightning bolt on one sail, and the
word "Millstorm" in outlined gold letters on a wooden beam with teal plates.

| File in `client/public/brand/` | Use |
|---|---|
| `millstorm-logo.png` (720 px) | Main menu, title spots |
| `millstorm-logo-sm.png` (320 px) | Small spots, link previews |
| `millstorm-mill.png` (256 px, windmill only) | Loading screen, match top bar, avatars |
| `favicon-32/64/180.png` | Tab and app icons |

Source: `docs/brand/source/millstorm-logo.webp`. Regenerate every export after the source changes:

```bash
python3 .claude/skills/millstorm-brand/scripts/brand_exports.py   # needs Pillow
```

The script trims the logo, and cuts the windmill-only version just above the gold lettering.
Rules, and why:
- Show the logo on the sky or on cream. It has its own dark outline, so it holds on wood too, but it needs air around it: at least the width of one sail blade.
- Don't recolor, stretch, rotate or re-letter it, and don't rebuild the wordmark from a font. The lettering is drawn, and a font version would look cheaper.
- Put "Millstorm" in the page as real text next to a logo image (`alt="Millstorm"` or a visually hidden `h1`).
- Build image URLs from `import.meta.env.BASE_URL` (`BRAND_URL` in `client/src/ui/screens.ts`, `ART_URL` in `client/src/game/look.ts`). The offline build uses a relative base, and a leading `/` breaks it.
- Earlier identities are archived for reference only: `docs/brand/archive-v1/` (navy M towers) and `docs/brand/archive-v2-armorial/` (pixel crest).

## Palette

Sampled from the logo and the art pack. Use CSS variables, never hex literals in components.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#3A2414` | Outline of everything, text on light surfaces |
| `--wood` / `-hi` / `-lo` / `-deep` | `#A86B32` / `#C98A4B` / `#7A4A22` / `#4E2E16` | Plank buttons, frames, HUD beams |
| `--cream` / `-hi` / `-lo` | `#F3E6C8` / `#FBF4E2` / `#D9C49A` | Panels, cards, tiles (sail canvas) |
| `--cream-ink` | `#6B5335` | Secondary text on cream |
| `--gold` / `-hi` / `-lo` | `#F2C05A` / `#FFE08A` / `#C98F2A` | **Call to action**, display lettering, rivets, numbers on wood |
| `--teal` / `-hi` / `-lo` | `#2E8C87` / `#4FB3AA` / `#1F6663` | **Selected** state, iron plates, hotkeys, the underside of gold lettering |
| `--tile` / `-lo` | `#C9502F` / `#8F3520` | Danger, alerts, the target tag, the invite code |

Colors carry fixed meanings, so keep them apart:
- **Gold = "do this".** Keep one gold button per screen at a time. In the lobby, «Готов» is gold until you're ready, then «Старт» once everyone is.
- **Teal = "this is on"**: the active mode tile, the defender being placed.
- **Wood = ordinary actions.**
- **Red tile = danger and alerts.**
- **Game-meaning colors are separate**: `--good`, `--bad`, `--warn`, team blue `#2F80ED` and orange `#F2994A`, and the armor colors from `shared/data/balance.json`.

## Type

- **Yeseva One** (display, Cyrillic): headings, the timer, banner text, team names, panel titles. Big display text is gold with a 6px ink stroke (`paint-order: stroke fill`) and a teal-then-ink drop, like the logo's letters (`.display`).
- **Rubik** 500/700/800 (Cyrillic): everything else, including buttons, numbers and body text. It's round and sturdy, and it reads well small.
- Both are bundled through `@fontsource/*` in `client/src/main.ts`, so the game works offline. Outside the client, load them from Google Fonts with fallbacks.
- Text sitting on wood or sky gets an ink stroke (4px), not a blurred shadow. Numbers that tick use `tabular-nums`.
- Check any new face for Cyrillic first: the UI is Russian.

## Shape rules

1. Everything interactive or framed has a **3px `--ink` outline** (2px on small controls) and rounded corners: `--r-sm` 8px for buttons, `--r` 12px for cards, 16px for framed panels, full pill for plaques and meters.
2. Depth is a **solid offset shadow** below the element (`0 4px 0 var(--ink)`), not a blur. Pressed buttons move down 3px and the ledge shrinks.
3. Surfaces are lit from the top: a lighter top band, a darker bottom band (see the plank gradient on `button`).
4. Wood gets faint plank lines (`repeating-linear-gradient`), cream stays clean.
5. Motion is short and bouncy. Every animation has a `prefers-reduced-motion` fallback.

## Painted art: Art Pack 01

The field and all icons use **Art Pack 01**: painted sprites with dark outlines in the same
palette. Never draw placeholder shapes where a sprite exists.

- Sources: `art-source/art-pack-01/` (full-size sheets, `manifest.json` with frame ids, pivots and visible bounds, prompts, gallery). Runtime: `client/public/art/`, built by `python3 tools/build_art.py`. Never load the source sheets in the browser (38 MB).
- Frame ids are exact: `defender/<id>/l1..l3`, `enemy/<id>/side_a|side_b|down_a|down_b`, `mill/body/healthy|damaged|critical|destroyed`, `mill/rotor/…`, `cannon/l0..l5`, `tile/…`, `prop/…`, `projectile/…`. Send ids map to units (`mice` → `mouse`, `crows` → `crow`).
- Size sprites by their **visible** width (`art.json` → `visible`) and anchor them at the pivot. Towers ≈ 1.1 cell, enemies ≈ 3.1 × radius from `ENEMY_RADIUS`, Mill body ≈ 2.5 cells. Mirror side frames for leftward movement; never rotate a character to follow the path.
- HTML icons: `icon("<name>")` from `client/src/ui/dom.ts` loads `art/icons/<frame id with / → ->.png` (e.g. `ui-grain`, `defender-owl-l1`, `enemy-crow-side_a`, `ui-goose-gooseHappy`). Keep text next to icons. Goose stickers are the one picture-only control, and they carry an `aria-label`.
- Keep in code, not in art: range circles, placement highlight, HP bars, team colours, sender tags, the field border. They need exact sizes and states.
- New art follows the same brief: painted, thick dark outline, warm palette, readable at 40 px, transparent PNG. Add it to the pack sources and the build script, then to `docs/assets-registry.md`.

## Motifs

Each motif has a job; don't sprinkle them for decoration.
- **Painted sky** behind every screen (`--sky-url`, set from `art/sky.jpg` in `main.ts`), with a warm wash.
- **Sail-canvas panels in an oak frame with teal corner plates and gold rivets** (`.panel`, `.team`): primary containers. Smaller containers (`.tip`, `.award`, `.teambox`, cards) are plain outlined cream, so the corner plates mark importance.
- **Oak plank buttons**; big buttons get a teal plate with a gold rivet at each end.
- **Gold lettering** with a teal underside for titles, the timer and wave banners.
- **Oak beams** for the match top and bottom bars; build and send tiles on them are cream cards, and locked sends are dark wood.
- **Team flags** with a swallowtail for team names (`.team h3`).
- **Capsule meters** with an outline and a lit top: Mill HP split into stones, the Lure bar.
- **Teal hotkey plates** with gold letters (`.key`).

Avoid: flat borderless panels, blurred drop shadows, glassmorphism, neon or cold blues in the chrome, pixel-art treatments (retired with the Armorial style), grim dark-fantasy textures, and anything borrowed from other games (names, art, icons, sounds). That last rule is in `CLAUDE.md`, and the brand inherits it.

## Voice

UI copy is Russian, short and direct, with a wink: «Гусь негодует», «Коплю на тарана». Name
things the way the player sees them («Зерно», «Приманка», «Мельница», «Страж»), and use the
names from `balance.json` exactly. Buttons say what happens («Вложить 100 в пушку»).

## Workflow for a UI change

1. Read `client/src/style.css` (tokens and the component you're touching) and `references/components.md`.
2. Build with existing tokens and classes. Add a token only for a new *role*, and add it to the table above.
3. Check the rules: ink outline, solid ledge shadow, one gold action, teal only for "selected", readable text on wood and sky.
4. Look at it at 1366×768 and 1920×1080. The match HUD must not overlap: top-bar content fits at 1366 wide and the canvas fills its grid cell.
5. Any new external file (font, image) goes into `docs/assets-registry.md` with source and license.

## Outside the game client

For artifacts, landing pages, store images or slides, reuse the tokens and components, put
the logo on the sky or cream, and load Rubik and Yeseva One from Google Fonts. For AI image
prompts (key art, icons), describe the style in words: painted cartoon, thick dark outlines,
oak wood, cream canvas, teal iron plates with gold rivets, red roof tiles, windmills,
bright sky, farm pests. Never name other games, studios or artists (see the originality
rules in `docs/design.md`).
