const puppeteer=require('puppeteer-core');
const fs=require('fs');
const AUDIT=`()=>{
  const out=[];
  document.querySelectorAll('b,strong,span,em,a,code').forEach(el=>{
    if(getComputedStyle(el).display!=='inline') return;
    const nx=el.nextSibling; if(!nx||nx.nodeType!==3) return;
    const t=nx.textContent; if(!t) return;
    if(/^[\\s,.;:)\\]!?%\\/-]/.test(t)) return;
    const own=(el.textContent||'').trim(); if(!own) return;
    if(/[\\s,.;:(\\[\\/-]$/.test(own)) return;
    const r=el.getBoundingClientRect(); if(r.width===0) return;
    out.push({where:(el.parentElement.className||el.parentElement.tagName).toString().split(' ')[0], left:own.slice(-22), right:t.trim().slice(0,12)});
  });
  return out;
}`;
(async()=>{
 const pages=fs.readdirSync('/tmp/ph').filter(f=>f.endsWith('.html'));
 const b=await puppeteer.launch({executablePath:'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let total=0;
 for (const f of pages.sort()){
   const p=await b.newPage(); await p.setViewport({width:1280,height:900});
   await p.goto('http://localhost:8095/'+f,{waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
   await new Promise(r=>setTimeout(r,500));
   const o=await p.evaluate(new Function('return '+AUDIT)()).catch(()=>[]);
   total+=o.length;
   console.log(f.padEnd(28), o.length===0?'clean':o.length+' run-together');
   o.slice(0,3).forEach(x=>console.log('      ['+x.where+'] "'+x.left+'"|"'+x.right+'"'));
   await p.close();
 }
 console.log('\nTOTAL across the site:',total);
 await b.close();
})().catch(e=>console.error('FATAL',e.message));
