# -*- coding: utf-8 -*-
"""把 frames/ 里的 PNG 合成 README 用的演示 GIF

用法: python tools/make-gif.py [frames目录] [输出文件] [宽度]
"""
import os
import sys
import glob
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'frames'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'docs/demo.gif'
WIDTH = int(sys.argv[3]) if len(sys.argv) > 3 else 320
COLORS = 128
FRAME_MS = 450        # 普通帧时长
LAST_MS = 1600        # 最后一帧多停一会儿，方便看清结束状态

files = sorted(glob.glob(os.path.join(SRC, '*.png')))
if not files:
    sys.exit('没有找到帧文件: %s' % SRC)

imgs = []
for f in files:
    im = Image.open(f).convert('RGB')
    h = round(im.height * WIDTH / im.width)
    imgs.append(im.resize((WIDTH, h), Image.LANCZOS))

h = imgs[0].height

# 用所有帧的总和生成一份公共调色板，避免逐帧调色板造成的闪烁
base = Image.new('RGB', (WIDTH, h * len(imgs)), (0, 0, 0))
for i, im in enumerate(imgs):
    base.paste(im, (0, i * h))
pal = base.quantize(colors=COLORS, method=Image.MEDIANCUT)

frames = [im.quantize(palette=pal, dither=Image.NONE) for im in imgs]

durations = [FRAME_MS] * (len(frames) - 1) + [LAST_MS]

os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=True,
    disposal=1,
)

size = os.path.getsize(OUT)
print('帧数 %d  尺寸 %dx%d  颜色 %d' % (len(frames), WIDTH, h, COLORS))
print('输出 %s  %.1f KB' % (OUT, size / 1024.0))
if size > 5 * 1024 * 1024:
    print('⚠ 超过 5MB，GitHub 加载会明显变慢，建议降宽度或减颜色')
elif size > 2 * 1024 * 1024:
    print('提示: 体积偏大，可以把 COLORS 降到 64 或宽度降到 280')
