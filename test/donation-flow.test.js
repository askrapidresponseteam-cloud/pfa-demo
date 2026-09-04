'use strict';

/* A donation, walked from the form to the bank and back, through the real
 * handlers. What the page says at the end, what the record says, and what the
 * donor is sent - for a payment that succeeded, one that failed, one the person
 * cancelled, and one where the amount coming back is not the amount that went
 * out. Also that CCAvenue delivering the same success twice, which it does,
 * produces one receipt and not two.
 *
 * Until this existed no test drove /api/payment/create or /api/payment/response
 * as handlers, and nothing noticed that a donor who was asked for "a valid email
 * for the receipt" was never sent one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const firebase = require('../lib/firebase');
const caregiverMail = require('../lib/caregiver-mail');
const { encrypt, decrypt, encodeMerchantData, decodeMerchantData } = require('../lib/ccavenue');
const create = require('../lib/routes/payment/create');
const respond = require('../lib/routes/payment/response');

const WORKING_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
const MERCHANT = '123456';

/* Just enough Firestore: documents with get/create/set/update, and a
   transaction whose get/set/update act on the same store. */
function fakeDb() {
  const store = new Map();
  const key = (c, id) => `${c}/${id}`;
  const docRef = (c, id) => ({
    id,
    async get() { const data = store.get(key(c, id)); return { exists: Boolean(data), id, data: () => data }; },
    async create(data) {
      if (store.has(key(c, id))) { const e = new Error('Document already exists'); e.code = 6; throw e; }
      store.set(key(c, id), Object.assign({}, data));
    },
    async set(data, opts) {
      const prev = (opts && opts.merge && store.get(key(c, id))) || {};
      store.set(key(c, id), Object.assign({}, prev, data));
    },
    async update(data) {
      if (!store.has(key(c, id))) throw new Error('No document to update');
      store.set(key(c, id), Object.assign({}, store.get(key(c, id)), data));
    }
  });
  return {
    store,
    collection: (c) => ({ doc: (id) => docRef(c, id) }),
    async runTransaction(fn) {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, opts) => { ref.set(data, opts); },
        create: (ref, data) => { ref.create(data); },
        update: (ref, data) => { ref.update(data); }
      };
      return fn(tx);
    }
  };
}

function request(body, { method = 'POST', url = '/api/payment/create', headers = {} } = {}) {
  return { method, url, headers: Object.assign({ host: 'pfa.test' }, headers), body };
}

function recorder() {
  const headers = {};
  return {
    headers,
    response: {
      statusCode: 200,
      setHeader(n, v) { headers[n] = v; },
      end(raw) { this.html = String(raw || ''); }
    }
  };
}

const DONOR = {
  type: 'donate', currency: 'inr', amount: '1500', terms: 'yes',
  name: 'Asha Kumar', mobile: '9876543210', email: 'Asha@Example.com',
  address: '16 MG Road, Udupi', cause: 'Where it is needed most', pan: 'ABCDE1234F'
};

let db;
let sent;
const realDeliver = caregiverMail.deliver;
const realConfigured = caregiverMail.isConfigured;

test.beforeEach(() => {
  db = fakeDb();
  firebase._setDbForTests(db);
  sent = [];
  caregiverMail.deliver = async (msg) => { sent.push(msg); return { providerId: 'resend_' + sent.length }; };
  caregiverMail.isConfigured = () => true;
  Object.assign(process.env, {
    CCAVENUE_MERCHANT_ID: MERCHANT, CCAVENUE_ACCESS_CODE: 'AVXX', CCAVENUE_WORKING_KEY: WORKING_KEY,
    CCAVENUE_MODE: 'test', PUBLIC_SITE_URL: 'https://pfa.test'
  });
});

test.afterEach(() => {
  firebase._setDbForTests(null);
  caregiverMail.deliver = realDeliver;
  caregiverMail.isConfigured = realConfigured;
  ['CCAVENUE_MERCHANT_ID', 'CCAVENUE_ACCESS_CODE', 'CCAVENUE_WORKING_KEY', 'CCAVENUE_MODE', 'PUBLIC_SITE_URL']
    .forEach((k) => delete process.env[k]);
});

/* Form → /api/payment/create → the hand-off page. Returns what CCAvenue would
   receive, decrypted, which is exactly the request the merchant signed. */
async function start(form = DONOR) {
  const rec = recorder();
  await create(request(form), rec.response);
  assert.equal(rec.response.statusCode, 200, rec.response.html.slice(0, 300));
  const enc = /name="encRequest" value="([0-9a-f]+)"/.exec(rec.response.html);
  assert.ok(enc, 'the hand-off page carries the encrypted request');
  assert.match(rec.response.html, /action="https:\/\/(test|secure)\.ccavenue\.com/);
  return decodeMerchantData(decrypt(enc[1], WORKING_KEY));
}

/* What CCAvenue posts back after the bank. */
async function callback(values) {
  const rec = recorder();
  const encResp = encrypt(encodeMerchantData(values), WORKING_KEY);
  await respond(request({ encResp }, { url: '/api/payment/response' }), rec.response);
  return rec.response.html;
}

function bankSays(sentOut, overrides = {}) {
  return Object.assign({
    order_id: sentOut.order_id, merchant_id: MERCHANT, amount: sentOut.amount, currency: 'INR',
    order_status: 'Success', tracking_id: '31233', bank_ref_no: 'BNK900', payment_mode: 'UPI', status_message: ''
  }, overrides);
}

function transaction(orderId) { return db.store.get(`transactions/${orderId}`); }

test('a donation goes to CCAvenue with the server’s amount, comes back verified, and the donor is sent one receipt', async () => {
  const sentOut = await start();
  assert.match(sentOut.order_id, /^PFA-DON-[A-Z0-9]{8}$/);
  assert.equal(sentOut.amount, '1500.00');
  assert.equal(sentOut.merchant_id, MERCHANT);
  assert.equal(sentOut.redirect_url, 'https://pfa.test/api/payment/response');
  assert.equal(sentOut.cancel_url, sentOut.redirect_url);
  assert.equal(sentOut.billing_email, 'asha@example.com');

  const before = transaction(sentOut.order_id);
  assert.ok(before, 'the transaction is on record before the bank is involved');
  assert.notEqual(before.status, 'success');

  const page = await callback(bankSays(sentOut));
  assert.match(page, /Donation successful/);
  assert.match(page, new RegExp(sentOut.order_id));
  assert.match(page, /A receipt has been emailed to asha@example\.com/);

  const after = transaction(sentOut.order_id);
  assert.equal(after.status, 'success');
  assert.equal(after.ccaVenue.trackingId, '31233');
  assert.equal(after.ccaVenue.bankReference, 'BNK900');
  assert.ok(after.receiptSentAt, 'the receipt is recorded on the transaction');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'asha@example.com');
  assert.equal(sent[0].template, 'payment_received');
  assert.equal(sent[0].payload.orderId, sentOut.order_id);
  assert.equal(sent[0].payload.amount, 1500);
  assert.equal(sent[0].payload.bankReference, 'BNK900');
});

test('CCAvenue delivering the same success twice changes nothing and sends nothing more', async () => {
  const sentOut = await start();
  await callback(bankSays(sentOut));
  const again = await callback(bankSays(sentOut));
  assert.match(again, /Donation successful/, 'the second visit still shows the donor their result');
  assert.equal(sent.length, 1, 'one receipt');
  assert.equal(transaction(sentOut.order_id).status, 'success');
});

test('a failed payment is a failed payment: recorded, shown, and no receipt', async () => {
  const sentOut = await start();
  const page = await callback(bankSays(sentOut, { order_status: 'Failure', status_message: 'Insufficient funds', bank_ref_no: '' }));
  assert.match(page, /Payment was not completed/);
  assert.match(page, /Insufficient funds/);
  assert.equal(transaction(sentOut.order_id).status, 'failed');
  assert.equal(sent.length, 0);
});

test('a payment the person cancelled reads as cancelled, not as an error of theirs', async () => {
  const sentOut = await start();
  const page = await callback(bankSays(sentOut, { order_status: 'Aborted', bank_ref_no: '' }));
  assert.match(page, /Payment was cancelled/);
  assert.equal(transaction(sentOut.order_id).status, 'aborted');
  assert.equal(sent.length, 0);
});

test('a success for a different amount is never treated as success', async () => {
  const sentOut = await start();
  const page = await callback(bankSays(sentOut, { amount: '15.00' }));
  assert.doesNotMatch(page, /Donation successful/);
  assert.equal(transaction(sentOut.order_id).status, 'verification_failed');
  assert.equal(sent.length, 0);
});

test('a success that fails after a real failure is still a success, because the bank is the source of truth', async () => {
  const sentOut = await start();
  await callback(bankSays(sentOut, { order_status: 'Failure' }));
  assert.equal(transaction(sentOut.order_id).status, 'failed');
  const page = await callback(bankSays(sentOut));
  assert.match(page, /Donation successful/);
  assert.equal(transaction(sentOut.order_id).status, 'success');
  assert.equal(sent.length, 1);
});

test('the receipt is a courtesy: a mail provider that hangs does not hold up or fail the page', async () => {
  caregiverMail.deliver = () => new Promise(() => {});
  const sentOut = await start();
  const started = Date.now();
  const page = await callback(bankSays(sentOut));
  assert.ok(Date.now() - started < 4000, 'the page is not held hostage by the mail provider');
  assert.match(page, /Donation successful/);
  assert.doesNotMatch(page, /A receipt has been emailed/);
  assert.equal(transaction(sentOut.order_id).status, 'success');
  assert.equal(transaction(sentOut.order_id).receiptSentAt, undefined);
});

test('a Give/Send order is priced from the catalogue, and its receipt names the items and destination', async () => {
  const sentOut = await start({
    type: 'send', currency: 'inr', terms: 'yes', name: 'Asha Kumar', mobile: '9876543210', email: 'asha@example.com',
    state: 'Karnataka', district: 'Udupi', locality: 'Koteshwara',
    items: JSON.stringify([{ key: 'Rice', quantity: 2 }, { key: 'Poha', quantity: 1 }])
  });
  assert.match(sentOut.order_id, /^PFA-SND-/);
  assert.equal(sentOut.amount, '1420.00', 'the page’s number is never the price');
  const page = await callback(bankSays(sentOut));
  assert.match(page, /Give\/Send order successful/);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.items, /Rice × 2/);
  assert.equal(sent[0].payload.destination, 'Koteshwara, Udupi, Karnataka');
});

test('the same form posted twice under one key is one transaction; a paid key cannot be reused', async () => {
  const headers = { 'idempotency-key': 'donor-once' };
  const first = recorder();
  await create(request(DONOR, { headers }), first.response);
  const second = recorder();
  await create(request(DONOR, { headers }), second.response);
  const a = /name="encRequest" value="([0-9a-f]+)"/.exec(first.response.html)[1];
  const b = /name="encRequest" value="([0-9a-f]+)"/.exec(second.response.html)[1];
  const idA = decodeMerchantData(decrypt(a, WORKING_KEY)).order_id;
  const idB = decodeMerchantData(decrypt(b, WORKING_KEY)).order_id;
  assert.equal(idA, idB, 'a double submit is one PFA transaction');

  await callback(bankSays(decodeMerchantData(decrypt(a, WORKING_KEY))));
  const third = recorder();
  await create(request(DONOR, { headers }), third.response);
  assert.equal(third.response.statusCode, 409);
  assert.match(third.response.html, /already completed/);
});
