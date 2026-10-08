'use strict';

/* The closer look at a piece: price, the price it was, and the discount sit
   apart (owner, 5 Oct 2026: "50% is too close to the slashed price"). The
   discount had no space of its own and read as "5,00050% OFF". */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(ROOT, 'shop.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'assets/shop.js'), 'utf8');

test('the price row is laid out with a gap, not by spaces in the text', () => {
  assert.match(page, /\.look__price\{[^}]*display:flex[^}]*column-gap:12px/);
  assert.doesNotMatch(page, /\.look__price s\{[^}]*margin-left/, 'the gap does the spacing, for all three');
});

test('the discount is a tag, set apart from the struck price', () => {
  assert.match(page, /\.look__price \.item__off\{[^}]*background:var\(--pop\)/);
  assert.match(js, /price\.appendChild\(el\('s', null, rupees\(p\.was\)\)\);\s*price\.appendChild\(el\('span', 'item__off'/);
});
