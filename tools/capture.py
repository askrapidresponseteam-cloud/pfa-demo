"""Render every page to a PNG so a change can be compared pixel for pixel."""
import glob, os, sys, io
from playwright.sync_api import sync_playwright

ROOT, OUT = sys.argv[1], sys.argv[2]
FREEZE = """*,*::before,*::after{transition:none!important;animation:none!important}"""

def main():
    os.makedirs(OUT, exist_ok=True)
    pages = sorted(os.path.basename(p) for p in glob.glob(ROOT + "/*.html"))
    if len(sys.argv) > 4:
        pages = pages[int(sys.argv[3]):int(sys.argv[4])]
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        for name in pages:
            errs = []
            h = lambda e, s=errs: s.append(str(e)[:90])
            pg.on("pageerror", h)
            pg.goto("file://" + os.path.join(ROOT, name)); pg.wait_for_timeout(900)
            pg.add_style_tag(content=FREEZE)
            pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
            # walk the page so lazy images are all requested before the shot,
            # otherwise a full-page capture races them and a band comes out blank
            pg.evaluate("""async () => {
              const step = window.innerHeight;
              for (let y = 0; y < document.body.scrollHeight; y += step) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 120));
              }
              window.scrollTo(0, 0);
              await Promise.all([...document.images].filter(i => !i.complete)
                .map(i => new Promise(r => { i.onload = i.onerror = r; })));
            }""")
            pg.wait_for_timeout(400)
            pg.screenshot(path=os.path.join(OUT, name.replace(".html", ".png")), full_page=True)
            pg.remove_listener("pageerror", h)
            if errs:
                print("  JS ERROR %-28s %s" % (name, errs[0]))
        b.close()
    print("  captured %d pages -> %s" % (len(pages), OUT))

main()
