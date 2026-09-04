'use strict';

const crypto = require('crypto');
const RULES = require('../assets/field-rules.js');

let cachedDb = null;

function clean(value, maxLength = 500) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function firebaseConfig() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (parsed.project_id && parsed.client_email && parsed.private_key) return parsed;
    } catch (_) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
  }

  const projectId = clean(process.env.FIREBASE_PROJECT_ID, 200);
  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL, 300);
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
  }
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

/* Tests hand in a stand-in Firestore, so the payment and submission routes
   can be driven end to end without a project. Never called in production. */
function _setDbForTests(db) { cachedDb = db || null; }

function getDb() {
  if (cachedDb) return cachedDb;

  let adminApp;
  let firestore;
  let getApps;
  let initializeApp;
  let cert;
  let getFirestore;
  try {
    ({ getApps, initializeApp, cert } = require('firebase-admin/app'));
    ({ getFirestore } = require('firebase-admin/firestore'));
    const apps = getApps();
    adminApp = apps.length ? apps[0] : initializeApp({ credential: cert(firebaseConfig()) });
    firestore = getFirestore(adminApp);
  } catch (error) {
    if (error && /Cannot find module 'firebase-admin'/.test(error.message)) {
      throw new Error('firebase-admin is not installed. Run npm install before deploying to Vercel.');
    }
    throw error;
  }

  cachedDb = firestore;
  return cachedDb;
}

function fieldValue() {
  const { FieldValue } = require('firebase-admin/firestore');
  return FieldValue;
}

/* A Firestore Timestamp from millis, for range queries and cursors on
   createdAt. Lazy for the same reason fieldValue() is. */
function timestampFromMillis(ms) {
  const millis = Number(ms) || 0;
  try {
    const { Timestamp } = require('firebase-admin/firestore');
    return Timestamp.fromMillis(millis);
  } catch (error) {
    /* Without the SDK (tests), a stand-in that compares the same way. */
    return { seconds: Math.floor(millis / 1000), nanoseconds: (millis % 1000) * 1e6, toMillis: () => millis };
  }
}

function serverTimestamp() {
  return fieldValue().serverTimestamp();
}

function hashKey(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function transactionRef(db, orderId) {
  return db.collection('transactions').doc(orderId);
}

async function getTransaction(orderId) {
  const db = getDb();
  const snapshot = await transactionRef(db, orderId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function createTransaction({ orderId, type, amount, currency, data, idempotencyKey }) {
  const db = getDb();
  const record = {
    orderId,
    type,
    amount: Number(amount),
    currency: String(currency || 'inr').toUpperCase(),
    status: 'initiated',
    source: 'pfa-website',
    customer: data.customer || {},
    metadata: data.metadata || {},
    ccaVenue: {
      trackingId: null,
      bankReference: null,
      paymentMode: null,
      responseStatus: null
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const normalizedKey = clean(idempotencyKey, 200);
  if (!normalizedKey) {
    await db.runTransaction(async (transaction) => {
      const ref = transactionRef(db, orderId);
      const existing = await transaction.get(ref);
      if (!existing.exists) transaction.create(ref, record);
    });
    return { ...record, orderId };
  }

  const idempotencyRef = db.collection('paymentIdempotency').doc(hashKey(`${type}:${normalizedKey}`));
  return db.runTransaction(async (transaction) => {
    const idempotencySnapshot = await transaction.get(idempotencyRef);
    if (idempotencySnapshot.exists) {
      const existingOrderId = clean(idempotencySnapshot.data().orderId, 80);
      const existingTransaction = await transaction.get(transactionRef(db, existingOrderId));
      if (existingTransaction.exists) return { id: existingTransaction.id, ...existingTransaction.data() };
    }

    const ref = transactionRef(db, orderId);
    const existing = await transaction.get(ref);
    if (!existing.exists) transaction.create(ref, record);
    transaction.set(idempotencyRef, {
      keyHash: idempotencyRef.id,
      orderId,
      type,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { ...record, orderId };
  });
}

function callbackEventId(orderId, callback) {
  return hashKey([
    orderId,
    callback.status,
    callback.trackingId,
    callback.bankReference,
    callback.rawStatus
  ].join('|')).slice(0, 48);
}


async function applyPaymentResult({ orderId, callback, verified }) {
  const db = getDb();
  const ref = transactionRef(db, orderId);
  const eventRef = db.collection('paymentEvents').doc(callbackEventId(orderId, callback));

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('The stored PFA transaction could not be found.');
    const existing = { id: snapshot.id, ...snapshot.data() };

    const alreadyFinal = ['success', 'failed', 'aborted', 'cancelled', 'verification_failed'].includes(existing.status);
    const shouldApply = !(existing.status === 'success' && verified) && !(alreadyFinal && !verified);
    const nextStatus = verified
      ? 'success'
      : callback.status === 'aborted'
        ? 'aborted'
        : callback.status === 'initiated' || callback.status === 'awaited'
          ? 'pending'
          : callback.status === 'verification_failed'
            ? 'verification_failed'
          : 'failed';

    transaction.set(eventRef, {
      orderId,
      type: existing.type,
      status: callback.status,
      rawStatus: callback.rawStatus,
      trackingId: callback.trackingId || null,
      bankReference: callback.bankReference || null,
      receivedAt: serverTimestamp(),
      verified: Boolean(verified)
    }, { merge: true });

    if (!shouldApply) return { ...existing, id: snapshot.id, applied: false, firstSuccess: false };

    const updated = {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      ccaVenue: {
        trackingId: callback.trackingId || null,
        bankReference: callback.bankReference || null,
        paymentMode: callback.paymentMode || null,
        responseStatus: callback.rawStatus || null,
        failureMessage: callback.failureMessage || null
      }
    };

    if (!verified) {
      transaction.update(ref, updated);
      return { ...existing, ...updated, id: snapshot.id, applied: true, firstSuccess: false };
    }

    /* firstSuccess: this callback is the one that turned the transaction
       green. CCAvenue redelivers callbacks, and the things that must happen
       exactly once on success - the receipt email above all - key off this
       rather than off the status, which is success on every redelivery. */
    transaction.update(ref, updated);
    return { ...existing, ...updated, id: snapshot.id, applied: true, firstSuccess: existing.status !== 'success' };
  });
}

// Matches the format lib/payment.js already stores on every member record's
// `mobile` field (bare 10 digits, no +91) - pfa-orders.js normalizes phones
// differently (+91 prefix) for Shopify checkout, but that is a different flow
// and must not be used here or dedup lookups would silently never match.
/* Delegates to the shared rule file so a number written "09876543210" or
   "0091-98765-43210" resolves the same way here as it does in the browser.
   This function used to return an empty string for both, which meant a
   member typing their number with a leading zero at checkout was not found
   and was quietly treated as somebody new. Output is unchanged for every
   form the old version already accepted. */
function normalizedMobile(value) {
  const digits = RULES.normaliseMobile(value);
  return /^[6-9]\d{9}$/.test(digits) ? digits : '';
}

async function findMemberByMobile(mobile) {
  const db = getDb();
  const snapshot = await db.collection('members').where('mobile', '==', mobile).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

// Issues cards to existing (pre-migration) members without a new payment.
// Every record is checked against every other record in the same batch and
// against Firestore before anything is written, so re-running an import (or
// a name appearing on the list twice) never creates a second member.


function resetForTests() {
  cachedDb = null;
}

module.exports = {
  applyPaymentResult,
  createTransaction,
  fieldValue,
  timestampFromMillis,
  findMemberByMobile,
  firebaseConfig,
  getDb,
  getTransaction,
  hashKey,
  normalizedMobile,
  resetForTests,
  _setDbForTests,
  serverTimestamp
};
