(function () {
  'use strict';

  var P = window.PFA;
  var form = P.q('#trackForm');
  var out = P.q('#trackResult');

  var STEPS = [
    { key: 'placed', title: 'Order placed', copy: 'Your order has been received.' },
    { key: 'paid', title: 'Payment verified', copy: 'Paws & Tails confirmed the payment.' },
    { key: 'shipped', title: 'Shipped', copy: 'The parcel is with the courier.' },
    { key: 'delivered', title: 'Delivered', copy: 'Order completed.' }
  ];

  function reached(order) {
    var s = order.status;
    var t = order.tracking && order.tracking.status;
    if (s === 'CANCELLED' || s === 'PAYMENT_FAILED') return 0;
    if (t === 'delivered' || order.deliveredAt) return 3;
    if (s === 'FULFILLED' || order.shippedAt) return 2;
    if (s === 'CONFIRMED' || s === 'REFUND_RECORDED') return 1;
    return 0;
  }

  function label(order) {
    if (order.status === 'CANCELLED') return 'Cancelled';
    if (order.status === 'REFUND_RECORDED') return 'Refunded · ' + P.money(order.refundedTotal || order.total);
    if (order.status === 'PAYMENT_FAILED') return 'Payment not completed';
    if (order.tracking && order.tracking.status) return order.tracking.status.replace(/_/g, ' ');
    return order.status === 'CONFIRMED' ? 'Confirmed' : order.status === 'FULFILLED' ? 'Shipped' : 'Awaiting payment';
  }

  function render(order) {
    var at = reached(order);
    var rows = STEPS.map(function (step, i) {
      var cls = i < at ? 'done' : i === at ? 'active' : 'future';
      return '<div class="track-row ' + cls + '"><div class="track-dot"></div><div><h3>' + step.title + '</h3><p>' + step.copy + '</p></div></div>';
    }).join('');
    var tracking = order.tracking && order.tracking.number ?
      '<p style="margin-top:16px">' + P.escape(order.tracking.company || 'Courier') + ' · ' +
      (order.tracking.url ? '<a href="' + P.escape(order.tracking.url) + '" target="_blank" rel="noopener">' + P.escape(order.tracking.number) + '</a>' : P.escape(order.tracking.number)) + '</p>' : '';
    var items = (order.items || []).map(function (x) { return P.escape(x.title) + ' × ' + x.quantity; }).join(', ');
    var notice = order.status === 'CANCELLED' ? '<div class="notice amber">This order was cancelled by Paws &amp; Tails.</div>' :
      order.status === 'REFUND_RECORDED' ? '<div class="notice">A refund of ' + P.money(order.refundedTotal || order.total) + ' has been recorded.</div>' : '';
    out.innerHTML = '<div class="ref-box"><strong>' + P.escape(order.pfaOrderId) + '</strong><p>' + P.escape(label(order)) + ' · ' + P.money(order.total) + '</p>' +
      (items ? '<p>' + items + '</p>' : '') + tracking + '</div>' + notice + '<div class="tracking">' + rows + '</div>';
  }

  function show(id) {
    if (!id) return;
    out.innerHTML = '<div class="notice">Checking with Paws &amp; Tails…</div>';
    fetch('/api/pfa-order-status?id=' + encodeURIComponent(id), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; }); })
      .then(function (res) {
        if (res.ok && res.body && res.body.pfaOrderId) return render(res.body);
        out.innerHTML = res.status === 404 ?
          '<div class="notice amber">We could not find a verified Paws &amp; Tails order with that number.</div>' :
          '<div class="notice amber">Order status is temporarily unavailable. Please try again in a moment.</div>';
      })
      .catch(function () {
        out.innerHTML = '<div class="notice amber">Order status is temporarily unavailable. Please try again in a moment.</div>';
      });
  }

  form.onsubmit = function (e) {
    e.preventDefault();
    show(P.q('#trackId').value.trim());
  };

  var id = P.param('id');
  if (id) {
    P.q('#trackId').value = id;
    show(id);
  }
}());
