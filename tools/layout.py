"""Give every page the same opening line.

The gap between the fixed header and the first block of content was set in a
different place on each page: sometimes on the <main>, sometimes on the hero
section, sometimes on a .wrap inside it, with values from 105px to 196px. So
the pages all began at different heights.

This measures where that gap is actually coming from on each page, pins it to
one value, and zeroes any other padding above it in the same chain. The value
is the home page's, so every page now opens on the line the hero opens on.

The store and the gauntlet are left alone: a full-bleed carousel and a game
screen have their own reasons to start where they do.
"""
import glob, os, re, sys
from playwright.sync_api import sync_playwright

MARK = "/* ---- one opening line for every page ---- */"
SKIP = {"store.html", "champion.html", "admin.html", "cinekind.html"}
PAGE_TOP = "calc(76px + clamp(26px,3.5vw,48px))"
TARGET = 124          # where the home page hero opens at 1440 x 900

FIRSTGLYPH = """()=>{
  const hiddenish=e=>{let n=e;
    while(n&&n.nodeType===1){const cs=getComputedStyle(n);
      if(cs.position==='fixed'||cs.visibility==='hidden'||cs.display==='none')return true;
      if(parseFloat(cs.opacity)<0.2)return true;
      if(cs.pointerEvents==='none'&&cs.position==='absolute')return true;
      n=n.parentElement;}
    return false;};
  let best=null;
  document.querySelectorAll('body *').forEach(e=>{
    if(['SCRIPT','STYLE','TITLE','NOSCRIPT'].includes(e.tagName))return;
    if(e.children.length&&![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1))return;
    if((e.textContent||'').trim().length<2)return;
    if(e.closest('.pfa-nav, .skip, #pfaBack, .pfa-menu, .pfa-cart'))return;
    if(hiddenish(e))return;
    const r=e.getBoundingClientRect(); if(r.width<4||r.height<4)return;
    const top=Math.round(r.top+window.scrollY);
    if(best===null||top<best)best=top;});
  return best;}"""

CHAIN = """()=>{
  const pick=document.querySelector('.hero-eyebrow, .eyebrow, h1, h2');
  if(!pick) return null;
  const chain=[]; let n=pick;
  while(n && n.tagName!=='BODY'){ chain.push(n); n=n.parentElement; }
  chain.reverse();
  const bit=e=>{
    const cls=[...e.classList].filter(c=>!/^(rv|in|rv-d\\d|on|open|active|flipped|issued)$/.test(c));
    return e.tagName.toLowerCase()+(e.id?'#'+CSS.escape(e.id):'')+cls.map(c=>'.'+CSS.escape(c)).join('');};
  const out=[];
  chain.forEach((e,i)=>{
    const cs=getComputedStyle(e);
    out.push({sel:chain.slice(0,i+1).map(bit).join('>'),
              pad:parseFloat(cs.paddingTop)||0,
              tag:e.tagName.toLowerCase()});
  });
  return {chain:out, contentTop:Math.round(pick.getBoundingClientRect().top+window.scrollY)};}"""


def main(root):
    pages = [os.path.basename(p) for p in sorted(glob.glob(root + "/*.html"))]
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        for name in pages:
            if name in SKIP:
                continue
            path = os.path.join(root, name)
            html = re.sub(re.escape(MARK) + r".*?(?=</style>)", "",
                          open(path, encoding="utf-8").read(), flags=re.S)
            open(path, "w", encoding="utf-8").write(html)
            pg.goto("file://" + path); pg.wait_for_timeout(1000)
            info = pg.evaluate(CHAIN)
            if not info:
                print(f"  {name}: no opening content found, left alone"); continue
            chain = info["chain"]
            # the element carrying the opening gap is the one with the most
            # padding above it; everything else above must contribute nothing
            padded = [c for c in chain if c["pad"] > 4 and c["tag"] not in ("h1", "h2", "p")]
            if not padded:
                anchor = chain[0]
            else:
                anchor = max(padded, key=lambda c: c["pad"])
            def write(trim):
                pad = ("var(--page-top)" if not trim
                       else "calc(var(--page-top) - %dpx)" % trim)
                rules = [MARK, ":root{--page-top:%s}" % PAGE_TOP,
                         "%s{padding-top:%s!important}" % (anchor["sel"], pad)]
                for c in chain:
                    if c is anchor or c["pad"] <= 0:
                        continue
                    rules.append("%s{padding-top:0!important}" % c["sel"])
                i = html.rfind("</style>")
                if i == -1:
                    return False
                open(path, "w", encoding="utf-8").write(
                    html[:i] + "\n" + "\n".join(rules) + "\n" + html[i:])
                return True

            if not write(0):
                continue
            # The first glyph sits a different distance inside its container on
            # each page, so aligning the containers is not enough. Measure what
            # is left and take it back off the padding.
            pg.goto("file://" + path); pg.wait_for_timeout(900)
            pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
            got = pg.evaluate(FIRSTGLYPH)
            trim = (got - TARGET) if got else 0
            if trim:
                write(trim)
            print(f"  {name:28s} was {info['contentTop']:>4d}  "
                  f"then {got if got else '?'}  trim {trim:>4d}px")
        b.close()


if __name__ == "__main__":
    main(sys.argv[1])
