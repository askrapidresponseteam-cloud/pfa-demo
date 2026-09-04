/* POST /api/pfa-submissions        { kind, data, page }   -> { ok, reference }
   GET  /api/pfa-submissions?reference=PFA-C-2026-00042&contact=asha@example.com

   The server issues the reference. The browser sends what was typed and gets
   a number back; if the number never arrives, the form says so instead of
   showing one that was never recorded.

   Following a submission needs the number and the email or mobile given with
   it. What comes back is the status and when it changed, never the report. */

'use strict';

const firebase = require('../firebase');
const mail = require('../caregiver-mail');
const RULES = require('../../assets/field-rules.js');
const S = require('../submissions');
const VENDOR_RX = require('../vendor-prescription');

const ALLOWED_KINDS = new Set(Object.keys(S.KIND_LABELS));
const MAX_TEXT = 20000;          // any one field
const MAX_BODY = 4 * 1024 * 1024; // the whole request, photos included
const ACK_TIMEOUT_MS = 2500;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

/* A plain HTML form, with no script running, posts
   application/x-www-form-urlencoded. That is what help.html sends from a
   phone whose JavaScript never arrived, and it is the one request on this
   site that must work in that state. */
function isFormPost(request) {
  return /application\/x-www-form-urlencoded/i.test(String((request.headers || {})['content-type'] || ''));
}

function parseForm(raw) {
  const out = {};
  new URLSearchParams(String(raw || '')).forEach((value, key) => { out[key] = value; });
  return out;
}

function readBody(request) {
  const form = isFormPost(request);
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve, reject) => {
    let raw = typeof request.body === 'string' ? request.body : '';
    const finish = () => {
      if (form) return resolve(parseForm(raw));
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { reject(new Error('Invalid submission body.')); }
    };
    if (raw) return finish();
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) reject(new Error('Submission too large.'));
    });
    request.on('end', finish);
    request.on('error', reject);
  });
}

/* The flat fields of a form post, lifted into the shape the JSON path uses:
   kind and page are the envelope, everything else is the report. */
function envelopeFromForm(flat) {
  const data = Object.assign({}, flat);
  const kind = data.kind; const page = data.page;
  delete data.kind; delete data.page; delete data.photos;
  return { kind, page, data, photos: [] };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* What a browser with no script gets back: a page it can read, not JSON it
   cannot. Self-contained, so it renders on the same connection that failed
   to deliver the site's scripts. */
function sendHtml(response, status, { title, lead, reference, followUrl, errors }) {
  const list = (errors || []).map((e) => `<li>${escapeHtml(e.message)}</li>`).join('');
  const refBlock = reference
    ? `<p class="k">Your reference number</p><p class="ref">${escapeHtml(reference)}</p>`
      + `<p>Keep it. You can follow what happens with it and the mobile or email you gave.</p>`
      + `<p><a class="b" href="${escapeHtml(followUrl)}">Follow it</a> <a class="b l" href="/ask.html">Ask us anything</a></p>`
    : `${list ? `<ul>${list}</ul>` : ''}<p><a class="b" href="javascript:history.back()">Go back and fix it</a> <a class="b l" href="/ask.html">Ask us anything</a></p>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} | PFA</title>`
    + '<style>body{margin:0;padding:28px 20px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0E1116;background:#fff}main{max-width:560px;margin:auto}h1{font-size:30px;line-height:1.05;letter-spacing:-.03em;margin:0 0 14px}p{margin:12px 0}.k{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#0653EE;margin-bottom:2px}.ref{font-family:ui-monospace,Menlo,monospace;font-size:26px;margin:0 0 8px;padding:14px 16px;background:#EEF4FF;border:1px solid rgba(6,83,238,.18)}ul{padding-left:20px;color:#B42318}.b{display:inline-block;margin:6px 8px 0 0;padding:13px 18px;background:#0E1116;color:#fff;text-decoration:none;font-weight:600;border:1px solid #0E1116}.b.l{background:#fff;color:#0E1116}</style></head>'
    + `<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(lead)}</p>${refBlock}</main></body></html>`;
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.end(html);
}

/* Strip control characters and trim, but do NOT truncate here: the length
   check belongs to validation, which can tell the sender their entry is too
   long. Quietly cutting a rescue report in half and storing the stump is worse
   than refusing it. The overall body cap already bounds memory. */
function cleanValue(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT);
}

function cleanFields(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  Object.keys(data).slice(0, 40).forEach((key) => {
    const safeKey = cleanValue(key).slice(0, 60);
    if (safeKey && typeof data[key] !== 'object') out[safeKey] = cleanValue(data[key]);
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
    const form = isFormPost(request);
    const fail = (status, error, fields) => (form
      ? sendHtml(response, status, { title: 'Not sent', lead: error, errors: fields })
      : sendJson(response, status, Object.assign({ ok: false, error }, fields ? { fields } : {})));

    let body;
    try { body = await readBody(request); } catch (error) {
      return fail(400, error.message);
    }
    if (form) body = envelopeFromForm(body);
    const kind = cleanValue(body.kind).toUpperCase().slice(0, 30);
    if (!ALLOWED_KINDS.has(kind)) return fail(400, 'Unknown submission type.');

    const { errors, clean } = validateFields(cleanFields(body.data));
    if (errors.length) {
      return fail(422, 'Some fields did not pass validation.', errors);
    }

    const db = getDb();
    const nowMs = now();

    /* The same submission sent twice - a double press, or a retry after the
       first answer was lost on the way back - is one record. The browser
       sends a key for what it is sending; the reference issued under that key
       is kept, and a replay is answered with it rather than with a second
       number. A form posted with no script has no key and no such guard,
       which is the price of working without one. */
    const requestId = cleanValue(body.clientRequestId).slice(0, 120);
    const dedupe = requestId ? db.collection('submissionIdempotency').doc(firebase.hashKey(`${kind}:${requestId}`)) : null;
    if (dedupe) {
      const seen = await dedupe.get();
      if (seen.exists && seen.data() && seen.data().reference) {
        const earlier = seen.data();
        if (form) {
          return sendHtml(response, 200, {
            title: 'Sent to PFA',
            lead: `${S.KIND_LABELS[kind]} received. A named person at PFA can now see it.`,
            reference: earlier.reference,
            followUrl: `/track.html#ref=${encodeURIComponent(earlier.reference)}`
          });
        }
        return sendJson(response, 200, {
          ok: true, reference: earlier.reference, kindLabel: S.KIND_LABELS[kind],
          receivedAt: earlier.createdAt || null, acknowledged: Boolean(earlier.acknowledged),
          attachments: Number(earlier.attachments) || 0, duplicate: true
        });
      }
    }

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
    /* Photos travel as data URLs, shrunk by the browser. They are checked
       here by their bytes, not their label, and kept as private documents
       beside the report - never on a public image host - so only the panel
       can show them. */
    const photos = S.parsePhotos(body.photos);
    if (photos.rejected.length) {
      return fail(422, photos.rejected[0], [{ field: 'photos', message: photos.rejected[0] }]);
    }
    record.attachments = photos.accepted.length;

    /* create(), not set(): the number was just issued, so the document cannot
       exist - and if it somehow did, silently merging into it is the one
       thing this must never do. */
    const doc = db.collection('submissions').doc(reference);
    await doc.create(record);
    for (let i = 0; i < photos.accepted.length; i += 1) {
      const photo = photos.accepted[i];
      await doc.collection('attachments').doc(String(i + 1)).create({
        contentType: photo.contentType, size: photo.bytes.length, bytes: photo.bytes, createdAt
      });
    }

    /* A prescription is offered to the seller only after it is safely on record
       and only from here, never from the browser. See lib/vendor-prescription.js
       for why. It cannot fail the submission: the person already has a number
       and a named person at PFA can already see the file. */
    if (kind === 'PFA-RX' && photos.accepted.length && VENDOR_RX.configured()) {
      const handoff = await VENDOR_RX.forwardPrescription({
        reference,
        contentType: photos.accepted[0].contentType,
        bytes: photos.accepted[0].bytes,
        product: cleanValue(clean.notes).slice(0, 200)
      });
      try {
        await doc.update({ vendorHandoff: handoff });
      } catch (error) {
        console.warn('could not record the prescription hand-off', { reference });
      }
    }

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
            followUrl: `${siteUrl(request)}/track.html#ref=${encodeURIComponent(reference)}`
          } }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('acknowledgement timed out')), ACK_TIMEOUT_MS))
        ]);
        acknowledged = true;
      } catch (error) {
        console.warn('submission acknowledgement not sent', { reference, message: error && error.message });
      }
    }

    if (dedupe) {
      /* create(), so two racing replays cannot both write; the loser simply
         finds the record on its next read. Never allowed to fail the response:
         the number is issued and the record exists. */
      try {
        await dedupe.create({ reference, kind, createdAt, acknowledged, attachments: photos.accepted.length });
      } catch (error) {
        if (!(error && (error.code === 6 || /already exists/i.test(String(error.message))))) {
          console.warn('submission idempotency key not recorded', { reference, message: error && error.message });
        }
      }
    }

    if (form) {
      return sendHtml(response, 200, {
        title: 'Sent to PFA',
        lead: `${S.KIND_LABELS[kind]} received. A named person at PFA can now see it.`,
        reference,
        followUrl: `/track.html#ref=${encodeURIComponent(reference)}`
      });
    }
    return sendJson(response, 200, { ok: true, reference, kindLabel: S.KIND_LABELS[kind], receivedAt: createdAt, acknowledged, attachments: photos.accepted.length });
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
module.exports._private = { createHandler, cleanFields, validateFields, emailIn, nameIn, isFormPost, envelopeFromForm };
