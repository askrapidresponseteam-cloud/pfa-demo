'use strict';

/* Where new files go: the probe that picks this server's Storage bucket
   (lib/file-store.js). Review D4, 8 Oct 2026.

   Driven through the real code path: firebase-admin's app and storage
   modules are stood in for (an app for project pfa-new-website, and a
   Storage service whose buckets keep objects in memory and can be told to
   refuse), so getStorage().bucket(name) is what file-store actually calls.
   The clock is stood in for too, so "ten minutes later" takes no time.

   What these pin:
     - one refused probe (a 429, a 5xx) is tried again after 30 seconds, not
       ten minutes, and refusals in a row back off up to ten minutes;
     - a bucket that does not exist is looked for again after ten minutes;
     - a refusal of the bucket PFA_STORAGE_BUCKET names does not quietly send
       files to a different bucket;
     - each instance writes its own probe object, under one prefix, and only
       ever overwrites that one;
     - callers that arrive together share one probe. */

const test = require('node:test');
const assert = require('node:assert/strict');

/* ---- stand-ins for firebase-admin/app and firebase-admin/storage -------- */
const saves = [];                 // every save: `${bucket}/${path}`
const objects = new Map();        // `${bucket}/${path}` -> Buffer
const refuse = new Map();         // bucket name -> () => Error | null (consulted on each save)
const existing = new Set(['pfa-new-website.firebasestorage.app', 'pfa-new-website.appspot.com', 'pfa-named-bucket']);

function storageError(code, message) { return Object.assign(new Error(message), { code }); }
function fakeBucket(name) {
  return {
    name,
    file: (p) => ({
      async save(bytes) {
        saves.push(`${name}/${p}`);
        if (!existing.has(name)) throw storageError(404, 'The specified bucket does not exist.');
        const why = refuse.has(name) ? refuse.get(name)() : null;
        if (why) throw why;
        objects.set(`${name}/${p}`, Buffer.from(bytes));
      },
      async download() {
        if (!objects.has(`${name}/${p}`)) throw storageError(404, `No such object: ${name}/${p}`);
        return [objects.get(`${name}/${p}`)];
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

/* ---- a clock the tests move ---------------------------------------------- */
const realNow = Date.now;
let clock = 0;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

const realWarn = console.warn;

test.beforeEach(() => {
  firebase._setDbForTests(memoryFirestore());
  FILES._reset();
  saves.length = 0; objects.clear(); refuse.clear();
  delete process.env.PFA_STORAGE_BUCKET; delete process.env.PFA_FILE_STORE;
  clock = 1_800_000_000_000;
  Date.now = () => clock;
  console.warn = () => {};
});

test.afterEach(() => {
  Date.now = realNow;
  console.warn = realWarn;
  FILES._reset();
  firebase._setDbForTests(null);
  delete process.env.PFA_STORAGE_BUCKET;
});

const once = (error) => { let left = 1; return () => (left-- > 0 ? error : null); };

test('one refused probe write is tried again after 30 seconds, not ten minutes', async () => {
  refuse.set('pfa-new-website.firebasestorage.app', once(storageError(429, 'The object exceeded the rate limit for object mutation operations')));
  assert.equal(await FILES.bucket(), null, 'refused: new files go to Firestore for now');
  const tried = saves.length;

  clock += 10 * SECOND;
  assert.equal(await FILES.bucket(), null, 'not hammered: no new probe inside the first 30 seconds');
  assert.equal(saves.length, tried, 'no probe was written during the back-off');

  clock += 21 * SECOND;
  const where = await FILES.bucket();
  assert.ok(where, '31 seconds on, with Storage healthy again, the bucket is found');
  assert.equal(where.name, 'pfa-new-website.firebasestorage.app');

  const put = await FILES.put('submissions/PFA-CR-2026-00002/1', Buffer.from('JPEGBYTES'), 'image/jpeg');
  assert.equal(put.storage, 'gcs', 'and new files go to the bucket again');
});

test('refusals in a row back off, doubling, to at most ten minutes; a success resets it', async () => {
  refuse.set('pfa-new-website.firebasestorage.app', () => storageError(503, 'Service Unavailable'));
  assert.equal(await FILES.bucket(), null);
  const waits = [];
  for (let i = 0; i < 7; i += 1) {
    const n = saves.length;
    let waited = 0;
    while (saves.length === n && waited <= 11 * MINUTE) {
      clock += SECOND; waited += SECOND;
      assert.equal(await FILES.bucket(), null);
    }
    assert.equal(saves.length, n + 1, 'one probe per attempt, on the preferred bucket only');
    waits.push(waited / SECOND);
  }
  assert.deepEqual(waits, [30, 60, 120, 240, 480, 600, 600], 'seconds from each refusal to the next probe');

  refuse.clear();
  clock += 11 * MINUTE;
  assert.ok(await FILES.bucket(), 'healthy again: found');
});

test('a bucket that does not exist is looked for again after ten minutes, not before', async () => {
  existing.delete('pfa-new-website.firebasestorage.app');
  existing.delete('pfa-new-website.appspot.com');
  try {
    assert.equal(await FILES.bucket(), null);
    const tried = saves.length;
    assert.equal(tried, 2, 'both default names were tried');
    clock += 9 * MINUTE;
    assert.equal(await FILES.bucket(), null);
    assert.equal(saves.length, tried, 'Storage that is not switched on is not asked again every call');
    existing.add('pfa-new-website.firebasestorage.app');   // switched on in the console
    clock += 1 * MINUTE + SECOND;
    const where = await FILES.bucket();
    assert.ok(where && where.name === 'pfa-new-website.firebasestorage.app', 'found without a deploy');
  } finally {
    existing.add('pfa-new-website.firebasestorage.app');
    existing.add('pfa-new-website.appspot.com');
  }
});

test('a passing refusal of the named bucket does not send files to another bucket', async () => {
  process.env.PFA_STORAGE_BUCKET = 'pfa-named-bucket';
  refuse.set('pfa-named-bucket', once(storageError(503, 'backend error')));
  assert.equal(await FILES.bucket(), null);
  assert.deepEqual(saves.map((s) => s.split('/')[0]), ['pfa-named-bucket'], 'the default buckets were not probed in its place');
  clock += 31 * SECOND;
  assert.equal((await FILES.bucket()).name, 'pfa-named-bucket');
});

test('each instance probes its own object under one prefix, and re-probes overwrite it', async () => {
  refuse.set('pfa-new-website.firebasestorage.app', once(storageError(429, 'rate limit')));
  await FILES.bucket();
  clock += 31 * SECOND;
  await FILES.bucket();
  const mine = saves.map((s) => s.slice('pfa-new-website.firebasestorage.app/'.length));
  assert.equal(mine.length, 2);
  assert.match(mine[0], /^\.pfa-file-store-probe\/[a-z]+-[0-9a-f]{16}$/, 'one prefix, one object per instance');
  assert.equal(mine[1], mine[0], 'the second probe overwrote the first, it did not add another object');

  /* a second instance (another cold start, or the other server) */
  const modPath = require.resolve('../lib/file-store');
  const kept = require.cache[modPath];
  delete require.cache[modPath];
  try {
    const other = require('../lib/file-store');
    await other.bucket();
    const theirs = saves[saves.length - 1].slice('pfa-new-website.firebasestorage.app/'.length);
    assert.match(theirs, /^\.pfa-file-store-probe\//);
    assert.notEqual(theirs, mine[0], 'two instances never write the same probe object');
  } finally {
    require.cache[modPath] = kept;
  }
});

test('callers that arrive together share one probe', async () => {
  const all = await Promise.all([1, 2, 3, 4, 5].map(() => FILES.bucket()));
  assert.ok(all.every((w) => w && w.name === 'pfa-new-website.firebasestorage.app'));
  assert.equal(saves.length, 1, 'five concurrent callers, one probe write (GCS allows about one write a second to a name)');
});
