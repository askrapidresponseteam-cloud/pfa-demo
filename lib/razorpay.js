'use strict';

/* Razorpay, on the seller's account.
 *
 * PFA renders the payment step; the money goes to the seller. The key pair
 * used here is the seller's, so PFA is still not the merchant of record: no
 * settlement, no chargeback liability and no GST on goods PFA does not sell.
 * What PFA now holds is the seller's credentials, which is a custody question
 * and needs their agreement in writing before this is switched on.
 *
 * Nothing in this file is allowed to trust the browser. Amounts are computed
 * from Shopify's own prices by lib/shopify-admin.js and passed in here already
 * settled; this module only talks to Razorpay and checks signatures.
 */

const crypto = require('crypto');

const API = 'https://api.razorpay.com/v1';

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function payError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function config() {
  const keyId = cleanText(process.env.PFA_RAZORPAY_KEY_ID, 120);
  const keySecret = cleanText(process.env.PFA_RAZORPAY_KEY_SECRET, 200);
  const webhookSecret = cleanText(process.env.PFA_RAZORPAY_WEBHOOK_SECRET, 200);
  return {
    keyId,
    keySecret,
    webhookSecret,
    configured: Boolean(keyId && keySecret)
  };
}

/* Razorpay counts in paise. Rupees never reach the API as a float, because
   0.1 + 0.2 is not 0.3 and a checkout must not be the place that discovers it. */
function toPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n < 0) throw payError('The order total is not a number.', 'BAD_AMOUNT', 500);
  return Math.round(n * 100);
}

function authHeader(cfg) {
  return 'Basic ' + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64');
}

async function call(path, options, cfg, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw payError('Payment networking is unavailable.', 'RAZORPAY_NETWORK_ERROR', 503);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetchImpl(API + path, Object.assign({
      headers: {
        Authorization: authHeader(cfg),
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      signal: controller.signal
    }, options));
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'The payment gateway timed out. Nothing has been charged.'
      : 'The payment gateway could not be reached. Nothing has been charged.';
    throw payError(message, 'RAZORPAY_NETWORK_ERROR', 503);
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload && payload.error && payload.error.description;
    throw payError(cleanText(detail, 180) || 'The payment could not be set up.', 'RAZORPAY_REJECTED', 502);
  }
  return payload;
}

/* One Razorpay order per PFA order. The PFA order id is the receipt, so the two
   can always be lined up from either side, and Razorpay itself refuses a
   duplicate receipt on the same account, which is a second guard against
   charging twice for one basket. */
async function createOrder({ pfaOrderId, amountRupees, currency = 'INR', notes = {} }, fetchImpl = global.fetch) {
  const cfg = config();
  if (!cfg.configured) throw payError('Payment is not configured.', 'RAZORPAY_NOT_CONFIGURED', 503);
  const body = {
    amount: toPaise(amountRupees),
    currency: cleanText(currency, 8) || 'INR',
    receipt: cleanText(pfaOrderId, 40),
    /* Capture at once: an authorised-but-uncaptured payment that nobody
       captures is money held from the shopper for nothing. */
    payment_capture: 1,
    notes: Object.assign({ pfa_order_id: cleanText(pfaOrderId, 40) }, notes)
  };
  const order = await call('/orders', { method: 'POST', body: JSON.stringify(body) }, cfg, fetchImpl);
  return {
    razorpayOrderId: cleanText(order.id, 60),
    amountPaise: Number(order.amount) || body.amount,
    currency: cleanText(order.currency, 8) || 'INR',
    keyId: cfg.keyId
  };
}

/* The browser hands back three values after paying. Only the signature proves
   they belong together, and it is checked with the secret, which never leaves
   the server. A forged callback fails here and no order is created. */
function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  const cfg = config();
  if (!cfg.configured) return false;
  const expected = crypto.createHmac('sha256', cfg.keySecret)
    .update(`${cleanText(razorpayOrderId, 60)}|${cleanText(razorpayPaymentId, 60)}`)
    .digest('hex');
  return timingSafeEqual(expected, cleanText(signature, 200));
}

/* Razorpay's webhook signs the raw body. The browser can be closed, refreshed
   or lost on a train; the webhook is what makes the order arrive anyway. */
function verifyWebhookSignature(rawBody, signature) {
  const cfg = config();
  if (!cfg.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', cfg.webhookSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'))
    .digest('hex');
  return timingSafeEqual(expected, cleanText(signature, 200));
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  try { return crypto.timingSafeEqual(left, right); } catch (_) { return false; }
}

/* What Razorpay itself says about a payment, asked server-side. The callback
   says it succeeded; this is the check that it did, and for how much, before a
   single item is dispatched. */
async function fetchPayment(paymentId, fetchImpl = global.fetch) {
  const cfg = config();
  if (!cfg.configured) throw payError('Payment is not configured.', 'RAZORPAY_NOT_CONFIGURED', 503);
  const payment = await call('/payments/' + encodeURIComponent(cleanText(paymentId, 60)), { method: 'GET' }, cfg, fetchImpl);
  return {
    id: cleanText(payment.id, 60),
    orderId: cleanText(payment.order_id, 60),
    status: cleanText(payment.status, 40),
    amountPaise: Number(payment.amount) || 0,
    currency: cleanText(payment.currency, 8) || 'INR',
    method: cleanText(payment.method, 40),
    captured: payment.status === 'captured'
  };
}

/* Used when a payment lands but the basket cannot be fulfilled: the money goes
   back rather than sitting on an order that will never ship. */
async function refund(paymentId, amountRupees, notes = {}, fetchImpl = global.fetch) {
  const cfg = config();
  if (!cfg.configured) throw payError('Payment is not configured.', 'RAZORPAY_NOT_CONFIGURED', 503);
  const body = { notes };
  if (amountRupees != null) body.amount = toPaise(amountRupees);
  const done = await call('/payments/' + encodeURIComponent(cleanText(paymentId, 60)) + '/refund',
    { method: 'POST', body: JSON.stringify(body) }, cfg, fetchImpl);
  return { refundId: cleanText(done.id, 60), status: cleanText(done.status, 40) };
}

module.exports = {
  config,
  createOrder,
  fetchPayment,
  refund,
  toPaise,
  verifyPaymentSignature,
  verifyWebhookSignature,
  _private: { timingSafeEqual, payError, cleanText }
};
