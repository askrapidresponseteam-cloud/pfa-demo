'use strict';

/* GET /api/field-note-photo?ref=PFA-W-2026-00007&n=1
 *
 * A photograph sent with a field note, for the newsroom page. The bytes live
 * in the private Storage bucket (or, for older notes, in Firestore beside the
 * submission; lib/file-store.js reads either), where only the admin panel can
 * otherwise reach them. This is the one public way out, and it opens only for
 * a note the desk has published: the same flag /api/field-notes reads. A
 * photograph on an unpublished, handled or spam note is a 404 here exactly as
 * if it did not exist.
 *
 * The image bytes are served as an image, sniffed for type. Nothing else from
 * the record travels with them.
 *
 * 8 Oct 2026 (review D6): this called firebase.db(), which lib/firebase.js
 * has never exported, so every photograph was a 404 and the test, which
 * swapped in a stand-in firebase module, could not see it. It uses getDb()
 * now and the test drives the real module.
 *
 * Caching, same date: a CDN keeps what it is told to keep, and the desk can
 * unpublish a note at any time. A day of stale-while-revalidate meant a
 * withdrawn photograph could go on being served for a day. Now a shared cache
 * keeps a photograph for a minute and may serve it stale for five more while
 * it checks; a 404 is kept for half a minute (enough to blunt a burst of
 * requests for a note that is not there); a failure is never cached.
 */

const firebase = require('../firebase');
const S = require('../submissions');
const FILES = require('../file-store');

const CACHE = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';
const CACHE_MISS = 'public, max-age=0, s-maxage=30';

function notFound(response) {
  response.statusCode = 404;
  response.setHeader('Cache-Control', CACHE_MISS);
  return response.end();
}

function unavailable(response) {
  response.statusCode = 503;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Retry-After', '30');
  return response.end();
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
  let data;
  try {
    const db = firebase.getDb();
    const note = await db.collection('submissions').doc(ref).get();
    const d = note.exists ? (note.data() || {}) : {};
    const published = d.kind === 'PFA-W' && d.wall && d.wall.published === true;
    if (!published) return notFound(response);

    const shot = await db.collection('submissions').doc(ref).collection('attachments').doc(String(n)).get();
    if (!shot.exists) return notFound(response);
    data = shot.data() || {};
  } catch (error) {
    /* The database did not answer. Not a 404: that would be cached as if
       the photograph did not exist. */
    console.error('field-note-photo: lookup failed', { ref, n, message: String(error && error.message).slice(0, 200) });
    return unavailable(response);
  }

  let bytes;
  try {
    bytes = (await FILES.readStrict(data)) || Buffer.alloc(0);
  } catch (error) {
    console.error('field-note-photo: file not readable', { ref, n, reason: error.reason, message: String(error.message).slice(0, 200) });
    return error.code === 'FILE_MISSING' ? notFound(response) : unavailable(response);
  }
  const type = S.imageType(bytes) || data.contentType || '';
  if (!bytes.length || !/^image\//.test(type)) return notFound(response);

  response.statusCode = 200;
  response.setHeader('Content-Type', type);
  response.setHeader('Content-Length', String(bytes.length));
  response.setHeader('Cache-Control', CACHE);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.end(request.method === 'HEAD' ? undefined : bytes);
};
