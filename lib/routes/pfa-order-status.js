'use strict';

// GET /api/pfa-order-status?token=<checkoutToken>   used by the store page while
//                                                   it waits for a Shopify payment
// GET /api/pfa-order-status?handle=<handle>         used by the store page after a
//                                                   direct payment whose confirmation
//                                                   did not come back cleanly
// GET /api/pfa-order-status?id=PFA-ST-…&contact=…   used by track.html
//
// All return only the public view of the order (no email/address). A token or
// a handle is a random secret known only to the browser that started the
// checkout; a PFA order ID is printed on the confirmation page, so a lookup by
// it must also prove the email or mobile given with the order.
//
// Two registers answer for an id. storePayments holds the orders PFA took the
// payment for itself (direct pay - the number the shopper was given); storeOrders
// holds the Shopify mirror, which is the only record for an order paid on the
// seller's own checkout. The first is asked first; it used to be asked never,
// so every direct-pay order number was "not found" on the tracking page.

const ORDERS = require('../store-orders');
const PAYMENTS = require('../store-payments');
const S = require('../submissions');
const COURIER = require('../courier-tracking');

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

/* Fresh eyes on an id lookup. If the order is not yet delivered, cancelled
   or refunded, Shopify is asked for it before answering (once per five
   minutes per order), and a direct-pay record has the seller's side linked
   in. Every failure is swallowed: the lookup answers from what it holds. */
function settled(view) {
  return Boolean(view && (view.deliveredAt || view.cancelledAt || ['CANCELLED', 'REFUND_RECORDED'].includes(view.status)));
}
async function freshMirror(shopifyOrderId) {
  try { return await ORDERS.refreshFromShopify(shopifyOrderId); } catch (error) {
    console.warn('Order refresh skipped', { message: error && error.message }); return null;
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Order status must be checked with GET.' });
  }

  /* ?warm=1: the shop calls this as the bag opens so the function is awake
     for the checkout POST. Answer before touching anything. */
  if (param(request, 'warm', 4)) {
    response.setHeader('Cache-Control', 'no-store');
    return sendJson(response, 200, { ok: true, warm: true });
  }
  const token = param(request, 'token', 120);
  const handle = param(request, 'handle', 80);
  const id = param(request, 'id', 40);
  const contact = param(request, 'contact', 160);
  if (!token && !id && !handle) {
    return sendJson(response, 400, { code: 'MISSING_TOKEN', message: 'Checkout token or PFA order ID is required.' });
  }

  /* A direct payment, asked about by the browser that made it. The handle is
     as secret as the token; the answer carries the PFA order id only once the
     money is confirmed, exactly as pfa-pay-confirm does. */
  if (handle) {
    let record;
    try {
      const pfaOrderId = await PAYMENTS.orderIdForHandle(handle);
      record = pfaOrderId ? await PAYMENTS.get(pfaOrderId) : null;
    } catch (error) {
      console.error('Order status lookup failed', { message: error && error.message });
      return sendJson(response, 503, { code: 'STATUS_UNAVAILABLE', message: 'Order status is temporarily unavailable.' });
    }
    if (!record) return sendJson(response, 404, { code: 'ORDER_NOT_FOUND', message: 'No verified order matches that number and contact.' });
    const view = PAYMENTS.publicView(record);
    return sendJson(response, 200, {
      ...view,
      verified: view.paid,
      message: view.paid ? 'Payment verified by PFA.' : 'Payment has not been verified by PFA yet.'
    });
  }

  /* An order PFA took the payment for. Its number is the one on the success
     screen and in the email, so this is the register the tracking page hits. */
  if (id && !token && PAYMENTS.isDirectPayId(id)) {
    let record;
    try {
      record = await PAYMENTS.findByPfaOrderId(id);
    } catch (error) {
      console.error('Order status lookup failed', { message: error && error.message });
      return sendJson(response, 503, { code: 'STATUS_UNAVAILABLE', message: 'Order status is temporarily unavailable.' });
    }
    if (record) {
      if (!S.normaliseContact(contact)) {
        return sendJson(response, 400, {
          code: 'CONTACT_REQUIRED',
          message: 'Give the order number together with the email or mobile used for the order.'
        });
      }
      /* Same wording as a miss, so the endpoint cannot confirm that a number
         is real to someone who does not hold the contact that goes with it. */
      if (!PAYMENTS.contactMatches(record, contact)) {
        return sendJson(response, 404, { code: 'ORDER_NOT_FOUND', message: 'No verified order matches that number and contact.' });
      }
      if (record.shopifyOrderId && !settled(PAYMENTS.trackingView(record))) {
        const mirror = await freshMirror(record.shopifyOrderId);
        if (mirror) {
          try { await PAYMENTS.linkMirror(mirror); record = (await PAYMENTS.findByPfaOrderId(id)) || record; } catch (error) {
            console.warn('Mirror link skipped', { message: error && error.message });
          }
        }
      }
      const view = await COURIER.enrich(PAYMENTS.trackingView(record));
      const verified = ['CONFIRMED', 'FULFILLED', 'REFUND_RECORDED'].includes(view.status);
      return sendJson(response, 200, {
        ...view,
        verified,
        message: verified ? 'Payment verified by PFA.' :
          view.status === 'CANCELLED' ? 'This order was cancelled.' :
          'Payment has not been verified by PFA yet.'
      });
    }
  }
  /* A PFA order ID is the Shopify order number with a prefix, so it runs in
     sequence and can be guessed by counting. The checkout token cannot: it is
     120 random characters known only to the browser that paid. So a lookup by
     ID has to prove the email as well, exactly as a submission does. */
  if (id && !token && !S.normaliseContact(contact)) {
    return sendJson(response, 400, {
      code: 'CONTACT_REQUIRED',
      message: 'Give the order number together with the email or mobile used for the order.'
    });
  }

  let record;
  try {
    record = token ? await ORDERS.findByCheckoutToken(token) : await ORDERS.findByPfaOrderId(id);
    if (!record && token) record = await ORDERS.findInShopifyByToken(token);
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
    return sendJson(response, 404, { code: 'ORDER_NOT_FOUND', message: 'No verified order matches that number and contact.' });
  }

  /* The record exists. On an ID lookup it is only this person's to see if the
     contact they gave is the one on the order. Same wording as a miss, so the
     endpoint cannot be used to confirm that an order number is real. */
  if (id && !token) {
    /* Records written before 2 Sep 2026 hold no phone: the capture did not
       exist. A mobile lookup against one of those gets one fresh read of the
       order from Shopify - settled or not, still throttled - so the record
       gains the phone the buyer actually gave before the gate judges it.
       Costs nothing when the record already carries a phone. */
    const givenIsPhone = !S.normaliseContact(contact).includes('@') && S.normaliseContact(contact) !== '';
    if (givenIsPhone && record.shopifyOrderId && !(record.customer && record.customer.phone)) {
      record = (await freshMirror(record.shopifyOrderId)) || record;
    }
    if (!ORDERS.contactMatches(record, contact)) {
      return sendJson(response, 404, { code: 'ORDER_NOT_FOUND', message: 'No verified order matches that number and contact.' });
    }
  }

  /* Courier events ride along on an id lookup only: the token poll is the
     shop waiting on a payment, and a courier has nothing to say yet. */
  if (id && !token && record.shopifyOrderId && !settled(ORDERS.publicView(record))) {
    record = (await freshMirror(record.shopifyOrderId)) || record;
  }
  const view = (id && !token) ? await COURIER.enrich(ORDERS.publicView(record)) : ORDERS.publicView(record);
  const verified = ['CONFIRMED', 'FULFILLED', 'REFUND_RECORDED'].includes(view.status);
  return sendJson(response, 200, {
    ...(token ? { checkoutToken: token } : {}),
    ...view,
    verified,
    message: verified ? 'Payment verified by the seller.' :
      view.status === 'CANCELLED' ? 'This order was cancelled.' :
      view.status === 'PAYMENT_FAILED' ? 'Payment was not completed.' :
      'Payment has not been verified by PFA yet.'
  });
};

module.exports._private = { cleanText };
