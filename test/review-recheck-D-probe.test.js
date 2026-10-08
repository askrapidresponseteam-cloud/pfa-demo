'use strict';

/* Verification of review D4, probe half: one refused probe write must not
   make files already in the bucket unreadable, and must not keep new files
   out of the bucket for ten minutes. Stand-in firebase-admin app + storage,
   so this file needs its own module cache. */

const test = require('node:test');
const assert = require('node:assert/strict');

let probeFailures = 0;
const objects = new Map();
const fakeBucket = (name) => ({ name, file: (p) => ({
  async save(b) { if (p.startsWith('.pfa-file-store-probe') && probeFailures > 0) { probeFailures -= 1; throw new Error('429 The object exceeded the rate limit for object mutation operations'); } objects.set(`${name}/${p}`, Buffer.from(b)); },
  async download() { const v = objects.get(`${name}/${p}`); if (!v) throw Object.assign(new Error('No such object'), { code: 404 }); return [v]; } }) });
const appPath = require.resolve('firebase-admin/app');
const stPath = require.resolve('firebase-admin/storage');
const realApp = require(appPath);
require.cache[appPath] = { id: appPath, filename: appPath, loaded: true, exports: Object.assign({}, realApp, { getApps: () => [{ options: { projectId: 'pfa-new-website' } }] }) };
require.cache[stPath] = { id: stPath, filename: stPath, loaded: true, exports: { getStorage: () => ({ bucket: (n) => fakeBucket(n) }) } };

const { memoryFirestore } = require('./_memory-firestore');
const firebase = require('../lib/firebase');
const FILES = require('../lib/file-store');

test('D4 a refused probe: files in the bucket still read, and the bucket is tried again soon', async () => {
  firebase._setDbForTests(memoryFirestore());
  objects.set('pfa-new-website.firebasestorage.app/submissions/PFA-CR-2026-00001/1', Buffer.from('JPEGBYTES'));
  const doc = { storage: 'gcs', bucket: 'pfa-new-website.firebasestorage.app', path: 'submissions/PFA-CR-2026-00001/1' };
  probeFailures = 1;
  assert.equal(await FILES.bucket(), null);
  /* a read never depends on the probe */
  assert.equal(String(await FILES.read(doc)), 'JPEGBYTES');
  assert.equal(String(await FILES.readStrict(doc)), 'JPEGBYTES');
  /* a missing object is an error for the strict reader, null for the forgiving one */
  await assert.rejects(FILES.readStrict(Object.assign({}, doc, { path: 'nope' })), (e) => e.code === 'FILE_MISSING');
  /* retried after 30 s, not 10 minutes */
  const realNow = Date.now;
  Date.now = () => realNow() + 31 * 1000;
  try {
    const where = await FILES.bucket();
    assert.ok(where && where.name === 'pfa-new-website.firebasestorage.app');
  } finally { Date.now = realNow; }
  assert.match(FILES._probeName, /^\.pfa-file-store-probe\/[a-z]+-[0-9a-f]{16}$/);
  firebase._setDbForTests(null);
});
