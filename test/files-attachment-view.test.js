'use strict';

/* The panel's view of a photograph or document (GET /api/admin/attachment)
   tells a file it cannot open just now from a file that is not there, and
   from a file that is empty on purpose. Review D4, 8 Oct 2026.

   Before, any failure to read the bucket came back as a 200 with no bytes,
   which the panel showed as "no photo": a caregiver's ID photo or a report's
   evidence looked lost when Storage had only said "not now". Driven through
   the real route with the real lib/firebase.js on the in-memory Firestore;
   the bucket is a stand-in that can be told to refuse. */

const test = require('node:test');
const assert = require('node:assert/strict');

const authPath = require.resolve('firebase-admin/auth');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: {
    getAuth: () => ({
      async verifyIdToken(token) { if (token !== 'test-admin') throw new Error('bad token'); return { uid: 'u1', email: 'admin@pfa.test' }; },
      async getUser() { return { uid: 'u1', email: 'admin@pfa.test', customClaims: { admin: true, role: 'super' } }; }
    })
  }
};

const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const FILES = require('../lib/file-store');
const attachment = require('../lib/routes/admin/attachment');

const BUCKET = 'pfa-new-website.firebasestorage.app';
const REF = 'PFA-CG-2026-00001';
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb', 'hex');

let db;
let files;
let refusal;   // the error the next download throws, once
const realError = console.error;
const realWarn = console.warn;

function stubBucket() {
  files = new Map();
  refusal = null;
  const bucket = {
    file: (p) => ({
      async save(b) { files.set(p, Buffer.from(b)); },
      async download() {
        if (refusal) { const e = refusal; refusal = null; throw e; }
        if (!files.has(p)) throw Object.assign(new Error(`No such object: ${BUCKET}/${p}`), { code: 404 });
        return [files.get(p)];
      }
    })
  };
  FILES._setBucket(() => ({ bucket, name: BUCKET }));
}

test.beforeEach(async () => {
  db = memoryFirestore();
  firebase._setDbForTests(db);
  stubBucket();
  console.error = () => {}; console.warn = () => {};
  await db.collection('submissions').doc(REF).set({ kind: 'PFA-CG', attachments: 1 });
});

test.afterEach(() => {
  console.error = realError; console.warn = realWarn;
  FILES._reset();
  firebase._setDbForTests(null);
});

function view(n = '1') {
  return new Promise((resolve, reject) => {
    const out = { statusCode: 200, headers: {} };
    const response = {
      get statusCode() { return out.statusCode; }, set statusCode(v) { out.statusCode = v; },
      setHeader(k, v) { out.headers[String(k).toLowerCase()] = v; },
      getHeader(k) { return out.headers[String(k).toLowerCase()]; },
      end(raw) { out.json = JSON.parse(String(raw || '{}')); resolve(out); }
    };
    Promise.resolve(attachment({ method: 'GET', url: '/api/admin/attachment', query: { reference: REF, n }, headers: { authorization: 'Bearer test-admin', host: 'pfa.test' } }, response)).catch(reject);
  });
}

async function photoInBucket() {
  files.set(`submissions/${REF}/1`, JPEG);
  await db.collection('submissions').doc(REF).collection('attachments').doc('1')
    .set({ storage: 'gcs', bucket: BUCKET, path: `submissions/${REF}/1`, contentType: 'image/jpeg', size: JPEG.length, label: 'Photograph' });
}

test('a photo the bucket will not give just now is a 503 "try again", not an empty photo', async () => {
  await photoInBucket();
  refusal = Object.assign(new Error('Backend Error'), { code: 503 });
  const res = await view();
  assert.equal(res.statusCode, 503, `answered ${res.statusCode} ${JSON.stringify(res.json).slice(0, 120)}`);
  assert.equal(res.json.code, 'FILE_UNAVAILABLE');
  assert.match(res.json.message, /could not be opened just now/i);
  assert.match(res.json.message, /try again/i);
  assert.equal(res.headers['retry-after'], '30');
  assert.equal(res.json.data, undefined, 'no bytes pretending to be the photo');

  const again = await view();
  assert.equal(again.statusCode, 200, 'a minute later it opens');
  assert.ok(Buffer.from(again.json.data, 'base64').equals(JPEG));
});

test('a timeout or dropped connection is the same "try again"', async () => {
  await photoInBucket();
  refusal = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  assert.equal((await view()).statusCode, 503);
});

test('a record whose file is not in the bucket says so, and does not say "try again"', async () => {
  await db.collection('submissions').doc(REF).collection('attachments').doc('1')
    .set({ storage: 'gcs', bucket: BUCKET, path: `submissions/${REF}/1`, contentType: 'image/jpeg', size: 900 });
  const res = await view();
  assert.equal(res.statusCode, 404);
  assert.equal(res.json.code, 'FILE_MISSING');
  assert.doesNotMatch(res.json.message, /try again/i);
});

test('a healthy photo in the bucket, and an older one kept in Firestore, both open', async () => {
  await photoInBucket();
  const res = await view();
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.contentType, 'image/jpeg');
  assert.ok(Buffer.from(res.json.data, 'base64').equals(JPEG));

  await db.collection('submissions').doc(REF).collection('attachments').doc('2').set({ bytes: JPEG, contentType: 'image/jpeg', size: JPEG.length });
  const old = await view('2');
  assert.equal(old.statusCode, 200);
  assert.ok(Buffer.from(old.json.data, 'base64').equals(JPEG));
});

test('a staging copy emptied on purpose is an empty 200, as before', async () => {
  await db.collection('submissions').doc(REF).collection('attachments').doc('1')
    .set({ storage: 'gcs', bucket: BUCKET, path: `submissions/${REF}/1`, contentType: 'image/jpeg', size: 900, bytes: null, droppedAt: '2026-10-08T00:00:00Z' });
  const res = await view();
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.size, 0);
});
