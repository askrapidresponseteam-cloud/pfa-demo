'use strict';

/* Reference numbers that are free: the counter's next number, stepped past
   any number a record already holds (8 Oct 2026). */

/* Like reserveReference, but offers a number with no record on file. A
   number already on file means the counter is behind the records (a restore,
   a reset, a hand edit): it is stepped past, never written over. Reads up to
   `steps` slots; if all are taken it answers { behind: true } with skip()
   that moves the counter past them, so the caller commits that alone and
   tries again in a new transaction. Until 8 Oct 2026 a counter five behind
   refused every submission of its kind for good (the intake gave up without
   moving it), and a paid record could be filed on top of someone else's
   number (review, after the merge). */
const STEPS_PER_TRANSACTION = 25;
async function reserveFreeReference(tx, db, kind, nowMs = Date.now(), steps = STEPS_PER_TRANSACTION) {
  const S = require('./submissions');
  const first = await S.reserveReference(tx, db, kind, nowMs);
  let slot = first;
  for (let i = 0; i < steps; i += 1) {
    const taken = await tx.get(db.collection('submissions').doc(slot.reference));
    if (!taken.exists) return slot;
    slot = slot.bump();
  }
  const lastTaken = slot.number - 1;
  return { behind: true, skip: () => first.advanceTo(lastTaken) };
}

/* Runs `work(tx, slot)` with a free number, in as many transactions as it
   takes to step a counter that is far behind (40 rounds of 25: a thousand
   numbers). `work` must take() the slot with its own writes. */
async function withFreeReference(db, kind, nowMs, work, before) {
  for (let round = 0; round < 40; round += 1) {
    const out = await db.runTransaction(async (tx) => {
      if (before) {
        const early = await before(tx);
        if (early) return { done: true, value: early };
      }
      /* inside someone else's transaction (lib/firebase.js transactionScope)
         there is no second round, so look as far ahead in this one */
      const slot = await reserveFreeReference(tx, db, kind, nowMs, db.scoped ? STEPS_PER_TRANSACTION * 40 : STEPS_PER_TRANSACTION);
      if (slot.behind && db.scoped) throw new Error(`the ${kind} counter is more than a thousand numbers behind the records on file`);
      if (slot.behind) { slot.skip(); return { done: false }; }
      return { done: true, value: await work(tx, slot) };
    });
    if (out.done) return out.value;
  }
  throw new Error(`the ${kind} counter is more than a thousand numbers behind the records on file`);
}

/* Issues the next free number for this kind and year, atomically. Two
   people sending at the same instant get consecutive numbers, never the same
   one; Firestore retries the transaction for whichever lost the race. The
   paid routes use this (inside their own transaction, through
   lib/firebase.js transactionScope); the public intake files its record in
   the same transaction (lib/routes/pfa-submissions.js, withFreeReference). */
async function allocateReference(db, kind, nowMs = Date.now()) {
  return withFreeReference(db, kind, nowMs, async (tx, slot) => {
    slot.take();
    return slot.reference;
  });
}

module.exports = { reserveFreeReference, withFreeReference, allocateReference, STEPS_PER_TRANSACTION };
