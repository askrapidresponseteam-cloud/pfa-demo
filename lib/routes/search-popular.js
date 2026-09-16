'use strict';

/* "Most asked" — the real one.
   ------------------------------------------------------------------------
   The overlay and search.html used to show a hand-written POPULAR list. This
   route replaces the guess with what visitors actually open.

   What is stored: a destination path and a counter. Nothing else. No query
   text, no IP, no cookie, no session id. Free-text queries are deliberately
   NOT recorded: they are unbounded user input and can carry names, phone
   numbers and case details, and PFA has no lawful reason to keep them.

   Why the client sends only a path and gets back only a path: the browser
   resolves the path against its own search index to get a title. A path that
   is not in that index is dropped at render time, so nothing written here can
   put invented words on the page. Worst case a flooded path is ignored.

   Storage: Firestore collection `searchPopular`, one doc per path
   (id = sha256 of the path). Falls back to process memory when Firebase is
   not configured, so preview deployments and `npm test` still work.
   ------------------------------------------------------------------------ */

const { fieldValue, getDb, hashKey } = require('../firebase');

const COLLECTION = 'searchPopular';
const READ_LIMIT = 40;          // paths returned to the client
const SCAN_LIMIT = 120;         // docs read before ranking
const CACHE_MS = 60 * 1000;     // in-process read cache
const MAX_PATH = 80;

/* Same-site relative paths only: `laws.html`, `laws.html#a33`, `index.html#adopt`.
   No scheme, no host, no protocol-relative `//evil`, no traversal, no query. */
const PATH_PATTERN = /^[a-z0-9][a-z0-9-]{0,60}\.html(#[a-z0-9][a-z0-9-]{0,60})?$/;

const memoryCounts = new Map();
let readCache = { expiresAt: 0, payload: null };

function firebaseConfigured() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function normalisePath(value) {
  /* Strings only. `String(['laws.html'])` is `'laws.html'`, so coercing first
     would let an array through; take the type as sent instead. */
  if (typeof value !== 'string') return '';
  const raw = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_PATH)
    .toLowerCase();
  if (!raw || !PATH_PATTERN.test(raw)) return '';
  /* The panel and the API are never a popular search. This sits in
     normalisePath because both the click that records a path and the list
     that serves it back go through here, so one guard closes both. Without
     it, a staff member clicking through to the panel could put its address
     into a list shown to the public. Mirrors PRIVATE in
     scripts/build-search-index.js. */
  if (/^\/?(admin\b|api\/)/i.test(raw)) return '';
  return raw;
}

/* A POST from another origin is not a visitor clicking a result, so refuse it.
   Absent headers (curl, same-origin fetch in some browsers) are allowed: the
   path allowlist above is the real guard, this only removes casual noise. */
function sameOrigin(request) {
  const headers = request.headers || {};
  const origin = headers.origin || headers.referer || '';
  if (!origin) return true;
  const host = headers['x-forwarded-host'] || headers.host || '';
  if (!host) return true;
  try {
    return new URL(origin).host === String(host).trim();
  } catch (_) {
    return false;
  }
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4096) raw = raw.slice(0, 4096);
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); }
    });
    request.on('error', () => resolve({}));
  });
}

function bumpMemory(path) {
  const next = (memoryCounts.get(path) || 0) + 1;
  memoryCounts.set(path, next);
  return next;
}

function rankMemory() {
  return Array.from(memoryCounts.entries())
    .map(([u, c]) => ({ u, c }))
    .sort((a, b) => b.c - a.c || a.u.localeCompare(b.u))
    .slice(0, READ_LIMIT);
}

async function record(path) {
  if (!firebaseConfigured()) return { source: 'memory', count: bumpMemory(path) };
  try {
    const db = getDb();
    const FieldValue = fieldValue();
    await db.collection(COLLECTION).doc(hashKey(path)).set({
      path,
      count: FieldValue.increment(1),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    readCache = { expiresAt: 0, payload: null };
    return { source: 'firestore' };
  } catch (error) {
    console.error('search-popular write failed:', error && error.message);
    return { source: 'memory', count: bumpMemory(path) };
  }
}

async function top() {
  const now = Date.now();
  if (readCache.payload && readCache.expiresAt > now) return readCache.payload;

  let items = [];
  let source = 'memory';
  if (firebaseConfigured()) {
    try {
      const snapshot = await getDb().collection(COLLECTION)
        .orderBy('count', 'desc')
        .limit(SCAN_LIMIT)
        .get();
      items = snapshot.docs
        .map((doc) => {
          const data = doc.data() || {};
          return { u: normalisePath(data.path), c: Number(data.count) || 0 };
        })
        .filter((row) => row.u && row.c > 0)
        .slice(0, READ_LIMIT);
      source = 'firestore';
    } catch (error) {
      console.error('search-popular read failed:', error && error.message);
      items = rankMemory();
    }
  } else {
    items = rankMemory();
  }

  const payload = {
    schemaVersion: 1,
    source,
    updatedAt: new Date().toISOString(),
    total: items.reduce((sum, row) => sum + row.c, 0),
    items
  };
  readCache = { expiresAt: now + CACHE_MS, payload };
  return payload;
}

function sendJson(response, statusCode, payload, cacheHeader) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheHeader || 'no-store');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('Allow', 'GET, POST, OPTIONS');
    return response.end();
  }

  if (request.method === 'GET') {
    try {
      const payload = await top();
      return sendJson(response, 200, payload, 'public, s-maxage=300, stale-while-revalidate=900');
    } catch (error) {
      return sendJson(response, 200, { schemaVersion: 1, source: 'unavailable', items: [], total: 0 });
    }
  }

  if (request.method === 'POST') {
    if (!sameOrigin(request)) return sendJson(response, 403, { code: 'FORBIDDEN_ORIGIN' });
    const body = await readBody(request);
    const path = normalisePath(body && (body.u || body.path));
    if (!path) return sendJson(response, 400, { code: 'INVALID_PATH' });
    await record(path);
    /* 202: counted, nothing for the caller to read. Keeps the click handler
       cheap so it never delays the navigation the visitor asked for. */
    return sendJson(response, 202, { ok: true });
  }

  response.setHeader('Allow', 'GET, POST, OPTIONS');
  return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
};

module.exports._private = { normalisePath, sameOrigin, rankMemory, memoryCounts, PATH_PATTERN };
