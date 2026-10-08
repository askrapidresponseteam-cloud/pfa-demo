'use strict';

/* Where the bytes of photographs and documents live.

   Owner, 8 Oct 2026: "hope you have architected so that the storage
   consumption is minimal. maybe blob or something that will cost minimal".

   Until then every photograph (a report's pictures, a caregiver's photo and
   address proof, the pictures attached to a reply, a field note's photos)
   was kept inside Firestore, in the document beside its record. Firestore
   storage is the dear kind: about $0.15 to $0.18 a GB a month past the free
   1 GiB, and each picture had to squeeze under the 1 MiB document limit.
   Cloud Storage, in the same Firebase project, is about $0.02 to $0.03.

   So now the bytes go to the project's Storage bucket, private (nothing in
   it is public; only the server reads it, with the admin credentials, and
   storage.rules refuses every browser), and the Firestore document keeps
   only what it always kept beside them (label, type, size) plus where the
   file is: { storage: 'gcs', bucket, path }.

   Four rules:
     - Nothing breaks before Storage is switched on. If the bucket is not
       there (or cannot be written just now) the bytes go in Firestore
       exactly as before, and the reader reads either.
     - Records written before this change still read: a document with
       `bytes` is served from those bytes.
     - Nothing is deleted (test/admin-master-record). Where the old code
       dropped a staging copy's bytes, the file is overwritten with nothing,
       the same "kept, emptied" the Firestore field had.
     - Reading never depends on writing (8 Oct 2026, review D4). The site
       runs on two servers with their own credentials and settings, and a
       file one of them stored must open on the other. So read, readStrict
       and drop open the bucket the document names, directly. The probe
       below only chooses where NEW files go.

   Which bucket new files go to: PFA_STORAGE_BUCKET if set, otherwise the
   project's default (<project>.firebasestorage.app for projects made since
   late 2024, or <project>.appspot.com for older ones), the first one that
   takes a write. PFA_FILE_STORE=off keeps new files in Firestore; it does
   not stop this server reading files already in a bucket.

   How often it is looked for (8 Oct 2026, review D4: one refused probe
   used to mean ten minutes of no bucket, and no reads either):
     - a bucket that does not exist, or that these credentials may not
       write, is looked for again after ten minutes, so switching Storage
       on needs no deploy;
     - a refusal that is not about the bucket (429, 5xx, a network error)
       is tried again on the first call after 30 seconds, then 60, 120 and
       so on up to ten minutes while it keeps failing;
     - concurrent callers share one probe, and each server instance writes
       its own probe object (.pfa-file-store-probe/<server>-<random>), so
       two instances never contend for one object name (GCS allows about
       one write a second to a name) and an instance only ever overwrites
       its own. One small object per instance start is what is left behind. */

const crypto = require('crypto');
const firebase = require('./firebase');

const RECHECK_MS = 10 * 60 * 1000;   // no bucket (missing, or not ours to write): look again after this
const RETRY_MS = 30 * 1000;          // a probe refused just now: first retry after this, doubling up to RECHECK_MS

/* One name per instance, kept for its life: re-probes overwrite it. */
const PROBE = `.pfa-file-store-probe/${process.env.VERCEL ? 'vercel' : (process.env.K_SERVICE || process.env.FUNCTION_TARGET) ? 'firebase' : 'local'}-${crypto.randomBytes(8).toString('hex')}`;

let override = null;       // tests: () => where-like { bucket, name } or null (this instance's write target)
let storageStub = null;    // tests: (name) => bucket-like (the Storage service, any bucket by name)
let found = null;          // { bucket, name } once found
let notBefore = 0;         // no probe before this time
let refusals = 0;          // probes refused in a row for a reason that is not the bucket's absence
let probing = null;        // the probe in flight, shared by concurrent callers
const opened = new Map();  // bucket name -> handle, for reading what any server wrote

function projectIdOf(app) {
  const o = (app && app.options) || {};
  return String(o.projectId || (o.credential && o.credential.projectId) || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || '').trim();
}

const short = (error) => String((error && error.message) || error || '').slice(0, 160);

/* What a Storage error means for us:
     'missing'   the object or the bucket is not there (definite, a 404)
     'denied'    these credentials may not do this (401/403, not a quota)
     'transient' anything else: 429, 5xx, a timeout, a dropped connection.
   An unknown error counts as transient, because the cost of guessing wrong
   that way is one more try, and the other way is a file reported lost. */
function reasonOf(error) {
  const e = error || {};
  const code = Number(e.code || e.status || (e.response && e.response.status));
  const msg = String(e.message || '');
  const why = Array.isArray(e.errors) ? e.errors.map((x) => x && x.reason).join(' ') : '';
  if (/rate ?limit|quota|too many/i.test(msg + ' ' + why)) return 'transient';
  if (code === 404 || /no such object|does not exist|not ?found/i.test(msg)) return 'missing';
  if (code === 401 || code === 403 || /permission|forbidden|unauthori[sz]ed|access denied/i.test(msg)) return 'denied';
  return 'transient';
}

/* The admin app, or null when this server has no Firebase at all. */
function adminApp() {
  firebase.getDb();   // creates the admin app when the server has credentials; throws naming what is missing
  const { getApps } = require('firebase-admin/app');
  return getApps()[0] || null;
}

/* A handle on a bucket by its name. No request is made here, and no probe
   is needed: the server's admin credentials open any bucket in the project. */
function open(name) {
  if (storageStub) return storageStub(name);
  if (opened.has(name)) return opened.get(name);
  if (override) {
    const w = override();
    if (w && w.name === name) { opened.set(name, w.bucket); return w.bucket; }
  }
  const app = adminApp();
  if (!app) throw Object.assign(new Error('Firebase is not configured on this server, so Storage cannot be opened'), { code: 'NO_STORAGE' });
  const { getStorage } = require('firebase-admin/storage');
  const handle = getStorage(app).bucket(name);
  opened.set(name, handle);
  return handle;
}

function writesOff() {
  return /^(off|firestore)$/i.test(String(process.env.PFA_FILE_STORE || '').trim());
}

/* Looks for the bucket new files should go to. Resolves to it, or null. */
async function probe() {
  let app;
  try {
    app = adminApp();
  } catch (error) {
    /* no Firebase configured at all (tests, a local run): Firestore it is */
    if (!/not configured|Missing|FIREBASE_|credential/i.test(short(error))) console.warn('file store: Storage not reachable', short(error));
    notBefore = Date.now() + RECHECK_MS;
    return null;
  }
  if (!app) { notBefore = Date.now() + RECHECK_MS; return null; }
  const id = projectIdOf(app);
  const names = [String(process.env.PFA_STORAGE_BUCKET || '').trim(), id && `${id}.firebasestorage.app`, id && `${id}.appspot.com`].filter(Boolean);
  /* Usable means writable, so that is what is tried: one tiny object.
     Asking "does it exist" needs a bucket-level permission the site's
     credentials may not hold even when they can store files. */
  for (const name of [...new Set(names)]) {
    try {
      const handle = open(name);
      await handle.file(PROBE).save(Buffer.from('ok'), { resumable: false, contentType: 'text/plain' });
      found = { bucket: handle, name };
      refusals = 0;
      notBefore = 0;
      return found;
    } catch (error) {
      const reason = reasonOf(error);
      if (reason === 'transient') {
        /* The bucket is likely there and said "not now". Stop here rather
           than fall through to a lesser candidate (a named bucket would be
           quietly passed over for the default), and try again soon. */
        refusals += 1;
        const wait = Math.min(RETRY_MS * 2 ** (refusals - 1), RECHECK_MS);
        notBefore = Date.now() + wait;
        console.warn('file store: bucket refused the probe just now, new files go to Firestore until it is tried again', { name, retryInSeconds: Math.round(wait / 1000), message: short(error) });
        return null;
      }
      if (reason === 'denied') console.warn('file store: this server may not write to the bucket', { name, message: short(error) });
      /* missing (or denied): the next candidate */
    }
  }
  refusals = 0;
  notBefore = Date.now() + RECHECK_MS;
  return null;
}

/* The bucket new files go to, or null when there is none to write to. */
async function bucket() {
  if (override) {
    const w = override();
    if (w && w.name) opened.set(w.name, w.bucket);
    return w;
  }
  if (writesOff()) return null;
  if (found) return found;
  if (Date.now() < notBefore) return null;
  if (!probing) probing = probe().finally(() => { probing = null; });
  return probing;
}

function asBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value.toUint8Array === 'function') return Buffer.from(value.toUint8Array());
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'base64');
  return null;
}

/* Keeps one file. `path` is where it goes in the bucket, for example
   "submissions/PFA-C-2026-00042/1". Resolves to the fields to write into the
   Firestore document: { storage, bucket, path } when the bucket took it, or
   { bytes } when it did not (no bucket yet, or a failed write). */
async function put(path, bytes, contentType) {
  const data = asBuffer(bytes) || Buffer.alloc(0);
  const where = await bucket();
  if (where) {
    try {
      await where.bucket.file(path).save(data, {
        resumable: false,
        contentType: contentType || 'application/octet-stream',
        metadata: { cacheControl: 'private, max-age=0' }
      });
      return { storage: 'gcs', bucket: where.name, path };
    } catch (error) {
      console.warn('file store: write failed, keeping the bytes in Firestore', { path, message: short(error) });
    }
  }
  return { bytes: data };
}

/* The bucket a document's file is in. Every document put() writes names
   it; the fallbacks are for a hand-made record that does not. */
function bucketOf(d) {
  return String(d.bucket || process.env.PFA_STORAGE_BUCKET || (found && found.name) || '').trim();
}

function unavailable(reason, d, cause) {
  const error = new Error(reason === 'missing'
    ? `file not found where its record says it is (${d.path || 'no path'})`
    : `file could not be read just now (${d.path || 'no path'}): ${short(cause)}`);
  error.code = reason === 'missing' ? 'FILE_MISSING' : 'FILE_UNAVAILABLE';
  error.reason = reason;
  error.transient = reason === 'transient';
  error.cause = cause;
  return error;
}

/* The bytes a document points at, or null ONLY when the document has none
   on purpose (CONTRACT section 5): a dropped staging copy, an empty file.
   THROWS when the bytes should exist but cannot be had: the bucket refused
   or timed out (error.transient, try again), the object is not where the
   record says (error.code FILE_MISSING), or a record that gives a size has
   neither bytes nor a place in a bucket. Callers that must not lose data
   (moving a caregiver's photo, the panel's view) use this one. */
async function readStrict(doc) {
  const d = doc || {};
  if (d.droppedAt) return null;   // emptied on purpose by drop()
  if (d.storage === 'gcs' && d.path) {
    const name = bucketOf(d);
    if (!name) throw unavailable('missing', d, new Error('the record names no bucket'));
    let buf;
    try {
      [buf] = await open(name).file(d.path).download();
    } catch (error) {
      throw unavailable(reasonOf(error), d, error);
    }
    /* Only drop() writes an empty object, so an empty one was emptied on
       purpose even if the droppedAt beside it was never written. */
    return buf && buf.length ? buf : null;
  }
  const b = asBuffer(d.bytes);
  if (b && b.length) return b;
  if (Number(d.size) > 0) throw unavailable('missing', d, new Error('the record gives a size but holds no bytes'));
  return null;
}

/* The forgiving reader: the bytes, or null when there are none or they
   could not be read (logged). For callers where a missing picture is a
   picture left out, not a loss. */
async function read(doc) {
  try {
    return await readStrict(doc);
  } catch (error) {
    console.warn('file store: read failed', { path: doc && doc.path, bucket: doc && doc.bucket, reason: error.reason, message: short(error) });
    return null;
  }
}

/* Empties a file that is no longer needed (a staging copy once used, or one
   never paid for), without deleting anything. Resolves to the fields to
   merge into its Firestore document. The file is emptied in the bucket the
   document names (8 Oct 2026, review D9: it used to be this server's own,
   which left an ID photo whole when the other server had stored it). */
async function drop(doc, at) {
  const d = doc || {};
  if (d.storage === 'gcs' && d.path) {
    const name = bucketOf(d);
    try {
      if (!name) throw new Error('the record names no bucket');
      await open(name).file(d.path).save(Buffer.alloc(0), { resumable: false });
    } catch (error) {
      /* best effort, as before, but no longer silent */
      console.warn('file store: could not empty a file', { path: d.path, bucket: name, message: short(error) });
    }
  }
  return { bytes: null, droppedAt: at || new Date().toISOString() };
}

function reset() {
  override = null; storageStub = null; found = null; notBefore = 0; refusals = 0; probing = null;
  opened.clear();
}

module.exports = {
  put, read, readStrict, drop, bucket,
  _probeName: PROBE,
  /* Tests. _setBucket stands in for this instance's write target (the
     probe's answer); a bucket it hands out stays openable by name, as a real
     bucket does after this instance's probe fails. _setStorage stands in for
     the Storage service itself: (name) => bucket-like. */
  _setBucket: (fn) => { override = fn || null; found = null; notBefore = 0; refusals = 0; probing = null; },
  _setStorage: (fn) => { storageStub = fn || null; opened.clear(); },
  _reset: reset
};
