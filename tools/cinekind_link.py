"""Bring CineKind into the PFA site.

CineKind is the award PFA presents with the Film Federation of India, so it
belongs beside Hall of Fame: the same shelf, recognition rather than service.
It goes into the Explore column of the canonical footer and the Learn group of
the shared menu, which is the same pairing in both places.

The page ships inside the site rather than as an outbound link, so the zip is
self-contained and the links work with nothing deployed. If CineKind later gets
its own domain, TARGET below is the only line that changes.

Every other pass skips cinekind.html: it has its own hero, its own opening line
and its own type scale, and none of the PFA page machinery should touch it.
"""
import glob
import os
import re
import shutil
import sys

SOURCE = "/home/claude/ck/index.html"
TARGET = "cinekind.html"
LABEL = "CineKind Awards"

FOOT_AFTER = '<a href="hall-of-fame.html">Hall of Fame</a>'
MENU_AFTER = '["Hall of Fame", "hall-of-fame.html"]'


def main(root):
    dst = os.path.join(root, TARGET)
    if not os.path.exists(SOURCE):
        print("  cinekind: source not built, skipped"); return
    shutil.copyfile(SOURCE, dst)

    # the lockup is CineKind's own mark, so it returns to CineKind, not to the
    # host site it now sits inside
    s = open(dst, encoding="utf-8").read()
    s = s.replace('<a class="brand" href="/" aria-label="CineKind with People for Animals">',
                  '<a class="brand" href="%s" aria-label="CineKind with People for Animals">' % TARGET, 1)
    open(dst, "w", encoding="utf-8").write(s)

    # footer, on every page that carries the canonical block
    link = '<a href="%s">%s</a>' % (TARGET, LABEL)
    n = 0
    for f in sorted(glob.glob(os.path.join(root, "*.html"))):
        if os.path.basename(f) in (TARGET, "admin.html"):
            continue
        h = open(f, encoding="utf-8").read()
        if link in h or FOOT_AFTER not in h:
            continue
        open(f, "w", encoding="utf-8").write(h.replace(FOOT_AFTER, FOOT_AFTER + link, 1))
        n += 1

    # the shared menu
    js = os.path.join(root, "pfa-header.js")
    m = open(js, encoding="utf-8").read()
    entry = '["%s", "%s"]' % (LABEL, TARGET)
    if entry not in m and MENU_AFTER in m:
        m = m.replace(MENU_AFTER, MENU_AFTER + ",\n      " + entry, 1)
        open(js, "w", encoding="utf-8").write(m)
        menu = "added"
    else:
        menu = "already there"

    print("  cinekind: page shipped, footer link on %d pages, menu %s" % (n, menu))


if __name__ == "__main__":
    main(sys.argv[1])
