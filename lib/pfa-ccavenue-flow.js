'use strict';

const crypto = require('crypto');
const {
  cleanText,
  encodeMerchantData,
  encrypt,
  escapeHtml
} = require('./ccavenue');

const PRODUCTION_PAYMENT_URL = 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction';
const TEST_PAYMENT_URL = 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

function getCredentials(currency) {
  if (String(currency || '').toLowerCase() === 'usd') {
    // A separate USD Merchant ID is optional: CCAvenue sometimes issues one shared
    // Merchant ID with a distinct Access Code/Working Key per currency, sometimes a
    // fully separate sub-account. Both shapes work without code changes.
    const merchantId = cleanText(process.env.CCAVENUE_USD_MERCHANT_ID || process.env.CCAVENUE_MERCHANT_ID || '', 30);
    const accessCode = cleanText(process.env.CCAVENUE_USD_ACCESS_CODE || '', 200);
    const workingKey = String(process.env.CCAVENUE_USD_WORKING_KEY || '').trim();
    const missing = [];
    if (!merchantId) missing.push('CCAVENUE_USD_MERCHANT_ID or CCAVENUE_MERCHANT_ID');
    if (!accessCode) missing.push('CCAVENUE_USD_ACCESS_CODE');
    if (!workingKey) missing.push('CCAVENUE_USD_WORKING_KEY');
    if (missing.length) throw new Error(`Missing Vercel environment variable: ${missing.join(', ')}`);
    return { merchantId, accessCode, workingKey };
  }

  const merchantId = cleanText(process.env.CCAVENUE_MERCHANT_ID || '', 30);
  const accessCode = cleanText(process.env.CCAVENUE_ACCESS_CODE || '', 200);
  const workingKey = String(process.env.CCAVENUE_WORKING_KEY || '').trim();
  const missing = [];
  if (!merchantId) missing.push('CCAVENUE_MERCHANT_ID');
  if (!accessCode) missing.push('CCAVENUE_ACCESS_CODE');
  if (!workingKey) missing.push('CCAVENUE_WORKING_KEY');
  if (missing.length) throw new Error(`Missing Vercel environment variable: ${missing.join(', ')}`);
  return { merchantId, accessCode, workingKey };
}

function getPaymentUrl() {
  const configured = cleanText(process.env.CCAVENUE_PAYMENT_URL || '', 500);
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || !/(^|\.)ccavenue\.com$/i.test(url.hostname)) {
      throw new Error('CCAVENUE_PAYMENT_URL must be an HTTPS ccavenue.com URL.');
    }
    return url.toString();
  }
  return String(process.env.CCAVENUE_MODE || '').toLowerCase() === 'test'
    ? TEST_PAYMENT_URL
    : PRODUCTION_PAYMENT_URL;
}

function randomToken(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  while (token.length < length) token += alphabet[crypto.randomInt(0, alphabet.length)];
  return token.slice(0, length);
}

function createPfaOrderId(type) {
  const prefix = {
    donate: 'PFA-DON-',
    send: 'PFA-SND-',
    membership: 'PFA-MEM-',
    caretaker: 'PFA-CAR-'
  }[String(type || '').toLowerCase()];
  if (!prefix) throw new Error('Unsupported PFA payment type.');
  return `${prefix}${randomToken(8)}`;
}

function createMemberId() {
  return `PFA-MBR-${randomToken(8)}`;
}

// Colony Animal Caretaker Card numbers. The same format is used whether the
// card was issued free as a digital card or alongside a paid shipping order:
// one person, one card number, wherever the journey started.
function createCaretakerCardId() {
  return `PFA-CCT-${randomToken(8)}`;
}


function renderError(response, statusCode, title, message, backUrl, backLabel) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | PFA</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);border:1px solid #d9d9d9;padding:32px}.logo{width:180px;max-width:55%;height:auto;margin-bottom:32px}h1{font-size:32px;line-height:1.08;margin:0 0 14px}p{font-size:17px;line-height:1.55;color:#555}.btn{display:inline-block;margin-top:18px;background:#111;color:#fff;text-decoration:none;padding:14px 20px;font-weight:700}
</style></head><body><main class="wrap"><section class="card"><img class="logo" src="/media/pfa-logo.png" alt="People for Animals"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="btn" href="${escapeHtml(backUrl)}">${escapeHtml(backLabel)}</a></section></main></body></html>`);
}

function renderTransfer(response, merchantValues, options) {
  const { accessCode, workingKey } = getCredentials(options && options.currency);
  const encryptedRequest = encrypt(encodeMerchantData(merchantValues), workingKey);
  const paymentUrl = getPaymentUrl();
  const nonce = crypto.randomBytes(18).toString('base64');
  const title = cleanText(options && options.title || 'Opening secure payment', 80);
  const message = cleanText(options && options.message || 'You are being transferred to CCAvenue.', 260);

  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action https://secure.ccavenue.com https://test.ccavenue.com; base-uri 'none'; frame-ancestors 'none'`
  );
  response.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | PFA</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);border:1px solid #ddd;padding:34px;text-align:center}.logo{width:180px;max-width:55%;height:auto;margin-bottom:30px}h1{font-size:30px;line-height:1.1;margin:0 0 12px}p{font-size:16px;line-height:1.55;color:#555}.btn{border:0;background:#111;color:#fff;padding:14px 20px;font:700 16px Arial,sans-serif;cursor:pointer;margin-top:16px}.spinner{width:30px;height:30px;border:3px solid #ddd;border-top-color:#111;border-radius:50%;margin:22px auto;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body><main class="wrap"><section class="card"><img class="logo" src="/media/pfa-logo.png" alt="People for Animals"><h1>${escapeHtml(title)}</h1><div class="spinner" aria-hidden="true"></div><p>${escapeHtml(message)}</p><form id="ccaForm" method="post" action="${escapeHtml(paymentUrl)}"><input type="hidden" name="encRequest" value="${escapeHtml(encryptedRequest)}"><input type="hidden" name="access_code" value="${escapeHtml(accessCode)}"><button class="btn" type="submit">Continue securely</button></form></section></main><script nonce="${nonce}">document.getElementById('ccaForm').submit();</script></body></html>`);
}

function isConfigurationError(message) {
  return String(message || '').startsWith('Missing Vercel environment variable')
    || String(message || '').includes('PUBLIC_SITE_URL')
    || String(message || '').includes('CCAVENUE_PAYMENT_URL');
}

module.exports = {
  createPfaOrderId,
  createCaretakerCardId,
  createMemberId,
  getCredentials,
  getPaymentUrl,
  isConfigurationError,
  renderError,
  renderTransfer
};
