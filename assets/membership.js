(function(){
'use strict';
var P=window.PFA;
var state={side:'front',photo:'',submitting:false};
var form=P.q('#patronForm');
var payButton=P.q('#patronPay');
var physicalInput=P.q('#patronPhysicalCard');
var clientRefField=P.q('#patronClientRef');

/* Values as they will be stored and printed: Title Case for the name and
   every word of the address, bare digits for the mobile and PIN. */
function value(id){
  var field=P.q('#'+id);
  if(!field)return '';
  var R=window.PFA_RULES;
  if(R&&R.ruleName(id,field.type))return R.normaliseField(id,field.value,field.type);
  return String(field.value||'').trim();
}

function cardName(){
  var name=value('patronName');
  return name||'Your Name';
}

function physicalSelected(){
  return physicalInput&&physicalInput.value==='yes';
}

function cardAddress(){
  if(!physicalSelected())return 'Digital Patron Card \u00B7 No Delivery Required';
  var parts=[
    value('patronAddress').replace(/\n+/g,', '),
    value('patronDistrict'),
    value('patronState'),
    value('patronPin'),
    value('patronCountry')
  ].filter(Boolean);
  return parts.length?parts.join(', '):'Delivery address will appear here';
}

function monthYear(date){
  return date.toLocaleDateString('en-IN',{month:'short',year:'numeric'});
}

function membershipDates(){
  var since=new Date();
  var valid=new Date(since.getTime());
  valid.setFullYear(valid.getFullYear()+1);
  return {since:monthYear(since),valid:monthYear(valid)};
}

function currentCurrency(){
  var field=P.q('#patronCurrency');
  return field&&field.value==='usd'?'usd':'inr';
}

function formatMoney(value){
  return currentCurrency()==='usd' ? '$'+Number(value||0).toLocaleString('en-US') : '₹'+Number(value||0).toLocaleString('en-IN');
}

function total(){
  if(currentCurrency()==='usd')return 10;
  return 365+(physicalSelected()?149:0);
}

function updateCards(){
  var dates=membershipDates();
  P.qa('[data-patron-name]').forEach(function(element){element.textContent=cardName()});
  P.qa('[data-patron-address]').forEach(function(element){element.textContent=cardAddress()});
  P.qa('[data-patron-since]').forEach(function(element){element.textContent=dates.since});
  P.qa('[data-patron-valid]').forEach(function(element){element.textContent=dates.valid});
}

function setSide(side){
  state.side=side;
  P.qa('[data-patron-card]').forEach(function(card){card.classList.toggle('flipped',side==='back')});
  P.qa('[data-card-side]').forEach(function(button){button.classList.toggle('active',button.dataset.cardSide===side)});
  P.qa('[data-card-flip]').forEach(function(button){button.setAttribute('aria-pressed',side==='back'?'true':'false')});
}

function refreshPayButton(){
  if(payButton&&!state.submitting)payButton.textContent='Continue to pay '+formatMoney(total());
}

function setPhysical(on){
  if(physicalInput)physicalInput.value=on?'yes':'no';
  var switchButton=P.q('#patronSwitch');
  if(switchButton){
    switchButton.setAttribute('aria-checked',on?'true':'false');
    switchButton.classList.toggle('on',on);
  }
  updateCards();
  refreshPayButton();
}

/* The physical-card switch is owned by the page's inline controller.
   Wiring it here too caused a double-toggle, so this file leaves it alone. */

var currencyChipsHost=P.q('#patronCurrencyChips');
var physicalRow=P.q('#physicalRow');
if(currencyChipsHost){
  P.qa('[data-currency]',currencyChipsHost).forEach(function(button){
    button.addEventListener('click',function(){
      if(button.dataset.currency===currentCurrency())return;
      P.qa('[data-currency]',currencyChipsHost).forEach(function(item){item.classList.remove('active')});
      button.classList.add('active');
      var field=P.q('#patronCurrency');
      if(field)field.value=button.dataset.currency;
      var isUsd=button.dataset.currency==='usd';
      if(physicalRow)physicalRow.hidden=isUsd;
      if(isUsd)setPhysical(false);
      updateCards();
      refreshPayButton();
    });
  });
}

P.qa('[data-card-side]').forEach(function(button){
  button.onclick=function(){setSide(button.dataset.cardSide)};
});

P.qa('[data-card-flip]').forEach(function(button){
  button.onclick=function(){
    var card=button.querySelector('[data-patron-card]');
    var back=!card.classList.contains('flipped');
    card.classList.toggle('flipped',back);
    button.setAttribute('aria-pressed',back?'true':'false');
  };
});

['patronName','patronAddress','patronPin','patronDistrict','patronState','patronCountry'].forEach(function(id){
  var field=P.q('#'+id);
  if(field)field.addEventListener('input',updateCards);
});

var photoInput=P.q('#patronPhoto');
if(photoInput){
  photoInput.addEventListener('change',function(){
    var file=this.files&&this.files[0];
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){
      P.toast('Choose a JPG, PNG or WebP image');
      this.value='';
      return;
    }
    if(file.size>5242880){
      P.toast('Choose an image smaller than 5 MB');
      this.value='';
      return;
    }
    var reader=new FileReader();
    reader.onload=function(){
      state.photo=String(reader.result||'');
      var label=P.q('#patronPhotoLabel');
      if(label)label.textContent=file.name;
      updateCards();
    };
    reader.readAsDataURL(file);
  });
}

function createClientRef(){
  var random='';
  if(window.crypto&&window.crypto.getRandomValues){
    var bytes=new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    random=Array.prototype.map.call(bytes,function(byte){return byte.toString(16).padStart(2,'0')}).join('').toUpperCase();
  }else{
    random=Math.random().toString(36).slice(2,18).toUpperCase().replace(/[^A-Z0-9]/g,'');
  }
  return 'PFAREF'+Date.now().toString(36).toUpperCase()+random;
}

function pendingAddress(){
  return cardAddress();
}

if(form){
  form.addEventListener('submit',function(event){
    if(state.submitting){
      event.preventDefault();
      return;
    }

    updateCards();
    if(!P.validate(form)||!form.checkValidity()){
      event.preventDefault();
      form.reportValidity();
      P.toast('Complete the required membership details');
      return;
    }

    var clientRef=createClientRef();
    if(clientRefField)clientRefField.value=clientRef;
    var dates=membershipDates();
    var pending={
      clientRef:clientRef,
      name:value('patronName'),
      mobile:value('patronMobile'),
      email:value('patronEmail'),
      address:pendingAddress(),
      since:dates.since,
      valid:dates.valid,
      photo:state.photo,
      physical:physicalSelected(),
      total:total()
    };

    try{
      sessionStorage.setItem('pfa_patron_pending',JSON.stringify(pending));
    }catch(error){
      // The payment can continue without the optional local photo preview.
    }

    state.submitting=true;
    form.setAttribute('aria-busy','true');
    payButton.disabled=true;
    payButton.setAttribute('aria-busy','true');
    payButton.textContent='Opening secure payment...';
  });
}

window.addEventListener('pageshow',function(){
  state.submitting=false;
  if(form)form.removeAttribute('aria-busy');
  if(payButton){
    payButton.disabled=false;
    payButton.removeAttribute('aria-busy');
    payButton.textContent='Continue to pay '+formatMoney(total());
  }
  updateCards();
});

var observerTarget=P.q('#patronPhysicalCard');
if(observerTarget&&window.MutationObserver){
  new MutationObserver(updateCards).observe(observerTarget,{attributes:true,attributeFilter:['value']});
}

setSide('front');
updateCards();
})();
