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
   it is public; only the server reads it, with the admin credentials), and
   the Firestore document keeps only what it always kept beside them (label,
   type, size) plus where the file is: { storage: 'gcs', bucket, path }.

   Three rules:
     - Nothing breaks before Storage is switched on. If the bucket is not
       there (or cannot be written just now) the bytes go in Firestore
       exactly as before, and the reader reads either.
     - Records written before this change still read: a document with
       `bytes` is served from those bytes.
     - Nothing is deleted (test/admin-master-record). Where the old code
       dropped a staging copy's bytes, the file is overwritten with nothing,
       the same "kept, emptied" the Firestore field had.

   Which bucket: PFA_STORAGE_BUCKET if set, otherwise the project's default
   (<project>.firebasestorage.app for projects made since late 2024, or
   <project>.appspot.com for older ones), the first one that takes a write.
   It is looked for once per server start, and again every ten minutes while
   there is none, so switching Storage on needs no deploy. */

const firebase = require('./firebase');

const RECHECK_MS = 10 * 60 * 1000;   // a bucket that was missing is looked for again after this

let override = null;   // tests: () => bucket-like
let found = null;      // { bucket, name } once found
let missingUntil = 0;  // not found; do not ask again before this

function projectIdOf(app) {
  const o = (app && app.options) || {};
  return String(o.projectId || (o.credential && o.credential.projectId) || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || '').trim();
}

/* The bucket to use, or null when there is none to write to. */
async function bucket() {
  if (override) return override();
  if (/^(off|firestore)$/i.test(String(process.env.PFA_FILE_STORE || '').trim())) return null;
  if (found) return found;
  if (Date.now() < missingUntil) return null;
  try {
    firebase.getDb();   // makes sure the admin app exists
    const { getApps } = require('firebase-admin/app');
    const app = getApps()[0];
    if (!app) { missingUntil = Date.now() + RECHECK_MS; return null; }
    const { getStorage } = require('firebase-admin/storage');
    const id = projectIdOf(app);
    const names = [String(process.env.PFA_STORAGE_BUCKET || '').trim(), id && `${id}.firebasestorage.app`, id && `${id}.appspot.com`].filter(Boolean);
    /* Usable means writable, so that is what is tried: one tiny object.
       Asking "does it exist" needs a bucket-level permission the site's
       credentials may not hold even when they can store files. */
    for (const name of [...new Set(names)]) {
      const b = getStorage(app).bucket(name);
      try {
        await b.file('.pfa-file-store-probe').save(Buffer.from('ok'), { resumable: false, contentType: 'text/plain' });
        found = { bucket: b, name };
        return found;
      } catch (error) {
        const msg = String(error && error.message);
        if (!/does not exist|not found|404/i.test(msg)) console.warn('file store: bucket not usable', { name, message: msg.slice(0, 160) });
      }
    }
  } catch (error) {
    /* no Firebase configured at all (tests, a local run): Firestore it is */
    if (!/not configured|Missing|FIREBASE_|credential/i.test(String(error && error.message))) {
      console.warn('file store: Storage not reachable', String(error && error.message).slice(0, 160));
    }
  }
  missingUntil = Date.now() + RECHECK_MS;
  return null;
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
      console.warn('file store: write failed, keeping the bytes in Firestore', { path, message: String(error && error.message).slice(0, 160) });
    }
  }
  return { bytes: data };
}

/* The bytes a document points at, wherever they are. null when there are
   none (a dropped staging copy, a missing file). */
async function read(doc) {
  const d = doc || {};
  if (d.storage === 'gcs' && d.path) {
    const where = await bucket();
    if (!where) return null;
    try {
      const target = d.bucket && d.bucket !== where.name && typeof where.bucket.storage === 'object' && where.bucket.storage
        ? where.bucket.storage.bucket(d.bucket) : where.bucket;
      const [buf] = await target.file(d.path).download();
      return buf && buf.length ? buf : null;
    } catch (error) {
      console.warn('file store: read failed', { path: d.path, message: String(error && error.message).slice(0, 160) });
      return null;
    }
  }
  const b = asBuffer(d.bytes);
  return b && b.length ? b : null;
}

/* Empties a file that is no longer needed (a staging copy once used, or one
   never paid for), without deleting anything. Resolves to the fields to
   merge into its Firestore document. */
async function drop(doc, at) {
  const d = doc || {};
  if (d.storage === 'gcs' && d.path) {
    const where = await bucket();
    if (where) {
      try { await where.bucket.file(d.path).save(Buffer.alloc(0), { resumable: false }); } catch (_) { /* best effort */ }
    }
  }
  return { bytes: null, droppedAt: at || new Date().toISOString() };
}

module.exports = {
  put, read, drop, bucket,
  _setBucket: (fn) => { override = fn || null; found = null; missingUntil = 0; },
  _reset: () => { override = null; found = null; missingUntil = 0; }
};
