'use strict';
/* The admin Store switch shows "N items listed" under each choice, and the
   shop header shows "N items". They must be the same N.

   They were not. The shop moved to one tile per product in v1.170 and the
   server kept counting one line per purchasable variant, so the panel showed
   1167 where the shop showed 843 - while promising, on the same screen, that
   "the count under each choice is what a shopper would see".

   The old version of this file could not catch that: it checked that both
   sides applied the same three exclusions, which they did, and never that they
   counted the same unit. So it now runs the shop's own flatten() and the
   server's counter over one catalogue and compares the two answers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { shopperTiles } = require('../lib/routes/paws-catalog.js');

const ROOT = path.join(__dirname, '..');

/* The real flatten(), lifted out of the page. */
function shopFlatten() {
  const html = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  const src = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).reduce((a, b) => (a.length > b.length ? a : b));
  const start = src.indexOf('function flatten(');
  assert.ok(start > -1, 'flatten not found in pfa-shop.html');
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }
  const maps = src.slice(src.indexOf('var CAT_MAP'), start);
  return new Function(`${maps}\n${src.slice(start, end)}\nreturn flatten;`)();
}

const product = (id, variants, available = true) => ({
  handle: `p-${id}`, title: `Product ${id}`, category: 'medicine', categoryLabel: 'The Pharmacy',
  animal: 'Dog', productType: 'x', available, prescriptionRequired: false, images: [], variants
});
const variant = (id, price, available = true) => ({
  id: String(id), title: `v${id}`, available, price, image: null
});

/* One tile each, but nine purchasable variants between them: exactly the shape
   that made the two numbers disagree. Plus every exclusion, so a counter that
   drops the filters cannot pass either. */
const CATALOG = {
  products: [
    product(1, [variant('40000000001', 100), variant('40000000002', 200), variant('40000000003', 300)]),
    product(2, [variant('40000000004', 150), variant('40000000005', 250)]),
    product(3, [variant('40000000006', 400)]),
    product(4, [variant('40000000007', 100), variant('40000000008', 100), variant('40000000009', 100)]),
    /* excluded: the product itself is unavailable */
    product(5, [variant('40000000010', 500)], false),
    /* excluded: no purchasable variant left between them */
    product(6, [variant('40000000011', 600, false), variant('not-a-shopify-id', 700), variant('40000000012', 0)])
  ]
};

test('the panel counts what the shop puts on the shelf, in the same unit', () => {
  const flatten = shopFlatten();
  const tiles = flatten(CATALOG).length;
  assert.equal(tiles, 4, 'four products have something purchasable on them');
  assert.equal(shopperTiles(CATALOG.products), tiles,
    'the number under the switch must be the number in the shop header');
});

test('a product with several sizes is one thing to buy, not several', () => {
  /* The fault that was shipping: nine purchasable variants across four tiles.
     A counter working in variants returns 9 here and the shop shows 4. */
  const lines = CATALOG.products
    .filter((p) => p.available)
    .reduce((n, p) => n + p.variants.filter((v) => v.available && /^\d{8,20}$/.test(v.id) && v.price > 0).length, 0);
  assert.equal(lines, 9, 'sanity: the fixture really does have more variants than tiles');
  assert.notEqual(shopperTiles(CATALOG.products), lines, 'the count must not be per variant');
});

test('both sides drop the same things', () => {
  const flatten = shopFlatten();
  const kept = flatten(CATALOG).map((x) => x.handle).sort();
  assert.deepEqual(kept, ['p-1', 'p-2', 'p-3', 'p-4'],
    'an unavailable product, and one with nothing purchasable, are both off the shelf');
  assert.equal(shopperTiles([]), 0);
  assert.equal(shopperTiles(undefined), 0, 'a missing catalogue counts as nothing, not a throw');
});
