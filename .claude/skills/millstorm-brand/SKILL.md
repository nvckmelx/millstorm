---
name: millstorm-brand
description: "Millstorm brand identity and 'Armorial' (Гербовник) UI style — the pixel-art heraldic crest logo (shield with a windmill struck by lightning, mural crown, crossed pitchforks) and gold blackletter wordmark on a ribbon, the parchment/oak/iron/gold/vermilion palette, Pixelify Sans type, and medieval pixel-perfect components (oak plank buttons with iron rivets, vermilion wax-seal call to action, parchment panels in oak frames with iron corners, illuminated initials, team pennants, ribbons, stonework background, segmented health bars). Use this skill for ANY visual or UI work on Millstorm, even when the user doesn't say 'brand': new or changed screens, buttons, HUD, lobby, results, menus, icons, favicons, loading screens, marketing or landing pages, artifacts or mockups about the game, key-art or icon prompts, choosing colors or fonts, or reviewing whether something 'looks like Millstorm'."
---

# Millstorm brand — "Armorial" (Гербовник)

Millstorm is a browser PvP tower defense about rival farmers who defend their mills and
send pests at each other. The brand dresses the game as a **medieval armorial**: a coat of
arms, parchment scrolls, oak and iron, gold leaf and vermilion ink, all on castle
stonework. The playing field stays a bright, friendly farm; the brand lives in the chrome
around it. Everything is drawn **pixel-perfect**: hard edges on a 2px grid, no rounding,
no blur. It should feel like a hand-made pixel-art game, not a fantasy MMO.

Source of truth for live styles is `client/src/style.css` (tokens at the top, components
below). Read it before changing UI; extend its tokens and classes instead of inventing
parallel ones. `references/components.md` explains each component recipe.

## Logo

The logo is **generated from code**: `scripts/brand_exports.py` draws it pixel by pixel
(shapes and palette at the top of the file) and writes every export. To change the logo,
edit the script and re-run it; never paint over the exported files.

```bash
python3 .claude/skills/millstorm-brand/scripts/brand_exports.py   # needs Pillow
```

What it contains, and why each part is there:
- **Shield** (heater shape, azure field, gold bordure): the house of the player.
- **Windmill** (stone tower, vermilion cap, parchment sails) struck by a **gold lightning bolt**: "Mill" + "storm", the name told as a picture.
- **Mural crown** (stone battlements) over the shield: the keep the player defends.
- **Crossed pitchforks** behind it: these are farmers who went to war, not knights.
- **Wordmark**: "Millstorm" in gold pixel blackletter with an ink outline and a 1px drop, on a parchment ribbon with notched tails. The letters come from Pirata One (OFL, `docs/brand/fonts/`), rendered without anti-aliasing and then coloured by the script.

Files in `client/public/brand/` (SVG = crisp at any whole-number scale, PNG = pre-scaled):

| File | Use |
|---|---|
| `millstorm-lockup.svg/.png` | Crest over the ribbon wordmark: main menu, title spots |
| `millstorm-crest.svg/.png` | Crest alone: loading screen, match top bar, avatars |
| `millstorm-wordmark.svg/.png` | Ribbon-less wordmark for wide, short spaces |
| `favicon-32/64/180.png` | Tab and app icons |

Rules, and why:
- Show the pixel logo at whole-number scales (lockup 108×87 art pixels → 324px at 3×; crest 48×56 → 144px at 3×) with `image-rendering: pixelated`. Fractional scales smear the pixels unevenly. The one allowed exception is the tiny crest in the match bar.
- The logo works on both parchment and dark oak because every shape has its own ink outline. It has no "reversed" version, and should not get one.
- Don't recolor, rotate, stretch or add effects, and don't redraw it smoothly. Its pixel look is the brand.
- Put "Millstorm" in the page as real text next to a logo image (`alt="Millstorm"` or a visually hidden `h1`).
- Build image URLs from `import.meta.env.BASE_URL` (`BRAND_URL` in `client/src/ui/screens.ts`). The offline build uses a relative base, and a leading `/` breaks it.
- The previous logo (the user's navy M-towers) is kept in `docs/brand/archive-v1/` for reference only.

## Palette

The script and the CSS share one palette. Use CSS variables, never hex literals in components.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#2B1D14` | Iron-gall ink: text, outlines, frames |
| `--parch` / `-hi` / `-lo` | `#EAD9B0` / `#F6ECD0` / `#C9B07A` | Panels, tiles, inputs; light and shade |
| `--parch-ink` | `#6B5335` | Secondary text on parchment |
| `--oak` / `-hi` / `-lo` / `-deep` | `#7A4A26` / `#9A6534` / `#4E2E16` / `#33200F` | Frames, plank buttons, HUD beams |
| `--iron` / `--iron-hi` | `#5B6770` / `#8A97A1` | Corner plates, rivets, hotkey plates |
| `--gold` / `-hi` / `-lo` | `#E2B33C` / `#F6D77A` / `#A8781E` | **Selected** state, trims, labels on oak, focus ring |
| `--verm` / `-hi` / `-lo` | `#B8322A` / `#D9543F` / `#7E1F1A` | **The call to action** (wax seal), initials, alerts, section labels |
| `--azure` | `#2F5DA8` | Heraldic blue of the shield (logo only for now) |

Colors carry fixed meanings, so keep them apart:
- **Vermilion = "do this".** Keep one vermilion button per screen at a time. In the lobby, «Готов» is vermilion until you're ready, then «Старт» once everyone is.
- **Gold = "this is on"**: the active mode tile, the defender being placed.
- **Oak = ordinary actions.**
- **Game-meaning colors are separate**: `--good`, `--bad`, `--warn`, team blue `#2F80ED` and team orange `#F2994A`, and the armor colors from `shared/data/balance.json`. Don't reuse vermilion for a team or for "bad".

## Type

- **Pixelify Sans** (OFL, has Cyrillic) for all UI text: 400 body, 500 secondary, 700 headings and buttons. It's bundled via `@fontsource/pixelify-sans` in `client/src/main.ts`, so the game works offline. Outside the client, load it from Google Fonts with a `system-ui` fallback.
- Blackletter appears only in the logo. Real blackletter fonts have no Cyrillic and are hard to read at UI sizes, so medieval flavour in text comes from **illuminated initials** instead: the first letter of a section heading on a vermilion block with a gold and ink frame (`h2::first-letter`).
- Size scale in px: 11, 12, 13, 14, 16, 20, 24, 32, 48, 64. Uppercase micro-labels get `letter-spacing: 1px`. Ticking numbers (timer, resources, HP) use `tabular-nums`.
- Text placed directly on the stone wall gets a hard 2px ink outline (4 offset text-shadows) or sits on a parchment plaque. Never use a blurred shadow.

## Pixel-perfect rules

One art pixel = `--px` = 2 CSS px.

1. Every border, bevel, offset and shadow is a multiple of `--px`.
2. No `border-radius` and no blur. Round shapes are stepped (octagon `clip-path`, pixel rects).
3. The frame is `var(--frame)`: four offset copies of the box, an outline with notched corners plus a 2-pixel depth at the bottom. Recolor it with `--edge` on the element; `--frame` is declared on `*` so that local override works.
4. Bevels: light top-left, dark bottom-right. Pressed controls sink by `--px` and flip the bevel.
5. Motion is stepped (`steps(n)`), and every animation has a `prefers-reduced-motion` fallback.
6. Icons and textures are pixel art: SVG with `shape-rendering="crispEdges"`, one `rect` per run, shown at a whole-number scale with `image-rendering: pixelated` (`client/src/assets/`).

## Medieval motifs

Each motif has a job; don't sprinkle them for decoration.
- **Stonework** (`body`, `assets/wall.svg`): 16×8 stones in running bond, low contrast. It's the castle wall that everything hangs on.
- **Parchment in an oak frame with iron corner plates** (`.panel`, `.team`): primary containers. Smaller containers (`.tip`, `.award`, `.teambox`) get a plain oak line, so the iron corners mark importance.
- **Oak plank buttons with iron rivets** (default `button`).
- **Wax seal** (`button.primary`): vermilion with a gold rim, the one action to take.
- **Illuminated initial** on section headings.
- **Pennants** with a swallowtail for team names (`.team h3`).
- **Ribbons** with notched ends: the finale "Мельницу сломал козёл игрока X" on parchment with vermilion rules (`.finisher`), and boss or goat alerts in vermilion with gold rules (`.banner`). The logo's ribbon uses the same shape.
- **Oak beams with a gold trim**: the match top and bottom bars. Build and send tiles on them are parchment cards; locked sends are dark oak.
- **Stones** in the Mill health bar: 8px blocks with 2px gaps.
- **Iron hotkey plates** with gold letters (`.key`).

Avoid: rounded corners, gradients other than the stepped wood grain, glossy or glass
effects, emoji as icons, grunge textures and torn-paper edges (they fight the clean
pixels), fantasy-MMO filigree, and anything borrowed from other games (names, art, icons,
sounds). That last rule is in `CLAUDE.md`, and the brand inherits it.

## Voice

UI copy is Russian, short and direct, with a wink: «Гусь негодует», «Коплю на тарана».
Name things the way the player sees them («Зерно», «Приманка», «Мельница», «Страж»), and use
the names from `balance.json` exactly. Buttons say what happens («Вложить 100 в пушку»).
Medieval flavour belongs to the visuals; don't stylize the copy with archaic words.

## Workflow for a UI change

1. Read `client/src/style.css` (tokens and the component you're touching) and `references/components.md`.
2. Build with existing tokens and classes. Add a token only for a new *role*, and add it to the table above.
3. Check the rules: 2px grid, frame and bevel, one vermilion action, gold only for "selected", stepped motion, whole-number logo scales.
4. Look at it at 1366×768 and 1920×1080. The match HUD must not overlap: top-bar content fits at 1366 wide and the canvas fills its grid cell.
5. Any new external file (font, image) goes into `docs/assets-registry.md` with source and license.

## Outside the game client

For artifacts, landing pages, store images or slides, reuse the tokens and components, put
the lockup on stonework or parchment, and scale it by whole numbers. For AI image prompts
(key art, icons), describe the style in words: pixel art, medieval heraldry, parchment and
oak, gold and vermilion, a windmill struck by lightning, bright farm fields, thick dark
outlines. Never name other games, studios or artists (see the originality rules in
`docs/design.md`).
