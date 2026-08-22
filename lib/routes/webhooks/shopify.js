'use strict';

// Receives Paws & Tails (Shopify) order webhooks.
//
//   POST /api/webhooks/order-created        orders/create
//   POST /api/webhooks/order-paid           orders/paid        (recommended extra)
//   POST /api/webhooks/order-fulfilled      orders/fulfilled
//   POST /api/webhooks/fulfillment-updated  fulfillments/update
//   POST /api/webhooks/order-cancelled      orders/cancelled
//   POST /api/webhooks/refund-created       refunds/create
//
// Every request must carry a valid X-Shopify-Hmac-Sha256 over the raw body,
// computed with PFA_SHOPIFY_WEBHOOK_SECRET. Without that secret the endpoint
// refuses everything: a forged "paid" webhook would otherwise show a customer
// a confirmed order that was never paid for.

const ORDERS = require('../../store-orders');

const PATH_TOPICS = {
  'order-created': 'orders/create',
  'order-paid': 'orders/paid',
  'order-fulfilled': 'orders/fulfilled',
  'fulfillment-updated': 'fulfillments/update',
  'order-cancelled': 'orders/cancelled',
  'refund-created': 'refunds/create'
};
const MAX_BYTES = 1_000_000;

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

// HMAC is over the exact bytes Shopify sent, so read the stream before
// touching request.body (which would JSON-parse it and lose the whitespace).
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
  if (body && typeof body === 'object') return Buffer.from(JSON.stringify(body), 'utf8'); // HMAC will likely fail; logged below
  return Buffer.alloc(0);
}

function topicFor(request) {
  const fromHeader = header(request, 'x-shopify-topic').toLowerCase();
  if (fromHeader) return fromHeader;
  try {
    const pathname = new URL(request.url, 'https://pfa.local').pathname;
    const slug = pathname.split('/').filter(Boolean).pop();
    return PATH_TOPICS[slug] || '';
  } catch (_) {
    return '';
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  const secret = String(process.env.PFA_SHOPIFY_WEBHOOK_SECRET || '');
  if (!secret) {
    console.error('Shopify webhook rejected: PFA_SHOPIFY_WEBHOOK_SECRET is not set');
    return sendJson(response, 503, { code: 'WEBHOOK_NOT_CONFIGURED' });
  }

  let raw;
  try {
    raw = await rawBody(request);
  } catch (error) {
    return sendJson(response, 413, { code: 'PAYLOAD_TOO_LARGE' });
  }

  if (!ORDERS.verifyHmac(raw, header(request, 'x-shopify-hmac-sha256'), secret)) {
    console.warn('Shopify webhook rejected: bad HMAC', { topic: topicFor(request) });
    return sendJson(response, 401, { code: 'INVALID_SIGNATURE' });
  }

  const expectedShop = String(process.env.PFA_SHOPIFY_STORE_DOMAIN || '').toLowerCase();
  const shop = header(request, 'x-shopify-shop-domain').toLowerCase();
  if (expectedShop && shop && shop !== expectedShop) {
    return sendJson(response, 401, { code: 'WRONG_SHOP' });
  }

  const topic = topicFor(request);
  if (!Object.values(PATH_TOPICS).includes(topic)) {
    // Signed but not a topic we track: acknowledge so Shopify stops retrying.
    return sendJson(response, 200, { ok: true, ignored: topic || 'unknown' });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8') || '{}');
  } catch (_) {
    return sendJson(response, 400, { code: 'INVALID_JSON' });
  }

  try {
    const result = await ORDERS.upsertFromWebhook(topic, payload, header(request, 'x-shopify-webhook-id'));
    if (result.duplicate) return sendJson(response, 200, { ok: true, duplicate: true });
    const record = result.record;
    if (topic === 'orders/create' && !record.checkoutToken) {
      console.warn('Shopify order has no PFA checkout reference; trackable by order number only', {
        shopifyOrderId: record.shopifyOrderId, orderNumber: record.orderNumber
      });
    }
    return sendJson(response, 200, { ok: true, pfaOrderId: record.pfaOrderId, status: record.status });
  } catch (error) {
    // Non-2xx makes Shopify retry (up to 19 times over 48h), which is what we
    // want for a transient Firestore failure.
    console.error('Shopify webhook persistence failed', { topic, message: error && error.message });
    return sendJson(response, 500, { code: 'PERSISTENCE_FAILED' });
  }
};

module.exports._private = { PATH_TOPICS, topicFor, rawBody };
