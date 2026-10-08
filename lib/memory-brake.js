'use strict';

/* One instance's own count of requests per key, in memory: the brake when the
   shared count in Firestore (lib/submissions.js sharedLimited) cannot be
   reached, and the first brake on a flood that never gets as far as
   Firestore.

   When the map is full the stalest key goes, not every key: clearing the lot
   at 5000 keys (as until 8 Oct 2026) reset everyone's brake, a flooder's own
   included, the moment 5000 addresses had been seen. A Map keeps insertion
   order and every hit moves its key to the end, so the first key is always
   the one used longest ago. (The deletes below are of Map entries, counters
   in memory, never of records.) */

const MAX_KEYS = 5000;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

function brake(store, key, limit, nowMs, windowMs = DEFAULT_WINDOW_MS) {
  const at = String(key || 'unknown');
  const previous = store.get(at);
  const entry = previous && previous.resetAt > nowMs
    ? { count: previous.count + 1, resetAt: previous.resetAt }
    : { count: 1, resetAt: nowMs + windowMs };
  if (previous) store.delete(at);
  store.set(at, entry);
  while (store.size > MAX_KEYS) store.delete(store.keys().next().value);
  return entry.count > limit;
}

module.exports = { brake, MAX_KEYS };
