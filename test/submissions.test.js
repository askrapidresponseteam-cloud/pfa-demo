'use strict';

/* The server now issues every submission reference and lets the sender follow
   it. These pin the two halves: numbers that cannot collide or be chosen by
   the browser, and a lookup that shows only status, only to the person who
   gave the contact. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const S = require('../lib/submissions');
const { createHandler } = require('../lib/routes/pfa-submissions')._private;
const mail = require('../lib/caretaker-mail');

/* Just enough of Firestore: collections of documents, get/create/set, and a
   transaction that runs its body against the same store. */
function fakeDb() {
  const store = new Map();
  const key = (c, id) => `${c}/${id}`;
  const docRef = (c, id) => ({
    id,
    async get() { const data = store.get(key(c, id)); return { exists: Boolean(data), id, data: () => data }; },
    async create(data) {
      if (store.has(key(c, id))) { const e = new Error('Document already exists'); e.code = 6; throw e; }
      store.set(key(c, id), JSON.parse(JSON.stringify(data)));
    },
    async set(data, opts) {
      const prev = (opts && opts.merge && store.get(key(c, id))) || {};
      store.set(key(c, id), Object.assign({}, prev, JSON.parse(JSON.stringify(data))));
    }
  });
  const db = {
    store,
    collection: (c) => ({ doc: (id) => docRef(c, id) }),
    async runTransaction(fn) {
      const tx = { get: (ref) => ref.get(), set: (ref, data, opts) => { ref.set(data, opts); } };
      return fn(tx);
    }
  };
  return db;
}

function request({ method = 'POST', body, query = {}, headers = {} } = {}) {
  const r = new EventEmitter();
  r.method = method; r.query = query; r.headers = headers;
  if (body !== undefined) process.nextTick(() => { r.emit('data', JSON.stringify(body)); r.emit('end'); });
  return r;
}
function responder() {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b || '{}'); } };
  return res;
}
async function run(handler, req) { const res = responder(); await handler(req, res); return res; }

const NOW = Date.UTC(2026, 7, 23, 10, 0);

function handlerWith(db, overrides = {}) {
  return createHandler(Object.assign({
    getDb: () => db, deliver: async () => ({ id: 'm1' }), isConfigured: () => false, now: () => NOW
  }, overrides));
}

test('references are issued by the server, in sequence, per kind and year', async () => {
  const db = fakeDb();
  assert.equal(await S.allocateReference(db, 'PFA-C', NOW), 'PFA-C-2026-00001');
  assert.equal(await S.allocateReference(db, 'PFA-C', NOW), 'PFA-C-2026-00002');
  assert.equal(await S.allocateReference(db, 'PFA-Q', NOW), 'PFA-Q-2026-00001', 'each kind counts on its own');
  assert.equal(await S.allocateReference(db, 'PFA-C', Date.UTC(2027, 0, 1)), 'PFA-C-2027-00001', 'the count restarts each year');
  assert.ok(S.isReference('PFA-C-2026-00042'));
  assert.ok(S.isReference('PFA-C-2026-41873'), 'numbers the browser used to make are still accepted');
  assert.ok(!S.isReference('PFA-C-2026-00042; DROP'));
  assert.ok(!S.isReference('hello'));
});

test('a submission is stored under the issued number and the browser cannot choose or overwrite it', async () => {
  const db = fakeDb();
  const handler = handlerWith(db);
  const first = await run(handler, request({ body: { kind: 'PFA-C', reference: 'PFA-C-2026-00001', data: { summary: 'Dog chained on a terrace', contact: 'asha@example.com' }, page: '/network.html' } }));
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.reference, 'PFA-C-2026-00001');

  /* A second sender who posts the same "reference" gets the next number, and
     the first record is untouched. */
  const second = await run(handler, request({ body: { kind: 'PFA-C', reference: 'PFA-C-2026-00001', data: { summary: 'Something else', contact: '9876543210' } } }));
  assert.equal(second.body.reference, 'PFA-C-2026-00002');
  assert.equal(db.store.get('submissions/PFA-C-2026-00001').fields.summary, 'Dog chained on a terrace');

  const stored = db.store.get('submissions/PFA-C-2026-00001');
  assert.equal(stored.status, 'new');
  assert.deepEqual(stored.history.map((h) => h.status), ['new']);
  assert.equal(stored.contactKeys.length, 1, 'the contact is kept as a key for the follow-up check');
  assert.ok(!stored.contactKeys[0].includes('@'), 'and not as the address itself');
});

test('bad input is refused before any number is spent', async () => {
  const db = fakeDb();
  const handler = handlerWith(db);
  assert.equal((await run(handler, request({ body: { kind: 'PFA-X', data: {} } }))).statusCode, 400);
  const invalid = await run(handler, request({ body: { kind: 'PFA-Q', data: { contact: 'not a contact' } } }));
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.body.fields[0].field, 'contact');
  assert.equal(db.store.has('counters/submissions'), false, 'no counter was touched');
});

test('following needs the number and the contact that was given with it, and returns status only', async () => {
  const db = fakeDb();
  const handler = handlerWith(db);
  S.resetForTests();
  await run(handler, request({ body: { kind: 'PFA-C', data: { summary: 'Kittens abandoned near the market', details: 'Very private details', contact: ' Asha@Example.com ' } } }));

  const missing = await run(handler, request({ method: 'GET', query: { reference: 'PFA-C-2026-00001' } }));
  assert.equal(missing.statusCode, 403);
  assert.equal(missing.body.code, 'CONTACT_NEEDED');

  const wrong = await run(handler, request({ method: 'GET', query: { reference: 'PFA-C-2026-00001', contact: 'someone@else.com' } }));
  assert.equal(wrong.statusCode, 403);
  assert.equal(wrong.body.code, 'CONTACT_MISMATCH');

  const right = await run(handler, request({ method: 'GET', query: { reference: ' pfa-c-2026-00001 ', contact: 'ASHA@example.com' } }));
  assert.equal(right.statusCode, 200);
  assert.equal(right.body.statusLabel, 'Received');
  assert.equal(right.body.kindLabel, 'Case follow request');
  assert.equal(right.body.timeline.length, 1);
  const text = JSON.stringify(right.body);
  assert.ok(!text.includes('Kittens') && !text.includes('private') && !text.includes('asha@'), 'nothing from the report leaks');

  const unknown = await run(handler, request({ method: 'GET', query: { reference: 'PFA-C-2026-00099', contact: 'a@b.com' } }));
  assert.equal(unknown.statusCode, 404);
  const junk = await run(handler, request({ method: 'GET', query: { reference: 'abc' } }));
  assert.equal(junk.statusCode, 400);
});

test('a mobile given with spaces or a country code still matches', () => {
  const keys = S.contactKeysFor({ name: 'Asha', mobile: '+91 98765 43210' });
  assert.equal(keys.length, 1);
  assert.equal(S.contactKey('9876543210'), keys[0]);
  assert.equal(S.contactKey('098765-43210'), keys[0]);
  assert.notEqual(S.contactKey('9876543211'), keys[0]);
  /* A field called something else that holds an email still counts. */
  assert.equal(S.contactKeysFor({ 'where to reach you': 'x@y.in' }).length, 1);
  /* Old records have no keys stored; they are derived from the fields. */
  assert.equal(S.contactMatches({ fields: { email: 'x@y.in' } }, 'X@Y.IN').ok, true);
  assert.deepEqual(S.contactMatches({ fields: { summary: 'no contact given' } }, ''), { required: false, ok: true });
});

test('the public view turns staff statuses into plain words and keeps the history in order', () => {
  const view = S.publicView({
    reference: 'PFA-Q-2026-00007', kind: 'PFA-Q', status: 'spam', createdAt: '2026-08-01T10:00:00.000Z',
    handledBy: 'staff@pfa.org', fields: { question: 'secret' },
    history: [{ status: 'new', at: '2026-08-01T10:00:00.000Z' }, { status: 'in-progress', at: '2026-08-02T09:00:00.000Z' }, { status: 'spam', at: '2026-08-03T09:00:00.000Z' }]
  });
  assert.equal(view.statusLabel, 'Closed', 'spam is never shown as spam');
  assert.deepEqual(view.timeline.map((t) => t.label), ['Received', 'Being handled', 'Closed']);
  assert.equal(view.updatedAt, '2026-08-03T09:00:00.000Z');
  assert.equal(view.fields, undefined);
  assert.equal(view.handledBy, undefined);

  /* Records from before the history existed still produce a timeline. */
  const legacy = S.publicView({ reference: 'PFA-C-2026-41873', kind: 'PFA-C', status: 'handled', createdAt: '2026-07-01T00:00:00.000Z', handledAt: '2026-07-05T00:00:00.000Z' });
  assert.deepEqual(legacy.timeline.map((t) => t.label), ['Received', 'Closed']);
});

test('repeated lookups from one connection are slowed down', async () => {
  S.resetForTests();
  for (let i = 0; i < 40; i += 1) assert.equal(S.rateLimited('203.0.113.9', NOW + i), false);
  assert.equal(S.rateLimited('203.0.113.9', NOW + 41), true);
  assert.equal(S.rateLimited('203.0.113.10', NOW + 41), false, 'another connection is unaffected');
  assert.equal(S.rateLimited('203.0.113.9', NOW + 16 * 60 * 1000), false, 'and the window passes');
  S.resetForTests();
});

test('an acknowledgement goes to the email given, and never delays or fails the submission', async () => {
  const sent = [];
  const db = fakeDb();
  const handler = handlerWith(db, { isConfigured: () => true, deliver: async (m) => { sent.push(m); return { id: 'ok' }; } });
  const res = await run(handler, request({ body: { kind: 'PFA-Q', data: { question: 'Do you take in birds?', name: 'meena iyer', contact: 'meena@example.com' } }, headers: { host: 'peopleforanimalsindia.org' } }));
  assert.equal(res.body.acknowledged, true);
  assert.equal(sent[0].to, 'meena@example.com');
  assert.equal(sent[0].template, 'submission_received');
  assert.equal(sent[0].payload.name, 'Meena Iyer');
  assert.match(sent[0].payload.followUrl, /^https:\/\/peopleforanimalsindia\.org\/network\.html#follow=PFA-Q-2026-00001$/);

  const slow = handlerWith(fakeDb(), { isConfigured: () => true, deliver: () => new Promise(() => {}) });
  const started = Date.now();
  const res2 = await run(slow, request({ body: { kind: 'PFA-Q', data: { question: 'Do you take in injured birds at the Delhi unit?', contact: 'x@y.in' } } }));
  assert.equal(res2.statusCode, 200, 'the number is issued even if mail hangs');
  assert.equal(res2.body.acknowledged, false);
  assert.ok(Date.now() - started < 4000);

  const rendered = mail.render('submission_received', sent[0].payload);
  assert.match(rendered.subject, /PFA-Q-2026-00001/);
  assert.ok(rendered.html.includes('Follow it') && rendered.text.includes('Reference: PFA-Q-2026-00001'));
});

test('the browser waits for the server number instead of inventing one', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const site = fs.readFileSync(path.join(__dirname, '..', 'assets', 'site.js'), 'utf8');
  const save = site.slice(site.indexOf('PFA.saveSubmission='), site.indexOf('PFA.followUrl='));
  assert.ok(!/PFA\.ref\(/.test(save), 'no client-made reference is sent');
  assert.ok(/fetch\('\/api\/pfa-submissions'/.test(save));
  assert.ok(/p\.retry=send/.test(save), 'a failed send can be retried');
  const network = fs.readFileSync(path.join(__dirname, '..', 'assets', 'network.js'), 'utf8');
  assert.ok(/\/api\/pfa-submissions\?reference=/.test(network), 'the follow form asks PFA, not localStorage');
  const html = fs.readFileSync(path.join(__dirname, '..', 'network.html'), 'utf8');
  assert.ok(html.includes('id="followContact"'), 'the follow form asks for the contact given');
});
