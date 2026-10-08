'use strict';

/* Copies in info@'s Sent folder (lib/sent-copy.js), 8 Oct 2026, review C:

   item 11  one copy the mailbox refused threw for the whole batch, every
            run, with no limit: the copies after it never reached Sent.
            Now each copy is tried on its own, attempts are counted, and a
            copy refused five times is parked and shown.
   item 12  search-then-append is two steps; two runs at once both found
            nothing and both appended. Now each copy is claimed with a
            Firestore lease first. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const SENT = require('../lib/sent-copy');

const ENV = ['PFA_SMTP_USER', 'PFA_SMTP_PASS', 'PFA_SENT_COPY', 'PFA_IMAP_USER', 'PFA_IMAP_PASS'];
const saved = {};
let db;
let box;

const idIn = (raw) => String(raw).match(/Message-ID: (.*)/)[1].trim();

function mailbox(options) {
  const o = options || {};
  const state = { down: false, sent: [], appends: [], sessions: 0 };
  const pause = () => new Promise((r) => setTimeout(r, o.tick || 0));
  SENT._setClient(() => ({
    async connect() { state.sessions += 1; if (state.down) throw Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }); await pause(); },
    async list() { return [{ path: 'INBOX' }, { path: 'Sent', specialUse: '\\Sent' }]; },
    async getMailboxLock() { return { release() {} }; },
    async search(q) { await pause(); return state.sent.map((m, i) => (m === q.header['message-id'] ? i + 1 : 0)).filter(Boolean); },
    async append(path, raw) {
      await pause();
      const id = idIn(raw);
      state.appends.push(id);
      if (/Subject: poison/.test(String(raw).slice(0, 4000))) throw Object.assign(new Error('Command failed'), { responseText: '[TOOBIG] Message too large' });
      state.sent.push(id);
    },
    async logout() {}
  }));
  return state;
}

test.beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, { PFA_SMTP_USER: 'info@peopleforanimalsindia.org', PFA_SMTP_PASS: 'test-password' });
});

test.afterEach(async () => {
  await SENT.settle(3000);
  SENT._setClient(null);
  SENT._setDb(null);
  firebase._setDbForTests(null);
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

function useDb(options) {
  db = memoryFirestore(options);
  firebase._setDbForTests(db);
  SENT._setDb(() => db);
}

const keep = (id, subject) => SENT.keep({ date: new Date(), messageId: id, from: 'People for Animals <info@peopleforanimalsindia.org>', to: 'gandhim@exmpls.sansad.in', subject: subject || 'fine', text: 't' });
const records = () => Object.entries(db.dump()).filter(([k]) => /^sentCopies\/[^/]+$/.test(k)).map(([, v]) => v);
const record = (id) => records().find((r) => r.messageId === id);

async function keptWhileDown(ids) {
  box.down = true;
  for (const id of ids) await keep(id, id.includes('poison') ? 'poison' : 'fine');
  await SENT.settle(3000);
  box.down = false;
}

test('C11 one copy the mailbox refuses does not hold up the others', async () => {
  useDb();
  box = mailbox();
  await keptWhileDown(['<5-poison@pfa>', '<1-good@pfa>', '<3-good@pfa>', '<4-good@pfa>']);
  const run = await SENT.flush(db, { settleAfterMs: 0 });
  assert.equal(run.saved, 3, JSON.stringify(run));
  assert.deepEqual(box.sent.slice().sort(), ['<1-good@pfa>', '<3-good@pfa>', '<4-good@pfa>']);
  assert.equal(run.waiting, 1);
  const poison = record('<5-poison@pfa>');
  assert.equal(poison.status, 'pending');
  assert.equal(poison.refusals, 1);
  assert.equal(poison.attempts, 2, 'the first try (mailbox down) and this refusal');
  assert.match(poison.lastError, /TOOBIG|Command failed/);
  assert.ok(records().filter((r) => r.status === 'saved').length === 3);
});

test('C11 a copy refused five times is parked, the panel is told, and it is not tried again', async () => {
  useDb();
  box = mailbox();
  await keptWhileDown(['<5-poison@pfa>', '<1-good@pfa>']);
  for (let i = 0; i < SENT.MAX_REFUSALS; i += 1) await SENT.flush(db, { settleAfterMs: 0 });
  const poison = record('<5-poison@pfa>');
  assert.equal(poison.status, 'parked');
  assert.equal(poison.refusals, 5);
  const shown = await SENT.status(db);
  assert.equal(shown.parked, 1);
  assert.equal(shown.waiting, 0);
  assert.deepEqual(shown.parkedIds, ['<5-poison@pfa>']);
  const tries = box.appends.filter((x) => x === '<5-poison@pfa>').length;
  await SENT.flush(db, { settleAfterMs: 0 });
  assert.equal(box.appends.filter((x) => x === '<5-poison@pfa>').length, tries, 'a parked copy is left alone');
  assert.deepEqual(box.sent, ['<1-good@pfa>']);
});

test('C11 a mailbox that cannot be reached parks nothing; it only counts the attempts (guard)', async () => {
  useDb();
  box = mailbox();
  await keptWhileDown(['<1-good@pfa>']);
  box.down = true;
  for (let i = 0; i < 6; i += 1) await SENT.flush(db, { settleAfterMs: 0 });
  const r = record('<1-good@pfa>');
  assert.equal(r.status, 'pending');
  assert.equal(r.attempts, 7);
  assert.ok(!(r.refusals > 0), 'an unreachable mailbox says nothing about the copy');
  box.down = false;
  await SENT.flush(db, { settleAfterMs: 0 });
  assert.deepEqual(box.sent, ['<1-good@pfa>']);
});

test('C12 two flushes at once put each copy into Sent once', async () => {
  useDb({ latency: 3 });
  box = mailbox({ tick: 20 });
  await keptWhileDown(['<race-1@pfa>', '<race-2@pfa>']);
  const [a, b] = await Promise.all([SENT.flush(db, { settleAfterMs: 0 }), SENT.flush(db, { settleAfterMs: 0 })]);
  assert.deepEqual(box.sent.slice().sort(), ['<race-1@pfa>', '<race-2@pfa>'], JSON.stringify({ a, b }));
  assert.equal(box.appends.length, 2, 'appended once each');
  assert.equal(a.saved + b.saved, 2);
  assert.ok(records().every((r) => r.status === 'saved'));
});

test('C12 the first attempt and a run elsewhere at the same moment do not both append', async () => {
  useDb({ latency: 3 });
  box = mailbox({ tick: 20 });
  await keep('<now-1@pfa>');
  /* another server's run knows nothing of this process's attempt in flight */
  const mine = [...SENT._inFlight.values()];
  SENT._inFlight.clear();
  const elsewhere = await SENT.flush(db, { settleAfterMs: 0 });
  await Promise.all(mine);
  assert.equal(box.appends.length, 1, JSON.stringify(elsewhere));
  assert.deepEqual(box.sent, ['<now-1@pfa>']);
  assert.equal(record('<now-1@pfa>').status, 'saved');
});
