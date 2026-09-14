'use strict';

/* GET /api/wall  the films an admin has put on the wall, and nothing else.
 *
 * The wall used to be a hardcoded array in wall.html, so "approved" meant a
 * developer editing a page. This is the read path that makes approval real:
 * a visitor submits, an admin puts it on the wall, and it appears.
 *
 * Two things this deliberately does not do.
 *
 * It does not read `status`. The vocabulary there is new, in-progress,
 * handled and spam, and `handled` means dealt with, not fit to publish. Most
 * submissions end up handled and should never appear on a public page, so
 * publishing on that field would put every rejected and awkward one on the
 * wall the moment someone tidied the queue. Publication is its own flag,
 * `wall.published`, set by its own admin action.
 *
 * It does not serve the record. A submission carries the sender's email,
 * mobile and IP. What a wall needs is a title, a credit and a link, so that
 * is all that leaves this file: everything else is dropped on the way out
 * rather than filtered on the way in, because a projection that lists what to
 * keep cannot leak a field added later.
 *
 * The browser never reads the collection. Firestore rules stay shut and this
 * runs with the admin SDK, which is also why the link is re-checked here
 * against the same host list the submission was accepted under: a record in
 * the database is not evidence that it is still safe to embed.
 */

const firebase = require('../firebase');
const FIELDS = require('../submission-fields');

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';
const LIMIT = 120;

/* The same six the form accepts. Read from the field spec rather than typed
   again, so a host added there cannot be one this file quietly refuses. */
const SPEC = FIELDS.specFor('PFA-S') || {};
const HOSTS = (SPEC.hosts && SPEC.hosts.url) || [];

function hostAllowed(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
  return HOSTS.some((name) => host === name || host.endsWith('.' + name));
}

/* Which player this film is for. The theatre takes a YouTube id, a Vimeo id
   or a file; anything else it cannot drive, and a link it cannot drive is a
   link that would open a blank stage. */
function playable(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') return { yt: u.pathname.slice(1).split('/')[0] };
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const v = u.searchParams.get('v');
    if (v) return { yt: v };
    const m = /\/(embed|shorts|live)\/([\w-]+)/.exec(u.pathname);
    if (m) return { yt: m[2] };
    return null;
  }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const m = /\/(\d+)/.exec(u.pathname);
    return m ? { vimeo: m[1] } : null;
  }
  return null;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/* Which wall a film belongs on. The form offers two sentences; the theatre
   knows two words. */
function wallOf(value) {
  return /short/i.test(String(value || '')) ? 'short' : 'long';
}

function toFilm(doc) {
  const d = doc.data() || {};
  const given = d.data || {};
  if (!given.url || !hostAllowed(given.url)) return null;
  const source = playable(given.url);
  if (!source) return null;

  const film = {
    wall: wallOf(given.wall),
    title: clean(given.title || given.caption || given.name, 120) || 'Untitled',
    credit: clean(given.name, 80),
    ref: doc.id
  };
  if (source.yt) film.yt = source.yt;
  if (source.vimeo) film.vimeo = source.vimeo;
  if (typeof d.wall === 'object' && d.wall && Number(d.wall.start) > 0) film.start = Math.floor(Number(d.wall.start));
  return film;
}

module.exports = async function wall(request, response) {
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
      .where('kind', '==', 'PFA-S')
      .where('wall.published', '==', true)
      .limit(LIMIT)
      .get();

    const films = [];
    snap.forEach((doc) => { const film = toFilm(doc); if (film) films.push(film); });

    /* Newest last, so the wall reads in the order things arrived rather than
       in whatever order the index returns them. */
    films.sort((a, b) => String(a.ref).localeCompare(String(b.ref)));
    response.statusCode = 200;
    return response.end(JSON.stringify({ ok: true, films }));
  } catch (error) {
    /* An empty wall is the correct answer to a failure here. The page shows
       its waiting state, which is a page, rather than an error, which is a
       fault the visitor can do nothing about. */
    response.statusCode = 200;
    return response.end(JSON.stringify({ ok: true, films: [], degraded: true }));
  }
};

module.exports.toFilm = toFilm;
module.exports.playable = playable;
module.exports.hostAllowed = hostAllowed;
module.exports.wallOf = wallOf;
