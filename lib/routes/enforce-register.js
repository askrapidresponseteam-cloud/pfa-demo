'use strict';

/* GET /api/enforce-register

   The public count of documented cruelty cases, by State. Counts and nothing
   else: no reference, no district-level breakdown small enough to identify a
   complainant, no text, no photographs, no names. report.html promises every
   report is private to PFA, and a page that published them would break that
   promise on the same site that made it.

   One document read, not a query over the register. Grouping is not something
   Firestore does, so a dashboard built on a query would read every cruelty
   report ever filed on every page load, and the free tier would be the least
   of it. `counters/enforceRegister` is incremented once per submission by
   pfa-submissions.js instead, and this reads that one document.

   Cached at the edge for five minutes: the number moves slowly and the page
   is public, so most views should cost nothing at all. */

const { getDb } = require('../firebase');

const DOC = 'enforceRegister';
/* Below this, a State's row is withheld. A count of one, in a State with one
   district represented, is a person: publishing it tells anyone who knows the
   case that the complainant filed it. Rows under the floor are still counted
   in the national total, which is where they are safe. */
const FLOOR = 3;

function sendJson(response, status, payload, cache) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cache || 'no-store');
  response.end(JSON.stringify(payload));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/* The stored shape is flat, one map per State, so an increment touches one
   field and never rewrites the document:
     { 'Karnataka': { filed: 12, fir: 4, refused: 6 }, ... } */
function rowsFrom(data) {
  const states = Object.keys(data || {}).filter((k) => k !== 'updatedAt');
  const rows = [];
  let withheld = 0;
  states.forEach((state) => {
    const d = data[state] || {};
    const row = { state, filed: num(d.filed), fir: num(d.fir), refused: num(d.refused) };
    if (!row.filed) return;
    if (row.filed < FLOOR) { withheld += row.filed; return; }
    rows.push(row);
  });
  rows.sort((a, b) => b.filed - a.filed || a.state.localeCompare(b.state));
  return { rows, withheld };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const snapshot = await getDb().collection('counters').doc(DOC).get();
    const { rows, withheld } = rowsFrom(snapshot.exists ? snapshot.data() : {});
    return sendJson(response, 200, {
      ok: true,
      rows,
      withheld,
      floor: FLOOR,
      updatedAt: (snapshot.exists && (snapshot.data() || {}).updatedAt) || null
    }, 's-maxage=300, stale-while-revalidate=86400');
  } catch (error) {
    console.error('enforce register failed', error && error.message);
    /* An empty register reads as empty rather than as an error: the page then
       shows what the visitor has filed and says the central count is not
       reachable, which is true and useful. */
    return sendJson(response, 200, { ok: false, rows: [], withheld: 0, floor: FLOOR });
  }
};

module.exports._private = { rowsFrom, FLOOR };
