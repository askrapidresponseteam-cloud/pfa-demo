'use strict';

// GET /api/pfa-order-status?token=<checkoutToken>   used by store.html while it
//                                                   waits for the Shopify payment
// GET /api/pfa-order-status?id=PFA-ST-1191           used by track-order.html
//
// Both return only the public view of the order (no email/address). A token
// is a 120-char random secret known only to the browser that started the
// checkout; a PFA order ID is printed on the confirmation page.

const ORDERS = require('../store-orders');

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function param(request, name, max) {
  let value = cleanText(request.query && request.query[name], max);
  if (!value && request.url) {
    try {
      value = cleanText(new URL(request.url, 'https://pfa.local').searchParams.get(name), max);
    } catch (_) {}
  }
  return value;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Order status must be checked with GET.' });
  }

  const token = param(request, 'token', 120);
  const id = param(request, 'id', 40);
  if (!token && !id) {
    return sendJson(response, 400, { code: 'MISSING_TOKEN', message: 'Checkout token or PFA order ID is required.' });
  }

  let record;
  try {
    record = token ? await ORDERS.findByCheckoutToken(token) : await ORDERS.findByPfaOrderId(id);
  } catch (error) {
    console.error('Order status lookup failed', { message: error && error.message });
    return sendJson(response, 503, { code: 'STATUS_UNAVAILABLE', message: 'Order status is temporarily unavailable.' });
  }

  if (!record) {
    if (token) {
      return sendJson(response, 200, {
        checkoutToken: token,
        status: 'AWAITING_PAYMENT',
        verified: false,
        message: 'Payment has not been verified by PFA yet.'
      });
    }
    return sendJson(response, 404, { code: 'ORDER_NOT_FOUND', message: 'No verified Paws & Tails order matches that number.' });
  }

  const view = ORDERS.publicView(record);
  const verified = ['CONFIRMED', 'FULFILLED', 'REFUND_RECORDED'].includes(view.status);
  return sendJson(response, 200, {
    ...(token ? { checkoutToken: token } : {}),
    ...view,
    verified,
    message: verified ? 'Payment verified by Paws & Tails.' :
      view.status === 'CANCELLED' ? 'This order was cancelled.' :
      view.status === 'PAYMENT_FAILED' ? 'Payment was not completed.' :
      'Payment has not been verified by PFA yet.'
  });
};

module.exports._private = { cleanText };
