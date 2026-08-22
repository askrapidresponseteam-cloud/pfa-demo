(function () {
  'use strict';

  var P = window.PFA;
  var form = P.q('#trackForm');
  var out = P.q('#trackResult');

  function read(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function verified(order) {
    return Boolean(order && order.preview !== true && order.pfaOrderId &&
      ['CONFIRMED', 'FULFILLED', 'REFUND_RECORDED'].indexOf(String(order.status || '').toUpperCase()) > -1);
  }

  function show(id) {
    var history = read('pfa_order_history_v1', []);
    if (!Array.isArray(history)) history = [];
    var order = history.find(function (item) {
      return verified(item) && String(item.pfaOrderId).toLowerCase() === String(id).toLowerCase();
    });
    out.innerHTML = order ?
      '<div class="ref-box"><strong>' + P.escape(order.pfaOrderId) + '</strong><p>' + P.escape(order.status) + '</p></div><div class="tracking"><div class="track-row done"><div class="track-dot"></div><div><h3>Order placed</h3><p>Your order has been received.</p></div></div><div class="track-row active"><div class="track-dot"></div><div><h3>' + P.escape(order.status) + '</h3><p>This is the latest verified status for your order.</p></div></div><div class="track-row future"><div class="track-dot"></div><div><h3>Preparing order</h3><p>Awaiting the partner fulfilment update.</p></div></div><div class="track-row future"><div class="track-dot"></div><div><h3>Shipped</h3><p>Awaiting shipment update.</p></div></div></div>' :
      '<div class="notice amber">We could not find a verified Paws &amp; Tails order with that number.</div>';
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
