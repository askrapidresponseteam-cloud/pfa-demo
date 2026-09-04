'use strict';

/* The product page is the only page in this tree not served from the site
   root: it lives at /products/<handle>. A relative href that is correct
   everywhere else resolves one level down here, so `pfa-shop.html` becomes
   /products/pfa-shop.html and 404s. Every URL on this page must be
   root-absolute, and it is the build script that guarantees it. */

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');
const { rootify } = require('../scripts/build-product-template.js');

const ROOT = `${__dirname}/..`;
const product = () => fs.readFileSync(`${ROOT}/product.html`, 'utf8');

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|\?)/i;

function relativeUrls(html) {
  const found = [];
  for (const m of html.matchAll(/\b(?:href|src|action)\s*=\s*"([^"]+)"/g)) {
    const url = m[1];
    if (ABSOLUTE.test(url) || url.startsWith("'")) continue;   // ' = a JS expression
    found.push(url);
  }
  for (const m of html.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
    if (!ABSOLUTE.test(m[2])) found.push(`url(${m[2]})`);
  }
  return found;
}

test('no relative URL survives on the product page', () => {
  const found = relativeUrls(product());
  assert.deepEqual(found, [], `these would resolve under /products/: ${found.join(', ')}`);
});

test('the self-hosted font files are reachable from /products/', () => {
  const html = product();
  assert.match(html, /url\("\/fonts\/marcellus-latin\.woff2"\)/,
    'a relative font path silently falls back to the network copy');
  assert.ok(fs.existsSync(`${ROOT}/fonts/marcellus-latin.woff2`));
  assert.ok(fs.existsSync(`${ROOT}/fonts/marcellus-latin-ext.woff2`));
});

test('every page the product page links to actually exists', () => {
  const targets = new Set();
  for (const m of product().matchAll(/\bhref\s*=\s*"(\/[^"']*?)(?:[#?]|")/g)) targets.add(m[1]);
  const missing = [...targets]
    .filter((u) => u !== '/' && !u.startsWith('/products/') && !u.startsWith('/api/'))
    .filter((u) => !fs.existsSync(`${ROOT}${u}`));
  assert.deepEqual(missing, [], `dead links: ${missing.join(', ')}`);
});

test('rootify leaves anything that is already routable alone', () => {
  assert.equal(rootify('<a href="https://x.test/y">'), '<a href="https://x.test/y">');
  assert.equal(rootify('<a href="//x.test/y">'), '<a href="//x.test/y">');
  assert.equal(rootify('<a href="/already">'), '<a href="/already">');
  assert.equal(rootify('<a href="#top">'), '<a href="#top">');
  assert.equal(rootify('<a href="mailto:a@b.co">'), '<a href="mailto:a@b.co">');
  assert.equal(rootify('<img src="data:image/png;base64,AAA">'), '<img src="data:image/png;base64,AAA">');
  assert.equal(rootify('<a href="laws.html">'), '<a href="/laws.html">');
  assert.equal(rootify('url("fonts/m.woff2")'), 'url("/fonts/m.woff2")');
});

test('a missing product hands over to the shop, not to the site index', () => {
  const html = product();
  /* Product rows were taken out of the site search index when the catalogue
     went live (§6), so /search.html cannot answer a product query. The shop
     searches live stock. */
  assert.match(html, /href="\/pfa-shop\.html\?q='/, 'the fallback must reach live stock');
  assert.ok(!/href="\/search\.html\?q='/.test(html), 'the site index no longer holds products');
});

test('the shop accepts the query the product page hands it', () => {
  const shop = fs.readFileSync(`${ROOT}/pfa-shop.html`, 'utf8');
  assert.match(shop, /new URLSearchParams\(location\.search\)/);
  assert.match(shop, /params\.get\('q'\)/);
  assert.match(shop, /\$\('#q'\)\.value = q/, 'and shows it in the box');
});

test('the shop accepts the aisle the breadcrumb hands it', () => {
  /* The last breadcrumb on a product page used to be plain text that looked
     like a link. It now opens the shop on that aisle, so the shop has to read
     the parameter and map the seller's category onto its own chips. */
  const product = fs.readFileSync(`${ROOT}/product.html`, 'utf8');
  assert.match(product, /pfa-shop\.html\?cat=/, 'the breadcrumb no longer links anywhere');

  const shop = fs.readFileSync(`${ROOT}/pfa-shop.html`, 'utf8');
  assert.match(shop, /params\.get\('cat'\)/, 'the shop ignores the parameter it is sent');
  assert.match(shop, /CHIPS\.indexOf\(askedCat\)/,
    'an unknown category must be refused rather than emptying the grid');
});
