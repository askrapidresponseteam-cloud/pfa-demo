'use strict';
/* Pulls the pure logic out of pfa-shop.html and runs it against a mock
   /api/paws-catalog response, to check the shape this page sends to
   /api/pfa-orders before anything is deployed. */

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

const html = fs.readFileSync(`${__dirname}/../pfa-shop.html`, 'utf8');
const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const src = blocks.reduce((a, b) => (a.length > b.length ? a : b));

/* Lift the catalogue functions out of the IIFE without a browser. */
function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name} not found`);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}
const maps = src.slice(src.indexOf('var CAT_MAP'), src.indexOf('function flatten'));
const sandbox = new Function(`${maps}\n${extract('flatten')}\nreturn { flatten: flatten, CAT_MAP: CAT_MAP, CAT_ORDER: CAT_ORDER, shelfRank: shelfRank };`)();

const CATALOG = {
  products: [
    {
      handle: 'veg-kibble', title: 'Vegetarian kibble', category: 'food', categoryLabel: 'For your animal',
      animal: 'Dog', productType: 'Dry food', available: true, prescriptionRequired: false,
      images: [{ src: 'https://cdn.example/kibble.jpg' }],
      variants: [
        { id: '40123456789012', title: '3 kg', available: true, price: 899, image: null },
        { id: '40123456789013', title: '10 kg', available: true, price: 2450, image: null },
        { id: '40123456789014', title: '20 kg', available: false, price: 4600, image: null }
      ]
    },
    {
      handle: 'tick-spot-on', title: 'Tick spot-on', category: 'medicine', categoryLabel: 'The Pharmacy',
      animal: 'Dog and Cat', productType: 'Topical', available: true, prescriptionRequired: true,
      images: [], variants: [{ id: '40999888777666', title: 'Default Title', available: true, price: 540, image: null }]
    },
    {
      handle: 'sold-out-bed', title: 'Bolster bed', category: 'accessories', animal: 'All animals',
      available: false, variants: [{ id: '40111222333444', title: 'M', available: true, price: 2200 }]
    },
    {
      handle: 'bad-variant', title: 'Broken', category: 'toys', animal: 'Cat', available: true,
      variants: [{ id: 'gid://shopify/ProductVariant/123', title: 'x', available: true, price: 200 }]
    }
  ]
};

test('one tile per product, keyed by a real Shopify variant id', () => {
  /* The same medicine in two strengths is one thing to buy, not two listings.
     The id still has to be a real variant id, because that is what checkout
     is built from. */
  const rows = sandbox.flatten(CATALOG);
  assert.deepEqual(rows.map((r) => r.handle), ['veg-kibble', 'tick-spot-on'],
    'a product appeared twice, or one went missing');
  rows.forEach((r) => assert.match(r.id, /^\d{8,20}$/, 'id must satisfy the /api/pfa-orders line check'));
});

test('a product with a choice shows a price range and sends the person to pick', () => {
  const rows = sandbox.flatten(CATALOG);
  const kibble = rows.find((r) => r.handle === 'veg-kibble');
  assert.equal(kibble.pick, true, 'two sizes must not be added blind from the grid');
  assert.equal(kibble.p, 899, 'the tile should lead with the lowest price');
  assert.equal(kibble.pFrom, true, 'the price should read as a starting point');
  assert.equal(kibble.id, '40123456789012', 'the id should be the variant that price belongs to');
  assert.match(kibble.s, /3 kg/); assert.match(kibble.s, /10 kg/);
  assert.ok(!/20 kg/.test(kibble.s), 'the sold-out size should not be offered');

  const spot = rows.find((r) => r.handle === 'tick-spot-on');
  assert.equal(spot.pick, false, 'a single-variant product keeps its Add button');
  assert.ok(!spot.pFrom, 'one price is not a range');
});

test('unavailable products and variants are left out', () => {
  const rows = sandbox.flatten(CATALOG);
  const ids = rows.map((r) => r.id);
  assert.ok(!ids.includes('40123456789014'), 'sold-out variant');
  assert.ok(!rows.some((r) => r.handle === 'sold-out-bed'), 'unavailable product');
});

test('a non-numeric variant id is dropped rather than sent to checkout', () => {
  const ids = sandbox.flatten(CATALOG).map((r) => r.id);
  assert.ok(!ids.some((id) => id.includes('gid://')));
});

test("the seller's six categories collapse onto this page's five chips", () => {
  const rows = sandbox.flatten(CATALOG);
  assert.equal(rows.find((r) => r.id === '40123456789012').c, 'food');
  assert.equal(rows.find((r) => r.id === '40999888777666').c, 'health');
  assert.deepEqual(Object.keys(sandbox.CAT_MAP).sort(),
    ['accessories', 'food', 'grooming', 'medicine', 'nutraceutical', 'toys']);
});

test('"Dog and Cat" is shown under both pet filters, not hidden from each', () => {
  const rows = sandbox.flatten(CATALOG);
  assert.equal(rows.find((r) => r.id === '40999888777666').pet, 'all');
  assert.equal(rows.find((r) => r.id === '40123456789012').pet, 'dog');
});

test('a prescription product is labelled as one', () => {
  const rx = sandbox.flatten(CATALOG).find((r) => r.id === '40999888777666');
  assert.equal(rx.rx, true);
  assert.equal(rx.tag, 'Prescription');
});

test('"Default Title" is not shown to the shopper as a variant name', () => {
  const row = sandbox.flatten(CATALOG).find((r) => r.id === '40999888777666');
  assert.ok(!/Default/.test(row.s), `variant label leaked: ${row.s}`);
});

test('the product photo is carried through for the tile', () => {
  const row = sandbox.flatten(CATALOG).find((r) => r.id === '40123456789012');
  assert.equal(row.img, 'https://cdn.example/kibble.jpg');
});

test('the page never links to the seller domain, only to /products/<handle>', () => {
  assert.ok(/\/products\/' \+ encodeURIComponent\(x\.handle\)/.test(src), 'expected an on-site product link');
  assert.ok(!/pawsandtails/i.test(html), 'seller domain must not appear in the page');
});

test('store money never goes near the CCAvenue endpoint', () => {
  assert.ok(!/payment\/create/.test(html), 'the store must post to /api/pfa-orders, not the CCAvenue layer');
  assert.ok(/\/api\/pfa-orders/.test(src));
});

/* ---- the Store switch, as the page sees it ---- */

test('the page carries no kits: the vendor does not sell them', () => {
  assert.ok(!/data-kit|paintKits|buildKits|addKit/.test(src), 'kit logic must be gone');
  assert.ok(!/class="kits?"|id="kits"|kitGrid/.test(html), 'kit markup must be gone');
  assert.ok(!/Start with a kit|Tap one kit/.test(html), 'kit copy must be gone');
});

test('a closed Store is its own state, not an empty shelf', () => {
  assert.ok(/catalogState = 'closed'/.test(src));
  assert.ok(/The Store is closed at the moment/.test(src));
});

test('a closed Store hides the filters and the bag bar', () => {
  assert.ok(/filters\.hidden = \(catalogState === 'closed'\)/.test(src),
    'filtering nothing is worse than no filters');
  assert.ok(/catalogState !== 'closed'/.test(src), 'the bag bar must not invite a refused checkout');
});

test('the page reads the switch from the catalogue response', () => {
  assert.ok(/storeState = data\.store/.test(src));
  assert.ok(/storeState\.open === false/.test(src));
});

/* ---- catalogue presentation ---- */

test('product photographs are shown whole, never cropped', () => {
  /* cover turned a bottle into an abstract colour field. A shopper has to be
     able to see what they are buying. */
  assert.ok(/\.card__tile img\{[^}]*object-fit:contain/.test(html),
    'card tiles must use object-fit:contain');
  assert.ok(!/\.card__tile img\{[^}]*object-fit:cover/.test(html));
});

test('the grid adapts to the viewport instead of forcing four columns', () => {
  assert.ok(/\.grid\{[^}]*grid-template-columns:repeat\(auto-fill,minmax\(/.test(html),
    'a fixed column count gave 280px cards on a laptop and worse on a wide screen');
  assert.ok(!/\.grid\{[^}]*repeat\(4,1fr\)/.test(html));
});

test('images are requested at the size they are drawn, not full resolution', () => {
  assert.ok(/function cdn\(src, w\)/.test(src));
  assert.ok(/\?width='/.test(src) || /\?width=/.test(src), 'a width parameter must be added');
  assert.ok(/srcset=/.test(src), 'a 2x source keeps it sharp on a retina screen');
  /* Only the vendor's own CDN understands the parameter. */
  assert.ok(/cdn\\\.shopify\\\.com|cdn\.shopify\.com/.test(src));
});

test('the grid grows a page at a time rather than mounting the whole catalogue', () => {
  assert.ok(/var PAGE = \d+, shownCount = PAGE/.test(src));
  assert.ok(/shownCount \+= PAGE/.test(src));
  assert.ok(!/expanded = true/.test(src), 'the old show-everything button must be gone');
});

test('a filter change resets the page count', () => {
  const resets = (src.match(/shownCount = PAGE/g) || []).length;
  assert.ok(resets >= 3, 'declaration plus a reset on both the chips and the search box');
});

/* ---- the order the shelf is laid out in ---- */

/* One purchasable variant each, so nothing but the category can decide where
   a product lands. Deliberately shuffled, and with two in each named group,
   so a passing order cannot be the one it was written in. */
const MIXED = {
  products: ['medicine', 'toys', 'nutraceutical', 'food', 'medicine', 'grooming',
    'nutraceutical', 'food', 'accessories'].map((category, i) => ({
    handle: `${category}-${i}`, title: `${category} ${i}`, category,
    categoryLabel: category, animal: 'Dog', productType: 'x',
    available: true, prescriptionRequired: false, images: [],
    variants: [{ id: `4012345678${900 + i}`, title: 'Default Title', available: true, price: 100 + i, image: null }]
  }))
};
const shelf = (data) => sandbox.flatten(data).map((r) => r.c0);

test('the shelf leads with food, then the nutraceuticals, then the pharmacy', () => {
  /* What feeds an animal before what medicates one. The seller sends these
     interleaved, so the order is this page's, not theirs. */
  assert.deepEqual(shelf(MIXED).slice(0, 6),
    ['food', 'food', 'nutraceutical', 'nutraceutical', 'medicine', 'medicine']);
});

test('a category that is not one of the three follows, rather than breaking the run', () => {
  const rest = shelf(MIXED).slice(6);
  assert.deepEqual(rest, ['toys', 'grooming', 'accessories'],
    'the rest keep the order they arrived in');
  assert.ok(!rest.some((c) => sandbox.CAT_ORDER.includes(c)), 'nothing named leaked past the groups');
});

test('a category the seller invents tomorrow lands after the named three, not in the middle', () => {
  /* shelfRank must answer for a category this page has never heard of, or a
     new aisle at Example Seller would scatter itself through the pharmacy. */
  assert.equal(sandbox.shelfRank('wearables'), sandbox.CAT_ORDER.length);
  assert.equal(sandbox.shelfRank(''), sandbox.CAT_ORDER.length);
  assert.equal(sandbox.shelfRank(undefined), sandbox.CAT_ORDER.length);
});

test("inside a group the seller's own order is kept", () => {
  /* The grouping is a stable sort, not a re-sort: two medicines stay in the
     order Shopify sent them, so the grid does not reshuffle between repaints. */
  const meds = sandbox.flatten(MIXED).filter((r) => r.c0 === 'medicine').map((r) => r.handle);
  assert.deepEqual(meds, ['medicine-0', 'medicine-4']);
});

test('the ordering is by the seller\'s category, which the chip cannot express', () => {
  /* Nutraceuticals and medicines are both Health on this page, so `c` alone
     could not tell them apart and `c0` has to be carried alongside it. */
  const rows = sandbox.flatten(MIXED);
  const nutraceutical = rows.find((r) => r.c0 === 'nutraceutical');
  const medicine = rows.find((r) => r.c0 === 'medicine');
  assert.equal(nutraceutical.c, 'health');
  assert.equal(medicine.c, 'health');
  assert.ok(rows.indexOf(nutraceutical) < rows.indexOf(medicine));
});

test('"Featured" is this order, so the dropdown does not have to re-derive it', () => {
  /* SORTS.default is null on purpose: it means "the order of P", and P is what
     flatten returned. See test/shop-sort.test.js for the other four. */
  assert.match(src, /'default': null/);
});
