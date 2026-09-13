(function(){
'use strict';
var P=window.PFA;
var amount=365;
var currency='inr';
var submitting=false;
var amountInput=P.q('#donationAmount');
var payButton=P.q('#givePay');
var form=P.q('#giveForm');
var clientRefField=P.q('#donationClientRef');
var currencyField=P.q('#donationCurrency');
var amountChipsHost=P.q('#donationAmountChips');
var PRESETS={
  inr:[{amount:365,label:'₹365'},{amount:1000,label:'₹1,000'},{amount:2500,label:'₹2,500'},{amount:5000,label:'₹5,000'}],
  usd:[{amount:5,label:'$5'},{amount:15,label:'$15'},{amount:30,label:'$30'},{amount:60,label:'$60'}]
};

function formatMoney(value){
  return currency==='usd' ? '$'+Number(value||0).toLocaleString('en-US') : '₹'+Number(value||0).toLocaleString('en-IN');
}

function createClientRef(){
  if(window.crypto&&window.crypto.randomUUID)return window.crypto.randomUUID();
  return 'pfa-donate-'+Date.now()+'-'+Math.random().toString(36).slice(2);
}

function renderAmountChips(){
  if(!amountChipsHost)return;
  amountChipsHost.innerHTML=PRESETS[currency].map(function(preset,i){
    return '<button class="chip'+(i===0?' active':'')+'" data-amount="'+preset.amount+'" type="button">'+preset.label+'</button>';
  }).join('');
  P.qa('[data-amount]',amountChipsHost).forEach(function(button){
    button.onclick=function(){
      P.qa('[data-amount]',amountChipsHost).forEach(function(item){item.classList.remove('active')});
      button.classList.add('active');
      amount=Number(button.dataset.amount);
      amountInput.value=amount;
      update();
    };
  });
  amount=PRESETS[currency][0].amount;
  amountInput.value=amount;
}
renderAmountChips();

P.qa('[data-currency]',P.q('#donationCurrencyChips')).forEach(function(button){
  button.addEventListener('click',function(){
    if(button.dataset.currency===currency)return;
    P.qa('[data-currency]',P.q('#donationCurrencyChips')).forEach(function(item){item.classList.remove('active')});
    button.classList.add('active');
    currency=button.dataset.currency;
    if(currencyField)currencyField.value=currency;
    renderAmountChips();
    update();
  });
});

amountInput.addEventListener('input',function(){
  amount=Number(amountInput.value||0);
  P.qa('[data-amount]').forEach(function(item){
    item.classList.toggle('active',Number(item.dataset.amount)===amount);
  });
  update();
});

function update(){
  P.q('#giveTotal').textContent=formatMoney(amount);
  payButton.textContent='Continue securely · '+formatMoney(amount);
}

form.addEventListener('submit',function(event){
  if(submitting){
    event.preventDefault();
    return;
  }

  amount=Number(amountInput.value||0);
  if(!P.validate(form)||!form.checkValidity()||!Number.isFinite(amount)||amount<1){
    event.preventDefault();
    form.reportValidity();
    P.toast('Enter valid donation details');
    return;
  }

  amountInput.value=amount.toFixed(2);
  if(clientRefField&&!clientRefField.value)clientRefField.value=createClientRef();
  submitting=true;
  form.setAttribute('aria-busy','true');
  payButton.disabled=true;
  payButton.setAttribute('aria-busy','true');
  payButton.textContent='Opening secure payment...';
});

window.addEventListener('pageshow',function(){
  submitting=false;
  form.removeAttribute('aria-busy');
  payButton.disabled=false;
  payButton.removeAttribute('aria-busy');
  update();
});

update();
})();

// ---- Route switching: Donate vs Give/Send tabs, plus the hero shortcut links ----
(function(){
'use strict';
var P=window.PFA;
var donateRoute=P.q('#donateRoute');
var feedRoute=P.q('#feedRoute');
var donatePanel=P.q('#donatePanel');
var feedPanel=P.q('#feedPanel');
var clarifier=P.q('#routeClarifier');
if(!donateRoute||!feedRoute||!donatePanel||!feedPanel)return;

function setRoute(mode){
  var isFeed=mode==='feed';
  donateRoute.setAttribute('aria-selected',String(!isFeed));
  feedRoute.setAttribute('aria-selected',String(isFeed));
  donatePanel.hidden=isFeed;
  feedPanel.hidden=!isFeed;
  if(clarifier){
    clarifier.innerHTML=isFeed
      ? '<span aria-hidden="true">●</span><div><strong>You selected a food order.</strong> Vegetarian feed goes to a verified local volunteer, not cash.</div>'
      : '<span aria-hidden="true">●</span><div><strong>You selected a direct donation.</strong> Money goes to PFA and is used for the cause you choose.</div>';
  }
}
donateRoute.addEventListener('click',function(){setRoute('donate')});
feedRoute.addEventListener('click',function(){setRoute('feed')});
P.qa('[data-route-link]').forEach(function(link){
  link.addEventListener('click',function(){setRoute(link.dataset.routeLink==='feed'?'feed':'donate')});
});
})();

// ---- Give/Send: multi-step food order (place, food, details) ----
(function(){
'use strict';
var P=window.PFA;
var form=P.q('#feedOrderForm');
if(!form)return;

var currency='inr';
var currencyField=P.q('#feedCurrency',form);

function formatMoney(value){
  return currency==='usd' ? '$'+Number(value||0).toLocaleString('en-US') : '₹'+Number(value||0).toLocaleString('en-IN');
}

var CATALOG=P.qa('[data-feed-item]',form).map(function(el){
  return {
    el:el,
    key:el.dataset.name,
    name:el.dataset.name,
    weight:Number(el.dataset.weight),
    priceInr:Number(el.dataset.price),
    priceUsd:Number(el.dataset.priceUsd),
    priceEl:el.querySelector('.feed-item-price'),
    output:el.querySelector('[data-qty-output]')
  };
});
function itemPrice(item){return currency==='usd'?item.priceUsd:item.priceInr}
function renderItemPrices(){
  CATALOG.forEach(function(item){
    if(item.priceEl)item.priceEl.textContent=formatMoney(itemPrice(item));
  });
}
var itemsField=P.q('#feedItemsField',form);
var itemsError=P.q('#feedItemsError',form);
var stepEls={1:P.q('[data-feed-step="1"]',form),2:P.q('[data-feed-step="2"]',form),3:P.q('[data-feed-step="3"]',form)};
var progressEls=P.qa('[data-progress-step]',form);
var submitButton=P.q('#feedSubmitButton',form);
var submitting=false;

function quantity(item){return Number(item.output.textContent)||0}
function activeItems(){return CATALOG.filter(function(item){return quantity(item)>0})}

function setQuantity(item,next){
  item.output.textContent=String(Math.max(0,Math.min(10,next)));
  updateSummary();
}

function updateSummary(){
  var items=activeItems();
  var total=items.reduce(function(sum,item){return sum+itemPrice(item)*quantity(item)},0);
  var weight=items.reduce(function(sum,item){return sum+item.weight*quantity(item)},0);

  var totalEl=P.q('#feedTotal');
  if(totalEl)totalEl.textContent=formatMoney(total);
  var weightEl=P.q('#feedWeightSummary');
  if(weightEl)weightEl.textContent=weight+' kg';

  var district=(P.q('#feedDistrict')||{}).value||'';
  var state=(P.q('#feedState')||{}).value||'';
  var locality=(P.q('#feedLocality')||{}).value||'';
  var destinationEl=P.q('#feedDestinationSummary');
  if(destinationEl)destinationEl.textContent=[locality,district,state].filter(Boolean).join(', ')||'Not selected';

  var list=P.q('#feedSummaryItems');
  var empty=P.q('#feedEmptySummary');
  if(list&&empty){
    list.hidden=!items.length;
    empty.hidden=Boolean(items.length);
    if(items.length){
      list.innerHTML=items.map(function(item){return '<li>'+P.escape(item.name)+' × '+quantity(item)+'</li>'}).join('');
    }
  }

  if(itemsField){
    itemsField.value=JSON.stringify(items.map(function(item){return {key:item.key,quantity:quantity(item)}}));
  }
}

CATALOG.forEach(function(item){
  P.qa('[data-qty-change]',item.el).forEach(function(button){
    button.addEventListener('click',function(){setQuantity(item,quantity(item)+Number(button.dataset.qtyChange))});
  });
});

var feedCurrencyHost=P.q('#feedCurrencyChips',form);
if(feedCurrencyHost){
  P.qa('[data-currency]',feedCurrencyHost).forEach(function(button){
    button.addEventListener('click',function(){
      if(button.dataset.currency===currency)return;
      P.qa('[data-currency]',feedCurrencyHost).forEach(function(item){item.classList.remove('active')});
      button.classList.add('active');
      currency=button.dataset.currency;
      if(currencyField)currencyField.value=currency;
      renderItemPrices();
      updateSummary();
    });
  });
}
renderItemPrices();

var addBundle=P.q('#addFeedBundle');
if(addBundle)addBundle.addEventListener('click',function(){CATALOG.forEach(function(item){setQuantity(item,1)})});
var clearItems=P.q('#clearFeedItems');
if(clearItems)clearItems.addEventListener('click',function(){CATALOG.forEach(function(item){setQuantity(item,0)})});

['feedDistrict','feedState','feedLocality'].forEach(function(id){
  var field=P.q('#'+id);
  if(field)field.addEventListener('input',updateSummary);
});

function showStep(n){
  [1,2,3].forEach(function(step){if(stepEls[step])stepEls[step].hidden=step!==n});
  progressEls.forEach(function(el){
    var step=Number(el.dataset.progressStep);
    el.classList.toggle('is-active',step===n);
    el.classList.toggle('is-done',step<n);
  });
  var focusTarget=stepEls[n]&&stepEls[n].querySelector('input, select, button');
  if(focusTarget)focusTarget.focus();
}

P.qa('[data-feed-next]',form).forEach(function(button){
  button.addEventListener('click',function(){
    var current=button.closest('.feed-step');
    if(current===stepEls[1]&&!P.validate(stepEls[1]))return;
    if(current===stepEls[2]){
      if(!activeItems().length){if(itemsError)itemsError.hidden=false;return}
      if(itemsError)itemsError.hidden=true;
    }
    showStep(Number(button.dataset.feedNext));
  });
});
P.qa('[data-feed-back]',form).forEach(function(button){
  button.addEventListener('click',function(){showStep(Number(button.dataset.feedBack))});
});

form.addEventListener('submit',function(event){
  if(submitting){event.preventDefault();return}
  if(!activeItems().length){
    event.preventDefault();
    showStep(2);
    if(itemsError)itemsError.hidden=false;
    return;
  }
  if(!P.validate(stepEls[3])){event.preventDefault();return}
  updateSummary();
  submitting=true;
  form.setAttribute('aria-busy','true');
  if(submitButton){submitButton.disabled=true;submitButton.textContent='Opening secure payment...'}
});
window.addEventListener('pageshow',function(){
  submitting=false;
  form.removeAttribute('aria-busy');
  if(submitButton){submitButton.disabled=false;submitButton.textContent='Pay and send food'}
});

updateSummary();
})();
