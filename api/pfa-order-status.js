'use strict';

function cleanText(value, max = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Order status must be checked with GET.' });
  }

  let token = cleanText((request.query && request.query.token) || '', 120);
  if (!token && request.url) {
    try {
      const parsed = new URL(request.url, 'https://pfa.local');
      token = cleanText(parsed.searchParams.get('token'), 120);
    } catch (_) {}
  }
  if (!token) {
    return sendJson(response, 400, { code: 'MISSING_TOKEN', message: 'Checkout token is required.' });
  }

  return sendJson(response, 200, {
    checkoutToken: token,
    status: 'AWAITING_PAYMENT',
    verified: false,
    message: 'Payment has not been verified by PFA yet.'
  });
};

module.exports._private = { cleanText };
