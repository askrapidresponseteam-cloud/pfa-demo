'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const handler = require('../lib/routes/webhooks/shopify');
const status = require('../lib/routes/pfa-order-status');
const ORDERS = require('../lib/store-orders');

const SECRET = 'test-webhook-secret';
const ORDER_ID = 7352867848367;
const TOKEN = 'checkout-abc123def456';

const created = {
  id: ORDER_ID, order_number: 1191, created_at: '2026-08-22T13:01:01Z', financial_status: 'paid',
  total_price: '1650.00', currency: 'INR',
  customer: { id: 9167863644335, first_name: 'Rahul', last_name: 'Sharma', email: 'rahul@example.com' },
  note_attributes: [{ name: 'PFA checkout reference', value: TOKEN }],
  line_items: [{ product_id: 8493756809391, title: 'Himalaya Liv 52 Forte Tablets', quantity: 1, price: '1650.00', sku: 'HIM-LIV52' }]
};
const fulfilled = { id: ORDER_ID, fulfillment_status: 'fulfilled', fulfillments: [{ id: 111111, status: 'in_transit', tracking_company: 'Delhivery', tracking_number: 'DEL123456789', tracking_url: 'https://www.delhivery.com/track/DEL123456789' }] };
const updated = { id: 111111, order_id: ORDER_ID, status: 'delivered', tracking_company: 'Delhivery', tracking_number: 'DEL123456789', tracking_url: 'https://www.delhivery.com/track/DEL123456789' };
const cancelled = { id: ORDER_ID, order_number: 1191, cancelled_at: '2026-08-22T16:00:00Z', cancel_reason: 'customer' };
const refund = { id: 555555, order_id: ORDER_ID, created_at: '2026-08-22T17:00:00Z', transactions: [{ amount: '1650.00', currency: 'INR', status: 'success' }] };

function sign(raw, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(raw).digest('base64');
}

function webhook(path, payload, { secret = SECRET, webhookId, topic, raw } = {}) {
  const body = raw || JSON.stringify(payload, null, 2);
  const request = new EventEmitter();
  request.method = 'POST';
  request.url = '/api/webhooks/' + path;
  request.headers = {
    'content-type': 'application/json',
    'x-shopify-hmac-sha256': sign(body, secret),
    'x-shopify-shop-domain': 'sg37v1-ta.myshopify.com',
    'x-shopify-webhook-id': webhookId || crypto.randomUUID(),
    ...(topic ? { 'x-shopify-topic': topic } : {})
  };
  request[Symbol.asyncIterator] = async function* () { yield Buffer.from(body); };
  return request;
}

function statusRequest(query) {
  return { method: 'GET', url: '/api/pfa-order-status?' + new URLSearchParams(query), query, headers: {} };
}

function responder() {
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body || '{}'); } };
  return response;
}

async function run(fn, request) {
  const response = responder();
  await fn(request, response);
  return response;
}

test.beforeEach(() => {
  ORDERS.resetForTests();
  process.env.PFA_SHOPIFY_WEBHOOK_SECRET = SECRET;
  process.env.PFA_SHOPIFY_STORE_DOMAIN = 'sg37v1-ta.myshopify.com';
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
});

test('refuses everything when no webhook secret is configured', async () => {
  delete process.env.PFA_SHOPIFY_WEBHOOK_SECRET;
  const response = await run(handler, webhook('order-created', created));
  assert.equal(response.statusCode, 503);
});

test('rejects a forged payload with a bad signature', async () => {
  const response = await run(handler, webhook('order-created', created, { secret: 'wrong' }));
  assert.equal(response.statusCode, 401);
  const check = await run(status, statusRequest({ token: TOKEN }));
  assert.equal(check.body.verified, false);
});

test('rejects a webhook from a different shop', async () => {
  const request = webhook('order-created', created);
  request.headers['x-shopify-shop-domain'] = 'evil.myshopify.com';
  const response = await run(handler, request);
  assert.equal(response.statusCode, 401);
});

test('a paid order becomes CONFIRMED and is found by checkout token and PFA order ID', async () => {
  const response = await run(handler, webhook('order-created', created));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.pfaOrderId, 'PFA-ST-1191');
  assert.equal(response.body.status, 'CONFIRMED');

  const byToken = await run(status, statusRequest({ token: TOKEN }));
  assert.equal(byToken.body.verified, true);
  assert.equal(byToken.body.status, 'CONFIRMED');
  assert.equal(byToken.body.pfaOrderId, 'PFA-ST-1191');
  assert.equal(byToken.body.total, 1650);
  assert.equal(byToken.body.email, undefined, 'no PII leaves the status endpoint');

  const byId = await run(status, statusRequest({ id: 'pfa-st-1191' }));
  assert.equal(byId.statusCode, 200);
  assert.equal(byId.body.items[0].title, 'Himalaya Liv 52 Forte Tablets');
});

test('a pending (unpaid/COD) order stays AWAITING_PAYMENT until orders/paid', async () => {
  await run(handler, webhook('order-created', { ...created, financial_status: 'pending' }));
  let check = await run(status, statusRequest({ token: TOKEN }));
  assert.equal(check.body.status, 'AWAITING_PAYMENT');
  assert.equal(check.body.verified, false);
  await run(handler, webhook('order-paid', { ...created, financial_status: 'paid' }));
  check = await run(status, statusRequest({ token: TOKEN }));
  assert.equal(check.body.status, 'CONFIRMED');
});

test('the full lifecycle: created → fulfilled → delivered → refunded', async () => {
  await run(handler, webhook('order-created', created));
  await run(handler, webhook('order-fulfilled', fulfilled));
  let check = await run(status, statusRequest({ id: 'PFA-ST-1191' }));
  assert.equal(check.body.status, 'FULFILLED');
  assert.equal(check.body.tracking.number, 'DEL123456789');
  assert.equal(check.body.tracking.status, 'in_transit');

  await run(handler, webhook('fulfillment-updated', updated));
  check = await run(status, statusRequest({ id: 'PFA-ST-1191' }));
  assert.equal(check.body.tracking.status, 'delivered');
  assert.ok(check.body.deliveredAt);

  await run(handler, webhook('refund-created', refund));
  check = await run(status, statusRequest({ id: 'PFA-ST-1191' }));
  assert.equal(check.body.status, 'REFUND_RECORDED');
  assert.equal(check.body.refundedTotal, 1650);
});

test('cancellation is recorded and a late create webhook cannot undo it', async () => {
  await run(handler, webhook('order-created', created));
  await run(handler, webhook('order-cancelled', cancelled));
  await run(handler, webhook('order-created', created));
  const check = await run(status, statusRequest({ token: TOKEN }));
  assert.equal(check.body.status, 'CANCELLED');
  assert.equal(check.body.verified, false);
});

test('Shopify redelivery of the same webhook id is a no-op', async () => {
  await run(handler, webhook('refund-created', refund, { webhookId: 'dup-1' }));
  const again = await run(handler, webhook('refund-created', refund, { webhookId: 'dup-1' }));
  assert.equal(again.body.duplicate, true);
  const check = await run(status, statusRequest({ id: 'PFA-ST-' + ORDER_ID }));
  assert.equal(check.body.refundedTotal, 1650, 'refund counted once');
});

test('topic from X-Shopify-Topic header wins over the path', async () => {
  const response = await run(handler, webhook('order-created', cancelled, { topic: 'orders/cancelled' }));
  assert.equal(response.body.status, 'CANCELLED');
});

test('an order without a PFA checkout reference is still stored and trackable by number', async () => {
  const { note_attributes, ...bare } = created;
  const response = await run(handler, webhook('order-created', bare));
  assert.equal(response.statusCode, 200);
  const byToken = await run(status, statusRequest({ token: TOKEN }));
  assert.equal(byToken.body.verified, false);
  const byId = await run(status, statusRequest({ id: 'PFA-ST-1191' }));
  assert.equal(byId.body.verified, true);
});

test('checkout reference is also read from the order note', () => {
  assert.equal(ORDERS.checkoutTokenFrom({ note: 'PFA checkout reference: abc-123_XYZ' }), 'abc-123_XYZ');
});

test('an unknown but correctly signed topic is acknowledged, not retried', async () => {
  const response = await run(handler, webhook('order-created', created, { topic: 'products/update' }));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ignored, 'products/update');
});

test('catalog admin-mode cursor parsing reads the rel="next" page_info', () => {
  const { nextPageInfo } = require('../lib/routes/paws-catalog')._private;
  const link = '<https://x.myshopify.com/admin/api/2026-07/products.json?limit=250&page_info=abc>; rel="previous", <https://x.myshopify.com/admin/api/2026-07/products.json?limit=250&page_info=def>; rel="next"';
  assert.equal(nextPageInfo(link), 'def');
  assert.equal(nextPageInfo('<https://x/products.json?page_info=zzz>; rel="previous"'), '');
});

test('before the webhook arrives, the status endpoint finds the paid order via the Admin API and persists it', async () => {
  process.env.PFA_SHOPIFY_ADMIN_TOKEN = 'shpat_test';
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), token: opts.headers['X-Shopify-Access-Token'] });
    return { ok: true, json: async () => ({ orders: [{ ...created, financial_status: 'paid' }, { ...created, id: 99, note_attributes: [] }] }) };
  };
  try {
    const first = await run(status, statusRequest({ token: TOKEN }));
    assert.equal(first.body.verified, true);
    assert.equal(first.body.pfaOrderId, 'PFA-ST-1191');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/admin\/api\/2026-07\/orders\.json\?status=any/);
    assert.equal(calls[0].token, 'shpat_test');
    const second = await run(status, statusRequest({ token: TOKEN }));
    assert.equal(second.body.verified, true);
    assert.equal(calls.length, 1, 'persisted: no second Admin call');
  } finally {
    global.fetch = realFetch;
    delete process.env.PFA_SHOPIFY_ADMIN_TOKEN;
  }
});

test('without an Admin token the status endpoint simply waits for the webhook', async () => {
  delete process.env.PFA_SHOPIFY_ADMIN_TOKEN;
  const r = await run(status, statusRequest({ token: 'unknown-token' }));
  assert.equal(r.body.verified, false);
  assert.equal(r.body.status, 'AWAITING_PAYMENT');
});

test('admin records API shapes a store order row for the panel', () => {
  const records = require('../lib/routes/admin/records');
  const row = records._private && records._private.storeOrderRow
    ? records._private.storeOrderRow('7352867848367', { pfaOrderId: 'PFA-ST-1191', orderNumber: '1191', status: 'FULFILLED', total: 1650, customer: { name: 'Rahul Sharma', email: 'r@example.com' }, lineItems: [{ title: 'Liv 52', quantity: 2 }], tracking: { company: 'Delhivery', number: 'DEL1', status: 'in_transit', url: 'https://x' }, createdAt: '2026-08-22T13:01:01Z' })
    : null;
  assert.ok(row, 'storeOrderRow exported');
  assert.equal(row.items, 'Liv 52 × 2');
  assert.equal(row.tracking, 'Delhivery DEL1 (in_transit)');
  assert.equal(row.status, 'FULFILLED');
});
