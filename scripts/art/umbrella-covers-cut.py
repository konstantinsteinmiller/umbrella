"""Umbrella store covers (roadmap #Cover-1, #Logo-1): key the painted logos, cut every cover size.

    python scripts/art/umbrella-covers-cut.py logos   # painted/<style>-logo.png -> public/images/logo/
    python scripts/art/umbrella-covers-cut.py cut     # chosen masters -> src/assets/promotion/<style>/

Every size is cut from the master of its own shape (landscape / square / portrait), cover-fitted.
The "-logo" variants carry the style's logo bottom-right (bottom-centre on a portrait), never top
left, where CrazyGames lays its banners.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'art-sheets' / 'promotion-umbrella'
LOGOS = ROOT / 'public' / 'images' / 'logo'
OUT = ROOT / 'src' / 'assets' / 'promotion'
STYLES = ('lantern', 'clay')

# (w, h, formats, variants) — the roadmap's list; no restriction means jpg + webp, both variants.
BOTH = ('plain', 'logo')
SIZES = [
    (800, 800, ('jpg', 'webp'), BOTH),
    (1920, 1080, ('jpg', 'webp'), BOTH),
    (1080, 1920, ('jpg',), BOTH),
    (800, 1200, ('webp',), BOTH),
    (1360, 850, ('jpg',), ('logo',)),
    (800, 450, ('webp',), ('logo',)),
    (400, 225, ('jpg',), ('logo',)),
    (512, 512, ('jpg',), ('logo',)),
    (628, 628, ('jpg',), ('logo',)),
    (512, 384, ('jpg',), ('logo',)),
    (512, 340, ('jpg',), ('logo',)),
]


def key_logo(src: Path) -> Image.Image:
    """Magenta to alpha, with the pink fringe pulled out of the soft edge, trimmed."""
    im = src.convert('RGB')
    px = im.load()
    w, h = im.size
    out = Image.new('RGBA', (w, h))
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = ((255 - r) ** 2 + g ** 2 + (255 - b) ** 2) ** 0.5
            a = max(0.0, min(1.0, (d - 60) / 90))
            spill = min(r, b) - g
            if spill > 15 and abs(r - b) < min(r, b) * 0.35:
                # Magenta-hued: the painted drop shadow (or an edge) over the magenta. Its magenta
                # share is the background showing through; what is left is a dark shadow.
                po[x, y] = (g, g, g, int(max(0, min(255, 255 - spill))))
                continue
            po[x, y] = (r, g, b, int(a * 255))
    # Trimmed to the solid lettering (a painted vignette leaves faint pixels at the edges), plus a margin.
    x0, y0, x1, y1 = out.getchannel('A').point(lambda a: 255 if a > 200 else 0).getbbox()
    pad = 12
    return out.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))


def master_for(style: str, scene: str, w: int, h: int) -> Image.Image:
    k = w / h
    aspect = '16x9' if k >= 1.2 else '1x1' if k > 0.8 else '9x16'
    return Image.open(DIR / 'painted' / f'{style}-{scene}-{aspect}.png').convert('RGB')


def cover_fit(im: Image.Image, w: int, h: int) -> Image.Image:
    k = max(w / im.width, h / im.height)
    r = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (r.width - w) // 2
    y = (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def place_logo(im: Image.Image, logo: Image.Image) -> Image.Image:
    w, h = im.size
    portrait = h > w * 1.2
    lw = round(w * (0.78 if portrait else 0.5 if h / w > 0.8 else 0.4))
    lh = round(logo.height * lw / logo.width)
    lg = logo.resize((lw, lh), Image.LANCZOS)
    m = round(min(w, h) * 0.04)
    x = (w - lw) // 2 if portrait else w - lw - m
    y = h - lh - m
    out = im.convert('RGBA')
    out.alpha_composite(lg, (x, y))
    return out.convert('RGB')


def save(im: Image.Image, path: Path, fmt: str) -> None:
    if fmt == 'jpg':
        im.save(path, 'JPEG', quality=88, optimize=True, progressive=True)
    else:
        im.save(path, 'WEBP', quality=85, method=6)


def logos() -> None:
    LOGOS.mkdir(parents=True, exist_ok=True)
    for s in STYLES:
        lg = key_logo(Image.open(DIR / 'painted' / f'{s}-logo.png'))
        lg.save(LOGOS / f'logo-{s}.png', optimize=True)
        lg.save(LOGOS / f'logo-{s}.webp', 'WEBP', quality=90, method=6)
        print('logo', s, lg.size)


def cut() -> None:
    chosen = json.loads((DIR / 'chosen.json').read_text(encoding='utf-8'))
    for s in STYLES:
        logo = Image.open(LOGOS / f'logo-{s}.png').convert('RGBA')
        dest = OUT / s
        dest.mkdir(parents=True, exist_ok=True)
        for w, h, fmts, variants in SIZES:
            base = cover_fit(master_for(s, chosen[s], w, h), w, h)
            for v in variants:
                im = place_logo(base, logo) if v == 'logo' else base
                for f in fmts:
                    save(im, dest / f"cover-{w}x{h}{'-logo' if v == 'logo' else ''}.{f}", f)
        print('covers', s, len(list(dest.iterdir())))


if __name__ == '__main__':
    {'logos': logos, 'cut': cut}[sys.argv[1]]()
