'use strict';

/* Shared harness for the independent verification of the 47 review defects
   (review-recheck-*.test.js). Real routes, the strict in-memory Firestore with
   latency (so concurrent requests overlap and transactions conflict), sign-in
   and SMTP stubbed. Not a test file itself. */

const path = require('node:path');

const USERS = {
  'tok-a': { uid: 'ua', email: 'a@pfa.test', claims: { admin: true, role: 'super' } },
  'tok-b': { uid: 'ub', email: 'b@pfa.test', claims: { admin: true, role: 'super' } },
  'tok-desk': { uid: 'ud', email: 'desk@pfa.test', claims: { admin: true, role: 'staff', modules: ['overview', 'submissions', 'verify'] } },
  'test-admin': { uid: 'u1', email: 'admin@pfa.test', claims: { admin: true, role: 'super' } }
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

const INBOX = 'gandhim@exmpls.sansad.in';
const SITE_MAILBOX = 'info@peopleforanimalsindia.org';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENV = ['PFA_SMTP_USER', 'PFA_SMTP_PASS', 'PFA_SMTP_HOST', 'PFA_MAIL_API_KEY', 'PUBLIC_SITE_URL', 'CRON_SECRET', 'PFA_SUBMISSIONS_INBOX',
  'PFA_ADMIN_TOKEN', 'PFA_IMAP_USER', 'PFA_IMAP_PASS', 'PFA_CAPTURE_REPLIES', 'PFA_AUTH_PEPPER', 'VERCEL', 'K_SERVICE', 'FUNCTION_TARGET',
  'CCAVENUE_MERCHANT_ID', 'CCAVENUE_ACCESS_CODE', 'CCAVENUE_WORKING_KEY', 'CCAVENUE_MODE', 'PFA_FILE_STORE', 'PFA_STORAGE_BUCKET'];

/* Fresh world per test: returns { db, smtp } and installs them. */
function fresh(options) {
  const o = options || {};
  const saved = {};
  for (const k of ENV) saved[k] = process.env[k];
  Object.assign(process.env, { PFA_SMTP_USER: SITE_MAILBOX, PFA_SMTP_PASS: 'x', PUBLIC_SITE_URL: 'https://pfa.test', CRON_SECRET: 'cron-secret' });
  for (const k of ['PFA_SUBMISSIONS_INBOX', 'PFA_MAIL_API_KEY', 'PFA_SMTP_HOST', 'PFA_ADMIN_TOKEN', 'PFA_AUTH_PEPPER', 'VERCEL', 'K_SERVICE', 'FUNCTION_TARGET']) delete process.env[k];
  const db = memoryFirestore({ latency: o.latency === undefined ? 3 : o.latency });
  firebase._setDbForTests(db);
  const smtp = { sent: [], hold: null, fail: null, calls: 0 };
  mailer._setSmtpTransport(() => ({
    async sendMail(m) {
      smtp.calls += 1;
      if (smtp.hold) await smtp.hold(m);
      if (smtp.fail) { const e = typeof smtp.fail === 'function' ? smtp.fail(m) : smtp.fail; if (e) throw e; }
      smtp.sent.push(m);
      return { messageId: m.messageId };
    },
    close() {}
  }));
  global.fetch = async () => { throw new Error('no network in tests'); };
  try { require('../lib/submissions').resetForTests(); } catch (_) { /* older shape */ }
  const restore = () => {
    mailer._setSmtpTransport(null);
    firebase._setDbForTests(null);
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  };
  return { db, smtp, restore };
}

function call(handler, { method = 'POST', body, query = {}, token = 'tok-a', headers = {}, url = '/api' }) {
  return new Promise((resolve, reject) => {
    const out = { statusCode: 200, raw: '', headers: {} };
    const response = {
      get statusCode() { return out.statusCode; }, set statusCode(v) { out.statusCode = v; },
      setHeader(n, v) { out.headers[String(n).toLowerCase()] = v; }, getHeader(n) { return out.headers[String(n).toLowerCase()]; },
      writeHead(c) { out.statusCode = c; },
      end(raw) { out.raw = String(raw || ''); try { out.json = JSON.parse(out.raw); } catch (_) { out.json = null; } resolve(out); }
    };
    const h = Object.assign({ host: 'pfa.test', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, token ? { authorization: 'Bearer ' + token } : {}, headers);
    const request = { method, url, query, body, headers: h };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

async function seed(db, reference, extra) {
  const createdAt = '2026-10-08T05:00:00.000Z';
  const doc = Object.assign({
    reference, kind: reference.split('-').slice(0, 2).join('-'), status: 'new', createdAt, receivedAtMs: Date.parse(createdAt),
    fields: { name: 'Asha Rao', email: 'asha@example.com', question: 'Injured kite on my roof' },
    history: [{ status: 'new', at: createdAt }], threadId: 'abcdefabcdef', threadSubject: `${reference}: Help desk query`
  }, extra || {});
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  await db.collection('submissions').doc(reference).set(doc);
  return doc;
}

const rec = async (db, ref) => (await db.collection('submissions').doc(ref).get()).data();
const msgs = (db, ref) => Object.entries(db.dump()).filter(([k]) => k.startsWith(`submissions/${ref}/messages/`)).map(([, v]) => v);
const records = (db, prefix) => Object.keys(db.dump()).filter((k) => new RegExp(`^submissions/${prefix || 'PFA'}[^/]*$`).test(k));

/* A small valid JPEG-shaped buffer (the media folder is not in this copy). */
function jpeg(size) {
  return Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(Math.max(16, (size || 2000) - 4), 7)]);
}

/* An in-memory bucket for lib/file-store.js. */
function memoryBucket(name, opts) {
  const files = new Map();
  const o = opts || {};
  const bucket = {
    file: (p) => ({
      async save(b) { if (o.failSave && o.failSave(p)) throw Object.assign(new Error('503 Service Unavailable'), { code: 503 }); files.set(p, Buffer.from(b)); },
      async download() { if (o.failRead && o.failRead(p)) throw Object.assign(new Error('503 backend error'), { code: 503 }); if (!files.has(p)) throw Object.assign(new Error('No such object'), { code: 404 }); return [files.get(p)]; }
    })
  };
  return { files, where: { name, bucket } };
}

module.exports = { USERS, INBOX, SITE_MAILBOX, sleep, fresh, call, seed, rec, msgs, records, jpeg, memoryBucket, memoryFirestore, firebase, mailer, root: path.join(__dirname, '..') };
