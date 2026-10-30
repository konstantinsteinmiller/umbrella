"""Take the painted pupils out of the lantern Walldorf's face, so the game can draw its own pupils that
track the player while the eyes stay put.

    python scripts/art/walldorf-pupils.py              # after `pnpm art:slice:lantern`
    python scripts/art/walldorf-pupils.py --set clay   # after `pnpm art:slice:clay`

Per 4 x 4 panel of src/assets/umbrella-art-lantern/walldorf-face.webp:
  - finds each eye white (a big light component),
  - paints the dark pupil inside it (with its glint) over in the white's own colour,
  - records the eye (centre, half size) and the pupil's radius, as fractions of a panel from its
    centre, in src/umbrella/art/walldorfFaceEyes.json, which paint.ts draws the live pupils from.
A panel with no open eye (the blink) records no eyes. Slicing rewrites the webp: run this after it, once (it edits the webp in place).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
CLAY = '--set' in sys.argv and sys.argv[sys.argv.index('--set') + 1:][:1] == ['clay']
SHEET = ROOT / 'src' / 'assets' / ('umbrella-art-clay' if CLAY else 'umbrella-art-lantern') / 'walldorf-face.webp'
OUT = ROOT / 'src' / 'umbrella' / 'art' / ('walldorfFaceEyes-clay.json' if CLAY else 'walldorfFaceEyes.json')
GRID = 4


def split_tall(comp: np.ndarray) -> list:
    """Two stacked eyes whose whites touch read as one '8': cut it at its narrowest row."""
    ys = np.nonzero(comp.any(axis=1))[0]
    xs = np.nonzero(comp.any(axis=0))[0]
    h, w = ys[-1] - ys[0] + 1, xs[-1] - xs[0] + 1
    if h < w * 1.45:
        return [comp]
    widths = comp.sum(axis=1)
    lo, hi = ys[0] + h // 4, ys[0] + 3 * h // 4
    cut = lo + int(np.argmin(widths[lo:hi]))
    top, bottom = comp.copy(), comp.copy()
    top[cut:] = False
    bottom[:cut] = False
    return [top, bottom]


def main() -> None:
    im = np.array(Image.open(SHEET).convert('RGBA'))
    n = im.shape[0] // GRID
    frames = []
    cleared = 0
    for i in range(GRID * GRID):
        r, c = divmod(i, GRID)
        p = im[r * n:(r + 1) * n, c * n:(c + 1) * n]
        original = p.copy()
        rgb = p[..., :3].astype(np.int32)
        lum = rgb.mean(axis=2)
        solid = p[..., 3] > 128
        # Cream eye whites (brows are a warmer tan: too saturated). A pupil touching the lids cuts its
        # white in two, so close across the pupil and fill: the eye is the whole lens shape.
        light = solid & (lum > 175) & (rgb.max(axis=2) - rgb.min(axis=2) < 70)
        eye_mask = ndi.binary_fill_holes(ndi.binary_closing(light, iterations=10)) & solid
        lab, k = ndi.label(eye_mask)
        eyes = []
        if k:
            sizes = ndi.sum(np.ones(lab.shape), lab, index=np.arange(1, k + 1))
            for j in np.nonzero(sizes > n * n * 0.02)[0]:
                for comp in split_tall(lab == j + 1):
                    ys, xs = np.nonzero(comp)
                    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
                    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
                    ry, rx = (y1 - y0) / 2, (x1 - x0) / 2
                    # Inside the eye's lens, clear of its ink rim: every dark pixel is pupil (or its
                    # shadow under a brow), the light ones it encloses are its glint. The tan brows
                    # are lighter than the threshold, so a brow over the eye stays.
                    yy, xx = np.mgrid[0:n, 0:n]
                    lens = lambda k: ((xx - cx) / (rx * k)) ** 2 + ((yy - cy) / (ry * k)) ** 2 <= 1
                    dark = solid & (lum < 150) & lens(0.86)
                    if dark.sum() < 12:
                        continue
                    pupil = ndi.binary_fill_holes(ndi.binary_dilation(dark, iterations=2)) & lens(0.9)
                    white = rgb[comp & light].reshape(-1, 3)
                    fill = np.median(white, axis=0).astype(np.uint8)
                    p[pupil, :3] = fill
                    p[pupil, 3] = 255
                    cleared += 1
                    eyes.append({
                        'x': round(cx / n - 0.5, 4), 'y': round(cy / n - 0.5, 4),
                        'rx': round(rx / n, 4), 'ry': round(ry / n, 4),
                        'pupil': round(float(np.sqrt(dark.sum() / np.pi)) / n, 4)
                    })
        eyes.sort(key=lambda e: e['y'])
        if len(eyes) not in (0, 2):
            # Not two clear eyes (a squint the finder misreads): this frame keeps its painted
            # pupils and gets no live ones, rather than one of each.
            print(f'  frame {i + 1}: {len(eyes)} eye(s) found -- keeps its painted pupils')
            eyes = []
            p = original
        frames.append(eyes)
        im[r * n:(r + 1) * n, c * n:(c + 1) * n] = p
    if cleared < 8:
        # Run twice, the second pass finds the pupils already gone and would record no eyes.
        sys.exit(f'walldorf-pupils: only {cleared} pupils found -- the face looks cleared already; slice it again first')
    Image.fromarray(im, 'RGBA').save(SHEET, 'WEBP', quality=88, method=6)
    OUT.write_text(json.dumps({'_': 'scripts/art/walldorf-pupils.py: per face frame, its eyes (fractions of a panel from its centre)', 'frames': frames}, indent=1) + '\n', encoding='utf-8', newline='\n')
    print(f'walldorf-face.webp: {cleared} pupils cleared; eyes per frame {[len(f) for f in frames]}')


if __name__ == '__main__':
    main()
