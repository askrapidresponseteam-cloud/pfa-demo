/* /help - what script adds on top of a page that already works without it.

   The HTML carries every unit, grouped by state, each with a tel: link. This
   file reads that list back out of the DOM (no second copy of the data, no
   data.js) and does three things a static page cannot:

   1. Sorts by distance. "Find the nearest to me" asks for location once and
      lifts the closest contacts into a panel at the top, each with a distance.
      If permission was granted before, it runs without being asked.
   2. Filters. A box that narrows the list to a city or state as you type,
      opening the states that match.
   3. Sends the report without a page reload, with photos shrunk on the phone
      first, and shows the reference number in place. The form's own
      action="/api/pfa-submissions" is what happens instead when this never
      runs.

   Loaded with defer after site.js, which provides window.PFA. */
(function(){
  'use strict';
  var P=window.PFA;
  if(!P)return;

  var units=P.qa('.help-unit[data-lat]');
  var states=P.qa('.help-state');
  var locate=P.q('[data-help-locate]');
  var status=P.q('[data-help-status]');
  var nearest=P.q('[data-help-nearest]');
  var nearestList=P.q('[data-help-nearest-list]');
  var filterWrap=P.q('[data-help-filter-wrap]');
  var filter=P.q('[data-help-filter]');
  var empty=P.q('[data-help-empty]');

  function say(text,isError){if(!status)return;status.textContent=text||'';status.classList.toggle('is-error',Boolean(isError))}

  /* ---- nearest --------------------------------------------------------- */
  function km(a,b,c,d){var R=6371,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p;var q=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(q))}

  function showNearest(lat,lng){
    var ranked=units.map(function(li){
      return {li:li,d:km(lat,lng,Number(li.dataset.lat),Number(li.dataset.lng))};
    }).sort(function(a,b){return a.d-b.d}).slice(0,4);
    if(!ranked.length||!nearest||!nearestList)return;
    nearestList.innerHTML='';
    ranked.forEach(function(r){
      var copy=r.li.cloneNode(true);
      copy.removeAttribute('hidden');
      var tag=document.createElement('span');
      tag.className='help-unit-dist';
      tag.textContent=(r.d<1?'Under 1 km':Math.round(r.d)+' km')+' away';
      var h3=copy.querySelector('h3');
      if(h3&&h3.parentNode)h3.parentNode.insertBefore(tag,h3.nextSibling);else copy.appendChild(tag);
      nearestList.appendChild(copy);
    });
    nearest.hidden=false;
    /* Open the state the closest unit is in, so the full list agrees with the panel. */
    var det=ranked[0].li.closest('.help-state');
    if(det)det.open=true;
    say('Showing the '+ranked.length+' nearest, by straight-line distance. The closest is about '+(ranked[0].d<1?'1 km':Math.round(ranked[0].d)+' km')+' away.');
    nearest.scrollIntoView({block:'start',behavior:'smooth'});
  }

  function findMe(){
    if(!navigator.geolocation){say('This browser cannot share your location. Pick your state below.',true);return}
    if(locate){locate.disabled=true;locate.textContent='Finding you\u2026'}
    say('Asking for your location\u2026');
    navigator.geolocation.getCurrentPosition(function(pos){
      if(locate){locate.disabled=false;locate.textContent='Find the nearest to me'}
      showNearest(pos.coords.latitude,pos.coords.longitude);
    },function(err){
      if(locate){locate.disabled=false;locate.textContent='Find the nearest to me'}
      var why=err&&err.code===1?'Location was not allowed. Pick your state below instead.':'Your location could not be found. Pick your state below instead.';
      say(why,true);
      var u=P.q('#units');if(u)u.scrollIntoView({block:'start',behavior:'smooth'});
    },{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
  }

  if(locate&&units.length){
    locate.hidden=false;
    locate.addEventListener('click',findMe);
    /* Already allowed once: do not make them tap again. */
    if(navigator.permissions&&navigator.permissions.query){
      try{navigator.permissions.query({name:'geolocation'}).then(function(st){if(st.state==='granted')findMe()},function(){})}catch(_){}
    }
  }

  /* ---- filter ------------------------------------------------------------ */
  if(filter&&filterWrap&&units.length){
    filterWrap.hidden=false;
    var apply=function(){
      var q=filter.value.trim().toLowerCase();
      var shown=0;
      states.forEach(function(det){
        var any=false;
        P.qa('.help-unit',det).forEach(function(li){
          var hit=!q||(li.dataset.search||'').indexOf(q)>-1;
          li.hidden=!hit;if(hit){any=true;shown+=1}
        });
        det.hidden=!any;
        if(q&&any)det.open=true;
      });
      if(empty)empty.hidden=shown>0;
    };
    filter.addEventListener('input',apply);
    /* A state chosen in the hash (help.html#state=Karnataka) is opened on arrival. */
    var m=/[#&]state=([^&]+)/.exec(location.hash);
    if(m){try{filter.value=decodeURIComponent(m[1]);apply()}catch(_){}}
  }

  /* ---- report ------------------------------------------------------------ */
  P.qa('form[data-help-form]').forEach(function(f){
    var photoHost=P.q('[data-photos]',f),photos=photoHost&&P.photoControl?P.photoControl(photoHost,3):null;
    f.addEventListener('submit',function(e){
      e.preventDefault();
      if(!P.validate(f))return;
      var data=P.formData(f);
      delete data.kind;delete data.page; /* the server takes these from the envelope, not the fields */
      var ref=P.saveSubmission(f.dataset.helpForm,data,{photos:photos?photos.photos():[]});
      var out=P.q('.form-success',f.parentElement);
      if(out){out.classList.add('show');P.renderRef(out,ref,'Received. A named person at PFA can now see this and follow it up.');out.scrollIntoView({block:'start',behavior:'smooth'})}
      f.reset();
      if(photos)ref.then(function(){photos.clear()},function(){});
    });
  });
})();
