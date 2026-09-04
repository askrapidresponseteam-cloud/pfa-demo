'use strict';

// Single Vercel function that serves every /api/* route (see vercel.json rewrites).
// Vercel Hobby allows 12 Serverless Functions per deployment; the 23 handlers
// now live in lib/routes and are required lazily, so only the module for the
// requested route is loaded per invocation. Public URLs are unchanged.

const ROUTES = {
  'admin/attachment': './admin/attachment.js',
  'admin/cards': './admin/cards.js',
  'admin/case': './admin/case.js',
  'admin/metrics': './admin/metrics.js',
  'admin/people': './admin/people.js',
  'admin/records': './admin/records.js',
  'admin/staff': './admin/staff.js',
  'admin/store': './admin/store.js',
  'admin/submission-status': './admin/submission-status.js',
  'caregiver/admin-shipment': './caregiver/admin-shipment.js',
  'caregiver/apply': './caregiver/apply.js',
  'caregiver/card': './caregiver/card.js',
  'caregiver/documents': './caregiver/documents.js',
  'caregiver/email-worker': './caregiver/email-worker.js',
  'caregiver/order': './caregiver/order.js',
  'caregiver/replace': './caregiver/replace.js',
  'location-lookup': './location-lookup.js',
  'paws-catalog': './paws-catalog.js',
  'payment/create': './payment/create.js',
  'payment/health': './payment/health.js',
  'payment/response': './payment/response.js',
  'pfa-order-status': './pfa-order-status.js',
  'pfa-orders': './pfa-orders.js',
  'pfa-shipping-rates': './pfa-shipping-rates.js',
  'pfa-pay-start': './pfa-pay-start.js',
  'pfa-pay-confirm': './pfa-pay-confirm.js',
  'pfa-store-reconcile': './pfa-store-reconcile.js',
  'product-page': './product-page.js',
  'pfa-submissions': './pfa-submissions.js',
  'visits': './visits.js',
  'search-popular': './search-popular.js',
  'photo/remove-background': './photo/remove-background.js',
  'verify-card': './verify-card.js',
  'webhooks/order-created': './webhooks/shopify.js',
  'webhooks/order-paid': './webhooks/shopify.js',
  'webhooks/order-fulfilled': './webhooks/shopify.js',
  'webhooks/fulfillment-updated': './webhooks/shopify.js',
  'webhooks/order-cancelled': './webhooks/shopify.js',
  'webhooks/refund-created': './webhooks/shopify.js',
  'webhooks/razorpay': './webhooks/razorpay.js'
};

// Static requires so Vercel's file tracer bundles every handler.
const LOADERS = {
  'admin/attachment': () => require('../lib/routes/admin/attachment.js'),
  'admin/cards': () => require('../lib/routes/admin/cards.js'),
  'admin/case': () => require('../lib/routes/admin/case.js'),
  'admin/metrics': () => require('../lib/routes/admin/metrics.js'),
  'admin/people': () => require('../lib/routes/admin/people.js'),
  'admin/records': () => require('../lib/routes/admin/records.js'),
  'admin/staff': () => require('../lib/routes/admin/staff.js'),
  'admin/store': () => require('../lib/routes/admin/store.js'),
  'admin/submission-status': () => require('../lib/routes/admin/submission-status.js'),
  'caregiver/admin-shipment': () => require('../lib/routes/caregiver/admin-shipment.js'),
  'caregiver/apply': () => require('../lib/routes/caregiver/apply.js'),
  'caregiver/card': () => require('../lib/routes/caregiver/card.js'),
  'caregiver/documents': () => require('../lib/routes/caregiver/documents.js'),
  'caregiver/email-worker': () => require('../lib/routes/caregiver/email-worker.js'),
  'caregiver/order': () => require('../lib/routes/caregiver/order.js'),
  'caregiver/replace': () => require('../lib/routes/caregiver/replace.js'),
  'location-lookup': () => require('../lib/routes/location-lookup.js'),
  'paws-catalog': () => require('../lib/routes/paws-catalog.js'),
  'payment/create': () => require('../lib/routes/payment/create.js'),
  'payment/health': () => require('../lib/routes/payment/health.js'),
  'payment/response': () => require('../lib/routes/payment/response.js'),
  'pfa-order-status': () => require('../lib/routes/pfa-order-status.js'),
  'pfa-orders': () => require('../lib/routes/pfa-orders.js'),
  'pfa-shipping-rates': () => require('../lib/routes/pfa-shipping-rates.js'),
  'pfa-pay-start': () => require('../lib/routes/pfa-pay-start.js'),
  'pfa-pay-confirm': () => require('../lib/routes/pfa-pay-confirm.js'),
  'pfa-store-reconcile': () => require('../lib/routes/pfa-store-reconcile.js'),
  'product-page': () => require('../lib/routes/product-page.js'),
  'pfa-submissions': () => require('../lib/routes/pfa-submissions.js'),
  'visits': () => require('../lib/routes/visits.js'),
  'search-popular': () => require('../lib/routes/search-popular.js'),
  'photo/remove-background': () => require('../lib/routes/photo/remove-background.js'),
  'verify-card': () => require('../lib/routes/verify-card.js'),
  'webhooks/order-created': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/order-paid': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/order-fulfilled': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/fulfillment-updated': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/order-cancelled': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/refund-created': () => require('../lib/routes/webhooks/shopify.js'),
  'webhooks/razorpay': () => require('../lib/routes/webhooks/razorpay.js')
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
