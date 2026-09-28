---
name: millstorm-brand
description: "Millstorm brand identity and 'Stormkeep' UI style — logo files and usage, navy/lightning/stone palette, Pixelify Sans type, and medieval pixel-perfect components (stone buttons with notched pixel frames, crenellated panels, team pennants, ribbons, segmented health bars). Use this skill for ANY visual or UI work on Millstorm, even when the user doesn't say 'brand': new or changed screens, buttons, HUD, lobby, results, menus, icons, favicons, loading screens, marketing or landing pages, artifacts or mockups about the game, key-art or icon prompts, choosing colors or fonts, or reviewing whether something 'looks like Millstorm'."
---

# Millstorm brand — "Stormkeep"

Millstorm is a browser PvP tower defense about rival sky-farmers. The brand frames the
game's UI as a **castle keep in a storm**: navy stone walls, cyan lightning, pale storm sky.
The playing field itself stays a bright, friendly farm; the brand lives in the chrome
around it. Everything the player clicks is drawn **pixel-perfect**: hard edges on a 2px
grid, no rounding, no blur.

Source of truth for the live styles is `client/src/style.css` (tokens at the top,
components below). Read it before changing UI; extend its tokens and classes instead of
inventing parallel ones. `references/components.md` explains each component recipe
and how to build new ones in the same style.

## Logo

Files (exports are generated, do not edit by hand):

| File in `client/public/brand/` | Use on |
|---|---|
| `millstorm-lockup.png` | Light surfaces, hero/title spots (main menu) |
| `millstorm-lockup-reversed.png` | Navy/dark surfaces |
| `millstorm-emblem.png` | Light surfaces where space is tight (loading screen) |
| `millstorm-emblem-reversed.png` | Navy bars (match top bar, 30px) |
| `millstorm-wordmark[-reversed].png` | Horizontal spaces, banners |
| `favicon-32/64/180.png` | Tab icon, app icon |

Sources live in `docs/brand/source/` (the user's original art). After the source changes,
regenerate every export with:

```bash
python3 .claude/skills/millstorm-brand/scripts/brand_exports.py   # needs Pillow
```

Rules, and why:
- On navy use a `-reversed` file. The navy logo vanishes on navy; the reversed one swaps navy for stone and keeps the cyan bolt.
- Never recolor, rotate, stretch, outline or add effects to the logo, and don't pixelate it. The logo is smooth, bold vector-style art. It carries the brand's "competitive" weight, and the pixel treatment belongs to the UI around it.
- Keep clear space of at least the height of one tower crenel around it. Minimum sizes: emblem 24px, wordmark 120px wide.
- Put the word "Millstorm" in the page as real text next to a logo image (`alt="Millstorm"` or a visually hidden `h1`), so screen readers and search see the name.
- In code, build image URLs from `import.meta.env.BASE_URL` (see `BRAND_URL` in `client/src/ui/screens.ts`). The offline build uses a relative base, and a leading `/` breaks it.

## Palette

Brand colors were sampled from the logo; use the CSS variables, not hex literals.

| Token | Hex | Role |
|---|---|---|
| `--night` | `#0E213B` | Brand navy: text, frames, HUD bars, merlons |
| `--night-2` / `--night-3` / `--night-deep` | `#17325A` / `#244878` / `#081527` | Raised, highlight and shadow on navy |
| `--bolt` | `#1AC5FD` | Lightning cyan: the one call to action, seams, active state, focus ring |
| `--bolt-pale` / `--bolt-deep` | `#9BE6FF` / `#0B8FC4` | Bevel light and shade of cyan |
| `--stone` | `#E5E8EE` | Panel and button face (the logo's background gray) |
| `--stone-hi` / `--stone-2` / `--stone-3` | `#FFFFFF` / `#CBD3DE` / `#9AA8BA` | Bevel light, sidebars and disabled, bevel shade |
| `--stone-ink` | `#4F6280` | Secondary text on stone |

Game-meaning colors stay separate from the brand and keep their meaning everywhere:
`--good` green, `--bad` red, `--warn` yellow, team blue `#2F80ED` and team orange
`#F2994A`, and the armor colors from `shared/data/balance.json` (swift yellow, armored blue,
flying white). Don't reuse `--bolt` for "good" or a team; cyan means "act here".

Use cyan sparingly. **Give each screen one cyan call to action at a time.** In the lobby,
"Готов" is cyan until you're ready, then "Старт" becomes cyan once everyone is. Selected
states (active mode tile, placing a defender) may also use cyan, since they answer "what is
on right now".

## Type

- **Pixelify Sans** (OFL, has Cyrillic) for everything: 400 body, 500 secondary, 700 headings and buttons. It's bundled via `@fontsource/pixelify-sans` in `client/src/main.ts`, so the game works offline and behind blocked font CDNs. Outside the client (artifacts, landing pages) load it from Google Fonts with a `system-ui` fallback.
- Many pixel fonts lack Cyrillic (Press Start 2P has it but is too wide for the UI; Silkscreen, Jacquard and Jersey don't). The UI is Russian first, so check Cyrillic before proposing any other face.
- Size scale in px: 11, 12, 13, 14, 16, 20, 24, 32, 48, 64. Uppercase micro-labels (12px) get `letter-spacing: 1px`. Put numbers that tick (timer, resources, HP) in `tabular-nums`.
- Large headings get a hard pixel outline plus a 4px drop (see `.results h1`), never a blurred shadow.

## Pixel-perfect rules

One art pixel = `--px` = 2 CSS px. These rules keep the chrome looking hand-placed.

1. Every border, bevel, offset and shadow is a multiple of `--px`. There are no odd 1px or 3px values.
2. No `border-radius` and no blur in shadows. Round shapes are built from steps: an octagon `clip-path` or pixel rects.
3. The frame is `var(--frame)`: four offset copies of the box, which draw an outline with notched corners and a 2-pixel bottom for depth. Change its color with `--edge` on the element (e.g. red on a targeted card). `--frame` is declared on `*` precisely so this local override works.
4. The bevel is light top-left and dark bottom-right (inset shadows), like lit stone. Pressed controls sink by `--px` and flip the bevel.
5. Motion is stepped (`steps(n)`) rather than eased, and every animation has a `prefers-reduced-motion` fallback.
6. Icons are pixel art: SVG with `shape-rendering="crispEdges"`, one `rect` per run of pixels, shown with `image-rendering: pixelated` (see `client/src/assets/icon-*.svg`). Keep them to an integer multiple of their grid.
7. The sky background uses hard-stop bands (`body`); smooth gradients belong only inside the logo art.

## Medieval motifs (the vocabulary)

Use these, each where it carries meaning, rather than decorating everything:
- **Merlons (crenellations)** on top of primary stone panels (`.panel::before`, `.team::before`). They echo the logo's towers.
- **Pennants** with a swallowtail for team names (`.team h3`), colored with the team color.
- **Ribbons** with notched ends for headline moments: the finale "Мельницу сломал козёл игрока X" (`.finisher`) in navy with cyan edges, the boss or goat alert (`.banner`) in red.
- **Castle wall bars.** The match top and bottom bars are navy with a 2px cyan "lightning seam".
- **Stones.** The Mill health bar is segmented into 8px blocks (`.hpbar div` mask).
- **Hotkey keycaps** as tiny navy tiles with cyan letters (`.key`).

Avoid anything that dilutes it: rounded corners, glassmorphism, emoji as icons, glossy
gradients, parchment and blackletter clichés, and anything borrowed from other games
(names, art, icons, sounds). That last rule is in `CLAUDE.md`, and the brand inherits it.

## Voice

UI copy is Russian, short and direct, with a wink: «Гусь негодует», «Коплю на тарана». Name
things the way the player sees them («Зерно», «Приманка», «Мельница», «Страж»), and use the
names from `balance.json` exactly. Buttons say what happens («Вложить 100 в пушку»).

## Workflow for a UI change

1. Read `client/src/style.css` (tokens and the component you're touching) and `references/components.md`.
2. Build with existing tokens and classes; add a new token only for a new *role*, and add it to the table above.
3. Check the pixel rules (2px grid, frame, bevel, one cyan CTA, stepped motion).
4. Look at it at 1366×768 and 1920×1080. The match HUD must not overlap: top-bar content fits at 1366 wide and the canvas fills its grid cell.
5. Any new external file (font, image) goes into `docs/assets-registry.md` with source and license.

## Outside the game client

For artifacts, landing pages, store images or slides about Millstorm, reuse the same tokens
and components, and put the lockup on stone or the reversed lockup on navy. For AI image
prompts (key art, icons), describe the palette and motifs in words: navy stone, cyan
lightning, pale storm sky, bold flat shapes, thick outlines. Never name other games,
studios or artists (see the originality rules in `docs/design.md`).
