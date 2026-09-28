# Workshop components

The live implementations are in `client/src/style.css`. This file explains how each one is
built, so a new component can follow the same recipe instead of copying by eye.

## Contents
1. Outline, ledge, light
2. Buttons
3. Panels: sail canvas in an oak frame
4. Display lettering
5. Flags, ribbons, banners
6. Meters
7. Small parts: hotkey plate, chip, tag, feed line, plaque
8. Icons
9. Recipe for a new component

## 1. Outline, ledge, light

Every framed thing has three layers:
- a 3px `--ink` border (2px on small controls) with rounded corners;
- a solid **ledge** under it: `box-shadow: 0 4px 0 var(--ink)` for controls, or a translucent ink ledge (`0 4px 0 rgba(58,36,20,.3)`) for panels, so they sit on the sky;
- light from the top: a lighter band at the top and a darker band at the bottom of the fill.

No blurred shadows anywhere. The chunky cartoon look depends on hard edges.

## 2. Buttons

Every button reads `--top`, `--face`, `--bottom`, `--text` (and `--depth` for the ledge), so a
variant only changes tokens:

| Variant | Colors | Use |
|---|---|---|
| default | oak (`--wood-hi` / `--wood` / `--wood-lo`), cream text, wood-deep text shadow, faint plank lines | ordinary actions |
| `.primary` | gold, ink text; ledge is teal then ink (`0 3px 0 teal, 0 6px 0 ink`), like the logo's letters | the single call to action |
| `.mode.active`, `.build.active` | teal, cream text | selected state |
| `.danger` | red tile | sell, destructive |
| `:disabled` | cream-lo, cream-ink text | unavailable |
| `.build`, `.send` | cream card, ink text | tiles on the oak bar |
| `.send.locked` | dark wood, greyed unit icon | not unlocked yet |
| `.ghost` | text only; ink, or cream with ink stroke on the sky | tertiary action |

Pressed: `translateY(3px)` and the ledge shrinks to 1px. `.big` buttons get a teal plate with
a gold rivet at each end (`::before`, `::after`); keep 40px side padding so text never
touches them. Sizes: `.small` 13px, default 16px, `.big` 20px, mode tiles 24px.

For an irreversible action, use the in-page two-click confirm (`confirmLeave` in
`client/src/ui/match.ts`), because `confirm()` is unavailable in embedded viewers.

## 3. Panels: sail canvas in an oak frame

```css
.panel {
  background: linear-gradient(180deg, var(--cream-hi), var(--cream));
  border: 3px solid var(--ink);
  border-radius: 16px;
  box-shadow:
    inset 0 0 0 5px var(--wood),        /* oak frame */
    inset 0 0 0 7px var(--wood-lo),     /* frame's inner edge */
    inset 0 9px 0 0 rgba(255,255,255,.35), /* light on the canvas */
    0 6px 0 rgba(58,36,20,.35);         /* ledge */
}
.panel::after { /* teal corner plates with gold rivets: layered gradients at each corner */ }
```

Only `.panel` and `.team` get the corner plates. Cards, tips, awards and the team box are
plain outlined cream, so the plates mark the important blocks. Give framed panels 22px
padding to clear the frame.

## 4. Display lettering

`.display` (and the lobby, loading and results titles, the timer, the banner):

```css
font-family: var(--display);           /* Yeseva One */
color: var(--gold);
-webkit-text-stroke: 6px var(--ink);
paint-order: stroke fill;               /* stroke behind the fill, so letters stay fat */
text-shadow: 0 3px 0 var(--teal-lo), 0 5px 0 var(--ink);
```

Smaller labels on wood or sky use Rubik with a 3–4px ink stroke and cream or gold fill.

## 5. Flags, ribbons, banners

- **Team flag** (`.team h3`): team colour, swallowtail `clip-path`, Yeseva One in cream with a 4px ink stroke.
- **Finale ribbon** (`.finisher`): cream band with ink top and bottom borders and oak ends (spread-negative box-shadows).
- **Alert banner** (`.banner`): red-tile gradient, ink outline, solid ledge, Yeseva One in cream with a 5px ink stroke.

## 6. Meters

- **Mill HP** (`.hpbar`): an outlined pill on `--wood-deep`. The fill is the team colour with a highlight band and stone notches every 15px.
- **Lure** (`.lurebar`): the same pill with a brown fill. It is hidden below 1500px wide; the number stays.

## 7. Small parts

- **Hotkey plate** `.key`: teal, gold 10px letter, 1.5px ink outline, 4px radius.
- **Chip** `.chip`: cream pill, 2px border in the armor colour, and a unit icon.
- **Tag** `.tag`: red-tile pill with an icon, cream 11px text. It's a label, not a control.
- **Feed line** `.line`: cream card with a 5px left rule by tone (good green, bad red, neutral cream-lo, teal for pings).
- **Plaque** (`.status`, `.series`, `.countdown`): a cream pill with a 2px outline, for short text standing on the sky.

## 8. Icons

Use `icon(name, cls)` from `client/src/ui/dom.ts`. Icons are the painted Art Pack pictures,
shown at 18–64px; see `.ico.*` in the CSS for the sizes by role. Put text next to them;
the goose stickers are the only picture-only control, and they carry an `aria-label`.

## 9. Recipe for a new component

1. Decide its role: action (button), container (panel or card), label (flag, tag, plaque) or meter.
2. Start from that recipe and change tokens, not structure.
3. Decide its color by meaning: gold only if it's the action to take, teal only if it shows a selection, red tile only for danger or alerts.
4. Check it on the surfaces it can sit on: cream (ink text), wood and sky (cream or gold text with an ink stroke).
