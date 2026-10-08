'use strict';

/* GET  /api/visits          the running total, cached briefly at the edge
   POST /api/visits          count this visit, then return the new total

   One document, one atomic increment. FieldValue.increment is a transform, so
   there is no read-modify-write and two visitors landing at the same instant
   cannot overwrite each other.

   A visit, not a page view. The browser counts once per session (see the footer
   script), so reading six pages is one visit. That is both the honest meaning of
   the word and the thing that keeps this inside Firestore's free tier: at a
   thousand visits a day this is 1k writes against an allowance of 20k.

   The number is never invented. If Firestore is unreachable the endpoint says so
   and the footer stays silent rather than showing a made-up figure. */

const { getDb, fieldValue } = require('../firebase');

const DOC = 'counters/visits';
const MAX_AGE = 20;        /* seconds the edge may serve a stale total */

function sendJson(response, statusCode, payload, cache) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cache || 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST.' });
  }

  let db;
  try {
    db = getDb();
  } catch (error) {
    return sendJson(response, 503, { code: 'COUNTER_UNAVAILABLE', message: 'The counter is not available.' });
  }

  const ref = db.doc(DOC);

  try {
    if (method === 'POST') {
      /* fieldValue() from lib/firebase.js, which loads the firebase-admin/firestore
         subpath. The root namespace is out of bounds here by house rule. */
      await ref.set(
        { total: fieldValue().increment(1), updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
    const snap = await ref.get();
    const total = snap.exists ? Number(snap.data().total) || 0 : 0;
    /* A POST must not be cached: the next visitor has to be counted too. */
    return sendJson(response, 200, { total }, method === 'POST'
      ? 'no-store'
      : `public, max-age=0, s-maxage=${MAX_AGE}, stale-while-revalidate=120`);
  } catch (error) {
    console.error('visit counter failed', { message: error && error.message });
    return sendJson(response, 503, { code: 'COUNTER_UNAVAILABLE', message: 'The counter is not available.' });
  }
};

module.exports._DOC = DOC;
