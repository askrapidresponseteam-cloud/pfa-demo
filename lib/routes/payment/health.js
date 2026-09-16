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
  /* Whether acknowledgement, receipt and welcome emails can leave at all.
     Without the key every form still files and the page tells the person the
     email did not go; this makes that visible without submitting anything.
     A yes or no only, never the key, and not part of ok: payments work
     without it. DEPLOY.command reads it after every deploy. */
  const mail = Boolean(process.env.PFA_MAIL_API_KEY);
  response.statusCode = ok ? 200 : 503;
  response.end(JSON.stringify({
    ok,
    scope: ['donate', 'caregiver', 'caregiver-application', 'membership'],
    store: false,
    ccavenue,
    firebase,
    mail,
    callback: '/api/payment/response'
  }));
};
