#!/usr/bin/env python3
"""Export the Millstorm logo files from the source art.

Usage (from the repo root):
    python3 .claude/skills/millstorm-brand/scripts/brand_exports.py   # needs Pillow

Reads   docs/brand/source/millstorm-logo.webp  (painted windmill + "Millstorm" wordmark, transparent)
Writes  client/public/brand/
          millstorm-logo.png      the full logo, trimmed, 720 px wide (main menu, loading)
          millstorm-logo-sm.png   the same at 320 px wide (small spots, social previews)
          millstorm-mill.png      the windmill alone, square 256 px (match bar, avatars)
          favicon-32/64/180.png   the windmill, square, for tabs and home screens
Re-run after the source changes instead of editing exports by hand.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / "docs/brand/source/millstorm-logo.webp"
OUT = ROOT / "client/public/brand"


def trim(im: Image.Image, threshold: int = 24) -> Image.Image:
    """Crop to visible pixels, ignoring faint specks left by compression."""
    box = im.getchannel("A").point(lambda v: 255 if v > threshold else 0).getbbox()
    return im.crop(box)


def fit_width(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def square(im: Image.Image, size: int, margin: float = 0.04) -> Image.Image:
    inner = round(size * (1 - 2 * margin))
    scale = inner / max(im.size)
    art = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return canvas


def windmill_only(logo: Image.Image) -> Image.Image:
    """The windmill above the wordmark: cut just above the first row of gold lettering."""
    w, h = logo.size
    px = logo.load()

    def gold(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 200 and r > 200 and g > 150 and b < 140

    # Gold rivets on the sails are small; the lettering fills many pixels per row.
    # Search the lower part only: the gold hub of the rotor sits in the upper half.
    cut = next(y for y in range(int(h * 0.6), h) if sum(gold(x, y) for x in range(0, w, 2)) > 0.05 * w)
    # The dark outline and highlights of the letters start a little above the gold fill.
    return trim(logo.crop((0, 0, w, max(1, cut - round(0.035 * h)))))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*"):
        old.unlink()
    logo = trim(Image.open(SRC).convert("RGBA"))
    mill = windmill_only(logo)
    fit_width(logo, 720).save(OUT / "millstorm-logo.png", optimize=True)
    fit_width(logo, 320).save(OUT / "millstorm-logo-sm.png", optimize=True)
    square(mill, 256).save(OUT / "millstorm-mill.png", optimize=True)
    for size in (32, 64, 180):
        square(mill, size, margin=0.02).save(OUT / f"favicon-{size}.png", optimize=True)
    for f in sorted(OUT.iterdir()):
        with Image.open(f) as im:
            print(f"{f.relative_to(ROOT)}  {im.width}x{im.height}")


if __name__ == "__main__":
    main()
