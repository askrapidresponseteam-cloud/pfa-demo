'use strict';
/* Neither search may come back empty for a real query. Typos are corrected,
   run-together words split, and when nothing matches at all the closest
   pages are shown and labelled as approximate. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = require('./_search-engine.js');

const ROOT = path.join(__dirname, '..');
const S = load(path.join(ROOT, 'pfa-search.js'));
const first = (q) => S.search(q, { limit: 3 }).rows.map((r) => r.t)[0];

test('site search: typos, run-together words and short forms still land on the right page', () => {
  assert.equal(first('reportcruelty'), 'Report cruelty');
  assert.equal(first('hosptial'), 'Animal hospitals');
  assert.equal(first('colony caregivr card'), 'Apply for a colony caregiver card');
  assert.equal(first('donte'), 'Donate');
  assert.equal(first('cruality report'), 'Report cruelty');
});

test('site search: nonsense still returns the closest pages, marked as such', () => {
  const res = S.search('xqzvwt plork', { limit: 3 });
  assert.ok(res.rows.length > 0, 'never empty');
  assert.equal(res.via, 'closest');
  const ok = S.search('report cruelty', { limit: 3 });
  assert.equal(ok.via, null, 'an exact query is not marked approximate');
});
