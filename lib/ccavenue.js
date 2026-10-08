'use strict';

const crypto = require('crypto');

const CCA_VENUE_IV = Buffer.from([
  0x00, 0x01, 0x02, 0x03,
  0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b,
  0x0c, 0x0d, 0x0e, 0x0f
]);

function deriveKey(workingKey) {
  if (!workingKey) throw new Error('CCAvenue Working Key is missing.');
  return crypto.createHash('md5').update(String(workingKey), 'utf8').digest();
}

function encrypt(plainText, workingKey) {
  const cipher = crypto.createCipheriv('aes-128-cbc', deriveKey(workingKey), CCA_VENUE_IV);
  cipher.setAutoPadding(true);
  return Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final()
  ]).toString('hex');
}

function decrypt(encryptedHex, workingKey) {
  const value = String(encryptedHex || '').trim();
  if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error('CCAvenue returned an invalid encrypted response.');
  }
  const decipher = crypto.createDecipheriv('aes-128-cbc', deriveKey(workingKey), CCA_VENUE_IV);
  decipher.setAutoPadding(true);
  return Buffer.concat([
    decipher.update(Buffer.from(value, 'hex')),
    decipher.final()
  ]).toString('utf8');
}

function encodeMerchantData(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.append(key, String(value));
  });
  return params.toString();
}

function decodeMerchantData(value) {
  const params = new URLSearchParams(String(value || '').replace(/&+$/, ''));
  return Object.fromEntries(params.entries());
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 200);
}

function parseUrlEncoded(raw) {
  return Object.fromEntries(new URLSearchParams(String(raw || '')).entries());
}

async function readRequestBody(request, limitBytes) {
  const limit = limitBytes || 64 * 1024;

  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    return request.body;
  }

  if (Buffer.isBuffer(request.body)) {
    const raw = request.body.toString('utf8');
    const type = String(request.headers['content-type'] || '').toLowerCase();
    if (type.includes('application/json')) return JSON.parse(raw || '{}');
    return parseUrlEncoded(raw);
  }

  if (typeof request.body === 'string') {
    const type = String(request.headers['content-type'] || '').toLowerCase();
    if (type.includes('application/json')) return JSON.parse(request.body || '{}');
    return parseUrlEncoded(request.body);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(request.headers['content-type'] || '').toLowerCase();
  if (type.includes('application/json')) return JSON.parse(raw || '{}');
  return parseUrlEncoded(raw);
}

function getBaseUrl(request) {
  const configured = cleanText(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || '', 300);
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new Error('PUBLIC_SITE_URL must use HTTPS in production.');
    }
    return url.origin;
  }

  const protocol = cleanText(
    String(request.headers['x-forwarded-proto'] || 'https').split(',')[0],
    10
  ) || 'https';
  const host = cleanText(
    String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0],
    255
  );

  if (!host) throw new Error('The public site URL could not be determined.');
  return `${protocol}://${host}`;
}

function setSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

module.exports = {
  cleanText,
  decodeMerchantData,
  decrypt,
  encodeMerchantData,
  encrypt,
  escapeHtml,
  getBaseUrl,
  readRequestBody,
  setSecurityHeaders
};
