'use strict';

/* The shop's CCAvenue answer (8 Oct 2026, reviews B5 and D1).

   B5: a paid order is filed as a case (submissions/<order number>) on every
   paid answer. It used to be filed only by the answer that settled the
   order, so one failed write meant it was never filed: the redelivery found
   the order already paid and moved on.

   D1: a verified Success for an order already cancelled or failed settles
   it. A shopper who cancels at CCAvenue, presses Back and pays from the same
   transfer page pays the same order number; the answer used to be ignored
   and the shopper told "No money was taken" for money that was. Donations
   already accept a success after a failure. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const backend = require('../lib/shop-backend');
const caregiverMail = require('../lib/caregiver-mail');
const C = require('../lib/ccavenue');

const KEY = 'TESTWORKINGKEY0123456789ABCDEF00';
const SHOPPER = { name: 'Meera Shah', mobile: '9876543210', email: 'meera@example.com', address: 'Flat 4, Shanti Niwas, FC Road', state: 'Maharashtra', district: 'Pune', pincode: '411004' };

/* The order store as the shop uses it, with update times and preconditions
   (the same double test/shop.test.js uses). */
function memory() {
  const docs = new Map();
  let clock = 0;
  return {
    docs,
    async read(c, id) { const d = docs.get(`${c}/${id}`); return d ? { data: JSON.parse(JSON.stringify(d.data)), updateTime: d.updateTime } : null; },
    async commit(writes) {
      for (const w of writes) {
        if (!w.set) continue;
        const d = docs.get(w.set.join('/'));
        if (w.ifUpdateTime && (!d || d.updateTime !== w.ifUpdateTime)) return { ok: false, conflict: true };
        if (w.mustNotExist && d) return { ok: false, conflict: true };
      }
      for (const w of writes) {
        const key = (w.set || w.increment).join('/');
        const d = docs.get(key) || { data: {}, updateTime: '' };
        if (w.set) Object.assign(d.data, JSON.parse(JSON.stringify(w.data)));
        else for (const [k, n] of Object.entries(w.by)) d.data[k] = (Number(d.data[k]) || 0) + n;
        d.updateTime = `t${++clock}`;
        docs.set(key, d);
      }
      return { ok: true };
    }
  };
}

const post = (body) => ({ method: 'POST', url: '/api/shop', headers: { 'content-type': 'application/x-www-form-urlencoded', host: 'peopleforanimalsindia.org' }, body: new URLSearchParams(body).toString() });
const res = () => ({ statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = String(b || ''); } });

let store;
let db;
let sent;
const realDeliver = caregiverMail.deliver;
const realConfigured = caregiverMail.isConfigured;

test.beforeEach(() => {
  Object.assign(process.env, { CCAVENUE_MERCHANT_ID: '123456', CCAVENUE_ACCESS_CODE: 'AVTEST', CCAVENUE_WORKING_KEY: KEY, PUBLIC_SITE_URL: 'https://peopleforanimalsindia.org' });
  delete process.env.PFA_SHOP_ORDERS_EMAIL;
  store = memory();
  backend.use(store);
  db = memoryFirestore();
  firebase._setDbForTests(db);
  sent = [];
  caregiverMail.deliver = async (m) => { sent.push(m); return { providerId: `p${sent.length}` }; };
  caregiverMail.isConfigured = () => true;
});

test.afterEach(() => {
  backend.use(null);
  firebase._setDbForTests(null);
  caregiverMail.deliver = realDeliver;
  caregiverMail.isConfigured = realConfigured;
});

async function checkout(items) {
  const r = res();
  await require('../lib/routes/shop/checkout')(post({ items: JSON.stringify(items), ...SHOPPER }), r);
  const m = /name="encRequest" value="([0-9a-f]+)"/.exec(r.body);
  assert.ok(m, r.body.slice(0, 300));
  return Object.fromEntries(new URLSearchParams(C.decrypt(m[1], KEY)));
}

async function answer(sentOut, over) {
  const v = { order_id: sentOut.order_id, order_status: 'Success', amount: sentOut.amount, merchant_id: '123456', tracking_id: '310000000002', bank_ref_no: 'BRN9', payment_mode: 'UPI', ...(over || {}) };
  const r = res();
  await require('../lib/routes/shop/response')(post({ encResp: C.encrypt(new URLSearchParams(v).toString(), KEY) }), r);
  return r;
}

const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const title = (r) => (/<h1>([^<]+)<\/h1>/.exec(r.body) || [])[1];

test('B5: a paid order whose case write fails once is filed by the next answer', async () => {
  const out = await checkout([{ id: '21', colour: 'Red', size: 'XL', qty: 1 }]);
  const original = db.collection;
  let failOnce = true;
  db.collection = (name) => {
    const c = original(name);
    if (name !== 'submissions') return c;
    const doc = c.doc;
    c.doc = (id) => { const d = doc(id); const create = d.create; d.create = async (v) => { if (failOnce) { failOnce = false; throw Object.assign(new Error('14 UNAVAILABLE'), { code: 14 }); } return create(v); }; return d; };
    return c;
  };
  const first = await quiet(() => answer(out));
  db.collection = original;
  assert.match(first.body, /Order placed/);
  assert.equal(db.dump()[`submissions/${out.order_id}`], undefined, 'the first write failed');

  const second = await answer(out);
  assert.match(second.body, /Order placed/);
  const record = db.dump()[`submissions/${out.order_id}`];
  assert.ok(record, 'the case is filed by the redelivered answer');
  assert.equal(record.kind, 'PFA-SHP');
  assert.equal(record.fields.email, 'meera@example.com');
  assert.equal(sent.filter((m) => m.template === 'shop_order_confirmed').length, 1, 'the shopper is still confirmed once');
});

test('D1: cancelled at CCAvenue, then paid from the same page: the order is paid, the stock held again, the shopper told so', async () => {
  const out = await checkout([{ id: '23', size: 'L', qty: 1 }]);
  assert.equal(store.docs.get('stock/23__L').data.remaining, 98);
  const cancelled = await answer(out, { order_status: 'Aborted', bank_ref_no: '' });
  assert.match(cancelled.body, /Payment cancelled/);
  assert.equal(store.docs.get('stock/23__L').data.remaining, 99, 'the cancellation gave the piece back');

  const paid = await answer(out);
  assert.equal(title(paid), 'Thank you, Meera.');
  assert.doesNotMatch(paid.body, /No money was taken/);
  const order = store.docs.get(`orders/${out.order_id}`).data;
  assert.equal(order.status, 'paid');
  assert.equal(order.settledAfter, 'cancelled');
  assert.equal(order.needsAttention, false);
  assert.equal(order.fulfilment, 'pending');
  assert.deepEqual(order.stockReserved, [{ key: '23__L', qty: 1 }]);
  assert.equal(store.docs.get('stock/23__L').data.remaining, 98, 'the piece is held for this order again');
  assert.deepEqual(store.docs.get('aggregates/store').data, { orders: 1, revenue: 2650 });
  assert.equal(db.dump()[`transactions/${out.order_id}`].status, 'success', 'the Payments line says paid');
  assert.ok(db.dump()[`submissions/${out.order_id}`], 'and the case is filed');
  assert.equal(sent.filter((m) => m.template === 'shop_order_confirmed').length, 1);

  const again = await answer(out);
  assert.equal(title(again), 'Thank you, Meera.');
  assert.deepEqual(store.docs.get('aggregates/store').data, { orders: 1, revenue: 2650 }, 'counted once');
  assert.equal(store.docs.get('stock/23__L').data.remaining, 98, 'held once');
  assert.equal(sent.filter((m) => m.template === 'shop_order_confirmed').length, 1, 'confirmed once');
});

test('D1: paid after a cancellation, the piece sold meanwhile: recorded as paid, flagged for staff, never below zero', async () => {
  const out = await checkout([{ id: '38', size: 'XL', qty: 2 }]);
  await answer(out, { order_status: 'Aborted' });
  assert.equal(store.docs.get('stock/38__XL').data.remaining, 99);
  await store.commit([{ set: ['stock', '38__XL'], data: { remaining: 1 } }]);   // other shoppers bought all but one

  const paid = await answer(out);
  assert.equal(title(paid), 'Thank you, Meera.', 'the shopper paid, and is told so');
  assert.match(paid.body, /sold out while your payment was being confirmed/);
  const order = store.docs.get(`orders/${out.order_id}`).data;
  assert.equal(order.status, 'paid');
  assert.equal(order.needsAttention, true);
  assert.match(order.attentionNote, /Short: 1 of 38__XL/);
  assert.match(order.attentionNote, /source the piece or refund/);
  assert.deepEqual(order.stockShort, [{ key: '38__XL', qty: 1 }]);
  assert.deepEqual(order.stockReserved, [{ key: '38__XL', qty: 1 }], 'the one piece left is held for it');
  assert.equal(store.docs.get('stock/38__XL').data.remaining, 0, 'never below zero');
  const ledger = db.dump()[`transactions/${out.order_id}`];
  assert.equal(ledger.status, 'success');
  assert.equal(ledger.needsAttention, true, 'the Payments line carries the flag');
});

test('D1: a Success that does not verify after a cancellation is held for a check, never "No money was taken"', async () => {
  const out = await checkout([{ id: '37', size: 'L', qty: 1 }]);
  await answer(out, { order_status: 'Aborted' });
  const page = await answer(out, { amount: '1.00' });
  assert.match(page.body, /needs a check/);
  assert.doesNotMatch(page.body, /No money was taken/);
  assert.equal(store.docs.get(`orders/${out.order_id}`).data.status, 'verification_failed');
  assert.equal(store.docs.get('stock/37__L').data.remaining, 99, 'nothing held for an unverified payment');
  assert.equal(store.docs.has('aggregates/store'), false, 'nothing counted as revenue');
});

test('the status mapping stands: a failure after a cancellation changes nothing and files nothing', async () => {
  const out = await checkout([{ id: '36', size: 'L', qty: 1 }]);
  await answer(out, { order_status: 'Aborted' });
  const page = await answer(out, { order_status: 'Failure' });
  assert.match(page.body, /Payment cancelled/);
  assert.equal(store.docs.get(`orders/${out.order_id}`).data.status, 'cancelled');
  assert.equal(db.dump()[`submissions/${out.order_id}`], undefined);
  assert.equal(sent.length, 0);
});
