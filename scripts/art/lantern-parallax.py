"""Cut the lantern backdrop into parallax layers (src/assets/umbrella-art-lantern/).

    python scripts/art/lantern-parallax.py [--debug <dir>]

From the painted night sky (art-sheets/umbrella-lantern/backdrop.png), which keeps
the look that was approved:

  backdrop-far.webp        the sky, the moon, the string lights and the mountains — with the
                           clouds, the sky lanterns and the town taken out (their holes filled
                           from the sky / moon around them, the mountains carried on down
                           under the town). Moves slowest.
  backdrop-cloud-<n>.webp  each big paper cloud, cut out on its own: they drift.
  backdrop-lantern-<n>.webp  a set of sky lanterns of different sizes, with their glow as soft
                           alpha (cut against the filled sky, so they composite back exactly):
                           the game sends many of them rising.
  backdrop-near.webp       the town silhouette with its lit windows (the bottom band, crisp
                           paper edge): moves fastest. The smaller clouds ride on its plane
                           (paint.ts draws two of the cloud cut-outs there).

Pure numpy / scipy / Pillow. `--debug` writes the masks and a contact sheet.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art-sheets' / 'umbrella-lantern' / 'backdrop.png'
OUT = ROOT / 'src' / 'assets' / 'umbrella-art-lantern'
DEBUG = Path(sys.argv[sys.argv.index('--debug') + 1]) if '--debug' in sys.argv else None

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
R, G, B = im[..., 0], im[..., 1], im[..., 2]
lum = 0.299 * R + 0.587 * G + 0.114 * B
yy, xx = np.mgrid[0:H, 0:W]
sx, sy = W / 1376, H / 768  # the masks' regions are written for a 1376 x 768 painting


def box(x0, y0, x1, y1):
    return (xx >= x0 * sx) & (xx < x1 * sx) & (yy >= y0 * sy) & (yy < y1 * sy)


# The string lights stay painted on the far plate (bulbs on a string are not sky lanterns).
garlands = box(0, 185, 290, 260) | box(1040, 0, 1376, 115)
# The moon, measured: its pale disc (lanterns over it filled in), centre and radius from its area.
disc = box(900, 50, 1140, 280) & (lum > 185) & ((im.max(axis=2) - im.min(axis=2)) < 70)
disc = ndi.binary_fill_holes(ndi.binary_closing(disc, iterations=6))
lab, n = ndi.label(disc)
disc = lab == (1 + int(np.argmax(ndi.sum(disc, lab, index=np.arange(1, n + 1)))))
moon_c = (xx[disc].mean(), yy[disc].mean())
moon_r = float(np.sqrt(disc.sum() / np.pi))
moon = (xx - moon_c[0]) ** 2 + (yy - moon_c[1]) ** 2 <= moon_r ** 2

# ── The town: a very dark, reddish plum silhouette (red above green), unlike the blue-violet
#    mountains (red ≈ green) and the lighter purple horizon glow between the roofs ──
town_px = (yy > 540 * sy) & (R - G >= 6) & (lum < 52)
town = ndi.binary_opening(town_px, structure=np.ones((3, 3)), iterations=1)
# Keep what connects to the bottom edge (the silhouette is one band), fill its windows.
lab, _ = ndi.label(town)
bottom_ids = set(np.unique(lab[-3:, :])) - {0}
town = np.isin(lab, list(bottom_ids))
town = ndi.binary_fill_holes(ndi.binary_closing(town, iterations=2))
# The band below the lowest roofs is all town.
town |= yy > 735 * sy

# ── Sky lanterns: warm bright blobs in the sky, their glow around them ──
warm = (R > 140) & (R - B > 55) & (yy < 600 * sy) & ~garlands & ~town
lab, n = ndi.label(ndi.binary_dilation(warm, iterations=1))
lanterns = np.zeros_like(warm)
sizes = ndi.sum(np.ones_like(lum), lab, index=np.arange(1, n + 1))
for i, s in enumerate(sizes, start=1):
    if s >= 4:
        lanterns |= lab == i
# Their glow: everything within a few px that is lighter than the sky around it.
glow_zone = ndi.binary_dilation(lanterns, iterations=int(6 * sx))

# ── Clouds: pale, unsaturated paper shapes in the upper sky (not the moon, not the snowy peaks) ──
mx, mn = im.max(axis=2), im.min(axis=2)
pale = (lum > 105) & ((mx - mn) < 45) & (yy < 400 * sy) & ~moon & ~glow_zone
clouds = ndi.binary_fill_holes(ndi.binary_closing(pale, iterations=3))
lab, n = ndi.label(clouds)
sizes = ndi.sum(np.ones_like(lum), lab, index=np.arange(1, n + 1))
clouds = np.isin(lab, [i for i, s in enumerate(sizes, start=1) if s > 900 * sx * sy])
clouds = ndi.binary_dilation(clouds, iterations=1)  # take the paper's dark cut edge too


def fill(img, hole, sigma, support=None):
    """Fill `hole` from what surrounds it: a normalised (masked) blur. The widest blur fills
    every hole; each finer one then sharpens only where it has enough real pixels around."""
    out = img.copy()
    keep = (~hole & (support if support is not None else True)).astype(np.float32)
    for k, s in enumerate((sigma * 8, sigma * 4, sigma * 2, sigma)):
        w = ndi.gaussian_filter(keep, s)
        ok = hole & ((w > 0.25) if k else (w > 1e-4))
        for c in range(3):
            v = ndi.gaussian_filter(img[..., c] * keep, s) / np.maximum(w, 1e-6)
            out[..., c] = np.where(ok, v, out[..., c])
    return out


# ── The far plate ──
# Wide holes: a lantern's glow and a cloud's paper shadow reach well past their shapes, and a
# hole that stops inside them fills from the halo (a faint ring). The moon fills from moon only.
lantern_holes = ndi.binary_dilation(glow_zone, iterations=int(10 * sx))
cloud_holes = ndi.binary_dilation(clouds, iterations=int(5 * sx))
cloud_holes |= ndi.shift(cloud_holes, (int(7 * sy), 0), order=0)  # the shadow falls below
# The moon is rebuilt rather than patched: a patch along its rim leaves a jagged edge where the
# fill meets the sky. So the sky is filled in behind the whole moon and its glow, the moon's own
# painted texture is kept (only the spots lanterns covered are filled, from moon pixels alone),
# and it goes back on as an anti-aliased disc (a 4× supersampled edge) with a soft halo.
halo = (xx - moon_c[0]) ** 2 + (yy - moon_c[1]) ** 2 <= (moon_r + 26 * sx) ** 2
# Near the moon a lantern always goes, string-light corner or not (it would bleed into the halo).
near_moon_zone = (xx - moon_c[0]) ** 2 + (yy - moon_c[1]) ** 2 <= (moon_r + 70 * sx) ** 2
sky_holes = ((lantern_holes | cloud_holes) & ~(garlands & ~near_moon_zone)) | halo
far = fill(im, sky_holes, 4 * sx, support=~halo)
inner = (xx - moon_c[0]) ** 2 + (yy - moon_c[1]) ** 2 <= (moon_r - 3) ** 2
moon_tex = fill(im, (lantern_holes | cloud_holes | ~inner) & halo, 3 * sx, support=inner & ~lantern_holes & ~cloud_holes)
d = np.hypot(xx - moon_c[0], yy - moon_c[1])
ss = 4
sub = (np.arange(ss) + 0.5) / ss - 0.5
cov = np.zeros_like(d)
for oy in sub:
    for ox in sub:
        cov += np.hypot(xx + ox - moon_c[0], yy + oy - moon_c[1]) <= moon_r - 0.5
cov /= ss * ss
glow = np.clip(1 - (d - moon_r) / (34 * sx), 0, 1) ** 2 * 0.32 * (d > moon_r - 1)
cream = np.array([236.0, 222.0, 196.0])
far = far * (1 - glow[..., None]) + cream * glow[..., None]
far = far * (1 - cov[..., None]) + moon_tex * cov[..., None]
# Under the town the mountains carry on: each column repeats its colour from just above the
# roofs, softened, so a parallax shift never shows a hole.
top_of_town = np.where(town.any(axis=0), town.argmax(axis=0), H)
for x in range(W):
    t = top_of_town[x]
    if t < H:
        src = far[max(0, t - 6):t, x].mean(axis=0) if t > 0 else far[0, x]
        far[t:, x] = src
far = fill(far, ndi.binary_dilation(town, iterations=3) & (yy > 520 * sy), 6 * sx)


def cut(mask, name, soft=False):
    """Crop a cut-out of `mask` (with a margin) from the painting into an RGBA sprite."""
    ys, xs = np.nonzero(mask)
    pad = int(8 * sx)
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    rgb = im[y0:y1, x0:x1]
    if soft:
        # Glow against the filled sky: alpha from how much lighter the painting is there.
        bg = far[y0:y1, x0:x1]
        d = (rgb - bg).max(axis=2)
        a = np.clip(d / 90.0, 0, 1) * ndi.binary_dilation(mask, iterations=int(6 * sx))[y0:y1, x0:x1]
        a = np.maximum(a, ndi.binary_erosion(mask, iterations=1)[y0:y1, x0:x1].astype(np.float32))
        fg = np.clip(bg + (rgb - bg) / np.maximum(a[..., None], 1e-3), 0, 255)
        col = np.where(a[..., None] > 0.02, fg, rgb)
    else:
        a = ndi.gaussian_filter(mask[y0:y1, x0:x1].astype(np.float32), 0.6)
        col = rgb
    rgba = np.dstack([col, a * 255]).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(OUT / f'{name}.webp', 'WEBP', quality=90, method=6)
    return (x0, y0, x1 - x0, y1 - y0)


OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray(far.clip(0, 255).astype(np.uint8)).save(OUT / 'backdrop-far.webp', 'WEBP', quality=86, method=6)

# The town band, full width, from its highest roof down.
ty = int(top_of_town.min()) - 4
near = np.dstack([im[ty:], ndi.gaussian_filter(town[ty:].astype(np.float32), 0.6) * 255]).astype(np.uint8)
Image.fromarray(near, 'RGBA').save(OUT / 'backdrop-near.webp', 'WEBP', quality=88, method=6)

lab, n = ndi.label(clouds)
cloud_boxes = [cut(lab == i, f'backdrop-cloud-{i}') for i in range(1, n + 1)]

# Lanterns: the eight biggest that stand alone — one compact upright blob each, clear of the
# moon (cut over it, the glow would carry the moon's cream) and of its neighbours. The game
# scatters them at sizes of its own.
lab, n = ndi.label(lanterns)
near_moon = ndi.binary_dilation(moon, iterations=int(14 * sx))
cands = []
for i, sl in enumerate(ndi.find_objects(lab), start=1):
    comp = lab == i
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    area = int(comp.sum())
    halo = ndi.binary_dilation(comp, iterations=int(10 * sx))
    alone = not (halo & lanterns & ~comp).any()
    in_sky = sl[0].stop < 420 * sy  # low down, a blob is a falling scrap over the mountains
    if area >= 60 * sx * sy and 0.9 <= h / max(w, 1) <= 1.8 and alone and in_sky and not (comp & near_moon).any():
        cands.append((area, i))
pick = [i for _, i in sorted(cands, reverse=True)[:8]]
lantern_boxes = [cut(lab == i, f'backdrop-lantern-{k + 1}', soft=True) for k, i in enumerate(pick)]

print(f'moon at {moon_c[0]:.1f},{moon_c[1]:.1f} r {moon_r:.1f}; far {W}x{H}; near {W}x{H - ty} from y={ty}; {len(cloud_boxes)} clouds {cloud_boxes}; {len(lantern_boxes)} lanterns {[b[2:] for b in lantern_boxes]}')

if DEBUG:
    DEBUG.mkdir(parents=True, exist_ok=True)
    for name, m in [('town', town), ('lanterns', glow_zone), ('clouds', clouds)]:
        Image.fromarray((m * 255).astype(np.uint8)).save(DEBUG / f'mask-{name}.png')
    Image.fromarray(far.clip(0, 255).astype(np.uint8)).save(DEBUG / 'far.png')
