/* Member authentication - the locker key for a member's own account.

   The shape of it:
     memberId  - the name on the locker. Public-ish: it is printed on the card.
     code      - a one-time key we post to the member's registered email.
     password  - the key they keep, held by Firebase Auth and never by us.

   Two rules this file exists to enforce.

   1. A member ID alone proves nothing. It is printed on a card that can be
      photographed, so it is a username, never a credential. Every route that
      turns an ID into a session goes through an emailed code or a password.

   2. Caretakers are not members. Caretaker cards live in their own collections
      and have no auth user, so a caretaker card number cannot be exchanged for
      a session here. Their card stays readable at its own public URL, which is
      a different thing from an account.

   Firebase Auth stores the password. We store only a hash of the one-time code
   and never the code itself, so a dump of Firestore yields nothing reusable. */

const crypto = require('crypto');
const { getDb, getMember, serverTimestamp } = require('./firebase');

const CODE_TTL_MS = 10 * 60 * 1000;      // ten minutes
const MAX_ATTEMPTS = 5;                   // per code, then it is burned
const RESEND_COOLDOWN_MS = 60 * 1000;     // one code a minute per member
const MEMBER_ID = /^PFA-MBR-[A-Z0-9]{8}$/;

function normaliseMemberId(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function isMemberId(value) {
  return MEMBER_ID.test(normaliseMemberId(value));
}

/* Six digits, uniformly distributed. Math.random() is not acceptable for
   something that is, for ten minutes, the only thing standing in front of a
   member's account. */
function createCode() {
  let out = '';
  while (out.length < 6) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 250) out += String(byte % 10);   // reject the biased tail
  }
  return out;
}

function hashCode(memberId, code) {
  const pepper = process.env.PFA_AUTH_PEPPER || '';
  return crypto.createHash('sha256').update(`${memberId}:${code}:${pepper}`).digest('hex');
}

/* Comparison in constant time, so a caller cannot learn the code one character
   at a time by measuring how long the answer takes to come back. */
function sameHash(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function codeRef(db, memberId) {
  return db.collection('memberAuthCodes').doc(memberId);
}

/* An email address is confirmation to its owner and a leak to anybody else, so
   it goes back only as a shape: k****k@gmail.com. */
function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at < 1) return '';
  const name = value.slice(0, at);
  const domain = value.slice(at);
  if (name.length <= 2) return `${name[0]}*${domain}`;
  return `${name[0]}${'*'.repeat(Math.min(name.length - 2, 6))}${name[name.length - 1]}${domain}`;
}

function isExpired(member) {
  const until = member && member.validUntil ? new Date(member.validUntil) : null;
  if (!until || isNaN(until.getTime())) return false;
  return until.getTime() < Date.now();
}

/* ---- standing ------------------------------------------------------------
   A membership has three states, not two. The middle one exists because a
   Patron who forgot to renew on Tuesday has not stopped caring about animals
   on Wednesday, and shutting the door in their face is a poor way to ask for
   money. For thirty days after the card expires they can still read
   everything. They simply cannot write, and every screen says why.

   After thirty days the door closes properly. */

const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/* Returns the expiry as milliseconds, or 0 for a membership with no end
   date. This number goes into the token so the security rules can do the
   arithmetic themselves at request time - see the note in createSessionToken
   about why the rules must not trust a stored yes-or-no. */
function validUntilMs(member) {
  const until = member && member.validUntil ? new Date(member.validUntil) : null;
  if (!until || isNaN(until.getTime())) return 0;
  return until.getTime();
}

function standing(member, now = Date.now()) {
  const until = validUntilMs(member);
  if (!until) return 'active';
  if (now < until) return 'active';
  if (now < until + GRACE_MS) return 'grace';
  return 'ended';
}

/* Whole days left in the grace window, for the line the member actually
   reads. Rounded up, because "1 day left" should not appear with 20 hours
   still on the clock. */
function graceDaysLeft(member, now = Date.now()) {
  const until = validUntilMs(member);
  if (!until) return 0;
  const left = until + GRACE_MS - now;
  return left > 0 ? Math.ceil(left / (24 * 60 * 60 * 1000)) : 0;
}

/* ---- issuing a code ----------------------------------------------------- */

/* Deliberately returns the same shape whether or not the member exists. A
   member ID is guessable in principle, and answering "no such member" turns
   this route into a way of finding out which IDs are real. */
async function requestCode(memberIdInput) {
  const memberId = normaliseMemberId(memberIdInput);
  const generic = { sent: true, email: '', memberId };

  if (!isMemberId(memberId)) return { ...generic, sent: false, reason: 'INVALID_ID' };

  const member = await getMember(memberId);
  if (!member || !member.email) return generic;
  if (member.status && member.status !== 'active') return generic;

  const db = getDb();
  const ref = codeRef(db, memberId);
  const existing = await ref.get();

  if (existing.exists) {
    const last = existing.data().sentAt ? new Date(existing.data().sentAt).getTime() : 0;
    if (Date.now() - last < RESEND_COOLDOWN_MS) {
      return { ...generic, email: maskEmail(member.email), throttled: true };
    }
  }

  const code = createCode();
  await ref.set({
    memberId,
    codeHash: hashCode(memberId, code),
    attempts: 0,
    sentAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    consumedAt: null,
    updatedAt: serverTimestamp()
  });

  return {
    sent: true,
    memberId,
    email: maskEmail(member.email),
    deliverTo: member.email,          // for the mailer only, never returned to the browser
    code,                             // likewise
    name: member.name || '',
    minutes: Math.round(CODE_TTL_MS / 60000)
  };
}

/* ---- spending a code ---------------------------------------------------- */

async function verifyCode(memberIdInput, codeInput) {
  const memberId = normaliseMemberId(memberIdInput);
  const code = String(codeInput == null ? '' : codeInput).replace(/\D/g, '');
  if (!isMemberId(memberId) || code.length !== 6) return { ok: false, reason: 'INVALID' };

  const db = getDb();
  const ref = codeRef(db, memberId);

  const outcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { ok: false, reason: 'NO_CODE' };
    const row = snapshot.data();

    if (row.consumedAt) return { ok: false, reason: 'USED' };
    if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };
    if ((row.attempts || 0) >= MAX_ATTEMPTS) return { ok: false, reason: 'LOCKED' };

    if (!sameHash(row.codeHash, hashCode(memberId, code))) {
      transaction.update(ref, { attempts: (row.attempts || 0) + 1, updatedAt: serverTimestamp() });
      return { ok: false, reason: 'WRONG', left: MAX_ATTEMPTS - (row.attempts || 0) - 1 };
    }

    transaction.update(ref, { consumedAt: new Date().toISOString(), updatedAt: serverTimestamp() });
    return { ok: true };
  });

  return outcome;
}

/* ---- turning a verified member into a session --------------------------- */

/* The member ID is the Firebase Auth uid. That keeps one identity per member,
   lets the security rules compare request.auth.uid to the document id with no
   lookup, and means a caretaker - who has no such user - can never hold a
   token that satisfies those rules. */
async function ensureAuthUser(memberId, member) {
  const admin = require('firebase-admin');
  const auth = admin.auth();
  try {
    return await auth.getUser(memberId);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return auth.createUser({
        uid: memberId,
        email: member && member.email ? member.email : undefined,
        displayName: member && member.name ? member.name : undefined,
        emailVerified: true              // the emailed code is the proof
      });
    }
    throw error;
  }
}

async function setPassword(memberId, password) {
  const admin = require('firebase-admin');
  if (!password || String(password).length < 8) {
    const error = new Error('A password must be at least 8 characters.');
    error.code = 'WEAK_PASSWORD';
    throw error;
  }
  await admin.auth().updateUser(memberId, { password: String(password) });
  await getDb().collection('members').doc(memberId).set(
    { hasPassword: true, updatedAt: serverTimestamp() }, { merge: true }
  );
}

/* A short-lived token the browser trades for a Firebase session. The claim is
   what the security rules read, so a caretaker card number can never produce
   one of these.

   The claim carries validUntil as a number rather than a decided yes-or-no
   about writing. That matters: custom claims are minted once and then ride
   along in the ID token for as long as the session lasts. If we baked in
   "canWrite: true" at sign-in, a member who signed in the day before their
   card expired would keep writing for as long as they left the tab open. By
   shipping the date instead, firestore.rules compares it against
   request.time on every single operation, and the moment the card lapses the
   writes stop by themselves.

   Past the grace window there is no token at all. */
async function createSessionToken(memberId) {
  const admin = require('firebase-admin');
  const member = await getMember(memberId);
  if (!member) return null;
  if (standing(member) === 'ended') return null;
  await ensureAuthUser(memberId, member);
  return admin.auth().createCustomToken(memberId, {
    role: 'member',
    memberId,
    validUntil: validUntilMs(member)
  });
}

module.exports = {
  CODE_TTL_MS,
  createCode,
  createSessionToken,
  standing,
  graceDaysLeft,
  validUntilMs,
  GRACE_MS,
  ensureAuthUser,
  hashCode,
  isExpired,
  isMemberId,
  maskEmail,
  normaliseMemberId,
  requestCode,
  setPassword,
  verifyCode
};
