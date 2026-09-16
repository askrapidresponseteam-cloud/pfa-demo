/* ===========================================================
   EXTRACT - search.html
   site + product search

   1 inline <script> block(s), in document order.
   READ-ONLY REFERENCE COPY. The live code is inside
   search.html in the UI/content zip. Edit it THERE; this file
   is a snapshot for reading and review only.
   =========================================================== */

/* ---- block 1 of 1 ---- */
(() => {
'use strict';

const CONFIG={maxPages:1600,concurrency:7,cacheHours:12,maxResults:60,overlayResults:6,indexVersion:'pfa-search-v6',fallbackPages:['index.html','network.html','stories.html','dispatch.html','learning-center.html','adopt.html','store.html','membership.html','get-involved.html','give.html','founder.html','cinekind.html','champion.html','csr.html','privacy.html','terms.html']};
const CATEGORY_ORDER=['All','Contacts','Stories','The Wire','Learning','Adoption','Store','Membership','Get involved','About PFA','Other'];
const STOP_WORDS=new Set(['a','an','and','are','at','be','by','for','from','how','i','in','is','it','of','on','or','our','the','to','with']);
const SYNONYMS={vet:['veterinary','hospital','clinic','doctor'],veterinary:['vet','hospital','clinic'],hospital:['clinic','vet','veterinary'],clinic:['hospital','vet','veterinary'],rescue:['emergency','injured','help','sos'],emergency:['rescue','urgent','injured','sos'],injured:['wounded','hurt','emergency','rescue'],adopt:['adoption','rehoming','home'],adoption:['adopt','rehoming'],donate:['donation','give','support'],donation:['donate','give','support'],dog:['dogs','canine','puppy','pup'],dogs:['dog','canine','puppy','pup'],cat:['cats','feline','kitten'],cats:['cat','feline','kitten'],food:['nutrition','feed','diet'],medicine:['medicines','pharmacy','treatment'],medicines:['medicine','pharmacy','treatment'],learn:['learning','guide','education'],law:['legal','rights','act'],rights:['law','legal','protection'],volunteer:['volunteering','join','help'],member:['membership','patron'],membership:['member','patron'],location:['address','place','nearby'],near:['nearby','location','district','city']};
const state={pages:[],query:'',filter:'All',ready:false,indexing:false,error:false,resultCounts:new Map(),renderedResults:[]};
const els={form:document.getElementById('siteSearchForm'),input:document.getElementById('pageSearch'),clear:document.getElementById('pageSearchClear'),status:document.getElementById('pageSearchStatus'),results:document.getElementById('pageSearchResults'),filters:document.getElementById('searchFilters'),filterList:document.getElementById('searchFilterList'),suggestions:document.getElementById('searchSuggestions'),overlay:document.getElementById('searchOverlay'),overlayInput:document.getElementById('globalSearch'),overlayResults:document.getElementById('globalSearchResults')};

const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en-IN').replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}'%₹]+/gu,' ').replace(/\s+/g,' ').trim();
const tokens=value=>normalize(value).split(' ').filter(Boolean);
const unique=values=>[...new Set(values)];
const escapeHTML=value=>String(value||'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const stem=word=>word.length<5?word:(word.replace(/(ization|ational|fulness|ousness|iveness)$/i,'').replace(/(ments|ment|ingly|edly|ation|ions|ies|ing|ers|ed|es|s)$/i,'')||word);

const editDistance=(left,right)=>{
  if(left===right)return 0;
  if(Math.abs(left.length-right.length)>2)return 3;
  const row=Array.from({length:right.length+1},(_,index)=>index);
  for(let i=1;i<=left.length;i+=1){let diagonal=row[0];row[0]=i;let rowMinimum=row[0];for(let j=1;j<=right.length;j+=1){const above=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(left[i-1]===right[j-1]?0:1));diagonal=above;rowMinimum=Math.min(rowMinimum,row[j]);}if(rowMinimum>2)return 3;}
  return row[right.length];
};
const fuzzyMatch=(queryWord,pageWords)=>{if(queryWord.length<4)return false;const allowed=queryWord.length>=8?2:1;for(const pageWord of pageWords){if(Math.abs(pageWord.length-queryWord.length)>allowed)continue;if(editDistance(queryWord,pageWord)<=allowed)return true;}return false;};

const cleanURL=href=>{
  try{const url=new URL(href,location.href);if(url.origin!==location.origin)return null;url.hash='';url.search='';const path=url.pathname.toLowerCase();if(/\.(?:avif|bmp|css|csv|docx?|gif|ico|jpe?g|js|json|map|mp3|mp4|pdf|png|svg|webm|webp|xml|zip)$/i.test(path))return null;if(/(?:^|\/)(?:admin|api|assets|checkout|media|wp-admin)(?:\/|$)/i.test(path))return null;return url.href;}catch(_){return null;}
};
const displayURL=href=>{try{const url=new URL(href,location.href);const relative=decodeURIComponent(url.pathname.split('/').filter(Boolean).slice(-2).join(' / '));return relative||'Home';}catch(_){return href;}};
const pageCategory=(url,title,body)=>{const value=normalize(`${url} ${title} ${body.slice(0,500)}`);if(/hospital|network|clinic|veterinary|contact/.test(value))return'Contacts';if(/stor(?:y|ies)|animal stor/.test(value)&&!/store|product|shop/.test(value))return'Stories';if(/dispatch|the wire|news|record/.test(value))return'The Wire';if(/learning|guide|knowledge|education|emergency/.test(value))return'Learning';if(/adopt|adoption|rehom/.test(value))return'Adoption';if(/store|product|shop|cart|food|pharmacy/.test(value))return'Store';if(/membership|patron|member/.test(value))return'Membership';if(/get involved|volunteer|csr|corporate|partner/.test(value))return'Get involved';if(/founder|about|people for animals|cinekind|wildlife gauntlet/.test(value))return'About PFA';return'Other';};

const parsePage=(html,url)=>{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const links=[...doc.querySelectorAll('a[href]')].map(link=>{try{return cleanURL(new URL(link.getAttribute('href'),url).href);}catch(_){return null;}}).filter(Boolean);
  doc.querySelectorAll('script,style,noscript,svg,template,[hidden],[aria-hidden="true"],header,footer,.mobile-menu,.search-overlay').forEach(node=>node.remove());
  const title=(doc.querySelector('h1')?.textContent||doc.title||'').replace(/\s*[|\u2013\u2014-]\s*PFA.*$/i,'').trim();
  const description=doc.querySelector('meta[name="description"]')?.content?.trim()||'';
  const headings=[...doc.querySelectorAll('h1,h2,h3')].map(node=>node.textContent.trim()).filter(Boolean).join(' · ');
  const main=doc.querySelector('main')||doc.body;
  const body=(main?.textContent||'').replace(/\s+/g,' ').trim().slice(0,26000);
  const searchable=normalize(`${title} ${title} ${description} ${headings} ${body}`);
  if(!title&&searchable.length<40)return null;
  return{url,title:title||displayURL(url),description,headings,body,searchable,pageTokens:unique(tokens(searchable)),category:pageCategory(url,title,body),links};
};

const runtimeLanding=source=>{const key=normalize(source);if(/hospital|clinic|network|unit/.test(key))return'network.html';if(/stor(?:y|ies)|dispatch|wire|news/.test(key))return/dispatch|wire|news/.test(key)?'dispatch.html':'stories.html';if(/learn|guide|emergency|knowledge/.test(key))return'learning-center.html';if(/adopt|animal/.test(key))return'adopt.html';if(/product|store|shop|food|medicine|pharmacy|toy/.test(key))return'store.html';if(/member|patron/.test(key))return'membership.html';return'index.html';};
const extractRuntimeRecords=()=>{
  const roots=[['PFA_DATA',window.PFA_DATA],['PFAData',window.PFAData],['pfaData',window.pfaData],['SITE_DATA',window.SITE_DATA],['PFA_PRODUCT_SEARCH_INDEX',window.PFA_PRODUCT_SEARCH_INDEX]].filter(([,value])=>value&&typeof value==='object');
  const seen=new WeakSet(),recordKeys=new Set(),records=[];
  const visit=(value,path=[])=>{
    if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
    if(Array.isArray(value)){value.forEach(item=>visit(item,path));return;}
    const source=path.join(' '),title=String(value.title||value.name||value.productName||value.heading||value.question||value.n||'').trim();
    const primitives=Object.entries(value).filter(([key,item])=>!/(?:image|photo|icon|logo|src|id)$/i.test(key)&&['string','number','boolean'].includes(typeof item)).map(([key,item])=>`${key}: ${item}`);
    const body=primitives.join(' · ').replace(/\s+/g,' ').trim().slice(0,12000);
    if(title&&body.length>title.length+8){
      const rawURL=value.url||value.href||value.link||value.page||value.path||value.u||runtimeLanding(source);
      let url;try{url=new URL(String(rawURL),location.href).href;}catch(_){url=new URL(runtimeLanding(source),location.href).href;}
      const description=String(value.description||value.summary||value.excerpt||value.subtitle||'').trim(),searchable=normalize(`${title} ${title} ${description} ${source} ${body}`),key=`${normalize(title)}|${url}|${normalize(body).slice(0,160)}`;
      if(!recordKeys.has(key)){recordKeys.add(key);records.push({url,title,description,headings:source,body,searchable,pageTokens:unique(tokens(searchable)),category:pageCategory(`${url} ${source}`,title,body),links:[]});}
    }
    Object.entries(value).forEach(([key,item])=>{if(item&&typeof item==='object')visit(item,[...path,key]);});
  };
  roots.forEach(([name,value])=>visit(value,[name]));
  return records;
};
const mergePages=pages=>{const merged=new Map();pages.filter(Boolean).forEach(page=>{const key=`${normalize(page.title)}|${page.url}`;if(!merged.has(key)||String(page.body||'').length>String(merged.get(key).body||'').length)merged.set(key,page);});return[...merged.values()];};

const cacheKey=()=>`${CONFIG.indexVersion}:${location.origin}${location.pathname.replace(/[^/]+$/,'')}`;
const readCache=()=>{try{const cached=JSON.parse(localStorage.getItem(cacheKey())||'null');if(!cached||!Array.isArray(cached.pages)||Date.now()-cached.savedAt>CONFIG.cacheHours*3600000)return null;return cached.pages;}catch(_){return null;}};
const saveCache=pages=>{try{const compact=pages.map(({links,...page})=>page);localStorage.setItem(cacheKey(),JSON.stringify({savedAt:Date.now(),pages:compact}));}catch(_){/* Search still works if storage is blocked. */}};

const sitemapURLs=async()=>{
  const candidates=[new URL('sitemap.xml',location.href)];if(/^https?:/i.test(location.protocol||''))candidates.push(new URL('/sitemap.xml',location.origin));
  for(const candidate of candidates){try{const response=await fetch(candidate,{cache:'no-cache'});if(!response.ok)continue;const xml=await response.text();const urls=[...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(match=>cleanURL(match[1])).filter(Boolean);if(urls.length)return urls;}catch(_){/* Fall through to crawl. */}}
  return[];
};
const fetchPage=async url=>{try{const response=await fetch(url,{headers:{Accept:'text/html'}});const contentType=response.headers.get('content-type')||'';if(!response.ok||(contentType&&!contentType.includes('text/html')))return null;return parsePage(await response.text(),response.url||url);}catch(_){return null;}};

const crawlSite=async()=>{
  const base=new URL('.',location.href);const sitemap=await sitemapURLs();
  const queue=unique([...sitemap,base.href,...CONFIG.fallbackPages.map(page=>new URL(page,base).href)].map(cleanURL).filter(Boolean));
  const queued=new Set(queue),visited=new Set(),pages=[];
  while(queue.length&&visited.size<CONFIG.maxPages){
    const batch=queue.splice(0,CONFIG.concurrency).filter(url=>!visited.has(url));batch.forEach(url=>visited.add(url));
    const fetched=await Promise.all(batch.map(fetchPage));
    fetched.filter(Boolean).forEach(page=>{if(!/search(?:\.html)?$/i.test(new URL(page.url).pathname))pages.push(page);page.links.forEach(link=>{if(!queued.has(link)&&queued.size<CONFIG.maxPages*2){queued.add(link);queue.push(link);}});});
    updateStatus(`Preparing site-wide search… ${pages.length} pages ready`,'loading');
    if(state.query&&pages.length){state.pages=pages;renderSearch(state.query,false);}
  }
  return pages;
};

const loadOptionalIndex=async()=>{
  try{const response=await fetch(new URL('assets/search-index.json',location.href),{cache:'no-cache'});if(!response.ok)return null;const data=await response.json();const items=Array.isArray(data)?data:data.pages;if(!Array.isArray(items)||!items.length)return null;return items.map(item=>{const body=String(item.body||item.content||item.text||''),title=String(item.title||displayURL(item.url||'')),description=String(item.description||''),headings=Array.isArray(item.headings)?item.headings.join(' · '):String(item.headings||''),searchable=normalize(`${title} ${title} ${description} ${headings} ${body}`);return{url:new URL(item.url||item.path||'',location.href).href,title,description,headings,body,searchable,pageTokens:unique(tokens(searchable)),category:item.category||pageCategory(item.url||'',title,body)};});}catch(_){return null;}
};

const initializeIndex=async()=>{
  if(state.indexing)return;state.indexing=true;
  const runtimePages=extractRuntimeRecords();
  const cached=readCache();
  if(cached?.length){state.pages=mergePages([...runtimePages,...cached]);state.ready=true;state.indexing=false;updateStatus(`${state.pages.length} pages and products searchable`,'ready');els.results.setAttribute('aria-busy','false');if(state.query)renderSearch(state.query,false);return;}
  state.pages=runtimePages;if(state.query&&runtimePages.length)renderSearch(state.query,false);
  const supplied=await loadOptionalIndex();const crawled=supplied?.length?supplied:await crawlSite();const pages=mergePages([...runtimePages,...crawled]);
  state.pages=pages;state.ready=true;state.indexing=false;state.error=pages.length===0;els.results.setAttribute('aria-busy','false');
  if(pages.length){saveCache(pages);updateStatus(`${pages.length} pages searchable`,'ready');if(state.query)renderSearch(state.query,false);}else{updateStatus('Search index could not be loaded','error');renderError();}
};

const expandedTerms=query=>{const original=unique(tokens(query)),meaningful=original.filter(word=>!STOP_WORDS.has(word)),primary=meaningful.length?meaningful:original;return primary.map(word=>({word,stem:stem(word),alternatives:unique([word,...(SYNONYMS[word]||[])])}));};
const termStrength=(term,page)=>{
  const title=normalize(page.title),headings=normalize(page.headings),description=normalize(page.description),url=normalize(displayURL(page.url)),fields=[title,headings,description,page.searchable,url];let strongest=0;
  term.alternatives.forEach((alternative,alternativeIndex)=>{const multiplier=alternativeIndex===0?1:.66;if(title.split(' ').includes(alternative))strongest=Math.max(strongest,14*multiplier);else if(title.includes(alternative))strongest=Math.max(strongest,11*multiplier);if(headings.includes(alternative))strongest=Math.max(strongest,8*multiplier);if(description.includes(alternative))strongest=Math.max(strongest,6*multiplier);if(url.includes(alternative))strongest=Math.max(strongest,5*multiplier);if(page.searchable.includes(alternative))strongest=Math.max(strongest,3.2*multiplier);});
  if((page.pageTokens||[]).includes(term.word))strongest+=2.4;
  if(!strongest&&term.stem.length>=4&&fields.some(field=>tokens(field).some(word=>stem(word)===term.stem)))strongest=2.6;
  if(!strongest&&fuzzyMatch(term.word,page.pageTokens||[]))strongest=1.7;
  return strongest;
};
const rankPage=(page,query,terms)=>{const normalizedQuery=normalize(query),strengths=terms.map(term=>termStrength(term,page)),matched=strengths.filter(Boolean).length;if(!matched)return null;let score=strengths.reduce((sum,value)=>sum+value,0);const title=normalize(page.title),headings=normalize(page.headings);if(title===normalizedQuery)score+=70;else if(title.includes(normalizedQuery))score+=34;if(headings.includes(normalizedQuery))score+=21;if(page.searchable.includes(normalizedQuery))score+=15;if(matched===terms.length)score+=14+terms.length*4;score+=(matched/terms.length)*10;return{...page,score,matched,termCount:terms.length};};
const search=query=>{const terms=expandedTerms(query);if(!terms.length)return[];return state.pages.map(page=>rankPage(page,query,terms)).filter(Boolean).sort((left,right)=>right.score-left.score||right.matched-left.matched||String(right.body||'').length-String(left.body||'').length||left.title.localeCompare(right.title)).slice(0,CONFIG.maxResults);};

const findSnippet=(page,query)=>{
  const source=page.body||page.description||page.headings||'';if(!source)return'';const lowered=normalize(source),terms=expandedTerms(query);let bestIndex=lowered.indexOf(normalize(query));
  if(bestIndex<0){const candidates=terms.flatMap(term=>term.alternatives);bestIndex=candidates.reduce((best,term)=>{const index=lowered.indexOf(term);return index>=0&&(best<0||index<best)?index:best;},-1);}
  const approximateRatio=source.length/Math.max(lowered.length,1),center=bestIndex<0?0:Math.round(bestIndex*approximateRatio),start=Math.max(0,center-105),end=Math.min(source.length,start+285);let snippet=source.slice(start,end).trim();if(start>0)snippet=`…${snippet.replace(/^\S*\s/,'')}`;if(end<source.length)snippet=`${snippet.replace(/\s\S*$/,'')}…`;return snippet;
};
const highlight=(text,query)=>{let output=escapeHTML(text);const candidates=unique(expandedTerms(query).flatMap(term=>[term.word,...term.alternatives])).filter(term=>term.length>1).sort((left,right)=>right.length-left.length).slice(0,18);candidates.forEach(term=>{const safe=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');output=output.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${safe})(?=$|[^\\p{L}\\p{N}])`,'giu'),'$1<mark>$2</mark>');});return output;};
const categoryCounts=results=>{const counts=new Map([['All',results.length]]);results.forEach(result=>counts.set(result.category,(counts.get(result.category)||0)+1));return counts;};

const renderFilters=results=>{state.resultCounts=categoryCounts(results);const categories=CATEGORY_ORDER.filter(category=>state.resultCounts.get(category));if(!results.length||categories.length<2){els.filters.hidden=true;return;}els.filters.hidden=false;els.filterList.innerHTML=categories.map(category=>`<button aria-pressed="${state.filter===category}" class="search-filter" data-filter="${escapeHTML(category)}" type="button"><span>${escapeHTML(category)}</span><span class="search-filter-count">${state.resultCounts.get(category)}</span></button>`).join('');};
const resultMarkup=(result,query)=>{const snippet=findSnippet(result,query);return`<a class="search-result" href="${escapeHTML(result.url)}"><span class="search-result-type">${escapeHTML(result.category)}</span><h2 class="search-result-title">${highlight(result.title,query)}</h2><span class="search-result-url">${escapeHTML(displayURL(result.url))}</span><p class="search-result-snippet">${highlight(snippet||result.description||'Open this page on the PFA website.',query)}</p></a>`;};

const renderSearch=(query,updateHistory=true)=>{
  const cleanQuery=String(query||'').trim();state.query=cleanQuery;els.clear.hidden=!cleanQuery;
  if(updateHistory){const url=new URL(location.href);cleanQuery?url.searchParams.set('q',cleanQuery):url.searchParams.delete('q');history.replaceState({},'',url);}
  if(!cleanQuery){state.filter='All';els.filters.hidden=true;els.suggestions.hidden=false;els.results.innerHTML='<div class="search-welcome"><h2>One search.<br>The whole PFA website.</h2><p>Start with whatever you remember. The search understands partial phrases and small spelling mistakes, then shows the most relevant passage from each page.</p></div>';updateStatus(state.ready?`${state.pages.length} pages searchable`:'Preparing site-wide search…',state.ready?'ready':'loading');return;}
  els.suggestions.hidden=true;const allResults=search(cleanQuery);if(state.filter!=='All'&&!allResults.some(result=>result.category===state.filter))state.filter='All';const visible=state.filter==='All'?allResults:allResults.filter(result=>result.category===state.filter);state.renderedResults=visible;renderFilters(allResults);
  if(!allResults.length){els.results.innerHTML=`<div class="search-empty"><h2>No clear match for “${escapeHTML(cleanQuery)}”</h2><p>Try fewer words, a different spelling, a city name, or a broader phrase such as “vet near me”, “adoption” or “emergency help”.</p></div>`;updateStatus(state.ready?'No results':'Still checking the website…',state.ready?'ready':'loading');return;}
  els.results.innerHTML=visible.map(result=>resultMarkup(result,cleanQuery)).join('');const totalLabel=`${allResults.length} relevant ${allResults.length===1?'result':'results'}`,filterLabel=state.filter==='All'?'':` · ${visible.length} in ${state.filter}`;updateStatus(`${totalLabel}${filterLabel}${state.ready?'':' · more may appear'}`,state.ready?'ready':'loading');
};

const renderOverlay=query=>{const cleanQuery=String(query||'').trim();if(!cleanQuery){els.overlayResults.innerHTML='<p class="search-result-snippet">Search any word, phrase, location, animal, service or topic.</p>';return;}const results=search(cleanQuery).slice(0,CONFIG.overlayResults);if(!results.length){els.overlayResults.innerHTML=`<p class="search-result-snippet">${state.ready?'No clear match yet.':'Searching the website…'}</p><a class="overlay-result" href="search.html?q=${encodeURIComponent(cleanQuery)}"><strong>See full search</strong><span>Try the complete results page</span></a>`;return;}els.overlayResults.innerHTML=results.map(result=>`<a class="overlay-result" href="${escapeHTML(result.url)}"><strong>${highlight(result.title,cleanQuery)}</strong><span>${highlight(findSnippet(result,cleanQuery),cleanQuery)}</span></a>`).join('')+`<a class="overlay-result" href="search.html?q=${encodeURIComponent(cleanQuery)}"><strong>See all results</strong><span>Open the complete search page</span></a>`;};
const renderError=()=>{if(!state.query)return;els.results.innerHTML='<div class="search-error"><h2>Search is temporarily unavailable.</h2><p>Please refresh the page and try again. You can still use the navigation above to browse PFA.</p></div>';els.filters.hidden=true;};
const updateStatus=(message,statusState)=>{els.status.textContent=message;els.status.dataset.state=statusState;};
const debounce=(callback,delay=110)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>callback(...args),delay);};};

els.form.addEventListener('submit',event=>{event.preventDefault();renderSearch(els.input.value);});
els.input.addEventListener('input',debounce(event=>renderSearch(event.target.value)));
els.input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){const first=els.results.querySelector('.search-result');if(first){event.preventDefault();first.focus();}}});
els.clear.addEventListener('click',()=>{els.input.value='';renderSearch('');els.input.focus();});
els.suggestions.addEventListener('click',event=>{const button=event.target.closest('[data-query]');if(!button)return;els.input.value=button.dataset.query;renderSearch(button.dataset.query);els.input.focus();});
els.filterList.addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;state.filter=button.dataset.filter;renderSearch(state.query,false);});
els.results.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;const links=[...els.results.querySelectorAll('.search-result')],index=links.indexOf(document.activeElement);if(index<0)return;event.preventDefault();if(event.key==='ArrowDown'&&links[index+1])links[index+1].focus();if(event.key==='ArrowUp')(links[index-1]||els.input).focus();});
if(els.overlayInput){els.overlayInput.addEventListener('input',debounce(event=>renderOverlay(event.target.value)));document.querySelectorAll('[data-search-open]').forEach(button=>button.addEventListener('click',()=>window.setTimeout(()=>{els.overlayInput.focus();renderOverlay(els.overlayInput.value);},30)));renderOverlay('');}
const initialQuery=new URLSearchParams(location.search).get('q')||'';if(initialQuery){els.input.value=initialQuery;renderSearch(initialQuery,false);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeIndex,{once:true});else initializeIndex();
})();

