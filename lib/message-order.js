'use strict';

/* The order of a case's conversation.
 *
 * A case's messages are read ordered by `at`, an ISO timestamp to the
 * millisecond. Two written in the same millisecond (a reply and a note sent
 * back to back, or the copy to the inbox and a quick first reply) tie, and
 * Firestore breaks a tie by document id. Those ids are random or content
 * hashes, so a tie came back in any order: the panel could show a note above
 * the reply it followed. On 8 Oct 2026 test/email-thread.test.js failed on a
 * fast Mac for exactly this reason while passing on slower machines.
 *
 * Every message now carries `seq`, a number that rises with each write (wall
 * clock in microseconds, kept strictly increasing within the process), and
 * messages that share an `at` are put in `seq` order. `at` itself is never
 * changed: a reply from the inbox is still dated by its own Date header.
 * Messages written before this have no `seq` and keep the order the database
 * gave them. */

let last = 0;

function nextSeq(nowMs) {
  const base = Math.floor(Number(nowMs) || Date.now()) * 1000;
  last = Math.max(base, last + 1);
  return last;
}

function atKey(at) {
  if (at && typeof at.toMillis === 'function') return `t${at.toMillis()}`;
  return `${typeof at}:${String(at)}`;
}

/* Reorders only within runs of equal `at`, so the database's order between
   different times, including across mixed value types, is left alone. */
function sortMessages(messages) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length > 1 && run.every((m) => Number.isFinite(m.seq))) run.sort((a, b) => a.seq - b.seq);
    out.push(...run);
    run = [];
  };
  for (const m of messages) {
    if (run.length && atKey(run[0].at) !== atKey(m.at)) flush();
    run.push(m);
  }
  flush();
  return out;
}

module.exports = { nextSeq, sortMessages };
