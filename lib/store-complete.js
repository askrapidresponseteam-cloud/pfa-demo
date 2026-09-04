'use strict';

/* Completing a paid order, from whichever direction it arrives.
 *
 * Two things call this: the browser, the moment Razorpay hands control back,
 * and Razorpay's own webhook, which arrives whether or not the browser is still
 * open. Either is enough on its own. That is the answer to "can we pass it to
 * the seller without fail": not one path, but two, plus a retry, plus a
 * record that makes an un-passed order visible instead of lost.
 *
 * The order of operations is fixed and matters:
 *
 *   1. Verify the signature. An unsigned callback is a stranger's POST.
 *   2. Ask Razorpay what it actually captured, and for how much. The callback
 *      claims; Razorpay confirms. A payment for the wrong amount is not a
 *      payment for this order.
 *   3. Mark PAID. From here the shopper is finished, whatever happens next.
 *   4. Claim placement, so only one caller writes to Shopify.
 *   5. Create the Shopify order, idempotently.
 *
 * A failure at 5 does not undo 3. The shopper paid; the money is the seller's;
 * the order sits in PLACEMENT_FAILED for a person to push through, and the
 * success screen the shopper sees is true.
 */

const crypto = require('crypto');
const razorpay = require('./razorpay');
const shopifyAdmin = require('./shopify-admin');
const payments = require('./store-payments');
const mail = require('./store-mail');

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/* Razorpay counts in paise and so does this check. Comparing rupees as floats
   is how a hundredth of a rupee becomes a mismatch that fails real orders. */
function amountMatches(record, payment) {
  const expected = razorpay.toPaise(record.total);
  return Number(payment.amountPaise) === expected;
}

/* The one email. Wrapped so that nothing it can do reaches the caller: a mail
   provider being down must not turn a successful payment into an error page. */
async function sendConfirmation(pfaOrderId, record, deps, store) {
  const mailer = deps.mail || mail;
  const fetchImpl = deps.fetchImpl || global.fetch;
  try {
    if (!mailer.isConfigured()) {
      /* Recorded rather than ignored, so the retry worker can pick these up
         once the mailbox is set up. */
      await store.put(pfaOrderId, { emailPending: true, emailReason: 'MAIL_NOT_CONFIGURED' });
      return;
    }
    const owner = crypto.randomUUID();
    const claim = await store.claimEmail(pfaOrderId, owner);
    if (!claim.proceed) return;
    const result = await mailer.send(record, fetchImpl);
    if (result.sent) {
      await store.put(pfaOrderId, {
        emailSentAt: new Date().toISOString(),
        emailProviderId: cleanText(result.providerId, 120),
        emailPending: false,
        emailReason: '',
        emailOwner: '',
        emailLeaseUntil: 0
      });
      return;
    }
    await store.put(pfaOrderId, {
      emailPending: Boolean(result.retryable) || result.reason === 'MAIL_NOT_CONFIGURED',
      emailReason: cleanText(result.reason, 80),
      emailAttempts: Number(record.emailAttempts || 0) + 1,
      emailOwner: '',
      emailLeaseUntil: 0
    });
  } catch (error) {
    console.error('PFA store: confirmation email failed', {
      pfaOrderId, message: cleanText(error && error.message, 200)
    });
    try {
      await store.put(pfaOrderId, {
        emailPending: true,
        emailReason: 'MAIL_THREW',
        emailOwner: '',
        emailLeaseUntil: 0
      });
    } catch (_) {}
  }
}

async function completePayment({ pfaOrderId, razorpayOrderId, razorpayPaymentId, signature, source, skipSignature }, deps = {}) {
  const fetchImpl = deps.fetchImpl || global.fetch;
  const rp = deps.razorpay || razorpay;
  const admin = deps.shopifyAdmin || shopifyAdmin;
  const store = deps.payments || payments;

  const record = await store.get(pfaOrderId);
  if (!record) return { ok: false, code: 'UNKNOWN_ORDER', message: 'That order could not be found.' };

  /* Already finished. Both callers land here on a retry, and both get the same
     answer rather than a second order. */
  if (record.shopifyOrderId) {
    return { ok: true, status: record.status, pfaOrderId, alreadyDone: true, view: store.publicView(record) };
  }

  /* 1. the signature */
  if (!skipSignature) {
    const good = rp.verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature });
    if (!good) {
      await store.put(pfaOrderId, { status: record.status === 'PAID' ? 'PAID' : 'PENDING_PAYMENT', lastError: 'BAD_SIGNATURE' });
      return { ok: false, code: 'BAD_SIGNATURE', message: 'That payment could not be verified.' };
    }
  }
  if (record.razorpayOrderId && cleanText(razorpayOrderId, 60) !== record.razorpayOrderId) {
    return { ok: false, code: 'ORDER_MISMATCH', message: 'That payment belongs to a different order.' };
  }

  /* 2. what Razorpay says, not what the caller says */
  let payment;
  try {
    payment = await rp.fetchPayment(razorpayPaymentId, fetchImpl);
  } catch (error) {
    return { ok: false, code: 'VERIFY_UNAVAILABLE', message: 'The payment could not be confirmed just now.', retryable: true };
  }
  if (!payment.captured) {
    return { ok: false, code: 'NOT_CAPTURED', message: 'That payment has not completed.' };
  }
  if (!amountMatches(record, payment)) {
    await store.put(pfaOrderId, { status: 'PAID', paidAt: new Date().toISOString(), razorpayPaymentId: payment.id, lastError: 'AMOUNT_MISMATCH' });
    return { ok: false, code: 'AMOUNT_MISMATCH', message: 'The amount paid does not match this order.', needsHuman: true };
  }

  /* 3. paid. The shopper is done from this line onward. */
  const paidRecord = await store.put(pfaOrderId, {
    status: record.status === 'PLACED' ? 'PLACED' : 'PAID',
    paidAt: record.paidAt || new Date().toISOString(),
    razorpayPaymentId: payment.id,
    razorpayMethod: payment.method,
    paidVia: cleanText(source, 40) || 'browser'
  });

  /* 4. the one email, sent on PAID rather than on PLACED.
     A shopper who has paid is owed their confirmation whether or not the
     seller's store was reachable a second later, and the number in it is PFA's
     own, which exists either way. Claimed separately so the browser and the
     webhook cannot both send it, and never allowed to throw: an email that did
     not go out is a thing to retry, not a reason to fail a paid order. */
  await sendConfirmation(pfaOrderId, paidRecord, deps, store);

  /* 5. only one caller writes to Shopify */
  const owner = crypto.randomUUID();
  const claim = await store.claimPlacement(pfaOrderId, owner);
  if (!claim.proceed) {
    const latest = await store.get(pfaOrderId);
    return { ok: true, status: latest.status || 'PAID', pfaOrderId, placedByOther: true, view: store.publicView(latest) };
  }

  /* 5. into Shopify */
  try {
    const created = await admin.createOrder({
      pfaOrderId,
      priced: {
        lines: paidRecord.items || [],
        itemsTotal: paidRecord.itemsTotal,
        shipping: paidRecord.shipping,
        total: paidRecord.total,
        currency: paidRecord.currency || 'INR'
      },
      buyer: {
        /* Shopify is given the relay, never the shopper. PFA's own record keeps
           the real address, and PFA's one email is sent from there. */
        relayEmail: store.relayEmailFor(pfaOrderId),
        phone: paidRecord.phone
      },
      address: paidRecord.address,
      delivery: { title: paidRecord.deliveryTitle, code: paidRecord.deliveryCode },
      payment: { razorpayPaymentId: payment.id }
    }, fetchImpl);

    const done = await store.put(pfaOrderId, {
      status: 'PLACED',
      shopifyOrderId: created.shopifyOrderId,
      /* Kept for reconciliation and the admin panel. Never sent to the shopper:
         publicView does not carry it. */
      shopifyOrderName: created.shopifyOrderName,
      placedAt: new Date().toISOString(),
      placementOwner: '',
      placementLeaseUntil: 0,
      lastError: ''
    });
    return { ok: true, status: 'PLACED', pfaOrderId, view: store.publicView(done) };
  } catch (error) {
    /* The money is taken and stays taken. This is a PFA problem now. */
    const failed = await store.put(pfaOrderId, {
      status: 'PLACEMENT_FAILED',
      placementOwner: '',
      placementLeaseUntil: 0,
      placementAttempts: Number(paidRecord.placementAttempts || 0) + 1,
      lastError: cleanText(error && (error.code || error.message), 160)
    });
    console.error('PFA store: paid but not placed with the seller', {
      pfaOrderId, razorpayPaymentId: payment.id, error: cleanText(error && error.message, 200)
    });
    /* Still ok:true. The shopper paid, and telling them otherwise would be
       false, would invite a second attempt, and would charge them twice. */
    return { ok: true, status: 'PLACEMENT_FAILED', pfaOrderId, needsRetry: true, view: store.publicView(failed) };
  }
}

module.exports = { completePayment, _private: { amountMatches, sendConfirmation, cleanText } };
