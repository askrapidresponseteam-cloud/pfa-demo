'use strict';

/* Free digital issuance. This is the only step between a stranger and a card,
   so everything is validated here and nothing about identity is trusted from
   the browser. Returns the card number and a one-time control token. */

const { readRequestBody, setSecurityHeaders, getBaseUrl } = require('../../../lib/ccavenue');
const CAREGIVER = require('../../../lib/caregiver');
const store = require('../../../lib/caregiver-store');
const mail = require('../../../lib/caregiver-mail');

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function clientIp(request) {
  const header = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return header || (request.socket && request.socket.remoteAddress) || '';
}

/* Instant issuance is gone. A card is not something a stranger can give
   themselves: the application is paid for, read by a named person at PFA, and
   the card is issued from the admin panel. This endpoint stays so that anything
   still pointing at it gets an answer rather than a 404, and says where to go. */
module.exports = async function handler(request, response) {
  setSecurityHeaders(response);

  return sendJson(response, 410, {
    code: 'APPLY_MOVED',
    message: 'Colony caregiver cards are no longer issued on the spot. Apply from the Get Involved page; '
      + 'the fifty-rupee fee confirms the application and gives you a number to track it with.',
    where: '/get-involved.html#caregiver'
  });
};

module.exports._retired = async function handler(request, response) {
  setSecurityHeaders(response);

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Applications are sent with POST.' });
  }

  let body;
  let application;
  try {
    body = await readRequestBody(request);
    application = CAREGIVER.parseApplication(body);
  } catch (error) {
    return sendJson(response, 400, {
      code: 'INVALID_APPLICATION',
      message: CAREGIVER.clean(error && error.message, 240) || 'Check the details on the form.'
    });
  }

  let baseUrl = '';
  try { baseUrl = getBaseUrl(request); } catch (_) { baseUrl = ''; }

  try {
    const result = await store.issueCard({
      application,
      idempotencyKey: CAREGIVER.clean(body.clientRef, 200),
      requestMeta: { ip: clientIp(request) }
    });

    const card = result.card;
    const cardUrl = `${baseUrl}/caregiver-card.html?id=${encodeURIComponent(card.cardId)}`;

    /* Someone who already holds a card is shown it again rather than told off.
       No token is returned, so a stranger who guesses a mobile number cannot
       take control of that person's card. */
    if (result.reissued) {
      return sendJson(response, 200, {
        cardId: card.cardId,
        issuedAt: card.issuedAt,
        validUntil: card.validUntil,
        name: card.name,
        address: card.address,
        cardUrl,
        alreadyHeld: true,
        duplicateWarning: null,
        message: 'This mobile number already holds a Colony Caregiver Card.'
      });
    }

    const queued = await store.queueEmail({
      template: 'card_issued',
      to: card.email,
      dedupeKey: `card_issued:${card.cardId}`,
      payload: {
        name: card.name,
        cardId: card.cardId,
        issuedAt: card.issuedAt,
        validUntil: card.validUntil,
        cardUrl
      }
    });

    /* Try once inline so the common case lands in the inbox while the applicant
       is still looking at the screen; the worker picks up whatever fails. */
    if (queued.created && mail.isConfigured()) {
      try {
        const sent = await mail.deliver({
          to: card.email,
          template: 'card_issued',
          payload: { name: card.name, cardId: card.cardId, issuedAt: card.issuedAt, validUntil: card.validUntil, cardUrl }
        });
        await store.recordEmailResult({ emailId: queued.emailId, ok: true, providerId: sent.providerId });
      } catch (error) {
        await store.recordEmailResult({ emailId: queued.emailId, ok: false, error: error && error.message });
      }
    }

    return sendJson(response, 201, {
      cardId: card.cardId,
      cardToken: result.token,
      issuedAt: card.issuedAt,
      validUntil: card.validUntil,
      name: card.name,
      address: card.address,
      cardUrl,
      alreadyHeld: false,
      duplicateWarning: result.duplicate === 'identity' ? 'identity' : null
    });
  } catch (error) {
    console.error('PFA caregiver apply error:', CAREGIVER.clean(error && error.message, 240));
    return sendJson(response, 503, {
      code: 'ISSUE_UNAVAILABLE',
      message: 'The card register could not be reached. Try again in a moment.'
    });
  }
};
