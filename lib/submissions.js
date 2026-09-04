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
  'PFA-CR': 'Cruelty report',
  'PFA-C': 'Case follow request',
  'PFA-Q': 'Help desk query',
  'PFA-V': 'Volunteer application',
  'PFA-J': 'Job application',
  'PFA-W': 'Wire report',
  'PFA-CSR': 'Corporate partnership',
  'PFA-CAC': 'CineKind entry',
  'PFA-CK': 'CineKind nomination',
  'PFA-EV': 'Event request',
  'PFA-RX': 'Prescription',
  'PFA-CG': 'Colony caregiver application',
  'PFA-MEET': 'Meet request',
  'PFA-POD': 'Podcast/media request'
};

/* Stages, per kind. An application is not a query: "Being handled" tells a
   volunteer nothing, where "Shortlisted" tells them exactly where they stand.
   A kind with no entry here keeps the generic flow below.

   Every stage is a state a record can be *moved to*. None of them removes it:
   rejected, withdrawn and cancelled are stages, not deletions. */
const STAGES = {
  'PFA-V': [
    { key: 'new',         label: 'Submitted',    next: 'It is in the queue. Someone at PFA reads every application.' },
    { key: 'under-review',label: 'Under review', next: 'Being read against the areas you chose.' },
    { key: 'shortlisted', label: 'Shortlisted',  next: 'PFA will be in touch to talk about where you would fit.' },
    { key: 'approved',    label: 'Approved',     next: 'You are on the volunteer register. PFA will tell you what happens next.' },
    { key: 'rejected',    label: 'Not taken forward', next: 'Not this time. The application stays on record, and you can apply again.' },
    { key: 'withdrawn',   label: 'Withdrawn',    next: 'Withdrawn at your request. The record stays on file.' }
  ],
  'PFA-CG': [
    { key: 'new',          label: 'Submitted',     next: 'It is in the queue.' },
    { key: 'under-review', label: 'Under review',  next: 'PFA is checking the details you gave.' },
    { key: 'verified',     label: 'Verified',      next: 'Your details check out. The card is being prepared.' },
    { key: 'approved',     label: 'Card issued',   next: 'Your caregiver card has been issued.' },
    { key: 'rejected',     label: 'Not issued',    next: 'The card was not issued this time. The application stays on record.' },
    { key: 'revoked',      label: 'Revoked',       next: 'The card has been revoked. The record and its history remain.' }
  ]
};

function stagesFor(kind) {
  return STAGES[kind] || null;
}

/* A stage a record can move to. Nothing here removes a record: the terminal
   stages are refusals and revocations, and both keep the file. */
function isStage(kind, status) {
  const list = stagesFor(kind);
  if (!list) return ['new', 'in-progress', 'handled', 'spam'].includes(status);
  return list.some((s) => s.key === status);
}

function stageLabel(kind, status) {
  const list = stagesFor(kind);
  const hit = list && list.find((s) => s.key === status);
  return hit ? hit.label : null;
}

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
    .filter((h) => h && (h.event === 'reply' || PUBLIC_STATUS[h.status]))
    .map((h) => (h.event === 'reply'
      ? { status: h.status || 'in-progress', event: 'reply', label: 'PFA replied by email', at: h.at || null }
      : { status: h.status, label: PUBLIC_STATUS[h.status].label, at: h.at || null }));
}

/* The sender's name and how to reach them, wherever the form put them. */
function contactOf(fields) {
  const out = { name: '', email: '', mobile: '' };
  Object.keys(fields || {}).forEach((key) => {
    const value = String(fields[key] == null ? '' : fields[key]).trim();
    if (!value) return;
    if (!out.name && /^(name|fullname|full name|your name|contact name)$/i.test(key)) out.name = RULES.nameCase(value);
    if (!out.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) out.email = value.toLowerCase();
    if (!out.mobile) { const m = normaliseContact(value); if (m && !m.includes('@')) out.mobile = m; }
  });
  return out;
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

/* ---- photographs --------------------------------------------------------- */

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 950 * 1024;   // under Firestore's 1 MiB document limit
const MAX_TOTAL_BYTES = 2600 * 1024;

/* What the bytes say they are, whatever the label claims. */
function imageType(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 12 && bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

/* Data URLs in, checked bytes out. A bad picture is named by its position so
   the sender knows which one to replace. */
function parsePhotos(value) {
  const accepted = [];
  const rejected = [];
  const list = Array.isArray(value) ? value : [];
  if (list.length > MAX_PHOTOS) rejected.push(`Up to ${MAX_PHOTOS} photos can be attached.`);
  let total = 0;
  list.slice(0, MAX_PHOTOS).forEach((item, i) => {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(item || ''));
    if (!match) { rejected.push(`Photo ${i + 1} is not an image the site can read.`); return; }
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    const contentType = imageType(bytes);
    if (!contentType) { rejected.push(`Photo ${i + 1} is not a JPEG, PNG or WebP.`); return; }
    if (bytes.length > MAX_PHOTO_BYTES) { rejected.push(`Photo ${i + 1} is too large even after shrinking. Try a smaller picture.`); return; }
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) { rejected.push('The photos together are too large. Send fewer or smaller pictures.'); return; }
    accepted.push({ contentType, bytes });
  });
  return { accepted: rejected.length ? [] : accepted, rejected };
}

/* ---- a small brake on guessing, and on flooding -------------------------- */

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 40;
/* Sending is braked separately from looking up, and more gently. They must not
   share a bucket: someone who has just filed a report and is refreshing its
   status should never find that the refreshing has used up their ability to
   file a second one.

   Thirty in a quarter of an hour is far beyond anything a person filling in
   forms will do, and far below what makes a flood worth the trouble. It is a
   brake and not a wall - the counter lives in one warm instance, as the
   lookup counter always has - but the endpoint had none at all, so anyone
   could allocate references and write documents into Firestore in a loop. */
const WRITE_LIMIT = 30;
const hits = new Map();
const writes = new Map();

function brake(store, key, limit, nowMs) {
  const at = String(key || 'unknown');
  const entry = store.get(at);
  if (!entry || entry.resetAt <= nowMs) {
    store.set(at, { count: 1, resetAt: nowMs + WINDOW_MS });
    if (store.size > 5000) store.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

function rateLimited(ip, nowMs = Date.now()) {
  return brake(hits, ip, LIMIT, nowMs);
}

function writeLimited(ip, nowMs = Date.now()) {
  return brake(writes, ip, WRITE_LIMIT, nowMs);
}

function clientIp(request) {
  const raw = String((request.headers || {})['x-forwarded-for'] || '');
  return raw.split(',')[0].trim() || (request.socket && request.socket.remoteAddress) || '';
}

module.exports = {
  KIND_LABELS,
  STAGES,
  stagesFor,
  isStage,
  stageLabel,
  MAX_PHOTOS,
  PUBLIC_STATUS,
  allocateReference,
  clientIp,
  contactKey,
  contactKeysFor,
  contactMatches,
  contactOf,
  formatReference,
  imageType,
  parsePhotos,
  isReference,
  normaliseContact,
  publicView,
  rateLimited,
  writeLimited,
  WRITE_LIMIT,
  resetForTests() { hits.clear(); writes.clear(); }
};
