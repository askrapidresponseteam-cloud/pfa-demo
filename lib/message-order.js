'use strict';

/* The order of a case's conversation.
 *
 * Two rules, in this order:
 *
 * 1. When PFA recorded the message. A message carries `recordedAt` (the
 *    moment the site wrote it) or, if older, only `at`. An email from outside
 *    used to be placed by its own Date header, which is whatever the
 *    sender's clock said: on 8 Oct 2026 a person's answer with a wrong clock
 *    sorted above the question it answered. From 8 Oct 2026 an incoming
 *    email's `at` is also the moment it was recorded, and its Date header is
 *    kept as `sentAt`; older ones are placed by their `recordedAt`.
 *
 * 2. `seq`, for messages recorded in the same millisecond (a reply and a
 *    note sent back to back). `seq` rises with each write (wall clock in
 *    microseconds, kept strictly increasing within the process); before it,
 *    Firestore broke a tie by document id, which is random, and the panel
 *    could show a note above the reply it followed (test/email-thread.test.js
 *    failed on a fast Mac for that reason). Messages written before `seq`
 *    existed keep the order the database gave them within their millisecond.
 *
 * A message whose time cannot be read stays next to the message the
 * database gave before it, rather than jumping to either end. */

let last = 0;

function nextSeq(nowMs) {
  const base = Math.floor(Number(nowMs) || Date.now()) * 1000;
  last = Math.max(base, last + 1);
  return last;
}

function millisOf(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value) return Date.parse(value);
  if (typeof value === 'number') return value;
  return NaN;
}

/* When the site recorded a message. */
function recordedMs(message) {
  const m = message || {};
  const recorded = millisOf(m.recordedAt);
  return Number.isFinite(recorded) ? recorded : millisOf(m.at);
}

/* Messages in, the conversation out, oldest first. `messages` may come in
   any order; within one millisecond the order given is kept unless every
   message there carries seq. */
function sortMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let carry = -Infinity;
  const keyed = list.map((m, i) => {
    const ms = recordedMs(m);
    if (Number.isFinite(ms)) carry = ms;
    return { m, i, key: carry };
  });
  keyed.sort((a, b) => (a.key - b.key) || (a.i - b.i));
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length > 1 && run.every((k) => Number.isFinite(k.m.seq))) run.sort((a, b) => a.m.seq - b.m.seq);
    out.push(...run.map((k) => k.m));
    run = [];
  };
  for (const k of keyed) {
    if (run.length && run[0].key !== k.key) flush();
    run.push(k);
  }
  flush();
  return out;
}

module.exports = { nextSeq, sortMessages, recordedMs };
