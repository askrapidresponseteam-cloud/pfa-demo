'use strict';

module.exports = async function handler(request, response) {
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
  const firebase = require('../../firebase').isConfigured();
  const ok = Object.values(ccavenue).every(Boolean) && firebase;
  /* Whether acknowledgement, receipt and welcome emails can leave at all.
     Without the key every form still files and the page tells the person the
     email did not go; this makes that visible without submitting anything.
     A yes or no only, never the key, and not part of ok: payments work
     without it. DEPLOY.command reads it after every deploy. */
  const mail = Boolean((process.env.PFA_SMTP_USER && process.env.PFA_SMTP_PASS) || process.env.PFA_MAIL_API_KEY);
  const mailVia = process.env.PFA_SMTP_USER && process.env.PFA_SMTP_PASS ? 'mailbox' : (process.env.PFA_MAIL_API_KEY ? 'resend' : 'none');
  /* Where shop orders are being written: 'pfa-oldsite' once its key is set,
     this site's own Firestore ('pfa-new-website') otherwise, or 'none'. A
     name only, never a key. */
  let shopOrders = 'none';
  try { shopOrders = require('../../shop-backend').ready(); } catch (_) { shopOrders = 'none'; }
  /* Where photographs and documents are being kept: 'storage' once the
     Firebase Storage bucket takes files (lib/file-store.js), 'database'
     while it does not. A word only. Never holds the answer up past 4s. */
  let files = 'database';
  try {
    const where = await Promise.race([require('../../file-store').bucket(), new Promise((r) => setTimeout(() => r(null), 4000))]);
    files = where ? 'storage' : 'database';
  } catch (_) { files = 'database'; }
  /* The two servers (Vercel and Firebase) share one database but not their
     settings (8 Oct 2026). These let DEPLOY.command see whether they agree
     without showing a secret: `pepper` is the first 4 hex characters of a
     hash of PFA_AUTH_PEPPER (16 bits: enough to tell two values apart, far
     too little to recover one), or 'none'; `site` is where this server's
     emails link to. */
  const pepperValue = String(process.env.PFA_AUTH_PEPPER || '');
  const pepper = pepperValue
    ? require('crypto').createHash('sha256').update(`pfa-pepper-fingerprint:${pepperValue}`, 'utf8').digest('hex').slice(0, 4)
    : 'none';
  /* The caller's address as this server sees it, masked (203.0.113.x).
     DEPLOY.command asks both servers from the same computer: if they see
     the same network, each one's rate limits key on the real visitor
     (lib/client-ip.js). */
  const IP = require('../../client-ip');
  const seenAs = IP.masked(IP.clientIp(request));
  let site = '';
  try { site = new URL(String(process.env.PUBLIC_SITE_URL || '')).origin; } catch (_) { site = ''; }
  response.statusCode = ok ? 200 : 503;
  response.end(JSON.stringify({
    ok,
    scope: ['donate', 'caregiver', 'caregiver-application', 'membership'],
    store: false,
    ccavenue,
    firebase,
    mail,
    mailVia,
    shopOrders,
    files,
    pepper,
    site,
    seenAs,
    callback: '/api/payment/response'
  }));
};
