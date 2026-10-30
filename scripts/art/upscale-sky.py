"""2x sky for high-DPR phones: the lantern sky layers upscaled with Real-ESRGAN (anime 6B, CPU).

    python scripts/art/upscale-sky.py <model.pth>

The model is not in the repo (17 MB): RealESRGAN_x4plus_anime_6B.pth from
https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.2.4 — loaded as weights only.
Each layer is upscaled 4x, then brought down to exactly 2x with Lanczos (the 4x pass adds the
detail, the step down keeps it clean), alpha upscaled alongside, and written as
src/assets/umbrella-art-lantern/<name>@2x.webp. The 1x files are untouched.
"""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'src' / 'assets' / 'umbrella-art-lantern'
LAYERS = ['backdrop-far', 'backdrop-near'] + [f'backdrop-cloud-{i}' for i in range(1, 6)]


class RDB(nn.Module):
    def __init__(self, f=64, g=32):
        super().__init__()
        self.conv1 = nn.Conv2d(f, g, 3, 1, 1)
        self.conv2 = nn.Conv2d(f + g, g, 3, 1, 1)
        self.conv3 = nn.Conv2d(f + 2 * g, g, 3, 1, 1)
        self.conv4 = nn.Conv2d(f + 3 * g, g, 3, 1, 1)
        self.conv5 = nn.Conv2d(f + 4 * g, f, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, f=64):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(f), RDB(f), RDB(f)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, blocks=6, f=64):
        super().__init__()
        self.conv_first = nn.Conv2d(3, f, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(f) for _ in range(blocks)])
        self.conv_body = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_hr = nn.Conv2d(f, f, 3, 1, 1)
        self.conv_last = nn.Conv2d(f, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def upscale4(net, rgb: np.ndarray, tile=256, pad=16) -> np.ndarray:
    """Tiled 4x pass (CPU memory), each tile padded so the seams match."""
    h, w, _ = rgb.shape
    x = torch.from_numpy(rgb.transpose(2, 0, 1)).float().unsqueeze(0) / 255
    out = torch.zeros(1, 3, h * 4, w * 4)
    with torch.no_grad():
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                ya, yb = max(0, y0 - pad), min(h, y0 + tile + pad)
                xa, xb = max(0, x0 - pad), min(w, x0 + tile + pad)
                o = net(x[:, :, ya:yb, xa:xb])
                ty, tx = (y0 - ya) * 4, (x0 - xa) * 4
                th, tw = (min(h, y0 + tile) - y0) * 4, (min(w, x0 + tile) - x0) * 4
                out[:, :, y0 * 4:y0 * 4 + th, x0 * 4:x0 * 4 + tw] = o[:, :, ty:ty + th, tx:tx + tw]
    return (out.clamp(0, 1)[0].numpy().transpose(1, 2, 0) * 255).round().astype(np.uint8)


def main(model: str) -> None:
    torch.set_num_threads(8)
    net = RRDBNet()
    state = torch.load(model, map_location='cpu', weights_only=True)
    net.load_state_dict(state.get('params_ema', state.get('params', state)), strict=True)
    net.eval()
    for name in LAYERS:
        src = Image.open(ART / f'{name}.webp').convert('RGBA')
        w, h = src.size
        rgb = np.array(src.convert('RGB'))
        big = Image.fromarray(upscale4(net, rgb)).resize((w * 2, h * 2), Image.LANCZOS)
        alpha = src.getchannel('A')
        if alpha.getextrema() != (255, 255):
            big.putalpha(alpha.resize((w * 2, h * 2), Image.LANCZOS))
        out = ART / f'{name}@2x.webp'
        big.save(out, 'WEBP', quality=86, method=6)
        print(name, big.size, f'{out.stat().st_size // 1024} kB')


if __name__ == '__main__':
    main(sys.argv[1])
