'use strict';

/* Ordering the printed card.

   This endpoint owns the whole money path: it proves the caller holds the card,
   resolves the delivery address server-side, fixes the price server-side,
   writes the order, and hands off to CCAvenue. The browser never carries an
   amount or an address into the payment form, so neither can be tampered with. */

const { cleanText, getBaseUrl, readRequestBody, setSecurityHeaders } = require('../../../../lib/ccavenue');
const { createTransaction } = require('../../../../lib/firebase');
const { getCredentials, isConfigurationError, renderError, renderTransfer } = require('../../../../lib/pfa-ccavenue-flow');
const CARETAKER = require('../../../../lib/caretaker');
const store = require('../../../../lib/caretaker-store');

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);

  let baseUrl = '';
  try { baseUrl = getBaseUrl(request); } catch (_) { baseUrl = ''; }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return renderError(response, 405, 'Order not accepted', 'Start from your Caretaker Card page.', '/caretaker.html', 'Return to PFA');
  }

  try {
    const body = await readRequestBody(request);
    const cardId = CARETAKER.clean(body.cardId, 60).toUpperCase();
    const cardToken = CARETAKER.clean(body.cardToken, 200);

    if (!CARETAKER.CARD_ID_PATTERN.test(cardId)) throw new Error('That card number is not valid.');

    const card = await store.authoriseCard(cardId, cardToken);
    if (!card) {
      return renderError(response, 403, 'This card could not be confirmed',
        'Open your card from the link you were given and order the printed copy from there.',
        '/caretaker.html', 'Return to PFA');
    }

    if (card.printed) {
      return renderError(response, 409, 'A printed card is already on its way',
        'This card already has a printed copy ordered. Check its delivery status on your card page.',
        `/caretaker-card.html?id=${encodeURIComponent(cardId)}`, 'Open your card');
    }

    const delivery = CARETAKER.parseDeliveryChoice(body);
    const orderId = CARETAKER.createOrderId();

    // The amount is a server constant. Nothing from the browser reaches it.
    const amount = CARETAKER.SHIPPING_PRICE;

    await store.createShippingOrder({ card, delivery, orderId, amount });

    /* The shared transactions collection is what the CCAvenue callback verifies
       against, so the order is mirrored there in the shape that flow expects. */
    await createTransaction({
      orderId,
      type: 'caretaker',
      amount,
      currency: 'inr',
      idempotencyKey: CARETAKER.clean(body.clientRef, 200) || orderId,
      data: {
        customer: { name: card.name, mobile: card.mobile, email: card.email },
        metadata: { cardId, kind: 'caretaker-shipping' }
      }
    });

    const { merchantId } = getCredentials('inr');
    const deliveryAddress = delivery.sameAsCardAddress ? card.address : delivery.address;
    const deliveryPin = delivery.sameAsCardAddress ? card.pin : delivery.pin;

    return renderTransfer(response, {
      merchant_id: merchantId,
      order_id: orderId,
      amount,
      currency: 'INR',
      language: 'EN',
      redirect_url: `${baseUrl}/api/payment/response`,
      cancel_url: `${baseUrl}/api/payment/response`,
      billing_name: delivery.sameAsCardAddress ? card.name : (delivery.recipient || card.name),
      billing_tel: card.mobile,
      billing_email: card.email,
      billing_address: cleanText(deliveryAddress, 200),
      billing_zip: deliveryPin,
      billing_country: 'India',
      merchant_param1: 'PFA Caretaker Card',
      merchant_param2: 'Printed card shipping',
      merchant_param3: 'caretaker',
      merchant_param4: cardId
    }, {
      currency: 'inr',
      title: 'Opening secure payment',
      message: `You are being transferred to CCAvenue for the ₹${amount} shipping charge.`
    });
  } catch (error) {
    const message = CARETAKER.clean(error && error.message, 300);
    if (isConfigurationError(message)) {
      console.error('PFA caretaker order configuration error:', message);
      return renderError(response, 500, 'Payments are not configured yet',
        'The secure payment service needs to be configured before printed cards can be ordered.',
        '/caretaker.html', 'Return to PFA');
    }
    return renderError(response, 400, 'Please check the delivery details', message, '/caretaker.html', 'Return to PFA');
  }
};
