'use strict';

/* The conversation window on a fast machine (owner's Mac, 8 Oct 2026: the
   deploy stopped on "A10 ... the newest 200 are shown"). Messages written in
   the same millisecond tie on `at`, and the database breaks a tie by document
   id, which says nothing about order, so the newest-200 window could keep an
   older note and drop a newer one. Here every note is written in the same
   millisecond, the hardest case, and the window must still be the newest 200
   in the order they were written. */

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_review-recheck-harness');

const CASE = () => require('../lib/routes/admin/case');

test('notes written in one millisecond: the window is still the newest 200, in order', async () => {
  const W = H.fresh({ latency: 0 });
  const realNow = Date.now;
  try {
    const REF = 'PFA-Q-2026-00031';
    await H.seed(W.db, REF);
    const frozen = realNow();
    Date.now = () => frozen;
    for (let i = 0; i < 210; i += 1) await H.call(CASE(), { body: { reference: REF, action: 'note', text: `note ${i}` } });
    Date.now = realNow;
    const c = (await H.call(CASE(), { method: 'GET', query: { reference: REF } })).json.case;
    const notes = c.messages.filter((m) => /^note \d+$/.test(m.text || ''));
    assert.equal(notes.length, 200);
    assert.equal(notes[0].text, 'note 10', 'the oldest shown is the 200th newest');
    assert.equal(notes.at(-1).text, 'note 209', 'the newest is last');
    assert.deepEqual(notes.map((m) => Number(m.text.slice(5))), Array.from({ length: 200 }, (_, i) => i + 10), 'in the order written');
    assert.equal(c.olderNotShown, 10);
  } finally {
    Date.now = realNow;
    W.restore();
  }
});
