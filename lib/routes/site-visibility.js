/* GET /api/site-visibility -> { version, pages: [hidden page ids], modules: ['page#module', ...] }

   What the public site hides, asked once by every page (assets/chrome.js).
   Public and identical for everyone, so the edge keeps it: ten seconds fresh,
   then served for up to thirty more while it is fetched again in the
   background. A change made in the panel is therefore live within about ten
   seconds without every page view becoming a Firestore read; each instance
   also keeps it five seconds (lib/site-visibility.js). max-age=0 so a
   browser always asks the edge rather than its own cache.

   It fails open. If the setting cannot be read the answer is that nothing is
   hidden, marked unavailable, and the edge may keep that for two seconds, not
   ten: an outage is not stretched out by the cache that protects us from
   one. */

'use strict';

const V = require('../site-visibility');

const FRESH = 'public, max-age=0, s-maxage=10, stale-while-revalidate=30';
const FAILED = 'public, max-age=0, s-maxage=2';

module.exports = async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    return response.end(JSON.stringify({ code: 'METHOD_NOT_ALLOWED' }));
  }
  const answer = await V.publicState();
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', answer.unavailable ? FAILED : FRESH);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.end(request.method === 'HEAD' ? '' : JSON.stringify(answer));
};

module.exports._private = { FRESH, FAILED };
