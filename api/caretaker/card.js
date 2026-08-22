'use strict';

/* The public card page's only data source: one Firestore point read of the
   denormalised caretakerPublic document, then CDN caching.

   The cache headers matter more than they look. A card link is shareable, so a
   single card can be opened by hundreds of people who are not the holder. With
   s-maxage the edge serves those from cache and Firestore sees one read per
   card per five minutes rather than one per view; stale-while-revalidate keeps
   it serving instantly while it refreshes. An ETag turns a repeat view into a
   304 with no body at all. */

const CARETAKER = require('../../lib/caretaker');
const store = require('../../lib/caretaker-store');
const crypto = require('crypto');

function sendJson(response, statusCode, payload, headers) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(headers || {}).forEach(([key, value]) => response.setHeader(key, value));
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Cards are read with GET.' }, { 'Cache-Control': 'no-store' });
  }

  let cardId = '';
  try {
    const parsed = new URL(request.url, 'https://pfa.local');
    cardId = CARETAKER.clean(parsed.searchParams.get('id'), 60).toUpperCase();
  } catch (_) {
    cardId = '';
  }

  if (!CARETAKER.CARD_ID_PATTERN.test(cardId)) {
    return sendJson(response, 400, { code: 'INVALID_ID', message: 'That is not a valid card number.' }, { 'Cache-Control': 'no-store' });
  }

  try {
    const card = await store.getPublicCard(cardId);

    if (!card) {
      /* Negative results are cached too, briefly. Without this, a link typo
         doing the rounds costs a Firestore read on every single view. */
      return sendJson(response, 404,
        { code: 'NOT_FOUND', message: 'No Caretaker Card was found for that number.' },
        { 'Cache-Control': 'public, max-age=30, s-maxage=60' });
    }

    const etag = `"${crypto.createHash('sha1').update(JSON.stringify(card)).digest('base64url').slice(0, 27)}"`;
    const cacheControl = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';

    if (request.headers['if-none-match'] === etag) {
      response.statusCode = 304;
      response.setHeader('ETag', etag);
      response.setHeader('Cache-Control', cacheControl);
      return response.end();
    }

    return sendJson(response, 200, card, { ETag: etag, 'Cache-Control': cacheControl });
  } catch (error) {
    console.error('PFA caretaker card read error:', CARETAKER.clean(error && error.message, 240));
    return sendJson(response, 503,
      { code: 'LOOKUP_UNAVAILABLE', message: 'Could not read that card right now.' },
      { 'Cache-Control': 'no-store' });
  }
};
