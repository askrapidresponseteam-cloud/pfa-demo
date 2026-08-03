"""Report where the first line of real content sits on each page.

Overlays are skipped: the search sheet, drawers and cart panels are in the
markup at all times and would otherwise be mistaken for the top of the page.
"""
import glob, os, sys
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/out"
EXCLUDED = {"store.html", "champion.html", "admin.html"}

JS = """()=>{
  const hiddenish=e=>{
    let n=e;
    while(n&&n.nodeType===1){
      const cs=getComputedStyle(n);
      if(cs.position==='fixed'||cs.visibility==='hidden'||cs.display==='none')return true;
      if(parseFloat(cs.opacity)<0.2)return true;
      if(cs.pointerEvents==='none'&&cs.position==='absolute')return true;
      n=n.parentElement;}
    return false;};
  let best=null;
  document.querySelectorAll('body *').forEach(e=>{
    if(['SCRIPT','STYLE','TITLE','NOSCRIPT'].includes(e.tagName))return;
    if(e.children.length&&![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1))return;
    const t=(e.textContent||'').trim(); if(t.length<2)return;
    if(e.closest('.pfa-nav, .skip, #pfaBack, .pfa-menu, .pfa-cart'))return;
    if(hiddenish(e))return;
    const r=e.getBoundingClientRect(); if(r.width<4||r.height<4)return;
    const top=Math.round(r.top+window.scrollY);
    if(!best||top<best.top) best={top,what:e.tagName+'.'+String(e.className||'').slice(0,18),txt:t.slice(0,26)};
  });
  return best;}"""


def main():
    tops = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
        for f in sorted(glob.glob(ROOT + "/*.html")):
            n = os.path.basename(f)
            if n == "admin.html":
                continue
            pg.goto("file://" + f); pg.wait_for_timeout(950)
            r = pg.evaluate(JS)
            mark = "  (excluded)" if n in EXCLUDED else ""
            if not mark and r:
                tops[n] = r["top"]
            print(f"  {n:28s} top={str(r['top'] if r else None):>5s}  "
                  f"{str(r['what'] if r else '')[:22]:22s} {(r['txt'] if r else '')[:26]}{mark}")
        b.close()
    if tops:
        lo, hi = min(tops.values()), max(tops.values())
        print(f"\nstandardised pages: {len(tops)}   min {lo}  max {hi}  spread {hi - lo}px")
        for n, t in sorted(tops.items(), key=lambda x: -x[1])[:4]:
            if t != lo:
                print(f"   still off by {t - lo:>3d}px: {n}")


if __name__ == "__main__":
    main()
