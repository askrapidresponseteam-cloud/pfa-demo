/* GET  /api/admin/cards?type=patron|caretaker&filter=unsent|unprinted|current|all&q=
   POST /api/admin/cards   { action: 'email' | 'printed', type, ids: [...] }

   Bulk issuance from the panel. The cards themselves are drawn in the
   administrator's browser by the same two renderers the public site uses
   (assets/patron-card-pdf.js and assets/caretaker-card.js), so a card
   printed from here is stroke for stroke the card a member or caretaker sees
   on their own screen. This route only supplies the register rows those
   renderers need, sends the emails, and records what was done.

   Photographs are never on the server by design - they stay on the holder's
   device - so nothing here returns one. The panel can match photographs from
   the office's own files to card numbers, in the browser, before printing. */

'use strict';

const { requireAdmin } = require('../../../lib/admin-auth');
const { getDb } = require('../../../lib/firebase');
const store = require('../../../lib/caretaker-store');
const mail = require('../../../lib/caretaker-mail');
const RULES = require('../../../assets/field-rules.js');

const MAX_ROWS = 500;
const MAX_PER_POST = 25;
const TYPES = new Set(['patron', 'caretaker']);
const FILTERS = new Set(['unsent', 'unprinted', 'current', 'all']);

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve) => {
    let raw = typeof request.body === 'string' ? request.body : '';
    if (raw) { try { return resolve(JSON.parse(raw)); } catch (_) { return resolve({}); } }
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); } });
    request.on('error', () => resolve({}));
  });
}

function clean(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function siteUrl(request) {
  const configured = clean(process.env.PUBLIC_SITE_URL, 300);
  try { const u = new URL(configured); if (/^https?:$/.test(u.protocol)) return u.origin; } catch (_) { /* fall through */ }
  const host = (request.headers || {})['x-forwarded-host'] || (request.headers || {}).host || 'pfa-full-website.vercel.app';
  return `https://${host}`;
}

function expired(iso, nowMs) {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms < nowMs : false;
}

/* The address block on a Patron card is three lines. A paid member's address
   lives on their payment, an imported member's usually nowhere; what is known
   is grouped, and what is not is left for the renderer to leave blank. */
function addressLines(address, district, state, pin) {
  const lines = [];
  if (address) lines.push(address);
  const district_pin = [district, pin].filter(Boolean).join(' ');
  if (district_pin) lines.push(district_pin);
  if (state) lines.push(state);
  return lines.slice(0, 3).map((l) => clean(l, 60));
}

function patronRow(id, m, customer, nowMs) {
  const c = customer || {};
  return {
    id,
    type: 'patron',
    name: RULES.nameCase(m.name || ''),
    email: clean(m.email, 254).toLowerCase(),
    mobile: clean(m.mobile, 20),
    since: m.memberSince || '',
    valid: m.validUntil || '',
    state: expired(m.validUntil, nowMs) ? 'expired' : 'valid',
    addressLines: addressLines(clean(c.address, 120), clean(c.district, 60), clean(c.state, 60), clean(c.pin, 10)),
    emailedAt: m.cardEmailedAt || '',
    printedAt: m.cardPrintedAt || '',
    source: m.source || ''
  };
}

function caretakerRow(id, c, nowMs) {
  return {
    id,
    type: 'caretaker',
    name: RULES.nameCase(c.name || ''),
    email: clean(c.email, 254).toLowerCase(),
    mobile: clean(c.mobile, 20),
    address: clean(c.address, 240),
    pin: clean(c.pin, 10),
    issuedAt: c.issuedAt || '',
    valid: c.validUntil || '',
    state: c.status === 'revoked' ? 'revoked' : (expired(c.validUntil, nowMs) ? 'expired' : 'valid'),
    printed: Boolean(c.printed),
    emailedAt: c.cardEmailedAt || '',
    printedAt: c.cardPrintedAt || ''
  };
}

function keep(row, filter) {
  if (filter === 'all') return true;
  if (row.state !== 'valid') return false;
  if (filter === 'unsent') return !row.emailedAt && Boolean(row.email);
  if (filter === 'unprinted') return !row.printedAt && !row.printed;
  return true;
}

function matches(row, q) {
  if (!q) return true;
  const hay = [row.id, row.name, row.email, row.mobile].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

async function getAllInChunks(db, refs) {
  const out = [];
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    const snaps = await db.getAll(...chunk);
    out.push(...snaps);
  }
  return out;
}

async function listPatrons(db, nowMs) {
  const snapshot = await db.collection('members').orderBy('__name__').limit(MAX_ROWS).get();
  const members = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  /* The address for the card is on the payment that bought the membership. */
  const withOrders = members.filter((m) => m.data.transactionOrderId);
  const txSnaps = withOrders.length
    ? await getAllInChunks(db, withOrders.map((m) => db.collection('transactions').doc(String(m.data.transactionOrderId))))
    : [];
  const customers = new Map();
  txSnaps.forEach((s) => { if (s.exists) customers.set(s.id, (s.data() || {}).customer || null); });
  return {
    rows: members.map((m) => patronRow(m.id, m.data, customers.get(String(m.data.transactionOrderId || '')), nowMs)),
    capped: snapshot.size >= MAX_ROWS
  };
}

async function listCaretakers(db, nowMs) {
  const snapshot = await db.collection('caretakerCards').orderBy('__name__').limit(MAX_ROWS).get();
  return { rows: snapshot.docs.map((d) => caretakerRow(d.id, d.data(), nowMs)), capped: snapshot.size >= MAX_ROWS };
}

/* ---- sending ---------------------------------------------------------------- */

function dayKey(nowMs) { return new Date(nowMs).toISOString().slice(0, 10); }

async function emailOne(db, type, id, request, nowMs) {
  const collection = type === 'patron' ? 'members' : 'caretakerCards';
  const ref = db.collection(collection).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { id, ok: false, reason: 'Not on the register.' };
  const record = snapshot.data();
  const to = clean(record.email, 254).toLowerCase();
  if (!to) return { id, ok: false, reason: 'No email address on record.' };
  if (type === 'caretaker' && record.status === 'revoked') return { id, ok: false, reason: 'This card is revoked.' };

  const base = siteUrl(request);
  const template = type === 'patron' ? 'patron_card' : 'card_issued';
  const payload = type === 'patron'
    ? { name: RULES.nameCase(record.name || ''), memberId: id, memberSince: record.memberSince, validUntil: record.validUntil,
        memberUrl: `${base}/member.html?id=${encodeURIComponent(id)}` }
    : { name: RULES.nameCase(record.name || ''), cardId: id, issuedAt: record.issuedAt, validUntil: record.validUntil,
        cardUrl: `${base}/caretaker-card.html?id=${encodeURIComponent(id)}` };

  /* One send per card per day from the panel: a double click cannot send
     twice, but a card can be sent again tomorrow if it has to be. */
  const queued = await store.queueEmail({ template, to, payload, dedupeKey: `${template}:${id}:${dayKey(nowMs)}:admin` });
  if (!queued.created) return { id, ok: false, reason: 'Already sent today.' };

  try {
    const sent = await mail.deliver({ to, template, payload });
    await store.recordEmailResult({ emailId: queued.emailId, ok: true, providerId: sent && sent.providerId });
  } catch (error) {
    /* Queued: the email worker retries it with backoff. From the panel's
       point of view it is on its way, and the record says so. */
    await store.recordEmailResult({ emailId: queued.emailId, ok: false, error: error && error.message });
    if (error && error.permanent) return { id, ok: false, reason: `The address was refused: ${clean(error.message, 120)}` };
  }
  await ref.set({ cardEmailedAt: new Date(nowMs).toISOString() }, { merge: true });
  return { id, ok: true };
}

async function markPrinted(db, type, ids, nowMs) {
  const at = new Date(nowMs).toISOString();
  const batch = db.batch();
  ids.forEach((id) => {
    if (type === 'patron') {
      batch.set(db.collection('members').doc(id), { cardPrintedAt: at }, { merge: true });
    } else {
      batch.set(db.collection('caretakerCards').doc(id), { printed: true, cardPrintedAt: at }, { merge: true });
      batch.set(db.collection('caretakerPublic').doc(id), { printed: true }, { merge: true });
    }
  });
  await batch.commit();
  return ids.map((id) => ({ id, ok: true }));
}

function cleanIds(type, value) {
  const pattern = type === 'patron' ? /^PFA-MBR-[A-Z0-9]{4,16}$/ : /^PFA-CCT-[A-Z0-9]{8}$/;
  return [...new Set((Array.isArray(value) ? value : []).map((v) => clean(v, 40).toUpperCase()).filter((v) => pattern.test(v)))].slice(0, MAX_PER_POST);
}

module.exports = async function handler(request, response) {
  const who = await requireAdmin(request, response);
  if (!who) return;
  const nowMs = Date.now();

  try {
    const db = getDb();

    if (request.method === 'GET') {
      const query = request.query || {};
      const type = String(query.type || 'patron');
      const filter = FILTERS.has(String(query.filter)) ? String(query.filter) : 'unsent';
      const q = clean(query.q, 80);
      if (!TYPES.has(type)) return sendJson(response, 400, { code: 'BAD_TYPE', message: 'type must be patron or caretaker.' });
      const listed = type === 'patron' ? await listPatrons(db, nowMs) : await listCaretakers(db, nowMs);
      const rows = listed.rows.filter((r) => keep(r, filter) && matches(r, q));
      return sendJson(response, 200, {
        ok: true, type, filter, rows, total: rows.length, registerTotal: listed.rows.length, capped: listed.capped,
        mailConfigured: mail.isConfigured()
      });
    }

    if (request.method === 'POST') {
      const body = await readBody(request);
      const type = String(body.type || '');
      const action = String(body.action || '');
      if (!TYPES.has(type)) return sendJson(response, 400, { code: 'BAD_TYPE', message: 'type must be patron or caretaker.' });
      const ids = cleanIds(type, body.ids);
      if (!ids.length) return sendJson(response, 400, { code: 'NO_IDS', message: 'Which cards?' });

      if (action === 'printed') {
        return sendJson(response, 200, { ok: true, action, results: await markPrinted(db, type, ids, nowMs) });
      }
      if (action === 'email') {
        if (!mail.isConfigured()) {
          return sendJson(response, 503, { code: 'MAIL_NOT_CONFIGURED', message: 'Email is not set up on the server (PFA_MAIL_API_KEY). Cards can still be downloaded.' });
        }
        const results = [];
        for (const id of ids) results.push(await emailOne(db, type, id, request, nowMs));
        return sendJson(response, 200, { ok: true, action, results, by: who.email || who.uid });
      }
      return sendJson(response, 400, { code: 'BAD_ACTION', message: 'action must be email or printed.' });
    }

    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    console.error('admin cards failed', error && error.message);
    return sendJson(response, 500, { code: 'SERVER_ERROR', message: 'That could not be done right now.' });
  }
};

module.exports._private = { patronRow, caretakerRow, keep, matches, addressLines, cleanIds };
