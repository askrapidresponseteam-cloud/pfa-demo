/* Every administrative action, in one append-only place.

   Individual routes already recorded some of this: a status change writes
   `handledBy`, a case keeps its conversation, a store change keeps who moved
   it. What there was no way to answer was the question an auditor actually
   asks - "show me everything this person did last Tuesday" - because the
   trail was scattered across the record each action happened to touch, and
   actions that touch nothing (a failed attempt, a bulk email) left no trace
   at all.

   The rules this file keeps:

   - Append only. Entries are written with create(), never set() or update(),
     so an entry cannot be quietly rewritten and a colliding id fails loudly
     rather than overwriting. Nothing in this file deletes.
   - The actor comes from the verified token, never from the request body.
     A caller cannot say who they are.
   - No secrets and no report contents. `detail` is a short summary the office
     can read, not a copy of what was sent - the record itself already holds
     that, and duplicating a complainant's message into a second collection is
     how a leak gets twice as bad.
   - Writing an entry must never break the action it describes. A failed audit
     write is logged to the function's console and swallowed; refusing to
     assign a case because the log was briefly unreachable would be a worse
     outcome than a gap in the log.

   Reading is super-admin only, through /api/admin/records?type=audit. */

'use strict';

const COLLECTION = 'adminAudit';
const MAX_DETAIL = 300;

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max || 120);
}

function callerIp(request) {
  const headers = (request && request.headers) || {};
  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  return clean(forwarded || (request && request.socket && request.socket.remoteAddress) || '', 45);
}

/* A time-ordered id, so the log reads newest-first on the document name and
   needs no composite index. The suffix separates two actions in the same
   millisecond rather than letting one overwrite the other. */
function entryId(atMs) {
  const stamp = String(atMs).padStart(15, '0');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}`;
}

/* who      the descriptor requireAdmin returned - the verified identity
   module   which permission the action fell under
   action   a short verb: 'reply', 'status', 'access-given', 'store-state'
   subject  what it was done to: a reference, a card number, an email
   detail   a one-line summary for a human reading the log
   outcome  'done' or 'refused' */
function describe(who, { module, action, subject, detail, outcome }, request, atMs) {
  return {
    at: new Date(atMs).toISOString(),
    atMs,
    actor: {
      uid: clean((who && who.uid) || '', 128),
      email: clean((who && who.email) || '', 254),
      name: clean((who && who.name) || '', 120),
      role: clean((who && who.role) || '', 20)
    },
    module: clean(module, 40),
    action: clean(action, 40),
    subject: clean(subject, 120),
    detail: clean(detail, MAX_DETAIL),
    outcome: outcome === 'refused' ? 'refused' : 'done',
    ip: callerIp(request)
  };
}

/* Fire and forget by design: the caller does not await a log line. */
function record(who, event, request, deps) {
  const getDb = (deps && deps.getDb) || require('./firebase').getDb;
  const atMs = (deps && deps.now && deps.now()) || Date.now();
  const entry = describe(who, event || {}, request, atMs);
  let writing;
  try {
    writing = getDb().collection(COLLECTION).doc(entryId(atMs)).create(entry);
  } catch (error) {
    console.warn('admin audit not written', { action: entry.action, message: error && error.message });
    return Promise.resolve(entry);
  }
  return Promise.resolve(writing)
    .catch((error) => {
      console.warn('admin audit not written', { action: entry.action, message: error && error.message });
    })
    .then(() => entry);
}

/* Newest first, by document name, which is the timestamp. */
async function read(db, { limit, cursor, actor, action }) {
  const size = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  let query = db.collection(COLLECTION).orderBy('__name__', 'desc').limit(size + 1);
  if (cursor) query = query.startAfter(String(cursor));
  const snapshot = await query.get();
  const docs = snapshot.docs || [];
  const wanted = docs.slice(0, size)
    .map((doc) => Object.assign({ id: doc.id }, doc.data()))
    .filter((row) => (!actor || (row.actor && row.actor.email === actor))
      && (!action || row.action === action));
  return {
    rows: wanted,
    cursor: docs.length > size ? docs[size - 1].id : null,
    done: docs.length <= size
  };
}

module.exports = { record, read, describe, entryId, COLLECTION };
