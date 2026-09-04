(function () {
  'use strict';

  var P = window.PFA;
  var items = P.cartItems();
  var host = P.q('#checkoutItems');
  var subtotal = P.cartSubtotal();
  var rx = items.some(function (x) { return x.product.rx; });
  var form = P.q('#checkoutForm');
  var submit = P.q('#placeOrder');
  var notice = P.q('.order-summary .notice');

  if (!items.length) {
    location.replace('store.html');
    return;
  }

  function render() {
    host.innerHTML = items.map(function (x) {
      return '<div class="cart-item"><div class="cart-thumb"></div><div><strong>' +
        P.escape(x.product.name) + '</strong><p>Qty ' + x.qty + ' · ' +
        P.money(x.product.price * x.qty) + (x.product.rx ? ' · Prescription' : '') +
        '</p></div></div>';
    }).join('');
    P.q('#checkoutSubtotal').textContent = P.money(subtotal);
    P.q('#checkoutTotal').textContent = P.money(subtotal);
    if (submit) submit.textContent = 'Continue to partner payment · ' + P.money(subtotal);
    if (notice) {
      notice.textContent = 'No PFA order number is created yet. It will be issued only after partner payment is verified.';
    }
    P.q('#rxCheckout').style.display = rx ? 'block' : 'none';
  }

  var up = P.q('#rxUpload');
  if (up) {
    up.onchange = function () {
      P.q('#rxName').textContent = up.files[0] ? up.files[0].name : 'No file selected';
    };
  }

  function internalIntentId() {
    return 'checkout-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function showPendingMessage() {
    var message = P.q('#checkoutPendingMessage');
    if (!message) {
      message = document.createElement('div');
      message.id = 'checkoutPendingMessage';
      message.className = 'notice';
      form.parentNode.insertBefore(message, form);
    }
    message.textContent = 'Partner payment is not connected in this build. No payment was taken and no order was created. Your cart is saved; try again after the partner checkout is connected.';
    message.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.onsubmit = function (e) {
    e.preventDefault();
    if (!P.validate(form)) return;
    if (rx && (!up || !up.files.length)) {
      P.toast('Upload the prescription for the marked item');
      return;
    }

    // Store checkout is owned by the selling partner. Until its payment
    // hand-off and verified callback are configured, keep only an internal
    // pending intent. Never mint a PFA order ID or claim payment here.
    P.store('pfa_checkout_intent', {
      id: internalIntentId(),
      at: Date.now(),
      items: items,
      total: subtotal,
      address: P.formData(form),
      status: 'PAYMENT_PENDING',
      vendor: 'seller'
    });
    showPendingMessage();
    if (submit) submit.textContent = 'Continue to partner payment · ' + P.money(subtotal);
  };

  render();
}());
