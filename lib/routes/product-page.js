'use strict';

// GET /products/<handle>  (vercel.json rewrites here with ?handle=)
// Server-renders product.html with real <title>/meta/Open Graph/JSON-LD and
// the product embedded, so the page paints instantly and link previews
// (WhatsApp, Google) show the right image and price. assets/product.js then
// takes over for variants and the bag.

const fs = require('fs');
const path = require('path');
const catalog = require('./paws-catalog');
const { getStoreState } = require('../store-settings');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'product.html');
let templateCache = null;

function template() {
  if (templateCache) return templateCache;
  templateCache = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return templateCache;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// JSON inside <script> must not be able to close the tag.
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/* PUBLIC_SITE_URL is honoured only when it is a real http(s) origin. A pulled
   .env.local can carry the placeholder "[SENSITIVE]" for protected variables,
   and anything that is not a URL would otherwise be printed straight into the
   canonical and og:url tags of every product page. */
function configuredSiteUrl() {
  const raw = String(process.env.PUBLIC_SITE_URL || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function siteUrl(request) {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  const host = (request.headers || {})['x-forwarded-host'] || (request.headers || {}).host || 'pfa-full-website.vercel.app';
  return `https://${host}`;
}

function handleFrom(request) {
  let handle = request.query && request.query.handle;
  if (!handle && request.url) {
    try {
      const url = new URL(request.url, 'https://pfa.local');
      handle = url.searchParams.get('handle') || (url.pathname.match(/\/products\/([^/]+)/) || [])[1];
    } catch (_) {}
  }
  return String(handle || '').replace(/\.html?$/i, '').trim().toLowerCase().slice(0, 200);
}

function headFor(product, pageUrl) {
  const title = `${product.title} | PFA Store`;
  const description = String(product.description || '').replace(/\s+/g, ' ').trim().slice(0, 160) || `${product.title} from the seller on the PFA Store.`;
  const image = product.images && product.images[0] && product.images[0].src;
  const available = (product.variants || []).some((v) => v.available);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description,
    image: (product.images || []).map((i) => i.src).slice(0, 6),
    sku: product.variants && product.variants[0] && product.variants[0].sku || undefined,
    /* No brand. The seller's catalogue puts a manufacturer in the vendor field
       on some products and the shop's own name on others, and this fell back
       to the shop's name when the field was empty, publishing it to search
       engines as the brand of every unbranded product. Structured data that is
       wrong as often as it is right is worse than absent, and Google treats an
       inaccurate brand as a defect rather than a signal. */
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: product.minPrice,
      highPrice: product.maxPrice,
      offerCount: (product.variants || []).length,
      availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: pageUrl
    }
  };
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:title" content="${escapeHtml(product.title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    /* The hero is the largest thing on the page; ask for it before the
       script that places it has even been parsed. Same URL the page builds. */
    image ? `<link rel="preload" as="image" href="${escapeHtml(image.split('?')[0])}?width=720" imagesrcset="${escapeHtml(image.split('?')[0])}?width=720 1x, ${escapeHtml(image.split('?')[0])}?width=1440 2x">` : '',
    `<meta property="product:price:amount" content="${escapeHtml(product.minPrice)}">`,
    `<meta property="product:price:currency" content="INR">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<script type="application/ld+json">${safeJson(jsonLd)}</script>`
  ].join('');
}

function render(html, head, data) {
  const store = data.store || { open: true };
  return html
    .replace(/<!--PFA_HEAD_START-->[\s\S]*?<!--PFA_HEAD_END-->/, head)
    .replace('<!--PFA_DATA-->', `<script>window.PFA_PRODUCT=${safeJson(data.product)};window.PFA_RELATED=${safeJson(data.related)};window.PFA_STORE=${safeJson(store)};</script>`);
}

function sendHtml(response, status, html, cache) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', cache || 'no-store');
  response.end(html);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return sendHtml(response, 405, 'Method not allowed');
  }
  const handle = handleFrom(request);
  let html;
  try {
    html = template();
  } catch (error) {
    console.error('product.html template missing', { message: error && error.message });
    return sendHtml(response, 500, 'Product page template is missing.');
  }
  if (!handle) {
    return sendHtml(response, 404, render(html, '<title>Product not found | PFA Store</title>', { product: null, related: [], store: { open: true } }));
  }

  /* Read the switch before the catalogue: a closed Store owes the visitor a
     straight answer, not a product page it will refuse to sell. */
  let store;
  try {
    store = await getStoreState();
  } catch (_) {
    store = { state: 'veg', open: true, vegetarianOnly: true, label: 'Open' };
  }
  if (!store.open) {
    return sendHtml(response, 503, render(
      html,
      '<title>The Store is closed | PFA Shop</title><meta name="robots" content="noindex">',
      { product: null, related: [], store: { open: false, state: store.state } }
    ));
  }

  let data;
  try {
    data = await catalog.getCatalog();
  } catch (error) {
    // Catalogue is down: ship the page without data; the browser retries via the API.
    console.error('product page: catalogue unavailable', { message: error && error.message });
    return sendHtml(response, 200, render(html, `<title>${escapeHtml(handle.replace(/-/g, ' '))} | PFA Store</title>`, { product: null, related: [], store: { open: true } }));
  }

  /* Exactly the filter /api/paws-catalog applies, so the two can never
     disagree about what is on sale. */
  const listed = catalog._private.applyPolicy(data, store);
  const products = Array.isArray(listed.products) ? listed.products : [];
  const product = products.find((p) => String(p.handle || '').toLowerCase() === handle || String(p.id) === handle);
  if (!product) {
    return sendHtml(response, 404, render(html, `<title>Product not found | PFA Store</title><meta name="robots" content="noindex">`, { product: null, related: [], store: { open: true } }), 'public, s-maxage=60');
  }
  const related = products.filter((p) => p.category === product.category && p.id !== product.id && p.available).slice(0, 8)
    .map((p) => ({ id: p.id, handle: p.handle, title: p.title, animal: p.animal, minPrice: p.minPrice, maxPrice: p.maxPrice, images: (p.images || []).slice(0, 1) }));
  const pageUrl = `${siteUrl(request)}/products/${encodeURIComponent(product.handle)}`;
  return sendHtml(response, 200, render(html, headFor(product, pageUrl), { product, related, store }), 'public, s-maxage=600, stale-while-revalidate=3600');
};

module.exports._private = { handleFrom, headFor, render, safeJson };
