/* Submissions: what the public forms send, and what the public may see back.

   A reference is issued here, by the server, from a counter - PFA-C-2026-00042
   is the forty-second case of 2026. The browser used to invent one from five
   random digits and post it as the document id, which meant two people could
   get the same number, a failed send still showed a number that existed
   nowhere, and anyone could overwrite anyone else's report by guessing.

   A sequential number is easy to read out over the phone, and easy to guess;
   so looking one up also needs the email or mobile that was given with it.
   What comes back is the status and when it changed - never the report. */

'use strict';

const crypto = require('crypto');
const RULES = require('../assets/field-rules.js');

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

/* What each status means to the person who sent it. Staff vocabulary stays
   inside the panel: "spam" is simply closed from the outside. */
const PUBLIC_STATUS = {
  new: { label: 'Received', next: 'It is in the queue. A named person at PFA picks it up from here.' },
  'in-progress': { label: 'Being handled', next: 'Someone at PFA has taken this up. If they need more from you they will use the contact you gave.' },
  handled: { label: 'Closed', next: 'PFA has finished with this. If it is not resolved for you, raise it again and mention this number.' },
  spam: { label: 'Closed', next: 'PFA has finished with this. If it is not resolved for you, raise it again and mention this number.' }
};

const REFERENCE = /^PFA-[A-Z]{1,4}-\d{4}-\d{4,8}$/;
/* The old browser-made numbers, still on record, had five digits too; this
   also accepts any earlier shape so nothing already issued becomes untrackable. */
const ANY_REFERENCE = /^PFA-[A-Z0-9-]{4,40}$/;

function formatReference(kind, year, number) {
  return `${kind}-${year}-${String(number).padStart(5, '0')}`;
}

function isReference(value) {
  const text = String(value || '').trim().toUpperCase();
  return REFERENCE.test(text) || ANY_REFERENCE.test(text);
}

/* Issues the next number for this kind and year, atomically. Two people
   sending at the same instant get consecutive numbers, never the same one;
   Firestore retries the transaction for whichever lost the race. */
async function allocateReference(db, kind, nowMs = Date.now()) {
  const year = new Date(nowMs).getUTCFullYear();
  const key = `${kind}-${year}`;
  const counter = db.collection('counters').doc('submissions');
  const number = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(counter);
    const current = snapshot.exists ? Number((snapshot.data() || {})[key]) || 0 : 0;
    tx.set(counter, { [key]: current + 1 }, { merge: true });
    return current + 1;
  });
  return formatReference(kind, year, number);
}

/* ---- ownership -------------------------------------------------------- */

const CONTACT_FIELD = /^(contact|email|e-?mail|mobile|phone|whatsapp|telephone)(number|no)?$/i;

function normaliseContact(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (text.includes('@')) return text.toLowerCase().replace(/\s+/g, '');
  const mobile = RULES.normaliseField('mobile', text);
  return /^[6-9]\d{9}$/.test(mobile) ? mobile : '';
}

function contactKey(value) {
  const normalised = normaliseContact(value);
  if (!normalised) return '';
  const pepper = String(process.env.PFA_AUTH_PEPPER || '');
  return crypto.createHash('sha256').update(`${pepper}:${normalised}`, 'utf8').digest('hex');
}

/* Every email or mobile in a submission's fields, by field name and by
   shape, so the check works for forms that call the field "contact",
   "email", "mobile" or anything else. */
function contactKeysFor(fields) {
  const keys = new Set();
  Object.keys(fields || {}).forEach((name) => {
    const value = String(fields[name] == null ? '' : fields[name]);
    if (!CONTACT_FIELD.test(name.replace(/\s+/g, '')) && !/@/.test(value) && !/\d{10}/.test(value.replace(/\D/g, ''))) return;
    const key = contactKey(value);
    if (key) keys.add(key);
  });
  return [...keys];
}

function contactMatches(record, contact) {
  const stored = Array.isArray(record.contactKeys) && record.contactKeys.length
    ? record.contactKeys
    : contactKeysFor(record.fields);
  if (!stored.length) return { required: false, ok: true };
  const key = contactKey(contact);
  return { required: true, ok: Boolean(key) && stored.includes(key) };
}

/* ---- the public view -------------------------------------------------- */

function timelineOf(record) {
  const history = Array.isArray(record.history) && record.history.length
    ? record.history
    : [{ status: 'new', at: record.createdAt }].concat(
      record.status && record.status !== 'new' && record.handledAt ? [{ status: record.status, at: record.handledAt }] : []
    );
  return history
    .filter((h) => h && PUBLIC_STATUS[h.status])
    .map((h) => ({ status: h.status, label: PUBLIC_STATUS[h.status].label, at: h.at || null }));
}

function publicView(record) {
  const status = PUBLIC_STATUS[record.status] ? record.status : 'new';
  const timeline = timelineOf(record);
  return {
    found: true,
    reference: record.reference,
    kind: record.kind,
    kindLabel: record.kindLabel || KIND_LABELS[record.kind] || 'Submission',
    status,
    statusLabel: PUBLIC_STATUS[status].label,
    next: PUBLIC_STATUS[status].next,
    receivedAt: record.createdAt || null,
    updatedAt: timeline.length ? timeline[timeline.length - 1].at : record.createdAt || null,
    timeline
  };
}

/* ---- a small brake on guessing ------------------------------------------ */

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 40;
const hits = new Map();

function rateLimited(ip, nowMs = Date.now()) {
  const key = String(ip || 'unknown');
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= nowMs) {
    hits.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

function clientIp(request) {
  const raw = String((request.headers || {})['x-forwarded-for'] || '');
  return raw.split(',')[0].trim() || (request.socket && request.socket.remoteAddress) || '';
}

module.exports = {
  KIND_LABELS,
  PUBLIC_STATUS,
  allocateReference,
  clientIp,
  contactKey,
  contactKeysFor,
  contactMatches,
  formatReference,
  isReference,
  normaliseContact,
  publicView,
  rateLimited,
  resetForTests() { hits.clear(); }
};
