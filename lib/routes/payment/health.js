'use strict';

module.exports = function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET');
    response.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }
  const ccavenue = {
    merchantId: Boolean(process.env.CCAVENUE_MERCHANT_ID),
    accessCode: Boolean(process.env.CCAVENUE_ACCESS_CODE),
    workingKey: Boolean(process.env.CCAVENUE_WORKING_KEY)
  };
  const firebase = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      || (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  );
  const ok = Object.values(ccavenue).every(Boolean) && firebase;
  response.statusCode = ok ? 200 : 503;
  response.end(JSON.stringify({
    ok,
    scope: ['donate', 'send'],
    store: false,
    ccavenue,
    firebase,
    callback: '/api/payment/response'
  }));
};
