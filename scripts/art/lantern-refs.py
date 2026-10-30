"""Layout references for the painted sets' drawables the bench does not bake.

    --set clay   works on the clay set (art-sheets/umbrella-clay → src/assets/umbrella-art-clay)
                 instead of the lantern one. Its gate is a pipe in three pieces, its finish a
                 doorstep, a postbox, a flag and a bunting pennant.

    python scripts/art/lantern-refs.py          # writes art-sheets/umbrella-lantern/{collect,gate,finish-dais}.png
    python scripts/art/lantern-refs.py --cut    # keys painted/gate.png → src/assets/umbrella-art-lantern/gate.webp
    python scripts/art/lantern-refs.py --cards  # painted/chad-model.png panel 1 → cards/chad-model-card.png
    python scripts/art/lantern-refs.py --fit-pillars  # after slicing: each Walldorf pillar fills its column

The collectibles, the warp gate and the finish dais have no kite sheet (src/umbrella/art/manifest.ts,
EXTRA_SHEETS). Their references are NOTATION on the magenta ground: where each
thing sits and how big it is, nothing about its look.

- collect.png, finish-dais.png: 2 x 2 sets on the slicer's 256 px panel, cut by `pnpm art:slice:lantern`.
- gate.png: ONE torii, front-on. A painter never lands its beams on a third of the height, so
  `--cut` keys it and finds its parts instead (`register_gate`): the beams on top, a stretch of the
  two posts, the black feet — each scaled into one of three equal bands, which the game cuts
  itself (paint.ts `gate`).
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
CLAY = '--set' in sys.argv and sys.argv[sys.argv.index('--set') + 1:][:1] == ['clay']
SHEETS = ROOT / 'art-sheets' / ('umbrella-clay' if CLAY else 'umbrella-lantern')
SHIPPED = ROOT / 'src' / 'assets' / ('umbrella-art-clay' if CLAY else 'umbrella-art-lantern')
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
    im = Image.new('RGB', (n, n), MAGENTA)
    d = ImageDraw.Draw(im)
    red, black = (232, 80, 31), (28, 22, 32)
    # The posts, straight down to the ground line, with black feet; the opening between them stays magenta.
    for x0 in (n * 0.17, n * 0.71):
        d.rectangle([x0, n * 0.12, x0 + n * 0.12, n * 0.86], fill=red, outline=INK, width=4)
        d.rectangle([x0 - n * 0.01, n * 0.86, x0 + n * 0.13, n - 4], fill=black, outline=INK, width=4)
    # The kasagi (black, ends sweeping up) over a red beam, the plaque post, the nuki through both posts.
    d.polygon([(4, n * 0.02), (n * 0.2, n * 0.06), (n * 0.8, n * 0.06), (n - 5, n * 0.02), (n * 0.97, n * 0.1), (n * 0.03, n * 0.1)], fill=black, outline=INK)
    d.rectangle([n * 0.07, n * 0.1, n * 0.93, n * 0.15], fill=red, outline=INK, width=4)
    d.rectangle([n * 0.45, n * 0.15, n * 0.55, n * 0.24], fill=red, outline=INK, width=4)
    d.rectangle([n * 0.1, n * 0.24, n * 0.9, n * 0.29], fill=red, outline=INK, width=4)
    im.save(SHEETS / 'gate.png')


def finish_clay() -> None:
    """The clay finish: a doorstep slab (panel 1), a postbox (2) and a flag (3) standing on their
    panel's bottom, a bunting pennant (4) hanging from its panel's top."""
    im = Image.new('RGB', (PANEL * 2, PANEL * 2), MAGENTA)
    d = ImageDraw.Draw(im)
    p = PANEL
    d.rectangle([6, p * 0.42, p - 7, p * 0.62], fill=(173, 150, 112), outline=INK, width=4)
    d.ellipse([6, p * 0.3, p - 7, p * 0.52], fill=(216, 195, 160), outline=INK, width=4)
    d.rectangle([p * 0.3, p * 0.36, p * 0.7, p * 0.46], fill=(138, 90, 52))
    d.rectangle([p * 1.3, p * 0.2, p * 1.7, p - 6], fill=(200, 48, 42), outline=INK, width=4)
    d.rectangle([p * 1.36, p * 0.38, p * 1.64, p * 0.43], fill=INK)
    d.rectangle([p * 0.48, p * 1.2, p * 0.52, p * 2 - 6], fill=(142, 148, 156))
    d.polygon([(p * 0.52, p * 1.2), (p * 0.8, p * 1.28), (p * 0.52, p * 1.36)], fill=(243, 236, 224), outline=INK)
    cx, top = p * 1.5, p + 10
    d.line([cx - 30, top, cx + 30, top], fill=INK, width=3)
    d.polygon([(cx - 28, top), (cx + 28, top), (cx, top + p * 0.45)], fill=(241, 183, 47), outline=INK)
    im.save(SHEETS / 'finish-dais.png')


def wind_paper() -> None:
    """Two plain paper swatches filling their panels, a double chevron and a bold arrow (lantern wind)."""
    im = Image.new('RGB', (PANEL * 2, PANEL * 2), MAGENTA)
    d = ImageDraw.Draw(im)
    p = PANEL
    d.rectangle([0, 0, p - 1, p - 1], fill=(132, 168, 222))
    d.rectangle([p, 0, 2 * p - 1, p - 1], fill=(246, 196, 72))
    cx, cy = p / 2, p * 1.5
    for dx in (-22, 22):
        d.line([(cx + dx - 30, cy - 42), (cx + dx + 18, cy), (cx + dx - 30, cy + 42)], fill=(31, 42, 74), width=16)
    cx = p * 1.5
    d.polygon([(cx + 52, cy), (cx - 18, cy - 50), (cx, cy), (cx - 18, cy + 50)], fill=(90, 44, 12))
    for dy in (-20, 20):
        d.line([(cx - 36, cy + dy), (cx - 86, cy + dy)], fill=(90, 44, 12), width=10)
    im.save(SHEETS / 'wind-paper.png')


def clay_wind() -> None:
    """Four tapered swooshes across their panels, curling at the right end: two blue, two orange (clay wind)."""
    im = Image.new('RGB', (PANEL * 2, PANEL * 2), MAGENTA)
    d = ImageDraw.Draw(im)
    p = PANEL
    for i, col in enumerate(((111, 150, 189), (111, 150, 189), (232, 135, 58), (232, 135, 58))):
        ox, oy = (i % 2) * p, (i // 2) * p
        n = 40
        for k in range(n):
            u = k / n
            x = ox + p * (0.1 + 0.72 * u)
            y = oy + p * 0.5 + math.sin(u * math.pi * (1.5 if i % 2 == 0 else 1.1)) * p * 0.1
            r = 2 + 14 * math.sin(math.pi * u)
            d.ellipse([x - r, y - r, x + r, y + r], fill=col)
        cx, cy = ox + p * 0.84, oy + p * 0.42
        d.arc([cx - 18, cy - 18, cx + 18, cy + 18], 90, 360, fill=col, width=7)
    im.save(SHEETS / 'clay-wind.png')


def gate_pipe() -> None:
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


def finish_dais() -> None:
    im = Image.new('RGB', (PANEL * 2, PANEL * 2), MAGENTA)
    d = ImageDraw.Draw(im)
    p = PANEL
    # Panel 1: the dais — a wide flat ellipse top over a thin rim band, the panel's full width.
    d.rectangle([6, p * 0.42, p - 7, p * 0.62], fill=(184, 54, 26), outline=INK, width=4)
    d.ellipse([6, p * 0.26, p - 7, p * 0.58], fill=(255, 226, 160), outline=INK, width=4)
    d.ellipse([p * 0.3, p * 0.36, p * 0.7, p * 0.48], outline=(208, 138, 42), width=3)
    # Panels 2-4: a tassel and two pennants, each hanging from the top middle of its panel.
    for i, col in ((1, GOLD), (2, (200, 64, 47)), (3, (90, 111, 143))):
        cx, top = (i % 2) * p + p / 2, (i // 2) * p + 8
        if i == 1:
            d.ellipse([cx - 14, top, cx + 14, top + 28], fill=col, outline=INK, width=3)
            d.polygon([(cx - 16, top + 30), (cx + 16, top + 30), (cx + 22, top + p * 0.7), (cx - 22, top + p * 0.7)], fill=col, outline=INK)
        else:
            d.polygon([(cx - 22, top), (cx + 22, top), (cx + 22, top + p * 0.7), (cx, top + p * 0.58), (cx - 22, top + p * 0.7)], fill=col, outline=INK)
    im.save(SHEETS / 'finish-dais.png')


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


def register_pipe(img: Image.Image) -> Image.Image:
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


def register_gate(img: Image.Image) -> Image.Image:
    """The painted torii is one gate. Find its parts by what they are: the BEAMS are the rows wider
    than half the gate (the posts alone are two narrow columns), the FEET the dark rows at the
    bottom, and between them only posts. The top band is everything down to the lowest beam, the
    middle band the plainest stretch of posts (the part the game stretches), the bottom band the
    feet — each scaled into one of three equal bands at its painted x, so the posts stay aligned.
    Refuses loudly when the beams or the posts cannot be found."""
    import numpy as np
    a = np.asarray(img).astype(np.float32)
    h = a.shape[0]
    solid = a[..., 3] > 128
    width = solid.sum(axis=1)
    rows = np.nonzero(width)[0]
    if not len(rows):
        sys.exit('gate: nothing painted -- repaint it')
    top, bottom = int(rows[0]), int(rows[-1]) + 1
    beams = np.nonzero(width[: int(h * 0.6)] > 0.5 * width.max())[0]
    if not len(beams):
        sys.exit('gate: no beams found -- repaint it')
    beam_end = int(beams[-1]) + 1
    # The feet: the dark run at the bottom (black lacquer), else the lowest 12 %.
    lum = np.where(solid, a[..., :3].mean(axis=2), np.nan)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)  # rows with nothing painted: NaN, as wanted
        row_lum = np.nanmean(lum, axis=1)
    feet = bottom
    while feet > beam_end and not np.isnan(row_lum[feet - 1]) and row_lum[feet - 1] < 75:
        feet -= 1
    if bottom - feet < h * 0.04:
        feet = bottom - int((bottom - top) * 0.12)
    span = feet - beam_end
    if span < h * 0.2:
        sys.exit(f'gate: posts too short (beams end {beam_end}, feet start {feet}) -- repaint it')
    # The plainest stretch of posts: the 30 % that changes least from row to row, away from both ends.
    diff = np.abs(np.diff(a[..., :3] * solid[..., None], axis=0)).mean(axis=(1, 2))
    strip = max(4, int(span * 0.3))
    lo, hi = beam_end + int(span * 0.15), feet - int(span * 0.15) - strip
    s0 = min(range(lo, max(lo + 1, hi)), key=lambda y: diff[y:y + strip].mean())
    third = img.height // 3
    out = Image.new('RGBA', (img.width, third * 3), (0, 0, 0, 0))
    for n, (y0, y1) in enumerate(((top, beam_end), (s0, s0 + strip), (feet, bottom))):
        out.alpha_composite(img.crop((0, y0, img.width, y1)).resize((img.width, third), Image.LANCZOS), (0, n * third))
    print(f'gate bands: beams {top}-{beam_end}, posts {s0}-{s0 + strip}, feet {feet}-{bottom}')
    return out


def cut() -> None:
    src = next((SHEETS / 'painted' / f'gate{ext}' for ext in ('.png', '.jpg', '.webp') if (SHEETS / 'painted' / f'gate{ext}').exists()), None)
    if src is None:
        sys.exit('no painted/gate.* to cut')
    out = (register_pipe if CLAY else register_gate)(key(Image.open(src))).resize((PANEL, PANEL), Image.LANCZOS)
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
    """A sheet's first figure (side view, standing) on its own: attached to an animation sheet that
    sets `modelCard` (manifest.ts) in place of the whole sheet, whose grid and poses the painter
    otherwise copies into the layout."""
    out_dir = SHEETS / 'cards'
    out_dir.mkdir(exist_ok=True)
    for name, grid in (('pweeg-model', 3), ('chad-model', 3)):
        src = SHEETS / 'painted' / f'{name}.png'
        if not src.exists():
            print(f'{name}: not painted yet')
            continue
        im = Image.open(src).convert('RGB')
        w, h = im.size
        # A little inside the panel: some returns draw white lines between panels.
        m = int(w * 0.006)
        card = im.crop((m, m, w // grid - m, h // grid - m)).resize((512, 512), Image.LANCZOS)
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
        (gate_pipe if CLAY else gate)()
        (finish_clay if CLAY else finish_dais)()
        if not CLAY:
            wind_paper()
        else:
            clay_wind()
        print('collect.png, gate.png, finish-dais.png')
