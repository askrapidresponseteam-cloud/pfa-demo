/* The permanent card link.

   Anyone with the link sees the card, its number, its validity and - if a
   printed copy was ordered - where that parcel is. The holder additionally
   sees their photograph and the download buttons, because the photograph is
   only ever on their own device: it is not needed to prove a card is real, so
   it is never uploaded. */
(function () {
  'use strict';

  /* Records written before the Title Case rule are still shown in it. */
  function tidyName(value) {
    return window.PFA_RULES ? window.PFA_RULES.nameCase(value || '') : String(value || '');
  }
  function capitalise(value) {
    var text = String(value || '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  var Card = window.PFACaretakerCard;
  var host = document.getElementById('ctPublic');
  if (!host || !Card) return;

  var params = new URLSearchParams(location.search);
  var cardId = String(params.get('id') || '').trim().toUpperCase();

  var held = null;
  try { held = JSON.parse(localStorage.getItem('pfa_caretaker') || 'null'); } catch (_) { held = null; }
  var isHolder = Boolean(held && held.cardId && held.cardId === cardId);

  var FLOW = ['order_confirmed', 'preparing', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered'];
  var LABELS = {
    order_confirmed: 'Order confirmed',
    preparing: 'Preparing',
    dispatched: 'Dispatched',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    exception: 'Delivery exception',
    cancelled: 'Cancelled',
    returned: 'Returned to sender'
  };

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function date(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : Card.issuedOnLabel(d);
  }

  function fail(message) {
    host.innerHTML = '<div class="empty-state"><strong>' + esc(message)
      + '</strong><a class="btn dark" href="caretaker.html">Apply for a card</a></div>';
  }

  function tracker(delivery) {
    if (!delivery) return '';
    var exceptional = ['exception', 'cancelled', 'returned'].indexOf(delivery.status) !== -1;
    var reached = FLOW.indexOf(delivery.status);
    var seen = {};
    (delivery.history || []).forEach(function (entry) { seen[entry.status] = entry.at; });

    var steps = FLOW.map(function (status, index) {
      var done = !exceptional && index <= reached;
      var current = status === delivery.status;
      var when = seen[status] ? date(seen[status]) : '';
      return '<div class="track-step' + (done ? ' done' : '') + (current ? ' current' : '') + '">'
        + '<strong>' + esc(LABELS[status]) + '</strong>'
        + (when ? '<span>' + esc(when) + '</span>' : '')
        + '</div>';
    });

    if (exceptional) {
      steps.push('<div class="track-step exception current"><strong>' + esc(LABELS[delivery.status])
        + '</strong><span>' + esc(date(delivery.updatedAt)) + '</span></div>');
    }

    return '<div class="form-shell"><div class="form-head"><h3>Printed card</h3>'
      + '<p>Tracking ID ' + esc(delivery.trackingId)
      + (delivery.carrier ? ' · ' + esc(delivery.carrier) : '')
      + (delivery.carrierTrackingNumber ? ' · ' + esc(delivery.carrierTrackingNumber) : '')
      + '</p></div>'
      + '<div class="form-body"><div class="track">' + steps.join('') + '</div></div></div>';
  }

  function render(card) {
    var standingNote = card.standing === 'active'
      ? 'Valid until ' + date(card.validUntil)
      : card.standing === 'expired' ? 'This card has expired.' : 'This card has been withdrawn.';

    host.innerHTML = '<section class="order-success">'
      + (card.standing === 'active' ? '<div class="success-icon">\u2713</div>' : '')
      + '<p class="kicker">Colony Animal Caretaker Card</p>'
      + '<h1>' + esc(tidyName(card.name)) + '</h1>'
      + '<p class="lead" style="margin-left:auto;margin-right:auto">Issued ' + esc(date(card.issuedAt))
      + ' \u00b7 ' + esc(standingNote) + '</p>'
      + '<div class="issued-number">' + esc(card.cardId) + '</div>'
      + '</section>'
      + '<section class="section compact"><div class="patron-layout">'
      + '<div>'
      + (isHolder
        ? '<div class="card-toggle"><button class="active" data-pub-side="front" type="button">Front</button>'
          + '<button data-pub-side="back" type="button">Back</button></div>'
          + '<div class="card-canvas" style="margin-top:18px"><div class="faces">'
          + '<figure data-face="front"><canvas id="ctPubFront" aria-label="Card front"></canvas></figure>'
          + '<figure data-face="back" hidden><canvas id="ctPubBack" aria-label="Card back"></canvas></figure>'
          + '</div></div>'
        : '<div class="form-shell"><div class="form-head"><h3>Verified</h3>'
          + '<p>This card is registered with People for Animals and is recognised under the ABC Rules.</p></div>'
          + '<div class="form-body"><div class="patron-summary" style="margin-top:0">'
          + '<div class="patron-summary-item patron-summary-wide"><span>Name</span><strong>' + esc(tidyName(card.name)) + '</strong></div>'
          + '<div class="patron-summary-item"><span>Issued</span><strong>' + esc(date(card.issuedAt)) + '</strong></div>'
          + '<div class="patron-summary-item"><span>Standing</span><strong>' + esc(capitalise(card.standing)) + '</strong></div>'
          + '<div class="patron-summary-total"><span>Card number</span><strong>' + esc(card.cardId) + '</strong></div>'
          + '</div><div class="form-actions"><a class="btn dark block" href="caretaker.html">Get your own card</a></div>'
          + '</div></div>')
      + '</div>'
      + '<div>'
      + (isHolder
        ? '<div class="form-shell"><div class="form-head"><h3>Your card</h3><p>Download it or share the link.</p></div>'
          + '<div class="form-body"><div class="form-actions">'
          + '<button class="btn dark block" id="ctPubPng" type="button">Download card as PNG</button></div>'
          + '<div class="form-actions" style="display:flex;gap:10px;flex-wrap:wrap">'
          + '<button class="btn light" id="ctPubPdf" type="button">Print-ready PDF</button></div></div></div>'
        : '')
      + tracker(card.delivery)
      + '</div></div></section>';

    if (!isHolder) return;

    var data = {
      name: tidyName(held.name || card.name),
      address: window.PFA_RULES ? window.PFA_RULES.titleCase(held.address || '') : (held.address || ''),
      cardId: card.cardId,
      issuedOn: date(card.issuedAt),
      year: new Date(card.issuedAt || Date.now()).getFullYear(),
      mobile: held.mobile || '',
      email: held.email || '',
      qr: location.href,
      photo: held.photo || ''
    };

    var side = 'front';
    function paint() {
      var frame = host.querySelector('.card-canvas');
      var width = Math.max(180, Math.min(frame ? frame.clientWidth : 300, 340));
      var density = Math.min(window.devicePixelRatio || 1, 3);
      Promise.all([Card.loadAssets(), Card.hydrate(data)]).then(function (out) {
        var front = document.getElementById('ctPubFront');
        var back = document.getElementById('ctPubBack');
        if (front) Card.draw(front, 'front', out[1], out[0], width, density);
        if (back) Card.draw(back, 'back', out[1], out[0], width, density);
      });
    }

    Array.prototype.forEach.call(host.querySelectorAll('[data-pub-side]'), function (button) {
      button.addEventListener('click', function () {
        side = button.dataset.pubSide;
        Array.prototype.forEach.call(host.querySelectorAll('[data-pub-side]'), function (item) {
          item.classList.toggle('active', item.dataset.pubSide === side);
        });
        Array.prototype.forEach.call(host.querySelectorAll('[data-face]'), function (face) {
          face.hidden = face.dataset.face !== side;
        });
        paint();
      });
    });

    function withBusy(button, work) {
      var idle = button.textContent;
      button.disabled = true;
      button.textContent = 'Preparing…';
      work().catch(function () {}).then(function () {
        button.disabled = false;
        button.textContent = idle;
      });
    }

    document.getElementById('ctPubPng').addEventListener('click', function () {
      withBusy(this, function () { return Card.downloadPng(data, 'front'); });
    });
    document.getElementById('ctPubPdf').addEventListener('click', function () {
      withBusy(this, function () { return Card.downloadPdf(data); });
    });

    window.addEventListener('resize', paint);
    paint();
  }

  if (!/^PFA-CCT-[A-Z0-9]{8}$/.test(cardId)) {
    fail('That is not a card number.');
    return;
  }

  /* Render from the copy on this device first so the holder's own card appears
     instantly and works offline, then reconcile with the register. */
  if (isHolder) {
    render({
      cardId: cardId,
      name: held.name,
      standing: 'active',
      issuedAt: held.issuedAt,
      validUntil: held.validUntil,
      delivery: null
    });
  }

  fetch('/api/caretaker/card?id=' + encodeURIComponent(cardId), { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then(render)
    .catch(function (error) {
      if (!isHolder) {
        fail(String(error.message) === '404' ? 'No card was found for that number.' : 'That card could not be checked right now.');
      }
    });
})();
