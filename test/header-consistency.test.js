'use strict';

/* One header, everywhere.

   What was actually different, found by comparing all fourteen pages:

   1. wall.html had no "Get Involved". Its own nav link is
      `<a href="#top" class="current">The Wall</a>`, so the pass that added the
      link matched only the footer's `href="wall.html"` and inserted it there.
   2. quiz.html and get-involved.html carried the shop's Cart button and, worse,
      marked **Shop** as the current page — both inherited from the shop shell
      they are generated from.
   3. index.html hard-coded `padding:0 16px` in six places, header included, so
      the whole home page sat 16px from the edge while every other page used the
      responsive gutter. That is what made its header look different. */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== 'submission-collage.html' && f !== 'admin.html');
const SHOP = new Set(['pfa-shop.html', 'product.html']);

function header(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const i = html.indexOf('<header');
  assert.ok(i > -1, `${page} has no header`);
  return html.slice(i, html.indexOf('</header>', i));
}
const items = (nav) => [...nav.matchAll(/>([A-Z][A-Za-z ]{1,18})</g)]
  .map((m) => m[1].trim()).filter((x) => x.length > 1 && x !== 'TM');

test('every page lists the same navigation, in the same order', () => {
  const expected = ['Founder', 'Laws', 'Units', 'Newsroom', 'The Wall', 'Get Involved',
    'CineKind', 'Shop', 'Donate'];
  const wrong = [];
  for (const page of pages) {
    const got = items(header(page)).filter((x) => x !== 'Cart');
    if (got.join('|') !== expected.join('|')) wrong.push(`${page}: ${got.join(' · ')}`);
  }
  assert.deepEqual(wrong, [], `headers disagree:\n  ${wrong.join('\n  ')}`);
});

test('the Cart appears on shop pages and nowhere else', () => {
  const wrong = [];
  for (const page of pages) {
    const hasCart = /class="navcart"|>Cart</.test(header(page));
    if (hasCart !== SHOP.has(page)) {
      wrong.push(`${page} ${hasCart ? 'has a Cart and should not' : 'is a shop page with no Cart'}`);
    }
  }
  assert.deepEqual(wrong, [], wrong.join('; '));
});

test('no page marks the wrong item as the current one', () => {
  const EXPECTED = {
    'founder.html': 'Founder', 'laws.html': 'Laws', 'units.html': 'Units',
    'newsroom.html': 'Newsroom', 'wall.html': 'The Wall',
    'get-involved.html': 'Get Involved', 'cinekind.html': 'CineKind',
    /* shop.html is the shop's door and product.html sits under it: both are the
       shop as far as the nav is concerned, so both highlight Shop without being
       the page the link points at. */
    'pfa-shop.html': 'Shop', 'shop.html': 'Shop', 'product.html': 'Shop',
    'donate.html': 'Donate'
  };
  const wrong = [];
  for (const page of pages) {
    const m = header(page).match(/aria-current="page"[^>]*>([^<]*)</);
    const current = m ? m[1].trim() : null;
    const want = EXPECTED[page] || null;
    if (want && current !== want) wrong.push(`${page}: marks "${current}", should mark "${want}"`);
    /* A page with no nav entry of its own must not borrow someone else's. */
    if (!want && current) wrong.push(`${page}: marks "${current}" but has no nav entry`);
  }
  assert.deepEqual(wrong, [], wrong.join('; '));
});

test('every header insets by the shared gutter, not a hard-coded value', () => {
  const wrong = [];
  for (const page of pages) {
    const nav = header(page);
    const padding = nav.match(/padding:\s*0\s+([^;"']+)/);
    if (!padding) continue;                      // class-based pages carry it in CSS
    if (!/var\(--g(?:utter)?\)/.test(padding[1])) wrong.push(`${page}: padding 0 ${padding[1]}`);
  }
  assert.deepEqual(wrong, [], `these use a fixed gutter: ${wrong.join(', ')}`);
});

test('the home page is measured like the rest, not pinned to a literal', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/top:34px/.test(html), 'the header must not be pinned to a literal bar height');
  assert.match(html, /<header class="site" id="header"/, 'the home page uses the shared header');
  assert.match(html, /<link rel="stylesheet" href="assets\/chrome\.css">/);
  assert.match(html, /<script src="assets\/chrome\.js"><\/script>/);
  assert.ok(!/header nav\{max-width/.test(html), 'the home page must not cap the nav width on its own');
  assert.ok(!/padding:0 16px/.test(html), 'the home page must not hard-code the gutter');
});

test('a rebuild cannot put the shop furniture back', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-quiz-template.js'), 'utf8');
  assert.match(build, /function quizHeader/);
  assert.match(build, /navcart/, 'the build must strip the Cart');
  assert.match(build, /aria-current="page"/, 'and the shop\u2019s current-page marker');
});
