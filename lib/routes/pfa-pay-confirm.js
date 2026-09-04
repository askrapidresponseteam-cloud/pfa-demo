'use strict';

/* POST /api/pfa-pay-confirm
 *
 * The browser's half of completing a payment. Razorpay hands back three values;
 * this route turns them into a placed order, or refuses.
 *
 * It is not the only way an order completes. Razorpay's webhook runs the same
 * path, and either is sufficient on its own: a shopper who closes the tab the
 * instant they pay still gets their order. Both are funnelled through the same
 * claims, so whichever arrives second changes nothing.
 *
 * This is also the first and only moment the PFA order id is handed to the
 * browser, and only when the money is confirmed.
 */

const orders = require('./pfa-orders.js');
const payments = require('../store-payments.js');
const { completePayment } = require('../store-complete.js');

const { cleanText, readBody } = orders._private;

/* Razorpay's callback uses snake_case; accept the camelCase spelling too so a
   caller that normalised the names is not mysteriously refused. */
function fromBody(body) {
  return {
    handle: cleanText(body.handle, 80),
    razorpayOrderId: cleanText(body.razorpay_order_id || body.razorpayOrderId, 60),
    razorpayPaymentId: cleanText(body.razorpay_payment_id || body.razorpayPaymentId, 60),
    signature: cleanText(body.razorpay_signature || body.signature, 200)
  };
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

/* A refused confirmation must never read as "your money is gone". Each of these
   says what is true and what to do, because the shopper has just paid and is
   staring at the screen. */
const MESSAGES = {
  BAD_SIGNATURE: 'That payment could not be verified. If money has left your account, quote nothing and contact us; it will be traced and returned.',
  ORDER_MISMATCH: 'That payment does not belong to this order.',
  NOT_CAPTURED: 'The payment has not completed. Nothing has been charged.',
  AMOUNT_MISMATCH: 'The amount paid does not match this order. We are looking into it and will contact you.',
  UNKNOWN_ORDER: 'That checkout could not be found. Nothing has been charged.',
  VERIFY_UNAVAILABLE: 'We could not confirm the payment just now. Do not pay again: if it went through, your confirmation will follow by email.'
};

module.exports = async function pfaPayConfirm(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Confirm payment from the PFA store.' });
  }

  let body;
  try {
    body = await readBody(request);
  } catch (_) {
    return sendJson(response, 400, { code: 'INVALID_JSON', message: 'The confirmation could not be read.' });
  }

  const fields = fromBody(body);
  if (!fields.handle || !fields.razorpayPaymentId || !fields.razorpayOrderId || !fields.signature) {
    return sendJson(response, 400, { code: 'INCOMPLETE_CONFIRMATION', message: 'That payment could not be verified.' });
  }

  const pfaOrderId = await payments.orderIdForHandle(fields.handle);
  if (!pfaOrderId) {
    return sendJson(response, 404, { code: 'UNKNOWN_ORDER', message: MESSAGES.UNKNOWN_ORDER });
  }

  let result;
  try {
    result = await completePayment({
      pfaOrderId,
      razorpayOrderId: fields.razorpayOrderId,
      razorpayPaymentId: fields.razorpayPaymentId,
      signature: fields.signature,
      source: 'browser'
    });
  } catch (error) {
    /* completePayment is written not to throw. If it ever does, the payment may
       still have gone through, so the shopper is told to wait rather than to
       pay again. The webhook will finish the job. */
    console.error('PFA store: confirmation threw', {
      pfaOrderId, message: cleanText(error && error.message, 200)
    });
    return sendJson(response, 503, {
      code: 'VERIFY_UNAVAILABLE',
      message: MESSAGES.VERIFY_UNAVAILABLE,
      retryable: true
    });
  }

  if (!result.ok) {
    const code = cleanText(result.code, 80);
    const status = code === 'VERIFY_UNAVAILABLE' ? 503
      : code === 'UNKNOWN_ORDER' ? 404
      : code === 'BAD_SIGNATURE' ? 400
      : 409;
    return sendJson(response, status, {
      code,
      message: MESSAGES[code] || result.message || 'That payment could not be confirmed.',
      retryable: Boolean(result.retryable)
    });
  }

  /* Paid. The view carries the PFA order id and nothing of the seller's. */
  return sendJson(response, 200, {
    code: 'CONFIRMED',
    order: result.view,
    /* PLACEMENT_FAILED is deliberately not surfaced as a problem: the shopper
       has paid and their order stands. It is PFA's to chase. */
    message: 'Your order is confirmed.'
  });
};

module.exports._private = { fromBody, MESSAGES };
