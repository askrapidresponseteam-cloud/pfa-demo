'use strict';

/* POST /api/pfa-store-reconcile   (Bearer PFA_ADMIN_TOKEN, or a Vercel cron)
 *
 * The safety net that turns "an order is never lost" from a hope into a thing
 * that is actually true.
 *
 * Two independent triggers already try to place every paid order. This catches
 * what both of them missed:
 *
 *   PLACEMENT_FAILED   paid, but the seller's store would not take it. Usually
 *                      transient (a 429, a timeout, a five-minute outage), and
 *                      a retry a few minutes later succeeds.
 *   emailPending       paid and placed, but PFA's confirmation did not go out,
 *                      most often because the mailbox was not set up yet. These
 *                      drain on their own the moment PFA_MAIL_API_KEY exists.
 *
 * Point a cron at it every few minutes. It is safe to run at any frequency and
 * safe to run concurrently with itself: every step is claimed, so a second
 * runner picks up nothing the first is holding.
 *
 * It reports what it found even when it fixed nothing, because an order stuck
 * here is the one thing on this whole path that needs a person to look at it.
 */

const crypto = require('crypto');
const payments = require('../store-payments.js');
const { completePayment } = require('../store-complete.js');
const mail = require('../store-mail.js');

const MAX_PER_RUN = 25;
const MAX_PLACEMENT_ATTEMPTS = 8;

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  try { return crypto.timingSafeEqual(left, right); } catch (_) { return false; }
}

/* Either token opens this. The documentation offers both, Vercel's cron sends
   CRON_SECRET, and a person running it by hand sends PFA_ADMIN_TOKEN.
   `PFA_ADMIN_TOKEN || CRON_SECRET` accepted only whichever was set first, so a
   deployment carrying both answered its own nightly run with a 401 and the
   queue was never worked. Both are compared, and both comparisons are made
   whatever the first one says, so the answer does not depend on which matched. */
function authorised(request) {
  const header = String((request.headers || {}).authorization || '');
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!presented) return false;
  const accepted = [process.env.PFA_ADMIN_TOKEN, process.env.CRON_SECRET]
    .map((value) => String(value || '')).filter(Boolean);
  if (!accepted.length) return false;
  return accepted.reduce((ok, token) => safeEqual(token, presented) || ok, false);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function firebaseConfigured() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

/* Everything paid that is not finished. Firestore where it exists; the in-memory
   map otherwise, which is what runs in tests and on a single warm instance. */
async function outstanding() {
  if (!firebaseConfigured()) {
    return [...payments._private.memory.values()].filter(needsWork).slice(0, MAX_PER_RUN);
  }
  const db = require('../firebase.js').getDb();
  const found = new Map();
  const collect = async (query) => {
    const snap = await query.limit(MAX_PER_RUN).get();
    snap.forEach((doc) => { if (!found.has(doc.id)) found.set(doc.id, doc.data()); });
  };
  await collect(db.collection('storePayments').where('status', '==', 'PLACEMENT_FAILED'));
  await collect(db.collection('storePayments').where('emailPending', '==', true));
  return [...found.values()].filter(needsWork).slice(0, MAX_PER_RUN);
}

function needsWork(record) {
  if (!record) return false;
  const paid = ['PAID', 'PLACED', 'PLACEMENT_FAILED'].includes(record.status);
  if (!paid) return false;
  /* Any paid order without a Shopify order still needs something: a retry if it
     has attempts left, and a report if it does not. Filtering the exhausted
     ones out here would hide exactly the orders a person needs to see. */
  const placementStuck = !record.shopifyOrderId;
  const emailStuck = Boolean(record.emailPending) && !record.emailSentAt;
  return placementStuck || emailStuck;
}

module.exports = async function pfaStoreReconcile(request, response) {
  if (!authorised(request)) {
    return sendJson(response, 401, { code: 'UNAUTHORISED', message: 'A reconcile token is required.' });
  }

  const report = { checked: 0, placed: 0, emailed: 0, stillFailing: 0, exhausted: [], errors: [] };

  let records;
  try {
    records = await outstanding();
  } catch (error) {
    return sendJson(response, 503, {
      code: 'RECONCILE_UNAVAILABLE',
      message: cleanText(error && error.message, 200) || 'The order store could not be read.'
    });
  }

  for (const record of records) {
    report.checked++;
    const id = record.pfaOrderId;

    /* An order that has run out of retries stops being retried and starts being
       reported, because eight failures is not a transient outage and silently
       trying forever hides it. */
    if (!record.shopifyOrderId && Number(record.placementAttempts || 0) >= MAX_PLACEMENT_ATTEMPTS) {
      report.exhausted.push(id);
      continue;
    }

    try {
      if (!record.shopifyOrderId && record.razorpayPaymentId) {
        /* The same completion path, not a second one. Re-running it re-verifies
           the payment with Razorpay before placing anything, so a reconcile can
           never place an order for money that was refunded in the meantime. */
        const result = await completePayment({
          pfaOrderId: id,
          razorpayOrderId: record.razorpayOrderId,
          razorpayPaymentId: record.razorpayPaymentId,
          skipSignature: true,
          source: 'reconcile'
        });
        if (result.ok && result.status === 'PLACED') report.placed++;
        else if (result.status === 'PLACEMENT_FAILED') report.stillFailing++;
      }

      /* The email is chased separately, because an order can be placed and
         still owe the shopper their one message. */
      const latest = await payments.get(id);
      if (latest && latest.emailPending && !latest.emailSentAt && mail.isConfigured()) {
        const owner = crypto.randomUUID();
        const claim = await payments.claimEmail(id, owner);
        if (claim.proceed) {
          const sent = await mail.send(latest);
          if (sent.sent) {
            await payments.put(id, {
              emailSentAt: new Date().toISOString(),
              emailProviderId: cleanText(sent.providerId, 120),
              emailPending: false, emailReason: '', emailOwner: '', emailLeaseUntil: 0
            });
            report.emailed++;
          } else {
            await payments.put(id, {
              emailPending: Boolean(sent.retryable),
              emailReason: cleanText(sent.reason, 80),
              emailAttempts: Number(latest.emailAttempts || 0) + 1,
              emailOwner: '', emailLeaseUntil: 0
            });
          }
        }
      }
    } catch (error) {
      report.errors.push({ pfaOrderId: id, message: cleanText(error && error.message, 160) });
    }
  }

  /* Loud in the log when something is stuck, so this does not depend on anyone
     remembering to read a dashboard. */
  if (report.exhausted.length) {
    console.error('PFA store: paid orders that have not reached the seller', {
      orders: report.exhausted, attempts: MAX_PLACEMENT_ATTEMPTS
    });
  }

  return sendJson(response, 200, report);
};

module.exports._private = { needsWork, outstanding, authorised, MAX_PLACEMENT_ATTEMPTS };
