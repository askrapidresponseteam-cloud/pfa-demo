"""Compare two builds by what the browser actually computes for every element.

Stronger than a screenshot and far cheaper: for each element it records the tag,
its box to the pixel, and the computed styles that decide how it looks. If two
builds produce the same list, they render the same. Runs the source against
itself first, so anything that moves on its own - a countdown, a shuffled list,
a clock - is measured as noise before the real comparison is read.
"""
import glob, json, os, sys
from playwright.sync_api import sync_playwright

PROBE = """() => {
  const out = [];
  const els = document.querySelectorAll('*');
  for (const e of els) {
    if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
    const r = e.getBoundingClientRect();
    const c = getComputedStyle(e);
    out.push([
      e.tagName, Math.round(r.x), Math.round(r.y),
      Math.round(r.width), Math.round(r.height),
      c.color, c.backgroundColor, c.fontFamily.split(',')[0],
      c.fontSize, c.fontWeight, c.display, c.opacity, c.borderRadius
    ]);
  }
  return out;
}"""

FREEZE = "*,*::before,*::after{transition:none!important;animation:none!important}"


def snap(root, pages):
    got = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
        errs = {}
        for name in pages:
            e = []
            pg.on("pageerror", lambda x, s=e: s.append(str(x)[:80]))
            pg.goto("file://" + os.path.join(root, name))
            pg.wait_for_timeout(900)
            pg.add_style_tag(content=FREEZE)
            pg.evaluate("document.querySelectorAll('.rv').forEach(x=>x.classList.add('in'))")
            pg.wait_for_timeout(250)
            got[name] = pg.evaluate(PROBE)
            if e:
                errs[name] = e[0]
            pg.remove_listener("pageerror", pg.listeners("pageerror")[-1]) if False else None
        b.close()
    return got, errs


def diff(a, b):
    """Count elements whose recorded row differs."""
    if len(a) != len(b):
        return "count %d vs %d" % (len(a), len(b)), abs(len(a) - len(b))
    n = sum(1 for x, y in zip(a, b) if x != y)
    return None, n


if __name__ == "__main__":
    SRC, WORK = sys.argv[1], sys.argv[2]
    pages = sorted(os.path.basename(p) for p in glob.glob(SRC + "/*.html"))
    print("  probing source ...");   a1, e1 = snap(SRC, pages)
    print("  probing source again ..."); a2, _ = snap(SRC, pages)
    print("  probing minified ...");  b1, e2 = snap(WORK, pages)
    print()
    print("  %-30s %10s %12s" % ("page", "noise", "minified"))
    worse = []
    for p in pages:
        m1, n1 = diff(a1[p], a2[p])
        m2, n2 = diff(a1[p], b1[p])
        flag = ""
        if m2 or n2 > max(n1 * 2, n1 + 3):
            flag = "  <-- look"
            worse.append(p)
        print("  %-30s %10s %12s%s" % (p, m1 or n1, m2 or n2, flag))
    print()
    print("  js errors, source:", e1 or "none")
    print("  js errors, minified:", e2 or "none")
    print("  pages needing a look:", worse or "none")
