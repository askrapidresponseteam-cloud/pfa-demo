'use strict';

/* A copy of every email the site sends, in the Sent folder of the mailbox it
 * sends from.
 *
 * Owner, 8 Oct 2026: "have copies in info@'s Sent folder. fool proof way."
 * An email app puts what it sends into Sent itself; SMTP does not, so the
 * site's emails reached gandhim and the people who wrote in, and info@'s Sent
 * folder stayed empty. This puts them there over IMAP (the same login the
 * site already uses to read replies). Saving into a folder is not sending, so
 * it does not count against GoDaddy's 500-a-day SMTP limit.
 *
 * Fool proof, in this order:
 *
 *   1. kept       The moment SMTP accepts an email, the exact message (the
 *                 same Message-ID, date and attachments) is written to
 *                 Firestore, under sentCopies/<id>, in parts small enough
 *                 for a document. A serverless function can be frozen the
 *                 instant it answers; what is in the database is not lost.
 *   2. saved now  The copy is put into Sent straight away, in the
 *                 background: it never holds up or fails the email itself.
 *   3. saved later Anything still waiting after two minutes is saved by the
 *                 run that reads replies (every ten minutes on Firebase, the
 *                 daily cron on Vercel, "Read the mailbox now" in the panel),
 *                 and retried on every run until it is in.
 *
 * Never twice: before a copy goes in, Sent is searched for its Message-ID,
 * and a copy already there is not added again. Once in, the record is marked
 * saved and the bytes held for the journey are cleared (records are never
 * deleted). PFA_SENT_COPY=off turns all of this off. */

const crypto = require('crypto');

const COLLECTION = 'sentCopies';
const PART_BYTES = 700 * 1024;          // under Firestore's 1 MiB per document
const SETTLE_AFTER_MS = 2 * 60 * 1000;  // the immediate attempt's head start
const SENT_NAMES = /^(sent|sent items|sent messages|sent mail|inbox[./]sent)$/i;

let makeClient = (options) => {
  const { ImapFlow } = require('imapflow');
  return new ImapFlow(options);
};
let compose = (message) => new Promise((resolve, reject) => {
  const MailComposer = require('nodemailer/lib/mail-composer');
  new MailComposer(Object.assign({}, message)).compile().build((error, raw) => (error ? reject(error) : resolve(raw)));
});
let dbOf = () => require('./firebase').getDb();

function login() {
  return {
    user: String(process.env.PFA_IMAP_USER || process.env.PFA_SMTP_USER || '').trim(),
    pass: String(process.env.PFA_IMAP_PASS || process.env.PFA_SMTP_PASS || '')
  };
}

function enabled() {
  if (/^off$/i.test(String(process.env.PFA_SENT_COPY || '').trim())) return false;
  const { user, pass } = login();
  return Boolean(user && pass);
}

function hosts() {
  const named = String(process.env.PFA_IMAP_HOST || '').trim();
  return named ? [named] : ['imap.titan.email', 'imap.secureserver.net'];
}

const idOf = (messageId) => crypto.createHash('sha256').update(String(messageId), 'utf8').digest('hex').slice(0, 32);

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms); })
  ]).finally(() => clearTimeout(timer));
}

/* ---- the mailbox ------------------------------------------------------ */

async function sentPath(client) {
  const boxes = await client.list();
  const flagged = boxes.find((b) => b.specialUse === '\\Sent');
  if (flagged) return flagged.path;
  const named = boxes.find((b) => SENT_NAMES.test(String(b.path || '')));
  if (named) return named.path;
  await client.mailboxCreate('Sent');
  return 'Sent';
}

/* Puts each copy into Sent in one session. Resolves to the ids now in Sent
   (added, or found already there); throws only if the mailbox could not be
   opened at all. */
async function saveCopies(copies) {
  if (!copies.length) return [];
  const { user, pass } = login();
  const port = Number(process.env.PFA_IMAP_PORT) || 993;
  let last = null;
  for (const host of hosts()) {
    const client = makeClient({ host, port, secure: port === 993, auth: { user, pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000 });
    try {
      await client.connect();
      const path = await sentPath(client);
      const done = [];
      const lock = await client.getMailboxLock(path);
      try {
        for (const copy of copies) {
          let already = [];
          try { already = await client.search({ header: { 'message-id': copy.messageId } }, { uid: true }) || []; } catch (_) { already = []; }
          if (!already.length) {
            await client.append(path, copy.raw, ['\\Seen'], copy.date ? new Date(copy.date) : new Date());
          }
          done.push(copy.id);
        }
      } finally {
        lock.release();
      }
      return done;
    } catch (error) {
      last = error;
      const code = String((error && error.code) || '') + ' ' + String((error && error.message) || '');
      if (!/ECONNECTION|ETIMEDOUT|ESOCKET|ENOTFOUND|EDNS|ECONNREFUSED|ECONNRESET|ETIMEOUT/i.test(code)) break;
    } finally {
      try { await client.logout(); } catch (_) { /* already gone */ }
    }
  }
  const error = new Error(`Sent folder could not be reached: ${(last && last.message) || 'no answer'}`.slice(0, 300));
  error.code = (last && last.code) || 'IMAP_FAILED';
  throw error;
}

/* ---- the record ------------------------------------------------------- */

async function store(db, copy) {
  const ref = db.collection(COLLECTION).doc(copy.id);
  const parts = [];
  for (let i = 0; i < copy.raw.length; i += PART_BYTES) parts.push(copy.raw.subarray(i, i + PART_BYTES));
  try {
    await ref.create({
      messageId: copy.messageId, date: copy.date, size: copy.raw.length, parts: parts.length,
      status: 'pending', attempts: 0, lastError: '', createdAtMs: Date.now()
    });
  } catch (error) {
    if (error && (error.code === 6 || /already exists/i.test(String(error.message)))) return;
    throw error;
  }
  for (let i = 0; i < parts.length; i += 1) {
    await ref.collection('parts').doc(String(i)).set({ n: i, data: Buffer.from(parts[i]) });
  }
}

async function load(doc) {
  const d = doc.data() || {};
  const snap = await doc.ref.collection('parts').get();
  const parts = snap.docs.map((p) => p.data() || {}).sort((a, b) => a.n - b.n);
  if (parts.length !== Number(d.parts)) return null;   // still being written
  return { id: doc.id, messageId: d.messageId, date: d.date, raw: Buffer.concat(parts.map((p) => Buffer.from(p.data))) };
}

/* Once the copy is in Sent, the record stays (nothing is ever deleted
   here; test/admin-master-record.test.js holds every server file to that)
   and is marked saved. Only the bytes held for the journey are cleared: the
   email itself is now in the mailbox, and the submission and its photographs
   are untouched in their own records. */
async function forget(db, id) {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.collection('parts').get();
  for (const p of snap.docs) await p.ref.set({ n: (p.data() || {}).n, data: Buffer.alloc(0), cleared: true });
  await ref.set({ status: 'saved', savedAtMs: Date.now(), lastError: '' }, { merge: true });
}

/* On Vercel a function can be frozen as soon as it answers, which would
   stop the copy half way and leave it for the daily cron. Vercel's runtime
   offers waitUntil for exactly this: the function stays alive until the
   promise settles. It is read from the request context, the same place the
   @vercel/functions package reads it, so no dependency is added. Anywhere
   else (Firebase, tests) there is no such context and nothing changes; the
   ten-minute run picks up whatever did not finish. */
function extendLife(promise) {
  try {
    const holder = globalThis[Symbol.for('@vercel/request-context')];
    const context = holder && typeof holder.get === 'function' ? holder.get() : null;
    if (context && typeof context.waitUntil === 'function') context.waitUntil(promise);
  } catch (_) { /* not on Vercel */ }
}

/* ---- in flight in this process ----------------------------------------- */

const inFlight = new Map();

/* Waits, at most `ms`, for the copies this process is saving right now. For
   the panel's own sends (a test, the copies it sends on a press), so the
   answer can say the copy is in Sent. */
async function settle(ms = 12000) {
  const all = [...inFlight.values()];
  if (!all.length) return { saved: 0, waiting: 0 };
  const results = await withTimeout(Promise.allSettled(all), ms, 'Saving to Sent').catch(() => null);
  if (!results) return { saved: 0, waiting: all.length };
  const saved = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
  return { saved, waiting: all.length - saved };
}

/* Called by the mailer once SMTP has accepted `message` (nodemailer's own
   message object, with messageId and date already set). Never throws, and
   waits only for the database write (at most 4 s), never for the mailbox. */
async function keep(message) {
  if (!enabled()) return { kept: false };
  try {
    const raw = await compose(message);
    const copy = { id: idOf(message.messageId), messageId: String(message.messageId), date: (message.date instanceof Date ? message.date : new Date()).toISOString(), raw };
    let db = null;
    try {
      db = dbOf();
      await withTimeout(store(db, copy), 4000, 'Keeping the copy');
    } catch (error) {
      console.warn('sent copy not kept in the database; trying the mailbox at once', error && error.message);
    }
    const attempt = saveCopies([copy])
      .then(async () => { if (db) await forget(db, copy.id).catch(() => {}); return true; })
      .catch((error) => {
        console.warn('sent copy not saved yet; the next mailbox run saves it', error && error.message);
        if (db) {
          db.collection(COLLECTION).doc(copy.id).set({ lastError: String(error && error.message).slice(0, 300), attempts: 1 }, { merge: true }).catch(() => {});
        }
        return false;
      })
      .finally(() => inFlight.delete(copy.id));
    inFlight.set(copy.id, attempt);
    extendLife(attempt);
    return { kept: true, id: copy.id };
  } catch (error) {
    console.warn('sent copy not made', error && error.message);
    return { kept: false, error: String(error && error.message) };
  }
}

/* Saves everything still waiting (older than the immediate attempt's head
   start, so the two never race). Run by the reading of replies. */
async function flush(db, options) {
  const o = options || {};
  const summary = { saved: 0, waiting: 0, error: '' };
  if (!enabled()) return summary;
  const snap = await db.collection(COLLECTION).where('status', '==', 'pending').limit(o.limit || 25).get();
  const cutoff = Date.now() - (o.settleAfterMs == null ? SETTLE_AFTER_MS : o.settleAfterMs);
  const due = snap.docs.filter((doc) => !inFlight.has(doc.id) && Number((doc.data() || {}).createdAtMs || 0) <= cutoff);
  const copies = [];
  for (const doc of due) {
    const copy = await load(doc);
    if (copy) copies.push(copy);
  }
  if (!copies.length) { summary.waiting = snap.size; return summary; }
  try {
    const done = await saveCopies(copies);
    for (const id of done) await forget(db, id);
    summary.saved = done.length;
  } catch (error) {
    summary.error = String(error && error.message);
    for (const copy of copies) {
      const d = (due.find((x) => x.id === copy.id).data()) || {};
      await db.collection(COLLECTION).doc(copy.id).set({ attempts: (Number(d.attempts) || 0) + 1, lastError: summary.error.slice(0, 300) }, { merge: true });
    }
  }
  const left = await db.collection(COLLECTION).where('status', '==', 'pending').limit(200).get();
  summary.waiting = left.size;
  return summary;
}

/* For the panel: how many copies are still on their way to Sent, and why. */
async function status(db) {
  if (!enabled()) return { on: false, waiting: 0, lastError: '' };
  const snap = await db.collection(COLLECTION).where('status', '==', 'pending').limit(200).get();
  const stuck = snap.docs.map((d) => d.data() || {}).filter((d) => Number(d.attempts) > 0 && d.lastError);
  return { on: true, waiting: snap.size, lastError: stuck.length ? stuck[stuck.length - 1].lastError : '' };
}

module.exports = {
  enabled, keep, flush, settle, status, idOf, saveCopies,
  _setClient: (fn) => { makeClient = fn || ((options) => { const { ImapFlow } = require('imapflow'); return new ImapFlow(options); }); },
  _setDb: (fn) => { dbOf = fn || (() => require('./firebase').getDb()); },
  _inFlight: inFlight
};
