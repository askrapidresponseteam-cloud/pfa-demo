'use strict';

/* The Add button must land on the same line in every card of a row, whatever
   the title does. Four rules together do that, and any one of them alone does
   not — which is why they are tested as a set. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');

function rule(selector) {
  const hit = shop.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
  assert.ok(hit, `${selector} not found`);
  return hit[1];
}

test('the grid stretches its cards instead of letting them stop at their content', () => {
  const grid = rule('.grid');
  assert.match(grid, /align-items:stretch/,
    'align-items:start makes every card only as tall as its own title');
  assert.ok(!/align-items:start/.test(grid));
});

test('the card fills the row it was stretched into', () => {
  /* A stretched grid area does nothing on its own: the card is the flex
     container, and it has to take the full height to have space to push into. */
  assert.match(rule('.card'), /height:100%/);
  assert.match(rule('.card'), /flex-direction:column/);
});

test('the free space is put above the action, not below it', () => {
  assert.match(rule('.card__action'), /margin-top:auto/,
    'without this the action sits directly under the title, wherever that ends');
});

test('the tile keeps its square when the card is taller than its content', () => {
  /* A flex item's min-height:auto lets its content override aspect-ratio, and
     the product photograph is in flow inside the tile. The same fault made the
     quiz option tiles ragged. */
  const tile = rule('.card__tile');
  assert.match(tile, /aspect-ratio:1/);
  assert.match(tile, /min-height:0/);
  assert.match(tile, /flex:0 0 auto/, 'the tile must not absorb the free space itself');
});

test('both states of the action are the same height', () => {
  /* Add becomes a stepper once the item is in the bag. Different heights would
     leave that one card sitting a few pixels off its neighbours. */
  const add = rule('.add').match(/height:(\d+)px/);
  const stepper = rule('.stepper').match(/height:(\d+)px/);
  assert.ok(add && stepper, 'both need an explicit height');
  assert.equal(add[1], stepper[1], `Add is ${add[1]}px, the stepper ${stepper[1]}px`);
});

test('the title and sub-line stay clamped, so a card cannot run away', () => {
  assert.match(shop, /\.card__meta>span:first-child\{[^}]*-webkit-line-clamp:2/);
  assert.match(rule('.card__sub'), /-webkit-line-clamp:1/);
});

test('the generated pages inherit the fix', () => {
  for (const page of ['product.html', 'quiz.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(html, /\.card__action\{margin-top:auto/, `${page} is out of step; run the build scripts`);
    assert.match(html, /\.grid\{[^}]*align-items:stretch/);
  }
});

/* ---- the photograph is a link ---- */

test('the product photo opens the product page, like the name does', () => {
  assert.match(shop, /'<a class="card__tile" href="\/products\/' \+ encodeURIComponent\(x\.handle\)/,
    'the tile must link to the same place as the name');
});

test('a product with no handle gets a plain frame, not a dead link', () => {
  assert.match(shop, /x\.handle\s*\n?\s*\?[\s\S]{0,200}:\s*'<div class="card__tile">'/,
    'without a handle there is nowhere to go, so it must not be a link');
});

test('the tile link is not announced twice or tabbed to twice', () => {
  /* Two links to one destination in every card is noise for a screen reader
     and a wasted tab stop. The name is the accessible route; the tile is a
     mouse target. Not focusable, so aria-hidden on it is legitimate. */
  for (const page of ['pfa-shop.html', 'product.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const tiles = [...html.matchAll(/<a class="card__tile"[^>]*(?:'[^>]*)?/g)].map((m) => m[0]);
    assert.ok(tiles.length, `${page} should build a tile link`);
    for (const tag of tiles) {
      assert.match(tag, /tabindex="-1"/, `${page}: tile link must leave the tab order`);
      assert.match(tag, /aria-hidden="true"/, `${page}: tile link must not be announced`);
    }
  }
});

test('hovering the photo does not fade it', () => {
  /* The global rule is a:hover{opacity:.65}, which on a photograph reads as a
     rendering fault rather than an affordance. */
  assert.match(shop, /a\.card__tile:hover\{[^}]*opacity:1/);
  assert.match(shop, /a\.card__tile:hover\{[^}]*border-color:var\(--ink\)/,
    'the border is the affordance instead');
});
