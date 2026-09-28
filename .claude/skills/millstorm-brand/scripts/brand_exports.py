#!/usr/bin/env python3
"""Draw the Millstorm heraldic logo as pixel art and export every brand file.

Usage (from the repo root):
    python3 .claude/skills/millstorm-brand/scripts/brand_exports.py

Needs Pillow (`pip install pillow`). The logo is defined here as code, pixel by
pixel: change the shapes or palette below and re-run instead of editing images.

Outputs in client/public/brand/:
    millstorm-crest.svg / .png      crest (shield, mill, bolt, forks, battlements)
    millstorm-wordmark.svg / .png   pixel blackletter "Millstorm" in gold
    millstorm-lockup.svg / .png     crest above the wordmark on a ribbon
    favicon-32.png, favicon-64.png, favicon-180.png
PNGs are nearest-neighbour upscales (whole-number factors), so pixels stay square.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "client/public/brand"
FONT = ROOT / "docs/brand/fonts/pirata-one-latin-400-normal.woff"

# Palette ("Armorial"). Keep in sync with the tokens in client/src/style.css.
INK = "#2b1d14"
PARCH, PARCH_HI, PARCH_LO = "#ead9b0", "#f6ecd0", "#c9b07a"
GOLD, GOLD_HI, GOLD_LO = "#e2b33c", "#f6d77a", "#a8781e"
VERM, VERM_HI, VERM_LO = "#b8322a", "#d9543f", "#7e1f1a"
AZURE, AZURE_HI, AZURE_LO = "#2f5da8", "#4a7bc8", "#1f3f78"
OAK, OAK_HI, OAK_LO = "#7a4a26", "#9a6534", "#4e2e16"
IRON, IRON_HI = "#5b6770", "#8a97a1"
STONE, STONE_HI, STONE_LO = "#a39c8c", "#c4bdab", "#766f62"

Pixels = dict[tuple[int, int], str]


class Canvas:
    """A sparse pixel grid. Layers are painted with a 1-pixel ink outline, like hand pixel art."""

    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.px: Pixels = {}

    def layer(self, cells: set[tuple[int, int]], fill, outline: str | None = INK) -> None:
        if outline:
            for x, y in cells:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (x + dx, y + dy)
                    if n not in cells and 0 <= n[0] < self.w and 0 <= n[1] < self.h:
                        self.px[n] = outline
        for x, y in cells:
            if 0 <= x < self.w and 0 <= y < self.h:
                self.px[(x, y)] = fill(x, y) if callable(fill) else fill

    def paste(self, other: "Canvas", ox: int, oy: int) -> None:
        for (x, y), c in other.px.items():
            self.px[(x + ox, y + oy)] = c

    def svg(self) -> str:
        rows = []
        for y in range(self.h):
            x = 0
            while x < self.w:
                c = self.px.get((x, y))
                if c is None:
                    x += 1
                    continue
                x2 = x
                while x2 < self.w and self.px.get((x2, y)) == c:
                    x2 += 1
                rows.append(f'<rect x="{x}" y="{y}" width="{x2 - x}" height="1" fill="{c}"/>')
                x = x2
        body = "\n  ".join(rows)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" shape-rendering="crispEdges">\n'
            f"  <title>Millstorm</title>\n  {body}\n</svg>\n"
        )

    def png(self, scale: int) -> Image.Image:
        im = Image.new("RGBA", (self.w, self.h))
        for (x, y), c in self.px.items():
            im.putpixel((x, y), tuple(int(c[i : i + 2], 16) for i in (1, 3, 5)) + (255,))
        return im.resize((self.w * scale, self.h * scale), Image.NEAREST)


def line(x0: int, y0: int, x1: int, y1: int, thick: int = 1) -> set[tuple[int, int]]:
    cells = set()
    n = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(n + 1):
        x = round(x0 + (x1 - x0) * i / n)
        y = round(y0 + (y1 - y0) * i / n)
        for dx in range(thick):
            for dy in range(thick):
                cells.add((x + dx, y + dy))
    return cells


def polygon(points: list[tuple[float, float]], w: int, h: int) -> set[tuple[int, int]]:
    im = Image.new("1", (w, h), 0)
    ImageDraw.Draw(im).polygon(points, fill=1)
    return {(x, y) for y in range(h) for x in range(w) if im.getpixel((x, y))}


# ---------------------------------------------------------------------------- crest

def crest() -> Canvas:
    W, H = 48, 56
    c = Canvas(W, H)
    cx = 23.5

    # Crossed pitchforks behind the shield (the farmer's arms).
    for (bx, by, tx, ty) in ((5, 51, 38, 10), (42, 51, 9, 10)):
        c.layer(line(bx, by, tx, ty, 2), lambda x, y: OAK_HI if (x + y) % 5 == 0 else OAK)
        # crossbar and three tines, pointing along the handle
        dx, dy = tx - bx, ty - by
        L = math.hypot(dx, dy)
        ux, uy = dx / L, dy / L
        px_, py_ = -uy, ux
        tines = set()
        for k in (-3, 0, 3):
            sx = tx + px_ * k
            sy = ty + py_ * k
            tines |= line(round(sx), round(sy), round(sx + ux * 6), round(sy + uy * 6))
        tines |= line(round(tx - px_ * 3), round(ty - py_ * 3), round(tx + px_ * 3), round(ty + py_ * 3))
        c.layer(tines, IRON_HI)

    # Mural crown: battlements over the shield (the keep).
    crown = set()
    for x in range(10, 38):
        for y in range(10, 14):
            crown.add((x, y))
    for mx in range(10, 38, 7):
        for x in range(mx, mx + 4):
            for y in range(6, 10):
                crown.add((x, y))
    c.layer(crown, lambda x, y: STONE_HI if y in (6, 10) else (STONE_LO if y == 13 else STONE))

    # Heater shield: straight sides, then an ogee down to the point.
    top, straight, tip, half = 14, 30, 51, 15.5
    shield = set()
    for y in range(top, tip + 1):
        if y <= straight:
            hw = half
        else:
            t = (y - straight) / (tip - straight)
            hw = half * math.sqrt(max(0.0, 1 - t * t))
        for x in range(W):
            if abs(x + 0.5 - cx - 0.5) <= hw:
                shield.add((x, y))

    def shield_fill(x: int, y: int) -> str:
        # Gold bordure two pixels wide, azure field lit from the left.
        inner = all(
            (x + dx, y + dy) in shield for dx in (-2, -1, 0, 1, 2) for dy in (-2, -1, 0, 1, 2) if abs(dx) + abs(dy) <= 2
        )
        if not inner:
            edge1 = all((x + dx, y + dy) in shield for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            return GOLD_HI if not edge1 and (x < cx) else (GOLD if edge1 else GOLD_LO)
        return AZURE_HI if x < cx - 6 else (AZURE_LO if y > 42 else AZURE)

    c.layer(shield, shield_fill)

    # The mill: stone tower, vermilion cap, four parchment sails.
    tower = polygon([(cx - 6, 46), (cx + 7, 46), (cx + 4, 32), (cx - 3, 32)], W, H)
    c.layer(tower, lambda x, y: STONE_HI if x < cx - 1 else STONE)
    door = {(x, y) for x in range(22, 26) for y in range(41, 46)}
    c.layer(door, OAK_LO, outline=None)
    cap = polygon([(cx - 5, 32), (cx + 6, 32), (cx + 0.5, 26)], W, H)
    c.layer(cap, lambda x, y: VERM_HI if x < cx else VERM)
    hub_x, hub_y = 23, 30
    sails = set()
    for ex, ey in ((hub_x - 9, hub_y - 9), (hub_x + 10, hub_y - 9), (hub_x - 9, hub_y + 10), (hub_x + 10, hub_y + 10)):
        sails |= line(hub_x, hub_y, ex, ey, 2)
    c.layer(sails, lambda x, y: PARCH_HI if (x + y) % 3 else PARCH_LO)
    c.layer({(hub_x, hub_y), (hub_x + 1, hub_y), (hub_x, hub_y + 1), (hub_x + 1, hub_y + 1)}, GOLD_LO)

    # The storm: a gold lightning bolt striking the mill from the chief.
    bolt = polygon([(27, 15), (21, 21), (25, 21), (20, 27), (29, 19), (25, 19), (30, 15)], W, H)
    c.layer(bolt, lambda x, y: GOLD_HI if y < 19 else GOLD)
    return c


# ---------------------------------------------------------------------------- wordmark

def wordmark() -> Canvas:
    font = ImageFont.truetype(str(FONT), 24)
    im = Image.new("1", (160, 40), 0)
    d = ImageDraw.Draw(im)
    d.fontmode = "1"
    d.text((4, 4), "Millstorm", font=font, fill=1)
    im = im.crop(im.getbbox())
    letters = {(x, y) for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))}
    c = Canvas(im.width + 3, im.height + 3)
    # Drop shadow one pixel down, then gold letters with an ink outline.
    shadow = {(x + 1, y + 2) for x, y in letters}
    c.layer(shadow, INK, outline=None)
    shifted = {(x + 1, y + 1) for x, y in letters}
    c.layer(shifted, lambda x, y: GOLD_HI if y <= 5 else (GOLD_LO if y >= im.height - 2 else GOLD))
    return c


def ribbon(w: int, h: int) -> Canvas:
    """A parchment banner with folded, notched tails."""
    c = Canvas(w, h + 6)
    tail = 8
    left = polygon([(0, 4), (tail + 3, 4), (tail + 3, h + 5), (0, h + 5), (4, (h + 9) / 2)], w, h + 6)
    right = polygon([(w - 1, 4), (w - tail - 4, 4), (w - tail - 4, h + 5), (w - 1, h + 5), (w - 5, (h + 9) / 2)], w, h + 6)
    c.layer(left | right, PARCH_LO)
    band = polygon([(tail, 0), (w - tail - 1, 0), (w - tail - 1, h), (tail, h)], w, h + 6)
    c.layer(band, lambda x, y: PARCH_HI if y <= 2 else (PARCH_LO if y >= h - 2 else PARCH))
    return c


def lockup() -> Canvas:
    cr = crest()
    wm = wordmark()
    rb = ribbon(wm.w + 22, wm.h + 6)
    W = max(cr.w, rb.w) + 2
    c = Canvas(W, cr.h + rb.h - 6 + 2)
    c.paste(cr, (W - cr.w) // 2, 0)
    ry = cr.h - 6
    c.paste(rb, (W - rb.w) // 2, ry)
    c.paste(wm, (W - rb.w) // 2 + 11, ry + 3)
    return c


def favicon(size: int) -> Image.Image:
    cr = crest()
    scale = max(1, size // max(cr.w, cr.h))
    art = cr.png(scale) if scale >= 1 else cr.png(1)
    if art.width > size or art.height > size:
        art.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*"):
        old.unlink()
    for name, canvas, scale in (("crest", crest(), 8), ("wordmark", wordmark(), 6), ("lockup", lockup(), 6)):
        (OUT / f"millstorm-{name}.svg").write_text(canvas.svg())
        canvas.png(scale).save(OUT / f"millstorm-{name}.png", optimize=True)
    for size in (32, 64, 180):
        favicon(size).save(OUT / f"favicon-{size}.png", optimize=True)
    for f in sorted(OUT.iterdir()):
        info = ""
        if f.suffix == ".png":
            with Image.open(f) as im:
                info = f"{im.width}x{im.height}"
        print(f"{f.relative_to(ROOT)}  {info}")


if __name__ == "__main__":
    main()
