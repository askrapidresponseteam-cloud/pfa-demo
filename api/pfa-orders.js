'use strict';

const crypto = require('crypto');
const RULES = require('../assets/field-rules.js');

const DEFAULT_SHOPIFY_DOMAIN = 'sg37v1-ta.myshopify.com';
const DEFAULT_STOREFRONT_API_VERSION = '2026-07';
const PREPARING_LEASE_MS = 20_000;
const memoryIntents = new Map();

const INDIA_PROVINCE_CODES = {
  'andaman and nicobar islands': 'AN',
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  assam: 'AS',
  bihar: 'BR',
  chandigarh: 'CH',
  chhattisgarh: 'CG',
  'dadra and nagar haveli and daman and diu': 'DH',
  delhi: 'DL',
  goa: 'GA',
  gujarat: 'GJ',
  haryana: 'HR',
  'himachal pradesh': 'HP',
  'jammu and kashmir': 'JK',
  jharkhand: 'JH',
  karnataka: 'KA',
  kerala: 'KL',
  ladakh: 'LA',
  lakshadweep: 'LD',
  'madhya pradesh': 'MP',
  maharashtra: 'MH',
  manipur: 'MN',
  meghalaya: 'ML',
  mizoram: 'MZ',
  nagaland: 'NL',
  odisha: 'OD',
  puducherry: 'PY',
  punjab: 'PB',
  rajasthan: 'RJ',
  'tamil nadu': 'TN',
  telangana: 'TS',
  tripura: 'TR',
  'uttar pradesh': 'UP',
  uttarakhand: 'UK',
  'west bengal': 'WB'
};

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function checkoutError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function readBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(checkoutError('Order payload is too large.', 'PAYLOAD_TOO_LARGE', 413));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(checkoutError('Order payload must be valid JSON.', 'INVALID_JSON'));
      }
    });
    request.on('error', reject);
  });
}

function splitCustomerName(fullName) {
  const nameError = RULES.checkField('name', fullName, { required: true, emptyMessage: 'Enter the recipient name.' });
  if (nameError) throw checkoutError(nameError, 'INVALID_CUSTOMER');
  const parts = RULES.normaliseField('name', fullName).split(/\s+/).filter(Boolean);
  const firstName = parts.shift();
  const lastName = parts.join(' ') || firstName;
  return { firstName, lastName };
}

function normalizedIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  throw checkoutError('Enter a valid 10-digit Indian mobile number.', 'INVALID_PHONE');
}

function idempotencyKey(request, body) {
  const headers = request.headers || {};
  const supplied = headers['idempotency-key'] || headers['x-idempotency-key'] || body.idempotencyKey || body.clientRequestId;
  return cleanText(supplied, 120) || crypto.randomUUID();
}

function validateLine(line) {
  const variantId = cleanText(line && line.variantId, 40);
  const quantity = Number(line && line.quantity);
  if (!/^\d{8,20}$/.test(variantId)) throw checkoutError('A product variant is invalid.', 'INVALID_LINE');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 25) {
    throw checkoutError('A product quantity is invalid.', 'INVALID_LINE');
  }
  return { variantId, quantity };
}

function provinceCode(value) {
  const normalized = cleanText(value, 80).toLowerCase().replace(/\s+/g, ' ');
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  const code = INDIA_PROVINCE_CODES[normalized];
  if (!code) throw checkoutError('Choose a valid Indian state.', 'INVALID_ADDRESS');
  return code;
}

function validatedCheckoutData(body) {
  const lines = Array.isArray(body.lines) ? body.lines.map(validateLine) : [];
  if (!lines.length) throw checkoutError('Your bag is empty.', 'EMPTY_CART');

  const address = body.shippingAddress || {};
  const customer = body.customer || {};
  const name = splitCustomerName(address.name || customer.name);
  const email = RULES.normaliseField('email', cleanText(customer.email, 160));
  const address1 = RULES.normaliseField('address', cleanText(address.address1, 180));
  const address2 = RULES.normaliseField('address', cleanText(address.address2, 180));
  const city = RULES.normaliseField('city', cleanText(address.city || address.district, 120));
  const zip = RULES.normaliseField('pin', cleanText(address.zip || address.pincode, 12));
  if (RULES.checkField('email', email, { required: true })) {
    throw checkoutError('Enter a valid email address.', 'INVALID_CUSTOMER');
  }
  const address1Error = RULES.checkField('address', address1, { required: true, emptyMessage: 'Enter the delivery address.' });
  if (address1Error) throw checkoutError(address1Error, 'INVALID_ADDRESS');
  if (address2 && RULES.checkField('address2', address2, { required: false })) {
    throw checkoutError('Check the second address line.', 'INVALID_ADDRESS');
  }
  const cityError = RULES.checkField('city', city, { required: true, emptyMessage: 'Enter the delivery city.' });
  if (cityError) throw checkoutError(cityError, 'INVALID_ADDRESS');
  const zipError = RULES.checkField('pin', zip, { required: true, emptyMessage: 'Enter a 6-digit PIN code.' });
  if (zipError) throw checkoutError(zipError, 'INVALID_ADDRESS');

  return {
    lines,
    email,
    phone: normalizedIndianPhone(address.phone || customer.phone),
    address: {
      firstName: name.firstName,
      lastName: name.lastName,
      address1,
      address2: address2 || undefined,
      city,
      provinceCode: provinceCode(address.province || address.state),
      countryCode: 'IN',
      zip,
      phone: normalizedIndianPhone(address.phone || customer.phone)
    }
  };
}

function buildShopifyCartInput(body, token) {
  const checkout = validatedCheckoutData(body);
  return {
    lines: checkout.lines.map((line) => ({
      merchandiseId: `gid://shopify/ProductVariant/${line.variantId}`,
      quantity: line.quantity
    })),
    buyerIdentity: {
      countryCode: 'IN',
      email: checkout.email,
      phone: checkout.phone
    },
    delivery: {
      addresses: [{
        address: { deliveryAddress: checkout.address },
        selected: true,
        oneTimeUse: true
      }]
    },
    attributes: [
      { key: 'PFA checkout reference', value: token },
      { key: 'Sales channel', value: 'PFA Store' }
    ],
    note: `PFA checkout reference: ${token}`
  };
}

function shopifyConfig() {
  const domain = cleanText(process.env.PFA_SHOPIFY_STORE_DOMAIN || DEFAULT_SHOPIFY_DOMAIN, 160).toLowerCase();
  const apiVersion = cleanText(process.env.PFA_SHOPIFY_STOREFRONT_API_VERSION || DEFAULT_STOREFRONT_API_VERSION, 20);
  const publicToken = cleanText(process.env.PFA_SHOPIFY_STOREFRONT_ACCESS_TOKEN, 300);
  const privateToken = cleanText(process.env.PFA_SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN, 300);
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw checkoutError('The seller checkout domain is not configured correctly.', 'SHOPIFY_CONFIG_ERROR', 503);
  }
  if (!/^20\d{2}-(01|04|07|10)$/.test(apiVersion)) {
    throw checkoutError('The Shopify API version is not configured correctly.', 'SHOPIFY_CONFIG_ERROR', 503);
  }
  if (!publicToken && !privateToken) {
    throw checkoutError('Seller checkout setup is incomplete. Add the Shopify Storefront access token in Vercel.', 'SHOPIFY_STOREFRONT_NOT_CONFIGURED', 503);
  }
  return { domain, apiVersion, publicToken, privateToken };
}

function buyerIp(request) {
  const raw = cleanText((request.headers || {})['x-forwarded-for'], 120);
  return raw.split(',')[0].trim();
}

function canonicalCheckoutUrl(rawUrl, domain) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_) {
    throw checkoutError('Shopify did not return a valid checkout URL.', 'SHOPIFY_INVALID_RESPONSE', 502);
  }
  if (url.protocol !== 'https:') {
    throw checkoutError('Shopify did not return a secure checkout URL.', 'SHOPIFY_INVALID_RESPONSE', 502);
  }
  url.hostname = domain;
  url.port = '';
  return url.toString();
}

async function createShopifyCheckout(body, token, request, fetchImpl = global.fetch) {
  const config = shopifyConfig();
  if (typeof fetchImpl !== 'function') {
    throw checkoutError('Secure checkout networking is unavailable.', 'SHOPIFY_NETWORK_ERROR', 503);
  }
  const input = buildShopifyCartInput(body, token);
  const query = `mutation PfaCartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { id checkoutUrl }
      userErrors { field message code }
      warnings { code message target }
    }
  }`;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (config.privateToken) {
    headers['Shopify-Storefront-Private-Token'] = config.privateToken;
    const ip = buyerIp(request);
    if (ip) headers['Shopify-Storefront-Buyer-IP'] = ip;
  } else {
    headers['X-Shopify-Storefront-Access-Token'] = config.publicToken;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetchImpl(`https://${config.domain}/api/${config.apiVersion}/graphql.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: { input } }),
      signal: controller.signal
    });
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'The seller checkout timed out. Please retry.'
      : 'The seller checkout could not be reached. Please retry.';
    throw checkoutError(message, 'SHOPIFY_NETWORK_ERROR', 503);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(payload.errors) && payload.errors.length)) {
    const detail = payload.errors && payload.errors[0] && payload.errors[0].message;
    throw checkoutError(cleanText(detail, 180) || 'Shopify could not prepare this checkout.', 'SHOPIFY_REQUEST_FAILED', 502);
  }
  const result = payload.data && payload.data.cartCreate;
  const userErrors = result && Array.isArray(result.userErrors) ? result.userErrors : [];
  if (userErrors.length || !result || !result.cart || !result.cart.checkoutUrl) {
    const detail = userErrors[0] && userErrors[0].message;
    throw checkoutError(cleanText(detail, 180) || 'Shopify could not prepare this checkout.', 'SHOPIFY_CART_REJECTED', 422);
  }
  return {
    paymentUrl: canonicalCheckoutUrl(result.cart.checkoutUrl, config.domain),
    shopifyCartId: cleanText(result.cart.id, 300)
  };
}

function requestFingerprint(body) {
  const checkout = validatedCheckoutData(body);
  return crypto.createHash('sha256').update(JSON.stringify({
    lines: checkout.lines,
    email: checkout.email,
    phone: checkout.phone,
    address: checkout.address
  })).digest('hex');
}

function firebaseConfigured() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function responseFromRecord(token, record) {
  return {
    checkoutToken: token,
    status: 'AWAITING_PAYMENT',
    paymentUrl: record.paymentUrl,
    addressPrefilled: true,
    checkoutMode: 'STOREFRONT_CART',
    createdAt: record.createdAt || new Date().toISOString()
  };
}

function claimMemoryIntent(token, fingerprint) {
  const now = Date.now();
  const existing = memoryIntents.get(token);
  if (existing && existing.fingerprint !== fingerprint) {
    throw checkoutError('This checkout key is already tied to different delivery details.', 'IDEMPOTENCY_CONFLICT', 409);
  }
  if (existing && existing.paymentUrl) return { action: 'reuse', record: existing };
  if (existing && existing.status === 'PREPARING' && existing.leaseUntil > now) return { action: 'wait' };
  const owner = crypto.randomUUID();
  memoryIntents.set(token, {
    fingerprint,
    status: 'PREPARING',
    owner,
    leaseUntil: now + PREPARING_LEASE_MS,
    createdAt: existing && existing.createdAt || new Date().toISOString()
  });
  return { action: 'create', owner, storage: 'memory' };
}

async function claimFirebaseIntent(token, fingerprint) {
  const { getDb, hashKey } = require('../lib/firebase');
  const db = getDb();
  const ref = db.collection('storeCheckoutIntents').doc(hashKey(`store:${token}`));
  const now = Date.now();
  const owner = crypto.randomUUID();
  let outcome;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() : null;
    if (existing && existing.fingerprint !== fingerprint) {
      throw checkoutError('This checkout key is already tied to different delivery details.', 'IDEMPOTENCY_CONFLICT', 409);
    }
    if (existing && existing.paymentUrl) {
      outcome = { action: 'reuse', record: existing, storage: 'firebase', ref };
      return;
    }
    if (existing && existing.status === 'PREPARING' && Number(existing.leaseUntil) > now) {
      outcome = { action: 'wait', storage: 'firebase', ref };
      return;
    }
    const record = {
      checkoutToken: token,
      fingerprint,
      status: 'PREPARING',
      owner,
      leaseUntil: now + PREPARING_LEASE_MS,
      createdAt: existing && existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    transaction.set(ref, record, { merge: true });
    outcome = { action: 'create', owner, storage: 'firebase', ref };
  });
  return outcome;
}

async function claimIntent(token, fingerprint) {
  if (!firebaseConfigured()) return claimMemoryIntent(token, fingerprint);
  try {
    return await claimFirebaseIntent(token, fingerprint);
  } catch (error) {
    if (error && error.code === 'IDEMPOTENCY_CONFLICT') throw error;
    console.error('PFA store idempotency persistence unavailable', { message: error && error.message });
    return claimMemoryIntent(token, fingerprint);
  }
}

async function completeIntent(token, claim, fingerprint, checkout) {
  const record = {
    checkoutToken: token,
    fingerprint,
    status: 'AWAITING_PAYMENT',
    paymentUrl: checkout.paymentUrl,
    shopifyCartId: checkout.shopifyCartId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    leaseUntil: 0
  };
  memoryIntents.set(token, record);
  if (claim.storage === 'firebase' && claim.ref) {
    try {
      await claim.ref.set(record, { merge: true });
    } catch (error) {
      console.error('PFA store checkout was created but could not be persisted', { message: error && error.message });
    }
  }
  return record;
}

async function failIntent(token, claim, error) {
  const existing = memoryIntents.get(token) || {};
  memoryIntents.set(token, {
    ...existing,
    status: 'FAILED',
    leaseUntil: 0,
    updatedAt: new Date().toISOString()
  });
  if (claim && claim.storage === 'firebase' && claim.ref) {
    try {
      await claim.ref.set({
        status: 'FAILED',
        leaseUntil: 0,
        lastErrorCode: cleanText(error && error.code, 80),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (_) {}
  }
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Start checkout from the PFA store.' });
  }

  let claim;
  let token;
  try {
    const body = await readBody(request);
    token = idempotencyKey(request, body);
    const fingerprint = requestFingerprint(body);
    claim = await claimIntent(token, fingerprint);
    if (claim.action === 'reuse') return sendJson(response, 200, responseFromRecord(token, claim.record));
    if (claim.action === 'wait') {
      return sendJson(response, 202, {
        checkoutToken: token,
        status: 'PREPARING',
        retryAfterMs: 900
      });
    }

    const checkout = await createShopifyCheckout(body, token, request);
    const record = await completeIntent(token, claim, fingerprint, checkout);
    return sendJson(response, 200, responseFromRecord(token, record));
  } catch (error) {
    if (token && claim && claim.action === 'create') await failIntent(token, claim, error);
    return sendJson(response, Number(error && error.statusCode) || 400, {
      code: cleanText(error && error.code, 80) || 'STORE_CHECKOUT_NOT_READY',
      message: error && error.message ? error.message : 'Secure payment could not be prepared.'
    });
  }
};

module.exports._private = {
  buildShopifyCartInput,
  canonicalCheckoutUrl,
  cleanText,
  createShopifyCheckout,
  idempotencyKey,
  normalizedIndianPhone,
  provinceCode,
  requestFingerprint,
  splitCustomerName,
  validateLine,
  validatedCheckoutData,
  resetForTests() { memoryIntents.clear(); }
};
