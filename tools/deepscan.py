"""Look for unreadable type in the places the ordinary audit cannot reach.

Three passes:
  A  what is on screen at load
  B  what is in the markup but not displayed yet - later steps of a flow,
     panels, drawers, anything waiting on a click
  C  markup that shared scripts write at runtime. A widget used on six pages
     but styled on one arrives unstyled on the other five, which is how white
     chips on a white face got onto the card journey.
"""
import glob, json, os, re, sys
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/out"

MEASURE = r"""
const parse=c=>{const m=(c||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:parseFloat(m[4])}:null;};
const lin=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
const LUM=c=>0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);
const ratio=(a,b)=>{const l1=LUM(a),l2=LUM(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
const blend=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
const bgOf=e=>{let n=e,stack=[];
  while(n&&n.nodeType===1){const cs=getComputedStyle(n);const c=parse(cs.backgroundColor);
    if((cs.backgroundImage||'').includes('url('))return null;
    if(c&&c.a>0)stack.push(c); if(c&&c.a>=0.999)break; n=n.parentElement;}
  let out={r:14,g:17,b:22,a:1};
  for(let i=stack.length-1;i>=0;i--)out=blend(stack[i],out);
  return out;};
const label=e=>e.tagName.toLowerCase()+[...e.classList].slice(0,3).map(c=>'.'+c).join('');
"""

PASS_AB = MEASURE + r"""
const bad=[];
document.querySelectorAll('body *').forEach(e=>{
  if(e.children.length&&![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>2))return;
  if((e.textContent||'').trim().length<3)return;
  if(['SCRIPT','STYLE','TITLE','NOSCRIPT'].indexOf(e.tagName)>-1)return;
  const cs=getComputedStyle(e);
  if(cs.visibility==='hidden'||parseFloat(cs.opacity)<0.35)return;
  const laid=e.getBoundingClientRect().width>8;
  const fg=parse(cs.color); if(!fg||fg.a<0.35)return;
  const bg=bgOf(e); if(!bg)return;
  const cr=ratio(blend(fg,bg),bg);
  if(cr>=(laid?3.0:2.6))return;
  bad.push({sel:label(e),fg:cs.color,bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
            cr:+cr.toFixed(2),state:laid?'visible':'not displayed',txt:(e.textContent||'').trim().slice(0,32)});
});
const seen={},out=[];bad.forEach(b=>{const k=b.sel+b.fg+b.bg;if(seen[k])return;seen[k]=1;out.push(b);});
return out.slice(0,14);
"""

PASS_C = MEASURE + r"""
const groups = g;
const host=document.createElement('div');
host.style.cssText='position:absolute;left:-99999px;top:0;width:600px';
document.body.appendChild(host);
const out=[];
groups.forEach(g=>{
  const wrap=document.createElement(g.tag||'div');
  wrap.className=g.parent||'';
  const el=document.createElement(g.el||'span');
  el.className=g.cls; el.textContent='Sample';
  wrap.appendChild(el); host.appendChild(wrap);
  const cs=getComputedStyle(el), fg=parse(cs.color), bg=bgOf(el);
  if(fg&&bg){
    const cr=ratio(blend(fg,bg),bg);
    if(cr<3.0) out.push({cls:g.cls,fg:cs.color,
      bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,cr:+cr.toFixed(2)});
  }
  host.removeChild(wrap);
});
host.remove();
return out;
"""


def widget_classes(root):
    """Class names that shared scripts write into the page."""
    found = {}
    for js in sorted(glob.glob(os.path.join(root, "pfa-*.js"))):
        s = open(js, encoding="utf-8", errors="replace").read()
        for cls in re.findall(r'class=\\?["\']([a-z0-9 _-]{2,60})\\?["\']', s):
            for c in cls.split():
                if c.startswith("pfa-") or c in ("chip", "toast"):
                    found.setdefault(c, os.path.basename(js))
    return found


def main():
    pages = sorted(os.path.basename(p) for p in glob.glob(ROOT + "/*.html"))
    classes = widget_classes(ROOT)
    probes = [{"cls": c, "el": "button" if "chip" in c or "btn" in c else "span"}
              for c in sorted(classes)]
    print("shared widget classes probed:", len(probes))
    total = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        for name in pages:
            pg.goto("file://" + os.path.join(ROOT, name)); pg.wait_for_timeout(1200)
            pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
            rows = pg.evaluate("()=>{" + PASS_AB + "}")
            # reveal what is merely hidden, then look again
            pg.evaluate("""()=>{const s=document.createElement('style');
                s.id='deepscan-reveal';
                s.textContent='[hidden]{display:revert!important}[id^=view]{display:block!important}';
                document.head.appendChild(s);}""")
            pg.wait_for_timeout(250)
            rows += pg.evaluate("()=>{" + PASS_AB + "}")
            pg.evaluate("()=>{const s=document.getElementById('deepscan-reveal'); if(s)s.remove();}")
            probe = pg.evaluate("(g)=>{" + PASS_C + "}", probes)
            seen, uniq = set(), []
            for r in rows:
                k = (r["sel"], r["fg"], r["bg"])
                if k in seen: continue
                seen.add(k); uniq.append(r)
            if uniq or probe:
                print("==", name)
                for r in uniq:
                    print(f"   {r['cr']:5.2f}  {r['sel'][:34]:34s} {r['state']:14s} fg={r['fg']:22s} bg={r['bg']:18s} {r['txt']}")
                for r in probe:
                    print(f"   {r['cr']:5.2f}  .{r['cls'][:33]:33s} {'widget markup':14s} fg={r['fg']:22s} bg={r['bg']}")
                total += len(uniq) + len(probe)
        b.close()
    print("\nflagged:", total)


if __name__ == "__main__":
    main()
