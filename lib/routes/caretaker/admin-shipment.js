'use strict';

/* Admin-controlled shipment updates. The next phase puts a panel in front of
   this; the rules live here so the panel, a courier webhook and a back-office
   script all obey the same state machine.

   Auth is a bearer token compared in constant time. It is the minimum that is
   honest for an endpoint that can mark parcels delivered. */

const { readRequestBody, setSecurityHeaders } = require('../../../../lib/ccavenue');
const CARETAKER = require('../../../../lib/caretaker');
const store = require('../../../../lib/caretaker-store');
const mail = require('../../../../lib/caretaker-mail');

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function authorised(request) {
  const expected = String(process.env.PFA_ADMIN_TOKEN || '');
  if (!expected) return false;
  const header = String(request.headers.authorization || '');
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  return CARETAKER.safeEqual(expected, presented);
}

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Shipment updates are sent with POST.' });
  }

  if (!authorised(request)) {
    return sendJson(response, 401, { code: 'UNAUTHORISED', message: 'A valid admin token is required.' });
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch (_) {
    return sendJson(response, 400, { code: 'BAD_BODY', message: 'The update could not be read.' });
  }

  const shipmentId = CARETAKER.clean(body.shipmentId, 60).toUpperCase();
  const status = CARETAKER.clean(body.status, 40).toLowerCase();
  const actor = CARETAKER.clean(body.actor, 80) || 'admin';

  if (!CARETAKER.SHIPMENT_ID_PATTERN.test(shipmentId)) {
    return sendJson(response, 400, { code: 'INVALID_SHIPMENT', message: 'That is not a valid tracking ID.' });
  }
  if (!CARETAKER.isShipmentStatus(status)) {
    return sendJson(response, 400, {
      code: 'INVALID_STATUS',
      message: 'Unknown delivery status.',
      allowed: CARETAKER.SHIPMENT_FLOW.concat(CARETAKER.SHIPMENT_EXITS)
    });
  }

  try {
    const { shipment, card } = await store.updateShipmentStatus({
      shipmentId,
      status,
      carrier: body.carrier,
      carrierTrackingNumber: body.carrierTrackingNumber,
      note: body.note,
      actor
    });

    await store.audit({
      actor,
      action: 'shipment.status_changed',
      entity: `shipment:${shipmentId}`,
      detail: { status, carrier: shipment.carrier || null, cardId: shipment.cardId }
    });

    /* Only meaningful steps reach the inbox; every step is in the history. */
    if (card && card.email && CARETAKER.shouldNotify(status)) {
      const cardUrl = `${CARETAKER.clean(process.env.PUBLIC_SITE_URL, 200)}/caretaker-card.html?id=${encodeURIComponent(card.cardId)}`;
      const payload = {
        status,
        statusLabel: CARETAKER.shipmentLabel(status),
        trackingId: shipment.trackingId,
        carrier: shipment.carrier,
        carrierTrackingNumber: shipment.carrierTrackingNumber,
        cardId: card.cardId,
        note: CARETAKER.clean(body.note, 160),
        cardUrl
      };
      const queued = await store.queueEmail({
        template: 'shipment_update',
        to: card.email,
        dedupeKey: `shipment_update:${shipmentId}:${status}`,
        payload
      });
      if (queued.created && mail.isConfigured()) {
        try {
          const sent = await mail.deliver({ to: card.email, template: 'shipment_update', payload });
          await store.recordEmailResult({ emailId: queued.emailId, ok: true, providerId: sent.providerId });
        } catch (error) {
          await store.recordEmailResult({ emailId: queued.emailId, ok: false, error: error && error.message });
        }
      }
    }

    return sendJson(response, 200, {
      shipmentId,
      status: shipment.status,
      statusLabel: CARETAKER.shipmentLabel(shipment.status),
      carrier: shipment.carrier || null,
      carrierTrackingNumber: shipment.carrierTrackingNumber || null,
      updatedAt: shipment.updatedAtIso || null
    });
  } catch (error) {
    if (error && error.code === 'INVALID_TRANSITION') {
      return sendJson(response, 409, { code: 'INVALID_TRANSITION', message: error.message });
    }
    console.error('PFA shipment update error:', CARETAKER.clean(error && error.message, 240));
    return sendJson(response, 503, { code: 'UPDATE_FAILED', message: 'That update could not be saved.' });
  }
};
