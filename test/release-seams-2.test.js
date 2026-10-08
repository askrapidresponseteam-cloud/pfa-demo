'use strict';

/* Problems the independent check found after the six parts of the 8 Oct
   2026 release were merged, each shown failing first:

   1. A paid record must never be filed under another payment's record: with
      the counter behind the records, a membership was answered with
      somebody else's number, record and letter.
   2. The visitor's address on Firebase is read from the right of
      X-Forwarded-For, past the platform's own proxies; the sign-in brake and
      the admin log use the same trusted address.
   3. A counter far behind the records steps forward instead of refusing
      every submission of its kind for good.
   4. A caregiver photograph attached on a later callback reaches PFA's
      inbox in a second copy.
   5. A key saved before the contact-field rule no longer opens a report
      for the person accused. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const S = require('../lib/submissions');
const IP = require('../lib/client-ip');

const ENV = ['VERCEL', 'K_SERVICE', 'FUNCTION_TARGET', 'FIREBASE_CONFIG', 'PFA_TRUSTED_PROXIES', 'PFA_AUTH_PEPPER'];
const saved = {};
let db;

test.beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  db = memoryFirestore({ latency: 1 });
  firebase._setDbForTests(db);
});

test.afterEach(() => {
  firebase._setDbForTests(null);
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const YEAR = S.referenceYear();

test('1: a number already on file is stepped past, inside a payment transaction as well', async () => {
  for (let n = 1; n <= 3; n += 1) {
    await db.collection('submissions').doc(S.formatReference('PFA-MEM', YEAR, n)).set({ kind: 'PFA-MEM', payment: { orderId: `OTHER-${n}` } });
  }
  assert.equal(await S.allocateReference(db, 'PFA-MEM'), S.formatReference('PFA-MEM', YEAR, 4));
  await db.collection('transactions').doc('PFA-MEM-ORDER1').set({ type: 'membership', status: 'success' });
  const out = await firebase.claimRecordReference({ orderId: 'PFA-MEM-ORDER1', field: 'membershipReference', allocate: (scoped) => S.allocateReference(scoped, 'PFA-MEM'), threadId: 'abcdefabcdef' });
  assert.equal(out.reference, S.formatReference('PFA-MEM', YEAR, 5), 'the payment gets the next free number');
});

test('1: filing never answers a payment with another payment\'s record', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/routes/payment/response.js'), 'utf8');
  assert.match(src, /REFERENCE_TAKEN/);
  assert.match(src, /theirs !== mine/);
});

test('3: a counter thirty behind the records still issues the next free number, and moves forward', async () => {
  for (let n = 1; n <= 30; n += 1) await db.collection('submissions').doc(S.formatReference('PFA-Q', YEAR, n)).set({ kind: 'PFA-Q' });
  assert.equal(await S.allocateReference(db, 'PFA-Q'), S.formatReference('PFA-Q', YEAR, 31));
  assert.equal(db.dump()['counters/submissions'][`PFA-Q-${YEAR}`], 31);
  assert.equal(await S.allocateReference(db, 'PFA-Q'), S.formatReference('PFA-Q', YEAR, 32));
});

test('2: on Firebase the visitor is the first address from the right that is not a proxy', () => {
  process.env.K_SERVICE = 'api';
  const ip = (xff) => IP.clientIp({ headers: { 'x-forwarded-for': xff }, socket: { remoteAddress: '169.254.1.1' } });
  assert.equal(ip('198.51.100.7'), '198.51.100.7');
  assert.equal(ip('1.2.3.4, 198.51.100.7'), '198.51.100.7', 'a forged first entry is ignored');
  assert.equal(ip('9.9.9.9, 198.51.100.7, 35.191.10.20'), '198.51.100.7', 'past Google\'s front end');
  assert.equal(ip('9.9.9.9, 198.51.100.7, 151.101.1.5, 130.211.0.9'), '198.51.100.7', 'past a CDN and a load balancer');
  assert.equal(ip('198.51.100.7, 10.0.0.3'), '198.51.100.7', 'past a private hop');
  process.env.PFA_TRUSTED_PROXIES = '203.0.113.0/24';
  assert.equal(ip('198.51.100.7, 203.0.113.50'), '198.51.100.7', 'ranges can be added without code');
  assert.equal(IP.masked('198.51.100.7'), '198.51.100.x');
});

test('2: on Vercel it is x-real-ip; elsewhere the socket', () => {
  process.env.VERCEL = '1';
  assert.equal(IP.clientIp({ headers: { 'x-real-ip': '198.51.100.8', 'x-forwarded-for': '1.1.1.1' } }), '198.51.100.8');
  delete process.env.VERCEL;
  assert.equal(IP.clientIp({ headers: { 'x-forwarded-for': '1.1.1.1' }, socket: { remoteAddress: '::ffff:127.0.0.1' } }), '127.0.0.1');
});

test('2: the sign-in brake, the admin log and the caregiver route no longer read the first X-Forwarded-For entry', () => {
  for (const file of ['lib/admin-auth.js', 'lib/admin-audit.js', 'lib/routes/caregiver/apply.js', 'lib/submissions.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /x-forwarded-for'\]\s*\|\|\s*''\)\.split\(','\)\[0\]/, file);
  }
});

test('4: a photograph attached after the first copy went gets its own copy, threaded under the first', () => {
  const FORWARD = require('../lib/submission-forward');
  const record = { reference: 'PFA-CG-2026-00001', threadId: 'abcdefabcdef' };
  const first = FORWARD.forwardKey(record, 'gandhim@exmpls.sansad.in');
  const second = FORWARD.forwardKey(Object.assign({ followUp: 'photo' }, record), 'gandhim@exmpls.sansad.in');
  assert.notEqual(first, second);
  const mail = require('../lib/caregiver-mail');
  const a = mail.render('submission_forward', { reference: 'PFA-CG-2026-00001', threadId: 'abcdefabcdef', kindLabel: 'Colony caregiver application', name: 'Asha' });
  const b = mail.render('submission_forward', { reference: 'PFA-CG-2026-00001', threadId: 'abcdefabcdef', kindLabel: 'Colony caregiver application', name: 'Asha', followUp: 'photo', attachments: 1, attachedToEmail: 1 });
  assert.notEqual(a.messageId, b.messageId, 'two emails never share a Message-ID');
  assert.equal(b.inReplyTo, a.messageId, 'the second answers the first');
  assert.match(b.text, /could not be attached to the first copy/);
  assert.notEqual(mail.idempotencyKey('submission_forward', 'x@y.in', { reference: 'R', threadId: 'abcdefabcdef' }),
    mail.idempotencyKey('submission_forward', 'x@y.in', { reference: 'R', threadId: 'abcdefabcdef', followUp: 'photo' }));
});

test('5: a key saved from "Who is doing it" no longer opens the report', () => {
  process.env.PFA_AUTH_PEPPER = 'p';
  const fields = { accused: 'Ramesh 9811122333', mobile: '9876543210', email: 'asha@example.com' };
  /* keys as the old any-field rule saved them */
  const oldKeys = [S.contactKey('Ramesh 9811122333'), S.contactKey('9876543210'), S.contactKey('asha@example.com')].filter(Boolean);
  const record = { fields, contactKeys: oldKeys };
  assert.equal(S.contactMatches(record, '9811122333').ok, false, 'the accused');
  assert.equal(S.contactMatches(record, '9876543210').ok, true, 'the reporter');
  assert.equal(S.contactMatches(record, 'asha@example.com').ok, true);
});

test('the case and the payments register carry what the panel shows', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/routes/admin/case.js'), 'utf8');
  assert.match(src, /photoPending: data\.photoPending === true/);
  assert.match(src, /photoMissing: data\.photoMissing === true/);
  const rec = fs.readFileSync(path.join(__dirname, '..', 'lib/routes/admin/records.js'), 'utf8');
  assert.match(rec, /needsAttention: data\.needsAttention === true/);
  assert.match(rec, /settledAfter: data\.settledAfter/);
});
