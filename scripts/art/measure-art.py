#!/usr/bin/env python3
"""
Registration check: does a painted return sit where the drawing it replaces sat?

    pnpm art:measure cells                                  # every sliced drop-in vs its recorded fit
    pnpm art:measure cells --sheet unit-fighter-3           # one drawable
    pnpm art:measure strips public/images/attacks/animations --grid 3x3   # per-frame coverage of the 3x3 VFX sheets
    python scripts/art/measure-art.py pairs <dir>           # (template) singles vs single-<id>.png references
    pnpm art:measure cells --set umbrella                   # the Umbrella kite sheets (src/assets/umbrella-art)
    pnpm art:measure frames --set umbrella                  # per FRAME: painted vs reference, and scale drift

umbrella: `cells` reads the per-drawable `walks` entries of this
project's index (a sprite is a one-panel walk; a 3x3 VFX sheet is a
nine-panel one) as well as the template's lattice `sheets`.

The point of this file is that "does the art look right" is answerable by
arithmetic, and the arithmetic finds things the eye does not: a stone a third
too big, a glyph icon off-centre, two walk frames eaten by a flood fill, a
frame whose corners never reach the edge.

`cells` reads `art-sheets/sheet-index.json` — the bench recorded, per panel,
where the DRAWN content sat (`fit`: w/h/cx/cy as fractions of the panel, solid
pixels only) — and measures the sliced file under `public/` the same way. The
slicer already normalised the return onto that box, so a big number here means
the normalisation was refused (a wild return) or switched off (`--no-fit`).

Requires Pillow. No other dependency.
"""
import argparse
import glob
import json
import os
import statistics
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('needs Pillow:  pip install pillow')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# The alpha above which a pixel counts as the subject. Deliberately high: a
# soft glow is light, not extent, and letting a halo into the bounding box is
# how a fitted stone ends up a fraction of the size it should be. The bench and
# the slicer measure at the same floor, or the three disagree about the subject.
SOLID = 140
# Anything at or under this is background for coverage counting.
PRESENT = 16


def bbox(path, alpha=SOLID, magenta_is_bg=True):
    """(w, h, cx, cy) of the drawn content as fractions of the image, or None."""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    px = im.load()
    mnx, mny, mxx, mxy = W, H, -1, -1
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a <= alpha:
                continue
            # A reference sheet is flooded with chroma-key magenta rather than
            # transparency, so both forms of "background" are handled here.
            if magenta_is_bg and r > 190 and g < 70 and b > 190:
                continue
            if x < mnx: mnx = x
            if x > mxx: mxx = x
            if y < mny: mny = y
            if y > mxy: mxy = y
    if mxx < 0:
        return None
    return ((mxx - mnx + 1) / W, (mxy - mny + 1) / H,
            ((mnx + mxx + 1) / 2) / W, ((mny + mxy + 1) / 2) / H)


def judge(ref, got):
    """Worst axis ratio, centre offset and a note, comparing two (w, h, cx, cy)."""
    worst = max(got[0] / ref[0] if ref[0] else 1, got[1] / ref[1] if ref[1] else 1)
    off = max(abs(got[2] - ref[2]), abs(got[3] - ref[3]))
    note = ''
    if worst > 1.15: note = 'OVERSIZE'
    elif worst < 0.80: note = 'undersize'
    if off > 0.05: note = (note + ' OFF-CENTRE').strip()
    return worst, off, note


def print_rows(rows):
    print(f'{"":<28} {"drawn w/h":>12}  {"painted w/h":>12}  {"centre":>13}  {"size":>6}  note')
    for ident, pair, worst, note in rows:
        if not pair:
            print(f'{ident:<28} {"":>12}  {"":>12}  {"":>13}  {"":>6}  {note}')
            continue
        r, p = pair
        print(f'{ident:<28} {r[0]:>5.2f} {r[1]:>6.2f}  {p[0]:>5.2f} {p[1]:>6.2f}  '
              f'{p[2]:>6.2f},{p[3]:>5.2f}  {worst:>5.2f}x  {note}')
    bad = [r for r in rows if r[3]]
    print(f'\n{len(rows) - len(bad)}/{len(rows)} within tolerance'
          + (f' — check: {", ".join(r[0] for r in bad)}' if bad else ''))


def load_index(args):
    """The index and the folder its targets are relative to (--set umbrella:
    art-sheets/umbrella/ and the index's own outDir, src/assets/umbrella-art)."""
    sheets = os.path.join(ROOT, 'art-sheets', args.set) if getattr(args, 'set', '') else os.path.join(ROOT, 'art-sheets')
    index_file = os.path.join(sheets, 'sheet-index.json')
    if not os.path.exists(index_file):
        sys.exit(f'no {os.path.relpath(index_file, ROOT)} - export from the bench first (pnpm art:export)')
    with open(index_file, encoding='utf-8') as f:
        index = json.load(f)
    out = getattr(args, 'out', '') or index.get('outDir', 'public')
    return index, sheets, out if os.path.isabs(out) else os.path.join(ROOT, out)


def cmd_cells(args):
    """Every sliced lattice panel against the fit the bench recorded for it."""
    index, _sheets, out_root = load_index(args)
    rows = []
    for sheet in index.get('sheets', []):
        if args.sheet and sheet['id'] != args.sheet:
            continue
        for cell in sheet.get('cells', []):
            target, fit = cell.get('target'), cell.get('fit')
            if not target or not fit or cell.get('fill'):
                continue
            out = os.path.join(out_root, target)
            if not os.path.exists(out):
                continue
            p = bbox(out, magenta_is_bg=False)
            if not p:
                rows.append((cell['id'], None, None, 'empty'))
                continue
            r = (fit['w'], fit['h'], fit['cx'], fit['cy'])
            worst, _off, note = judge(r, p)
            rows.append((cell['id'], (r, p), worst, note))
    # umbrella: every drawable is a `walk` — measure the written file per
    # frame and take the union, the same box the bench measured on the reference.
    for walk in index.get('walks', []):
        if args.sheet and walk['id'] != args.sheet:
            continue
        target, fit = walk.get('target'), walk.get('fit')
        if not target or not fit:
            continue
        out = os.path.join(out_root, target)
        if not os.path.exists(out):
            continue
        p = union_bbox(out, walk.get('cols', 1), walk.get('rows', 1))
        if not p:
            rows.append((walk['id'], None, None, 'empty'))
            continue
        r = (fit['w'], fit['h'], fit['cx'], fit['cy'])
        worst, _off, note = judge(r, p)
        rows.append((walk['id'], (r, p), worst, note))
    if not rows:
        print(f'nothing sliced yet under {os.path.relpath(out_root, ROOT)}/ for the panels in the index')
        return
    print_rows(rows)


def union_bbox(path, cols, rows, alpha=SOLID):
    """(w, h, cx, cy) of the drawn content, unioned over a cols x rows lattice
    of frames, as fractions of ONE frame — or None when every frame is empty."""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    fw, fh = W // cols, H // rows
    px = im.load()
    x0, y0, x1, y1, any_ = 1.0, 1.0, 0.0, 0.0, False
    for r in range(rows):
        for c in range(cols):
            mnx, mny, mxx, mxy = fw, fh, -1, -1
            for y in range(fh):
                for x in range(fw):
                    if px[c * fw + x, r * fh + y][3] > alpha:
                        if x < mnx: mnx = x
                        if x > mxx: mxx = x
                        if y < mny: mny = y
                        if y > mxy: mxy = y
            if mxx < 0:
                continue
            any_ = True
            x0, y0 = min(x0, mnx / fw), min(y0, mny / fh)
            x1, y1 = max(x1, (mxx + 1) / fw), max(y1, (mxy + 1) / fh)
    if not any_:
        return None
    return (x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2)


def frame_boxes(path, cols, rows, magenta_is_bg, alpha=SOLID):
    """Per frame (w, h, cx, bottom) as fractions of one frame, or None."""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    fw, fh = W // cols, H // rows
    px = im.load()
    out = []
    for r in range(rows):
        for c in range(cols):
            mnx, mny, mxx, mxy = fw, fh, -1, -1
            for y in range(0, fh):
                for x in range(0, fw):
                    pr, pg, pb, pa = px[c * fw + x, r * fh + y]
                    if pa <= alpha or (magenta_is_bg and pr > 190 and pg < 70 and pb > 190):
                        continue
                    if x < mnx: mnx = x
                    if x > mxx: mxx = x
                    if y < mny: mny = y
                    if y > mxy: mxy = y
            out.append(None if mxx < 0 else ((mxx - mnx + 1) / fw, (mxy - mny + 1) / fh, (mnx + mxx + 1) / 2 / fw, (mxy + 1) / fh))
    return out


def cmd_frames(args):
    """Every FRAME of every sliced sheet against the same panel of its reference:
    size ratio, centre and feet-line drift, and how much the painted scale wanders
    from frame to frame (a character whose size drifts between frames is several
    characters, however good each frame looks)."""
    index, sheets, out_root = load_index(args)
    print(f'{"sheet":<20} {"frames":>6} {"size x":>7} {"spread":>7} {"dx max":>7} {"dfeet":>7}  note')
    bad = 0
    n = 0
    for walk in index.get('walks', []):
        if args.sheet and walk['id'] != args.sheet:
            continue
        target = walk.get('target')
        ref = os.path.join(sheets, walk['file'])
        out = os.path.join(out_root, target) if target else ''
        if not target or not os.path.exists(out) or not os.path.exists(ref):
            continue
        cols, rows = walk.get('cols', 1), walk.get('rows', 1)
        rb = frame_boxes(ref, cols, rows, True)
        pb = frame_boxes(out, cols, rows, False)
        ratios, dxs, dfs, empty = [], [], [], []
        for i, (r, p) in enumerate(zip(rb, pb)):
            if r is None:
                continue
            if p is None:
                empty.append(i + 1)
                continue
            ratios.append(((p[0] / r[0]) * (p[1] / r[1])) ** 0.5)
            dxs.append(abs(p[2] - r[2]))
            dfs.append(abs(p[3] - r[3]))
        if not ratios:
            continue
        n += 1
        med = statistics.median(ratios)
        spread = (max(ratios) - min(ratios)) / med if med else 0
        note = []
        if med > 1.2: note.append('OVERSIZE')
        elif med < 0.8: note.append('undersize')
        if spread > 0.25: note.append('SCALE DRIFTS between frames')
        if max(dxs) > 0.08: note.append('OFF-CENTRE frame')
        if walk.get('anchor') == 'feet' and max(dfs) > 0.06: note.append('FEET drift')
        if empty: note.append(f'EMPTY frames {empty}')
        if note: bad += 1
        print(f'{walk["id"]:<20} {len(ratios):>6} {med:>6.2f}x {spread:>6.0%} {max(dxs):>7.3f} {max(dfs):>7.3f}  {", ".join(note)}')
    if not n:
        print(f'nothing sliced yet under {os.path.relpath(out_root, ROOT)}/')
        return
    print(f'\n{n - bad}/{n} sheets register frame by frame')


def cmd_pairs(args):
    """Compare each sliced sprite against the single-object reference it was cut from."""
    scales = dict(kv.split('=') for kv in args.scale)
    rows = []
    for out in sorted(glob.glob(os.path.join(args.out_dir, '*.webp'))):
        ident = os.path.basename(out)[:-5]
        ref = os.path.join(args.ref_dir, f'{args.ref_prefix}{ident}.png')
        if not os.path.exists(ref):
            rows.append((ident, None, None, 'no reference'))
            continue
        r, p = bbox(ref), bbox(out, magenta_is_bg=False)
        if not r or not p:
            rows.append((ident, None, None, 'empty'))
            continue
        k = float(scales.get(ident, 1))
        pk = (p[0] * k, p[1] * k, p[2], p[3])
        worst, _off, note = judge(r, pk)
        rows.append((ident, (r, pk), worst, note))
    print_rows(rows)


def cmd_strips(args):
    """Per-frame coverage of an animation strip. Finds frames eaten by the key."""
    for f in sorted(glob.glob(os.path.join(args.dir, '*.webp'))):
        im = Image.open(f).convert('RGBA')
        W, H = im.size
        px = im.load()
        if args.grid:
            gc, gr = (int(v) for v in args.grid.lower().split('x'))
            fw, fh = W // gc, H // gr
            n = gc * gr
            cov = [sum(1 for y in range((i // gc) * fh, (i // gc + 1) * fh, 2)
                       for x in range((i % gc) * fw, (i % gc + 1) * fw, 2)
                       if px[x, y][3] > PRESENT) for i in range(n)]
        else:
            n = args.frames or (round(W / (H * args.aspect)) if W > H * 1.5 else 1)
            fw = W // n
            cov = [sum(1 for y in range(0, H, 2) for x in range(i * fw, (i + 1) * fw, 2)
                       if px[x, y][3] > PRESENT) for i in range(n)]
        med = statistics.median(cov) or 1
        weak = [i for i, c in enumerate(cov) if c < med * 0.45]
        flag = f'  <-- FRAMES {weak} EATEN' if weak else ''
        print(f'{os.path.basename(f):<28} {W}x{H} n={n} '
              f'weakest {min(cov) / med:.0%} of median{flag}')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('cells', help='sliced lattice panels vs the fit the bench recorded')
    p.add_argument('--sheet', default='', help='only this sheet id, e.g. runes-melee')
    p.add_argument('--set', default='', help='a sheet set under art-sheets/, e.g. umbrella')
    p.set_defaults(func=cmd_cells)

    p = sub.add_parser('frames', help='every sliced frame vs the same panel of its reference')
    p.add_argument('--sheet', default='', help='only this sheet id')
    p.add_argument('--set', default='', help='a sheet set under art-sheets/, e.g. umbrella')
    p.add_argument('--out', default='', help='measure sliced files here instead of the index outDir')
    p.set_defaults(func=cmd_frames)

    p = sub.add_parser('pairs', help='sliced sprites vs their single-object references')
    p.add_argument('out_dir', help='e.g. public/images/runes')
    p.add_argument('--ref-dir', default=os.path.join(ROOT, 'art-sheets', 'singles'))
    p.add_argument('--ref-prefix', default='single-')
    p.add_argument('--scale', nargs='*', default=[],
                   help='runtime blit multipliers, e.g. forge=1.2')
    p.set_defaults(func=cmd_pairs)

    p = sub.add_parser('strips', help='per-frame coverage of animation strips')
    p.add_argument('dir', help='e.g. public/images/monsters')
    p.add_argument('--frames', type=int, default=0, help='override frame count')
    p.add_argument('--grid', default='', help='a cols x rows lattice instead of a strip, e.g. 3x3 '
                   '(an impact sheet fades out by design, so its last frames read weak)')
    p.add_argument('--aspect', type=float, default=228 / 256,
                   help='one panel\'s width:height (monsters 228/256, heroes and bolts 1)')
    p.set_defaults(func=cmd_strips)

    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
