'use strict';

/* The one document behind the public register on enforce.html.

   This lives in its own file for a reason that is enforced rather than
   remembered: test/submissions.test.js forbids `{ merge: true }` in any file
   that reaches the submissions collection, because merging over a report is
   how a sender's own words get quietly rewritten. The counter is a merge
   by nature - an increment on one State's field, leaving the other thirty-five
   alone - so it is kept out of that file entirely rather than carved out of
   the rule with an exception. A rule with an exception in it stops being read.

   Shape, flat, one map per State so a write touches one field:
     counters/enforceRegister = {
       'Karnataka': { filed: 12, fir: 4, refused: 6 },
       updatedAt: '2026-09-14T...'
     }
*/

const firebase = require('./firebase');

const DOC = 'enforceRegister';

/* Which police stages count as a case that got through, and which as one that
   was turned away. Anything else ('none') is filed and nothing more. */
const REACHED = new Set(['fir', 'chargesheet']);
const TURNED_AWAY = new Set(['refused', 'ncr']);

/* Never throws. The reference is already issued and the report already written
   by the time this runs; a counter that missed a tick is a smaller problem
   than a cruelty report refused because a counter was busy. */
async function bump(db, { state, stage, at, fieldValue }) {
  const name = String(state || '').trim().slice(0, 60);
  if (!db || !name) return false;
  const inc = (fieldValue || firebase.fieldValue)();
  const entry = { filed: inc.increment(1) };
  const key = String(stage || '').toLowerCase();
  if (REACHED.has(key)) entry.fir = inc.increment(1);
  if (TURNED_AWAY.has(key)) entry.refused = inc.increment(1);
  try {
    await db.collection('counters').doc(DOC).set(
      { [name]: entry, updatedAt: at || new Date().toISOString() },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.warn('enforce register not incremented', error && error.message);
    return false;
  }
}

module.exports = { bump, DOC, REACHED, TURNED_AWAY };
