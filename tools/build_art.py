#!/usr/bin/env python3
"""Build runtime art for the client from the source art pack.

Usage (repo root):  python3 tools/build_art.py      # needs Pillow

Reads   art-source/art-pack-01/ (manifest.json + full-size PNG sheets + SVG effects)
Writes  client/public/art/
          field.png/.json   atlas for the Phaser field (towers, enemies, mill, cannon, props, projectiles)
          tiles.png/.json   terrain tiles (separator lines trimmed)
          sky.jpg           background
          fx/*.svg          vector effects, copied as is
          icons/*.png       64-128px icons for the HTML interface
          art.json          per-frame pivot and visible bounds (fractions), used to size sprites

The source frames are 314-1254 px; the game shows them at roughly 20-90 px, so everything is
downscaled here once. Frames whose content spills over a cell edge (bits of a neighbouring
frame) are cleaned: small opaque islands touching the frame edge are removed.
"""
from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art-source/art-pack-01"
OUT = ROOT / "client/public/art"

# Output size (longest side of a frame) per source sheet group.
FIELD_SIZES = {
    "towers": 192,
    "feeder": 192,
    "enemies": 160,
    "bosses": 224,
    "mill-body": 256,
    "mill-rotors": 256,
    "cannon": 160,
    "props": 128,
    "projectiles": 64,
}
BOSSES = {"badger", "locustQueen", "stormcloud"}
TILE = 128
TILE_INSET = 3  # source pixels dropped from each tile edge (sheet separator lines)
ICON = 64
BIG_ICON = 128  # goose emotes and awards are shown larger


def field_group(key: str, file: str) -> str | None:
    if file.startswith("towers/"):
        return "feeder" if key == "feeder" else "towers"
    if file.startswith("enemies/"):
        return "bosses" if key in BOSSES else "enemies"
    if key in ("mill-body", "mill-rotors", "props", "projectiles"):
        return key
    if key.startswith("cannon"):
        return "cannon"
    return None


def clean_edges(im: Image.Image) -> Image.Image:
    """Remove small opaque islands that touch the frame edge (spill from a neighbouring cell)."""
    a = im.getchannel("A")
    w, h = im.size
    px = a.load()
    edge_hit = any(px[x, y] > 40 for x in range(w) for y in (0, 1, h - 2, h - 1)) or any(
        px[x, y] > 40 for y in range(h) for x in (0, 1, w - 2, w - 1)
    )
    if not edge_hit:
        return im
    seen = bytearray(w * h)
    comps = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy] <= 8:
                continue
            q = deque([(sx, sy)])
            seen[sy * w + sx] = 1
            pts = []
            touches = False
            while q:
                x, y = q.popleft()
                pts.append((x, y))
                if x < 2 or y < 2 or x >= w - 2 or y >= h - 2:
                    touches = True
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny] > 8:
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            comps.append((pts, touches))
    total = sum(len(p) for p, _ in comps) or 1
    out = im.copy()
    op = out.load()
    removed = 0
    for pts, touches in comps:
        if touches and len(pts) < 0.12 * total:
            for x, y in pts:
                op[x, y] = (0, 0, 0, 0)
            removed += len(pts)
    return out


def fit(im: Image.Image, size: int) -> tuple[Image.Image, float]:
    scale = size / max(im.size)
    return im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS), scale


def pack(frames: dict[str, Image.Image], pad: int = 2) -> tuple[Image.Image, dict[str, tuple[int, int, int, int]]]:
    """Shelf packer: tallest first, rows up to a square-ish width."""
    order = sorted(frames, key=lambda k: (-frames[k].height, k))
    area = sum((f.width + pad) * (f.height + pad) for f in frames.values())
    width = 256
    while width * width < area * 1.25:
        width *= 2
    x = y = row_h = 0
    pos = {}
    for k in order:
        f = frames[k]
        if x + f.width + pad > width:
            x, y, row_h = 0, y + row_h + pad, 0
        pos[k] = (x, y, f.width, f.height)
        x += f.width + pad
        row_h = max(row_h, f.height)
    height = y + row_h
    sheet = Image.new("RGBA", (width, height))
    for k, (fx, fy, _, _) in pos.items():
        sheet.paste(frames[k], (fx, fy))
    return sheet, pos


def atlas_json(image: str, sheet: Image.Image, pos: dict) -> dict:
    return {
        "frames": {
            k: {
                "frame": {"x": x, "y": y, "w": w, "h": h},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
                "sourceSize": {"w": w, "h": h},
            }
            for k, (x, y, w, h) in sorted(pos.items())
        },
        "meta": {"image": image, "size": {"w": sheet.width, "h": sheet.height}, "scale": "1"},
    }


def icon_name(frame_id: str) -> str:
    return frame_id.replace("/", "-")


def square_icon(im: Image.Image, size: int) -> Image.Image:
    box = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, im.width, im.height)
    art = im.crop(box)
    art, _ = fit(art, size - 4)
    out = Image.new("RGBA", (size, size))
    out.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return out


def main() -> None:
    manifest = json.loads((SRC / "manifest.json").read_text())
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "icons").mkdir(parents=True)
    (OUT / "fx").mkdir()

    field: dict[str, Image.Image] = {}
    tiles: dict[str, Image.Image] = {}
    meta: dict[str, dict] = {}
    icons: dict[str, tuple[Image.Image, int]] = {}

    for sheet in manifest["sheets"]:
        src = Image.open(SRC / sheet["file"]).convert("RGBA")
        group = field_group(sheet["key"], sheet["file"])
        for f in sheet["frames"]:
            fid = f["id"]
            crop = src.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
            if sheet["key"] == "terrain":
                inner = crop.crop((TILE_INSET, TILE_INSET, crop.width - TILE_INSET, crop.height - TILE_INSET)).convert("RGBA")
                tiles[fid] = inner.resize((TILE, TILE), Image.LANCZOS)
                continue
            if sheet["key"] == "sky":
                sky, _ = fit(crop.convert("RGB"), 960)
                sky.save(OUT / "sky.jpg", quality=86)
                continue
            crop = clean_edges(crop)
            l, t, r, b = f["visibleBounds"]
            if group:
                img, scale = fit(crop, FIELD_SIZES[group])
                field[fid] = img
                meta[fid] = {
                    "pivot": [f["pivot"]["x"], f["pivot"]["y"]],
                    "visible": [round(l / f["w"], 4), round(t / f["h"], 4), round(r / f["w"], 4), round(b / f["h"], 4)],
                }
            # Icons for the HTML interface.
            if sheet["file"].startswith("ui/"):
                big = sheet["key"] == "goose-emotes" or "/award/" in fid
                icons[icon_name(fid)] = (crop, BIG_ICON if big else ICON)
            elif sheet["file"].startswith("towers/") or fid.endswith("/side_a") or fid.startswith("cannon/"):
                icons[icon_name(fid)] = (crop, ICON)

    sheet, pos = pack(field)
    sheet.save(OUT / "field.png", optimize=True)
    (OUT / "field.json").write_text(json.dumps(atlas_json("field.png", sheet, pos)))
    tsheet, tpos = pack(tiles, pad=0)
    tsheet.save(OUT / "tiles.png", optimize=True)
    (OUT / "tiles.json").write_text(json.dumps(atlas_json("tiles.png", tsheet, tpos)))
    for name, (im, size) in icons.items():
        square_icon(im, size).save(OUT / "icons" / f"{name}.png", optimize=True)
    for v in manifest["vectors"]:
        shutil.copy(SRC / v["file"], OUT / "fx" / Path(v["file"]).name)
    (OUT / "art.json").write_text(
        json.dumps({"source": "art-pack-01", "enemyRadiusCells": manifest["enemyRadiusCells"], "frames": meta}, indent=1)
    )

    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"field atlas {sheet.size[0]}x{sheet.size[1]} ({len(field)} frames), tiles {tsheet.size} ({len(tiles)}),")
    print(f"{len(icons)} icons, {len(manifest['vectors'])} svg; total {total / 1e6:.2f} MB in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
