'use strict';

/* GET /api/field-note-photo?ref=PFA-W-2026-00007&n=1
 *
 * A photograph sent with a field note, for the newsroom page. The bytes live
 * in Firestore beside the submission (lib/routes/pfa-submissions.js), where
 * only the admin panel can otherwise reach them. This is the one public way
 * out, and it opens only for a note the desk has published: the same flag
 * /api/field-notes reads. A photograph on an unpublished, handled or spam
 * note is a 404 here exactly as if it did not exist.
 *
 * The image bytes are served as an image, sniffed for type, and cached the
 * way the note itself is. Nothing else from the record travels with them.
 */

const firebase = require('../firebase');
const S = require('../submissions');

const CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

function bytesOf(data) {
  const b = data && data.bytes;
  if (Buffer.isBuffer(b)) return b;
  if (b && typeof b.toUint8Array === 'function') return Buffer.from(b.toUint8Array());
  return Buffer.from(b || '');
}

module.exports = async function fieldNotePhoto(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    return response.end();
  }
  const query = request.query || {};
  const ref = String(query.ref || '').trim().toUpperCase().replace(/\s+/g, '');
  const n = parseInt(query.n, 10);
  if (!S.isReference(ref) || !/^PFA-W-/.test(ref) || !(n >= 1 && n <= S.MAX_PHOTOS)) {
    response.statusCode = 400;
    return response.end();
  }
  try {
    const db = firebase.db();
    const note = await db.collection('submissions').doc(ref).get();
    const d = note.exists ? (note.data() || {}) : {};
    const published = d.kind === 'PFA-W' && d.wall && d.wall.published === true;
    if (!published) { response.statusCode = 404; return response.end(); }

    const shot = await db.collection('submissions').doc(ref).collection('attachments').doc(String(n)).get();
    if (!shot.exists) { response.statusCode = 404; return response.end(); }
    const data = shot.data() || {};
    const bytes = bytesOf(data);
    const type = S.imageType(bytes) || data.contentType || '';
    if (!bytes.length || !/^image\//.test(type)) { response.statusCode = 404; return response.end(); }

    response.statusCode = 200;
    response.setHeader('Content-Type', type);
    response.setHeader('Content-Length', String(bytes.length));
    response.setHeader('Cache-Control', CACHE);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    response.statusCode = 404;
    return response.end();
  }
};
