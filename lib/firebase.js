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

function computeMembershipValidity(previous, now) {
  const referenceNow = now || new Date();
  const previousValidUntil = previous && previous.validUntil ? new Date(previous.validUntil) : null;
  const stillCurrent = previousValidUntil && previousValidUntil.getTime() > referenceNow.getTime();
  const validFrom = stillCurrent ? previousValidUntil : referenceNow;
  const validUntil = new Date(validFrom.getTime());
  validUntil.setFullYear(validUntil.getFullYear() + 1);
  return {
    memberSince: (previous && previous.memberSince) || referenceNow.toISOString(),
    validUntil: validUntil.toISOString()
  };
}

async function applyPaymentResult({ orderId, callback, verified }) {
  const db = getDb();
  const ref = transactionRef(db, orderId);
  const eventRef = db.collection('paymentEvents').doc(callbackEventId(orderId, callback));

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('The stored PFA transaction could not be found.');
    const existing = { id: snapshot.id, ...snapshot.data() };
    let memberRef = null;
    let memberSnapshot = null;
    let memberId = clean(existing.memberId, 60);

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

    if (!shouldApply) return { ...existing, id: snapshot.id };

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
      return { ...existing, ...updated, id: snapshot.id };
    }

    if (existing.type === 'membership' && memberRef) {
      const previous = memberSnapshot.exists ? memberSnapshot.data() : null;
      const validity = computeMembershipValidity(previous, new Date());

      const memberRecord = {
        memberId,
        status: 'active',
        name: existing.customer?.name || '',
        mobile: existing.customer?.mobile || '',
        email: existing.customer?.email || '',
        currency: String(existing.currency || 'inr').toUpperCase(),
        physicalCard: Boolean(existing.metadata?.physicalCard),
        amount: existing.amount,
        transactionOrderId: orderId,
        memberSince: validity.memberSince,
        validUntil: validity.validUntil,
        lastRenewalOrderId: orderId,
        updatedAt: serverTimestamp()
      };
      if (!memberSnapshot.exists) memberRecord.createdAt = serverTimestamp();
      transaction.set(memberRef, memberRecord, { merge: true });
      updated.memberId = memberId;
    }

    transaction.update(ref, updated);
    return { ...existing, ...updated, id: snapshot.id };
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
async function bulkImportLegacyMembers(records) {
  const { createMemberId } = require('./pfa-ccavenue-flow');
  const db = getDb();
  const seenInBatch = new Set();
  const result = { imported: [], skipped: [], errors: [] };

  const now = new Date();
  const validUntil = new Date(now.getTime());
  validUntil.setFullYear(validUntil.getFullYear() + 1);
  const validUntilIso = validUntil.toISOString();

  for (const record of Array.isArray(records) ? records : []) {
    const mobile = normalizedMobile(record && record.mobile);
    const name = clean(record && record.name, 100);

    if (!mobile) { result.errors.push({ record, reason: 'Missing or invalid mobile number.' }); continue; }
    if (!name) { result.errors.push({ record, reason: 'Missing name.' }); continue; }
    if (seenInBatch.has(mobile)) { result.skipped.push({ record, reason: 'Duplicate mobile number within this import batch.' }); continue; }
    seenInBatch.add(mobile);

    const existing = await findMemberByMobile(mobile);
    if (existing) {
      result.skipped.push({ record, reason: 'A member with this mobile number already exists.', existingMemberId: existing.memberId });
      continue;
    }

    const memberId = createMemberId();
    const memberSinceDate = record && record.memberSince ? new Date(record.memberSince) : now;
    const memberSinceIso = isNaN(memberSinceDate.getTime()) ? now.toISOString() : memberSinceDate.toISOString();

    const memberRecord = {
      memberId,
      status: 'active',
      name,
      mobile,
      email: clean(record && record.email, 254).toLowerCase(),
      currency: 'INR',
      physicalCard: false,
      source: 'legacy-import',
      memberSince: memberSinceIso,
      validUntil: validUntilIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await db.collection('members').doc(memberId).set(memberRecord);
    result.imported.push({ memberId, name, mobile });
  }

  return result;
}

async function getMember(memberId) {
  const db = getDb();
  const snapshot = await db.collection('members').doc(memberId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function resetForTests() {
  cachedDb = null;
}

module.exports = {
  applyPaymentResult,
  bulkImportLegacyMembers,
  computeMembershipValidity,
  createTransaction,
  fieldValue,
  findMemberByMobile,
  firebaseConfig,
  getDb,
  getMember,
  getTransaction,
  hashKey,
  normalizedMobile,
  resetForTests,
  serverTimestamp
};
