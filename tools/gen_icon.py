# -*- coding: utf-8 -*-
"""用标准库生成 PWA 像素图标，不依赖 PIL。"""
import os
import struct
import zlib

BG = (18, 20, 28)

C = {
    '.': None,
    'H': (61, 90, 128),
    'S': (240, 196, 155),
    'E': (26, 26, 36),
    'M': (181, 84, 90),
    'C': (42, 95, 74),
    'B': (63, 110, 196),
    'R': (210, 75, 78),
}

SPRITE = [
    '................',
    '....HHHHHHHH....',
    '...HHHHHHHHHH...',
    '...HHHHHHHHHH...',
    '...HSSSSSSSSH...',
    '...HSSSSSSSSH...',
    '....SEESSEES....',
    '....SSSSSSSS....',
    '....SSSMMSSS....',
    '.....SSSSSS.....',
    '...CCBBBBBBCC...',
    '..CCBBBBBBBBCC..',
    '..CCBBBBBBBBCC..',
    '..CCBBRRRRBBCC..',
    '...CBBBBBBBBC...',
    '...BBBBBBBBBB...',
]


def make_png(path, size, pad_ratio=0.14):
    grid = len(SPRITE)
    inner = int(size * (1 - pad_ratio * 2))
    scale = inner // grid
    offset = (size - scale * grid) // 2

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px = BG
            gx = (x - offset) // scale if scale else -1
            gy = (y - offset) // scale if scale else -1
            if 0 <= gx < grid and 0 <= gy < grid and (x - offset) >= 0 and (y - offset) >= 0:
                ch = SPRITE[gy][gx]
                col = C.get(ch)
                if col:
                    px = col
            row += bytes(px)
        rows.append(bytes([0]) + bytes(row))

    raw = b''.join(rows)
    comp = zlib.compress(raw, 9)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
           chunk(b'IDAT', comp) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path, size, 'x', size, len(png), 'bytes')


if __name__ == '__main__':
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, 'assets', 'icons')
    os.makedirs(out, exist_ok=True)
    make_png(os.path.join(out, 'icon-192.png'), 192)
    make_png(os.path.join(out, 'icon-512.png'), 512)
