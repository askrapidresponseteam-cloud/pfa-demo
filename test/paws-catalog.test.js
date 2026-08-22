'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../api/paws-catalog.js')._private;

function product(overrides) {
  return Object.assign({
    id: 1,
    title: 'Sample',
    handle: 'sample',
    vendor: 'Paws & Tails',
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

test('rejects non-vegetarian food in strict mode', () => {
  const normalized = catalog.normalizeProduct(product({
    title: 'Chicken and Egg Adult Dog Food'
  }));
  assert.equal(normalized, null);
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
