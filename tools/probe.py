import sys, json
from playwright.sync_api import sync_playwright
pages = sys.argv[1:] or ['assembly.html']
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1440,'height':900})
    for name in pages:
        pg.goto('file:///home/claude/out/'+name); pg.wait_for_timeout(1200)
        pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in'))")
        res=pg.evaluate("""()=>{
          const out=[];
          const lum=(r,g,b)=>0.2126*r+0.7152*g+0.0722*b;
          document.querySelectorAll('*').forEach(e=>{
            const cs=getComputedStyle(e); const bg=cs.backgroundColor||'';
            const m=bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
            if(!m) return;
            const a=m[4]===undefined?1:parseFloat(m[4]);
            if(a<0.5) return;
            const L=lum(+m[1],+m[2],+m[3]); if(L<190) return;
            const r=e.getBoundingClientRect(); const area=r.width*r.height;
            if(area<40000) return;
            out.push({sel:e.tagName+'.'+String(e.className||'').slice(0,44), bg, w:Math.round(r.width), h:Math.round(r.height), inline:!!e.getAttribute('style')});
          });
          const seen={}; const uniq=[];
          out.forEach(o=>{const k=o.sel+o.bg; if(seen[k])return; seen[k]=1; uniq.push(o)});
          return uniq.slice(0,18);}""")
        print('===',name)
        for r in res: print('   ', r)
    b.close()
