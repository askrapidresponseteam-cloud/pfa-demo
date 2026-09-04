'use strict';

/* The four routes, driven as handlers. These are about the edges the unit tests
   cannot reach: the feature switch, what the browser is and is not told, what a
   forged webhook gets, and whether a stuck order is actually chased. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');

const payments = require('../lib/store-payments');
const payStart = require('../lib/routes/pfa-pay-start');
const payConfirm = require('../lib/routes/pfa-pay-confirm');
const rzpWebhook = require('../lib/routes/webhooks/razorpay');
const reconcile = require('../lib/routes/pfa-store-reconcile');

const nativeFetch = global.fetch;

const ORDER_BODY = {
  lines: [{ variantId: '46608189325487', quantity: 1 }],
  customer: { name: 'Karthik Dhanya', email: 'karthik@example.com', phone: '8105250299' },
  shippingAddress: {
    name: 'Karthik Dhanya', phone: '8105250299',
    address1: '4/232 Ashraya Ankadakatte', city: 'Kundapur',
    province: 'Karnataka', zip: '576222'
  },
  deliveryCode: 'Standard'
};

function requestFor(body, headers = {}) {
  const request = new EventEmitter();
  request.method = 'POST';
  request.headers = Object.assign({ 'x-forwarded-for': '203.0.113.10' }, headers);
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8');
  process.nextTick(() => { request.emit('data', raw); request.emit('end'); });
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

/* Shopify Storefront answers for pricing and for rates; Razorpay answers for
   the order. One stub, routed by URL and query name. */
function network(opts = {}) {
  const calls = [];
  return async function (url, options) {
    const u = String(url);
    const sent = options && options.body ? JSON.parse(options.body) : {};
    calls.push({ url: u, sent });
    if (/api\.razorpay\.com\/v1\/orders/.test(u)) {
      return { ok: true, async json() { return { id: 'order_RZP1', amount: sent.amount, currency: 'INR', receipt: sent.receipt }; } };
    }
    if (/graphql\.json/.test(u)) {
      if (/PfaPrice/.test(sent.query)) {
        return { ok: true, async json() {
          return { data: { nodes: [{
            id: 'gid://shopify/ProductVariant/46608189325487',
            title: 'Default Title',
            availableForSale: !opts.outOfStock,
            price: { amount: '112.00', currencyCode: 'INR' },
            product: { title: 'Alembic Mectin Tablet 10mg' }
          }] } };
        } };
      }
      /* PfaQuoteCart */
      return { ok: true, async json() {
        return { data: { cartCreate: { cart: { id: 'gid://shopify/Cart/c1', deliveryGroups: { nodes: opts.noRates ? [] : [{
          id: 'gid://shopify/CartDeliveryGroup/dg1',
          deliveryOptions: [
            { handle: 'h-std', code: 'Standard', title: 'Standard (Prepaid)', description: '3 to 5 business days', estimatedCost: { amount: '59.0', currencyCode: 'INR' } },
            { handle: 'h-exp', code: 'Express', title: 'Express', description: '2 to 3 business days', estimatedCost: { amount: '109.0', currencyCode: 'INR' } }
          ]
        }] } }, userErrors: [] } } };
      } };
    }
    return { ok: true, async json() { return {}; } };
  };
}

test.beforeEach(() => {
  payments.resetForTests();
  process.env.PFA_STORE_DIRECT_PAY = '1';
  process.env.PFA_RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.PFA_RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  process.env.PFA_RAZORPAY_WEBHOOK_SECRET = 'hook_secret';
  process.env.PFA_SHOPIFY_STORE_DOMAIN = 'sg37v1-ta.myshopify.com';
  process.env.PFA_SHOPIFY_STOREFRONT_API_VERSION = '2026-07';
  process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'storefront-token';
  process.env.PFA_ADMIN_TOKEN = 'admin-token';
  process.env.PFA_SHOPIFY_ADMIN_TOKEN = 'shpat_test';
  delete process.env.PFA_MAIL_API_KEY;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
});

test.afterEach(() => {
  global.fetch = nativeFetch;
  delete process.env.PFA_STORE_DIRECT_PAY;
  delete process.env.PFA_RAZORPAY_KEY_ID;
  delete process.env.PFA_RAZORPAY_KEY_SECRET;
  delete process.env.PFA_RAZORPAY_WEBHOOK_SECRET;
  delete process.env.PFA_ADMIN_TOKEN;
  delete process.env.PFA_SHOPIFY_ADMIN_TOKEN;
});

async function start(body = ORDER_BODY, headers) {
  const rec = recorder();
  await payStart(requestFor(body, headers), rec.response);
  return rec.completed;
}

/* ---------------- the switch ---------------- */

test('direct pay is on as soon as it is configured, without a further opt-in', async () => {
  /* The old behaviour needed PFA_STORE_DIRECT_PAY=1 on top of the keys, so a
     fully configured deployment still sent shoppers to the seller's checkout
     because one more variable had not been set. */
  delete process.env.PFA_STORE_DIRECT_PAY;
  global.fetch = network();
  const res = await start();
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.razorpayOrderId);
});

test('the kill switch forces the old path back without removing any keys', async () => {
  process.env.PFA_STORE_DIRECT_PAY = '0';
  global.fetch = network();
  const res = await start();
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'DIRECT_PAY_DISABLED');
});

test('missing keys fall back rather than half-working', async () => {
  delete process.env.PFA_RAZORPAY_KEY_ID;
  global.fetch = network();
  const res = await start();
  assert.equal(res.body.code, 'DIRECT_PAY_DISABLED');
});

test('keys without an admin token still fall back, because a payment needs somewhere to go', async () => {
  delete process.env.PFA_SHOPIFY_ADMIN_TOKEN;
  global.fetch = network();
  const res = await start();
  assert.equal(res.body.code, 'DIRECT_PAY_DISABLED');
});

test('a GET says whether direct pay is on, and names what is missing', async () => {
  delete process.env.PFA_RAZORPAY_KEY_SECRET;
  const rec = recorder();
  const request = new EventEmitter();
  request.method = 'GET';
  request.headers = {};
  process.nextTick(() => { request.emit('end'); });
  await payStart(request, rec.response);
  const res = await rec.completed;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.directPay, 'off');
  assert.ok(res.body.missing.includes('PFA_RAZORPAY_KEY_SECRET'));
  assert.match(res.body.build, /^v[0-9.]+$/, 'and which build is answering');
  /* Names only. A health check that leaks a key is worse than no health check. */
  assert.equal(JSON.stringify(res.body).includes('rzp_test_key'), false);
});

/* ---------------- opening a payment ---------------- */

test('the amount charged is built from Shopify\u2019s prices and Shopify\u2019s rate', async () => {
  global.fetch = network();
  const res = await start();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.summary.itemsTotal, 112);
  assert.equal(res.body.summary.shipping, 59);
  assert.equal(res.body.amount, 171);
  assert.equal(res.body.summary.deliveryTitle, 'Standard (Prepaid)');
});

test('a price posted by the browser is ignored entirely', async () => {
  global.fetch = network();
  const res = await start(Object.assign({}, ORDER_BODY, {
    lines: [{ variantId: '46608189325487', quantity: 1, price: 1, unitPrice: 1 }],
    total: 1, shipping: 0
  }));
  assert.equal(res.body.amount, 171, 'the server priced it, not the page');
});

test('the browser is never given the PFA order id when a payment opens', async () => {
  global.fetch = network();
  const res = await start();
  assert.equal(res.body.pfaOrderId, undefined);
  assert.equal(JSON.stringify(res.body).includes('PFA-ST-'), false);
  assert.ok(res.body.handle && res.body.handle.length >= 24, 'only an opaque handle');
});

test('the Razorpay order is opened in paise for the exact total', async () => {
  const calls = [];
  const net = network();
  global.fetch = async (u, o) => { calls.push({ u: String(u), body: o && o.body ? JSON.parse(o.body) : null }); return net(u, o); };
  await start();
  const opened = calls.find((c) => /v1\/orders/.test(c.u));
  assert.equal(opened.body.amount, 17100);
  assert.equal(opened.body.currency, 'INR');
  assert.match(opened.body.receipt, /^PFA-ST-/);
  assert.equal(opened.body.payment_capture, 1);
});

test('an item that just sold out stops the payment before it opens', async () => {
  global.fetch = network({ outOfStock: true });
  const res = await start();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'OUT_OF_STOCK');
  assert.match(res.body.message, /Nothing has been charged/);
});

test('a delivery option the seller no longer offers is refused, not guessed', async () => {
  global.fetch = network();
  const res = await start(Object.assign({}, ORDER_BODY, { deliveryCode: 'Overnight Drone' }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'DELIVERY_NOT_OFFERED');
  assert.equal(res.body.options.length, 2, 'and the real options are handed back');
});

test('no rates at all stops the payment rather than shipping for free', async () => {
  global.fetch = network({ noRates: true });
  const res = await start();
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'NO_DELIVERY_RATES');
});

test('a double-pressed button reuses one Razorpay order', async () => {
  const calls = [];
  const net = network();
  global.fetch = async (u, o) => { calls.push(String(u)); return net(u, o); };
  const a = await start(ORDER_BODY, { 'idempotency-key': 'same-attempt' });
  const b = await start(ORDER_BODY, { 'idempotency-key': 'same-attempt' });
  assert.equal(a.body.handle, b.body.handle);
  assert.equal(calls.filter((u) => /v1\/orders/.test(u)).length, 1, 'one Razorpay order, not two');
});

/* ---------------- confirming ---------------- */

function signature(orderId, paymentId, secret = 'rzp_test_secret') {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

async function confirm(body) {
  const rec = recorder();
  await payConfirm(requestFor(body), rec.response);
  return rec.completed;
}

test('a confirmation with a bad signature is refused and creates nothing', async () => {
  global.fetch = network();
  const opened = await start();
  const res = await confirm({
    handle: opened.body.handle,
    razorpay_order_id: 'order_RZP1',
    razorpay_payment_id: 'pay_X',
    razorpay_signature: 'forged'
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_SIGNATURE');
  assert.equal(res.body.order, undefined);
});

test('an unknown handle is refused', async () => {
  const res = await confirm({
    handle: 'nonsense', razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's'
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'UNKNOWN_ORDER');
});

test('an incomplete confirmation is refused before anything is looked up', async () => {
  const res = await confirm({ handle: 'x' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INCOMPLETE_CONFIRMATION');
});

/* ---------------- the webhook ---------------- */

/* A real Readable, because the webhook reads the raw bytes off the stream to
   check the signature. An EventEmitter would silently deliver an empty body and
   the test would pass or fail for the wrong reason. */
function hookRequest(event, secret = 'hook_secret') {
  const raw = Buffer.from(JSON.stringify(event), 'utf8');
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const request = Readable.from([raw]);
  request.method = 'POST';
  request.headers = { 'x-razorpay-signature': sig };
  return request;
}

async function hook(request) {
  const rec = recorder();
  await rzpWebhook(request, rec.response);
  return rec.completed;
}

const CAPTURED = {
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_HOOK1', order_id: 'order_RZP1', notes: { pfa_order_id: 'PFA-ST-HOOKTEST' } } } }
};

test('a forged webhook is refused with no detail', async () => {
  const res = await hook(hookRequest(CAPTURED, 'wrong-secret'));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.received, false);
});

test('a webhook with no secret configured refuses everything', async () => {
  delete process.env.PFA_RAZORPAY_WEBHOOK_SECRET;
  const res = await hook(hookRequest(CAPTURED));
  assert.equal(res.statusCode, 503);
});

test('an event this endpoint does not handle is acknowledged, not retried forever', async () => {
  const res = await hook(hookRequest({ event: 'payment.failed', payload: {} }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ignored, 'payment.failed');
});

test('a webhook for an order PFA does not know is acknowledged and logged', async () => {
  const res = await hook(hookRequest(CAPTURED));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ignored, 'UNKNOWN_ORDER');
});

test('the PFA order id is found from notes, order notes or the receipt', () => {
  const from = rzpWebhook._private.pfaOrderIdFrom;
  assert.equal(from({ payload: { payment: { entity: { notes: { pfa_order_id: 'PFA-ST-A' } } } } }), 'PFA-ST-A');
  assert.equal(from({ payload: { order: { entity: { notes: { pfa_order_id: 'PFA-ST-B' } } } } }), 'PFA-ST-B');
  assert.equal(from({ payload: { order: { entity: { receipt: 'PFA-ST-C' } } } }), 'PFA-ST-C');
  assert.equal(from({ payload: {} }), '');
});

/* ---------------- the reconciler ---------------- */

async function runReconcile(headers) {
  const rec = recorder();
  const request = new EventEmitter();
  request.method = 'POST';
  request.headers = headers || {};
  process.nextTick(() => { request.emit('data', '{}'); request.emit('end'); });
  await reconcile(request, rec.response);
  return rec.completed;
}

test('the reconciler refuses without the admin token', async () => {
  const res = await runReconcile({});
  assert.equal(res.statusCode, 401);
});

test('the reconciler reports a clean run when nothing is stuck', async () => {
  const res = await runReconcile({ authorization: 'Bearer admin-token' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.checked, 0);
  assert.deepEqual(res.body.exhausted, []);
});

test('the reconciler picks up a paid order that never reached the seller', async () => {
  await payments.put('PFA-ST-STUCK1', {
    status: 'PLACEMENT_FAILED', pfaOrderId: 'PFA-ST-STUCK1',
    razorpayPaymentId: 'pay_1', razorpayOrderId: 'order_1',
    total: 171, placementAttempts: 2, email: 'a@b.com'
  });
  assert.equal(reconcile._private.needsWork(await payments.get('PFA-ST-STUCK1')), true);
});

test('an order that has run out of retries is reported instead of retried forever', async () => {
  await payments.put('PFA-ST-DEAD1', {
    status: 'PLACEMENT_FAILED', pfaOrderId: 'PFA-ST-DEAD1',
    razorpayPaymentId: 'pay_2', total: 171,
    placementAttempts: reconcile._private.MAX_PLACEMENT_ATTEMPTS
  });
  const res = await runReconcile({ authorization: 'Bearer admin-token' });
  assert.deepEqual(res.body.exhausted, ['PFA-ST-DEAD1']);
  assert.equal(res.body.placed, 0);
});

test('an unpaid order is never touched by the reconciler', () => {
  assert.equal(reconcile._private.needsWork({ status: 'PENDING_PAYMENT', emailPending: true }), false);
});

/* ---------------- the whole way through ---------------- */

test('a real payment goes start \u2192 Razorpay \u2192 confirm and comes back a PFA order', async () => {
  const placed = [];
  const net = network();
  global.fetch = async (u, o) => {
    const url = String(u);
    if (/admin\/api\/.*graphql/.test(url)) {
      const sent = JSON.parse(o.body);
      if (/PfaFindOrder/.test(sent.query)) return { ok: true, async json() { return { data: { orders: { nodes: [] } } }; } };
      placed.push(sent.variables);
      return { ok: true, async json() {
        return { data: { orderCreate: { order: { id: 'gid://shopify/Order/5551212', name: '#1001', legacyResourceId: '5551212' }, userErrors: [] } } };
      } };
    }
    if (/v1\/payments\//.test(url)) {
      return { ok: true, async json() { return { id: 'pay_REAL1', order_id: 'order_RZP1', status: 'captured', amount: 17100, currency: 'INR', method: 'upi' }; } };
    }
    return net(u, o);
  };
  process.env.PFA_SHOPIFY_ADMIN_TOKEN = 'shpat_test';

  const opened = await start();
  assert.equal(opened.body.amount, 171);

  const res = await confirm({
    handle: opened.body.handle,
    razorpay_order_id: 'order_RZP1',
    razorpay_payment_id: 'pay_REAL1',
    razorpay_signature: signature('order_RZP1', 'pay_REAL1')
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.code, 'CONFIRMED');
  assert.match(res.body.order.pfaOrderId, /^PFA-ST-[2-9A-Z]{8}$/, 'the shopper gets a PFA number');
  assert.equal(res.body.order.paid, true);
  assert.equal(res.body.order.total, 171);

  /* Nothing of the seller's reaches the shopper. */
  const shown = JSON.stringify(res.body);
  assert.equal(shown.includes('5551212'), false, 'no Shopify order id');
  assert.equal(shown.includes('#1001'), false, 'no Shopify order number');
  assert.equal(shown.includes('order_RZP1'), false, 'no gateway order id');

  /* And Shopify got the relay address, the receipt suppressed, and the tag. */
  const order = placed[0].order;
  assert.match(order.email, /^orders\+PFA-ST-[2-9A-Z]{8}@/);
  assert.equal(order.email.includes('karthik@example.com'), false);
  assert.equal(placed[0].options.sendReceipt, false);
  assert.equal(placed[0].options.sendFulfillmentReceipt, false);
  assert.equal(placed[0].options.inventoryBehaviour, 'DECREMENT_OBEYING_POLICY');
  assert.ok(order.tags.includes(res.body.order.pfaOrderId), 'tagged for idempotent lookup');
  assert.equal(order.transactions[0].amountSet.shopMoney.amount, '171.00');
  assert.equal(order.shippingLines[0].priceSet.shopMoney.amount, '59.00');
  delete process.env.PFA_SHOPIFY_ADMIN_TOKEN;
});

test('confirming twice returns the same order and places nothing new', async () => {
  let creates = 0;
  const net = network();
  global.fetch = async (u, o) => {
    const url = String(u);
    if (/admin\/api\/.*graphql/.test(url)) {
      const sent = JSON.parse(o.body);
      if (/PfaFindOrder/.test(sent.query)) return { ok: true, async json() { return { data: { orders: { nodes: [] } } }; } };
      creates++;
      return { ok: true, async json() {
        return { data: { orderCreate: { order: { id: 'gid://shopify/Order/1', name: '#1', legacyResourceId: '1' }, userErrors: [] } } };
      } };
    }
    if (/v1\/payments\//.test(url)) {
      return { ok: true, async json() { return { id: 'pay_REAL1', order_id: 'order_RZP1', status: 'captured', amount: 17100, currency: 'INR', method: 'upi' }; } };
    }
    return net(u, o);
  };
  process.env.PFA_SHOPIFY_ADMIN_TOKEN = 'shpat_test';
  const opened = await start();
  const body = {
    handle: opened.body.handle,
    razorpay_order_id: 'order_RZP1',
    razorpay_payment_id: 'pay_REAL1',
    razorpay_signature: signature('order_RZP1', 'pay_REAL1')
  };
  const first = await confirm(body);
  const second = await confirm(body);
  assert.equal(creates, 1, 'one Shopify order for one payment');
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.order.pfaOrderId, first.body.order.pfaOrderId);
  delete process.env.PFA_SHOPIFY_ADMIN_TOKEN;
});
