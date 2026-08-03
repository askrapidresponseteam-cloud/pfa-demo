"""Report text that lost contrast in the conversion: light on light, dark on dark."""
import glob, os, sys
from playwright.sync_api import sync_playwright
ROOT=sys.argv[1] if len(sys.argv)>1 else '/home/claude/out'
ONLY=sys.argv[2:] or None
JS = r"""()=>{
  const parse=c=>{const m=(c||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:parseFloat(m[4])}:null;};
  const lin=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
  const L=c=>0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b);
  const ratio=(a,b)=>{const l1=L(a),l2=L(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
  const blend=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
  const bgOf=e=>{let n=e,acc={r:14,g:17,b:22,a:1},stack=[];
    while(n&&n.nodeType===1){const cs=getComputedStyle(n);const c=parse(cs.backgroundColor);
      const hasImg=cs.backgroundImage&&cs.backgroundImage!=='none'&&!cs.backgroundImage.startsWith('linear-gradient(rgba(0');
      if(hasImg&&cs.backgroundImage.includes('url('))return null;
      if(c&&c.a>0)stack.push(c); if(c&&c.a>=0.999)break; n=n.parentElement;}
    let out={r:14,g:17,b:22,a:1};
    for(let i=stack.length-1;i>=0;i--)out=blend(stack[i],out);
    return out;};
  const bad=[];
  document.querySelectorAll('body *').forEach(e=>{
    if(e.children.length&&![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>2))return;
    const t=(e.textContent||'').trim(); if(t.length<3)return;
    const cs=getComputedStyle(e);
    if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)<0.35)return;
    const r=e.getBoundingClientRect(); if(r.width<8||r.height<6)return;
    const fg=parse(cs.color); if(!fg||fg.a<0.35)return;
    const bg=bgOf(e); if(!bg)return;
    const cr=ratio(blend(fg,bg),bg);
    if(cr<2.6)bad.push({t:t.slice(0,42),sel:e.tagName+'.'+String(e.className||'').slice(0,30),
                        fg:cs.color,bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,cr:+cr.toFixed(2)});
  });
  const seen={},out=[];bad.forEach(b=>{const k=b.sel+b.fg+b.bg;if(seen[k])return;seen[k]=1;out.push(b)});
  return out.slice(0,12);}"""
pages=sorted(os.path.basename(p) for p in glob.glob(ROOT+'/*.html'))
if ONLY: pages=[p for p in pages if p in ONLY]
with sync_playwright() as pw:
    b=pw.chromium.launch(); pg=b.new_page(viewport={'width':1440,'height':900})
    total=0
    for name in pages:
        pg.goto('file://'+os.path.join(ROOT,name)); pg.wait_for_timeout(1100)
        pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
        res=pg.evaluate(JS)
        if res:
            total+=len(res); print('==',name)
            for r in res: print(f"   {r['cr']:5.2f}  {r['sel'][:38]:38s} fg={r['fg']:22s} bg={r['bg']:18s} {r['t']}")
    print('\nlow-contrast text nodes flagged:',total)
    b.close()
