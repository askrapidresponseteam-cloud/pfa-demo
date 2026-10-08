'use strict';

/* The site on a phone (owner, 4 Oct 2026: "100% mobile-responsive"). The
   browser walk that found the faults is not something the test suite can
   run, so these pin what fixed them: the phone block on every page is
   current, the header has its menu, and form fields cannot zoom an iPhone. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../scripts/mobile-pass');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !['admin.html', 'submission-collage.html', 'shop.html'].includes(f));

test('every page carries a current phone block', () => {
  const stale = pages.filter((page) => M.apply(page, read(page)) !== read(page));
  assert.deepEqual(stale, [], `run npm run build:mobile: ${stale.join(', ')}`);
  /* a page with no styles of its own (read.html) takes the rules in its stylesheet */
  for (const page of pages) {
    const head = read(page).split('</head>')[0];
    if (/<style/.test(head)) assert.ok(read(page).includes(M.START), `${page} has no phone block`);
  }
});

test('the type floor lifts only labels under 10px, and leaves hiding sizes alone', () => {
  const got = M.smallSelectors('.a{font-size:9px}.b{font-size:12px}.c,.d{font-size:10.5px}.sr{font-size:1px}@media (max-width:9px){.e{font-size:8px}}');
  assert.deepEqual(got.sort(), ['.a', '.e']);
});

test('the header has a menu button below 900px, and the menu is built from the desktop menus', () => {
  const header = read('assets/chrome-header.html');
  assert.match(header, /<button class="burger" type="button" aria-expanded="false" aria-controls="mnav"/);
  const js = read('assets/chrome.js');
  assert.match(js, /function initMobileNav\(\)/);
  assert.match(js, /document\.body\.appendChild\(panel\)/, 'the panel lives on <body>, outside the blurred header');
  const css = read('assets/chrome.css');
  assert.match(css, /@media \(max-width:900px\)\{\s*\.burger\{display:inline-flex/);
  for (const page of pages.concat(['shop.html'])) {
    if (!read(page).includes('<header class="site"')) continue;
    assert.ok(read(page).includes('class="burger"'), `${page}: no menu button in its header`);
  }
});

test('no form field on a phone is under 16px, so an iPhone never zooms on a tap', () => {
  const css = read('assets/chrome.css');
  assert.match(css, /@media \(pointer:coarse\),\(max-width:700px\)\{\s*input:not\(\[type=checkbox\]\)[^{]*,select,textarea\{font-size:16px!important\}/);
  assert.match(read('admin.html'), /select,textarea\{font-size:16px!important\}/);
});

test('the search page field is ink on paper, not white on white', () => {
  const css = read('pfa-search.css');
  assert.doesNotMatch(css, /\.pfa-sr__field input\{[^}]*color:#fff/);
  assert.match(css, /\.pfa-sr__results\{grid-template-columns:minmax\(0,1fr\)\}/, 'the results column cannot outgrow a tablet');
});
