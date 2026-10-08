'use strict';

/* A case's conversation keeps the order it was written in, even when two
   messages share a millisecond. On 8 Oct 2026 a fast Mac wrote a reply and a
   note in the same millisecond, the database broke the tie by random id, and
   test/email-thread.test.js failed there while passing elsewhere. */

const test = require('node:test');
const assert = require('node:assert/strict');
const ORDER = require('../lib/message-order');

test('seq rises with every write, even within one millisecond', () => {
  const a = ORDER.nextSeq(1000), b = ORDER.nextSeq(1000), c = ORDER.nextSeq(1000);
  assert.ok(a < b && b < c);
  assert.ok(ORDER.nextSeq(999) > c, 'a clock that steps back still never repeats or reverses');
});

test('messages that share a time are put in write order; different times are left alone', () => {
  const at = '2026-10-08T01:00:00.000Z';
  const later = '2026-10-08T01:00:00.001Z';
  const fromDb = [
    { id: 'z', at, seq: 3 }, { id: 'y', at, seq: 1 }, { id: 'x', at, seq: 2 },
    { id: 'w', at: later, seq: 0 }
  ];
  assert.deepEqual(ORDER.sortMessages(fromDb).map((m) => m.id), ['y', 'x', 'z', 'w']);
});

test('messages written before seq existed keep the order the database gave', () => {
  const at = '2026-10-01T00:00:00.000Z';
  const old = [{ id: 'b', at }, { id: 'a', at, seq: 5 }, { id: 'c', at }];
  assert.deepEqual(ORDER.sortMessages(old).map((m) => m.id), ['b', 'a', 'c']);
});

test('every place that writes a conversation message stamps seq', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.join(__dirname, '..');
  for (const f of ['lib/routes/admin/case.js', 'lib/inbound-mail.js', 'lib/submission-forward.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const writes = (src.match(/collection\('messages'\)\.doc\([^)]*\)\.create\(/g) || []).length;
    const stamped = (src.match(/nextSeq\(\)/g) || []).length;
    assert.ok(writes > 0 && stamped >= writes, `${f}: ${writes} message writes, ${stamped} stamped with seq`);
  }
  const caseSrc = fs.readFileSync(path.join(ROOT, 'lib/routes/admin/case.js'), 'utf8');
  assert.match(caseSrc, /ORDER\.sortMessages\(/, 'the case route sorts ties when it reads');
});
