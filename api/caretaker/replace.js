'use strict';

/* Lost printed card.

   Orders a replacement PARCEL against an existing card. It cannot issue a card,
   cannot change a card number and cannot extend validity - a caretaker whose
   number is written into a colony register or quoted to a police officer keeps
   the number they have. */

const { cleanText, getBaseUrl, readRequestBody, setSecurityHeaders } = require('../../lib/ccavenue');
const { createTransaction } = require('../../lib/firebase');
const { getCredentials, isConfigurationError, renderError, renderTransfer } = require('../../lib/pfa-ccavenue-flow');
const CARETAKER = require('../../lib/caretaker');
const RULES = require('../../assets/field-rules.js');
const store = require('../../lib/caretaker-store');

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);

  let baseUrl = '';
  try { baseUrl = getBaseUrl(request); } catch (_) { baseUrl = ''; }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Replacements are ordered with POST.' });
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch (_) {
    return sendJson(response, 400, { code: 'BAD_BODY', message: 'That request could not be read.' });
  }

  const cardId = RULES.normaliseField('cardId', body.cardId);
  const mobile = RULES.normaliseMobile(body.mobile);
  const stage = CARETAKER.clean(body.stage, 20) || 'verify';

  if (!CARETAKER.CARD_ID_PATTERN.test(cardId)) {
    return sendJson(response, 400, { code: 'INVALID_ID', message: 'Enter the card number in the form PFA-CCT-XXXXXXXX.' });
  }
  if (RULES.checkField('mobile', mobile, { required: true })) {
    return sendJson(response, 400, { code: 'INVALID_MOBILE', message: 'Enter the 10-digit mobile number the card was issued against.' });
  }

  let claim;
  try {
    claim = await store.verifyCardClaim({ cardId, mobile });
  } catch (error) {
    console.error('PFA replacement lookup error:', CARETAKER.clean(error && error.message, 240));
    return sendJson(response, 503, { code: 'LOOKUP_UNAVAILABLE', message: 'That card could not be checked right now.' });
  }

  if (!claim.ok) {
    /* One message for "no such card" and for "wrong number", so this endpoint
       cannot be used to discover which card numbers exist. */
    const message = claim.reason === 'revoked'
      ? 'This card has been withdrawn. Contact your local PFA unit.'
      : 'That card number and mobile number do not match our records.';
    return sendJson(response, claim.reason === 'revoked' ? 409 : 404, { code: 'CLAIM_FAILED', message });
  }

  const card = claim.card;

  // Stage one: confirm the card exists and show the applicant what they hold.
  if (stage === 'verify') {
    return sendJson(response, 200, {
      cardId: card.cardId,
      name: card.name,
      address: card.address,
      issuedAt: card.issuedAt,
      validUntil: card.validUntil,
      shippingPrice: CARETAKER.SHIPPING_PRICE
    });
  }

  // Stage two: take payment for a replacement parcel.
  try {
    const delivery = CARETAKER.parseDeliveryChoice(body);
    const orderId = CARETAKER.createOrderId();

    await store.createReplacementOrder({
      card,
      delivery,
      orderId,
      amount: CARETAKER.SHIPPING_PRICE,
      reason: CARETAKER.clean(body.reason, 120) || 'lost'
    });

    await createTransaction({
      orderId,
      type: 'caretaker',
      amount: CARETAKER.SHIPPING_PRICE,
      currency: 'inr',
      idempotencyKey: CARETAKER.clean(body.clientRef, 200) || orderId,
      data: {
        customer: { name: card.name, mobile: card.mobile, email: card.email },
        metadata: { cardId, kind: 'caretaker-replacement' }
      }
    });

    const { merchantId } = getCredentials('inr');
    const address = delivery.sameAsCardAddress ? card.address : delivery.address;
    const pin = delivery.sameAsCardAddress ? card.pin : delivery.pin;

    return renderTransfer(response, {
      merchant_id: merchantId,
      order_id: orderId,
      amount: CARETAKER.SHIPPING_PRICE,
      currency: 'INR',
      language: 'EN',
      redirect_url: `${baseUrl}/api/payment/response`,
      cancel_url: `${baseUrl}/api/payment/response`,
      billing_name: delivery.sameAsCardAddress ? card.name : (delivery.recipient || card.name),
      billing_tel: card.mobile,
      billing_email: card.email,
      billing_address: cleanText(address, 200),
      billing_zip: pin,
      billing_country: 'India',
      merchant_param1: 'PFA Caretaker Card',
      merchant_param2: 'Replacement card shipping',
      merchant_param3: 'caretaker',
      merchant_param4: cardId
    }, {
      currency: 'inr',
      title: 'Opening secure payment',
      message: `You are being transferred to CCAvenue for the ₹${CARETAKER.SHIPPING_PRICE} replacement charge.`
    });
  } catch (error) {
    const message = CARETAKER.clean(error && error.message, 300);
    if (isConfigurationError(message)) {
      console.error('PFA replacement configuration error:', message);
      return renderError(response, 500, 'Payments are not configured yet',
        'The secure payment service needs to be configured first.', '/lost-card.html', 'Return to PFA');
    }
    return renderError(response, 400, 'Please check the delivery details', message, '/lost-card.html', 'Return to PFA');
  }
};
