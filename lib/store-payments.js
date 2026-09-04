'use strict';

/* The PFA-led store order: PFA takes the payment step, PFA owns the order
 * number, and Shopify is written to afterwards.
 *
 * Collection: storePayments/{pfaOrderId}
 *
 * Lifecycle
 *   PENDING_PAYMENT  a Razorpay order exists; nothing has been charged
 *   PAID             Razorpay confirmed the money. The shopper is done.
 *   PLACED           the order also exists in Shopify
 *   PLACEMENT_FAILED paid, but Shopify would not take it. Needs a human.
 *   REFUNDED         paid, could not be fulfilled, money returned
 *
 * The distinction between PAID and PLACED is the whole point of the file. Once
 * a shopper has paid they are finished, and the success screen says so. Getting
 * the order into Shopify after that is PFA's problem, never theirs: it is
 * retried, and if it will not go it is surfaced for a person rather than
 * silently lost.
 */

const crypto = require('crypto');

const PFA_ORDER_PREFIX = 'PFA-ST-';
const memory = new Map();

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/* Minted by PFA, before any money moves, so the shopper has a number to quote
   even if everything downstream fails. Not sequential: an order id that can be
   guessed by adding one is an order that can be looked up by a stranger. */
function mintPfaOrderId() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   /* no 0/O, no 1/I */
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return PFA_ORDER_PREFIX + out;
}

function firebaseConfigured() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function ref(pfaOrderId) {
  return require('./firebase').getDb().collection('storePayments').doc(cleanText(pfaOrderId, 40));
}

async function put(pfaOrderId, patch) {
  const id = cleanText(pfaOrderId, 40);
  const now = new Date().toISOString();
  const merged = Object.assign({}, memory.get(id) || {}, patch, { pfaOrderId: id, updatedAt: now });
  memory.set(id, merged);
  if (firebaseConfigured()) {
    try { await ref(id).set(Object.assign({}, patch, { pfaOrderId: id, updatedAt: now }), { merge: true }); }
    catch (error) { console.error('PFA store payment could not be persisted', { pfaOrderId: id, message: error && error.message }); }
  }
  return merged;
}

async function get(pfaOrderId) {
  const id = cleanText(pfaOrderId, 40);
  if (firebaseConfigured()) {
    try {
      const snap = await ref(id).get();
      if (snap.exists) { memory.set(id, snap.data()); return snap.data(); }
    } catch (error) { console.error('PFA store payment lookup failed', { message: error && error.message }); }
  }
  return memory.get(id) || null;
}

/* The guard that stops two Shopify orders existing for one payment, and the
 * same guard again for the one email.
 *
 * The browser callback and the Razorpay webhook both arrive, often within the
 * same second, and a retried webhook arrives again after that. Exactly one of
 * them may proceed; the others are told to stand down and simply report what
 * the winner did. On Firestore this is a transaction. In memory it is a plain
 * check, which is enough because a single process has a single event loop.
 *
 * The lease matters as much as the flag: a caller that claims and then dies
 * mid-flight must not lock the step forever, so the claim expires and the next
 * caller picks it up.
 */
const LEASE_MS = 60_000;

async function claimStep(pfaOrderId, owner, step) {
  const id = cleanText(pfaOrderId, 40);
  const doneField = step.done;
  const ownerField = step.owner;
  const leaseField = step.lease;
  const now = Date.now();

  const decide = (rec) => {
    if (rec && rec[doneField]) return { proceed: false, record: rec };
    if (rec && rec[ownerField] && Number(rec[leaseField]) > now) return { proceed: false, record: rec };
    return null;
  };

  if (!firebaseConfigured()) {
    const rec = memory.get(id) || {};
    const stop = decide(rec);
    if (stop) return stop;
    memory.set(id, Object.assign({}, rec, { [ownerField]: owner, [leaseField]: now + LEASE_MS }));
    return { proceed: true, record: memory.get(id) };
  }

  const db = require('./firebase').getDb();
  const docRef = ref(id);
  let outcome = { proceed: false, record: null };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const rec = snap.exists ? snap.data() : {};
    const stop = decide(rec);
    if (stop) { outcome = stop; return; }
    tx.set(docRef, { [ownerField]: owner, [leaseField]: now + LEASE_MS }, { merge: true });
    outcome = { proceed: true, record: rec };
  });
  return outcome;
}

function claimPlacement(pfaOrderId, owner) {
  return claimStep(pfaOrderId, owner, {
    done: 'shopifyOrderId', owner: 'placementOwner', lease: 'placementLeaseUntil'
  });
}

/* One email, once. Claimed separately from placement, because whether the
   shopper is told they paid must not depend on whether the seller's store was
   reachable. */
function claimEmail(pfaOrderId, owner) {
  return claimStep(pfaOrderId, owner, {
    done: 'emailSentAt', owner: 'emailOwner', lease: 'emailLeaseUntil'
  });
}

/* Every Shopify notification for an order is addressed here instead of to the
   shopper, so the seller's order number and order-status page never reach them.
   Sub-addressing keeps the PFA order id in the address, which means a
   notification landing in this mailbox says which order it belongs to without
   anything having to parse the body. */
function relayEmailFor(pfaOrderId) {
  const base = cleanText(process.env.PFA_STORE_RELAY_EMAIL, 160) || 'orders@peopleforanimalsindia.org';
  const at = base.indexOf('@');
  if (at < 1) return base;
  const id = cleanText(pfaOrderId, 40).replace(/[^A-Za-z0-9-]/g, '');
  return base.slice(0, at) + '+' + id + base.slice(at);
}

/* The browser is given this, never the order id.
 *
 * An order id in the page is an order id in the DOM, in devtools and in any
 * screenshot, and a shopper whose payment failed would have one for an order
 * that does not exist. The handle is meaningless on its own; the server maps it
 * back, and only a confirmed payment is ever answered with the real number. */
function mintHandle() {
  return crypto.randomBytes(24).toString('base64url');
}

function handleRef(handle) {
  return require('./firebase').getDb().collection('storePaymentHandles').doc(cleanText(handle, 80));
}

const handles = new Map();

async function putHandle(handle, pfaOrderId) {
  const h = cleanText(handle, 80);
  const id = cleanText(pfaOrderId, 40);
  handles.set(h, id);
  if (firebaseConfigured()) {
    try { await handleRef(h).set({ pfaOrderId: id, createdAt: new Date().toISOString() }); }
    catch (error) { console.error('PFA store handle could not be persisted', { message: error && error.message }); }
  }
  return h;
}

async function orderIdForHandle(handle) {
  const h = cleanText(handle, 80);
  if (!h) return '';
  if (handles.has(h)) return handles.get(h);
  if (firebaseConfigured()) {
    try {
      const snap = await handleRef(h).get();
      if (snap.exists) {
        const id = cleanText(snap.data().pfaOrderId, 40);
        handles.set(h, id);
        return id;
      }
    } catch (error) { console.error('PFA store handle lookup failed', { message: error && error.message }); }
  }
  return '';
}

/* What the shopper is allowed to see. Shopify's order number is deliberately
   absent: the customer deals with PFA and quotes a PFA number.
   The PFA order id is absent too until the money is confirmed, because an id
   handed out beside a failed payment is a number for nothing. */
function publicView(record) {
  if (!record) return null;
  const paid = ['PAID', 'PLACED', 'PLACEMENT_FAILED', 'REFUNDED'].includes(record.status);
  const view = {
    status: record.status,
    paid,
    total: record.total,
    currency: record.currency || 'INR',
    delivery: record.deliveryTitle || '',
    items: Array.isArray(record.items) ? record.items.map((i) => ({
      title: i.title, quantity: i.quantity, unitPrice: i.unitPrice
    })) : []
  };
  if (paid) {
    view.pfaOrderId = record.pfaOrderId;
    view.placedAt = record.paidAt || record.createdAt || '';
  }
  return view;
}

/* ---- the order after it is paid: tracking, the admin register, the mirror --
 *
 * These existed nowhere. The number handed to the shopper on the success
 * screen and in the email came from this collection, but /api/pfa-order-status
 * and the admin Store register read only storeOrders, the Shopify mirror. So a
 * shopper typing their own order number on the tracking page was told no such
 * order existed, and an order that was paid but never reached the seller
 * (PLACEMENT_FAILED - the one state that needs a person) was invisible to the
 * people who could fix it.
 */

/* The minted shape: eight characters from the alphabet above. A Shopify order
   number behind the same prefix (PFA-ST-1191) never matches, so the two kinds
   of id can share a prefix without ever being confused for each other. */
const DIRECT_ID = /^PFA-ST-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

function isDirectPayId(value) {
  return DIRECT_ID.test(cleanText(value, 40).toUpperCase());
}

async function findByPfaOrderId(id) {
  const clean = cleanText(id, 40).toUpperCase();
  if (!isDirectPayId(clean)) return null;
  return get(clean);
}

/* The order number is sequential-looking enough to be guessed, so a lookup by
   it has to prove the email or mobile that was given with the order, exactly
   as a submission does. */
function normaliseContact(value) {
  const text = cleanText(value, 160);
  if (!text) return '';
  if (text.includes('@')) return text.toLowerCase().replace(/\s+/g, '');
  const digits = text.replace(/\D/g, '').replace(/^(?:0|91)(?=[6-9]\d{9}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : '';
}

function contactMatches(record, contact) {
  const given = normaliseContact(contact);
  if (!given || !record) return false;
  const email = normaliseContact(record.email);
  const phone = normaliseContact(record.phone);
  return (Boolean(email) && given === email) || (Boolean(phone) && given === phone);
}

/* The vocabulary track.html and the store page already understand:
   AWAITING_PAYMENT · CONFIRMED · FULFILLED · CANCELLED · REFUND_RECORDED.
   Fulfilment and cancellation are the seller's events and arrive through the
   Shopify mirror; everything up to "paid" is known here. */
function trackingStatus(record) {
  const mirror = (record && record.mirror) || {};
  if (['FULFILLED', 'CANCELLED', 'REFUND_RECORDED'].includes(mirror.status)) return mirror.status;
  switch (record && record.status) {
    case 'PAID':
    case 'PLACED':
    case 'PLACEMENT_FAILED':
      return 'CONFIRMED';
    case 'REFUNDED':
      return 'REFUND_RECORDED';
    default:
      return 'AWAITING_PAYMENT';
  }
}

/* What the tracking page shows. Same shape as store-orders.publicView so the
   page needs no second renderer. The seller's order number is not in it. */
function trackingView(record) {
  if (!record) return null;
  const mirror = record.mirror || {};
  const t = mirror.tracking || record.tracking || null;
  return {
    pfaOrderId: record.pfaOrderId,
    orderNumber: '',
    status: trackingStatus(record),
    total: record.total,
    currency: record.currency || 'INR',
    delivery: record.deliveryTitle || '',
    items: Array.isArray(record.items) ? record.items.map((i) => ({ title: i.title, quantity: i.quantity })) : [],
    tracking: t ? { status: t.status, company: t.company, number: t.number, url: t.url } : null,
    createdAt: record.paidAt || record.createdAt || null,
    shippedAt: mirror.shippedAt || null,
    deliveredAt: mirror.deliveredAt || null,
    cancelledAt: mirror.cancelledAt || null,
    refundedTotal: Number(mirror.refundedTotal) || 0,
    updatedAt: mirror.updatedAt || record.updatedAt || null
  };
}

/* Called by the Shopify webhook receiver when an order carrying a PFA order
   id arrives. Writes the seller's side of the story - the Shopify order id,
   fulfilment, tracking, cancellation, refunds - beside PFA's own record, so
   one lookup answers for the whole life of the order.

   It also closes a gap: an order that was created in Shopify but whose
   confirmation never reached PFA (a timeout after the create) sat in
   PLACEMENT_FAILED until the daily reconcile found it. The seller's own
   webhook says it exists, so it is marked PLACED the moment that arrives. */
async function linkMirror(mirror) {
  const id = cleanText(mirror && mirror.pfaOrderId, 40).toUpperCase();
  if (!isDirectPayId(id)) return null;
  const record = await get(id);
  if (!record) return null;
  const patch = {
    mirror: {
      shopifyOrderId: cleanText(mirror.shopifyOrderId, 30),
      status: cleanText(mirror.status, 30),
      tracking: mirror.tracking || null,
      shippedAt: mirror.shippedAt || null,
      deliveredAt: mirror.deliveredAt || null,
      cancelledAt: mirror.cancelledAt || null,
      refundedTotal: Number(mirror.refundedTotal) || 0,
      lastEvent: cleanText(mirror.lastEvent, 40),
      updatedAt: mirror.updatedAt || new Date().toISOString()
    }
  };
  if (!record.shopifyOrderId && mirror.shopifyOrderId) {
    patch.shopifyOrderId = cleanText(mirror.shopifyOrderId, 30);
    patch.shopifyOrderName = mirror.orderNumber ? '#' + cleanText(mirror.orderNumber, 20).replace(/^#/, '') : '';
    if (record.status === 'PAID' || record.status === 'PLACEMENT_FAILED') {
      patch.status = 'PLACED';
      patch.placedAt = record.placedAt || new Date().toISOString();
      patch.placementOwner = '';
      patch.placementLeaseUntil = 0;
      patch.lastError = '';
    }
  }
  return put(id, patch);
}

/* What is wrong with this order, if anything, for the admin register. An empty
   string means nothing needs a person. */
function attention(record) {
  if (!record) return '';
  if (record.status === 'PLACEMENT_FAILED') return 'Paid, but not yet placed with the seller';
  if (record.lastError === 'AMOUNT_MISMATCH') return 'Paid a different amount from the order total';
  if (record.status === 'PAID' && !record.shopifyOrderId) return 'Paid; placement with the seller in progress';
  if (record.emailPending && !record.emailSentAt) return 'Confirmation email not yet sent';
  return '';
}

/* One row of the admin Store register, in the same columns as a mirrored
   Shopify order so the panel draws both from one table. */
function adminRow(record) {
  const t = (record.mirror && record.mirror.tracking) || record.tracking || {};
  return {
    shopifyOrderId: cleanText(record.shopifyOrderId, 30),
    pfaOrderId: record.pfaOrderId || '',
    orderNumber: cleanText(record.shopifyOrderName, 20).replace(/^#/, ''),
    status: trackingStatus(record),
    paymentStatus: record.status || '',
    source: 'direct',
    total: Number(record.total) || 0,
    currency: record.currency || 'INR',
    name: record.name || '',
    email: record.email || '',
    phone: record.phone || '',
    items: (record.items || []).map((l) => `${l.title} × ${l.quantity}`).join(', '),
    tracking: t && t.number ? `${t.company || 'Courier'} ${t.number}${t.status ? ' (' + t.status + ')' : ''}` : '',
    trackingUrl: (t && t.url) || '',
    razorpayPaymentId: record.razorpayPaymentId || '',
    createdAt: record.createdAt || '',
    updatedAt: record.updatedAt || '',
    lastEvent: (record.mirror && record.mirror.lastEvent) || (record.paidVia ? 'paid via ' + record.paidVia : ''),
    refundedTotal: Number(record.mirror && record.mirror.refundedTotal) || 0,
    attention: attention(record)
  };
}

function resetForTests() { memory.clear(); handles.clear(); }

module.exports = {
  PFA_ORDER_PREFIX,
  mintPfaOrderId,
  mintHandle,
  putHandle,
  orderIdForHandle,
  relayEmailFor,
  put,
  get,
  claimPlacement,
  claimEmail,
  publicView,
  isDirectPayId,
  findByPfaOrderId,
  contactMatches,
  trackingStatus,
  trackingView,
  linkMirror,
  attention,
  adminRow,
  resetForTests,
  _private: { memory, handles, cleanText, normaliseContact, DIRECT_ID }
};
