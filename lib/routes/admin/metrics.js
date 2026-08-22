/* GET /api/admin/metrics
   The overview: how much is waiting, how much came in, what it was worth.

   Firestore charges per document read, so this uses aggregation queries
   (`count()`) wherever a number is all that is wanted. A count is billed as a
   handful of reads rather than one per document, which is what keeps an
   overview page from becoming the most expensive thing on the site.

   Nothing here reads a customer record. The numbers are counts and sums; the
   detail lives behind the register tabs, where an administrator has to ask for
   a specific person. */

'use strict';

const { requireAdmin } = require('../../../lib/admin-auth');
const { getDb } = require('../../../lib/firebase');

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

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function countOf(query) {
  try {
    const snapshot = await query.count().get();
    return snapshot.data().count;
  } catch (error) {
    // Older firebase-admin without aggregation support: fall back to a capped
    // read so the panel degrades to "at least this many" rather than breaking.
    const snapshot = await query.limit(500).get();
    return snapshot.size;
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  const who = await requireAdmin(request, response);
  if (!who) return;

  try {
    const db = getDb();
    const since7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const [
      submissionsTotal, submissionsNew, submissions7,
      membersTotal, caretakersTotal, paymentsPaid
    ] = await Promise.all([
      countOf(db.collection('submissions')),
      countOf(db.collection('submissions').where('status', '==', 'new')),
      countOf(db.collection('submissions').where('receivedAtMs', '>=', since7)),
      countOf(db.collection('members')),
      countOf(db.collection('caretakerPublic')),
      countOf(db.collection('transactions').where('status', '==', 'paid'))
    ]);

    /* Per-category counts of what is still unhandled. Twelve small counts is
       cheaper than reading every submission to group them in memory. */
    const byKind = {};
    await Promise.all(Object.keys(KIND_LABELS).map(async (kind) => {
      byKind[kind] = {
        label: KIND_LABELS[kind],
        waiting: await countOf(
          db.collection('submissions').where('kind', '==', kind).where('status', '==', 'new')
        )
      };
    }));

    /* Money over the last 30 days. This one does read documents, because a sum
       needs the amounts - so it is capped, and the panel says when it is. */
    let revenue = { inr: 0, usd: 0, count: 0, capped: false };
    const paid = await db.collection('transactions')
      .where('status', '==', 'paid')
      .limit(500)
      .get();
    paid.forEach((doc) => {
      const row = doc.data();
      const createdMs = row.createdAt && row.createdAt.toMillis ? row.createdAt.toMillis() : 0;
      if (createdMs && createdMs < since30) return;
      const amount = Number(row.amount) || 0;
      if (String(row.currency).toUpperCase() === 'USD') revenue.usd += amount;
      else revenue.inr += amount;
      revenue.count += 1;
    });
    revenue.capped = paid.size >= 500;

    return sendJson(response, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      cards: {
        submissionsWaiting: submissionsNew,
        submissionsTotal,
        submissionsLast7: submissions7,
        members: membersTotal,
        caretakers: caretakersTotal,
        paymentsPaid: paymentsPaid
      },
      byKind,
      revenue30d: revenue,
      note: 'Store orders are held in Shopify, not here. See the Store tab.'
    });
  } catch (error) {
    console.error('admin metrics failed', error && error.message);
    return sendJson(response, 500, { code: 'SERVER_ERROR', message: 'The overview could not be built.' });
  }
};
