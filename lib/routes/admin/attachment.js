/* GET /api/admin/attachment?reference=PFA-C-2026-00042&n=1

   A photo sent with a report, for the panel. The bytes live in Firestore
   beside the submission and nowhere public; this is the only way out, and
   it needs an administrator's token. Returned as base64 in JSON because the
   panel fetches with a bearer header, which an <img src> cannot send. */

'use strict';

const { requireAdmin } = require('../../../lib/admin-auth');
const { getDb } = require('../../../lib/firebase');
const S = require('../../../lib/submissions');

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }
  const who = await requireAdmin(request, response, 'submissions');
  if (!who) return;

  const query = request.query || {};
  const reference = String(query.reference || '').trim().toUpperCase().replace(/\s+/g, '');
  const n = parseInt(query.n, 10);
  if (!S.isReference(reference) || !(n >= 1 && n <= S.MAX_PHOTOS)) {
    return sendJson(response, 400, { code: 'BAD_REQUEST', message: 'Which photo?' });
  }

  try {
    const snapshot = await getDb().collection('submissions').doc(reference).collection('attachments').doc(String(n)).get();
    if (!snapshot.exists) return sendJson(response, 404, { code: 'NOT_FOUND', message: 'No such photo.' });
    const data = snapshot.data() || {};
    const bytes = Buffer.isBuffer(data.bytes) ? data.bytes
      : (data.bytes && typeof data.bytes.toUint8Array === 'function') ? Buffer.from(data.bytes.toUint8Array())
        : Buffer.from(data.bytes || '');
    return sendJson(response, 200, {
      ok: true, reference, n,
      label: data.label || '',
      contentType: S.imageType(bytes) || data.contentType || 'image/jpeg',
      size: bytes.length,
      data: bytes.toString('base64')
    });
  } catch (error) {
    console.error('admin attachment failed', error && error.message);
    return sendJson(response, 500, { code: 'SERVER_ERROR', message: 'That photo could not be read.' });
  }
};
