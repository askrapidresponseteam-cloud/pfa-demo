/* GET /api/admin/records?type=members|caretakers&q=&limit=&cursor=
   GET /api/admin/records?type=session

   One route behind the admin panel: who am I, and show me the records.

   Members and caretakers are read from their own collections and never merged,
   so the two registers stay separate in the panel exactly as they are in
   Firestore. Search is a prefix match on the document id (the card number)
   plus an exact match on mobile, because Firestore cannot do substring search
   without a separate index - anything cleverer would need Algolia or similar,
   and is not worth adding until the registers are large enough to need it. */

'use strict';

const { requireAdmin } = require('../../../lib/admin-auth');
const { getDb, getMember, normalizedMobile } = require('../../../lib/firebase');

const MAX_LIMIT = 100;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function memberRow(id, data) {
  return {
    id,
    cardId: data.memberId || id,
    name: data.name || '',
    email: data.email || '',
    mobile: data.mobile || '',
    status: data.status || '',
    physicalCard: Boolean(data.physicalCard),
    memberSince: data.memberSince || '',
    validUntil: data.validUntil || '',
    hasPassword: Boolean(data.hasPassword),
    source: data.source || ''
  };
}

function caretakerRow(id, data) {
  return {
    id,
    cardId: data.cardId || id,
    name: data.name || '',
    issuedAt: data.issuedAt || '',
    validUntil: data.validUntil || '',
    printed: Boolean(data.printed),
    status: data.status || ''
  };
}

const KIND_LABELS = {
  'PFA-A': 'Adoption application', 'PFA-S': 'Story submission', 'PFA-F': 'General form',
  'PFA-C': 'Case follow request', 'PFA-Q': 'Help desk query', 'PFA-V': 'Volunteer application',
  'PFA-SV': 'Service request', 'PFA-W': 'Wire report', 'PFA-CSR': 'Corporate partnership',
  'PFA-CAC': 'CineKind entry', 'PFA-MEET': 'Meet request', 'PFA-POD': 'Podcast/media request'
};

function submissionRow(id, data) {
  return {
    id,
    reference: data.reference || id,
    kind: data.kind || '',
    kindLabel: data.kindLabel || KIND_LABELS[data.kind] || data.kind || '',
    status: data.status || 'new',
    page: data.page || '',
    createdAt: data.createdAt || '',
    receivedAtMs: data.receivedAtMs || 0,
    fields: data.fields || {}
  };
}

function storeOrderRow(id, data) {
  const t = data.tracking || {};
  return {
    shopifyOrderId: id,
    pfaOrderId: data.pfaOrderId || '',
    orderNumber: data.orderNumber || '',
    status: data.status || 'AWAITING_PAYMENT',
    total: Number(data.total) || 0,
    currency: data.currency || 'INR',
    name: (data.customer && data.customer.name) || '',
    email: (data.customer && data.customer.email) || '',
    items: (data.lineItems || []).map((l) => `${l.title} × ${l.quantity}`).join(', '),
    tracking: t.number ? `${t.company || 'Courier'} ${t.number}${t.status ? ' (' + t.status + ')' : ''}` : '',
    trackingUrl: t.url || '',
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || '',
    lastEvent: data.lastEvent || '',
    refundedTotal: Number(data.refundedTotal) || 0
  };
}

function paymentRow(id, data) {
  const customer = data.customer || {};
  return {
    id,
    orderId: data.orderId || id,
    type: data.type || '',
    amount: Number(data.amount) || 0,
    currency: String(data.currency || 'INR').toUpperCase(),
    status: data.status || '',
    name: customer.name || '',
    email: customer.email || '',
    mobile: customer.mobile || '',
    trackingId: (data.ccaVenue && data.ccaVenue.trackingId) || '',
    paymentMode: (data.ccaVenue && data.ccaVenue.paymentMode) || '',
    createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : ''
  };
}

function expired(validUntil) {
  if (!validUntil) return null;
  const until = new Date(validUntil);
  if (isNaN(until.getTime())) return null;
  return until.getTime() < Date.now();
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  const who = await requireAdmin(request, response);
  if (!who) return;

  const query = request.query || {};
  const type = String(query.type || 'session');

  if (type === 'session') {
    return sendJson(response, 200, {
      ok: true,
      admin: { uid: who.uid, email: who.email, name: who.name, mode: who.mode }
    });
  }

  const TYPES = {
    members: 'members',
    caretakers: 'caretakerPublic',
    submissions: 'submissions',
    payments: 'transactions',
    store: 'storeOrders'
  };
  if (!TYPES[type]) {
    return sendJson(response, 400, {
      code: 'BAD_TYPE',
      message: 'type must be members, caretakers, submissions, payments or store.'
    });
  }
  const isMembers = type === 'members';

  const term = String(query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), MAX_LIMIT);
  if (type === 'store' && term) {
    const db = getDb();
    const upper = term.toUpperCase();
    let snap = await db.collection('storeOrders').where('pfaOrderId', '==', upper.startsWith('PFA-ST-') ? upper : `PFA-ST-${upper.replace(/^#/, '')}`).limit(limit).get();
    if (snap.empty && /^\d{6,20}$/.test(term)) {
      const doc = await db.collection('storeOrders').doc(term).get();
      snap = { docs: doc.exists ? [doc] : [] };
    }
    return sendJson(response, 200, { ok: true, type, rows: snap.docs.map((d) => storeOrderRow(d.id, d.data())), total: snap.docs.length, done: true, cursor: null });
  }

  try {
    const db = getDb();
    const collection = TYPES[type];

    /* A single record: either a card number or a mobile. Answered directly so
       the commonest thing an administrator does - look up one person who is on
       the phone - never pages through the register. */
    if (term) {
      const upper = term.toUpperCase();

      if (/^PFA-(MBR|CCT)-[A-Z0-9]{8}$/.test(upper)) {
        const snapshot = isMembers
          ? await db.collection('members').doc(upper).get()
          : await db.collection('caretakerPublic').doc(upper).get();
        const rows = snapshot.exists
          ? [isMembers ? memberRow(snapshot.id, snapshot.data()) : caretakerRow(snapshot.id, snapshot.data())]
          : [];
        return sendJson(response, 200, { ok: true, type, rows: rows.map(withState), total: rows.length, done: true });
      }

      const mobile = normalizedMobile(term);
      if (mobile && isMembers) {
        const snapshot = await db.collection('members').where('mobile', '==', mobile).limit(limit).get();
        const rows = snapshot.docs.map((doc) => withState(memberRow(doc.id, doc.data())));
        return sendJson(response, 200, { ok: true, type, rows, total: rows.length, done: true });
      }

      return sendJson(response, 200, {
        ok: true, type, rows: [], total: 0, done: true,
        message: 'Search by full card number, or by mobile number for members.'
      });
    }

    /* Browsing. Ordered by document id so the cursor is stable and there is no
       composite index to maintain. */
    /* Submissions are the one register where recency is what matters - an
       administrator wants what just arrived, not what sorts first by id - so
       they are ordered newest-first on the timestamp the intake route writes.
       The others page on document id, which needs no composite index. */
    const newestFirst = type === 'submissions' || type === 'store';
    const orderField = type === 'submissions' ? 'receivedAtMs' : (type === 'store' ? 'createdAt' : '__name__');

    let base = db.collection(collection);
    if (type === 'submissions' && query.kind) base = base.where('kind', '==', String(query.kind));
    if (type === 'submissions' && query.status) base = base.where('status', '==', String(query.status));
    if (type === 'payments' && query.status) base = base.where('status', '==', String(query.status));

    let ref = newestFirst
      ? base.orderBy(orderField, 'desc').limit(limit + 1)
      : base.orderBy(orderField).limit(limit + 1);
    if (query.cursor) {
      ref = newestFirst
        ? base.orderBy(orderField, 'desc').startAfter(type === 'store' ? String(query.cursor) : Number(query.cursor)).limit(limit + 1)
        : base.orderBy(orderField).startAfter(String(query.cursor)).limit(limit + 1);
    }

    const snapshot = await ref.get();
    const docs = snapshot.docs.slice(0, limit);
    const shape = {
      members: memberRow, caretakers: caretakerRow,
      submissions: submissionRow, payments: paymentRow, store: storeOrderRow
    }[type];
    const rows = docs.map((doc) => withState(shape(doc.id, doc.data())));

    return sendJson(response, 200, {
      ok: true,
      type,
      rows,
      total: rows.length,
      done: snapshot.docs.length <= limit,
      cursor: docs.length
        ? (type === 'store' ? docs[docs.length - 1].data().createdAt : (newestFirst ? docs[docs.length - 1].data().receivedAtMs : docs[docs.length - 1].id))
        : null
    });
  } catch (error) {
    console.error('admin records failed', error && error.message);
    return sendJson(response, 500, { code: 'SERVER_ERROR', message: 'Those records could not be read.' });
  }
};

function withState(row) {
  const isExpired = expired(row.validUntil);
  return Object.assign({}, row, {
    expired: isExpired,
    state: isExpired === null ? 'unknown' : (isExpired ? 'expired' : 'valid')
  });
}

module.exports._private = { storeOrderRow };
