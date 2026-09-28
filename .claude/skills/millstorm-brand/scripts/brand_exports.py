#!/usr/bin/env python3
"""Regenerate Millstorm logo exports from the source art in docs/brand/source/.

Usage (from the repo root):
    python3 .claude/skills/millstorm-brand/scripts/brand_exports.py

Needs Pillow (`pip install pillow`). Writes transparent, trimmed PNGs to
client/public/brand/. Re-run it whenever the source logo files change instead
of editing exports by hand.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / "docs/brand/source"
OUT = ROOT / "client/public/brand"

# Distance from the flat background at which a pixel counts as fully opaque.
# The cyan lightning is the closest brand colour to the pale background (~207),
# so 170 keeps it solid while edge pixels stay anti-aliased.
OPAQUE_AT = 170.0


def cut_flat_background(im: Image.Image) -> Image.Image:
    """Turn a logo on a flat light background into RGBA with clean edges."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    corners = [rgb.getpixel(p) for p in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    out = Image.new("RGBA", rgb.size)
    src = rgb.load()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            c = src[x, y]
            d = sum((c[i] - bg[i]) ** 2 for i in range(3)) ** 0.5
            a = min(1.0, d / OPAQUE_AT)
            if a <= 0.02:
                dst[x, y] = (0, 0, 0, 0)
                continue
            # Un-mix the background so edges don't keep a grey halo.
            fg = tuple(max(0, min(255, round((c[i] - bg[i] * (1 - a)) / a))) for i in range(3))
            dst[x, y] = (*fg, round(a * 255))
    return out


def trim(im: Image.Image, pad: int = 0) -> Image.Image:
    # Ignore near-invisible specks left by compression noise.
    box = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    im = im.crop(box)
    if pad:
        canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad))
        canvas.paste(im, (pad, pad))
        im = canvas
    return im


def square(im: Image.Image, size: int, margin: float = 0.06) -> Image.Image:
    inner = round(size * (1 - 2 * margin))
    scale = inner / max(im.size)
    fitted = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2), fitted)
    return canvas


STONE = (0xE5, 0xE8, 0xEE)


def reversed_variant(im: Image.Image) -> Image.Image:
    """For dark surfaces: navy becomes stone, the cyan lightning stays cyan."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and not (b > 170 and g > 120 and r < 120):
                px[x, y] = (*STONE, a)
    return out


def fit_width(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    emblem = trim(Image.open(SRC / "millstorm-emblem.webp").convert("RGBA"))
    lockup = trim(cut_flat_background(Image.open(SRC / "millstorm-lockup.webp")))

    # The wordmark is the lower part of the lockup; find the gap under the emblem.
    alpha = lockup.getchannel("A")
    rows = [any(alpha.getpixel((x, y)) > 40 for x in range(0, lockup.width, 3)) for y in range(lockup.height)]
    gap = next(y for y in range(int(lockup.height * 0.6), lockup.height) if not rows[y])
    wordmark = trim(lockup.crop((0, gap, lockup.width, lockup.height)))

    for name, im, width in (("emblem", emblem, 512), ("lockup", lockup, 720), ("wordmark", wordmark, 720)):
        sized = fit_width(im, width)
        sized.save(OUT / f"millstorm-{name}.png", optimize=True)
        reversed_variant(sized).save(OUT / f"millstorm-{name}-reversed.png", optimize=True)
    for size in (32, 64, 180):
        square(emblem, size).save(OUT / f"favicon-{size}.png", optimize=True)
    for f in sorted(OUT.glob("*.png")):
        with Image.open(f) as im:
            print(f"{f.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
