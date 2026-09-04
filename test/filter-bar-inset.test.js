'use strict';

/* The shop's filter bar must sit at the same inset as the header and the grid.
   All three read one token, so the test is that they read the same one — not
   that they happen to have matching numbers today.

   It used to name the hero as the third band. The hero was removed on 31 Aug
   2026: its copy moved to shop.html, the door the shop is entered through, and
   this page opens on its products. The grid is the band that remains. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
/* The header rule moved to the shared stylesheet; the page keeps the rest. */
const shop = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'assets', 'chrome.css'), 'utf8');

function ruleFor(selector) {
  const hit = shop.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
  assert.ok(hit, `${selector} not found`);
  return hit[1];
}
const inset = (rule) => (rule.match(/padding:[^;]*?(var\(--gutter\))/) || [])[1];

test('the filter row, the header and the grid all inset from the same token', () => {
  const row = inset(ruleFor('.filters__row'));
  assert.equal(row, 'var(--gutter)', `the filter row insets with: ${ruleFor('.filters__row')}`);
  assert.equal(inset(ruleFor('header.site')), row, 'the header must match');
  assert.ok(/var\(--gutter\)/.test(ruleFor('.grid-wrap')), 'and the grid');
});

test('the shop opens on its products, with no hero above them', () => {
  /* The words a shopper reads are on the door at shop.html. This page has to
     clear the fixed header itself, and keep its name for a screen reader and
     a search engine, without putting a block of copy back above the grid. */
  const page = fs.readFileSync(path.join(ROOT, 'pfa-shop.html'), 'utf8');
  assert.ok(!/<section class="hero">/.test(page), 'the hero must not come back');
  assert.match(page, /<main id="top">\s*<div class="shoptop">/, 'the first band clears the header');
  assert.match(ruleFor('.shoptop'), /padding-top:calc\(var\(--ann\) \+ var\(--nav\)\)/);
  assert.match(page, /<h1>[^<]+<\/h1>/, 'the page keeps exactly one heading of its own');
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
});

test('the inset is on the scroll container, not its parent', () => {
  /* .filters__row is overflow-x:auto. With the padding on .filters, the chips
     scroll to the padding edge and are clipped with no space at either end —
     which is what a phone shows, since the chips always overflow there. */
  assert.match(ruleFor('.filters__row'), /overflow-x:auto/);
  assert.match(ruleFor('.filters__row'), /padding:12px var\(--gutter\)/);
  assert.ok(!/padding:/.test(ruleFor('.filters')),
    'the outer band carries the background and border only');
});

test('the small-screen override moved with the padding', () => {
  const narrow = shop.match(/@media \(max-width:400px\)\{([^}]*\}[^}]*)\}/);
  assert.ok(narrow, 'the narrow breakpoint must still exist');
  assert.ok(!/\.filters\{padding/.test(narrow[1]),
    'it must not put padding back on the parent');
});

test('the item count is pushed to the inset edge, not the viewport edge', () => {
  /* The count used to carry margin-left:auto on its own. It now travels with
     the sort control in .filters__end, and the group carries it — so the two
     stay side by side instead of the sort drifting into the chips. */
  assert.match(ruleFor('.filters__end'), /margin-left:auto/,
    'the group sits at the end of the row, which is inside the padding');
  assert.ok(!/margin-left:auto/.test(ruleFor('.count')),
    'and the count no longer pushes itself away from the sort control');
  assert.match(shop, /<div class="filters__end">[\s\S]{0,600}id="count"/,
    'the count must be inside that group');
});

test('the generated pages inherit the same rule', () => {
  for (const page of ['product.html', 'quiz.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(html, /\.filters__row\{[^}]*padding:12px var\(--gutter\)/,
      `${page} is out of step; run the build scripts`);
  }
});

/* ---- the view settles once, deliberately, when a filter answers ---- */

const test2 = require('node:test');
const assert2 = require('node:assert/strict');

test2('every filter path settles the view; nothing else is anchored for it', () => {
  /* A filter rewrites the grid wholesale and the page changes height; the
     browser then clamps the scroll or re-anchors it to a card that no longer
     exists, and the visitor lands somewhere arbitrary - reported as the site
     "jumping here and there" (31 Aug 2026). One deliberate movement instead,
     to the top of the results, and only when the visitor was scrolled past
     them: settleView() moves nothing when the results are already in view. */
  const fs2 = require('node:fs');
  const shop = fs2.readFileSync(`${__dirname}/../pfa-shop.html`, 'utf8');
  assert2.match(shop, /function settleView\(\)/);
  assert2.match(shop, /if \(top < start - 1\) window\.scrollTo/, 'already in view, nothing moves');
  const calls = (shop.match(/settleView\(\);/g) || []).length;
  assert2.equal(calls, 4, 'the shelf press, the chip press, the query and the sort - and nothing else');
  /* The browser's own anchoring is off inside the goods, because its anchor
     dies in every wholesale repaint. Card heights are reserved, so it had
     nothing legitimate left to hold. */
  assert2.match(shop, /\.goods\{min-width:0;overflow-anchor:none\}/);
});
