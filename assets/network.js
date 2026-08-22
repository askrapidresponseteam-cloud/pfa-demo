
(function(){'use strict';var D=window.PFA_DATA||{},P=window.PFA;var host=P.q('#unitGrid'),state=P.q('#stateFilter'),term=P.q('#unitSearch'),count=P.q('#unitCount'),more=P.q('#unitMore');var limit=18,near=null;
var states=Array.from(new Set((D.units||[]).map(function(x){return x.s}))).sort();if(state)state.innerHTML='<option value="">All states</option>'+states.map(function(s){return '<option>'+P.escape(s)+'</option>'}).join('');
function dist(a,b,c,d){var R=6371,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p;var q=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function list(){var q=(term&&term.value||'').toLowerCase(),s=state&&state.value||'';var arr=(D.units||[]).map(function(x,i){var z=Object.assign({idx:i},x);if(near&&x.y!=null&&x.x!=null)z.distance=dist(near.lat,near.lng,x.y,x.x);return z}).filter(function(x){return (!s||x.s===s)&&(!q||(x.n+' '+x.c+' '+x.s+' '+x.h+' '+(x.a||'')).toLowerCase().indexOf(q)>-1)});if(near)arr.sort(function(a,b){return (a.distance||99999)-(b.distance||99999)});return arr}
/* Roughly half the directory is a hospital or centre with a street address;
   the rest is a named local contact with a phone. Both are worth having, and
   someone setting off in a car with an injured animal needs to know which one
   they are heading for, so the card says.

   It used to print "Address available on the unit page" when there was no
   address, which was not true: there is none on the unit page either. */
function isPlace(x){return Boolean(x&&x.a&&String(x.a).trim())}

function render(){if(!host)return;var arr=list();
if(count)count.textContent=arr.length+(arr.length===1?' result':' results');
host.innerHTML=arr.slice(0,limit).map(function(x){
  var d=x.distance!=null?'<span class="tag blue">'+x.distance.toFixed(0)+' km away</span>':'';
  var place=isPlace(x);
  var kind=place?'<span class="tag">Hospital or centre</span>':'<span class="tag warn">Local contact</span>';
  var body=place?P.escape(x.a):'Rescue contact for this district.';
  return '<article class="unit-card"><div class="unit-state">'+P.escape(x.s)+'</div><div class="unit-city">'+P.escape(x.c)+'</div><p><strong>'+P.escape(x.h||'PFA contact')+'</strong><br>'+body+'</p>'+kind+d+'<div class="unit-actions"><a class="btn dark" href="hospital.html?id='+x.idx+'">View</a>'+(x.p?'<a class="btn light" href="tel:'+P.escape(String(x.p).replace(/[^0-9+]/g,''))+'">Call</a>':'')+'</div></article>'
}).join('')||'<div class="empty-state"><strong>No unit matches.</strong>Try another city, state or contact name.</div>';
if(more)more.style.display=arr.length>limit?'flex':'none'}

/* The counts in the page copy are written out in words, so they cannot be
   left behind when the directory changes. These rewrite them from the data at
   load, and test/network-claims.test.js fails the build if the words in the
   HTML and the numbers in data.js ever disagree. */
function statedCounts(){
  var all=(D.units||[]);
  var places=all.filter(isPlace).length;
  var states={};all.forEach(function(x){if(x.s)states[x.s]=1});
  return {total:all.length,places:places,contacts:all.length-places,states:Object.keys(states).length};
}
(function(){
  var n=statedCounts();
  var strip=P.q('[data-network-count]');
  if(strip)strip.textContent='PFA in '+n.states+' states';
  var lead=P.q('[data-network-lead]');
  if(lead)lead.textContent='PFA units and local contacts across '+n.states+' states - hospitals, shelters, '
    +'ambulances and rescue teams, each with a named person and a number. '
    +'Find the one nearest you, or look up any of them.';
}());
[term,state].forEach(function(e){if(e)e.addEventListener('input',function(){limit=18;render()})});if(more)more.onclick=function(){limit+=18;render()};var nearBtn=P.q('#nearestUnit');if(nearBtn)nearBtn.onclick=function(){var status=P.q('#nearStatus');P.location(status,function(pos){near={lat:pos.coords.latitude,lng:pos.coords.longitude};render()})};
P.qa('[data-help-tab]').forEach(function(b){b.onclick=function(){P.qa('[data-help-tab]').forEach(function(x){x.classList.remove('active')});P.qa('[data-help-panel]').forEach(function(x){x.classList.remove('active')});b.classList.add('active');var p=P.q('#'+b.dataset.helpTab);if(p)p.classList.add('active')}});
P.qa('form[data-help-form]').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();if(!P.validate(f))return;var ref=P.saveSubmission(f.dataset.helpForm,P.formData(f));var out=P.q('.form-success',f.parentElement)||P.q('#helpSuccess');if(out){out.classList.add('show');P.renderRef(out,ref,'Received. A named person can now follow this record.')}f.reset()})});
var follow=P.q('#followForm');if(follow){var STATUS_CLASS={new:'is-new','in-progress':'is-progress',handled:'is-closed',spam:'is-closed'};
var fmtWhen=function(iso){if(!iso)return '';var d=new Date(iso);return isNaN(d.getTime())?'':d.toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
var showFollow=function(html){P.q('#followResult').innerHTML=html};
var lookup=function(){var ref=P.q('#followRef').value.trim().toUpperCase().replace(/\s+/g,''),contact=P.q('#followContact').value.trim();
if(!ref){P.toast('Enter your reference number');P.q('#followRef').focus();return}
P.q('#followRef').value=ref;showFollow('<div class="notice">Checking with PFA\u2026</div>');
fetch('/api/pfa-submissions?reference='+encodeURIComponent(ref)+'&contact='+encodeURIComponent(contact)).then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {ok:r.ok,j:j}})},function(){return {ok:false,j:{error:'Could not reach PFA. Check the connection, then try again.'}}})
.then(function(x){var j=x.j||{};if(!x.ok||!j.ok){var amber=j.code==='CONTACT_NEEDED'||j.code==='CONTACT_MISMATCH';if(j.code==='CONTACT_NEEDED')P.q('#followContact').focus();showFollow('<div class="notice amber">'+P.escape(j.error||'That could not be checked right now.')+'</div>');return}
showFollow('<div class="track '+(STATUS_CLASS[j.status]||'is-new')+'"><div class="track-head"><div><p class="ref-kicker">'+P.escape(j.kindLabel||'Submission')+'</p><strong>'+P.escape(j.reference)+'</strong></div><span class="track-status">'+P.escape(j.statusLabel)+'</span></div>'+
'<ol class="track-steps">'+(j.timeline||[]).map(function(t){return '<li><span class="track-dot"></span><div><b>'+P.escape(t.label)+'</b><time>'+P.escape(fmtWhen(t.at))+'</time></div></li>'}).join('')+'</ol>'+
'<p class="track-next">'+P.escape(j.next||'')+'</p></div>')})};
follow.addEventListener('submit',function(e){e.preventDefault();lookup()});
/* A number just issued on this device, or linked from an email, is offered back so nobody retypes it. */
var openFromHash=function(){var m=/[#&]follow=([^&]+)/.exec(location.hash);if(!m)return;try{P.q('#followRef').value=decodeURIComponent(m[1]).toUpperCase()}catch(_){}
var tab=P.q('[data-help-tab="followPanel"]');if(tab)tab.click();var hd=P.q('#helpdesk');if(hd)setTimeout(function(){hd.scrollIntoView({block:'start'})},50);showFollow('');P.q('#followContact').focus()};
openFromHash();window.addEventListener('hashchange',openFromHash);
var recent=(P.store('pfa_submissions')||[]).filter(function(x){return x&&x.ref}).slice(0,4),recentHost=P.q('#followRecent');
if(recentHost&&recent.length){recentHost.hidden=false;recentHost.innerHTML='<span>Numbers issued on this device:</span>'+recent.map(function(x){return '<button class="chip" type="button" data-recent-ref="'+P.escape(x.ref)+'">'+P.escape(x.ref)+'</button>'}).join('');
recentHost.addEventListener('click',function(e){var b=e.target.closest('[data-recent-ref]');if(!b)return;P.q('#followRef').value=b.dataset.recentRef;P.q('#followContact').focus()})}}
render()})();
