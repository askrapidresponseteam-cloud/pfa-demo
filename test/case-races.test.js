'use strict';

/* Two people, or two clicks, at once (8 Oct 2026, review A items 2, 3 and
   10, review C item 10). The in-memory Firestore runs with latency, so
   requests fired together really overlap and its transactions conflict as
   Firestore's do. A close is never undone by a reply that read the case a
   moment earlier; two replies never share a Message-ID; a double click
   sends one email; the conversation reads in the order PFA recorded it and
   a long one shows its newest messages. */

const test = require('node:test');
const assert = require('node:assert/strict');

const USERS = {
  'tok-a': { uid: 'ua', email: 'a@pfa.test', claims: { admin: true, role: 'super' } },
  'tok-b': { uid: 'ub', email: 'b@pfa.test', claims: { admin: true, role: 'super' } }
};
const authPath = require.resolve('firebase-admin/auth');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: {
    getAuth: () => ({
      async verifyIdToken(token) { const u = USERS[token]; if (!u) throw new Error('bad token'); return { uid: u.uid, email: u.email }; },
      async getUser(uid) { const u = Object.values(USERS).find((x) => x.uid === uid); return { uid, email: u.email, customClaims: u.claims }; }
    })
  }
};

const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const mailer = require('../lib/caregiver-mail');
const MT = require('../lib/mail-thread');
const INBOUND = require('../lib/inbound-mail');

const ENV = ['PFA_SMTP_USER', 'PFA_SMTP_PASS', 'PUBLIC_SITE_URL', 'CRON_SECRET', 'PFA_SUBMISSIONS_INBOX'];
const saved = {};
let db;
let smtp;
const PERSON = 'asha@example.com';
const INBOX = 'gandhim@exmpls.sansad.in';

test.beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  Object.assign(process.env, { PFA_SMTP_USER: 'info@peopleforanimalsindia.org', PFA_SMTP_PASS: 'x', PUBLIC_SITE_URL: 'https://pfa.test', CRON_SECRET: 'cron-secret' });
  delete process.env.PFA_SUBMISSIONS_INBOX;
  db = memoryFirestore({ latency: 3 });
  firebase._setDbForTests(db);
  smtp = { sent: [], hold: null, fail: null };
  mailer._setSmtpTransport(() => ({
    async sendMail(m) {
      if (smtp.hold) await smtp.hold(m);
      if (smtp.fail) { const e = smtp.fail; smtp.fail = null; throw e; }
      smtp.sent.push(m);
      return { messageId: m.messageId };
    },
    close() {}
  }));
  global.fetch = async () => { throw new Error('no network in tests'); };
});

test.afterEach(() => {
  mailer._setSmtpTransport(null);
  firebase._setDbForTests(null);
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

function call(handler, { method = 'POST', body, query = {}, token = 'tok-a' }) {
  return new Promise((resolve, reject) => {
    const out = { statusCode: 200, raw: '' };
    const response = {
      get statusCode() { return out.statusCode; }, set statusCode(v) { out.statusCode = v; },
      setHeader() {}, getHeader() {}, writeHead(c) { out.statusCode = c; },
      end(raw) { out.raw = String(raw || ''); try { out.json = JSON.parse(out.raw); } catch (_) { out.json = null; } resolve(out); }
    };
    const request = { method, url: '/api', query, body, headers: { host: 'pfa.test', 'x-forwarded-for': '203.0.113.9', authorization: 'Bearer ' + token } };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

const CASE = () => require('../lib/routes/admin/case');
const rec = (ref) => db.dump()['submissions/' + ref];
const toPerson = () => smtp.sent.filter((m) => m.to === PERSON);
const reply = (reference, text, extra = {}, token = 'tok-a') => call(CASE(), { token, body: Object.assign({ reference, action: 'reply', text }, extra) });

async function seed(reference, extra = {}) {
  const createdAt = '2026-10-08T05:00:00.000Z';
  const doc = Object.assign({
    reference, kind: reference.split('-').slice(0, 2).join('-'), status: 'new', createdAt, receivedAtMs: Date.parse(createdAt),
    fields: { name: 'Asha Rao', email: PERSON, question: 'Injured kite on my roof' },
    history: [{ status: 'new', at: createdAt }], threadId: 'abcdefabcdef', threadSubject: `Your question is in - ${reference}`
  }, extra);
  Object.keys(doc).forEach((k) => { if (doc[k] === undefined) delete doc[k]; });
  await db.collection('submissions').doc(reference).set(doc);
}

/* ---- A3 / C10: replies --------------------------------------------------- */

test('A3 two replies sent at once get reply.1 and reply.2: never one Message-ID for two emails', async () => {
  await seed('PFA-Q-2026-00001');
  const [a, b] = await Promise.all([
    reply('PFA-Q-2026-00001', 'First answer', { requestId: 'r-1' }),
    reply('PFA-Q-2026-00001', 'Second answer', { requestId: 'r-2' }, 'tok-b')
  ]);
  assert.equal(a.statusCode, 200, a.raw); assert.equal(b.statusCode, 200, b.raw);
  const ids = toPerson().map((m) => m.messageId).sort();
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1], 'two emails, two Message-IDs');
  assert.deepEqual(ids.map((id) => MT.parse(id).part).sort(), ['reply.1', 'reply.2']);
  assert.equal(rec('PFA-Q-2026-00001').replyCount, 2);
});

test('A3 a record from before thread ids gets exactly one thread, even under two replies at once', async () => {
  await seed('PFA-Q-2026-00002', { threadId: undefined, threadSubject: undefined });
  await Promise.all([
    reply('PFA-Q-2026-00002', 'First answer', { requestId: 'r-1' }),
    reply('PFA-Q-2026-00002', 'Second answer', { requestId: 'r-2' })
  ]);
  const stored = rec('PFA-Q-2026-00002').threadId;
  assert.ok(MT.isThreadId(stored));
  const threads = toPerson().map((m) => MT.parse(m.messageId).threadId);
  assert.deepEqual(threads, [stored, stored], 'both emails carry the thread the record keeps');
  /* so the person's answer to either is filed */
  for (const sent of toPerson()) {
    const out = await INBOUND.file(db, { messageId: `<p-${sent.messageId.length}-${Math.random()}@example.com>`, from: `Asha Rao <${PERSON}>`, to: 'info@peopleforanimalsindia.org',
      subject: 'Re: ' + sent.subject, inReplyTo: sent.messageId, references: sent.messageId, text: 'Thank you.', date: new Date() }, { inboxes: [INBOX], fieldValue: firebase.fieldValue });
    assert.equal(out.filed, true, JSON.stringify(out));
  }
});

test('C10 a double click (the same reply twice at once, no requestId) emails the person once', async () => {
  await seed('PFA-Q-2026-00003');
  const body = 'There is a vet at Lajpat Nagar.';
  const [a, b] = await Promise.all([reply('PFA-Q-2026-00003', body), reply('PFA-Q-2026-00003', body)]);
  assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200);
  assert.equal(toPerson().length, 1, 'one email');
  assert.equal([a, b].filter((r) => r.json.duplicate === true).length, 1, 'the other is answered as a repeat');
  assert.equal(rec('PFA-Q-2026-00003').replyCount, 1);
});

test('A3 a repeated requestId answers 200 { duplicate: true, case } and sends nothing', async () => {
  await seed('PFA-Q-2026-00004');
  const first = await reply('PFA-Q-2026-00004', 'We are sending a rescuer.', { requestId: 'click-77' });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json.case.replyCount, 1, 'the answer carries the case, so the panel redraws and empties the box');
  const again = await reply('PFA-Q-2026-00004', 'We are sending a rescuer.', { requestId: 'click-77' });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json.duplicate, true);
  assert.equal(again.json.case.reference, 'PFA-Q-2026-00004');
  assert.equal(toPerson().length, 1, 'nothing sent the second time');
  assert.equal(Object.keys(db.dump()).filter((k) => k.startsWith('submissions/PFA-Q-2026-00004/messages/')).length, 1);
  const long = await reply('PFA-Q-2026-00004', 'x', { requestId: 'r'.repeat(81) });
  assert.equal(long.statusCode, 400, 'a requestId is at most 80 characters');
});

test('A3 a requestId whose send failed may be tried again, under a new reply number', async () => {
  await seed('PFA-Q-2026-00005');
  smtp.fail = Object.assign(new Error('mailbox does not exist'), { responseCode: 550 });
  const first = await reply('PFA-Q-2026-00005', 'Hello', { requestId: 'try-1' });
  assert.equal(first.statusCode, 502);
  const second = await reply('PFA-Q-2026-00005', 'Hello', { requestId: 'try-1' });
  assert.equal(second.statusCode, 200, second.raw);
  assert.notEqual(second.json.duplicate, true);
  assert.equal(MT.parse(toPerson()[0].messageId).part, 'reply.2', 'the failed attempt\'s number is never reused');
});

test('A3 a reply that failed before anything was sent (a database error) does not hold its requestId: the retry sends', async () => {
  await seed('PFA-Q-2026-00012');
  const real = db.runTransaction.bind(db);
  let failOnce = true;
  db.runTransaction = (fn) => {
    if (failOnce) { failOnce = false; return Promise.reject(Object.assign(new Error('14 UNAVAILABLE'), { code: 14 })); }
    return real(fn);
  };
  const first = await reply('PFA-Q-2026-00012', 'Hello', { requestId: 'flaky-1' });
  assert.equal(first.statusCode, 500);
  assert.equal(toPerson().length, 0);
  const retry = await reply('PFA-Q-2026-00012', 'Hello', { requestId: 'flaky-1' });
  assert.equal(retry.statusCode, 200, retry.raw);
  assert.notEqual(retry.json.duplicate, true);
  assert.equal(toPerson().length, 1);
});

/* ---- A2: lost updates ------------------------------------------------------ */

test('A2 an administrator closing a case while another\'s reply is still sending is not undone', async () => {
  await seed('PFA-Q-2026-00006');
  let release;
  const gate = new Promise((r) => { release = r; });
  smtp.hold = async (m) => { if (m.to === PERSON) await gate; };
  const replying = reply('PFA-Q-2026-00006', 'On our way.', { requestId: 'a-1' });
  await new Promise((r) => setTimeout(r, 60));
  const close = await call(CASE(), { token: 'tok-b', body: { reference: 'PFA-Q-2026-00006', action: 'status', status: 'handled', note: 'Resolved by phone' } });
  assert.equal(close.statusCode, 200, close.raw);
  release();
  const done = await replying;
  assert.equal(done.statusCode, 200);
  const r = rec('PFA-Q-2026-00006');
  assert.equal(r.status, 'handled', 'still closed');
  assert.equal(r.handledBy, 'b@pfa.test');
  assert.equal(r.handledNote, 'Resolved by phone');
  assert.equal(r.replyCount, 1, 'the reply is still counted');
  const last = r.history[r.history.length - 1];
  assert.deepEqual([last.event, last.status, last.direction], ['reply', 'handled', 'out'], 'the reply line says the case was handled at the time');
});

test('A2 a reply and a close fired together end closed, whichever lands first', async () => {
  await seed('PFA-Q-2026-00007');
  const [r1, r2] = await Promise.all([
    reply('PFA-Q-2026-00007', 'On our way.', { requestId: 'a-2' }),
    call(CASE(), { token: 'tok-b', body: { reference: 'PFA-Q-2026-00007', action: 'status', status: 'handled' } })
  ]);
  assert.equal(r1.statusCode, 200); assert.equal(r2.statusCode, 200);
  assert.equal(rec('PFA-Q-2026-00007').status, 'handled');
});

test('A2 two administrators closing at once: one close is kept, the other is told it is already closed', async () => {
  await seed('PFA-Q-2026-00008');
  const [a, b] = await Promise.all([
    call(CASE(), { body: { reference: 'PFA-Q-2026-00008', action: 'status', status: 'handled', note: 'Note A' } }),
    call(CASE(), { token: 'tok-b', body: { reference: 'PFA-Q-2026-00008', action: 'status', status: 'handled', note: 'Note B' } })
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  const winner = a.statusCode === 200 ? 'Note A' : 'Note B';
  assert.equal(rec('PFA-Q-2026-00008').handledNote, winner);
  assert.equal(rec('PFA-Q-2026-00008').history.filter((h) => h.status === 'handled').length, 1);
});

test('A2 two assignments at once: each history line names the status read in its own transaction', async () => {
  await seed('PFA-Q-2026-00009');
  await Promise.all([
    call(CASE(), { body: { reference: 'PFA-Q-2026-00009', action: 'assign', to: 'k@pfa.test' } }),
    call(CASE(), { token: 'tok-b', body: { reference: 'PFA-Q-2026-00009', action: 'status', status: 'in-progress' } })
  ]);
  const r = rec('PFA-Q-2026-00009');
  assert.equal(r.status, 'in-progress');
  assert.equal(r.assignedTo.email, 'k@pfa.test');
  const assign = r.history.find((h) => h.event === 'assign');
  const move = r.history.find((h) => h.status === 'in-progress' && !h.event);
  assert.ok(assign && move);
  if (r.history.indexOf(assign) > r.history.indexOf(move)) assert.equal(assign.status, 'in-progress', 'assigned after the move, so it says in progress');
});

/* ---- A10: the order of the conversation ---------------------------------- */

test('A10 the conversation is in the order PFA recorded it, not by the sender\'s clock', async () => {
  await seed('PFA-Q-2026-00010');
  await reply('PFA-Q-2026-00010', 'Can you send a photo?', { requestId: 'q-1' });
  const out = await INBOUND.file(db, {
    messageId: '<asha-9@example.com>', from: `Asha Rao <${PERSON}>`, to: 'info@peopleforanimalsindia.org',
    subject: 'Re: Your question is in - PFA-Q-2026-00010', inReplyTo: `<PFA-Q-2026-00010.abcdefabcdef.reply.1@peopleforanimalsindia.org>`,
    text: 'Here is the photo you asked for.', date: new Date('2026-10-01T09:00:00Z')
  }, { inboxes: [INBOX], fieldValue: firebase.fieldValue });
  assert.equal(out.filed, true);
  const c = (await call(CASE(), { method: 'GET', query: { reference: 'PFA-Q-2026-00010' } })).json.case;
  assert.deepEqual(c.messages.map((m) => `${m.type}:${m.direction}`), ['reply:out', 'reply:in'], 'the answer follows the question it answers');
  assert.equal(c.messages[1].sentAt, '2026-10-01T09:00:00.000Z', 'the email\'s own date is kept as sentAt');
  assert.ok(c.messages[1].at > c.messages[0].at);
});

test('A10 a long case shows its newest 200 messages, oldest first, and says how many older ones are not shown', async () => {
  db = memoryFirestore();
  firebase._setDbForTests(db);
  await seed('PFA-Q-2026-00011');
  const ref = db.collection('submissions').doc('PFA-Q-2026-00011').collection('messages');
  const t0 = Date.parse('2026-10-08T06:00:00.000Z');
  for (let i = 0; i < 205; i += 1) {
    await ref.doc(`n${String(i).padStart(3, '0')}`).create({ id: `n${i}`, seq: i + 1, type: 'note', text: `note ${i}`, by: 'a@pfa.test', at: new Date(t0 + i * 1000).toISOString() });
  }
  const c = (await call(CASE(), { method: 'GET', query: { reference: 'PFA-Q-2026-00011' } })).json.case;
  assert.equal(c.messages.length, 200);
  assert.equal(c.messages[0].text, 'note 5', 'the oldest shown is the 6th: the newest 200 are read');
  assert.equal(c.messages[199].text, 'note 204', 'and the newest is last');
  assert.equal(c.olderNotShown, 5);
  assert.match(c.olderNote, /5 older messages are/);
  const small = (await call(CASE(), { body: { reference: 'PFA-Q-2026-00011', action: 'note', text: 'one more' } })).json.case;
  assert.equal(small.messages[small.messages.length - 1].text, 'one more');
});
