"""Render every page and report how much of it is still painted light.

Photos and video posters are legitimately bright, so the report is a starting
point for looking, not a pass/fail: anything above a few per cent gets opened.
"""
import glob
import io
import os
import sys

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/out"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/shots"
ONLY = sys.argv[3:] or None


def main():
    os.makedirs(SHOTS, exist_ok=True)
    pages = sorted(os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.html")))
    if ONLY:
        pages = [p for p in pages if p in ONLY]
    rows = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("pageerror", lambda e: rows.append(("JSERR", str(e)[:120])))
        for name in pages:
            errs = []
            pg.on("pageerror", lambda e, s=errs: s.append(str(e)[:90]))
            pg.goto("file://" + os.path.join(ROOT, name))
            pg.wait_for_timeout(1400)
            pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
            pg.wait_for_timeout(200)
            buf = pg.screenshot(full_page=True)
            img = Image.open(io.BytesIO(buf)).convert("RGB")
            img.save(os.path.join(SHOTS, name.replace(".html", ".png")))
            a = np.asarray(img.resize((img.width // 4, img.height // 4))).astype(float)
            lum = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
            light = float((lum > 200).mean()) * 100
            rows.append((name, f"{light:5.1f}% light  h={img.height:6d}  " +
                         ("js:" + errs[0] if errs else "")))
        b.close()
    for n, r in rows:
        print(f"{n:28s} {r}")


if __name__ == "__main__":
    main()
