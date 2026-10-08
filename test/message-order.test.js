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

test('messages that share a time are put in write order; different times are in time order', () => {
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

/* 8 Oct 2026 (review A item 10): an email from outside was placed by its own
   Date header, so a person whose clock was a week slow had their answer
   shown above the question it answered. The order is when PFA recorded it. */
test('an incoming email is placed by when it was recorded, not by the date its sender\'s clock gave it', () => {
  const fromDb = [
    { id: 'answer', at: '2026-10-01T09:00:00.000Z', recordedAt: '2026-10-08T07:00:05.000Z', seq: 9 },
    { id: 'question', at: '2026-10-08T07:00:00.000Z', seq: 4 },
    { id: 'later-note', at: '2026-10-08T07:10:00.000Z', seq: 12 }
  ];
  assert.deepEqual(ORDER.sortMessages(fromDb).map((m) => m.id), ['question', 'answer', 'later-note']);
});

test('read newest first, presented oldest first; a message with no readable time stays beside its neighbour', () => {
  const newestFirst = [
    { id: 'c', at: '2026-10-08T03:00:00.000Z', seq: 3 },
    { id: 'x', at: null },
    { id: 'b', at: '2026-10-08T02:00:00.000Z', seq: 2 },
    { id: 'a', at: '2026-10-08T01:00:00.000Z', seq: 1 }
  ];
  assert.deepEqual(ORDER.sortMessages(newestFirst).map((m) => m.id), ['a', 'b', 'c', 'x']);
  assert.equal(ORDER.recordedMs({ at: '2026-10-08T01:00:00.000Z', recordedAt: '2026-10-08T02:00:00.000Z' }), Date.parse('2026-10-08T02:00:00.000Z'));
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
