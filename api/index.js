'use strict';

// Single Vercel function that serves every /api/* route (see vercel.json rewrites).
// Vercel Hobby allows 12 Serverless Functions per deployment; the 23 handlers
// now live in lib/routes and are required lazily, so only the module for the
// requested route is loaded per invocation. Public URLs are unchanged.

const ROUTES = {
  'admin/circle': './admin/circle.js',
  'admin/import-members': './admin/import-members.js',
  'admin/metrics': './admin/metrics.js',
  'admin/records': './admin/records.js',
  'admin/submission-status': './admin/submission-status.js',
  'caretaker/admin-shipment': './caretaker/admin-shipment.js',
  'caretaker/apply': './caretaker/apply.js',
  'caretaker/card': './caretaker/card.js',
  'caretaker/email-worker': './caretaker/email-worker.js',
  'caretaker/order': './caretaker/order.js',
  'caretaker/replace': './caretaker/replace.js',
  'location-lookup': './location-lookup.js',
  'member-status': './member-status.js',
  'member/auth/start': './member/auth/start.js',
  'member/auth/verify': './member/auth/verify.js',
  'paws-catalog': './paws-catalog.js',
  'payment/create': './payment/create.js',
  'payment/health': './payment/health.js',
  'payment/response': './payment/response.js',
  'pfa-order-status': './pfa-order-status.js',
  'pfa-orders': './pfa-orders.js',
  'product-page': './product-page.js',
  'pfa-submissions': './pfa-submissions.js',
  'photo/remove-background': './photo/remove-background.js',
  'verify-card': './verify-card.js',
  'webhooks/order-created': './webhooks/shopify.js',
  'webhooks/order-paid': './webhooks/shopify.js',
  'webhooks/order-fulfilled': './webhooks/shopify.js',
  'webhooks/fulfillment-updated': './webhooks/shopify.js',
  'webhooks/order-cancelled': './webhooks/shopify.js',
  'webhooks/refund-created': './webhooks/shopify.js'
};

// Static requires so Vercel's file tracer bundles every handler.
const LOADERS = {
  'admin/circle': () => require('../lib/routes/admin/circle.js'),
  'admin/import-members': () => require('../lib/routes/admin/import-members.js'),
  'admin/metrics': () => require('../lib/routes/admin/metrics.js'),
  'admin/records': () => require('../lib/routes/admin/records.js'),
  'admin/submission-status': () => require('../lib/routes/admin/submission-status.js'),
  'caretaker/admin-shipment': () => require('../lib/routes/caretaker/admin-shipment.js'),
  'caretaker/apply': () => require('../lib/routes/caretaker/apply.js'),
  'caretaker/card': () => require('../lib/routes/caretaker/card.js'),
  'caretaker/email-worker': () => require('../lib/routes/caretaker/email-worker.js'),
  'caretaker/order': () => require('../lib/routes/caretaker/order.js'),
  'caretaker/replace': () => require('../lib/routes/caretaker/replace.js'),
  'location-lookup': () => require('../lib/routes/location-lookup.js'),
  'member-status': () => require('../lib/routes/member-status.js'),
  'member/auth/start': () => require('../lib/routes/member/auth/start.js'),
  'member/auth/verify': () => require('../lib/routes/member/auth/verify.js'),
  'paws-catalog': () => require('../lib/routes/paws-catalog.js'),
  'payment/create': () => require('../lib/routes/payment/create.js'),
  'payment/health': () => require('../lib/routes/payment/health.js'),
  'payment/response': () => require('../lib/routes/payment/response.js'),
  'pfa-order-status': () => require('../lib/routes/pfa-order-status.js'),
  'pfa-orders': () => require('../lib/routes/pfa-orders.js'),
  'product-page': () => require('../lib/routes/product-page.js'),
  'pfa-submissions': () => require('../lib/routes/pfa-submissions.js'),
  'photo/remove-background': () => require('../lib/routes/photo/remove-background.js'),
  'verify-card': () => require('../lib/routes/verify-card.js'),
  'webhooks/order-created': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/order-paid': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/order-fulfilled': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/fulfillment-updated': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/order-cancelled': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/refund-created': () => require('../lib/routes/webhooks/shopify.js')
};

function routeKey(request) {
  // vercel.json rewrites /api/<anything> here with ?__route=<anything>.
  const q = request.query || {};
  const rewritten = q.__route;
  if (Array.isArray(rewritten) && rewritten.length) return rewritten.join('/');
  if (typeof rewritten === 'string' && rewritten) return rewritten.replace(/^\/+|\/+$/g, '');
  const segments = q.path;
  if (Array.isArray(segments) && segments.length) return segments.join('/');
  if (typeof segments === 'string' && segments) return segments;
  try {
    const pathname = new URL(request.url, 'https://pfa.local').pathname;
    return pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  } catch (_) {
    return '';
  }
}

module.exports = async function handler(request, response) {
  const key = routeKey(request);
  const load = LOADERS[key];
  if (!load) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    return response.end(JSON.stringify({ code: 'NOT_FOUND', message: 'Unknown API route.' }));
  }
  // Remove the catch-all segment so handlers see the same query they always did.
  if (request.query && typeof request.query === 'object') { delete request.query.path; delete request.query.__route; }
  // Handlers that parse request.url themselves must not see the routing param.
  if (typeof request.url === 'string' && request.url.includes('__route=')) {
    const u = new URL(request.url, 'https://pfa.local');
    u.searchParams.delete('__route');
    request.url = u.pathname + (u.search || '');
  }
  return load()(request, response);
};

module.exports._private = { routeKey, ROUTES };
