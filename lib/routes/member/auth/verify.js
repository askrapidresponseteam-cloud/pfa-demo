/* POST /api/member/auth/verify   { memberId, code, password? }

   Spends the one-time code and returns a Firebase custom token, which the
   browser trades for a session. If a password is supplied it is set on the
   Firebase Auth user at the same time, so the member can sign in with member
   number and password afterwards without waiting for another email.

   The password is handed straight to Firebase Auth and is never written to
   Firestore, logged, or returned. We keep no copy of it, which is the whole
   point of using Auth rather than storing credentials ourselves. */

const auth = require('../../../../lib/member-auth');
const { getMember } = require('../../../../lib/firebase');

const REASONS = {
  NO_CODE: 'Ask for a new code - we have none on file for that member number.',
  EXPIRED: 'That code has expired. Ask for a new one.',
  USED: 'That code has already been used. Ask for a new one.',
  LOCKED: 'Too many attempts on that code. Ask for a new one.',
  WRONG: 'That code is not right.',
  INVALID: 'Enter the six-digit code from your email.'
};

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
  }

  const body = typeof request.body === 'string' ? safeParse(request.body) : (request.body || {});
  const memberId = auth.normaliseMemberId(body.memberId);
  const password = body.password ? String(body.password) : '';

  if (!auth.isMemberId(memberId)) {
    return response.status(400).json({ code: 'INVALID_ID', message: 'That is not a valid member number.' });
  }

  try {
    const checked = await auth.verifyCode(memberId, body.code);
    if (!checked.ok) {
      const message = REASONS[checked.reason] || REASONS.INVALID;
      return response.status(401).json({
        code: checked.reason || 'INVALID',
        message: checked.left != null ? `${message} ${checked.left} attempt(s) left.` : message
      });
    }

    const member = await getMember(memberId);
    if (!member) {
      return response.status(401).json({ code: 'INVALID', message: REASONS.INVALID });
    }

    if (password) {
      try {
        await auth.ensureAuthUser(memberId, member);
        await auth.setPassword(memberId, password);
      } catch (error) {
        if (error && error.code === 'WEAK_PASSWORD') {
          return response.status(400).json({ code: 'WEAK_PASSWORD', message: error.message });
        }
        throw error;
      }
    }

    /* Past the grace window there is no token, and saying so plainly is not
       a leak: they have just proved they own the address on the record. A
       generic "that code is not right" here would send someone hunting for a
       typing mistake that does not exist. */
    const state = auth.standing(member);
    if (state === 'ended') {
      return response.status(403).json({
        code: 'MEMBERSHIP_ENDED',
        message: 'Your membership ended and the thirty day grace period is over. Renew and this door opens again.',
        memberId,
        name: member.name || '',
        validUntil: member.validUntil || '',
        standing: 'ended'
      });
    }

    const token = await auth.createSessionToken(memberId);
    if (!token) {
      return response.status(401).json({ code: 'INVALID', message: REASONS.INVALID });
    }

    return response.status(200).json({
      ok: true,
      token,
      memberId,
      name: member.name || '',
      validUntil: member.validUntil || '',
      expired: auth.isExpired(member),
      standing: state,
      graceDaysLeft: state === 'grace' ? auth.graceDaysLeft(member) : 0,
      hasPassword: Boolean(password) || Boolean(member.hasPassword)
    });
  } catch (error) {
    console.error('member auth verify failed', error && error.message);
    return response.status(500).json({ code: 'SERVER_ERROR', message: 'That could not be processed. Try again.' });
  }
};

function safeParse(value) {
  try { return JSON.parse(value); } catch (error) { return {}; }
}
