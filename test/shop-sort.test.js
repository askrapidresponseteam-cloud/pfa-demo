'use strict';

/* The shop's sort dropdown, exercised by lifting the real SORTS table and
   visible() out of the page and running them, rather than asserting that the
   markup contains the right strings. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
const js = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).reduce((a, b) => (a.length > b.length ? a : b));

const CATALOGUE = [
  { n: 'Zinc Shampoo', p: 450, pet: 'all', c: 'grooming', s: '' },
  { n: 'Alcoat-Z', p: 450, pet: 'dog', c: 'health', s: '' },
  { n: 'Deworm 10mg', p: 260, pet: 'all', c: 'health', s: '' },
  { n: 'beta carotene', p: 1890, pet: 'cat', c: 'food', s: '' },
  { n: 'Ceramic Bowl', p: 620, pet: 'all', c: 'home', s: '' }
];

function run(state) {
  const sorts = js.slice(js.indexOf('var SORTS = {'), js.indexOf('function visible()'));
  const visible = js.slice(js.indexOf('function visible()'), js.indexOf('function control('));
  const fn = new Function('P', 'S', `
    ${sorts}
    var pet = S.pet, cat = S.cat, q = S.q, sort = S.sort;
    var shelf = S.shelf || '', SHELVES = S.SHELVES || [], brand = S.brand || '';
    function onShelf(z, x){ return z.f ? z.f(x) : z.m.test(x.n + ' ' + x.s); }
    ${visible}
    return visible();`);
  return fn(CATALOGUE, Object.assign({ pet: 'all', cat: 'all', q: '', sort: 'default' }, state));
}
const names = (state) => run(state).map((x) => x.n);

test('the dropdown offers the orders it says it does', () => {
  for (const value of ['default', 'saving', 'price-asc', 'price-desc', 'name-asc', 'name-desc']) {
    assert.match(html, new RegExp(`value="${value}"`), `missing option ${value}`);
  }
  assert.match(html, /Price: low to high/);
  assert.match(html, /Price: high to low/);
});

test('price sorts low to high and high to low', () => {
  assert.deepEqual(run({ sort: 'price-asc' }).map((x) => x.p), [260, 450, 450, 620, 1890]);
  assert.deepEqual(run({ sort: 'price-desc' }).map((x) => x.p), [1890, 620, 450, 450, 260]);
});

test('name sorts ignore case, so a lowercase title is not exiled to the end', () => {
  assert.deepEqual(names({ sort: 'name-asc' }),
    ['Alcoat-Z', 'beta carotene', 'Ceramic Bowl', 'Deworm 10mg', 'Zinc Shampoo']);
  assert.deepEqual(names({ sort: 'name-desc' }), names({ sort: 'name-asc' }).reverse());
});

test('"Featured" is the order of P, which visible() leaves alone', () => {
  /* The shelf's own grouping, food then the nutraceuticals then the pharmacy,
     is applied once by flatten() when the catalogue arrives, so P reaches this
     function already in it and nothing here re-derives it. The grouping itself
     is covered in test/shop-catalog.test.js. */
  assert.deepEqual(names({ sort: 'default' }), CATALOGUE.map((x) => x.n));
});

test('equal prices keep the order of P rather than reshuffling', () => {
  /* Two products at 450. Without a tie-break the grid can reorder between
     repaints for no reason the shopper can see. */
  const tied = names({ sort: 'price-asc' }).slice(1, 3);
  assert.deepEqual(tied, ['Zinc Shampoo', 'Alcoat-Z'], 'ties must be stable');
});

test('sorting does not mutate the catalogue it was given', () => {
  run({ sort: 'price-desc' });
  assert.equal(CATALOGUE[0].n, 'Zinc Shampoo', 'P is the shelf order and must survive');
});

test('sorting composes with the filters, it does not replace them', () => {
  const health = names({ cat: 'health', sort: 'price-asc' });
  assert.deepEqual(health, ['Deworm 10mg', 'Alcoat-Z']);
  const searched = names({ q: 'shampoo', sort: 'price-desc' });
  assert.deepEqual(searched, ['Zinc Shampoo']);
});

test('an unknown sort value falls back rather than throwing', () => {
  assert.match(html, /SORTS\.hasOwnProperty\(e\.target\.value\)/,
    'a value that is not a known sort must fall back to the default');
});

test('changing the order restarts paging', () => {
  /* Otherwise "show 24 more" keeps a page count from a different order. */
  const handler = html.slice(html.indexOf("$('#sort').addEventListener"));
  assert.match(handler.slice(0, 400), /shownCount = PAGE/);
});

test('the sort control and the count sit together at the inset edge', () => {
  assert.match(html, /\.filters__end\{[^}]*margin-left:auto/);
  assert.match(html, /<div class="filters__end">/);
  assert.match(html, /aria-label="Sort products"/, 'the select must be labelled');
});
