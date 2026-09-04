/* POST /api/caregiver/documents   { photo, proof }   -> { ok, token }

   The colony caregiver application needs two pictures: the applicant's
   photograph, which prints on the card, and a proof of address, which the
   reviewer checks against the colony given. Neither can travel with the fee -
   the application is a plain form POST that ends on CCAvenue's page, and the
   payment gateway must never see them.

   So they are sent here first, held under a random token, and the token
   rides along with the payment. When the fee clears, response.js moves them
   beside the application record, where the panel reads them through
   /api/admin/attachment like any other photograph. Anything left here for a
   day was never paid for; the email worker's cron drops its bytes. */

'use strict';

const crypto = require('crypto');
const firebase = require('../../firebase');
const S = require('../../submissions');

const COLLECTION = 'caregiverDocuments';
const HOLD_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 4 * 1024 * 1024;

const LABELS = { 1: 'Photograph', 2: 'Address proof' };

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve, reject) => {
    let raw = typeof request.body === 'string' ? request.body : '';
    /* Past the cap, stop keeping the bytes: rejecting alone left the listener
       attached and `raw` growing for as long as the sender cared to send. */
    let over = false;
    request.on('data', (chunk) => {
      if (over) return;
      raw += chunk;
      if (raw.length > MAX_BODY) { over = true; raw = ''; reject(new Error('Those pictures are too large.')); }
    });
    request.on('end', () => {
      if (over) return;
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { reject(new Error('Invalid body.')); }
    });
    request.on('error', reject);
  });
}

function isToken(value) { return /^[a-f0-9]{48}$/.test(String(value || '')); }

function createHandler(deps) {
  const getDb = (deps && deps.getDb) || (() => firebase.getDb());
  return async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { ok: false, error: 'Use POST.' });
  }
  if (S.rateLimited(S.clientIp(request))) return sendJson(response, 429, { ok: false, error: 'Too many attempts. Wait a few minutes.' });

  let body;
  try { body = await readBody(request); } catch (error) { return sendJson(response, 400, { ok: false, error: error.message }); }

  const photo = S.parsePhotos([body.photo]);
  if (photo.rejected.length || !photo.accepted.length) return sendJson(response, 422, { ok: false, error: 'Your photograph: ' + (photo.rejected[0] || 'attach a JPEG, PNG or WebP.'), field: 'photo' });
  const proof = S.parsePhotos([body.proof]);
  if (proof.rejected.length || !proof.accepted.length) return sendJson(response, 422, { ok: false, error: 'Address proof: ' + (proof.rejected[0] || 'attach a JPEG, PNG or WebP.'), field: 'proof' });

  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = new Date().toISOString();
  try {
    const db = getDb();
    const doc = db.collection(COLLECTION).doc(token);
    await doc.create({ createdAt, expiresAt: new Date(Date.now() + HOLD_MS).toISOString(), ip: S.clientIp(request) || '', consumed: false, swept: false });
    const files = [photo.accepted[0], proof.accepted[0]];
    for (let i = 0; i < files.length; i += 1) {
      await doc.collection('attachments').doc(String(i + 1)).create({
        label: LABELS[i + 1], contentType: files[i].contentType, size: files[i].bytes.length, bytes: files[i].bytes, createdAt
      });
    }
  } catch (error) {
    console.error('caregiver documents failed', error && error.message);
    return sendJson(response, 500, { ok: false, error: 'The pictures could not be kept just now. Try again.' });
  }
  return sendJson(response, 200, { ok: true, token });
  };
}

const handler = createHandler();

/* Called by response.js once the fee has cleared: copies the two pictures
   beside the application and removes the staging copy. Returns how many were
   attached, so the record can say so. Missing staging (a replayed callback,
   or the day-old sweep) attaches nothing rather than failing the record. */
async function attachTo(db, token, submissionRef, createdAt) {
  if (!isToken(token)) return 0;
  const staging = db.collection(COLLECTION).doc(token);
  const head = await staging.get();
  if (!head.exists || (head.data() || {}).consumed) return 0;   // unknown, or a replayed callback
  let count = 0;
  for (let n = 1; n <= 2; n += 1) {
    const snap = await staging.collection('attachments').doc(String(n)).get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    await submissionRef.collection('attachments').doc(String(n)).create({
      label: data.label || LABELS[n], contentType: data.contentType, size: data.size, bytes: data.bytes, createdAt
    });
    count += 1;
  }
  /* Nothing on the server deletes a record (test/admin-master-record). The
     staging copy is marked used and its bytes dropped, so it cannot be
     attached twice and does not go on costing storage. */
  await staging.set({ consumed: true, movedTo: submissionRef.id, consumedAt: createdAt }, { merge: true });
  for (let n = 1; n <= count; n += 1) await staging.collection('attachments').doc(String(n)).set({ bytes: null, droppedAt: createdAt }, { merge: true });
  return count;
}

/* Pictures uploaded but never paid for. Run from the daily cron; anything past
   its hold is deleted, attachments first. Best effort: a failure here is
   logged, never surfaced, because nothing depends on it. */
async function sweep(db, nowIso) {
  const now = nowIso || new Date().toISOString();
  let swept = 0;
  try {
    const stale = await db.collection(COLLECTION).where('expiresAt', '<', now).where('swept', '==', false).limit(50).get();
    for (const snap of stale.docs) {
      if ((snap.data() || {}).consumed) { await snap.ref.set({ swept: true }, { merge: true }); continue; }
      for (let n = 1; n <= 2; n += 1) await snap.ref.collection('attachments').doc(String(n)).set({ bytes: null, droppedAt: now }, { merge: true });
      await snap.ref.set({ swept: true, sweptAt: now }, { merge: true });
      swept += 1;
    }
  } catch (error) {
    console.error('caregiver documents sweep failed', error && error.message);
  }
  return swept;
}

module.exports = handler;
module.exports.sweep = sweep;
module.exports._private = { createHandler };
module.exports.attachTo = attachTo;
module.exports.isToken = isToken;
module.exports.LABELS = LABELS;
module.exports.COLLECTION = COLLECTION;
