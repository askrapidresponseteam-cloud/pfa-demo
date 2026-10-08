'use strict';

/* Reading and emptying a file open the bucket its record names, directly,
   whatever this server's own probe found (lib/file-store.js; CONTRACT
   section 5; review D4 and D9, 8 Oct 2026).

   The site runs on two servers, Vercel and Firebase, with their own
   credentials and settings and one Firestore. A photograph either of them
   stored must open on the other, even when the other's probe was refused a
   moment ago or it has PFA_FILE_STORE=off. And the strict reader must tell
   "there are no bytes, on purpose" from "the bytes are there but could not
   be had just now", because a caller that cannot tell them apart unlinks a
   caregiver's ID photo for good (review D4).

   firebase-admin's app and storage modules are stood in for, so the code
   path is the real one: getStorage().bucket(name).file(path).download(). */

const test = require('node:test');
const assert = require('node:assert/strict');

const objects = new Map();          // `${bucket}/${path}` -> Buffer
const failNext = new Map();         // `${bucket}/${path}` -> Error, thrown by the next download or save
const downloads = [];
let probeRefused = 0;               // how many probe writes to refuse

function storageError(code, message) { return Object.assign(new Error(message), { code }); }
function fakeBucket(name) {
  return {
    name,
    file: (p) => ({
      async save(bytes) {
        const key = `${name}/${p}`;
        if (p.startsWith('.pfa-file-store-probe') && probeRefused > 0) { probeRefused -= 1; throw storageError(429, 'The object exceeded the rate limit for object mutation operations'); }
        if (failNext.has(key)) { const e = failNext.get(key); failNext.delete(key); throw e; }
        objects.set(key, Buffer.from(bytes));
      },
      async download() {
        const key = `${name}/${p}`;
        downloads.push(key);
        if (failNext.has(key)) { const e = failNext.get(key); failNext.delete(key); throw e; }
        if (!objects.has(key)) throw storageError(404, `No such object: ${key}`);
        return [objects.get(key)];
      }
    })
  };
}
const appPath = require.resolve('firebase-admin/app');
const storagePath = require.resolve('firebase-admin/storage');
require.cache[appPath] = { id: appPath, filename: appPath, loaded: true, exports: Object.assign({}, require(appPath), { getApps: () => [{ options: { projectId: 'pfa-new-website' } }] }) };
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: { getStorage: () => ({ bucket: (n) => fakeBucket(n) }) } };

const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const FILES = require('../lib/file-store');

const MAIN = 'pfa-new-website.firebasestorage.app';
const OLD = 'pfa-new-website.appspot.com';
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb', 'hex');
const inBucket = (bucket, path) => ({ storage: 'gcs', bucket, path, contentType: 'image/jpeg', size: JPEG.length, label: 'Photograph' });

const realWarn = console.warn;
let warned;

test.beforeEach(() => {
  firebase._setDbForTests(memoryFirestore());
  FILES._reset();
  objects.clear(); failNext.clear(); downloads.length = 0; probeRefused = 0;
  delete process.env.PFA_STORAGE_BUCKET; delete process.env.PFA_FILE_STORE;
  warned = [];
  console.warn = (...a) => { warned.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
});

test.afterEach(() => {
  console.warn = realWarn;
  FILES._reset();
  firebase._setDbForTests(null);
  delete process.env.PFA_STORAGE_BUCKET; delete process.env.PFA_FILE_STORE;
});

test('a photo in the bucket reads on an instance whose probe was just refused', async () => {
  objects.set(`${MAIN}/submissions/PFA-CR-2026-00001/1`, JPEG);   // stored by the other server
  probeRefused = 2;
  assert.equal(await FILES.bucket(), null, 'this instance has no bucket to write to just now');
  const doc = inBucket(MAIN, 'submissions/PFA-CR-2026-00001/1');
  const bytes = await FILES.read(doc);
  assert.ok(bytes && bytes.equals(JPEG), 'read() opens the bucket the record names; it does not need the probe');
  assert.ok((await FILES.readStrict(doc)).equals(JPEG), 'and so does readStrict()');
});

test('a photo in the bucket reads on a server with PFA_FILE_STORE=off', async () => {
  objects.set(`${MAIN}/caregiver-staging/tok/1`, JPEG);
  process.env.PFA_FILE_STORE = 'off';
  assert.equal(await FILES.bucket(), null, 'off: new files stay in Firestore');
  const bytes = await FILES.read(inBucket(MAIN, 'caregiver-staging/tok/1'));
  assert.ok(bytes && bytes.equals(JPEG), 'but files the other server put in the bucket still read');
});

test('a photo in a different bucket from this server\'s own reads from its own bucket', async () => {
  objects.set(`${OLD}/submissions/PFA-CR-2026-00003/1`, JPEG);
  assert.equal((await FILES.bucket()).name, MAIN);
  assert.ok((await FILES.readStrict(inBucket(OLD, 'submissions/PFA-CR-2026-00003/1'))).equals(JPEG));
  assert.deepEqual(downloads, [`${OLD}/submissions/PFA-CR-2026-00003/1`]);
});

test('a file read through the test seam stays readable after the probe answer changes', async () => {
  /* the shape other suites use: _setBucket stands in for the probe's answer */
  const files = new Map();
  const where = { name: MAIN, bucket: { file: (p) => ({ async save(b) { files.set(p, Buffer.from(b)); }, async download() { if (!files.has(p)) throw storageError(404, 'No such object'); return [files.get(p)]; } }) } };
  FILES._setBucket(() => where);
  const stored = await FILES.put('caregiver-staging/abc/1', JPEG, 'image/jpeg');
  assert.equal(stored.storage, 'gcs');
  FILES._setBucket(() => null);   // the payment callback lands on an instance whose probe failed
  assert.ok((await FILES.read(Object.assign({ size: JPEG.length }, stored))).equals(JPEG));
});

test('readStrict throws on a passing failure; read() logs it and answers null', async () => {
  const doc = inBucket(MAIN, 'submissions/PFA-CR-2026-00004/1');
  objects.set(`${MAIN}/${doc.path}`, JPEG);
  failNext.set(`${MAIN}/${doc.path}`, storageError(503, 'Backend Error'));
  await assert.rejects(FILES.readStrict(doc), (e) => e.transient === true && e.code === 'FILE_UNAVAILABLE' && e.reason === 'transient');
  failNext.set(`${MAIN}/${doc.path}`, storageError('ECONNRESET', 'socket hang up'));
  await assert.rejects(FILES.readStrict(doc), (e) => e.transient === true);
  failNext.set(`${MAIN}/${doc.path}`, storageError(429, 'rate limit exceeded'));
  assert.equal(await FILES.read(doc), null, 'the forgiving reader keeps its old answer');
  assert.ok(warned.some((w) => /read failed/.test(w) && w.includes(doc.path)), 'and says so in the log');
  assert.ok((await FILES.readStrict(doc)).equals(JPEG), 'the file was never lost');
});

test('readStrict throws when the record says the file is in the bucket and it is not', async () => {
  const doc = inBucket(MAIN, 'submissions/PFA-CR-2026-00005/1');
  await assert.rejects(FILES.readStrict(doc), (e) => e.code === 'FILE_MISSING' && e.transient === false);
  assert.equal(await FILES.read(doc), null);
});

test('readStrict answers null only for a file with no bytes on purpose', async () => {
  /* dropped: no download at all, wherever it was */
  assert.equal(await FILES.readStrict(Object.assign(inBucket(MAIN, 'caregiver-staging/t/1'), { bytes: null, droppedAt: '2026-10-08T00:00:00Z' })), null);
  assert.equal(await FILES.readStrict({ bytes: null, droppedAt: 'x', size: 900 }), null);
  assert.deepEqual(downloads, []);
  /* emptied in the bucket by drop() even if droppedAt never reached the record */
  objects.set(`${MAIN}/caregiver-staging/t/2`, Buffer.alloc(0));
  assert.equal(await FILES.readStrict(inBucket(MAIN, 'caregiver-staging/t/2')), null);
  /* an empty record */
  assert.equal(await FILES.readStrict({}), null);
  assert.equal(await FILES.readStrict(null), null);
  /* older records with their bytes in the document still read */
  assert.ok((await FILES.readStrict({ bytes: JPEG })).equals(JPEG));
  assert.ok((await FILES.readStrict({ bytes: JPEG.toString('base64') })).equals(JPEG));
  /* a record that gives a size but holds nothing: the bytes were lost, not dropped */
  await assert.rejects(FILES.readStrict({ bytes: null, size: 57744, contentType: 'image/jpeg' }), (e) => e.code === 'FILE_MISSING');
});

test('drop() empties the file in the bucket the record names, not this server\'s own', async () => {
  objects.set(`${OLD}/caregiver-staging/t/1`, JPEG);   // stored by the server that resolved the older bucket
  process.env.PFA_STORAGE_BUCKET = MAIN;               // this server writes to the newer one
  assert.equal((await FILES.bucket()).name, MAIN);
  const out = await FILES.drop(inBucket(OLD, 'caregiver-staging/t/1'), '2026-10-08T10:00:00Z');
  assert.deepEqual(out, { bytes: null, droppedAt: '2026-10-08T10:00:00Z' });
  assert.equal(objects.get(`${OLD}/caregiver-staging/t/1`).length, 0, 'the ID photo is emptied where it is');
  assert.equal(objects.has(`${MAIN}/caregiver-staging/t/1`), false, 'and no empty object is made in the other bucket');
});

test('drop() empties a file even on a server that writes nothing to Storage', async () => {
  objects.set(`${MAIN}/caregiver-staging/t/1`, JPEG);
  process.env.PFA_FILE_STORE = 'off';
  await FILES.drop(inBucket(MAIN, 'caregiver-staging/t/1'), 'now');
  assert.equal(objects.get(`${MAIN}/caregiver-staging/t/1`).length, 0);
});

test('a drop() the bucket refuses is logged, and the record is still marked dropped', async () => {
  objects.set(`${MAIN}/caregiver-staging/t/1`, JPEG);
  failNext.set(`${MAIN}/caregiver-staging/t/1`, storageError(503, 'Backend Error'));
  const out = await FILES.drop(inBucket(MAIN, 'caregiver-staging/t/1'), 'now');
  assert.equal(out.droppedAt, 'now');
  assert.ok(warned.some((w) => /could not empty/.test(w)), 'not silent');
});
