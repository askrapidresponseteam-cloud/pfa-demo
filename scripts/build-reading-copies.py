#!/usr/bin/env python3
"""Reading copies of the library's PDFs, for the reader on a phone.

Owner, 7 Oct 2026: "ensure the books load perfectly on mobile as well."

Measured that day on an emulated phone over 4G: most books showed their first
page in 3 to 8 seconds, and the Hindi gaushala manual (68 MB, a 300 dpi scan)
showed nothing for a minute and a half while it pulled down 22 MB. Several
reports carry photographs straight from the camera: the piggery report's first
page alone holds a 4,000 x 2,700 photo of 4.8 MB, to be drawn 390 pixels wide.

So each document gets a reading copy at resources/read/<slug>.pdf:

  - the same pages, text, fonts and drawings, untouched;
  - every photograph or scan larger than a screen can show resized so its long
    side is at most MAX_SIDE pixels (enough for a sharp full-width A4 page on a
    high-density screen), and saved as a JPEG at QUALITY; images already that
    small, masks, and the colour spaces this does not understand are left as
    they are;
  - linearized ("fast web view"), so the first page's objects come first and
    the reader's range requests find them without reading the whole file;
  - named by the document's slug, in plain ASCII.

The reader opens the reading copy; Download still gives the original, as
published. A copy is kept only if it opens and has the same number of pages.

  python3 scripts/build-reading-copies.py            build the missing ones
  python3 scripts/build-reading-copies.py --force    build them all again

Needs pikepdf and Pillow (pip install pikepdf pillow). The copies are files
in the repository; nothing runs at deploy time.
"""

import io
import json
import os
import sys
import subprocess
import tempfile
import zlib

import pikepdf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'resources', 'read')
MAX_SIDE = 1600
QUALITY = 72
# A page drawn as shapes, with no font on it (text converted to outlines, as
# in the Hindi gaushala manual), becomes one picture of itself: it had no text
# to select or search, and 0.7 MB of curves per page is slow for a phone to
# draw. Text pictures get more pixels than photographs.
OUTLINED_PAGE_BYTES = 300_000
PAGE_SIDE = 2000
PAGE_QUALITY = 80
FORCE = '--force' in sys.argv

Image.MAX_IMAGE_PIXELS = None


def components(cs):
    """Colour components of a colour space this builder will rewrite, or 0."""
    if cs is None:
        return 0
    if isinstance(cs, pikepdf.Name):
        return {'/DeviceRGB': 3, '/DeviceGray': 1, '/DeviceCMYK': 4}.get(str(cs), 0)
    if isinstance(cs, pikepdf.Array) and len(cs) >= 2 and str(cs[0]) == '/ICCBased':
        try:
            return int(cs[1].get('/N', 0))
        except Exception:
            return 0
    return 0


def shrink(pdf, stream, done):
    key = stream.objgen
    if key in done:
        return 0
    done.add(key)
    if stream.get('/Subtype') != '/Image' or stream.get('/ImageMask', False):
        return 0
    w, h = int(stream.get('/Width', 0)), int(stream.get('/Height', 0))
    if max(w, h) <= MAX_SIDE:
        return 0
    if int(stream.get('/BitsPerComponent', 8)) != 8:
        return 0
    n = components(stream.get('/ColorSpace'))
    if n not in (1, 3, 4):
        return 0
    if '/Decode' in stream:
        return 0
    before = len(stream.read_raw_bytes())
    try:
        img = pikepdf.PdfImage(stream).as_pil_image()
    except Exception:
        return 0
    scale = MAX_SIDE / float(max(w, h))
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    cs = stream.get('/ColorSpace')
    if n == 4 or img.mode not in ('L', 'RGB'):
        img = img.convert('RGB')
        cs = pikepdf.Name('/DeviceRGB')
    img = img.resize((nw, nh), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=QUALITY, optimize=True)
    data = buf.getvalue()
    if len(data) > before * 0.8:
        return 0

    smask = stream.get('/SMask')
    stream.write(data, filter=pikepdf.Name('/DCTDecode'))
    stream.Width = nw
    stream.Height = nh
    stream.BitsPerComponent = 8
    stream.ColorSpace = cs
    for k in ('/DecodeParms', '/Intent'):
        if k in stream:
            del stream[k]
    if smask is not None and isinstance(smask, pikepdf.Stream):
        try:
            m = pikepdf.PdfImage(smask).as_pil_image().convert('L').resize((nw, nh), Image.LANCZOS)
            smask.write(zlib.compress(m.tobytes(), 9), filter=pikepdf.Name('/FlateDecode'))
            smask.Width = nw
            smask.Height = nh
            smask.BitsPerComponent = 8
            smask.ColorSpace = pikepdf.Name('/DeviceGray')
            if '/DecodeParms' in smask:
                del smask['/DecodeParms']
        except Exception:
            pass
    return before - len(data)


def images_in(resources, seen_res):
    """Every image stream reachable from a resource dictionary, forms included."""
    if resources is None or not isinstance(resources, pikepdf.Dictionary):
        return
    # Only a shared (indirect) dictionary can be met twice; a page's own
    # dictionary is new each time it is read, so it is never skipped.
    if resources.is_indirect:
        if resources.objgen in seen_res:
            return
        seen_res.add(resources.objgen)
    xobjects = resources.get('/XObject')
    if not isinstance(xobjects, pikepdf.Dictionary):
        return
    for _, x in xobjects.items():
        if not isinstance(x, pikepdf.Stream):
            continue
        if x.get('/Subtype') == '/Image':
            yield x
        elif x.get('/Subtype') == '/Form':
            yield from images_in(x.get('/Resources'), seen_res)


def page_bytes(page):
    cs = page.obj.get('/Contents')
    parts = cs if isinstance(cs, pikepdf.Array) else ([cs] if cs is not None else [])
    return sum(len(c.read_raw_bytes()) for c in parts if isinstance(c, pikepdf.Stream))


def has_fonts(resources, seen=None):
    seen = seen if seen is not None else set()
    if not isinstance(resources, pikepdf.Dictionary):
        return False
    fonts = resources.get('/Font')
    if isinstance(fonts, pikepdf.Dictionary) and len(fonts):
        return True
    xobjects = resources.get('/XObject')
    if isinstance(xobjects, pikepdf.Dictionary):
        for _, x in xobjects.items():
            if isinstance(x, pikepdf.Stream) and x.get('/Subtype') == '/Form':
                if x.is_indirect and x.objgen in seen:
                    continue
                if x.is_indirect:
                    seen.add(x.objgen)
                if has_fonts(x.get('/Resources'), seen):
                    return True
    return False


def as_picture(pdf, page, src, number):
    """Replaces a page's drawing with one picture of it, rendered by poppler."""
    if int(page.obj.get('/Rotate', 0)) % 360:
        return False
    box = [float(v) for v in page.obj.get('/CropBox', page.obj.MediaBox)]
    media = [float(v) for v in page.obj.MediaBox]
    if box != media:
        return False
    w, h = box[2] - box[0], box[3] - box[1]
    dpi = PAGE_SIDE / (max(w, h) / 72.0)
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'p')
        subprocess.run(['pdftoppm', '-f', str(number), '-l', str(number), '-r', f'{dpi:.2f}', '-jpeg',
                        '-jpegopt', f'quality={PAGE_QUALITY},optimize=y', '-singlefile', src, out],
                       check=True, capture_output=True)
        data = open(out + '.jpg', 'rb').read()
        with Image.open(out + '.jpg') as im:
            pw, ph = im.size
    if len(data) >= page_bytes(page) * 0.8:
        return False
    image = pikepdf.Stream(pdf, data)
    image.Type = pikepdf.Name('/XObject')
    image.Subtype = pikepdf.Name('/Image')
    image.Width, image.Height = pw, ph
    image.ColorSpace = pikepdf.Name('/DeviceRGB')
    image.BitsPerComponent = 8
    image.Filter = pikepdf.Name('/DCTDecode')
    draw = f'q {w:.4f} 0 0 {h:.4f} {box[0]:.4f} {box[1]:.4f} cm /Pg Do Q'.encode()
    page.obj.Contents = pikepdf.Stream(pdf, zlib.compress(draw), Filter=pikepdf.Name('/FlateDecode'))
    page.obj.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Pg=pdf.make_indirect(image)))
    return True


def build(slug, src):
    dest = os.path.join(OUT, slug + '.pdf')
    if os.path.exists(dest) and not FORCE:
        return 'kept', os.path.getsize(src), os.path.getsize(dest)
    pdf = pikepdf.open(src)
    pages = len(pdf.pages)
    done, seen_res, saved, pictured = set(), set(), 0, 0
    for number, page in enumerate(pdf.pages, start=1):
        if page_bytes(page) > OUTLINED_PAGE_BYTES and not has_fonts(page.obj.get('/Resources')):
            if as_picture(pdf, page, src, number):
                pictured += 1
                continue
        for img in images_in(page.obj.get('/Resources'), seen_res):
            saved += shrink(pdf, img, done)
    tmp = dest + '.tmp'
    pdf.save(tmp, linearize=True, object_stream_mode=pikepdf.ObjectStreamMode.generate,
             compress_streams=True, recompress_flate=False)
    pdf.close()
    with pikepdf.open(tmp) as check:
        if len(check.pages) != pages:
            os.remove(tmp)
            raise RuntimeError(f'{slug}: the copy has {len(check.pages)} pages, the original {pages}')
    os.replace(tmp, dest)
    return 'built' + (f' ({pictured} outlined pages as pictures)' if pictured else ''), os.path.getsize(src), os.path.getsize(dest)


def main():
    os.makedirs(OUT, exist_ok=True)
    lib = json.load(open(os.path.join(ROOT, 'data', 'library.json'), encoding='utf-8'))
    total_in = total_out = 0
    for item in lib['items']:
        src = item.get('pdf')
        if not src or not os.path.exists(os.path.join(ROOT, src)):
            print(f"  {item['slug']}: no PDF on the site, skipped")
            continue
        state, a, b = build(item['slug'], os.path.join(ROOT, src))
        total_in += a
        total_out += b
        print(f"  {item['slug']}: {state}, {a / 1e6:.1f} MB to {b / 1e6:.1f} MB")
    print(f'\n  {total_in / 1e6:.0f} MB of originals, {total_out / 1e6:.0f} MB of reading copies')


if __name__ == '__main__':
    main()
