/* POST /api/pfa-submissions        { kind, data, page }   -> { ok, reference }
   GET  /api/pfa-submissions?reference=PFA-C-2026-00042&contact=asha@example.com

   The server issues the reference. The browser sends what was typed and gets
   a number back; if the number never arrives, the form says so instead of
   showing one that was never recorded.

   Following a submission needs the number and the email or mobile given with
   it. What comes back is the status and when it changed, never the report. */

'use strict';

const firebase = require('../firebase');
const mail = require('../caretaker-mail');
const RULES = require('../../assets/field-rules.js');
const S = require('../submissions');

const ALLOWED_KINDS = new Set(Object.keys(S.KIND_LABELS));
const MAX_BODY = 20000;
const ACK_TIMEOUT_MS = 2500;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve, reject) => {
    let raw = typeof request.body === 'string' ? request.body : '';
    if (raw) {
      try { return resolve(JSON.parse(raw)); } catch (_) { return reject(new Error('Invalid submission body.')); }
    }
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) reject(new Error('Submission too large.'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { reject(new Error('Invalid submission body.')); }
    });
    request.on('error', reject);
  });
}

/* Strip control characters and trim, but do NOT truncate here: the length
   check belongs to validation, which can tell the sender their entry is too
   long. Quietly cutting a rescue report in half and storing the stump is worse
   than refusing it. The overall body cap already bounds memory. */
function cleanValue(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_BODY);
}

function cleanFields(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  Object.keys(data).slice(0, 40).forEach((key) => {
    const safeKey = cleanValue(key).slice(0, 60);
    if (safeKey) out[safeKey] = cleanValue(data[key]);
  });
  return out;
}

/* The browser checked these already. So does this, because the browser is not
   a security boundary: anyone can POST here directly. Same rule file both
   sides, so the two can never disagree about what a valid mobile number is. */
function validateFields(fields) {
  const errors = [];
  const clean = {};
  Object.keys(fields).forEach((key) => {
    const raw = fields[key];
    if (!String(raw || '').trim()) { clean[key] = raw; return; }
    const message = RULES.checkField(key, raw, { required: false });
    if (message) errors.push({ field: key, message });
    clean[key] = RULES.normaliseField(key, raw);
  });
  return { errors, clean };
}

function emailIn(fields) {
  const values = Object.values(fields || {}).map((v) => String(v == null ? '' : v).trim());
  const found = values.find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v));
  return found ? found.toLowerCase() : '';
}

function nameIn(fields) {
  const key = Object.keys(fields || {}).find((k) => /^(name|fullname|full name|your name)$/i.test(k));
  return key ? RULES.nameCase(String(fields[key])) : '';
}

function siteUrl(request) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim();
  try { const u = new URL(configured); if (/^https?:$/.test(u.protocol)) return u.origin; } catch (_) { /* fall through */ }
  const host = (request.headers || {})['x-forwarded-host'] || (request.headers || {}).host || 'pfa-full-website.vercel.app';
  return `https://${host}`;
}

function createHandler(deps) {
  const { getDb, deliver, isConfigured, now } = deps;

  async function receive(request, response) {
    let body;
    try { body = await readBody(request); } catch (error) {
      return sendJson(response, 400, { ok: false, error: error.message });
    }
    const kind = cleanValue(body.kind).toUpperCase().slice(0, 30);
    if (!ALLOWED_KINDS.has(kind)) return sendJson(response, 400, { ok: false, error: 'Unknown submission type.' });

    const { errors, clean } = validateFields(cleanFields(body.data));
    if (errors.length) {
      return sendJson(response, 422, { ok: false, error: 'Some fields did not pass validation.', fields: errors });
    }

    const db = getDb();
    const nowMs = now();
    const reference = await S.allocateReference(db, kind, nowMs);
    const createdAt = new Date(nowMs).toISOString();
    const record = {
      reference,
      kind,
      kindLabel: S.KIND_LABELS[kind],
      fields: clean,
      contactKeys: S.contactKeysFor(clean),
      page: cleanValue(body.page).slice(0, 120),
      status: 'new',
      history: [{ status: 'new', at: createdAt }],
      createdAt,
      receivedAtMs: nowMs
    };
    /* create(), not set(): the number was just issued, so the document cannot
       exist - and if it somehow did, silently merging into it is the one
       thing this must never do. */
    await db.collection('submissions').doc(reference).create(record);

    /* The acknowledgement is a courtesy, never a condition: the number is
       already on record, so a slow or unconfigured mail provider must not
       hold up or fail the response. */
    const to = emailIn(clean);
    let acknowledged = false;
    if (to && isConfigured()) {
      try {
        await Promise.race([
          deliver({ to, template: 'submission_received', payload: {
            name: nameIn(clean), reference, kindLabel: S.KIND_LABELS[kind], receivedAt: createdAt,
            followUrl: `${siteUrl(request)}/network.html#follow=${encodeURIComponent(reference)}`
          } }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('acknowledgement timed out')), ACK_TIMEOUT_MS))
        ]);
        acknowledged = true;
      } catch (error) {
        console.warn('submission acknowledgement not sent', { reference, message: error && error.message });
      }
    }

    return sendJson(response, 200, { ok: true, reference, kindLabel: S.KIND_LABELS[kind], receivedAt: createdAt, acknowledged });
  }

  async function follow(request, response) {
    if (S.rateLimited(S.clientIp(request), now())) {
      return sendJson(response, 429, { ok: false, code: 'SLOW_DOWN', error: 'Too many lookups from this connection. Try again in a few minutes.' });
    }
    const query = request.query || {};
    const reference = cleanValue(query.reference).toUpperCase().replace(/\s+/g, '').slice(0, 40);
    const contact = cleanValue(query.contact).slice(0, 120);
    if (!reference || !S.isReference(reference)) {
      return sendJson(response, 400, { ok: false, code: 'BAD_REFERENCE', error: 'That does not look like a PFA reference. It reads like PFA-C-2026-00042.' });
    }

    const snapshot = await getDb().collection('submissions').doc(reference).get();
    if (!snapshot.exists) {
      return sendJson(response, 404, { ok: false, code: 'NOT_FOUND', error: 'No submission carries that number. Check it against what you were given when you sent it.' });
    }
    const record = Object.assign({ reference }, snapshot.data());
    const match = S.contactMatches(record, contact);
    if (match.required && !match.ok) {
      return sendJson(response, 403, {
        ok: false,
        code: contact ? 'CONTACT_MISMATCH' : 'CONTACT_NEEDED',
        error: contact
          ? 'That number exists, but the email or mobile does not match what was given with it.'
          : 'Add the email or mobile you gave with it, so only you can follow it.'
      });
    }
    return sendJson(response, 200, Object.assign({ ok: true }, S.publicView(record)));
  }

  return async function handler(request, response) {
    try {
      if (request.method === 'POST') return await receive(request, response);
      if (request.method === 'GET') return await follow(request, response);
      response.setHeader('Allow', 'GET, POST');
      return sendJson(response, 405, { ok: false, error: 'Use POST to send, GET to follow.' });
    } catch (error) {
      console.error('pfa-submissions failed', error && error.message);
      return sendJson(response, 500, { ok: false, error: request.method === 'GET'
        ? 'The status could not be read right now. Try again in a minute.'
        : 'Could not record the submission right now. Nothing was saved - please try again.' });
    }
  };
}

module.exports = createHandler({
  getDb: firebase.getDb,
  deliver: mail.deliver,
  isConfigured: mail.isConfigured,
  now: () => Date.now()
});
module.exports._private = { createHandler, cleanFields, validateFields, emailIn, nameIn };
