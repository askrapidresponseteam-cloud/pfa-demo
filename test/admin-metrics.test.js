'use strict';

/* The dashboard endpoint shapes Firestore counts into days and months. Those
   helpers are pure, so they are pinned here; the queries themselves are not
   reachable without a database. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { dayBuckets, fillDays, monthRanges, dayKey, millisOf, PAYMENT_TYPES, STORE_STATUSES } = require('../lib/routes/admin/metrics.js')._private;

const NOW = Date.UTC(2026, 7, 23, 0, 5); // 23 Aug 2026, just after midnight UTC

test('thirty day buckets end today and start twenty-nine days earlier, with no gaps', () => {
  const days = dayBuckets(NOW);
  assert.equal(days.length, 30);
  assert.equal(days[0].day, '2026-07-25');
  assert.equal(days[29].day, '2026-08-23');
  for (let i = 1; i < days.length; i += 1) {
    const gap = Date.parse(days[i].day) - Date.parse(days[i - 1].day);
    assert.equal(gap, 24 * 60 * 60 * 1000, `${days[i - 1].day} to ${days[i].day} is not one day`);
  }
  assert.ok(days.every((d) => d.count === 0 && d.amount === 0), 'quiet days start at zero');
});

test('items fall into their day, sum their amounts, and anything outside the window is ignored', () => {
  const items = [
    { at: Date.UTC(2026, 7, 23, 0, 1), amount: 514 },
    { at: Date.UTC(2026, 7, 23, 23, 59), amount: 1000 },
    { at: Date.UTC(2026, 6, 25, 12, 0), amount: 250 },
    { at: Date.UTC(2026, 6, 24, 23, 59), amount: 9999 }, // the day before the window
    { at: 0, amount: 9999 }                               // no timestamp at all
  ];
  const days = fillDays(dayBuckets(NOW), items, (i) => i.at, (i) => i.amount);
  const today = days.find((d) => d.day === '2026-08-23');
  const first = days.find((d) => d.day === '2026-07-25');
  assert.deepEqual([today.count, today.amount], [2, 1514]);
  assert.deepEqual([first.count, first.amount], [1, 250]);
  assert.equal(days.reduce((s, d) => s + d.count, 0), 3);
});

test('twelve month ranges end in the current month and abut exactly', () => {
  const months = monthRanges(NOW);
  assert.equal(months.length, 12);
  assert.equal(months[0].month, '2025-09');
  assert.equal(months[11].month, '2026-08');
  assert.equal(months[11].fromIso, '2026-08-01T00:00:00.000Z');
  assert.equal(months[11].toIso, '2026-09-01T00:00:00.000Z');
  for (let i = 1; i < months.length; i += 1) {
    assert.equal(months[i].fromIso, months[i - 1].toIso, 'each month starts where the last one ends');
  }
  /* The ranges are ISO strings because memberSince is stored as one, and
     Firestore compares strings; a January range must sort before February. */
  assert.ok(months[4].fromIso < months[5].fromIso);
});

test('timestamps are read from Firestore Timestamps, ISO strings, or nothing', () => {
  assert.equal(millisOf({ toMillis: () => 1234 }), 1234);
  assert.equal(millisOf('2026-08-23T00:00:00.000Z'), Date.UTC(2026, 7, 23));
  assert.equal(millisOf('not a date'), 0);
  assert.equal(millisOf(null), 0);
  assert.equal(dayKey(Date.UTC(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('the vocabularies the dashboard counts match what the rest of the code writes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const payment = fs.readFileSync(path.join(__dirname, '..', 'lib', 'payment.js'), 'utf8');
  PAYMENT_TYPES.forEach((t) => assert.ok(payment.includes(`'${t}'`), `payment.js does not know the type ${t}`));
  const orders = fs.readFileSync(path.join(__dirname, '..', 'lib', 'store-orders.js'), 'utf8');
  STORE_STATUSES.forEach((s) => assert.ok(orders.includes(`'${s}'`), `store-orders.js never writes ${s}`));
  /* The status a successful card payment is stored with. Counting 'paid'
     here would always give zero. */
  const metrics = fs.readFileSync(path.join(__dirname, '..', 'lib', 'routes', 'admin', 'metrics.js'), 'utf8');
  assert.ok(metrics.includes("r.status === 'success'"));
  assert.ok(!/'==', 'paid'/.test(metrics), 'no query counts a status that is never written');
});
