/* Colony Animal Colony Caregiver Card - the application journey.
   Built on assets/journey-core.js, the same module the Patron journey uses. */
(function () {
  'use strict';

  var P = window.PFA;
  var J = window.PFAJourney;
  var Card = window.PFACaregiverCard;
  var form = P.q('#ctForm');
  if (!form || !Card || !J) return;

  var state = { photo: '', side: 'front', card: null, quality: null };

  /* ---------- the card artwork ---------- */

  function addressBlock() {
    if (state.card) return state.card.address;
    var parts = [J.value('ctAddress'), [J.value('ctDistrict'), J.value('ctPin')].filter(Boolean).join(' '), J.value('ctState')];
    var joined = parts.filter(Boolean).join(', ');
    return joined || 'Your address, with PIN code';
  }

  function cardData() {
    return {
      name: state.card ? state.card.name : (J.value('ctName') || 'Your name'),
      address: addressBlock(),
      cardId: state.card ? state.card.cardId : 'PFA-CCT-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
      sample: !!(state.card && state.card.sample),
      issuedOn: Card.issuedOnLabel(state.card ? new Date(state.card.issuedAt) : new Date()),
      year: new Date(state.card ? state.card.issuedAt : Date.now()).getFullYear(),
      mobile: state.card ? state.card.mobile : J.value('ctMobile'),
      email: state.card ? state.card.email : J.value('ctEmail'),
      qr: state.card ? state.card.cardUrl : '',
      photo: state.photo
    };
  }

  var frame = null;
  function paint() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(function () {
      frame = null;
      var density = Math.min(window.devicePixelRatio || 1, 3);
      Promise.all([Card.loadAssets(), Card.hydrate(cardData())]).then(function (out) {
        P.qa('.card-canvas canvas').forEach(function (canvas) {
          if (!canvas.offsetParent) return;
          var host = canvas.closest('.card-canvas');
          var width = Math.max(180, Math.min(host ? host.clientWidth : 300, 340));
          var face = canvas.closest('[data-face]');
          Card.draw(canvas, face && face.dataset.face === 'back' ? 'back' : 'front', out[1], out[0], width, density);
        });
      });
    });
  }

  P.qa('[data-side]').forEach(function (button) {
    button.addEventListener('click', function () {
      var scope = button.closest('[data-scene]') || button.closest('.patron-layout') || document;
      state.side = button.dataset.side;
      P.qa('[data-side]', scope).forEach(function (item) {
        item.classList.toggle('active', item.dataset.side === state.side);
      });
      P.qa('[data-face]', scope).forEach(function (face) {
        face.hidden = face.dataset.face !== state.side;
      });
      paint();
    });
  });

  window.addEventListener('resize', paint);

  /* ---------- opening and steps ---------- */

  var steps = J.steps('#join');
  J.disclose({ button: '#ctBegin', journey: '#join', title: '#ctFormTitle', onOpen: paint });

  /* ---------- photograph ---------- */

  var editor = J.photo({
    mount: '#ctPhotoEditor',
    input: '#ctPhoto',
    label: '#ctPhotoLabel',
    /* Frame at exactly the ratio the card prints, taken from the card
       renderer so the two can never drift apart again. */
    aspect: Card.PHOTO_ASPECT,
    outputWidth: 1400,
    onChange: function (verdict) { state.quality = verdict; },
    onLoaded: function () {
      state.photo = editor.toDataUrl();
      paint();
    }
  });

  if (editor) {
    var mount = P.q('#ctPhotoEditor');
    ['pointerup', 'input'].forEach(function (name) {
      mount.addEventListener(name, function () {
        if (!editor.hasImage()) return;
        state.photo = editor.toDataUrl();
        paint();
      });
    });
  }

  ['ctName', 'ctAddress', 'ctPin', 'ctDistrict', 'ctState'].forEach(function (id) {
    var field = P.q('#' + id);
    if (field) field.addEventListener('input', paint);
  });

  /* ---------- apply ---------- */

  var submitRef = J.clientRef('CT');

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var ok = J.check([
      ['ctName', 'name'], ['ctMobile', 'mobile'], ['ctEmail', 'email'],
      ['ctAddress', 'address'], ['ctPin', 'pin'], ['ctDistrict', 'text'], ['ctState', 'text']
    ]);
    if (!ok) { J.status('#ctStatus', 'Some details above need attention. The first one is highlighted.', true); return; }

    /* A photograph that will pixelate on a card that is definitely being
       printed is worth stopping for, once. */
    if (state.quality && state.quality.level === 'poor' && !state.warned) {
      state.warned = true;
      J.status('#ctStatus', 'That photograph will look pixelated when printed. Zoom out or choose a larger image, or send again to keep it.', true);
      return;
    }

    var button = P.q('#ctSubmit');
    J.busy(button, true, 'Issuing your card...');
    J.status('#ctStatus', '');

    fetch('/api/caregiver/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: J.value('ctName'),
        mobile: J.value('ctMobile'),
        email: J.value('ctEmail'),
        address: [J.value('ctAddress'), J.value('ctDistrict'), J.value('ctState'), J.value('ctPin')].filter(Boolean).join(', '),
        clientRef: submitRef
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
        return J.status('#ctStatus', 'This address is serving the site files only; the PFA server that issues cards is not running here. Use the live website.', true);
      }
      if (!result.ok || !result.data.cardId) {
        return J.status('#ctStatus', (result.data && result.data.message) || 'The card could not be issued. Check the details and try again.', true);
      }
      onIssued(result.data);
    }).catch(function () {
      J.busy(button, false);
      J.explainFailure('#ctStatus');
    });
  });

  function notice(html) {
    var host = P.q('#ctDuplicate');
    if (!host) return;
    host.hidden = false;
    host.className = 'journey-notice';
    host.innerHTML = html;
  }

  function onIssued(data) {
    state.card = {
      sample: !!data.sample,
      cardId: data.cardId,
      cardToken: data.cardToken || '',
      issuedAt: data.issuedAt,
      validUntil: data.validUntil,
      name: data.name,
      address: data.address,
      mobile: J.value('ctMobile'),
      email: J.value('ctEmail'),
      cardUrl: data.cardUrl
    };

    if (!data.sample) P.store('pfa_caregiver', {
      cardId: state.card.cardId,
      cardToken: state.card.cardToken,
      issuedAt: state.card.issuedAt,
      validUntil: state.card.validUntil,
      name: state.card.name,
      address: state.card.address,
      mobile: state.card.mobile,
      email: state.card.email,
      photo: state.photo,
      printed: false
    });

    var issued = Card.issuedOnLabel(new Date(state.card.issuedAt));
    var valid = Card.issuedOnLabel(new Date(state.card.validUntil));

    P.q('#ctCardNumber').textContent = state.card.cardId || '';
    P.q('#ctValidity').textContent = 'Issued ' + issued + ' \u00B7 valid until ' + valid;
    P.q('#ctShipTo').textContent = state.card.address;

    /* Duplicates are explained, never silently swallowed. */
    if (data.alreadyHeld) {
      notice('<strong>This mobile number already holds a card.</strong>'
        + 'We have opened the card you already have rather than issuing a second one. '
        + 'If the printed card was lost, <a href="lost-card.html">order a replacement</a> instead.');
    } else if (data.duplicateWarning) {
      notice('<strong>Someone at this address already holds a card.</strong>'
        + 'That is fine if you both feed animals on the street. If this was a second application for the same person, '
        + 'use the first card, and if the printed card was lost, <a href="lost-card.html">order a replacement</a>.');
    }

    steps.go('issued', paint);
  }

  /* ---------- the printed card ---------- */

  var elsewhere = J.shipElsewhere({ toggle: '#ctElsewhere', fields: '#ctElsewhereFields' });

  P.qa('[data-download-png]').forEach(function (button) {
    button.addEventListener('click', function () {
      J.busy(button, true, 'Preparing...');
      Card.downloadPng(cardData(), button.dataset.downloadPng || 'front')
        .catch(function () { P.toast('The file could not be created'); })
        .then(function () { J.busy(button, false); });
    });
  });

  /* One print-ready PDF, both faces at true card size, 600 dpi. */
  P.qa('[data-download-pdf]').forEach(function (button) {
    button.addEventListener('click', function () {
      J.busy(button, true, 'Preparing PDF...');
      Card.downloadPdf(cardData())
        .catch(function () { P.toast('The PDF could not be created'); })
        .then(function () { J.busy(button, false); });
    });
  });

  var share = P.q('#ctCopyShare');
  if (share) {
    share.addEventListener('click', function () {
      var url = state.card && state.card.cardUrl;
      if (!url) return;
      if (navigator.share) return navigator.share({ title: 'My Colony Caregiver Card', url: url }).catch(function () {});
      P.copy(url);
    });
  }

  var pay = P.q('#ctPay');
  if (pay) {
    pay.addEventListener('click', function () {
      if (!state.card) return;
      var useOther = elsewhere.open();

      if (useOther && !J.check([['ctRecipient', 'name'], ['ctDeliveryAddress', 'address'], ['ctDeliveryPin', 'pin']])) {
        return J.status('#ctPrintedStatus', 'Check the delivery details.', true);
      }

      J.busy(pay, true, 'Opening secure payment...');
      J.post('/api/caregiver/order', {
        cardId: state.card.cardId,
        cardToken: state.card.cardToken,
        clientRef: submitRef + '-SHIP',
        deliverElsewhere: useOther ? 'yes' : 'no',
        recipient: useOther ? J.value('ctRecipient') : null,
        deliveryAddress: useOther ? (J.value('ctDeliveryAddress') + ', ' + J.value('ctDeliveryPin')) : null
      });
    });
  }

  window.addEventListener('pageshow', function () {
    J.busy(P.q('#ctSubmit'), false);
    J.busy(pay, false);
  });

  Card.loadAssets().then(paint);
  paint();

  window.PFACaregiverFlow = { onIssued: onIssued, cardData: cardData, paint: paint };
})();
