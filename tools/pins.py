"""Measure what is unreadable after the conversion and pin it.

Some type cannot be judged from the stylesheet alone: whether a bare colour
rule needs to flip depends on the surface it lands on, which is only knowable
once the page is laid out. So the last pass renders each page and looks at
what is actually behind the type.

It looks in three places, because the first one is not enough:
  A  what is on screen at load
  B  what is in the markup but not shown yet, which is most of a flow
  C  markup that shared scripts write at runtime, since a widget styled on one
     page arrives unstyled on every other page that uses it

Every pin is a measurement. A pin is escalated to !important only when the
page's own cascade outranks it.
"""
import glob, os, re, sys
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deepscan import widget_classes  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/out"
MARK = "/* ---- contrast pins: measured against the rendered page ---- */"

HELPERS = r"""
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
const LIGHT={r:244,g:246,b:247,a:1}, INK={r:14,g:17,b:22,a:1};
const choose=(fg,bg)=>{
  const wantLight=ratio(LIGHT,bg)>=ratio(INK,bg);
  const mx=Math.max(fg.r,fg.g,fg.b),mn=Math.min(fg.r,fg.g,fg.b);
  const sat=mx===0?0:(mx-mn)/mx;
  // a saturated colour carries meaning: keep the hue, move the lightness
  if(sat>0.45){const f=wantLight?1:0.42, base=wantLight?110:0;
    return {pick:'rgb('+[fg.r,fg.g,fg.b].map(v=>Math.round(Math.min(255,base+v*f))).join(',')+')',wantLight};}
  return {pick:wantLight?'#F4F6F7':'#0E1116',wantLight};};
const sel=e=>{
  const bit=n=>n.tagName.toLowerCase()+[...n.classList].filter(c=>!/^(rv|in|rv-d\d)$/.test(c))
    .map(c=>'.'+CSS.escape(c)).join('');
  const nth=n=>{const p=n.parentElement; if(!p)return bit(n);
    const same=[...p.children].filter(c=>c.tagName===n.tagName);
    return same.length>1?bit(n)+':nth-of-type('+(same.indexOf(n)+1)+')':bit(n);};
  let parts=[bit(e)],n=e.parentElement,hops=0;
  const hit=s=>{try{const q=document.querySelectorAll(s);return q.length===1&&q[0]===e;}catch(_){return false;}};
  if(hit(parts.join(' ')))return parts.join(' ');
  while(n&&n.tagName!=='BODY'&&hops<4){
    if(n.classList.length||hops>1){parts.unshift(bit(n));hops++;
      if(hit(parts.join(' ')))return parts.join(' ');}
    n=n.parentElement;}
  parts[parts.length-1]=nth(e);
  if(hit(parts.join(' ')))return parts.join(' ');
  let m=e.parentElement; if(m)parts.unshift(nth(m));
  return parts.join(' ');};
const stateless=c=>!/^(rv|in|rv-d\d|on|open|active|show|hidden)$/.test(c);
"""

COLLECT = HELPERS + r"""
window.__pins = window.__pins || [];
document.querySelectorAll('body *').forEach(e=>{
  if(['SCRIPT','STYLE','TITLE','NOSCRIPT'].indexOf(e.tagName)>-1)return;
  if(e.children.length&&![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>2))return;
  if((e.textContent||'').trim().length<3)return;
  const cs=getComputedStyle(e);
  if(cs.visibility==='hidden'||parseFloat(cs.opacity)<0.35)return;
  const r=e.getBoundingClientRect(); if(r.width<8||r.height<6)return;
  const fg=parse(cs.color); if(!fg||fg.a<0.35)return;
  const bg=bgOf(e); if(!bg)return;
  if(ratio(blend(fg,bg),bg)>=3.0)return;
  const c=choose(fg,bg);
  const own=[...e.classList].filter(stateless);
  let target=null;
  if(own.length){
    const cs2=e.tagName.toLowerCase()+own.map(x=>'.'+CSS.escape(x)).join('');
    try{
      const all=[...document.querySelectorAll(cs2)];
      const allBad=all.length>0&&all.every(x=>{
        const f2=parse(getComputedStyle(x).color),b2=bgOf(x);
        if(!f2||!b2)return false;
        return ratio(blend(f2,b2),b2)<3.0 && choose(f2,b2).wantLight===c.wantLight;});
      if(allBad)target=cs2;
    }catch(_){}
  }
  if(!target){
    let anc=e.parentElement,hops=0;
    while(anc&&anc.tagName!=='BODY'&&hops<3){
      const ac=[...anc.classList].filter(stateless);
      if(ac.length){
        const cs3='.'+CSS.escape(ac[0])+' '+e.tagName.toLowerCase();
        try{
          const all=[...document.querySelectorAll(cs3)];
          const allBad=all.length>0&&all.every(x=>{
            const f2=parse(getComputedStyle(x).color),b2=bgOf(x);
            if(!f2||!b2)return false;
            return ratio(blend(f2,b2),b2)<3.0 && choose(f2,b2).wantLight===c.wantLight;});
          if(allBad){target=cs3;break;}
        }catch(_){}
        hops++;
      }
      anc=anc.parentElement;}
  }
  window.__pins.push({sel:target||sel(e),pick:c.pick,el:e});
});
return window.__pins.length;
"""

FINALISE = HELPERS + r"""
// Measure with the candidate rules sitting exactly where they will be written:
// appended to the last stylesheet the page ships. Probing anywhere else gives
// an optimistic answer, because styles injected at runtime land after it.
const host=[...document.querySelectorAll('style')][g.hostIndex] || (function(){
  const s=document.createElement('style'); document.head.appendChild(s); return s;})();
const before=host.textContent;

const candidates=[];
const seen={};
window.__pins.forEach(o=>{const k=o.sel+o.pick; if(seen[k])return; seen[k]=1;
  candidates.push({sel:o.sel,pick:o.pick,el:o.el,kind:'measured'});});

// shared widget markup: build one of each and see how it lands on this page
const bench=document.createElement('div');
bench.style.cssText='position:absolute;left:-99999px;top:0;width:600px';
document.body.appendChild(bench);
g.probes.forEach(spec=>{
  const el=document.createElement(spec.el||'span');
  el.className=spec.cls; el.textContent='Sample';
  bench.appendChild(el);
  const fg=parse(getComputedStyle(el).color), bg=bgOf(el);
  if(fg&&bg&&ratio(blend(fg,bg),bg)<3.0){
    candidates.push({sel:'.'+spec.cls,pick:choose(fg,bg).pick,el:el,kind:'widget'});
  } else { bench.removeChild(el); }
});

host.textContent = before + '\n' + candidates.map(c=>c.sel+'{color:'+c.pick+'}').join('\n');
const out=candidates.map(c=>{
  const fg=parse(getComputedStyle(c.el).color), bg=bgOf(c.el);
  const ok = fg&&bg&&ratio(blend(fg,bg),bg)>=3.0;
  return {sel:c.sel,pick:c.pick,important:!ok,kind:c.kind};
});
host.textContent = before;
bench.remove();
return out;
"""

# Type inside a band that stayed dark, where the rule colouring it is shared
# with lighter parts of the page and so cannot be flipped at the source.
EXTRA = {
    "assembly.html": [".btn.primary{color:#0E1116}", ".mp-badge{color:#0E1116}"],
    "store.html": [
        # this toggle lives in a view that is dark once opened; a measured pin
        # read it against the wrong surface, so it is set by hand
        "button.patron-t{color:var(--mut)}",
        "button.patron-t.on{color:var(--blue-ink)}",
    ],
    "learning-center.html": [
        ".law .sec-head h2{color:#F4F6F7}",
        ".law-f b{color:#F4F6F7}",
        ".law-c p b{color:#F4F6F7}",
        ".law-arts b{color:#F4F6F7}",
        ".law-a p b{color:#F4F6F7}",
    ],
}

CHROME = """
/* A button with no styling of its own falls back to the browser's chrome:
   black type on a white face. Inheriting the colour alone left white on white,
   so the face has to go too. Any class rule still wins over both. */
button{color:inherit;background-color:transparent}

/* The places widget is shared, but only one page ever styled its chips, so on
   every other page they arrived unstyled. They travel with the site now. */
.pfa-chips-lab{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mut-2);margin-right:2px}
.pfa-chip{background:transparent;border:1px solid var(--hair);color:var(--ink);font-size:13px;padding:7px 13px;cursor:pointer;transition:border-color .15s ease,color .15s ease}
.pfa-chip:hover{border-color:var(--blue);color:var(--blue)}

/* floating chrome stays dark glass, so its type stays light */
.pfa-cart{color:#F4F6F7;border-color:rgba(255,255,255,.5)}
.pfa-cart:hover{background:#00A4FF;border-color:#00A4FF;color:#0E1116}
.pfa-cart .cart-count{background:#00A4FF;color:#0E1116}
.pfa-cart:hover .cart-count{background:#0E1116;color:#F4F6F7}
.toast,.net-toast,.svc-toast,.hof-toast,.uc-live{color:#F4F6F7}
"""


def strip_old(html):
    return re.sub(re.escape(MARK) + r".*?(?=</style>)", "", html, flags=re.S)


def main():
    pages = sorted(os.path.basename(p) for p in glob.glob(ROOT + "/*.html"))
    probes = [{"cls": c, "el": "button" if ("chip" in c or "btn" in c) else "span"}
              for c in sorted(widget_classes(ROOT))]
    total = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        for name in pages:
            path = os.path.join(ROOT, name)
            html = strip_old(open(path, encoding="utf-8").read())
            open(path, "w", encoding="utf-8").write(html)
            pg.goto("file://" + path); pg.wait_for_timeout(1100)
            pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
            pg.evaluate("()=>{window.__pins=[];" + COLLECT + "}")          # A
            pg.evaluate("""()=>{const s=document.createElement('style');s.id='pins-reveal';
                s.textContent='[hidden]{display:revert!important}[id^=view]{display:block!important}';document.head.appendChild(s);}""")
            pg.wait_for_timeout(200)
            pg.evaluate("()=>{" + COLLECT + "}")                            # B
            pg.evaluate("()=>{const s=document.getElementById('pins-reveal');if(s)s.remove();}")
            hosts = len(re.findall(r"<style[^>]*>", html))
            fixes = pg.evaluate("(g)=>{" + FINALISE + "}",
                                {"probes": probes, "hostIndex": hosts - 1})
            rules = [MARK, CHROME.strip()]
            for f in fixes:
                rules.append("%s{color:%s%s}" % (f["sel"], f["pick"],
                                                 " !important" if f["important"] else ""))
            rules += EXTRA.get(name, [])
            n = len(fixes)
            widget = [f for f in fixes if f["kind"] == "widget"]
            total += n
            i = html.rfind("</style>")
            if i == -1:
                continue
            open(path, "w", encoding="utf-8").write(
                html[:i] + "\n" + "\n".join(rules) + "\n" + html[i:])
            if n:
                print(f"{name:28s} {n - len(widget):3d} measured  {len(widget):2d} widget  "
                      f"{sum(1 for f in fixes if f['important']):2d} escalated")
        b.close()
    print("total pins:", total)


if __name__ == "__main__":
    main()
