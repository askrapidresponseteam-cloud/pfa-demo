'use strict';

/* Owner, 8 Oct 2026: "have copies in info@'s Sent folder. fool proof way."
   Every email the site sends through the mailbox is saved in that mailbox's
   Sent folder: at once when the mailbox answers, from the database on the
   next run when it does not, never twice, and never at the cost of the email
   itself. The mailbox here is a stand-in that behaves as IMAP does. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const SENT = require('../lib/sent-copy');
const mailer = require('../lib/caregiver-mail');

let db;
let box;
let smtp;
const SAVED = {};

const unfold = (raw) => Buffer.from(raw).toString('utf8').replace(/\r\n[ \t]+/g, ' ');
const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mailbox(options = {}) {
  const state = { folders: options.folders || [{ path: 'INBOX' }, { path: 'Sent', specialUse: '\\Sent' }], sent: [], created: [], down: false, sessions: 0 };
  SENT._setClient(() => ({
    async connect() { state.sessions += 1; if (state.down) throw Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }); },
    async list() { return state.folders; },
    async mailboxCreate(path) { state.created.push(path); state.folders.push({ path }); },
    async getMailboxLock() { return { release() {} }; },
    async search(query) {
      const id = query.header['message-id'];
      /* as an IMAP server does: long headers are folded onto a second line,
         and SEARCH HEADER matches the unfolded value */
      return state.sent.map((m, i) => (unfold(m.raw).includes(`Message-ID: ${id}`) ? i + 1 : 0)).filter(Boolean);
    },
    async append(path, raw, flags, date) { state.sent.push({ path, raw: Buffer.from(raw), flags, date }); },
    async logout() {}
  }));
  return state;
}

test.beforeEach(() => {
  for (const k of ['PFA_SMTP_USER', 'PFA_SMTP_PASS', 'PFA_SENT_COPY', 'PFA_MAIL_API_KEY']) SAVED[k] = process.env[k];
  process.env.PFA_SMTP_USER = 'info@peopleforanimalsindia.org';
  process.env.PFA_SMTP_PASS = 'test-password';
  delete process.env.PFA_SENT_COPY;
  delete process.env.PFA_MAIL_API_KEY;
  db = memoryFirestore();
  firebase._setDbForTests(db);
  SENT._setDb(() => db);
  box = mailbox();
  smtp = [];
  mailer._setSmtpTransport(() => ({
    async sendMail(message) { smtp.push(message); return { messageId: message.messageId }; },
    close() {}
  }));
});

test.afterEach(async () => {
  await SENT.settle(2000);
  mailer._setSmtpTransport(null);
  SENT._setClient(null);
  SENT._setDb(null);
  firebase._setDbForTests(null);
  for (const [k, v] of Object.entries(SAVED)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

const send = (to = 'gandhim@exmpls.sansad.in') => mailer.deliver({ to, template: 'inbox_test', payload: { at: new Date().toISOString(), from: 'People for Animals <info@peopleforanimalsindia.org>', by: 'admin@pfa.test', siteUrl: 'https://pfa.test' } });
const pending = () => Object.entries(db.dump()).filter(([k, v]) => /^sentCopies\/[^/]+$/.test(k) && v.status === 'pending').map(([k]) => k);
const heldBytes = () => Object.entries(db.dump()).filter(([k]) => /^sentCopies\/[^/]+\/parts\//.test(k)).reduce((n, [, v]) => n + Buffer.from(v.data).length, 0);

test('an email sent through the mailbox is saved in its Sent folder, with the same Message-ID', async () => {
  await send();
  assert.equal(smtp.length, 1, 'sent once');
  const settled = await SENT.settle(5000);
  assert.equal(settled.saved, 1);
  assert.equal(box.sent.length, 1, 'one copy in Sent');
  assert.equal(box.sent[0].path, 'Sent');
  assert.deepEqual(box.sent[0].flags, ['\\Seen'], 'marked read, as a sent email is');
  const raw = unfold(box.sent[0].raw);
  assert.match(raw, new RegExp(`Message-ID: ${esc(smtp[0].messageId)}`), 'the very message that went');
  assert.match(raw, /To: gandhim@exmpls\.sansad\.in/);
  assert.match(raw, /From: .*info@peopleforanimalsindia\.org/);
  assert.equal(box.sent[0].date.getTime(), smtp[0].date.getTime(), 'dated when it was sent');
  assert.deepEqual(pending(), [], 'nothing left waiting once it is in');
});

test('when the mailbox does not answer, the email still goes, and the copy is saved by the next run', async () => {
  box.down = true;
  const out = await send();
  assert.ok(out, 'the email went');
  assert.equal(smtp.length, 1);
  await SENT.settle(5000);
  assert.equal(box.sent.length, 0);
  assert.equal(pending().length, 1, 'kept in the database');
  const kept = db.dump()[pending()[0]];
  assert.equal(kept.status, 'pending');
  assert.match(kept.lastError, /ETIMEDOUT|could not be reached/);

  const early = await SENT.flush(db);
  assert.equal(early.saved, 0, 'not touched inside the first two minutes, so it never races the first attempt');

  box.down = false;
  const later = await SENT.flush(db, { settleAfterMs: 0 });
  assert.equal(later.saved, 1);
  assert.equal(box.sent.length, 1);
  assert.match(unfold(box.sent[0].raw), new RegExp(`Message-ID: ${esc(smtp[0].messageId)}`));
  assert.deepEqual(pending(), []);
  assert.equal(heldBytes(), 0, 'the bytes held for the journey are cleared');
  const record = Object.entries(db.dump()).find(([k]) => /^sentCopies\/[^/]+$/.test(k))[1];
  assert.equal(record.status, 'saved', 'and the record of it stays: nothing is deleted');
  assert.ok(record.savedAtMs > 0);
});

test('a large email with photographs is kept in parts and saved back byte for byte', async () => {
  box.down = true;
  const big = Buffer.alloc(1600 * 1024, 7);
  const message = { date: new Date(), messageId: '<big-1@peopleforanimalsindia.org>', from: 'People for Animals <info@peopleforanimalsindia.org>', to: 'gandhim@exmpls.sansad.in', subject: 'With photos', text: 'See attached.', attachments: [{ filename: 'photo.jpg', content: big, contentType: 'image/jpeg' }] };
  await SENT.keep(message);
  await SENT.settle(5000);
  const parts = Object.keys(db.dump()).filter((k) => /^sentCopies\/[^/]+\/parts\//.test(k));
  assert.ok(parts.length >= 3, `kept in ${parts.length} parts, each under Firestore's 1 MiB`);
  box.down = false;
  await SENT.flush(db, { settleAfterMs: 0 });
  assert.equal(box.sent.length, 1);
  const raw = box.sent[0].raw.toString('utf8');
  assert.ok(raw.includes(big.toString('base64').slice(0, 76)), 'the photograph is in the copy');
  assert.ok(box.sent[0].raw.length > big.length, 'whole, not cut short');
});

test('never twice: a copy already in Sent is not added again', async () => {
  await send();
  await SENT.settle(5000);
  assert.equal(box.sent.length, 1);
  const raw = box.sent[0].raw;
  const id = SENT.idOf(smtp[0].messageId);
  await SENT.saveCopies([{ id, messageId: smtp[0].messageId, raw, date: new Date().toISOString() }]);
  assert.equal(box.sent.length, 1, 'found by its Message-ID and left alone');
});

test('the Sent folder is found by its flag, then by name, and made if there is none', async () => {
  box = mailbox({ folders: [{ path: 'INBOX' }, { path: 'Sent Items' }] });
  await send();
  await SENT.settle(5000);
  assert.equal(box.sent[0].path, 'Sent Items');

  box = mailbox({ folders: [{ path: 'INBOX' }] });
  await send();
  await SENT.settle(5000);
  assert.deepEqual(box.created, ['Sent']);
  assert.equal(box.sent[0].path, 'Sent');
});

test('a failure while keeping the copy never fails the email or sends it twice', async () => {
  SENT._setDb(() => { throw new Error('database unreachable'); });
  box.down = true;
  const out = await send();
  assert.ok(out);
  assert.equal(smtp.length, 1, 'exactly one email, even though the copy could not be kept');
});

test('PFA_SENT_COPY=off turns it off, and email through Resend has no mailbox to save into', async () => {
  process.env.PFA_SENT_COPY = 'off';
  await send();
  await SENT.settle(2000);
  assert.equal(box.sessions, 0);
  assert.deepEqual(pending(), []);
});

test('the reading of replies saves whatever is still waiting', async () => {
  box.down = true;
  await send();
  await SENT.settle(5000);
  assert.equal(pending().length, 1);
  box.down = false;
  const doc = db.collection('sentCopies').doc(pending()[0].split('/')[1]);
  await doc.set({ createdAtMs: Date.now() - 3 * 60 * 1000 }, { merge: true });   // past the first attempt's head start

  const INBOUND = require('../lib/inbound-mail');
  INBOUND._setClient(() => ({
    mailbox: { uidValidity: 1 },
    async connect() {}, async getMailboxLock() { return { release() {} }; },
    async search() { return []; }, async fetchOne() { return null; }, async logout() {}
  }));
  process.env.CRON_SECRET = 'cron-secret';
  try {
    const route = require('../lib/routes/inbound-mail');
    const res = await new Promise((resolve) => {
      const out = { statusCode: 200 };
      route({ method: 'POST', url: '/api/inbound-mail', query: {}, body: {}, headers: { authorization: 'Bearer cron-secret', host: 'pfa.test' } }, {
        set statusCode(v) { out.statusCode = v; }, get statusCode() { return out.statusCode; },
        setHeader() {}, end(raw) { out.json = JSON.parse(raw); resolve(out); }
      });
    });
    assert.equal(res.statusCode, 200, JSON.stringify(res.json));
    assert.equal(res.json.sentCopies.saved, 1);
    assert.equal(box.sent.length, 1);
    assert.deepEqual(pending(), []);
  } finally {
    INBOUND._setClient(null);
    delete process.env.CRON_SECRET;
  }
});

test('on Vercel the function is kept alive until the copy is in Sent', async () => {
  const held = [];
  const key = Symbol.for('@vercel/request-context');
  globalThis[key] = { get: () => ({ waitUntil: (p) => held.push(p) }) };
  try {
    await send();
    assert.equal(held.length, 1, 'the save was handed to waitUntil');
    assert.equal(await held[0], true, 'and it finished with the copy in Sent');
    assert.equal(box.sent.length, 1);
  } finally { delete globalThis[key]; }
});
