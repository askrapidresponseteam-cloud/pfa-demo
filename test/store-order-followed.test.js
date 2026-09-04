'use strict';

/* The order number handed to the shopper has to be the number that works.
 *
 * Before this test existed, a direct payment ended with "your order number is
 * PFA-ST-XXXXXXXX" on the screen and in the email, and typing that number on
 * the tracking page answered "No verified order matches". The number came
 * from storePayments; the tracking route and the admin register read only the
 * Shopify mirror. Nothing in the suite walked from the confirmation to the
 * tracking page, so nothing noticed. This does, end to end, through the real
 * handlers, and then through the seller's fulfilment webhook and the admin
 * register, so the whole life of the order is answered for under one number.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const payments = require('../lib/store-payments');
const ORDERS = require('../lib/store-orders');
const payStart = require('../lib/routes/pfa-pay-start');
const payConfirm = require('../lib/routes/pfa-pay-confirm');
const orderStatus = require('../lib/routes/pfa-order-status');
const records = require('../lib/routes/admin/records');

const nativeFetch = global.fetch;
const SHOPIFY_ORDER_ID = '6001234567';

const ORDER_BODY = {
  lines: [{ variantId: '46608189325487', quantity: 2 }],
  customer: { name: 'Karthik Dhanya', email: 'Karthik@Example.com', phone: '8105250299' },
  shippingAddress: {
    name: 'Karthik Dhanya', phone: '8105250299',
    address1: '4/232 Ashraya Ankadakatte', city: 'Kundapur', province: 'Karnataka', zip: '576222'
  },
  deliveryCode: 'Standard',
  clientRequestId: 'basket-1'
};

function requestFor(body, headers = {}, method = 'POST', url = '/api/x') {
  const request = new EventEmitter();
  request.method = method; request.url = url; request.query = {};
  request.headers = Object.assign({ 'x-forwarded-for': '203.0.113.10' }, headers);
  if (body) request.body = body;
  return request;
}

function recorder() {
  let resolve;
  const completed = new Promise((done) => { resolve = done; });
  const headers = {};
  return {
    completed,
    response: {
      setHeader(n, v) { headers[n] = v; },
      end(raw) { resolve({ statusCode: this.statusCode, headers, body: raw ? JSON.parse(raw) : null }); }
    }
  };
}

function network() {
  return async function (url, options) {
    const u = String(url);
    const sent = options && options.body ? JSON.parse(options.body) : {};
    if (/api\.razorpay\.com\/v1\/orders/.test(u)) {
      return { ok: true, async json() { return { id: 'order_RZP1', amount: sent.amount, currency: 'INR', receipt: sent.receipt }; } };
    }
    if (/api\.razorpay\.com\/v1\/payments\//.test(u)) {
      return { ok: true, async json() { return { id: 'pay_X1', order_id: 'order_RZP1', status: 'captured', captured: true, amount: 28300, currency: 'INR', method: 'upi' }; } };
    }
    if (/graphql\.json/.test(u)) {
      if (/PfaPrice/.test(sent.query)) {
        return { ok: true, async json() { return { data: { nodes: [{
          id: 'gid://shopify/ProductVariant/46608189325487', title: 'Default Title', availableForSale: true,
          price: { amount: '112.00', currencyCode: 'INR' }, product: { title: 'Alembic Mectin Tablet 10mg' }
        }] } }; } };
      }
      if (/PfaFindOrder/.test(sent.query)) return { ok: true, async json() { return { data: { orders: { nodes: [] } } }; } };
      if (/PfaOrderCreate/.test(sent.query)) {
        return { ok: true, async json() { return { data: { orderCreate: { order: { id: `gid://shopify/Order/${SHOPIFY_ORDER_ID}`, name: '#1191', legacyResourceId: SHOPIFY_ORDER_ID }, userErrors: [] } } }; } };
      }
      return { ok: true, async json() { return { data: { cartCreate: { cart: { id: 'gid://shopify/Cart/c1', deliveryGroups: { nodes: [{
        id: 'dg1', deliveryOptions: [{ handle: 'h-std', code: 'Standard', title: 'Standard (Prepaid)', description: '3 to 5 days', estimatedCost: { amount: '59.0', currencyCode: 'INR' } }]
      }] } }, userErrors: [] } } }; } };
    }
    return { ok: true, async json() { return {}; } };
  };
}

async function track(query) {
  const rec = recorder();
  await orderStatus(requestFor(null, {}, 'GET', '/api/pfa-order-status?' + query), rec.response);
  return rec.completed;
}

async function payFor(body = ORDER_BODY) {
  let rec = recorder();
  await payStart(requestFor(body, { 'idempotency-key': body.clientRequestId }), rec.response);
  const started = await rec.completed;
  assert.equal(started.statusCode, 200, JSON.stringify(started.body));
  assert.equal(started.body.pfaOrderId, undefined, 'the order id is not handed out before the money is confirmed');
  const sig = crypto.createHmac('sha256', 'rzp_test_secret').update('order_RZP1|pay_X1').digest('hex');
  rec = recorder();
  await payConfirm(requestFor({ handle: started.body.handle, razorpay_order_id: 'order_RZP1', razorpay_payment_id: 'pay_X1', razorpay_signature: sig }), rec.response);
  const confirmed = await rec.completed;
  assert.equal(confirmed.statusCode, 200, JSON.stringify(confirmed.body));
  return { handle: started.body.handle, order: confirmed.body.order };
}

/* A Shopify order as its webhooks describe it, for the order PFA placed:
   PFA's id in the attributes, the tag and the note, and the relay address. */
function shopifyOrder(pfaOrderId) {
  return {
    id: Number(SHOPIFY_ORDER_ID), order_number: 1191, name: '#1191', financial_status: 'paid',
    total_price: '283.00', currency: 'INR',
    email: payments.relayEmailFor(pfaOrderId), customer: { first_name: 'Karthik', last_name: 'Dhanya' },
    note: 'Order via PFA site · ' + pfaOrderId, tags: 'pfa-order, ' + pfaOrderId,
    note_attributes: [{ name: 'pfa_order_id', value: pfaOrderId }],
    line_items: [{ variant_id: 46608189325487, title: 'Alembic Mectin Tablet 10mg', quantity: 2, price: '112.00' }]
  };
}

test.beforeEach(() => {
  payments.resetForTests();
  ORDERS.resetForTests();
  global.fetch = network();
  Object.assign(process.env, {
    PFA_STORE_DIRECT_PAY: '1', PFA_RAZORPAY_KEY_ID: 'rzp_test_key', PFA_RAZORPAY_KEY_SECRET: 'rzp_test_secret',
    PFA_RAZORPAY_WEBHOOK_SECRET: 'hook_secret', PFA_SHOPIFY_STORE_DOMAIN: 'sg37v1-ta.myshopify.com',
    PFA_SHOPIFY_STOREFRONT_API_VERSION: '2026-07', PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'storefront-token',
    PFA_SHOPIFY_ADMIN_TOKEN: 'shpat_test'
  });
  delete process.env.PFA_MAIL_API_KEY;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
});

test.afterEach(() => {
  global.fetch = nativeFetch;
  ['PFA_STORE_DIRECT_PAY', 'PFA_RAZORPAY_KEY_ID', 'PFA_RAZORPAY_KEY_SECRET', 'PFA_RAZORPAY_WEBHOOK_SECRET',
    'PFA_SHOPIFY_ADMIN_TOKEN', 'PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN'].forEach((k) => delete process.env[k]);
});

test('the number on the success screen is the number that works on the tracking page', async () => {
  const { order } = await payFor();
  assert.match(order.pfaOrderId, /^PFA-ST-[23456789A-HJ-NP-Z]{8}$/);

  const byEmail = await track('id=' + order.pfaOrderId + '&contact=karthik@example.com');
  assert.equal(byEmail.statusCode, 200, JSON.stringify(byEmail.body));
  assert.equal(byEmail.body.pfaOrderId, order.pfaOrderId);
  assert.equal(byEmail.body.status, 'CONFIRMED');
  assert.equal(byEmail.body.verified, true);
  assert.deepEqual(byEmail.body.items, [{ title: 'Alembic Mectin Tablet 10mg', quantity: 2 }]);

  const byPhone = await track('id=' + order.pfaOrderId.toLowerCase() + '&contact=+91 81052 50299');
  assert.equal(byPhone.statusCode, 200, 'the mobile given with the order works too, however it is typed');

  const view = JSON.stringify(byEmail.body);
  assert.ok(!/example\.com|Ankadakatte|Kundapur|576222/.test(view), 'no email or address leaves the server');
  assert.ok(!/1191|6001234567/.test(view), 'the seller’s order number is never shown');
});

test('a wrong contact, no contact, or an unknown number are refused in the same words', async () => {
  const { order } = await payFor();
  const wrong = await track('id=' + order.pfaOrderId + '&contact=stranger@example.com');
  const missing = await track('id=' + order.pfaOrderId);
  const unknown = await track('id=PFA-ST-ZZZZZZZZ&contact=karthik@example.com');
  assert.equal(wrong.statusCode, 404);
  assert.equal(missing.statusCode, 400);
  assert.equal(unknown.statusCode, 404);
  assert.equal(wrong.body.message, unknown.body.message, 'a stranger cannot learn that the number is real');
});

test('the seller’s webhooks find the same record, so tracking shows the courier under PFA’s number', async () => {
  const { order } = await payFor();
  const created = await ORDERS.upsertFromWebhook('orders/create', shopifyOrder(order.pfaOrderId), 'wh-create');
  assert.equal(created.record.pfaOrderId, order.pfaOrderId, 'the mirror carries PFA’s id, not a second one');
  assert.equal(created.record.directPay, true);

  await ORDERS.upsertFromWebhook('orders/fulfilled', {
    id: Number(SHOPIFY_ORDER_ID), fulfillment_status: 'fulfilled',
    fulfillments: [{ id: 5551, status: 'in_transit', tracking_company: 'Delhivery', tracking_number: 'DL123', tracking_url: 'https://delhivery.com/track/DL123' }]
  }, 'wh-fulfil');

  const shipped = await track('id=' + order.pfaOrderId + '&contact=karthik@example.com');
  assert.equal(shipped.body.status, 'FULFILLED');
  assert.ok(shipped.body.shippedAt);
  assert.deepEqual(shipped.body.tracking, { status: 'in_transit', company: 'Delhivery', number: 'DL123', url: 'https://delhivery.com/track/DL123' });

  const record = await payments.get(order.pfaOrderId);
  assert.equal(record.shopifyOrderId, SHOPIFY_ORDER_ID);
  assert.equal(record.mirror.status, 'FULFILLED');
});

test('an order created in Shopify whose confirmation never reached PFA is marked placed by the seller’s own webhook', async () => {
  const { order } = await payFor();
  /* What a timeout after the create looks like from PFA’s side. */
  await payments.put(order.pfaOrderId, { status: 'PLACEMENT_FAILED', shopifyOrderId: '', placementAttempts: 1, lastError: 'SHOPIFY_NETWORK_ERROR' });
  await ORDERS.upsertFromWebhook('orders/create', shopifyOrder(order.pfaOrderId), 'wh-late');
  const record = await payments.get(order.pfaOrderId);
  assert.equal(record.status, 'PLACED');
  assert.equal(record.shopifyOrderId, SHOPIFY_ORDER_ID);
  assert.equal(record.lastError, '');
});

test('a Shopify order number behind the same prefix is never mistaken for a direct-pay id', () => {
  assert.equal(payments.isDirectPayId('PFA-ST-1191'), false);
  assert.equal(payments.isDirectPayId('PFA-ST-60012345'), false, 'digits 0 and 1 are not in the alphabet');
  assert.equal(payments.isDirectPayId(payments.mintPfaOrderId()), true);
  assert.equal(ORDERS.directPayIdFrom({ note: 'PFA checkout reference: abc', tags: 'x' }), '');
  assert.equal(ORDERS.directPayIdFrom({ note_attributes: [{ name: 'PFA checkout reference', value: 'PFA-ST-1191' }] }), '');
});

test('the browser can ask after its own payment by handle, and is told the id only once it is paid', async () => {
  let rec = recorder();
  await payStart(requestFor(ORDER_BODY, { 'idempotency-key': 'basket-1' }), rec.response);
  const started = await rec.completed;
  const pending = await track('handle=' + started.body.handle);
  assert.equal(pending.statusCode, 200);
  assert.equal(pending.body.paid, false);
  assert.equal(pending.body.pfaOrderId, undefined);

  const sig = crypto.createHmac('sha256', 'rzp_test_secret').update('order_RZP1|pay_X1').digest('hex');
  rec = recorder();
  await payConfirm(requestFor({ handle: started.body.handle, razorpay_order_id: 'order_RZP1', razorpay_payment_id: 'pay_X1', razorpay_signature: sig }), rec.response);
  await rec.completed;

  const paid = await track('handle=' + started.body.handle);
  assert.equal(paid.body.paid, true);
  assert.match(paid.body.pfaOrderId, /^PFA-ST-/);

  const stranger = await track('handle=not-a-real-handle');
  assert.equal(stranger.statusCode, 404);
});

test('the same basket under the same key reuses one Razorpay order; a changed basket does not', async () => {
  let rec = recorder();
  await payStart(requestFor(ORDER_BODY, { 'idempotency-key': 'basket-1' }), rec.response);
  const first = await rec.completed;
  rec = recorder();
  await payStart(requestFor(ORDER_BODY, { 'idempotency-key': 'basket-1' }), rec.response);
  const again = await rec.completed;
  assert.equal(again.body.handle, first.body.handle, 'a retry is the same payment');

  const bigger = Object.assign({}, ORDER_BODY, { lines: [{ variantId: '46608189325487', quantity: 3 }] });
  rec = recorder();
  await payStart(requestFor(bigger, { 'idempotency-key': 'basket-1' }), rec.response);
  const changed = await rec.completed;
  assert.equal(changed.statusCode, 200);
  assert.notEqual(changed.body.handle, first.body.handle, 'a different basket is a different payment');
  assert.equal(changed.body.amount, 112 * 3 + 59);
});

test('the admin Store register lists direct-pay orders, with the customer on them, and flags the ones that need a person', async () => {
  const { order } = await payFor();
  await ORDERS.upsertFromWebhook('orders/create', shopifyOrder(order.pfaOrderId), 'wh-create');
  await ORDERS.upsertFromWebhook('orders/fulfilled', {
    id: Number(SHOPIFY_ORDER_ID), fulfillment_status: 'fulfilled',
    fulfillments: [{ id: 5551, status: 'success', tracking_company: 'Delhivery', tracking_number: 'DL123', tracking_url: 'https://delhivery.com/track/DL123' }]
  }, 'wh-fulfil');
  const stuck = payments.mintPfaOrderId();
  await payments.put(stuck, { status: 'PLACEMENT_FAILED', email: 'other@example.com', name: 'Other Person', total: 500, currency: 'INR', items: [{ title: 'Thing', quantity: 1 }], createdAt: '2026-08-30T10:00:00.000Z', placementAttempts: 3 });

  /* The register over the in-memory records, in the shape Firestore hands the route. */
  const mirrors = [...ORDERS._private.memory.orders.entries()];
  const fakeDb = {
    collection(name) {
      const rows = name === 'storePayments'
        ? [...payments._private.memory.values()].map((d) => ({ id: d.pfaOrderId, exists: true, data: () => d }))
        : name === 'storeOrders' ? mirrors.map(([id, d]) => ({ id, exists: true, data: () => d })) : [];
      /* Equality filters are honoured, so a search by email is a search. */
      const filters = [];
      const q = {
        where(field, op, value) { filters.push([field, value]); return q; },
        orderBy() { return q; }, startAfter() { return q; }, limit() { return q; },
        async get() {
          const docs = rows.filter((r) => filters.every(([f, v]) => r.data()[f] === v));
          return { docs, empty: !docs.length };
        },
        doc(id) { const hit = rows.find((r) => r.id === id); return { async get() { return hit || { exists: false }; } }; }
      };
      return q;
    }
  };

  const page = await records._private.storeRegister(fakeDb, { term: '', limit: 25, cursor: '' });
  const ids = page.rows.map((r) => r.pfaOrderId);
  assert.deepEqual(ids.sort(), [order.pfaOrderId, stuck].sort(), 'one row per order, the mirror folded into the PFA record');

  const paidRow = page.rows.find((r) => r.pfaOrderId === order.pfaOrderId);
  assert.equal(paidRow.source, 'direct');
  assert.equal(paidRow.email, 'karthik@example.com', 'the customer, not the relay address');
  assert.equal(paidRow.status, 'FULFILLED');
  assert.equal(paidRow.orderNumber, '1191', 'the seller’s number is there for the office');
  assert.match(paidRow.tracking, /Delhivery DL123/);

  const stuckRow = page.rows.find((r) => r.pfaOrderId === stuck);
  assert.equal(stuckRow.status, 'CONFIRMED', 'to the customer it is paid');
  assert.equal(stuckRow.paymentStatus, 'PLACEMENT_FAILED');
  assert.match(stuckRow.attention, /not yet placed with the seller/);

  const found = await records._private.storeRegister(fakeDb, { term: order.pfaOrderId.toLowerCase(), limit: 25, cursor: '' });
  assert.equal(found.rows.length, 1, 'searchable by the number the customer quotes');
  const byEmail = await records._private.storeRegister(fakeDb, { term: 'other@example.com', limit: 25, cursor: '' });
  assert.equal(byEmail.rows.length, 1, 'and by the customer’s email');
});
