(function(){
'use strict';
var P=window.PFA;
var host=P.q('#memberDetail');
var requestedId=P.param('id');
var localMember=P.store('pfa_patron');

function showNotFound(message){
  host.innerHTML='<div class="empty-state"><strong>'+P.escape(message)+'</strong><a class="btn dark" href="membership.html">Become a Patron</a></div>';
}

function monthYearFromIso(iso){
  if(!iso)return '';
  var date=new Date(iso);
  if(isNaN(date.getTime()))return '';
  return date.toLocaleDateString('en-IN',{month:'short',year:'numeric'}).toUpperCase();
}

function renderMember(member,remote,standing){
  var physical=member.physical===true;
  var fulfilment=physical
    ? 'Your digital card is ready. Your physical card request has been recorded for delivery.'
    : 'Your digital Patron card is ready. Nothing will be shipped.';
  var cardSummary=physical
    ? 'Physical card added. Delivery request recorded.'
    : 'Digital card only. Nothing will be shipped.';
  var R=window.PFA_RULES;
  var address=member.address?(R?R.titleCase(member.address):member.address):(physical?'Delivery address recorded':'Digital Patron Card · No delivery required');
  if(remote)address='Address available on the device used to join';

  function cardMarkup(){
    return '<button class="pfa-card-button" type="button" data-member-flip aria-label="Issued PFA Patron card. Select to flip the card" aria-pressed="false">'+
      '<span class="pfa-card-scene"><span class="pfa-card" data-member-card>'+
        '<span class="pfa-card-face pfa-card-front">'+
          '<span class="pfa-card-corner top-left"></span><span class="pfa-card-corner top-right"></span><span class="pfa-card-corner bottom-left"></span><span class="pfa-card-corner bottom-right"></span>'+
          '<span class="pfa-card-watermark"><img src="media/pfa-emblem.png" alt=""></span><span class="pfa-card-shine"></span>'+
          '<span class="pfa-card-top"><img class="pfa-card-emblem" src="media/pfa-emblem.png" alt="People for Animals emblem"><span class="pfa-card-wordmark">People for<br>Animals</span></span>'+
          '<span class="pfa-card-photo'+(member.photo?' has-photo':'')+'" data-member-photo><span>Photo</span></span>'+
          '<span class="pfa-card-number" data-patron-number>'+P.escape(member.id)+'</span>'+
          '<span class="pfa-card-dates"><span><small>Member since</small><strong data-patron-since>'+P.escape(member.since)+'</strong></span><span><small>Valid till</small><strong data-patron-valid>'+P.escape(member.valid)+'</strong></span></span>'+
          '<span class="pfa-card-bottom"><strong class="pfa-card-name" data-patron-name>'+P.escape(R?R.nameCase(member.name||''):String(member.name||''))+'</strong><span class="pfa-card-standing">'+(standing==='expired'?'Expired':'Patron')+'</span></span>'+
        '</span>'+
        '<span class="pfa-card-face pfa-card-back">'+
          '<span class="pfa-card-corner top-left"></span><span class="pfa-card-corner top-right"></span><span class="pfa-card-corner bottom-left"></span><span class="pfa-card-corner bottom-right"></span>'+
          '<span class="pfa-card-watermark"><img src="media/pfa-emblem.png" alt=""></span>'+
          '<span class="pfa-card-back-main"><span class="pfa-card-address"><small>Card holder address</small><strong data-patron-address>'+P.escape(address)+'</strong></span></span>'+
          '<span class="pfa-card-back-foot"><span>This card certifies Patron membership with People for Animals</span><strong>peopleforanimalsindia.org</strong></span>'+
        '</span>'+
      '</span></span>'+
    '</button>';
  }

  var feeRow=member.total
    ? '<div class="patron-summary-item"><span>Annual fee</span><strong>'+P.money(member.total)+'</strong></div>'
    : '';
  var standingLabel=standing==='expired'?'Expired':'Patron';

  host.innerHTML='<section class="order-success"><div class="success-icon">✓</div><p class="kicker">Issued</p><h1>The card is yours.</h1><p class="lead" style="margin-left:auto;margin-right:auto">'+P.escape(fulfilment)+'</p><div class="member-id" style="margin-top:18px;color:var(--blue);font-weight:900;letter-spacing:.14em">'+P.escape(member.id)+'</div></section><section class="section compact"><div class="patron-layout"><div><div class="card-toggle"><button class="active" data-member-side="front">Front</button><button data-member-side="back">Back</button></div><div id="memberCard" class="pfa-card-preview">'+cardMarkup()+'</div><p class="pfa-card-hint">Tap the card to flip</p></div><div><div class="form-shell"><div class="form-head"><h3>Your Patron standing</h3><p>One card, one person. Issued in your name and renewed each year.</p></div><div class="form-body"><div class="patron-summary" style="margin-top:0"><div class="patron-summary-item"><span>Standing</span><strong>'+P.escape(standingLabel)+'</strong></div>'+feeRow+'<div class="patron-summary-item patron-summary-wide"><span>Card</span><strong>'+P.escape(cardSummary)+'</strong></div><div class="patron-summary-total"><span>Patron number</span><strong>'+P.escape(member.id)+'</strong></div></div><div class="form-actions"><button class="btn dark" id="downloadMember" type="button">Download card PDF</button><button class="btn light" id="downloadMemberPng" type="button">Download PNG</button><button class="btn light" type="button" data-copy-text="'+P.escape(member.id)+'">Copy number</button></div></div></div></div></div></section>';

  var card=P.q('[data-member-card]');
  var flipButton=P.q('[data-member-flip]');
  function setSide(side){
    var back=side==='back';
    card.classList.toggle('flipped',back);
    flipButton.setAttribute('aria-pressed',back?'true':'false');
    P.qa('[data-member-side]').forEach(function(button){button.classList.toggle('active',button.dataset.memberSide===side)});
  }

  P.qa('[data-member-side]').forEach(function(button){button.onclick=function(){setSide(button.dataset.memberSide)}});
  flipButton.onclick=function(){setSide(card.classList.contains('flipped')?'front':'back')};

  if(member.photo){
    var photo=P.q('[data-member-photo]');
    photo.style.backgroundImage='url("'+member.photo+'")';
  }

  /* Print-ready PDF of both faces, at true card size. */
  var downloadButton=P.q('#downloadMember');
  var cardData={
    id:member.id,
    name:R?R.nameCase(member.name||''):String(member.name||''),
    since:member.since,valid:member.valid,
    standing:standing==='expired'?'Expired':'Patron',
    address:address,photo:member.photo||''
  };
  function withBusy(button,work){
    var idle=button.textContent;button.disabled=true;button.textContent='Preparing...';
    return work().catch(function(){P.toast('The file could not be created')}).then(function(){button.disabled=false;button.textContent=idle});
  }
  downloadButton.onclick=function(){
    var Patron=window.PFAPatronCard;
    if(!Patron){P.toast('The card file is still loading. Try again in a moment.');return}
    withBusy(downloadButton,function(){return Patron.downloadPdf(P.q('[data-member-card]')||cardData)});
  };
  var pngButton=P.q('#downloadMemberPng');
  if(pngButton)pngButton.onclick=function(){
    var Patron=window.PFAPatronCard;
    if(!Patron)return;
    withBusy(pngButton,function(){return Patron.downloadPng(P.q('[data-member-card]')||cardData)});
  };

  setSide('front');
}

if(localMember&&(!requestedId||requestedId===localMember.id)){
  renderMember(localMember,false,'active');
}else if(requestedId){
  host.innerHTML='<div class="empty-state"><strong>Checking that Patron number...</strong></div>';
  fetch('/api/member-status?id='+encodeURIComponent(requestedId),{headers:{Accept:'application/json'}})
    .then(function(r){ if(!r.ok)throw new Error('lookup failed'); return r.json(); })
    .then(function(data){
      if(!data||!data.memberId)throw new Error('bad data');
      renderMember({
        id:data.memberId,
        name:data.name,
        since:monthYearFromIso(data.memberSince),
        valid:monthYearFromIso(data.validUntil),
        physical:data.physicalCard,
        total:null,
        photo:'',
        address:''
      },true,data.standing);
    })
    .catch(function(){
      showNotFound('That Patron number could not be found.');
    });
}else{
  showNotFound('No Patron Card was found on this device.');
}
})();
