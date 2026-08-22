'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../lib/routes/paws-catalog');
const handler = require('../lib/routes/product-page');

const product = {
  id: '8493756809391', handle: 'himalaya-liv-52-forte', title: 'Himalaya Liv 52 Forte Tablets',
  description: 'Liver support <b>for</b> dogs & cats.', category: 'nutraceutical', categoryLabel: 'Nutraceuticals',
  animal: 'Dog and Cat', vendor: 'Paws & Tails', prescriptionRequired: false, available: true, minPrice: 1650, maxPrice: 1650,
  images: [{ id: '1', src: 'https://cdn.shopify.com/s/files/x.webp', alt: '' }],
  variants: [{ id: '46608189325487', title: '30 Tablets', sku: 'HIM-LIV52', available: true, price: 1650, compareAtPrice: 1700, image: null }]
};
const other = { ...product, id: '2', handle: 'other-liver-tonic', title: 'Other Liver Tonic </script><script>alert(1)</script>' };

function run(url) {
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  const request = { method: 'GET', url, headers: { host: 'pfa.test' }, query: Object.fromEntries(new URL(url, 'https://x').searchParams) };
  return handler(request, response).then(() => response);
}

test.beforeEach(() => { catalog.getCatalog = async () => ({ products: [product, other] }); });

test('a known handle renders a full page with real meta, JSON-LD and the product embedded', async () => {
  const r = await run('/api/index?__route=product-page&handle=himalaya-liv-52-forte');
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /<title>Himalaya Liv 52 Forte Tablets \| PFA Store<\/title>/);
  assert.match(r.body, /property="og:image" content="https:\/\/cdn\.shopify\.com/);
  assert.match(r.body, /rel="canonical" href="https:\/\/pfa\.test\/products\/himalaya-liv-52-forte"/);
  assert.match(r.body, /"@type":"Product"/);
  assert.match(r.body, /window\.PFA_PRODUCT=\{"id":"8493756809391"/);
  assert.match(r.body, /window\.PFA_RELATED=\[\{"id":"2"/);
  assert.match(r.headers['Cache-Control'], /s-maxage=600/);
});

test('embedded JSON cannot break out of the script tag', async () => {
  const r = await run('/api/index?__route=product-page&handle=other-liver-tonic');
  assert.equal(r.statusCode, 200);
  assert.ok(!r.body.includes('</script><script>alert(1)'), 'closing tag escaped');
  assert.match(r.body, /\\u003c\/script/);
});

test('an unknown handle is a 404 page, still styled, not indexed', async () => {
  const r = await run('/api/index?__route=product-page&handle=does-not-exist');
  assert.equal(r.statusCode, 404);
  assert.match(r.body, /noindex/);
  assert.match(r.body, /window\.PFA_PRODUCT=null/);
  assert.match(r.body, /\/assets\/site\.css/);
});

test('the handle is read from the /products/ path and .html is tolerated', () => {
  const { handleFrom } = handler._private;
  assert.equal(handleFrom({ url: '/products/Some-Handle.html', query: {} }), 'some-handle');
  assert.equal(handleFrom({ url: '/api/index?handle=abc', query: { handle: 'abc' } }), 'abc');
});

test('when the catalogue is down the page still ships and lets the browser retry', async () => {
  catalog.getCatalog = async () => { throw new Error('shopify down'); };
  const r = await run('/api/index?__route=product-page&handle=himalaya-liv-52-forte');
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /window\.PFA_PRODUCT=null/);
  assert.match(r.headers['Cache-Control'], /no-store/);
});
