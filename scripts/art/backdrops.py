#!/usr/bin/env python3
"""
Backdrop paintings → shipped drop-ins, plus the anchors the board renderer maps them with.

    pnpm art:backdrops              # process every painting found, write webp + anchors
    pnpm art:backdrops --dry        # measure and report only

Reads `art-sheets/backdrops/painted/` (prompts: `art-sheets/backdrops/PROMPTS-BACKDROPS.md`).
A painting is found under its target stem (`board-field.jpg`) or its guide's
name (`bg-board-field.jpg`), any extension.

Three kinds, three treatments:

* FIELD (the board's floor, portrait). Opaque, shipped as painted. What the
  painter never gets exactly right is WHERE the zones sit, so the rows are
  measured instead of trusted: the rampart's lit front edge (the sharpest
  upward luminance step in the lower 40 %), the end of the battlefield (where
  the rune channels stop glowing, snapped to the dark seam just under it) and
  the two rune channels themselves. They go to
  `src/barrage/render/backdropAnchors.json`; `backdrop.ts` maps painting rows
  onto board rows piecewise from them, so a painting whose rampart sits at
  83 % instead of 92 % still meets the launcher line exactly.
* SCENE (the world around the board, landscape + portrait). Opaque. Image
  models return these with hard horizontal seams — a lighter band with a
  ruled edge, a flat bar along the top. Each seam (a row where the median
  row-to-row jump across the whole width spikes) is healed: the step is
  measured per column, smoothed, and ramped out half above and half below,
  so the brightness meets and the band's content (an aurora) fades instead
  of stopping on a line.
* PLATE (the 9-slice panel, on magenta). Keyed. The key is the magenta
  reachable from the left/right image edge along each row — the plate is
  convex, so that is exactly its outside — which is why a violet gem INSIDE
  the plate is never keyed however magenta-ish it is. The 3 px rim is
  un-mixed from magenta (JPEG smears it into the outline), then the plate is
  trimmed to its bounds and resampled premultiplied.

Requires Pillow + numpy.
"""
import argparse
import glob
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit('needs Pillow + numpy:  pip install pillow numpy')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PAINTED = os.path.join(ROOT, 'art-sheets', 'backdrops', 'painted')
PUBLIC = os.path.join(ROOT, 'public')
ANCHORS = os.path.join(ROOT, 'src', 'barrage', 'render', 'backdropAnchors.json')

# target stem → (kind, public path without extension)
JOBS = [
    ('board-field', 'field', 'images/backdrops/board-field'),
    ('board-field-corrupted', 'field', 'images/backdrops/board-field-corrupted'),
    ('board-field-void', 'field', 'images/backdrops/board-field-void'),
    ('scene-landscape', 'scene', 'images/backdrops/scene-landscape'),
    ('scene-portrait', 'scene', 'images/backdrops/scene-portrait'),
    ('panel-plate', 'plate', 'images/backdrops/panel-plate'),
]
WEBP_Q = {'field': 84, 'scene': 82, 'plate': 88}
PLATE_PX = 512


def find_painting(stem):
    for name in (stem, 'bg-' + stem):
        hits = [p for p in glob.glob(os.path.join(PAINTED, name + '.*'))
                if os.path.splitext(p)[1].lower() in ('.png', '.jpg', '.jpeg', '.webp')]
        if hits:
            return sorted(hits)[0]
    return None


def luma(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


# ─── FIELD ────────────────────────────────────────────────────────────────────
def measure_field(a):
    H, W, _ = a.shape
    L = luma(a)
    Lc = L[:, int(W * 0.2):int(W * 0.8)].mean(axis=1)

    # Rampart edge: the strongest upward step (a lit coping) in the lower 40 %.
    best, by = -1.0, -1
    for y in range(int(H * 0.6), int(H * 0.97)):
        d = Lc[y:y + 4].mean() - Lc[y - 8:y - 2].mean()
        if d > best:
            best, by = d, y
    if best < 25:
        raise ValueError(f'no rampart edge found (strongest step {best:.1f})')
    lo, hi = Lc[by - 8:by - 2].mean(), Lc[by:by + 4].mean()
    edge = by - 4
    while Lc[edge] < (lo + hi) / 2:
        edge += 1

    # Rune channels: the most saturated-and-bright column in each outer 15 %.
    glow = (a.max(axis=2) - a.min(axis=2)) * a.max(axis=2) / 255.0
    colp = glow[int(H * 0.25):int(H * 0.6)].mean(axis=0)
    cut = int(W * 0.15)
    lx = int(np.argmax(colp[:cut]))
    rx = W - cut + int(np.argmax(colp[W - cut:]))
    if colp[lx] < 12 or colp[rx] < 12:
        raise ValueError(f'no rune channels found (peaks {colp[lx]:.1f} / {colp[rx]:.1f})')
    # Glow extent of each channel: walk out while above a quarter of the peak.
    rl = lx
    while rl > 0 and colp[rl - 1] > colp[lx] * 0.25:
        rl -= 1
    rr = rx
    while rr < W - 1 and colp[rr + 1] > colp[rx] * 0.25:
        rr += 1

    # End of the battlefield: where the channels stop glowing (smoothed over a
    # glyph gap), snapped to the darkest seam row just below it.
    prof = (glow[:, max(0, lx - 3):lx + 4].mean(axis=1) + glow[:, max(0, rx - 3):rx + 4].mean(axis=1)) / 2
    ps = np.convolve(prof, np.ones(24) / 24, mode='same')
    med = float(np.median(ps[int(H * 0.25):int(H * 0.6)]))
    y = int(H * 0.6)
    while y < edge and ps[y] > med * 0.35:
        y += 1
    lo_y, hi_y = max(0, y - 5), min(edge - 1, y + 25)
    threshold = lo_y + int(np.argmin(Lc[lo_y:hi_y + 1]))
    if not (H * 0.5 < threshold < edge):
        raise ValueError(f'threshold {threshold} not between half height and the edge {edge}')

    return {'w': W, 'h': H, 'threshold': threshold, 'edge': edge, 'runeL': rl, 'runeR': rr}


# ─── SCENE ────────────────────────────────────────────────────────────────────
def find_seams(a, thresh=9.0):
    H = a.shape[0]
    d = np.median(np.abs(a[1:] - a[:-1]).sum(axis=2), axis=1)
    rows = [y for y in range(3, H - 4) if d[y] > thresh]
    seams = []
    for y in rows:
        if seams and y - seams[-1][1] <= 6:
            seams[-1][1] = y + 1
        else:
            seams.append([y, y + 1])
    return seams, d


def smooth_x(v, sigma):
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.pad(v, ((r, r), (0, 0)), mode='edge')
    out = np.empty_like(v)
    for ch in range(v.shape[1]):
        out[:, ch] = np.convolve(pad[:, ch], k, mode='valid')
    return out


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def heal_seams(a):
    H = a.shape[0]
    seams, d = find_seams(a)
    span_default = int(H * 0.12)
    out = a.copy()
    for i, (s0, s1) in enumerate(seams):
        prev_end = seams[i - 1][1] if i > 0 else 0
        next_start = seams[i + 1][0] if i + 1 < len(seams) else H
        above = out[max(0, s0 - 7):max(1, s0 - 2)].mean(axis=0)
        below = out[min(H - 1, s1 + 2):min(H, s1 + 7)].mean(axis=0)
        step = smooth_x(below - above, 8.0)
        up = max(1, min(span_default, (s0 - prev_end) // 2 if i > 0 else s0))
        dn = max(1, min(span_default, (next_start - s1) // 2 if i + 1 < len(seams) else H - 1 - s1))
        for y in range(s0 - up, s0):
            out[y] += step * 0.5 * smoothstep((y - (s0 - up)) / up)
        for y in range(s1 + 1, min(H, s1 + 1 + dn)):
            out[y] -= step * 0.5 * smoothstep(1 - (y - s1 - 1) / dn)
        # The transition rows themselves: interpolate across them.
        a0, a1 = max(0, s0 - 2), min(H - 1, s1 + 2)
        for y in range(a0 + 1, a1):
            t = (y - a0) / (a1 - a0)
            out[y] = out[a0] * (1 - t) + out[a1] * t
    after, d2 = find_seams(out)
    return np.clip(out, 0, 255), seams, [(s, float(d[s[0]:s[1] + 1].max())) for s in seams], after


# ─── PLATE ────────────────────────────────────────────────────────────────────
def key_plate(a):
    H, W, _ = a.shape
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    m = (np.minimum(R, B) - G) / 255.0            # 1 on the key, <= 0 on the plate
    hard = m > 0.35
    bg = np.zeros((H, W), bool)
    for y in range(H):
        row = hard[y]
        x = 0
        while x < W and row[x]:
            x += 1
        bg[y, :x] = True
        x = W - 1
        while x >= 0 and row[x]:
            x -= 1
        bg[y, x + 1:] = True
    # Soft rim: 3 px beyond the outside, alpha from how magenta the pixel still is.
    rim = bg.copy()
    for _ in range(3):
        grown = rim.copy()
        grown[1:] |= rim[:-1]
        grown[:-1] |= rim[1:]
        grown[:, 1:] |= rim[:, :-1]
        grown[:, :-1] |= rim[:, 1:]
        rim = grown
    alpha = np.ones((H, W))
    alpha[bg] = 0.0
    edge = rim & ~bg
    alpha[edge] = 1 - np.clip((m[edge] - 0.04) / (0.5 - 0.04), 0, 1)
    K = np.array([255.0, 0.0, 255.0])
    rgb = a.copy()
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.where(edge[..., None], (a - (1 - alpha[..., None]) * K) / safe, rgb)
    rgb = np.clip(rgb, 0, 255)
    ys, xs = np.where(alpha > 0.5)
    if len(ys) == 0:
        raise ValueError('nothing left after keying')
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb, alpha * 255])[y0:y1, x0:x1]
    return rgba, (int(x0), int(y0), int(x1 - x0), int(y1 - y0))


def save_webp(arr, rel, kind, dry):
    path = os.path.join(PUBLIC, rel + '.webp')
    if dry:
        return path, 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    arr = np.clip(np.rint(arr), 0, 255).astype(np.uint8)
    im = Image.fromarray(arr, 'RGBA' if arr.shape[2] == 4 else 'RGB')
    im.save(path, 'WEBP', quality=WEBP_Q[kind], method=6, alpha_quality=100)
    return path, os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--dry', action='store_true', help='measure and report, write nothing')
    args = ap.parse_args()

    anchors = {}
    if os.path.exists(ANCHORS):
        with open(ANCHORS, encoding='utf-8') as f:
            anchors = json.load(f)
    done = 0
    for stem, kind, rel in JOBS:
        src = find_painting(stem)
        if not src:
            print(f'·  {stem:24s} no painting — the renderer keeps drawing its fallback')
            anchors.pop(stem, None)
            continue
        a = np.asarray(Image.open(src).convert('RGB')).astype(np.float64)
        name = os.path.relpath(src, ROOT).replace('\\', '/')
        if kind == 'field':
            m = measure_field(a)
            anchors[stem] = m
            out, size = save_webp(a, rel, kind, args.dry)
            print(f'✓  {stem:24s} {name}  {m["w"]}x{m["h"]}  battlefield ends {m["threshold"]} '
                  f'({m["threshold"] / m["h"]:.1%}), rampart edge {m["edge"]} ({m["edge"] / m["h"]:.1%}), '
                  f'runes {m["runeL"]}..{m["runeR"]}  → {rel}.webp {size // 1024} KB')
        elif kind == 'scene':
            healed, seams, strengths, after = heal_seams(a)
            out, size = save_webp(healed, rel, kind, args.dry)
            desc = ', '.join(f'row {s[0]} ({v:.0f})' for s, v in strengths) or 'none'
            left = ', '.join(f'row {s[0]}' for s in after) or 'none'
            print(f'✓  {stem:24s} {name}  {a.shape[1]}x{a.shape[0]}  seams healed: {desc}; left after: {left}'
                  f'  → {rel}.webp {size // 1024} KB')
            if after:
                print(f'!  {stem}: seams survive the heal — look at it, and consider a re-roll')
        else:
            rgba, box = key_plate(a)
            im = Image.fromarray(np.clip(np.rint(rgba), 0, 255).astype(np.uint8), 'RGBA')
            im = im.convert('RGBa').resize((PLATE_PX, PLATE_PX), Image.LANCZOS).convert('RGBA')
            out, size = save_webp(np.asarray(im).astype(np.float64), rel, kind, args.dry)
            print(f'✓  {stem:24s} {name}  plate at {box[0]},{box[1]} {box[2]}x{box[3]} of {a.shape[1]}x{a.shape[0]}'
                  f'  → {rel}.webp {PLATE_PX}x{PLATE_PX} {size // 1024} KB')
        done += 1
    if not args.dry:
        with open(ANCHORS, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(anchors, f, indent=2)
            f.write('\n')
        print(f'\n{done} backdrop(s) written; anchors → {os.path.relpath(ANCHORS, ROOT)}')


if __name__ == '__main__':
    main()
