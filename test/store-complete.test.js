'use strict';

/* The completion path, which is where the money is. Every test here is about
   one of two promises: the shopper is never charged twice or told the wrong
   thing, and an order that has been paid for never quietly disappears. */

const test = require('node:test');
const assert = require('node:assert/strict');
const payments = require('../lib/store-payments');
const { completePayment } = require('../lib/store-complete');
const mail = require('../lib/store-mail');

const ORDER = {
  status: 'PENDING_PAYMENT',
  pfaOrderId: 'PFA-ST-TESTAAAA',
  razorpayOrderId: 'order_TEST123',
  email: 'karthik@example.com',
  phone: '+918105250299',
  currency: 'INR',
  itemsTotal: 112,
  shipping: 59,
  total: 171,
  deliveryTitle: 'Standard (Prepaid)',
  deliveryCode: 'Standard',
  items: [{ variantId: '46608189325487', quantity: 1, unitPrice: 112, title: 'Alembic Mectin Tablet 10mg' }],
  address: { firstName: 'Karthik', lastName: 'Dhanya', address1: '4/232 Ashraya', city: 'Kundapur', provinceCode: 'KA', zip: '576222', countryCode: 'IN' }
};

/* Fakes that record what they were asked to do, so the assertions are about
   behaviour rather than about whether a mock was called. */
function fakes(overrides = {}) {
  const log = { created: [], mailed: [], refunds: [] };
  return {
    log,
    deps: {
      razorpay: {
        verifyPaymentSignature: () => overrides.badSignature !== true,
        toPaise: (r) => Math.round(Number(r) * 100),
        fetchPayment: async () => {
          if (overrides.verifyThrows) throw new Error('gateway down');
          return {
            id: 'pay_TEST999',
            orderId: 'order_TEST123',
            status: overrides.notCaptured ? 'authorized' : 'captured',
            captured: !overrides.notCaptured,
            amountPaise: overrides.paidPaise != null ? overrides.paidPaise : 17100,
            currency: 'INR',
            method: 'upi'
          };
        }
      },
      shopifyAdmin: {
        createOrder: async (args) => {
          log.created.push(args);
          if (overrides.shopifyFails) throw new Error('422 unprocessable');
          return { alreadyExisted: false, shopifyOrderId: '5551212', shopifyOrderName: '#1001' };
        }
      },
      mail: {
        isConfigured: () => overrides.mailConfigured !== false,
        send: async (record) => { log.mailed.push(record); return overrides.mailFails ? { sent: false, retryable: true, reason: 'MAIL_NETWORK_ERROR' } : { sent: true, providerId: 'em_1' }; }
      }
    }
  };
}

const callback = {
  pfaOrderId: ORDER.pfaOrderId,
  razorpayOrderId: 'order_TEST123',
  razorpayPaymentId: 'pay_TEST999',
  signature: 'sig',
  source: 'browser'
};

test.beforeEach(async () => {
  payments.resetForTests();
  await payments.put(ORDER.pfaOrderId, ORDER);
});

/* ---------------- the happy path ---------------- */

test('a verified payment is placed with the seller and confirmed to the shopper', async () => {
  const f = fakes();
  const out = await completePayment(callback, f.deps);
  assert.equal(out.ok, true);
  assert.equal(out.status, 'PLACED');
  assert.equal(f.log.created.length, 1);
  assert.equal(f.log.mailed.length, 1);
  const rec = await payments.get(ORDER.pfaOrderId);
  assert.equal(rec.shopifyOrderId, '5551212');
});

test('the shopper is shown the PFA number and never the seller\u2019s', async () => {
  const f = fakes();
  const out = await completePayment(callback, f.deps);
  assert.equal(out.view.pfaOrderId, 'PFA-ST-TESTAAAA');
  assert.equal(out.view.shopifyOrderId, undefined);
  assert.equal(out.view.shopifyOrderName, undefined);
  assert.equal(JSON.stringify(out.view).includes('5551212'), false);
  assert.equal(JSON.stringify(out.view).includes('#1001'), false);
});

test('Shopify is given the relay address, not the shopper\u2019s', async () => {
  const f = fakes();
  await completePayment(callback, f.deps);
  const sent = f.log.created[0];
  assert.match(sent.buyer.relayEmail, /^orders\+PFA-ST-TESTAAAA@/);
  assert.notEqual(sent.buyer.relayEmail, ORDER.email);
  assert.equal(JSON.stringify(sent).includes(ORDER.email), false, 'the shopper address must not reach Shopify');
});

test('PFA\u2019s email goes to the shopper\u2019s real address', async () => {
  const f = fakes();
  await completePayment(callback, f.deps);
  assert.equal(f.log.mailed[0].email, ORDER.email);
});

/* ---------------- charged once, placed once ---------------- */

test('the browser and the webhook racing produce one order and one email', async () => {
  const f = fakes();
  const [a, b] = await Promise.all([
    completePayment(callback, f.deps),
    completePayment(Object.assign({}, callback, { source: 'webhook' }), f.deps)
  ]);
  assert.equal(f.log.created.length, 1, 'exactly one Shopify order');
  assert.equal(f.log.mailed.length, 1, 'exactly one email');
  assert.equal(a.ok && b.ok, true, 'both callers get a good answer');
});

test('a retried webhook after everything is done changes nothing', async () => {
  const f = fakes();
  await completePayment(callback, f.deps);
  const again = await completePayment(callback, f.deps);
  assert.equal(again.ok, true);
  assert.equal(again.alreadyDone, true);
  assert.equal(f.log.created.length, 1);
  assert.equal(f.log.mailed.length, 1);
});

/* ---------------- refusals ---------------- */

test('a forged callback is refused and nothing is created', async () => {
  const f = fakes({ badSignature: true });
  const out = await completePayment(callback, f.deps);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'BAD_SIGNATURE');
  assert.equal(f.log.created.length, 0);
  assert.equal(f.log.mailed.length, 0);
});

test('a payment for a different order is refused', async () => {
  const f = fakes();
  const out = await completePayment(Object.assign({}, callback, { razorpayOrderId: 'order_SOMEONEELSE' }), f.deps);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'ORDER_MISMATCH');
  assert.equal(f.log.created.length, 0);
});

test('a payment that was authorised but never captured is refused', async () => {
  const f = fakes({ notCaptured: true });
  const out = await completePayment(callback, f.deps);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'NOT_CAPTURED');
  assert.equal(f.log.created.length, 0);
});

test('paying the wrong amount does not buy the order', async () => {
  const f = fakes({ paidPaise: 100 });
  const out = await completePayment(callback, f.deps);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'AMOUNT_MISMATCH');
  assert.equal(out.needsHuman, true);
  assert.equal(f.log.created.length, 0, 'nothing is dispatched for a short payment');
});

test('an unknown order is refused rather than invented', async () => {
  const f = fakes();
  const out = await completePayment(Object.assign({}, callback, { pfaOrderId: 'PFA-ST-NOPE' }), f.deps);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'UNKNOWN_ORDER');
});

test('a gateway that cannot be reached is retryable, not a failure', async () => {
  const f = fakes({ verifyThrows: true });
  const out = await completePayment(callback, f.deps);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'VERIFY_UNAVAILABLE');
  assert.equal(out.retryable, true);
  assert.equal(f.log.created.length, 0);
});

/* ---------------- the one that matters most ---------------- */

test('a paid order the seller will not accept is still confirmed to the shopper', async () => {
  const f = fakes({ shopifyFails: true });
  const out = await completePayment(callback, f.deps);
  assert.equal(out.ok, true, 'the shopper paid; telling them it failed would invite a second attempt');
  assert.equal(out.status, 'PLACEMENT_FAILED');
  assert.equal(out.needsRetry, true);
  assert.equal(out.view.paid, true);
  assert.equal(out.view.pfaOrderId, 'PFA-ST-TESTAAAA');
  assert.equal(f.log.mailed.length, 1, 'and they still get their confirmation');
});

test('a failed placement is left visible for a person, not swallowed', async () => {
  const f = fakes({ shopifyFails: true });
  await completePayment(callback, f.deps);
  const rec = await payments.get(ORDER.pfaOrderId);
  assert.equal(rec.status, 'PLACEMENT_FAILED');
  assert.equal(rec.placementAttempts, 1);
  assert.ok(rec.lastError, 'the reason is kept');
  assert.equal(rec.placementOwner, '', 'and the lease is released so a retry can claim it');
});

test('a failed placement can be retried and then succeeds', async () => {
  const failing = fakes({ shopifyFails: true });
  await completePayment(callback, failing.deps);
  const working = fakes();
  const out = await completePayment(callback, working.deps);
  assert.equal(out.status, 'PLACED');
  assert.equal(working.log.created.length, 1);
  assert.equal(working.log.mailed.length, 0, 'the email is not sent twice');
});

test('a mail failure does not stop the order reaching the seller', async () => {
  const f = fakes({ mailFails: true });
  const out = await completePayment(callback, f.deps);
  assert.equal(out.status, 'PLACED');
  assert.equal(f.log.created.length, 1);
  const rec = await payments.get(ORDER.pfaOrderId);
  assert.equal(rec.emailPending, true, 'and the unsent email is queued rather than forgotten');
});

test('no mailbox configured yet still completes the order and queues the email', async () => {
  const f = fakes({ mailConfigured: false });
  const out = await completePayment(callback, f.deps);
  assert.equal(out.status, 'PLACED');
  const rec = await payments.get(ORDER.pfaOrderId);
  assert.equal(rec.emailPending, true);
  assert.equal(rec.emailReason, 'MAIL_NOT_CONFIGURED');
});

/* ---------------- the order id is not handed out early ---------------- */

test('the PFA order id is withheld until the money is confirmed', () => {
  const pending = payments.publicView(Object.assign({}, ORDER, { status: 'PENDING_PAYMENT' }));
  assert.equal(pending.pfaOrderId, undefined, 'not before payment');
  assert.equal(pending.paid, false);
  const paid = payments.publicView(Object.assign({}, ORDER, { status: 'PAID' }));
  assert.equal(paid.pfaOrderId, 'PFA-ST-TESTAAAA', 'and given once it is');
});

test('the browser handle is opaque and does not contain the order id', async () => {
  const handle = payments.mintHandle();
  await payments.putHandle(handle, ORDER.pfaOrderId);
  assert.equal(handle.includes('PFA'), false);
  assert.equal(Buffer.from(handle, 'base64url').toString('utf8').includes('PFA'), false);
  assert.equal(await payments.orderIdForHandle(handle), ORDER.pfaOrderId, 'but the server can map it back');
  assert.equal(await payments.orderIdForHandle('not-a-handle'), '', 'and a made-up handle maps to nothing');
});

/* ---------------- the email itself ---------------- */

test('the confirmation names PFA and never the seller or their order number', () => {
  const rendered = mail.render(Object.assign({}, ORDER, { pfaOrderId: 'PFA-ST-TESTAAAA' }));
  assert.match(rendered.subject, /PFA-ST-TESTAAAA/);
  assert.match(rendered.text, /PFA-ST-TESTAAAA/);
  assert.doesNotMatch(rendered.html, /shopify|myshopify|Paws\s*&?\s*Tails/i);
  assert.doesNotMatch(rendered.text, /shopify|myshopify|Paws\s*&?\s*Tails/i);
});

test('the confirmation adds up to what was charged', () => {
  const rendered = mail.render(ORDER);
  assert.match(rendered.text, /Total paid: \u20b9171\.00/);
  assert.match(rendered.text, /Delivery \(Standard \(Prepaid\)\): \u20b959\.00/);
});
