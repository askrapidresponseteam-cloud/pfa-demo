/* Lost printed card. Verifies the claim, then orders a replacement PARCEL.
   It cannot issue a card and cannot change a card number: the digital card and
   its number stay exactly as they are. */
(function () {
  'use strict';

  var P = window.PFA;
  var J = window.PFAJourney;
  var form = P.q('#lcForm');
  if (!form || !J) return;

  var state = { card: null };
  var steps = J.steps('#join');
  J.disclose({ button: '#lcBegin', journey: '#join', title: '#lcFormTitle' });

  var elsewhere = J.shipElsewhere({ toggle: '#lcElsewhere', fields: '#lcElsewhereFields' });
  var claimRef = J.clientRef('LC');

  function label(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!J.check([['lcCardId', 'cardId'], ['lcMobile', 'mobile']])) return;

    var button = P.q('#lcFind');
    J.busy(button, true, 'Checking...');
    J.status('#lcStatus', '');

    fetch('/api/caregiver/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        stage: 'verify',
        cardId: J.value('lcCardId').toUpperCase(),
        mobile: J.value('lcMobile')
      })
    }).then(function (response) {
      /* A static host answers /api with an HTML 404. That is "no server
         here", not "bad details". */
      if (!/json/i.test(response.headers.get('content-type') || '')) {
        return { ok: false, noServer: true, data: {} };
      }
      return response.json().then(function (data) { return { ok: response.ok, data: data }; });
    }).then(function (result) {
      J.busy(button, false);
      if (result.noServer) {
        return J.status('#lcStatus', 'This address is serving the site files only; the PFA server that issues cards is not running here. Use the live website.', true);
      }
      if (!result.ok || !result.data.cardId) {
        return J.status('#lcStatus', (result.data && result.data.message) || 'That card could not be found.', true);
      }
      state.card = result.data;
      P.q('#lcName').textContent = result.data.name;
      P.q('#lcIssued').textContent = label(result.data.issuedAt);
      P.q('#lcValid').textContent = label(result.data.validUntil);
      P.q('#lcNumber').textContent = result.data.cardId;
      P.q('#lcShipTo').textContent = result.data.address;
      P.q('#lcOpenCard').setAttribute('href', 'caregiver-card.html?id=' + encodeURIComponent(result.data.cardId));
      steps.go('order');
    }).catch(function () {
      J.busy(button, false);
      J.explainFailure('#lcStatus');
    });
  });

  var pay = P.q('#lcPay');
  if (pay) {
    pay.addEventListener('click', function () {
      if (!state.card) return;
      var useOther = elsewhere.open();

      if (useOther && !J.check([['lcRecipient', 'name'], ['lcDeliveryAddress', 'address'], ['lcDeliveryPin', 'pin']])) {
        return J.status('#lcOrderStatus', 'Check the delivery details.', true);
      }

      J.busy(pay, true, 'Opening secure payment...');
      J.post('/api/caregiver/replace', {
        stage: 'order',
        cardId: state.card.cardId,
        mobile: J.value('lcMobile'),
        reason: 'lost',
        clientRef: claimRef,
        deliverElsewhere: useOther ? 'yes' : 'no',
        recipient: useOther ? J.value('lcRecipient') : null,
        deliveryAddress: useOther ? (J.value('lcDeliveryAddress') + ', ' + J.value('lcDeliveryPin')) : null
      });
    });
  }

  window.addEventListener('pageshow', function () {
    J.busy(P.q('#lcFind'), false);
    J.busy(pay, false);
  });
})();
