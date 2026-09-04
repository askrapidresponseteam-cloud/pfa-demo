'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../lib/routes/paws-catalog.js')._private;

function product(overrides) {
  return Object.assign({
    id: 1,
    title: 'Sample',
    handle: 'sample',
    vendor: 'Example Seller',
    product_type: '',
    tags: [],
    body_html: '',
    images: [],
    variants: [{ id: 11, title: 'Default Title', price: '100.00', compare_at_price: null, available: true }]
  }, overrides || {});
}

test('keeps explicitly vegetarian food', () => {
  const normalized = catalog.normalizeProduct(product({
    title: '100% Vegetarian Adult Dog Food',
    body_html: '<p>Complete plant based nutrition.</p>'
  }));
  assert.ok(normalized);
  assert.equal(normalized.category, 'food');
  assert.equal(normalized.vegetarianFood, true);
});

/* The guarantee is unchanged - non-vegetarian food is never listed while the
   Store is set to vegetarian only - but it is now enforced by the Store switch
   in applyPolicy() rather than inside normalizeProduct(), so that flipping the
   switch does not have to wait for the ten-minute catalogue cache. These tests
   check the guarantee where it now lives. */
test('non-vegetarian food is marked as such rather than silently dropped', () => {
  const normalized = catalog.normalizeProduct(product({
    title: 'Chicken and Egg Adult Dog Food'
  }));
  assert.ok(normalized);
  assert.equal(normalized.vegetarianOk, false);
  assert.equal(normalized.isFood, true);
});

function catalogOf(products) {
  return { products, collections: [], stats: {}, source: {} };
}

test('vegetarian-only hides non-vegetarian food and keeps everything else', () => {
  const veg = catalog.normalizeProduct(product({ id: 1, title: '100% Vegetarian Adult Dog Food' }));
  const meat = catalog.normalizeProduct(product({ id: 2, title: 'Chicken and Egg Adult Dog Food' }));
  const harness = catalog.normalizeProduct(product({ id: 3, title: 'Adjustable Dog Harness' }));

  const out = catalog.applyPolicy(catalogOf([veg, meat, harness]), {
    state: 'veg', open: true, vegetarianOnly: true, label: 'Open', changedAt: null
  });
  const ids = out.products.map((p) => p.id);
  assert.ok(!ids.includes('2'), 'non-vegetarian food must not be listed');
  assert.deepEqual(ids.sort(), ['1', '3']);
  assert.equal(out.stats.hiddenByPolicy, 1);
  assert.equal(out.store.vegetarianOnly, true);
});

test('everything lists the non-vegetarian food too', () => {
  const veg = catalog.normalizeProduct(product({ id: 1, title: '100% Vegetarian Adult Dog Food' }));
  const meat = catalog.normalizeProduct(product({ id: 2, title: 'Chicken and Egg Adult Dog Food' }));
  const out = catalog.applyPolicy(catalogOf([veg, meat]), {
    state: 'all', open: true, vegetarianOnly: false, label: 'Open', changedAt: null
  });
  assert.equal(out.products.length, 2);
  assert.equal(out.stats.hiddenByPolicy, 0);
});

test('closed sends no products, no collections and no category counts', () => {
  const veg = catalog.normalizeProduct(product({ id: 1, title: '100% Vegetarian Adult Dog Food' }));
  const out = catalog.applyPolicy(
    { products: [veg], collections: [{ id: 'c1' }], stats: {}, source: {} },
    { state: 'off', open: false, label: 'Closed', changedAt: null }
  );
  assert.deepEqual(out.products, []);
  assert.deepEqual(out.collections, []);
  assert.equal(out.store.open, false);
  assert.ok(out.categories.every((c) => c.count === 0));
});

test('the internal vegetarian verdict is never sent to the browser', () => {
  const veg = catalog.normalizeProduct(product({ id: 1, title: '100% Vegetarian Adult Dog Food' }));
  const out = catalog.applyPolicy(catalogOf([veg]), {
    state: 'veg', open: true, vegetarianOnly: true, label: 'Open', changedAt: null
  });
  assert.equal('vegetarianOk' in out.products[0], false);
  assert.equal('isFood' in out.products[0], false);
});

test('keeps non-food accessories', () => {
  const normalized = catalog.normalizeProduct(product({
    title: 'Adjustable Dog Harness'
  }));
  assert.ok(normalized);
  assert.equal(normalized.category, 'accessories');
});

test('normalizes variant prices and images', () => {
  const normalized = catalog.normalizeProduct(product({
    title: 'Gentle Pet Shampoo',
    images: [{ id: 2, src: 'https://cdn.shopify.com/image.png', width: 800, height: 800 }],
    variants: [
      { id: 21, title: '200 ml', price: '299.00', compare_at_price: '349.00', available: true },
      { id: 22, title: '500 ml', price: '499.00', compare_at_price: '599.00', available: true }
    ]
  }));
  assert.equal(normalized.category, 'grooming');
  assert.equal(normalized.minPrice, 299);
  assert.equal(normalized.maxPrice, 499);
  assert.equal(normalized.images.length, 1);
});

/* Both of these are real products from the Example Seller catalogue, and both
   were filed under Grooming because "shampoo" outranked every medicinal
   signal. A shopper browsing Grooming was being shown antiparasitics. */
test('a medicated shampoo is filed as medicine, not grooming', () => {
  const cases = [
    ['Amitraz and Ivermectin Shampoo Mectin-AZ', 'FOR VETERINARY USE ONLY'],
    ['Piroctone Olamine Foam Base Shampoo Radiate', 'FOR VETERINARY USE ONLY'],
    ['Ketoconazole Medicated Shampoo', ''],
    ['Chlorhexidine Antiseptic Wash', '']
  ];
  for (const [title, body] of cases) {
    const normalized = catalog.normalizeProduct(product({ title, body_html: body }));
    assert.equal(normalized.category, 'medicine', `${title} should be medicine`);
  }
});

test('an ordinary grooming product is still grooming', () => {
  for (const title of ['Oatmeal and Aloe Pet Shampoo', 'BeautiFur Leave In Fur Conditioner', 'Slicker Brush']) {
    const normalized = catalog.normalizeProduct(product({ title }));
    assert.equal(normalized.category, 'grooming', `${title} should stay grooming`);
  }
});

test('the medicinal signal does not swallow food or accessories', () => {
  assert.equal(catalog.normalizeProduct(product({ title: '100% Vegetarian Adult Dog Food' })).category, 'food');
  assert.equal(catalog.normalizeProduct(product({ title: 'Adjustable Dog Harness' })).category, 'accessories');
});

/* applyPolicy hides on an explicit false, so that verdict has to be there. */
test('every normalised product carries a boolean vegetarian verdict', () => {
  for (const title of ['100% Vegetarian Adult Dog Food', 'Chicken and Egg Adult Dog Food',
                       'Adjustable Dog Harness', 'Amitraz and Ivermectin Shampoo']) {
    const normalized = catalog.normalizeProduct(product({ title }));
    assert.equal(typeof normalized.vegetarianOk, 'boolean', `${title} must carry a verdict`);
    assert.equal(typeof normalized.isFood, 'boolean');
  }
});

test('the product description keeps its shape and drops what the page already shows', () => {
  const { descriptionBlocks } = require('../lib/routes/paws-catalog.js');
  const html = '<p><strong>Prescription Required</strong></p><h3>Acme Wormer for Dogs</h3>'
    + '<p>Acme Wormer for Dogs is a broad-spectrum dewormer. It treats roundworm and tapeworm in one dose. Give with food. Safe from eight weeks. Made in India by Acme.</p>'
    + '<h3>Key benefits</h3><ul><li>One dose</li><li>Palatable</li></ul>';
  const blocks = descriptionBlocks(html, 'Acme Wormer for Dogs');
  assert.equal(blocks[0].type, 'p');
  assert.match(blocks[0].text, /^Acme Wormer for Dogs is a broad-spectrum dewormer\./, 'the repeated title and Rx line are gone; the summary leads');
  assert.ok(blocks.some((b) => b.type === 'heading' && b.text === 'Key benefits'));
  const list = blocks.find((b) => b.type === 'list');
  assert.deepEqual(list.items, ['One dose', 'Palatable']);
  assert.deepEqual(descriptionBlocks('', 'x'), []);
});
