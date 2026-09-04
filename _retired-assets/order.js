(function () {
  'use strict';

  var P = window.PFA;
  var host = P.q('#orderDetail');
  var order = P.store('pfa_last_order');
  var id = P.param('id');

  if (order && id && order.id !== id) {
    var all = P.store('pfa_orders') || [];
    order = all.find(function (x) { return x.id === id; }) || order;
  }

  // A Store confirmation is valid only after the vendor callback has been
  // verified. Legacy local records marked “Payment confirmed” are rejected
  // so they cannot display a false success screen.
  var paid = order && (order.paymentVerified === true || order.status === 'paid' || order.status === 'Payment verified');
  if (!paid) {
    host.innerHTML = '<div class="empty-state"><strong>Payment confirmation required.</strong><p>No confirmed PFA order exists yet. The order number will appear only after the partner payment is verified.</p><div class="hero-actions"><a class="btn dark" href="checkout.html">Return to checkout</a><a class="btn light" href="store.html">Return to store</a></div></div>';
    return;
  }

  host.innerHTML = '<div class="order-success"><div class="success-icon">✓</div><p class="kicker">Order placed</p><h1>Done.<br>You can get on with your day.</h1><p class="lead" style="margin-left:auto;margin-right:auto">Your order is confirmed after verified partner payment. Keep the PFA order number for tracking and support.</p><div class="ref-box" style="margin-top:28px"><strong>' + P.escape(order.id) + '</strong><p>Payment verified · ' + P.money(order.total) + '</p><button class="btn light" type="button" data-copy-text="' + P.escape(order.id) + '">Copy number</button></div><div class="tracking"><div class="track-row done"><div class="track-dot"></div><div><h3>Order placed</h3><p>We received the order.</p></div></div><div class="track-row active"><div class="track-dot"></div><div><h3>Payment verified</h3><p>Your partner payment has been verified.</p></div></div><div class="track-row future"><div class="track-dot"></div><div><h3>Preparing order</h3><p>We will update this page when preparation begins.</p></div></div><div class="track-row future"><div class="track-dot"></div><div><h3>Shipped</h3><p>Tracking details will appear here after dispatch.</p></div></div><div class="track-row future"><div class="track-dot"></div><div><h3>Delivered</h3><p>Order completed.</p></div></div></div><div class="hero-actions" style="justify-content:center"><a class="btn dark" href="track-order.html?id=' + encodeURIComponent(order.id) + '">Track order</a><a class="btn light" href="store.html">Continue shopping</a></div></div>';
}());
