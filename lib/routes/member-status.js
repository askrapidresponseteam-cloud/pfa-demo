'use strict';

const { getMember } = require('../../lib/firebase');

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

// Only the fields needed to show and verify a card are returned here.
// Mobile, email and full address are deliberately left out: a member ID is
// printed on the physical card, so a lost card should not let a finder pull
// up the holder's contact details or home address from this endpoint.
function publicRecord(member) {
  const now = Date.now();
  const validUntil = member.validUntil ? new Date(member.validUntil) : null;
  const standing = validUntil && validUntil.getTime() > now ? 'active' : 'expired';
  return {
    memberId: member.memberId,
    name: member.name || '',
    standing,
    currency: member.currency || 'INR',
    physicalCard: Boolean(member.physicalCard),
    memberSince: member.memberSince || null,
    validUntil: member.validUntil || null
  };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Member status must be checked with GET.' });
  }

  let memberId = cleanText((request.query && request.query.id) || '', 60);
  if (!memberId && request.url) {
    try {
      const parsed = new URL(request.url, 'https://pfa.local');
      memberId = cleanText(parsed.searchParams.get('id'), 60);
    } catch (_) {}
  }

  if (!/^PFA-MBR-[A-Z0-9]{8}$/.test(memberId)) {
    return sendJson(response, 400, { code: 'INVALID_ID', message: 'Enter a valid PFA Patron ID.' });
  }

  try {
    const member = await getMember(memberId);
    if (!member) {
      return sendJson(response, 404, { code: 'NOT_FOUND', message: 'No Patron card was found for that ID.' });
    }
    return sendJson(response, 200, publicRecord(member));
  } catch (error) {
    console.error('PFA member-status error:', cleanText(error && error.message, 240));
    return sendJson(response, 503, { code: 'LOOKUP_UNAVAILABLE', message: 'Could not check that Patron ID right now. Try again shortly.' });
  }
};

module.exports._private = { publicRecord };
