'use strict';

/* POST /api/webhooks/razorpay
 *
 * The answer to "can we pass it to the seller without fail" is that there are
 * two ways in, not one. The browser confirms when it can; this fires whether or
 * not the browser is still there. A shopper who pays and immediately closes the
 * tab, loses signal in a lift, or has the page killed by a phone reclaiming
 * memory still gets their order placed and their confirmation sent.
 *
 * Razorpay retries a webhook it did not get a 2xx for, so this endpoint must be
 * safe to call repeatedly with the same body. It is: completePayment claims
 * each step and the second caller changes nothing.
 *
 * Every request must carry a valid X-Razorpay-Signature over the raw bytes.
 * Without PFA_RAZORPAY_WEBHOOK_SECRET the endpoint refuses everything, because
 * a forged "captured" webhook would otherwise place a real order for a payment
 * that never happened.
 */

const razorpay = require('../../razorpay.js');
const payments = require('../../store-payments.js');
const { completePayment } = require('../../store-complete.js');

const MAX_BYTES = 1_000_000;
const HANDLED = ['payment.captured', 'order.paid'];

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function header(request, name) {
  const headers = request.headers || {};
  return String(headers[name] || headers[name.toLowerCase()] || '');
}

/* The signature is over the exact bytes Razorpay sent, so the stream is read
   before request.body is touched: parsing it to JSON and re-serialising would
   change the whitespace and the HMAC would never match. */
async function rawBody(request) {
  const chunks = [];
  let size = 0;
  if (typeof request[Symbol.asyncIterator] === 'function' && !request.readableEnded) {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BYTES) throw new Error('Webhook body is too large.');
      chunks.push(buffer);
    }
  }
  if (chunks.length) return Buffer.concat(chunks);
  const body = request.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body && typeof body === 'object') return Buffer.from(JSON.stringify(body), 'utf8');
  return Buffer.alloc(0);
}

/* Razorpay puts the PFA order id in the notes on the order and, for
   payment.captured, on the payment too. The receipt is the same id, so there
   are three places to look and any one of them is enough. */
function pfaOrderIdFrom(event) {
  const payload = (event && event.payload) || {};
  const payment = (payload.payment && payload.payment.entity) || {};
  const order = (payload.order && payload.order.entity) || {};
  return cleanText((payment.notes && payment.notes.pfa_order_id)
    || (order.notes && order.notes.pfa_order_id)
    || order.receipt, 40);
}

function paymentFrom(event) {
  const payload = (event && event.payload) || {};
  const payment = (payload.payment && payload.payment.entity) || {};
  return {
    paymentId: cleanText(payment.id, 60),
    orderId: cleanText(payment.order_id, 60)
  };
}

module.exports = async function razorpayWebhook(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { received: false });
  }

  if (!razorpay.config().webhookSecret) {
    console.error('PFA store: a Razorpay webhook arrived with no PFA_RAZORPAY_WEBHOOK_SECRET set');
    return sendJson(response, 503, { received: false });
  }

  let raw;
  try {
    raw = await rawBody(request);
  } catch (_) {
    return sendJson(response, 413, { received: false });
  }

  if (!razorpay.verifyWebhookSignature(raw, header(request, 'x-razorpay-signature'))) {
    /* 401, not 400: Razorpay should not retry something it signed wrongly, and
       a forged call deserves nothing more informative than this. */
    return sendJson(response, 401, { received: false });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (_) {
    return sendJson(response, 400, { received: false });
  }

  const name = cleanText(event && event.event, 60);
  if (!HANDLED.includes(name)) {
    /* Acknowledged so Razorpay stops retrying an event this endpoint has no
       opinion about. Refusing it would earn a retry every few minutes forever. */
    return sendJson(response, 200, { received: true, ignored: name });
  }

  const pfaOrderId = pfaOrderIdFrom(event);
  const { paymentId, orderId } = paymentFrom(event);
  if (!pfaOrderId || !paymentId) {
    console.error('PFA store: a Razorpay webhook carried no PFA order id', { event: name, paymentId });
    return sendJson(response, 200, { received: true, ignored: 'NO_PFA_ORDER_ID' });
  }

  const record = await payments.get(pfaOrderId);
  if (!record) {
    console.error('PFA store: a Razorpay webhook named an order PFA does not know', { pfaOrderId, paymentId });
    return sendJson(response, 200, { received: true, ignored: 'UNKNOWN_ORDER' });
  }

  let result;
  try {
    result = await completePayment({
      pfaOrderId,
      razorpayOrderId: orderId || record.razorpayOrderId,
      razorpayPaymentId: paymentId,
      /* The webhook's own signature has already been checked over the raw body,
         which is a stronger proof than the callback signature: it came from
         Razorpay directly rather than through the shopper's browser. Checking a
         callback signature that was never sent would fail every time. */
      skipSignature: true,
      source: 'webhook'
    });
  } catch (error) {
    console.error('PFA store: webhook completion threw', {
      pfaOrderId, message: cleanText(error && error.message, 200)
    });
    /* 500 so Razorpay retries. This is the one case where a retry is wanted. */
    return sendJson(response, 500, { received: false });
  }

  if (!result.ok && result.retryable) {
    return sendJson(response, 500, { received: false, code: result.code });
  }
  return sendJson(response, 200, { received: true, status: result.status || result.code });
};

module.exports._private = { pfaOrderIdFrom, paymentFrom, rawBody, HANDLED };
