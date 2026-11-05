# -*- coding: utf-8 -*-
"""版本快照 / 回退工具（纯标准库，不依赖 git）。

用法：
  python tools/version.py snap 1.0.02      把当前代码存成 versions/v1.0.02/
  python tools/version.py restore 1.0.01   把项目还原到 v1.0.01
  python tools/version.py list             列出所有存档

只快照代码与静态资源，不含截图（docs/）、简报（资讯/）、
每日抓取的赛程（assets/gsw-live.json）——后者是时效数据，回退旧版没有意义。
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, 'versions')

FILES = ['index.html', 'styles.css', 'app.js', 'hero.js', 'sw.js',
         'manifest.webmanifest', 'assets/gsw-schedule.json', 'assets/ai-insight.json']


def norm(v):
    return v.strip().lstrip('vV')


def snap(v):
    v = norm(v)
    dst = os.path.join(STORE, 'v' + v)
    if os.path.isdir(dst):
        print('v%s 已存在，覆盖旧存档' % v)
        shutil.rmtree(dst)
    os.makedirs(dst)
    n = 0
    for f in FILES:
        src = os.path.join(ROOT, f)
        if not os.path.exists(src):
            continue
        out = os.path.join(dst, f)
        d = os.path.dirname(out)
        if d:
            os.makedirs(d, exist_ok=True)
        shutil.copy2(src, out)
        n += 1
    print('已存档 v%s，%d 个文件 → versions/v%s' % (v, n, v))


def restore(v):
    v = norm(v)
    src = os.path.join(STORE, 'v' + v)
    if not os.path.isdir(src):
        print('找不到版本 v%s，现有存档见 list' % v)
        return
    n = 0
    for base, _, names in os.walk(src):
        for nm in names:
            s = os.path.join(base, nm)
            rel = os.path.relpath(s, src)
            dst = os.path.join(ROOT, rel)
            d = os.path.dirname(dst)
            if d:
                os.makedirs(d, exist_ok=True)
            shutil.copy2(s, dst)
            n += 1
    print('已还原到 v%s，覆盖 %d 个文件' % (v, n))


def ls():
    if not os.path.isdir(STORE):
        print('还没有任何存档')
        return
    items = sorted(d for d in os.listdir(STORE)
                   if os.path.isdir(os.path.join(STORE, d)))
    if not items:
        print('还没有任何存档')
        return
    for d in items:
        p = os.path.join(STORE, d)
        n = sum(len(f) for _, _, f in os.walk(p))
        print('%s   %d 个文件' % (d, n))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'snap' and len(sys.argv) > 2:
        snap(sys.argv[2])
    elif cmd == 'restore' and len(sys.argv) > 2:
        restore(sys.argv[2])
    else:
        ls()
