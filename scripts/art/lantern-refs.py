"""Layout references for the two lantern drawables the bench does not bake.

    python scripts/art/lantern-refs.py          # writes art-sheets/umbrella-lantern/{collect,gate}.png
    python scripts/art/lantern-refs.py --cut    # keys painted/gate.png → src/assets/umbrella-art-lantern/gate.webp
    python scripts/art/lantern-refs.py --cards  # painted/chad-model.png panel 1 → cards/chad-model-card.png
    python scripts/art/lantern-refs.py --fit-pillars  # after slicing: each Walldorf pillar fills its column

The collectibles and the warp gate have no kite sheet (src/umbrella/art/manifest.ts,
EXTRA_SHEETS). Their references are NOTATION on the magenta ground: where each
thing sits and how big it is, nothing about its look.

- collect.png: a 2 x 2 set on the slicer's 256 px panel, cut by `pnpm art:slice:lantern`.
- gate.png: ONE pipe in three SEPARATE pieces (rim / plain tube section / base) with
  magenta between them, because a painter never lands one pipe's band lines on the thirds.
  `--cut` keys it, takes the three pieces apart and stacks them into three equal bands
  (`register_gate`); the game cuts the bands itself (paint.ts `gate`).
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
    gap = third * 0.12
    # Rim with its mouth, a short plain tube section, the base ring: apart, magenta between.
    d.rectangle([4, 4, n - 5, third - gap], fill=green, outline=INK, width=6)
    d.ellipse([n * 0.12, third * 0.14, n * 0.88, third * 0.66], fill=dark, outline=INK, width=4)
    d.rectangle([n * 0.12, third + gap, n * 0.88, 2 * third - gap], fill=green)
    d.rectangle([n * 0.1, 2 * third + gap, n * 0.9, n - 4], fill=INK)
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


def register_gate(img: Image.Image) -> Image.Image:
    """The painted gate is three separate pieces (rim, a short plain tube section, base) with
    magenta between them. Find the three biggest pieces, top to bottom, and stack them into three
    equal bands, each centred at the width it was painted. The tube section loses a few rows top
    and bottom (its cut edges' ink) because the game stretches it. Refuses loudly when the pieces
    are not three, or touch."""
    import numpy as np
    from scipy import ndimage as ndi
    a = np.asarray(img)
    lab, k = ndi.label(a[..., 3] > 128)
    if k < 3:
        sys.exit(f'gate: {k} piece(s) painted, not three separate ones -- repaint it')
    sizes = ndi.sum(np.ones(lab.shape), lab, index=np.arange(1, k + 1))
    big = sorted(np.argsort(sizes)[::-1][:3] + 1, key=lambda i: ndi.find_objects(lab == i)[0][0].start)
    boxes = [ndi.find_objects((lab == i).astype(int))[0] for i in big]
    if sizes[big[2] - 1] < 0.02 * a.shape[0] * a.shape[1]:
        sys.exit('gate: the third piece is a speck, not a base -- repaint it')
    third = img.height // 3
    # The tube piece is painted as a short ring, often seen a little from above: its top
    # shows the opening and its bottom curves. Only its plainest strip of front face is
    # stretchable — the 30 % of its height that changes least from row to row.
    (ty, tx) = boxes[1]
    th = ty.stop - ty.start
    rgb = a[ty.start:ty.stop, tx.start:tx.stop, :3].astype(np.float32)
    diff = np.abs(np.diff(rgb, axis=0)).mean(axis=(1, 2))
    span = max(4, int(th * 0.3))
    lo, hi = int(th * 0.15), th - int(th * 0.15) - span
    s0 = min(range(lo, max(lo + 1, hi)), key=lambda y: diff[y:y + span].mean())
    tube = img.crop((tx.start, ty.start + s0, tx.stop, ty.start + s0 + span)).resize((tx.stop - tx.start, third), Image.LANCZOS)
    out = Image.new('RGBA', (img.width, third * 3), (0, 0, 0, 0))
    left = (img.width - tube.width) // 2
    # Behind the rim's lower half: the tube's top row drawn down, so the rim's curved bottom
    # edge sits ON the tube (no notches of sky) and meets the tube band without a seam.
    out.alpha_composite(tube.crop((0, 0, tube.width, 1)).resize((tube.width, third // 2)), (left, third - third // 2))
    # The base ring is seen a little from above too: keep its front band only (below its
    # opening), so its top is the straight edge the tube stands on.
    (bys, bxs) = boxes[2]
    base_top = bys.start + int((bys.stop - bys.start) * 0.35)
    crops = [(boxes[0][1].start, boxes[0][0].start, boxes[0][1].stop, boxes[0][0].stop), None, (bxs.start, base_top, bxs.stop, bys.stop)]
    for n, (ys, xs) in enumerate(boxes):
        piece = tube if n == 1 else img.crop(crops[n]).resize((xs.stop - xs.start, third), Image.LANCZOS)
        out.alpha_composite(piece, ((img.width - piece.width) // 2, n * third))
        print(f'gate piece {n + 1}: x {xs.start}-{xs.stop}, y {ys.start}-{ys.stop}' + (f' (strip {ty.start + s0}-{ty.start + s0 + span})' if n == 1 else ''))
    return out


def cut() -> None:
    src = next((SHEETS / 'painted' / f'gate{ext}' for ext in ('.png', '.jpg', '.webp') if (SHEETS / 'painted' / f'gate{ext}').exists()), None)
    if src is None:
        sys.exit('no painted/gate.* to cut')
    out = register_gate(key(Image.open(src))).resize((PANEL, PANEL), Image.LANCZOS)
    SHIPPED.mkdir(parents=True, exist_ok=True)
    out.save(SHIPPED / 'gate.webp', 'WEBP', quality=88, method=6)
    print(f'gate.webp {out.size} from {src.name}')


def clean_wisps() -> None:
    """The wind sheet's ribbons run up to their panel's edge, so a panel can hold a sliver of its
    neighbour's ribbon. Per 256 px panel, drop every small piece that touches the panel's border
    (less than 15 % of the panel's biggest ribbon): what is left is the panel's own ribbons."""
    import numpy as np
    from scipy import ndimage as ndi
    p = SHIPPED / 'wind-wisps.webp'
    im = np.array(Image.open(p).convert('RGBA'))
    n = im.shape[0] // 4
    dropped = 0
    for r in range(4):
        for c in range(4):
            a = im[r * n:(r + 1) * n, c * n:(c + 1) * n, 3]
            lab, k = ndi.label(a > 24)
            if k < 2:
                continue
            sizes = ndi.sum(np.ones_like(a), lab, index=np.arange(1, k + 1))
            edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
            for i in edge:
                if sizes[i - 1] < 0.15 * sizes.max():
                    a[ndi.binary_dilation(lab == i, iterations=2)] = 0
                    dropped += 1
    Image.fromarray(im, 'RGBA').save(p, 'WEBP', quality=88, method=6)
    print(f'wind-wisps.webp: {dropped} border slivers removed')


def cards() -> None:
    """A model sheet's first figure (side view, standing) on its own: attached to an animation
    sheet that sets `modelCard` (manifest.ts) in place of the whole 3 x 3 sheet, whose grid and
    poses the painter otherwise copies into the layout."""
    out_dir = SHEETS / 'cards'
    out_dir.mkdir(exist_ok=True)
    for name in ('pweeg-model', 'chad-model'):
        src = SHEETS / 'painted' / f'{name}.png'
        if not src.exists():
            print(f'{name}: not painted yet')
            continue
        im = Image.open(src).convert('RGB')
        w, h = im.size
        card = im.crop((0, 0, w // 3, h // 3)).resize((512, 512), Image.LANCZOS)
        card.save(out_dir / f'{name}-card.png')
        print(f'cards/{name}-card.png: panel 1 of painted/{name}.png')
    # cards/prickbait-card.png is cut by hand from panel 1 of an approved earlier roll (the only one whose
    # spikes, fuse and empty eyes were all right): it is not a model sheet, so it is not rebuilt here.


def fit_pillars() -> None:
    """The game draws Walldorf's caps square to his hitbox (paint.ts `walldorf`), but a painter
    leaves a margin round each pillar, so a painted pillar is narrower and shorter than what it
    hits with. Per column of the sliced body, crop the pillar to its own outline and scale it to
    fill the column: caps, middle and caps keep their order and stay in their thirds."""
    import numpy as np
    from scipy import ndimage as ndi
    p = SHIPPED / 'walldorf-body.webp'
    im = Image.open(p).convert('RGBA')
    cw = im.width // 3
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for c in range(3):
        col = np.array(im.crop((c * cw, 0, (c + 1) * cw, im.height)))
        # Only this column's pillar: a neighbour's cap can reach over the column line.
        lab, k = ndi.label(col[..., 3] > 24)
        own = lab == 1 + int(np.argmax(ndi.sum(np.ones(lab.shape), lab, index=np.arange(1, k + 1))))
        col[~ndi.binary_dilation(own, iterations=2), 3] = 0
        col = Image.fromarray(col, 'RGBA')
        ys, xs = np.nonzero(own.any(axis=1))[0], np.nonzero(own.any(axis=0))[0]
        box = (int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1)
        out.paste(col.crop(box).resize((cw, im.height), Image.LANCZOS), (c * cw, 0))
        print(f'pillar {c + 1}: {box} -> {cw}x{im.height}')
    out.save(p, 'WEBP', quality=88, method=6)


if __name__ == '__main__':
    if '--fit-pillars' in sys.argv:
        fit_pillars()
    elif '--cards' in sys.argv:
        cards()
    elif '--clean-wisps' in sys.argv:
        clean_wisps()
    elif '--cut' in sys.argv:
        cut()
    else:
        collect()
        gate()
        print('collect.png, gate.png')
