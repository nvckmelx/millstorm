# Armorial components

The live implementations are in `client/src/style.css`. This file explains how each one
is built, so a new component can follow the same recipe instead of copying pixels by eye.

## Contents
1. Frame, bevel, rivets
2. Buttons
3. Panels: parchment in an oak frame
4. Illuminated initial
5. Pennant, ribbon, banner
6. Bars and meters
7. Small parts: hotkey plate, chip, tag, feed line
8. Pixel art: icons and the wall
9. Recipe for a new component

## 1. Frame, bevel, rivets

```css
/* declared on *, so --edge can be overridden per element */
--frame: 0 -2px 0 0 var(--edge), -2px 0 0 0 var(--edge), 2px 0 0 0 var(--edge), 0 4px 0 0 var(--edge);
--frame-flat: /* same, with a 2px bottom */;
--rivets: /* four 4×4 iron-hi squares, 6px in from each corner, as background layers */;

button {
  background: var(--rivets), var(--face);
  box-shadow:
    inset 2px 2px 0 0 var(--hi),     /* light from top-left */
    inset -2px -2px 0 0 var(--lo),   /* shade bottom-right */
    var(--frame);                     /* notched ink outline + depth */
}
```

Four offset shadows draw the outline but leave each corner pixel empty, which is how
pixel-art boxes are drawn, and they don't change the layout box. Framed elements need
`margin: 2px 2px 4px` so neighbours don't overlap the frame (buttons already have it).
Rivets are background layers, so a variant that sets `background: var(--face)` alone (small
buttons, tiles) simply has none. Keep rivets on buttons big enough to carry them.

## 2. Buttons

Every button reads `--face`, `--hi`, `--lo` and `--text`, so a variant only changes tokens:

| Variant | Face | Text | Use |
|---|---|---|---|
| default | oak + rivets | parch-hi, 2px oak-lo text shadow | ordinary actions |
| `.primary` | vermilion, gold rim, own bevel | parch-hi | the single call to action (wax seal) |
| `.mode.active`, `.build.active` | gold | ink | selected state |
| `.danger` | verm-lo | parch-hi | sell, destructive |
| `:disabled` | parch-lo, flat | parch-ink | unavailable |
| `.build`, `.send` | parchment tile | ink | cards on the oak bar |
| `.send.locked` | oak-lo | parch-lo | not unlocked yet |
| `.ghost` | none | ink (parch-hi with ink outline on the wall) | tertiary text action |

Pressed: `translateY(2px)`, the bevel flips and the frame turns flat, so the plank sinks.
Sizes: `.small` 13px, default 16px, `.big` 20px, mode tiles 24px.

For an irreversible action, use the in-page two-click confirm (`confirmLeave` in
`client/src/ui/match.ts`), because `confirm()` is unavailable in embedded viewers.

## 3. Panels: parchment in an oak frame

```css
.panel {
  background: var(--parch);
  box-shadow:
    inset 0 0 0 2px var(--oak-lo),   /* outer edge of the frame */
    inset 0 0 0 6px var(--oak),      /* oak moulding */
    inset 0 0 0 8px var(--gold-lo),  /* gilt fillet */
    inset 10px 10px 0 0 var(--parch-hi), /* light on the parchment */
    var(--frame);
}
.panel::after { /* iron corner plates: 8 gradient layers forming L-brackets */ }
```

`.panel` and `.team` get the iron corners. `.tip`, `.award` and `.teambox` get only a 2px oak
line, so importance is visible at a glance. Give panels enough padding (20px) to clear
the 8px frame.

## 4. Illuminated initial

```css
.panel h2::first-letter {
  color: var(--parch-hi);
  background: var(--verm);
  padding: 0 4px;
  box-shadow: 0 0 0 2px var(--gold), 0 0 0 4px var(--ink);
}
```

Use it for section headings only (panel titles, the lobby and loading headings), never for
buttons or body text. One initial per block, as in a manuscript.

## 5. Pennant, ribbon, banner

- **Pennant** (team label): `clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 50%, 100% 100%, 0 100%)`, team color, parch-hi text with a 2px ink text-shadow.
- **Ribbon** (finale): notched at both ends, `polygon(0 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%, 16px 50%)`, parch-hi with 4px vermilion rules top and bottom.
- **Banner** (alerts): the same shape in vermilion with 2px gold rules, shown with a stepped keyframe.

## 6. Bars and meters

- **Mill HP** (`.hpbar`): an oak-deep track with a gold-lo ring and an ink ring. The fill is masked into 8px blocks with 2px gaps; width changes use `steps(6)`.
- **Lure** (`.lurebar`): stripes of two browns, 6+2px.
- New meters keep the 8+2px rhythm so they line up with the HP bars.

## 7. Small parts

- **Hotkey plate** `.key`: iron tile, gold 10px letter, top-left of a tile.
- **Chip** `.chip`: parch-hi with `--frame-flat`, and a 10px color square with a 2px ink ring.
- **Tag** `.tag`: solid vermilion with parch-hi 11px bold text, no frame. It's a label, not a control.
- **Feed line** `.line`: parch-hi with a 4px left rule by tone (good green, bad red, parch-lo neutral, gold-lo for pings).
- **Section labels** in the side columns: vermilion uppercase 12px, like rubrics in a manuscript.

## 8. Pixel art: icons and the wall

`client/src/assets/icon-grain.svg`, `icon-lure.svg` (10×10) and `wall.svg` (32×16, stones
16×8 in running bond) are hand-authored grids. To add one:
1. Plan the grid as text rows.
2. Emit one `<rect>` per horizontal run.
3. Set `shape-rendering="crispEdges"`, outline in `--ink` (#2B1D14), and add a `<title>` for icons.
4. Display at a whole-number multiple.

Keep background textures low-contrast so parchment panels read first. Put the files in
`client/src/assets/` so Vite bundles them for both the online and the offline build.

## 9. Recipe for a new component

1. Decide its role: action (button), container (panel), label (pennant, tag, rubric) or meter (bar).
2. Start from that recipe and change tokens, not structure.
3. Decide its color by meaning: vermilion only if it's the action to take, gold only if it shows a selection.
4. Check it on both backgrounds it can sit on: parchment (ink text) and oak or stone (parch-hi text with an ink outline).
