/* dead-class.js - find elements carrying a class that resolves to no rule for them.
   This is the bug behind three shipped mistakes: .pharm h2, .team .pk, .team h2 .blue.
   The class name exists in the stylesheet, so grep says "it is styled", but every rule
   using it is scoped to a different parent, so the element gets browser defaults.
   Asserted by matching the element against the real CSSOM, never by reading the source. */
const puppeteer=require('puppeteer-core');
const fs=require('fs');
const PROBE=`()=>{
  const rules=[];
  for (const sheet of document.styleSheets){
    let rs; try { rs=sheet.cssRules; } catch(e){ continue; }
    const walk=list=>{ for (const r of list){
      if (r.selectorText) rules.push(r.selectorText);
      else if (r.cssRules) walk(r.cssRules);
    }};
    walk(rs);
  }
  // every class token that appears anywhere in the stylesheet
  const known=new Set();
  rules.forEach(sel=>{ (sel.match(/\\.[A-Za-z0-9_-]+/g)||[]).forEach(c=>known.add(c.slice(1))); });

  const bad=[];
  document.querySelectorAll('[class]').forEach(el=>{
    const cs=[...el.classList];
    cs.forEach(c=>{
      if(!known.has(c)) return;                 // not a styling class at all, ignore
      // only consider rules where this class is the SUBJECT of some selector in the list.
      // A class used purely as an ancestor (.plate-copy h2) styles its children, not itself.
      const subjectRules = rules.filter(sel=>
        sel.split(',').some(one=>{
          const parts=one.trim().split(/[\s>+~]+/);
          return parts.length && parts[parts.length-1].indexOf('.'+c)>-1;
        }));
      if(!subjectRules.length) return;
      const hit = subjectRules.some(sel=>{ try { return el.matches(sel); } catch(e){ return false; } });
      if(!hit) bad.push({cls:c, tag:el.tagName, parent:(el.parentElement&&el.parentElement.className||'').toString().split(' ')[0], text:(el.textContent||'').trim().slice(0,34)});
    });
  });
  return bad;
}`;
(async()=>{
 const dir=process.argv[2]||'/tmp/ph', port=process.argv[3]||'8095';
 const pages=fs.readdirSync(dir).filter(f=>f.endsWith('.html'));
 const b=await puppeteer.launch({executablePath:'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let total=0;
 for (const f of pages.sort()){
  const p=await b.newPage(); await p.setViewport({width:1280,height:900});
  await p.goto(`http://localhost:${port}/`+f,{waitUntil:'networkidle2',timeout:20000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,400));
  const bad=await p.evaluate(new Function('return '+PROBE)()).catch(()=>[]);
  const uniq=[...new Map(bad.map(x=>[x.cls+'|'+x.parent,x])).values()];
  total+=uniq.length;
  console.log(f.padEnd(28), uniq.length? uniq.length+' dead' : 'clean');
  uniq.slice(0,6).forEach(x=>console.log('     .'+x.cls,'on <'+x.tag.toLowerCase()+'> inside .'+x.parent,' "'+x.text+'"'));
  await p.close();
 }
 console.log('\nTOTAL dead classes:',total);
 await b.close();
})().catch(e=>console.error('FATAL',e.message));
