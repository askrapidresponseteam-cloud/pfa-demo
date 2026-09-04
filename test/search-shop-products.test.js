'use strict';

/* Shop products have to be findable from site search.

   The crawler cannot see them: build-index.js reads the static HTML, and
   pfa-shop.html paints its grid from a fetch, so crawling it yields the page
   copy and not one product name. pfa-search.js therefore merges the same
   catalogue snapshot the shop grid uses, which also means search can only ever
   offer what the shop is actually showing.

   The snapshot is optional — build-catalog.js deletes it when Shopify is
   unreachable at deploy time — so every failure shape has to leave search
   working on pages alone rather than throwing. */

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDocument } = require('./_dom-shim.js');

const SEARCH = path.join(__dirname, '..', 'pfa-search.js');

/* The exact shape listView() returns in lib/routes/paws-catalog.js. */
const SNAPSHOT = {
  view: 'list',
  products: [
    { id: 1, handle: 'royal-canin-maxi-adult-dry-dog-food', title: 'Royal Canin Maxi Adult Dry Dog Food', category: 'food', categoryLabel: 'Food', animal: 'dog', productType: 'Dry food', available: true, minPrice: 2100, maxPrice: 5400, variants: [] },
    { id: 2, handle: 'himalaya-erina-ep-tick-flea-shampoo', title: 'Himalaya Erina-EP Tick and Flea Shampoo', category: 'grooming', categoryLabel: 'Grooming', animal: 'dog', productType: 'Shampoo', available: true, minPrice: 245, maxPrice: 245, variants: [] },
    { id: 3, handle: 'whiskas-ocean-fish-adult-cat-food', title: 'Whiskas Ocean Fish Adult Cat Food', category: 'food', categoryLabel: 'Food', animal: 'cat', productType: 'Wet food', available: true, minPrice: 180, maxPrice: 960, variants: [] },
    { id: 4, handle: 'discontinued-chew-toy', title: 'Discontinued Chew Toy', category: 'toys', categoryLabel: 'Toys', animal: 'dog', productType: 'Toy', available: false, minPrice: 100, maxPrice: 100, variants: [] }
  ]
};

function load(snapshot) {
  const doc = createDocument('<html><body></body></html>');
  const win = {
    document: doc,
    location: { search: '', hash: '', pathname: '/index.html', href: 'https://x/' },
    navigator: {}, history: { replaceState() {}, pushState() {} },
    sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    localStorage: null,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    setTimeout: (f) => { if (typeof f === 'function') f(); return 1; },
    clearTimeout() {}, setInterval: () => 1, clearInterval() {}, requestAnimationFrame: () => 1,
    console, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    Promise, Map, Set, Intl, URL, URLSearchParams,
    fetch: (url) => (String(url).includes('catalog-snapshot')
      ? Promise.resolve({ ok: snapshot !== null, json: () => Promise.resolve(snapshot) })
      : Promise.resolve({ ok: false, json: () => Promise.resolve(null) }))
  };
  win.window = win; win.self = win; win.globalThis = win; doc.defaultView = win;
  vm.runInContext(fs.readFileSync(SEARCH, 'utf8'), vm.createContext(win), { filename: SEARCH });
  return win;
}

/* The merge runs off a resolved promise, so let the microtask queue drain. */
const settle = () => new Promise((r) => setImmediate(r));

test('a shopper finds a product by brand, by kind and by animal', async () => {
  const S = load(SNAPSHOT).PFASearch;
  await settle();
  const cases = [
    ['royal canin', '/products/royal-canin-maxi-adult-dry-dog-food'],
    ['tick shampoo', '/products/himalaya-erina-ep-tick-flea-shampoo'],
    ['whiskas', '/products/whiskas-ocean-fish-adult-cat-food'],
    ['cat food', '/products/whiskas-ocean-fish-adult-cat-food']
  ];
  for (const [query, url] of cases) {
    const top = S.search(query, { limit: 3 }).rows[0];
    assert.ok(top, `"${query}" found nothing`);
    assert.equal(top.u, url, `"${query}" led to ${top.u}`);
    assert.equal(top.s, 'Shop');
    assert.equal(top.y, 'product');
  }
});

test('a product the shop is not selling is not offered', async () => {
  const S = load(SNAPSHOT).PFASearch;
  await settle();
  const hit = S.search('discontinued chew toy', { limit: 5 }).rows.find((r) => r.u === '/products/discontinued-chew-toy');
  assert.equal(hit, undefined, 'an unavailable product was searchable');
});

test('products do not crowd out the pages people actually come for', async () => {
  const S = load(SNAPSHOT).PFASearch;
  await settle();
  const expected = {
    'report cruelty': 'Report cruelty',
    'colony caregiver card': 'Apply for a colony caregiver card',
    donate: 'Donate'
  };
  for (const [query, title] of Object.entries(expected)) {
    assert.equal(S.search(query, { limit: 1 }).rows[0].t, title, `"${query}" no longer leads with ${title}`);
  }
});

test('every shape of a missing or broken catalogue leaves search working', async () => {
  for (const snapshot of [null, { view: 'list', products: [] }, { oops: true }, 'not json', { products: null }]) {
    const S = load(snapshot).PFASearch;
    await settle();
    assert.ok(S.search('report cruelty', { limit: 1 }).rows[0], `pages broke with snapshot ${JSON.stringify(snapshot)}`);
    const product = S.search('royal canin', { limit: 1 }).rows[0];
    assert.notEqual(product && product.s, 'Shop', 'a product appeared from a catalogue that has none');
  }
});
