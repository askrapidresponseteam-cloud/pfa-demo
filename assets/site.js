
(function(){
'use strict';
var D=window.PFA_DATA||{};
var PFA=window.PFA=window.PFA||{};
PFA.q=function(s,r){return (r||document).querySelector(s)};
PFA.qa=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
PFA.param=function(k){return new URLSearchParams(location.search).get(k)};
PFA.money=function(n){return '₹'+Number(n||0).toLocaleString('en-IN')};
PFA.escape=function(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML};
PFA.toast=function(t){var e=PFA.q('#toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(PFA.toast.t);PFA.toast.t=setTimeout(function(){e.classList.remove('show')},1600)};
PFA.ref=function(prefix){return prefix+'-'+new Date().getFullYear()+'-'+Math.floor(10000+Math.random()*90000)};
PFA.copy=function(text){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){PFA.toast('Copied')}).catch(function(){fallback(text)})}else fallback(text);function fallback(v){var t=document.createElement('textarea');t.value=v;document.body.appendChild(t);t.select();try{document.execCommand('copy');PFA.toast('Copied')}catch{PFA.toast(v)}t.remove()}};
PFA.share=function(data){if(navigator.share){navigator.share(data).catch(function(){})}else{PFA.copy(data.url||location.href)}};
PFA.location=function(status,cb){if(!navigator.geolocation){status.textContent='Location is not available in this browser.';return}status.textContent='Finding location...';navigator.geolocation.getCurrentPosition(function(pos){status.textContent='Location captured. Check the address above and add the house number.';status.dataset.lat=pos.coords.latitude;status.dataset.lng=pos.coords.longitude;PFA.toast('Location captured');if(cb)cb(pos)},function(){status.textContent='We could not read your location. Type the address instead.'},{enableHighAccuracy:false,timeout:7000,maximumAge:300000})};
PFA.store=function(key,val){try{if(arguments.length===1)return JSON.parse(localStorage.getItem(key)||'null');localStorage.setItem(key,JSON.stringify(val));return true}catch{return false}};
PFA.cart=function(){return PFA.store('pfa_cart')||{}};
PFA.setCart=function(c){PFA.store('pfa_cart',c);PFA.updateCartBadges()};
PFA.addCart=function(id,qty){var c=PFA.cart();c[id]=(c[id]||0)+(qty||1);PFA.setCart(c);PFA.toast('Added to cart')};
PFA.cartCount=function(){var c=PFA.cart(),n=0;Object.keys(c).forEach(function(k){n+=c[k]});return n};
PFA.updateCartBadges=function(){PFA.qa('[data-cart-count]').forEach(function(e){e.textContent=PFA.cartCount()})};
PFA.product=function(id){return (D.products||[]).find(function(x){return x.id===id})};
PFA.cartItems=function(){var c=PFA.cart(),out=[];Object.keys(c).forEach(function(id){var p=PFA.product(id);if(p)out.push({product:p,qty:c[id]})});return out};
PFA.cartSubtotal=function(){return PFA.cartItems().reduce(function(s,x){return s+x.product.price*x.qty},0)};
/* What leaves the form is the normalised value, not the keystrokes. A mobile
   typed as "+91 98765 43210" and one typed as "09876543210" are the same
   number, and the record should not depend on which way the person happened
   to write it. */
PFA.formData=function(form){
  var R=window.PFA_RULES,o={};
  new FormData(form).forEach(function(v,k){
    if(R&&typeof v==='string')v=R.normaliseField(k,v);
    if(o[k]!==undefined)o[k]=[].concat(o[k],v);else o[k]=v;
  });
  return o;
};
PFA.validate=function(form){
  var R=window.PFA_RULES,first=null;
  PFA.qa('input,select,textarea',form).forEach(function(f){
    if(f.type==='hidden'||f.type==='submit'||f.type==='button'||f.disabled)return;
    var msg=PFA.checkOne(f);
    PFA.markField(f,msg);
    if(msg&&!first)first=f;
  });
  if(first){
    first.focus();
    if(first.scrollIntoView)first.scrollIntoView({block:'center',behavior:'smooth'});
    PFA.announceInvalid(form);
    return false;
  }
  return true;
};

/* One field, one verdict. Required-ness comes from the markup; the rule comes
   from the field's name, so a "mobile" is checked the same way on every page. */
PFA.checkOne=function(f){
  var R=window.PFA_RULES;
  var name=f.name||f.id||'';
  /* The pages already carry good bespoke wording in their .error spans
     ("Enter your name."). Use it when a required field is simply empty, and
     keep the rule's message for when the entry is present but malformed. */
  var field=f.closest('.field')||f.parentElement;
  var span=field&&PFA.q('.error',field);
  var written=span?(span.dataset.original||span.textContent||'').trim():'';
  if(f.type==='checkbox')
    return (f.required&&!f.checked)?(written||'Please tick this to continue.'):null;
  if(f.type==='radio')return null;
  if(f.type==='file')return PFA.checkFile(f);
  var raw=f.value;
  if(f.tagName==='SELECT'){
    return (f.required&&!String(raw||'').trim())?(written||'Choose an option.'):null;
  }
  if(!R)  /* rules script missing: fall back to markup-level checks only */
    return (f.required&&!String(raw||'').trim())?(written||'This is needed.'):null;
  return R.checkField(name,raw,{
    required:f.required,
    type:f.type,
    emptyMessage:f.dataset.emptyMessage||written||''
  });
};

/* Uploads are checked for the two things that actually go wrong: a file that
   is not an image, and a file too large to travel on a phone connection. */
PFA.checkFile=function(f){
  if(f.required&&!f.files.length)return 'Choose a file.';
  if(!f.files.length)return null;
  var file=f.files[0],max=Number(f.dataset.maxMb||5)*1024*1024;
  if(f.accept&&f.accept.indexOf('image')>-1&&file.type.indexOf('image/')!==0)
    return 'That is not an image file.';
  if(file.size>max)return 'That file is over '+(max/1048576)+'MB. Please use a smaller one.';
  return null;
};

/* Show or clear the verdict, keeping the visual language already in the sheet
   (.field.invalid) and adding what a screen reader needs. */
PFA.markField=function(f,msg){
  var field=f.closest('.field')||f.parentElement;
  if(!field)return;
  field.classList.toggle('invalid',!!msg);
  f.setAttribute('aria-invalid',msg?'true':'false');
  var span=PFA.q('.error',field);
  if(span){
    if(msg){
      if(!span.dataset.original)span.dataset.original=span.textContent;
      span.textContent=msg;
      if(!span.id)span.id='err-'+(f.id||f.name||Math.random().toString(36).slice(2,7));
      f.setAttribute('aria-describedby',span.id);
    }else if(span.dataset.original){
      span.textContent=span.dataset.original;
    }
  }
};

PFA.announceInvalid=function(form){
  var live=PFA.q('[data-validation-summary]',form);
  if(!live){
    live=document.createElement('p');
    live.className='form-invalid-note';
    live.setAttribute('role','alert');
    live.setAttribute('data-validation-summary','');
    form.insertBefore(live,form.firstChild);
  }
  var n=PFA.qa('.field.invalid',form).length;
  live.textContent=n===1?'One field needs attention.':n+' fields need attention.';
};

/* Keystroke filtering and tidy-up, for every data-entry control on the site,
   including ones a script renders later. The rule is looked up from the
   field's name (or id), exactly as PFA.checkOne does, so a digit can never be
   typed or pasted into a name field, a letter can never land in a mobile or
   PIN field, and a name or address is put into Title Case the moment the
   person leaves the box. Search boxes, passwords and file pickers are left
   alone. */
var SKIP_TYPES={hidden:1,submit:1,button:1,file:1,checkbox:1,radio:1,search:1,password:1,range:1,color:1,date:1,time:1,number:1};
PFA.fieldKey=function(f){return f.name||f.id||''};
PFA.isDataField=function(f){
  if(!f||!(f.tagName==='INPUT'||f.tagName==='TEXTAREA'))return false;
  if(SKIP_TYPES[f.type])return false;
  if(f.hasAttribute('data-no-filter'))return false;
  return true;
};
/* Rules that change what was typed into a display form. Amounts, free text
   and choices are left as typed. */
var TIDY_RULES={personName:1,place:1,locality:1,address:1,email:1,contact:1,mobile:1,pin:1,reference:1,cardId:1,memberId:1,handle:1,orgName:1,shortText:1,shortValue:1};
PFA.filterInput=function(f){
  var R=window.PFA_RULES;if(!R||!PFA.isDataField(f))return;
  var key=PFA.fieldKey(f);if(!R.ruleName(key,f.type))return;
  var before=f.value,after=R.filterField(key,before,f.type);
  if(after===before)return;
  var pos=f.selectionStart;
  f.value=after;
  /* Keep the caret where the person was typing: its new position is how
     much of the text before it survived the filter. */
  if(typeof pos==='number'){try{var at=Math.min(after.length,R.filterField(key,before.slice(0,pos),f.type).length);f.setSelectionRange(at,at)}catch(_){}}
};
PFA.tidyInput=function(f){
  var R=window.PFA_RULES;if(!R||!PFA.isDataField(f))return;
  var key=PFA.fieldKey(f),rule=R.ruleName(key,f.type);
  if(!rule||!TIDY_RULES[rule])return;
  if(!String(f.value||'').trim())return;
  var tidy=R.normaliseField(key,f.value,f.type);
  if(tidy!==f.value){f.value=tidy;f.dispatchEvent(new Event('input',{bubbles:true}))}
};
/* Length caps come from the rule, so a page cannot quietly allow more than
   the record will hold. */
PFA.capLength=function(f){
  var R=window.PFA_RULES;if(!R||!PFA.isDataField(f))return;
  var rule=R.ruleFor(PFA.fieldKey(f),f.type);
  if(!rule||!rule.max)return;
  var current=Number(f.getAttribute('maxlength')||0);
  /* A mobile box must let "+91 98765 43210" in so the filter can strip the
     prefix; the filter keeps what stays in the box to ten digits. */
  var cap=rule===R.rules.mobile?15:rule.max;
  if(!current||current>cap||(rule===R.rules.mobile&&current<cap))f.setAttribute('maxlength',String(cap));
  if(rule===R.rules.mobile||rule===R.rules.pin||rule===R.rules.otp||rule===R.rules.amount){
    if(!f.getAttribute('inputmode'))f.setAttribute('inputmode','numeric');
  }
  if(rule===R.rules.email&&!f.getAttribute('inputmode'))f.setAttribute('inputmode','email');
  if(rule===R.rules.personName||rule===R.rules.place){f.setAttribute('autocapitalize','words');f.setAttribute('spellcheck','false')}
};
document.addEventListener('input',function(e){PFA.filterInput(e.target)},true);
document.addEventListener('blur',function(e){PFA.tidyInput(e.target)},true);
document.addEventListener('change',function(e){if(e.target&&e.target.tagName!=='SELECT')PFA.tidyInput(e.target)},true);
function primeFields(root){PFA.qa('input,textarea',root).forEach(PFA.capLength)}
document.addEventListener('DOMContentLoaded',function(){
  primeFields(document);
  new MutationObserver(function(records){
    records.forEach(function(r){r.addedNodes.forEach(function(n){if(n.nodeType===1)primeFields(n)})});
  }).observe(document.documentElement,{childList:true,subtree:true});
});

/* Wire every form on the page: check a field when the person leaves it, and
   once it has gone red, re-check as they type so the message clears the moment
   they fix it rather than on the next submit. */
document.addEventListener('DOMContentLoaded',function(){
  PFA.qa('form').forEach(function(form){
    if(form.hasAttribute('data-no-validate'))return;
    PFA.qa('input,select,textarea',form).forEach(function(f){
      if(f.type==='hidden'||f.type==='search')return;
      /* Leaving a box empty is not yet a mistake: the person may simply be
         moving on. Submit is where emptiness is judged. A box with something
         in it is judged the moment it is left. */
      f.addEventListener('blur',function(){
        if(f.type==='checkbox'||f.type==='radio'||f.type==='file')return;
        if(!String(f.value||'').trim())return;
        PFA.markField(f,PFA.checkOne(f));
      });
      var live=function(){
        var field=f.closest('.field')||f.parentElement;
        if(field&&field.classList.contains('invalid'))PFA.markField(f,PFA.checkOne(f));
      };
      f.addEventListener('input',live);
      f.addEventListener('change',live);
    });
  });
});
PFA.saveSubmission=function(kind,data){var key='pfa_submissions';var all=PFA.store(key)||[];var ref=PFA.ref(kind);all.unshift({ref:ref,kind:kind,data:data,at:Date.now(),status:'Received'});PFA.store(key,all);
try{fetch('/api/pfa-submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:kind,reference:ref,data:data,page:location.pathname})}).catch(function(){});}catch(_){/* offline or blocked: local reference still stands */}
return ref};
PFA.renderRef=function(host,ref,title){host.innerHTML='<div class="ref-box"><strong>'+PFA.escape(ref)+'</strong><p>'+PFA.escape(title||'Received. Keep this number for follow-up.')+'</p><button class="btn light" type="button" data-copy-ref>Copy number</button></div>';var b=PFA.q('[data-copy-ref]',host);if(b)b.onclick=function(){PFA.copy(ref)}};

function menu(open){var m=PFA.q('#mobileMenu');if(!m)return;m.classList.toggle('open',open);document.body.classList.toggle('locked',open);var b=PFA.q('[data-menu-open]');if(b)b.setAttribute('aria-expanded',open?'true':'false')}
function search(open){var s=PFA.q('#searchOverlay');if(!s)return;s.classList.toggle('open',open);document.body.classList.toggle('locked',open);if(open){setTimeout(function(){var i=PFA.q('#globalSearch');if(i)i.focus()},20)}}
PFA.qa('[data-menu-open]').forEach(function(b){b.onclick=function(){menu(true)}});PFA.qa('[data-menu-close]').forEach(function(b){b.onclick=function(){menu(false)}});PFA.qa('#mobileMenu a').forEach(function(a){a.onclick=function(){menu(false)}});
PFA.qa('[data-search-open]').forEach(function(b){b.onclick=function(){search(true)}});PFA.qa('[data-search-close]').forEach(function(b){b.onclick=function(){search(false)}});
window.addEventListener('keydown',function(e){if(e.key==='Escape'){menu(false);search(false);PFA.qa('.modal-scrim.open').forEach(function(x){x.classList.remove('open')})}if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement.tagName)){e.preventDefault();search(true)}});

function searchIndex(){var out=[
{type:'Page',title:'Home',body:'People for Animals services, hospitals, rescue, adoption, casework and learning',href:'index.html'},
{type:'Page',title:'Hospitals and Help Desk',body:'Find a PFA unit, raise a complaint or ask a question',href:'network.html'},
{type:'Page',title:'Stories',body:'Rescue, recovery, adoption and caretaker stories',href:'stories.html'},
{type:'Page',title:'The Wire',body:'Verified animal welfare cases and the record of how they moved',href:'dispatch.html'},
{type:'Page',title:'Learning Center',body:'Animal care, first response, signs of pain and legal guidance',href:'learning-center.html'},
{type:'Page',title:'Adopt',body:'Dogs waiting for homes and a short adoption application',href:'adopt.html'},
{type:'Page',title:'The PFA Store',body:'Vegetarian pet food, toys, accessories, medicines, nutraceuticals and grooming',href:'store.html'},
{type:'Members',title:'The Circle',body:'The members area. Questions answered by people who have handled the same thing, plans that need hands, and events',href:'hub.html'},
{type:'Members',title:'Circles',body:'Topic and city circles inside the members area - street feeding, first response, law and complaints, fosters, birds, cats',href:'circles.html'},
{type:'Members',title:'Member events',body:'Meetings, sessions and volunteer mornings organised by members',href:'events.html'},
{type:'Members',title:'House rules of the Circle',body:'No follower counts, no quoting to mock, 401 characters, questions close, the feed ends',href:'you.html#rules'},
{type:'Page',title:'Become a Patron',body:'₹365 a year, one rupee a day, instant digital Patron Card',href:'membership.html'},
{type:'Page',title:'The Founder',body:'Maneka Sanjay Gandhi, PFA history and current leadership',href:'founder.html'},
{type:'Page',title:'Corporate Partnership',body:'CSR campaigns, ethical gifting and corporate partnerships',href:'csr.html'},
{type:'Page',title:'CineKind Awards',body:'The national award for films that choose kindness',href:'cinekind.html'},
{type:'Page',title:'Wildlife Gauntlet',body:'Fifteen trials, three lives and a Champion certificate',href:'champion.html'},
{type:'Page',title:'Watch. Listen. Do. Meet.',body:'Films, conversations, assignments and Patron meetings',href:'watch-listen-do-meet.html'},
{type:'Page',title:'Get Involved',body:'Volunteer roles, community caretaker applications and learning',href:'get-involved.html'},
{type:'Page',title:'Give',body:'Donate to PFA hospitals, rescue, legal work and learning',href:'give.html'}
];
(D.stories||[]).forEach(function(x){out.push({type:'Story',title:x.title,body:x.excerpt,href:'story.html?id='+encodeURIComponent(x.id)})});
(D.guides||[]).forEach(function(x){out.push({type:'Guide',title:x.title,body:x.excerpt,href:'guide.html?id='+encodeURIComponent(x.id)})});
(D.dogs||[]).forEach(function(x){out.push({type:'Adoption',title:x.name,body:x.blurb+' '+x.loc,href:'animal.html?id='+encodeURIComponent(x.id)})});
(D.products||[]).forEach(function(x){out.push({type:'Store',title:x.name,body:x.category+' '+x.desc,href:'product.html?id='+encodeURIComponent(x.id)})});
(D.units||[]).forEach(function(x,i){out.push({type:'PFA unit',title:x.c+', '+x.s,body:x.h+' '+(x.a||''),href:'hospital.html?id='+i})});
return out}
PFA.searchIndex=searchIndex();
function renderSearch(q){var host=PFA.q('#globalSearchResults');if(!host)return;var term=(q||'').trim().toLowerCase();var items=term?PFA.searchIndex.filter(function(x){return (x.title+' '+x.body+' '+x.type).toLowerCase().indexOf(term)>-1}).slice(0,16):PFA.searchIndex.slice(0,8);host.innerHTML=items.length?items.map(function(x){return '<a class="search-result" href="'+x.href+'"><small>'+PFA.escape(x.type)+'</small><div><strong>'+PFA.escape(x.title)+'</strong><p>'+PFA.escape(x.body)+'</p></div><b>→</b></a>'}).join(''):'<div class="search-empty">Nothing matches that yet. Try a shorter search.</div>'}
var g=PFA.q('#globalSearch');if(g){g.addEventListener('input',function(){renderSearch(g.value)});renderSearch('')}

PFA.qa('[data-accordion]').forEach(function(b){b.onclick=function(){var item=b.closest('.accordion-item');item.classList.toggle('open');var mark=b.querySelector('span:last-child');if(mark)mark.textContent=item.classList.contains('open')?'−':'+'}});
PFA.qa('[data-modal-open]').forEach(function(b){b.onclick=function(){var m=PFA.q('#'+b.dataset.modalOpen);if(m){m.classList.add('open');document.body.classList.add('locked')}}});
PFA.qa('[data-modal-close]').forEach(function(b){b.onclick=function(){var m=b.closest('.modal-scrim');if(m){m.classList.remove('open');document.body.classList.remove('locked')}}});
PFA.qa('.modal-scrim').forEach(function(m){m.addEventListener('click',function(e){if(e.target===m){m.classList.remove('open');document.body.classList.remove('locked')}})});
PFA.qa('[data-location]').forEach(function(b){b.onclick=function(){var s=PFA.q('#'+b.dataset.location);if(s)PFA.location(s)}});
PFA.qa('[data-share-page]').forEach(function(b){b.onclick=function(){PFA.share({title:document.title,text:b.dataset.sharePage||document.title,url:location.href})}});
PFA.qa('[data-copy-text]').forEach(function(b){b.onclick=function(){PFA.copy(b.dataset.copyText)}});

var revealSelector='.section-head,.list-row,.route-card,.feature,.wire-case-card,.timeline-item,.story-card,.guide-card,.dog-card,.product-card,.person-card,.award,.room,.stat,.fact,.form-shell,.order-summary,.learning-lab,.quote blockquote';
PFA.qa(revealSelector).forEach(function(e,i){
  e.classList.add('reveal');
  e.style.setProperty('--reveal-delay',Math.min((i%4)*70,210)+'ms');
});
var io=('IntersectionObserver'in window)?new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.1,rootMargin:'0px 0px -5% 0px'}):null;if(io)PFA.qa('.reveal').forEach(function(e){io.observe(e)});else PFA.qa('.reveal').forEach(function(e){e.classList.add('in')});
PFA.updateCartBadges();
})();

(function(){
  'use strict';
  document.addEventListener('contextmenu',function(event){event.preventDefault();},true);
  function currentPage(){return (location.pathname.split('/').pop()||'index.html').toLowerCase()}
  function closeOverlay(){
    var close=document.querySelector('[data-checkout-close]');
    var checkout=document.querySelector('.pfa-checkout.open');
    if(checkout&&close){close.click();return true}
    var modal=document.querySelector('.modal-scrim.open');
    if(modal){var button=modal.querySelector('[data-modal-close]');if(button)button.click();else modal.classList.remove('open');return true}
    var search=document.querySelector('#searchOverlay.open,[data-search-overlay].open');
    if(search){var button=search.querySelector('[data-search-close]');if(button)button.click();return true}
    var menu=document.querySelector('#mobileMenu.open');
    if(menu){var button=menu.querySelector('[data-menu-close]');if(button)button.click();else menu.classList.remove('open');return true}
    return false
  }
  function addBackButton(){
    if(!document.body||document.querySelector('.pfa-universal-back'))return;
    var button=document.createElement('button');
    button.type='button';
    button.className='pfa-universal-back';
    button.setAttribute('aria-label','Go back');
    button.innerHTML='<span aria-hidden="true">←</span><span>Back</span>';
    button.addEventListener('click',function(){
      if(closeOverlay())return;
      if(history.length>1){history.back();return}
      if(currentPage()!=='index.html')location.href='index.html';
    });
    document.body.appendChild(button);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addBackButton,{once:true});else addBackButton();
}());

(function(){
'use strict';
document.addEventListener('click',function(e){
  var t=e.target.closest('button,a');if(!t)return;
  var dynamic=t.closest('#storyDetail,#wireDetail,#animalDetail,#winnerDetail,#guideDetail,#memberDetail,#orderDetail');
  if(!dynamic)return;
  if(t.hasAttribute('data-share-page')){e.preventDefault();window.PFA.share({title:document.title,text:t.getAttribute('data-share-page')||document.title,url:location.href});return}
  if(t.hasAttribute('data-copy-text')){e.preventDefault();window.PFA.copy(t.getAttribute('data-copy-text'));return}
  if(t.hasAttribute('data-modal-open')){var m=document.getElementById(t.getAttribute('data-modal-open'));if(m){m.classList.add('open');document.body.classList.add('locked')}return}
  if(t.hasAttribute('data-modal-close')){var s=t.closest('.modal-scrim');if(s){s.classList.remove('open');document.body.classList.remove('locked')}return}
});
document.addEventListener('click',function(e){var s=e.target.classList&&e.target.classList.contains('modal-scrim')?e.target:null;if(s&&s.closest('#animalDetail,#winnerDetail')){s.classList.remove('open');document.body.classList.remove('locked')}});
})();

/* Associate every bare <label> with the field beside it. The markup pattern
   across the site is <label>Text</label><input>, which reads fine but links
   nothing for screen readers or for tapping the label. This pairs them up at
   load without touching a single page. */
document.addEventListener('DOMContentLoaded',function(){
  var n=0;
  PFA.qa('label:not([for])').forEach(function(lab){
    var f=lab.nextElementSibling;
    if(!f||!/^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName))return;
    if(!f.id)f.id='f-auto-'+(++n);
    lab.setAttribute('for',f.id);
  });
});

/* A headline that carries two sentences is two punchlines, and the second one
   should land on its own row rather than trailing off the end of the first.
   Static headings do this with a plain <br>; headings built in JavaScript go
   through here, because their text is escaped and cannot carry markup. */
PFA.punchline=function(text){
  return PFA.escape(String(text==null?'':text))
    .replace(/([.!?])\s+(?=[A-Z\u00C0-\u024F])/g,'$1<br>');
};

/* Which build am I looking at? Open the console on any page and it says so.
   A stale browser copy is otherwise indistinguishable from a bad deploy. */
(function(){
  var m=document.querySelector('meta[name="pfa-build"]');
  if(m&&window.console&&console.log)console.log('PFA site build '+m.content);
})();

/* ---- Header behaviour -----------------------------------------------------

   Two things, both driven from one scroll handler so the page is only measured
   once per frame:

     .is-scrolled      the line and the lift under the header, once there is
                       something scrolled beneath it
     --scroll-progress how far down the page you are, drawn along the bottom
                       edge of the header

   And the sliding indicator under the nav links, which follows the pointer and
   returns to the current page when it leaves.

   This runs on every page that has a header. Pages without one (admin, the card
   preview) fall out at the first line and do nothing. */
(function(){
  'use strict';

  var header=document.querySelector('.site-header');
  if(!header)return;

  var nav=header.querySelector('.desktop-nav');
  var indicator=null;
  var links=[];
  var frame=0;

  /* ---- scroll: elevation and progress ---- */

  function readScroll(){
    frame=0;
    var top=window.pageYOffset||document.documentElement.scrollTop||0;
    header.classList.toggle('is-scrolled',top>4);

    /* The travel is the page height less one viewport. On a page shorter than
       the window that is zero or less, and a progress bar would be a lie, so
       it is simply not shown. */
    var travel=(document.documentElement.scrollHeight||0)-window.innerHeight;
    if(travel<40){
      header.style.setProperty('--scroll-progress-shown','0');
      return;
    }
    var progress=top/travel;
    header.style.setProperty('--scroll-progress',(progress<0?0:progress>1?1:progress).toFixed(4));
    header.style.setProperty('--scroll-progress-shown','1');
  }

  function onScroll(){
    if(frame)return;
    frame=window.requestAnimationFrame?window.requestAnimationFrame(readScroll):setTimeout(readScroll,16);
  }

  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});
  readScroll();

  /* ---- the nav indicator ---- */

  /* The three call-to-action buttons carry their own fill and their own hover.
     The indicator is for the plain links only. */
  function plainLinks(){
    return Array.prototype.filter.call(nav.querySelectorAll('a'),function(a){
      return a.className.indexOf('nav-cta')<0;
    });
  }

  function currentLink(){
    for(var i=0;i<links.length;i++){
      if(links[i].className.indexOf('active')>-1)return links[i];
    }
    return null;
  }

  function moveTo(link){
    if(!indicator)return;
    if(!link){
      nav.style.setProperty('--nav-ind-shown','0');
      return;
    }
    var width=link.offsetWidth;
    if(!width){
      nav.style.setProperty('--nav-ind-shown','0');
      return;
    }
    /* offsetLeft is relative to the nav because the nav is the positioned
       ancestor. Width rides on scaleX from a 1px bar, so the move and the
       resize are one transform and stay off the main thread. */
    nav.style.setProperty('--nav-ind-x',link.offsetLeft+'px');
    nav.style.setProperty('--nav-ind-w',String(width));
    nav.style.setProperty('--nav-ind-colour',window.getComputedStyle(link).color);
    nav.style.setProperty('--nav-ind-shown','1');
  }

  function rest(){ moveTo(currentLink()); }

  if(nav){
    links=plainLinks();
    if(links.length){
      indicator=document.createElement('span');
      indicator.className='nav-indicator';
      indicator.setAttribute('aria-hidden','true');
      nav.appendChild(indicator);
      nav.classList.add('has-indicator');

      /* Every link in the nav gets a handler, not only the plain ones. The
         three destination chips carry their own fill, so the indicator has no
         business sitting under one - but moving onto a chip does not leave the
         nav, so without this the indicator simply stays where it was and looks
         stranded next to whatever is actually hovered. */
      Array.prototype.forEach.call(nav.querySelectorAll('a'),function(link){
        var plain=link.className.indexOf('nav-cta')<0;
        link.addEventListener('mouseenter',function(){plain?moveTo(link):rest()});
        link.addEventListener('focus',function(){plain?moveTo(link):rest()});
      });
      nav.addEventListener('mouseleave',rest);
      nav.addEventListener('focusout',function(event){
        if(!nav.contains(event.relatedTarget))rest();
      });
      window.addEventListener('resize',rest,{passive:true});

      /* Web fonts land after this runs and change every link's width, so the
         resting position is taken again once they have. */
      if(document.fonts&&document.fonts.ready&&document.fonts.ready.then){
        document.fonts.ready.then(rest);
      }
      rest();
    }
  }
})();
