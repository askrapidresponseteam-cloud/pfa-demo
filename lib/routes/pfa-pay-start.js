'use strict';

/* POST /api/pfa-pay-start
 *
 * Opens a payment. Everything the shopper will be charged is decided here, on
 * the server, from the seller's own numbers:
 *
 *   - item prices come from Shopify, asked for at this moment, not from the
 *     page. A page can be edited; a price in a POST body is a suggestion.
 *   - the delivery charge is matched against the rates Shopify offers this
 *     exact basket and address. A code that matches nothing is refused rather
 *     than guessed at, because guessing means charging a figure nobody quoted.
 *   - availability is checked before a rupee moves, so the common case of
 *     paying for something that just sold out is caught at the front.
 *
 * What comes back is deliberately not the PFA order id. The browser gets an
 * opaque handle. The order id exists by now and is written down, because it is
 * what makes the payment idempotent, but a shopper whose payment fails must not
 * be left holding a number for an order that does not exist.
 */

const orders = require('./pfa-orders.js');
const razorpay = require('../razorpay.js');
const admin = require('../shopify-admin.js');
const payments = require('../store-payments.js');
const { getStoreState } = require('../store-settings.js');

const {
  cleanText, readBody, validatedCheckoutData, deliveryChoice,
  quoteDelivery, shopifyConfig, storefrontQuery, requestFingerprint
} = orders._private;

/* Direct pay is on as soon as it can work, and off when it cannot.
 *
 * It used to require PFA_STORE_DIRECT_PAY=1 to opt in, which meant a correctly
 * configured deployment still sent shoppers to the seller's checkout because
 * one more variable had not been set. That is a bad default: the thing you have
 * to remember is the thing you forget, and the failure is silent.
 *
 * So: if the credentials needed to take a payment and place an order are all
 * present, direct pay runs. PFA_STORE_DIRECT_PAY=0 is a kill switch that forces
 * the old path back without removing any keys, for the moment something is
 * wrong and the shop has to keep selling.
 */
let BUILD = 'unknown';
try {
  const shop = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'pfa-shop.html'), 'utf8');
  const m = /pfa-build" content="(v[0-9.]+)"/.exec(shop);
  if (m) BUILD = m[1];
} catch (_) {}

function directPayEnabled() {
  const flag = String(process.env.PFA_STORE_DIRECT_PAY || '').trim().toLowerCase();
  if (flag === '0' || flag === 'off' || flag === 'false') return false;
  const razorpayReady = razorpay.config().configured;
  /* Without the Admin token a payment could be taken and never turned into an
     order, which is the one outcome worse than an extra checkout screen. */
  const adminReady = Boolean(String(process.env.PFA_SHOPIFY_ADMIN_TOKEN || '').trim());
  return razorpayReady && adminReady;
}

/* What is missing, for the health check to report rather than make anyone
   guess. Names only; never values. */
function missingConfig() {
  const missing = [];
  if (!String(process.env.PFA_RAZORPAY_KEY_ID || '').trim()) missing.push('PFA_RAZORPAY_KEY_ID');
  if (!String(process.env.PFA_RAZORPAY_KEY_SECRET || '').trim()) missing.push('PFA_RAZORPAY_KEY_SECRET');
  if (!String(process.env.PFA_SHOPIFY_ADMIN_TOKEN || '').trim()) missing.push('PFA_SHOPIFY_ADMIN_TOKEN');
  if (!String(process.env.PFA_RAZORPAY_WEBHOOK_SECRET || '').trim()) missing.push('PFA_RAZORPAY_WEBHOOK_SECRET');
  if (!String(process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN || '').trim()) missing.push('PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN');
  return missing;
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

/* shopify-admin asks for prices through whatever query function it is handed,
   so it does not have to know about Storefront tokens or headers. This is the
   adapter onto the one pfa-orders already owns. */
function storefront(request) {
  const config = shopifyConfig();
  return (query, variables, fetchImpl) => storefrontQuery(query, variables, config, fetchImpl, request);
}

module.exports = async function pfaPayStart(request, response) {
  /* GET is the health check. Opening this route in a browser says, in one line,
     whether the deployed build can take a payment and what is missing if it
     cannot. No values are ever returned, only the names of unset variables. */
  if (request.method === 'GET') {
    return sendJson(response, 200, {
      build: BUILD,
      directPay: directPayEnabled() ? 'on' : 'off',
      missing: missingConfig(),
      killSwitch: String(process.env.PFA_STORE_DIRECT_PAY || '').trim().toLowerCase() === '0'
    });
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Start payment from the PFA store.' });
  }

  /* Off by default. With the switch down the page falls back to handing the
     shopper to the seller's checkout, which is what it did before any of this
     existed, so the store is never left unbuyable by a missing credential. */
  if (!directPayEnabled()) {
    return sendJson(response, 503, { code: 'DIRECT_PAY_DISABLED', message: 'Direct payment is not enabled.' });
  }
  if (!razorpay.config().configured) {
    return sendJson(response, 503, { code: 'RAZORPAY_NOT_CONFIGURED', message: 'Payment is not configured.' });
  }

  const store = await getStoreState();
  if (!store.open) {
    return sendJson(response, 503, {
      code: 'STORE_CLOSED',
      message: 'The Store is closed at the moment. Nothing has been charged.'
    });
  }

  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return sendJson(response, 400, { code: 'INVALID_JSON', message: 'The order could not be read.' });
  }

  let checkout;
  try {
    checkout = validatedCheckoutData(body);
  } catch (error) {
    return sendJson(response, Number(error && error.statusCode) || 400, {
      code: cleanText(error && error.code, 80) || 'INVALID_ORDER',
      message: error && error.message ? error.message : 'Check the delivery details.'
    });
  }

  /* One payment per attempt. A double-pressed button, or a retry after a
     dropped connection, must reuse the Razorpay order rather than open a
     second one and risk two charges for one basket. */
  const requestId = cleanText(body.clientRequestId
    || (request.headers || {})['idempotency-key'], 120);
  /* What is being paid for, so a reused key with a changed basket, address or
     delivery choice is a new order and not the old Razorpay order for the old
     amount handed back under a new label. */
  const fingerprint = requestFingerprint(body);
  if (requestId) {
    const existingId = await payments.orderIdForHandle('idem:' + requestId);
    if (existingId) {
      const existing = await payments.get(existingId);
      if (existing && existing.status !== 'PENDING_PAYMENT') {
        /* Already paid on an earlier attempt. Send the browser to the answer
           rather than opening a second payment for the same basket. */
        return sendJson(response, 409, {
          code: 'ALREADY_PAID',
          message: 'This order has already been paid for.',
          handle: existing.handle
        });
      }
      if (existing && existing.handle && existing.status === 'PENDING_PAYMENT'
          && (!existing.fingerprint || existing.fingerprint === fingerprint)) {
        return sendJson(response, 200, openPayload(existing));
      }
    }
  }

  try {
    /* ---- what it really costs ---- */
    const priced = await admin.priceBasket(
      { lines: checkout.lines, deliveryAmount: 0 },
      storefront(request)
    );
    if (priced.unavailable.length) {
      return sendJson(response, 409, {
        code: 'OUT_OF_STOCK',
        message: priced.unavailable.length === 1
          ? 'One item in your bag is no longer available. Nothing has been charged.'
          : 'Some items in your bag are no longer available. Nothing has been charged.',
        unavailable: priced.unavailable
      });
    }
    if (!priced.lines.length) {
      return sendJson(response, 409, { code: 'EMPTY_CART', message: 'Your bag is empty.' });
    }

    /* ---- what delivery really costs ---- */
    const wanted = deliveryChoice(body);
    const quote = await quoteDelivery(body, request);
    const options = Array.isArray(quote.options) ? quote.options : [];
    if (!options.length) {
      return sendJson(response, 503, {
        code: 'NO_DELIVERY_RATES',
        message: 'Delivery to that PIN code could not be priced just now. Nothing has been charged.'
      });
    }
    const chosen = options.find((o) => o.code && o.code.toLowerCase() === String(wanted).toLowerCase())
      || options.find((o) => o.title && o.title.toLowerCase() === String(wanted).toLowerCase());
    if (!chosen) {
      return sendJson(response, 409, {
        code: 'DELIVERY_NOT_OFFERED',
        message: 'That delivery option is no longer available. Please choose again.',
        options
      });
    }

    const total = Math.round((priced.itemsTotal + chosen.amount) * 100) / 100;

    /* ---- the order, written down before any money moves ---- */
    const pfaOrderId = payments.mintPfaOrderId();
    const handle = payments.mintHandle();

    const opened = await razorpay.createOrder({
      pfaOrderId,
      amountRupees: total,
      currency: priced.currency || 'INR',
      notes: {
        pfa_order_id: pfaOrderId,
        delivery_speed: chosen.title
      }
    });

    const record = await payments.put(pfaOrderId, {
      status: 'PENDING_PAYMENT',
      handle,
      fingerprint,
      clientRequestId: requestId || '',
      createdAt: new Date().toISOString(),
      email: checkout.email,
      phone: checkout.phone,
      name: [checkout.address.firstName, checkout.address.lastName].filter(Boolean).join(' '),
      address: checkout.address,
      items: priced.lines,
      itemsTotal: priced.itemsTotal,
      shipping: chosen.amount,
      total,
      currency: priced.currency || 'INR',
      deliveryTitle: chosen.title,
      deliveryCode: chosen.code || chosen.title,
      razorpayOrderId: opened.razorpayOrderId,
      razorpayKeyId: opened.keyId
    });

    await payments.putHandle(handle, pfaOrderId);
    if (requestId) await payments.putHandle('idem:' + requestId, pfaOrderId);

    return sendJson(response, 200, openPayload(record));
  } catch (error) {
    console.error('PFA store: payment could not be opened', {
      code: cleanText(error && error.code, 80),
      message: cleanText(error && error.message, 200)
    });
    return sendJson(response, Number(error && error.statusCode) || 502, {
      code: cleanText(error && error.code, 80) || 'PAYMENT_NOT_READY',
      message: (error && error.message) || 'Payment could not be set up. Nothing has been charged.'
    });
  }
};

/* Everything the browser needs to open Razorpay, and nothing it does not. The
   PFA order id is absent on purpose. */
function openPayload(record) {
  return {
    handle: record.handle,
    keyId: record.razorpayKeyId,
    razorpayOrderId: record.razorpayOrderId,
    amount: record.total,
    currency: record.currency || 'INR',
    prefill: { name: record.name, email: record.email, contact: record.phone },
    /* Who the shopper is about to pay. The Razorpay account is the seller's,
       not PFA's, so this has to be the seller and cannot be PFA: naming the
       charity on a sheet collecting into someone else's account would be a
       false statement at the one moment a shopper decides whether to trust it.
       It is read from configuration rather than written into the codebase.
       Absent, Razorpay falls back to the registered name on the account, which
       is right by construction. */
    sellerName: String(process.env.PFA_SELLER_NAME || '').trim() || undefined,
    summary: {
      itemsTotal: record.itemsTotal,
      shipping: record.shipping,
      total: record.total,
      deliveryTitle: record.deliveryTitle,
      items: (record.items || []).map((i) => ({ title: i.title, quantity: i.quantity, unitPrice: i.unitPrice }))
    }
  };
}

module.exports._private = { directPayEnabled, missingConfig, openPayload, BUILD };
