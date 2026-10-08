'use strict';

/* GET /api/field-notes  the work people have sent the newsroom and an admin
 * has published, and nothing else.
 *
 * The newsroom takes field notes through its form (PFA-W, newsroom.html):
 * a rescue, a colony sterilised, a case won, a drive held. They arrive as
 * submissions, an admin reads each one and publishes it with the same action
 * that puts a film on the wall, and this is the read path that makes that
 * publication real on the page.
 *
 * Built on the same two rules as lib/routes/wall.js.
 *
 * It does not read `status`: handled means dealt with, not fit to print.
 * Publication is `wall.published`, its own flag, set by its own action.
 *
 * It does not serve the record. What leaves here is a headline, the account,
 * where, what kind of work, a credit and a link if one was given. The
 * sender's mobile, email and IP never do: the projection lists what to keep,
 * so a field added later cannot leak by default.
 */

const firebase = require('../firebase');

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';
const LIMIT = 60;

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/* A link is passed through only if it is one a browser can open safely. */
function safeUrl(value) {
  let u;
  try { u = new URL(String(value || '')); } catch { return ''; }
  return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href.slice(0, 400) : '';
}

function toFieldNote(doc) {
  const d = doc.data() || {};
  const given = d.data || d.fields || {};
  const title = clean(given.title, 120);
  const story = clean(given.story, 1200);
  if (!title || !story) return null;

  const out = {
    ref: doc.id,
    title,
    story,
    type: clean(given.type, 80),
    city: clean(given.city, 60),
    credit: clean(given.organisation || given.name, 80),
    at: d.createdAt || null,
    /* How many photographs came with it. The bytes are served by
       /api/field-note-photo, and only for a published note. */
    photos: Math.max(0, Math.min(3, Number(d.attachments) || 0))
  };
  const url = safeUrl(given.url);
  if (url) out.url = url;
  return out;
}

module.exports = async function fieldNotes(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    return response.end(JSON.stringify({ ok: false, error: 'Use GET.' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', CACHE);

  try {
    const db = firebase.db();
    const snap = await db.collection('submissions')
      .where('kind', '==', 'PFA-W')
      .where('wall.published', '==', true)
      .limit(LIMIT)
      .get();

    const items = [];
    snap.forEach((doc) => { const item = toFieldNote(doc); if (item) items.push(item); });

    /* Newest first: a newsroom reads from the latest. References count up,
       so the id orders them without trusting a timestamp field. */
    items.sort((a, b) => String(b.ref).localeCompare(String(a.ref)));
    response.statusCode = 200;
    return response.end(JSON.stringify({ ok: true, notes: items }));
  } catch (error) {
    /* An empty strip is the correct answer to a failure here: the page shows
       its waiting state, which is a page, not an error. */
    response.statusCode = 200;
    return response.end(JSON.stringify({ ok: true, notes: [], degraded: true }));
  }
};

module.exports.toFieldNote = toFieldNote;
module.exports.safeUrl = safeUrl;
