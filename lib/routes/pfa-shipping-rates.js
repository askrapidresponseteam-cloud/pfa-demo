'use strict';

/* Shopify's own delivery rates for a bag and an address, so the shipping method
   can be chosen in PFA's drawer instead of on the seller's checkout.
 *
 * PFA never prices delivery. Every number this route returns came from Shopify
 * for this cart and this PIN code, and the charge the shopper actually pays is
 * still Shopify's, applied on the seller's checkout. This route only moves
 * *when* the choice is made, never who makes the price.
 *
 * Nothing is written down: no order intent, no Firestore record, no payment.
 * The cart it creates to get a quote is thrown away. If anything at all fails,
 * the answer is an empty list, and the drawer falls back to saying that
 * delivery is calculated at checkout, which is what it said before.
 */

const orders = require('./pfa-orders.js');

const { cleanText, quoteDelivery, readBody, validatedCheckoutData } = orders._private;

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();

/* Rates depend on what is in the bag and where it is going, and on nothing
   else, so two shoppers with the same bag and the same PIN share an answer for
   five minutes rather than each making Shopify rate it again. */
function cacheKey(checkout) {
  const lines = checkout.lines.map((l) => l.variantId + 'x' + l.quantity).sort().join(',');
  return lines + '|' + checkout.address.zip + '|' + checkout.address.provinceCode;
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { cache.delete(key); return null; }
  return hit.value;
}

function writeCache(key, value) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

module.exports = async function pfaShippingRates(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { options: [], reason: 'METHOD_NOT_ALLOWED' });
  }

  let body;
  try {
    body = await readBody(request);
  } catch (_) {
    return sendJson(response, 400, { options: [], reason: 'INVALID_JSON' });
  }

  /* The same validation the order route runs, so a quote can never be got for
     an address the order itself would reject. An invalid address is not an
     error here though: the drawer is still being typed into. */
  let checkout;
  try {
    checkout = validatedCheckoutData(body);
  } catch (_) {
    return sendJson(response, 200, { options: [], reason: 'INCOMPLETE_ADDRESS' });
  }

  const key = cacheKey(checkout);
  const cached = readCache(key);
  if (cached) return sendJson(response, 200, Object.assign({ cached: true }, cached));

  try {
    const quote = await quoteDelivery(body, request);
    const payload = {
      options: quote.options.map((o) => ({
        code: cleanText(o.code, 80),
        title: cleanText(o.title, 120),
        description: cleanText(o.description, 160),
        amount: Number(o.amount) || 0,
        currency: cleanText(o.currency, 8) || 'INR'
      })),
      reason: quote.reason || ''
    };
    if (payload.options.length) writeCache(key, payload);
    return sendJson(response, 200, payload);
  } catch (_) {
    /* A quote that could not be got is not a failed order. Say nothing is
       known and let the drawer fall back. */
    return sendJson(response, 200, { options: [], reason: 'RATES_UNAVAILABLE' });
  }
};

module.exports._private = {
  cacheKey,
  resetForTests() { cache.clear(); }
};
