'use strict';

/* product.html shares its shell with pfa-shop.html. It is generated, not
   hand-kept, so the only way it can go stale is if someone edits the shop and
   forgets to run the rebuild. That is what this catches. */

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');
const { build, rootify, sectionLink } = require('../scripts/build-product-template.js');

const ROOT = `${__dirname}/..`;
const product = () => fs.readFileSync(`${ROOT}/product.html`, 'utf8');
const shop = () => fs.readFileSync(`${ROOT}/pfa-shop.html`, 'utf8');

test('product.html is in step with pfa-shop.html', () => {
  assert.equal(build(), product(),
    'pfa-shop.html has changed since product.html was built — run: npm run build:product');
});

/* The shell is the shop's, with exactly one deliberate difference: relative
   URLs are rewritten to root-absolute, because this page is served one level
   down at /products/<handle>. So the comparison is against rootify(shop),
   which still fails on any real drift while allowing that rewrite. */
test('the shop stylesheet is present, differing only by the URL rewrite', () => {
  const s = shop();
  const open = s.indexOf('<style>', s.indexOf('<meta charset'));
  const close = s.indexOf('</style>', open);
  const stylesheet = s.slice(open + '<style>'.length, close);
  assert.ok(stylesheet.length > 5000, 'sanity: the stylesheet was found');
  assert.ok(product().includes(rootify(stylesheet)), 'the product page must carry the shop stylesheet');
});

test('the header and footer are the shop’s, differing only by the URL rewrite', () => {
  const s = shop();
  const header = s.slice(s.indexOf('<header class="site"'), s.indexOf('</header>') + '</header>'.length);
  const footer = s.slice(s.indexOf('<footer class="pfa-footer"'), s.indexOf('</footer>') + '</footer>'.length);
  assert.ok(product().includes(sectionLink(rootify(header))), 'header must track the shop');
  assert.ok(product().includes(rootify(footer)), 'footer must track the shop');
  /* And the rewrite must actually have happened. */
  assert.ok(!product().includes(header), 'the header links must not still be relative');
});

test('the markers the rebuild depends on are all present exactly once', () => {
  const p = product();
  for (const marker of [
    '/* PFA_PRODUCT_CSS_START */', '/* PFA_PRODUCT_CSS_END */',
    '/* PFA_PRODUCT_JS_START */', '/* PFA_PRODUCT_JS_END */',
    '<!--PFA_HEAD_START-->', '<!--PFA_HEAD_END-->', '<!--PFA_DATA-->'
  ]) {
    assert.equal(p.split(marker).length - 1, 1, `${marker} must appear exactly once`);
  }
});

test('the filter bar breathes at rest without fattening the sticky bar', () => {
  const s = shop();
  /* The hero used to carry the gap above the bar. The hero is gone, so the bar
     sits directly under the header and the room it needs is .shoptop's,
     never .filters', which is sticky, so padding added there would be carried
     for the whole scroll. */
  assert.match(s, /\.shoptop\{padding-top:calc\(var\(--ann\) \+ var\(--nav\)\)\}/,
    'the band above the bar must clear the header');
  /* The 12px vertical is the "lean" part and still holds; it moved from
     .filters onto .filters__row, which is the scroll container, so the inset
     travels with the chips instead of clipping them at the padding edge. */
  const row = s.match(/\.filters__row\{([^}]*)\}/)[1];
  assert.match(row, /padding:12px var\(--gutter\)/, 'the sticky bar itself stays lean');
  assert.ok(!/\.filters\{[^}]*padding:/.test(s), 'and the parent adds none of its own');
});
