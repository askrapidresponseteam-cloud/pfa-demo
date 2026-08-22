'use strict';

const { getDb } = require('../lib/firebase');
const RULES = require('../assets/field-rules.js');

// Prefixes actually used by the site's forms (PFA.ref prefix = submission kind).
const KIND_LABELS = {
  'PFA-A': 'Adoption application',
  'PFA-S': 'Story submission',
  'PFA-F': 'General form',
  'PFA-C': 'Case follow request',
  'PFA-Q': 'Help desk query',
  'PFA-V': 'Volunteer application',
  'PFA-SV': 'Service request',
  'PFA-W': 'Wire report',
  'PFA-CSR': 'Corporate partnership',
  'PFA-CAC': 'CineKind entry',
  'PFA-MEET': 'Meet request',
  'PFA-POD': 'Podcast/media request'
};
const ALLOWED_KINDS = new Set(Object.keys(KIND_LABELS));

const MAX_BODY = 20000;

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
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
  const keys = Object.keys(data).slice(0, 40);
  for (const key of keys) {
    const safeKey = cleanValue(key).slice(0, 60);
    if (!safeKey) continue;
    out[safeKey] = cleanValue(data[key]);
  }
  return out;
}

/* The browser checked these already. So does this, because the browser is not
   a security boundary: anyone can POST here directly. Same rule file both
   sides, so the two can never disagree about what a valid mobile number is.

   Only fields that were actually sent are judged. The API does not know which
   form they came from, so it cannot know what was required; it can only say
   whether what arrived is well formed. */
function validateFields(fields) {
  const errors = [];
  const clean = {};
  for (const key of Object.keys(fields)) {
    const raw = fields[key];
    if (!String(raw || '').trim()) { clean[key] = raw; continue; }
    const message = RULES.checkField(key, raw, { required: false });
    if (message) errors.push({ field: key, message });
    clean[key] = RULES.normaliseField(key, raw);
  }
  return { errors, clean };
}

module.exports = async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.statusCode = 405;
    return response.end(JSON.stringify({ ok: false, error: 'Use POST.' }));
  }

  try {
    const body = await readBody(request);
    const kind = cleanValue(body.kind).toUpperCase().slice(0, 30);
    const reference = cleanValue(body.reference).slice(0, 60);

    if (!ALLOWED_KINDS.has(kind)) {
      response.statusCode = 400;
      return response.end(JSON.stringify({ ok: false, error: 'Unknown submission type.' }));
    }
    if (!/^PFA-[A-Z]{1,4}-\d{4}-\d{4,8}$/i.test(reference) && !/^PFA-[A-Z0-9-]{4,40}$/i.test(reference)) {
      response.statusCode = 400;
      return response.end(JSON.stringify({ ok: false, error: 'Invalid reference.' }));
    }

    const { errors, clean } = validateFields(cleanFields(body.data));
    if (errors.length) {
      response.statusCode = 422;
      return response.end(JSON.stringify({
        ok: false,
        error: 'Some fields did not pass validation.',
        fields: errors
      }));
    }

    const db = getDb();
    const record = {
      reference,
      kind,
      kindLabel: KIND_LABELS[kind],
      fields: clean,
      page: cleanValue(body.page).slice(0, 120),
      status: 'new',
      createdAt: new Date().toISOString(),
      receivedAtMs: Date.now()
    };

    // Idempotent on reference: a retry with the same reference updates, never duplicates.
    await db.collection('submissions').doc(reference.toUpperCase()).set(record, { merge: true });

    response.statusCode = 200;
    return response.end(JSON.stringify({ ok: true, reference }));
  } catch (error) {
    response.statusCode = 500;
    return response.end(JSON.stringify({ ok: false, error: 'Could not record the submission right now.' }));
  }
};
