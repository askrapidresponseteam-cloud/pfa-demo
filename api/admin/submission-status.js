/* POST /api/admin/submission-status   { reference, status, note? }

   Marks a submission new / in-progress / handled / spam.

   A register you can only read is a list; a register you can mark is a queue.
   Without this, two people work the same complaint and a third is missed - so
   the status change is the one write the panel is allowed to make.

   Every change records who made it. `handledBy` is the administrator's own
   identity from their token, not something the browser sends, so the trail
   cannot be forged by editing the request. */

'use strict';

const { requireAdmin } = require('../../lib/admin-auth');
const { getDb, serverTimestamp } = require('../../lib/firebase');

const ALLOWED = new Set(['new', 'in-progress', 'handled', 'spam']);

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  if (typeof request.body === 'string') {
    try { return Promise.resolve(JSON.parse(request.body || '{}')); } catch (_) { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); }
    });
    request.on('error', () => resolve({}));
  });
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  const who = await requireAdmin(request, response);
  if (!who) return;

  const body = await readBody(request);
  const reference = String(body.reference || '').trim().toUpperCase();
  const status = String(body.status || '').trim().toLowerCase();
  const note = String(body.note || '').trim().slice(0, 500);

  if (!reference) return sendJson(response, 400, { code: 'NO_REFERENCE', message: 'Which submission?' });
  if (!ALLOWED.has(status)) {
    return sendJson(response, 400, {
      code: 'BAD_STATUS',
      message: 'Status must be new, in-progress, handled or spam.'
    });
  }

  try {
    const db = getDb();
    const ref = db.collection('submissions').doc(reference);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return sendJson(response, 404, { code: 'NOT_FOUND', message: 'No submission with that reference.' });
    }

    await ref.set({
      status,
      handledBy: who.email || who.uid,
      handledNote: note,
      handledAt: new Date().toISOString(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    return sendJson(response, 200, { ok: true, reference, status, handledBy: who.email || who.uid });
  } catch (error) {
    console.error('submission status failed', error && error.message);
    return sendJson(response, 500, { code: 'SERVER_ERROR', message: 'That could not be saved.' });
  }
};
