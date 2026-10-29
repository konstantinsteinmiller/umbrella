"""Layout references for the two lantern drawables the bench does not bake.

    python scripts/art/lantern-refs.py          # writes art-sheets/umbrella-lantern/{collect,gate}.png
    python scripts/art/lantern-refs.py --cut    # keys painted/gate.png → src/assets/umbrella-art-lantern/gate.webp

The collectibles and the warp gate have no kite sheet (src/umbrella/art/manifest.ts,
EXTRA_SHEETS). Their references are NOTATION on the magenta ground: where each
thing sits and how big it is, nothing about its look.

- collect.png: a 2 x 2 set on the slicer's 256 px panel, cut by `pnpm art:slice:lantern`.
- gate.png: ONE pipe whose three equal horizontal bands are rim / tube / base. It is
  not a lattice the slicer can register, so `--cut` keys and encodes it directly; the
  game cuts the bands itself (paint.ts `gate`).
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'art-sheets' / 'umbrella-lantern'
SHIPPED = ROOT / 'src' / 'assets' / 'umbrella-art-lantern'
MAGENTA = (255, 0, 255)
GOLD = (246, 194, 53)
INK = (42, 29, 58)
PANEL = 256


def collect() -> None:
    im = Image.new('RGB', (PANEL * 2, PANEL * 2), MAGENTA)
    d = ImageDraw.Draw(im)
    # The box is 48 units across a 256 px panel; the vector collectible spans 32 units.
    r = PANEL * 16 / 48
    for i in range(4):
        cx = (i % 2) * PANEL + PANEL / 2
        cy = (i // 2) * PANEL + PANEL / 2
        if i == 0:
            pts = [(cx + math.cos(-math.pi / 2 + k * math.pi / 5) * (r if k % 2 == 0 else r * 0.46),
                    cy + math.sin(-math.pi / 2 + k * math.pi / 5) * (r if k % 2 == 0 else r * 0.46)) for k in range(10)]
            d.polygon(pts, fill=GOLD, outline=INK, width=4)
        elif i == 1:
            d.pieslice([cx - r, cy - r * 0.95, cx + r, cy + r * 0.95], 180, 360, fill=GOLD, outline=INK, width=4)
            d.line([cx, cy, cx, cy + r * 0.75], fill=INK, width=6)
            d.arc([cx - r * 0.6, cy + r * 0.45, cx, cy + r * 1.05], 0, 180, fill=INK, width=6)
        elif i == 2:
            base = cy + r * 0.55
            for (ox, oy, rr) in [(-0.55, -0.42, 0.42), (-0.1, -0.82, 0.52), (0.52, -0.45, 0.45)]:
                d.ellipse([cx + ox * r - rr * r, base + oy * r - rr * r, cx + ox * r + rr * r, base + oy * r + rr * r], fill=GOLD, outline=INK, width=4)
            d.rectangle([cx - r * 0.85, base - r * 0.42, cx + r * 0.95, base], fill=GOLD)
        else:
            s = r * 0.55
            d.polygon([(cx, cy - s), (cx + s * 0.25, cy - s * 0.25), (cx + s, cy), (cx + s * 0.25, cy + s * 0.25),
                       (cx, cy + s), (cx - s * 0.25, cy + s * 0.25), (cx - s, cy), (cx - s * 0.25, cy - s * 0.25)], fill=(255, 250, 220), outline=INK, width=3)
    im.save(SHEETS / 'collect.png')


def gate() -> None:
    n = PANEL * 3
    third = n // 3
    im = Image.new('RGB', (n, n), MAGENTA)
    d = ImageDraw.Draw(im)
    green, dark = (34, 163, 90), (11, 61, 34)
    d.rectangle([n * 0.12, third, n * 0.88, n - third * 0.25], fill=green, outline=INK, width=6)
    d.rectangle([n * 0.1, n - third * 0.3, n * 0.9, n - 4], fill=INK)
    d.rectangle([4, 4, n - 5, third], fill=green, outline=INK, width=6)
    d.ellipse([n * 0.12, third * 0.18, n * 0.88, third * 0.75], fill=dark, outline=INK, width=4)
    im.save(SHEETS / 'gate.png')


def key(img: Image.Image) -> Image.Image:
    """Magenta → transparent, with a soft edge and the pink fringe pulled out."""
    img = img.convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # How magenta a pixel is: red and blue high, green low.
            m = min(r, b) - g
            if m > 150:
                px[x, y] = (0, 0, 0, 0)
            elif m > 60:
                a = int(255 * (150 - m) / 90)
                px[x, y] = (min(r, g + 40), g, min(b, g + 40), a)
    return img


def cut() -> None:
    src = next((SHEETS / 'painted' / f'gate{ext}' for ext in ('.png', '.jpg', '.webp') if (SHEETS / 'painted' / f'gate{ext}').exists()), None)
    if src is None:
        sys.exit('no painted/gate.* to cut')
    out = key(Image.open(src)).resize((PANEL, PANEL), Image.LANCZOS)
    SHIPPED.mkdir(parents=True, exist_ok=True)
    out.save(SHIPPED / 'gate.webp', 'WEBP', quality=88, method=6)
    print(f'gate.webp {out.size} ← {src.name}')


if __name__ == '__main__':
    if '--cut' in sys.argv:
        cut()
    else:
        collect()
        gate()
        print('collect.png, gate.png')
