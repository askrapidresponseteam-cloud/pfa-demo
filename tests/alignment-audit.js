const puppeteer=require('puppeteer-core');
const AUDIT=`()=>{
  const out={runTogether:[],frames:[]};
  const shown=e=>{ let n=e; while(n&&n!==document.body){ const c=getComputedStyle(n);
    if(c.display==='none'||c.visibility==='hidden'||parseFloat(c.opacity)===0) return false; n=n.parentElement; } return true; };
  document.querySelectorAll('b,strong,span,em').forEach(el=>{
    if(getComputedStyle(el).display!=='inline') return;
    if(!shown(el)) return;   /* a carousel slide at opacity 0 is not a collision */
    const nx=el.nextSibling; if(!nx||nx.nodeType!==3) return;
    const t=nx.textContent; if(!t) return;
    if(/^[\\s,.;:)\\]]/.test(t)) return;
    const own=(el.textContent||'').trim(); if(!own) return;
    const r=el.getBoundingClientRect(); if(r.width===0) return;
    out.runTogether.push({where:(el.parentElement.className||el.parentElement.tagName), left:own.slice(-20), right:t.trim().slice(0,12)});
  });
  const groups=[['#rvStrip','.rv-item'],['#grid','.pcard'],['#phGrid','.pcard'],['#cxTiles','.cx-tile'],['#drawer','.ci']];
  groups.forEach(([host,item])=>{
    const h=document.querySelector(host); if(!h) return;
    const rows=[...h.querySelectorAll(item)].map(it=>{
      const frame=it.querySelector('.pv,.cx-tile-art'), art=it.querySelector('svg')||it.querySelector('img');
      if(!frame||!art) return null;
      const fr=frame.getBoundingClientRect(), ar=art.getBoundingClientRect();
      if(fr.width===0||ar.width===0) return null;
      return {wPct:Math.round(ar.width/fr.width*100), inset:Math.round(ar.left-fr.left), bg:getComputedStyle(frame).backgroundColor};
    }).filter(Boolean);
    if(rows.length<2) return;
    const w=[...new Set(rows.map(r=>r.wPct))], i=[...new Set(rows.map(r=>r.inset))], b=[...new Set(rows.map(r=>r.bg))];
    if(w.length>1||i.length>1||b.length>1) out.frames.push({host, widths:w, insets:i, backgrounds:b});
  });
  return out;
}`;
(async()=>{
 const port=process.argv[2], label=process.argv[3];
 const b=await puppeteer.launch({executablePath:'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await b.newPage(); await p.setViewport({width:1280,height:900});
 await p.goto(`http://localhost:${port}/store.html`,{waitUntil:'networkidle2'}).catch(()=>{});
 await new Promise(r=>setTimeout(r,500));
 for (const id of ['himalayadigytox','jkt1']) { await p.evaluate(i=>{location.hash='#/p/'+i},id); await new Promise(r=>setTimeout(r,300)); }
 await p.evaluate(()=>{location.hash='#/'}); await new Promise(r=>setTimeout(r,600));
 await p.evaluate(()=>{const a=document.querySelector('[data-add="treat1"]'); if(a)a.click(); const c=document.getElementById('cartOpen'); if(c)c.click();});
 await new Promise(r=>setTimeout(r,400));
 const o=await p.evaluate(new Function('return '+AUDIT)());
 console.log(`\n### ${label}`);
 console.log('  run-together text :',o.runTogether.length);
 o.runTogether.slice(0,6).forEach(x=>console.log('     ['+x.where+'] "'+x.left+'"|"'+x.right+'"'));
 console.log('  frame parity breaks:',o.frames.length);
 o.frames.forEach(f=>console.log('     ',f.host,'widths',f.widths.map(w=>w+'%').join('/'),'insets',f.insets.join('/'),'bgs',f.backgrounds.length));
 await b.close();
})().catch(e=>console.error('FATAL',e.message));
