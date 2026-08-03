"""List the surfaces that were already dark on the light site.

Those are the design's accent bands. On ink they must not invert into white
slabs, so the converter keeps their authored colours and only re-points the
background token. A band can be painted by a flat colour or by a gradient, so
both are measured here.
"""
import glob, os
from playwright.sync_api import sync_playwright

ROOT = "/home/claude/site/pfa-demo-main"

JS = r"""()=>{
  const lum=(r,g,b)=>0.2126*r+0.7152*g+0.0722*b, hits={};
  const SKIP=['rv','in','rv-d1','rv-d2','rv-d3','wrap','sec','on','open','active'];
  document.querySelectorAll('section,div,aside,header,footer,article,a,ul,li,figure').forEach(e=>{
    const cs=getComputedStyle(e);
    let L=null;
    const m=(cs.backgroundColor||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if(m){const a=m[4]===undefined?1:parseFloat(m[4]); if(a>=0.6) L=lum(+m[1],+m[2],+m[3]);}
    const bi=cs.backgroundImage||'';
    if(L===null && bi.includes('gradient')){
      const stops=[...bi.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g)]
        .filter(s=>s[4]===undefined||parseFloat(s[4])>=0.6);
      if(stops.length) L=stops.reduce((t,s)=>t+lum(+s[1],+s[2],+s[3]),0)/stops.length;
    }
    if(L===null||L>70) return;
    const r=e.getBoundingClientRect(); if(r.width*r.height<40000) return;
    const cls=String(e.className||'').trim(); if(!cls) return;
    const k=cls.split(/\s+/).filter(c=>!SKIP.includes(c)).join(' ');
    if(k) hits[k]=(hits[k]||0)+1;
  });
  return hits;}"""

def main():
    pages = sorted(os.path.basename(p) for p in glob.glob(ROOT + "/*.html"))
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        for name in pages:
            pg.goto("file://" + ROOT + "/" + name); pg.wait_for_timeout(900)
            pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
            # later steps of a flow are dark bands too; reveal them before measuring
            pg.evaluate("""()=>{const s=document.createElement('style');
                s.textContent='[hidden]{display:revert!important}[id^=view]{display:block!important}';document.head.appendChild(s);}""")
            pg.wait_for_timeout(250)
            hits = pg.evaluate(JS)
            hits.pop("pfa-nav", None)
            if hits:
                print(name)
                for cls, n in sorted(hits.items(), key=lambda x: -x[1]):
                    print(f"    {n:3d}  .{cls}")
        b.close()

if __name__ == "__main__":
    main()
