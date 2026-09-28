# Stormkeep components

The live implementations are in `client/src/style.css`. This file explains how each one
is built, so a new component can follow the same recipe instead of copying pixels by eye.

## Contents
1. The frame and bevel recipe
2. Buttons
3. Panels with merlons
4. Pennant, ribbon, banner
5. Bars and meters
6. Small parts: keycap, chip, tag, feed line
7. Pixel icons
8. Recipe for a new component

## 1. The frame and bevel recipe

```css
/* declared on *, so --edge can be overridden per element */
--frame: 0 -2px 0 0 var(--edge), -2px 0 0 0 var(--edge), 2px 0 0 0 var(--edge), 0 4px 0 0 var(--edge);
--frame-flat: 0 -2px 0 0 var(--edge), -2px 0 0 0 var(--edge), 2px 0 0 0 var(--edge), 0 2px 0 0 var(--edge);

.thing {
  background: var(--stone);
  box-shadow:
    inset 2px 2px 0 0 var(--stone-hi),   /* light from top-left */
    inset -2px -2px 0 0 var(--stone-2),  /* shade bottom-right */
    var(--frame);                         /* notched outline + 2px depth */
}
```

Why four offset shadows instead of `border`? Shifting the box by one art pixel in each
direction draws the outline but leaves each corner pixel empty, which is exactly how
pixel-art boxes are drawn. It also keeps the element's layout box unchanged. Because the
frame sits outside the box, give framed elements `margin: 2px 2px 4px` (buttons already
have it) so neighbors don't overlap the frame.

## 2. Buttons

All buttons read four custom properties, so a variant only changes tokens:

| Variant | `--face` | `--hi` | `--lo` | `--ink` | Use |
|---|---|---|---|---|---|
| default | stone | stone-hi | stone-3 | night | everything |
| `.primary` | bolt | bolt-pale | bolt-deep | night | the single call to action |
| `.danger` | #FFD9D9 | stone-hi | #D98C8C | night | sell, destructive |
| `:disabled` | stone-2 | stone-2 | stone-2 | stone-3 | unavailable |
| `.send.locked` | night-2 | night-3 | night-deep | stone-3 | not unlocked yet (on navy) |
| `.ghost` | none | – | – | inherits | tertiary text action ("Выйти") |

Pressed: `transform: translateY(2px)`, the bevel flips (dark top-left) and the frame turns
`--frame-flat`, so the button visibly sinks into the wall. Sizes: `.small` 13px, default
16px, `.big` 20px, mode tiles 24px.

For an irreversible action, use the in-page two-click confirm (see `confirmLeave` in
`client/src/ui/match.ts`). The first click arms it and turns the text red; `confirm()` is
unavailable in embedded viewers.

## 3. Panels with merlons

`.panel` and `.team` are framed stone plus a `::before` row of merlons:

```css
.panel::before {
  content: ""; position: absolute; left: 0; right: 0; top: -10px; height: 8px;
  background: repeating-linear-gradient(90deg, var(--night) 0 16px, transparent 16px 28px);
  background-position: 6px 0;
}
```

The panel needs `position: relative` and `margin-top: 10px` to make room. Use merlons only
on primary containers (menu blocks, team boxes). Cards, tips and awards stay plain, so the
castle silhouette marks the important blocks.

## 4. Pennant, ribbon, banner

- **Pennant** (team label): `clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 50%, 100% 100%, 0 100%)`, team-colored background, white text with a 2px navy text-shadow.
- **Ribbon** (finale, headline): both ends notched, `polygon(0 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%, 16px 50%)`, navy with 2px cyan top and bottom borders.
- **Banner** (alerts): the same ribbon shape in `--bad`, shown with a stepped keyframe.

## 5. Bars and meters

- Mill HP (`.hpbar`): a navy-deep track with a 2px night-3 ring. The fill is masked into 8px blocks with 2px gaps (`mask: repeating-linear-gradient(90deg, #000 0 8px, transparent 8px 10px)`), and width changes use `steps(6)`.
- Lure (`.lurebar`): the fill is a repeating stripe of two browns, 6+2px.
- Keep new meters on the same 8+2px rhythm so they line up visually with the HP bars.

## 6. Small parts

- **Keycap** `.key`: navy tile, cyan 10px letter, padding 2px 3px, top-left of a button.
- **Chip** `.chip`: stone-hi with `--frame-flat` and a 10px color square framed by a 2px navy ring.
- **Tag** `.tag`: solid `--bad` with white 11px bold text, no frame. It's a label, not a control.
- **Feed line** `.line`: stone with a 4px left rule colored by tone (good, bad, stone-3 for neutral, bolt for pings).

## 7. Pixel icons

`client/src/assets/icon-grain.svg` and `icon-lure.svg` are 10×10 grids. Draw new icons the
same way: plan the grid as text rows, emit one `<rect>` per horizontal run, set
`shape-rendering="crispEdges"` and add a `<title>`. Outline with `--night` (#0E213B), and
display at an integer multiple (20px = ×2). Put them in `client/src/assets/` so Vite
bundles and hashes them for both the online and the offline build.

## 8. Recipe for a new component

1. Decide its role: control (button recipe), container (panel), label (pennant/tag) or meter (bar).
2. Start from that recipe and change tokens, not the structure.
3. Pick at most one motif, and only if it means something.
4. Check it on both surfaces it can appear on (stone sidebars, navy bars). On navy, use stone text and `--night-*` shades.
