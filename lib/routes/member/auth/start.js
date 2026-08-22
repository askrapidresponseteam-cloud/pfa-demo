/* POST /api/member/auth/start   { memberId }
   Posts a one-time code to the member's registered email.

   The reply is deliberately uninformative. Whether the member exists, whether
   they are lapsed, whether the mail provider accepted it - the browser is told
   the same thing either way, because anything richer turns this route into a
   way of testing which member numbers are real. The masked address is the one
   concession: it is meaningless to a stranger and reassuring to the owner. */

const auth = require('../../../../../lib/member-auth');
const mail = require('../../../../../lib/caretaker-mail');

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
  }

  const body = typeof request.body === 'string' ? safeParse(request.body) : (request.body || {});
  const memberId = auth.normaliseMemberId(body.memberId);

  if (!auth.isMemberId(memberId)) {
    return response.status(400).json({
      code: 'INVALID_ID',
      message: 'That is not a valid member number. It looks like PFA-MBR-XXXXXXXX.'
    });
  }

  try {
    const result = await auth.requestCode(memberId);

    // Nothing to send: either no such member, or a code was issued a moment ago.
    if (result.code && result.deliverTo) {
      try {
        await mail.deliver({
          to: result.deliverTo,
          template: 'member_login_code',
          payload: {
            code: result.code,
            memberId,
            name: result.name,
            minutes: result.minutes
          }
        });
      } catch (error) {
        // A mail failure must not tell the caller the member exists.
        console.error('member_login_code delivery failed', error && error.message);
      }
    }

    return response.status(200).json({
      ok: true,
      email: result.email || '',
      message: 'If that member number exists, a sign-in code is on its way to the email we hold for it.'
    });
  } catch (error) {
    console.error('member auth start failed', error && error.message);
    return response.status(500).json({ code: 'SERVER_ERROR', message: 'That could not be processed. Try again.' });
  }
};

function safeParse(value) {
  try { return JSON.parse(value); } catch (error) { return {}; }
}
