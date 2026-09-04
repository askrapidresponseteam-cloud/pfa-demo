'use strict';

/* The panel turned up in the site search box. It was not a hole in the auth
   (it is behind a Firebase admin claim either way) but it handed a stranger
   its address and, in one row's description, its signed-in headings.

   The cause was search-index.json in the repo root: a crawled index, built by
   a crawler that is not in this tree, which had walked into admin.html and
   written four rows. Deleting them fixes the file that exists today. These
   tests are about the next crawl, and the next page anyone marks private. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isPrivatePath, PRIVATE, publicPages } = require('../scripts/build-search-index');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the rule itself catches the panel and the API, and nothing public', () => {
  ['admin.html', '/admin.html', 'admin.html#signin', 'ADMIN.HTML', 'api/pfa-orders', '/api/admin/case']
    .forEach((u) => assert.ok(isPrivatePath(u), `${u} should be private`));
  ['laws.html', 'units.html', 'index.html', 'careers.html#apply', 'products/collar', 'administration.html']
    .forEach((u) => assert.ok(!isPrivatePath(u), `${u} should not be private`));
  /* administration.html is in that list on purpose: \b in the pattern is what
     keeps a hypothetical public page from being caught by a prefix match. */
});

test('no private page is a public page', () => {
  publicPages().forEach((f) => assert.ok(!isPrivatePath(f), `${f} is both public and private`));
});

test('the crawled index the search box loads carries no private row', () => {
  const rows = JSON.parse(read('search-index.json'));
  assert.ok(Array.isArray(rows) && rows.length > 100, 'the crawled index is missing or truncated');
  const leaked = rows.filter((r) => isPrivatePath(r && r.u)).map((r) => r.u);
  assert.deepEqual(leaked, [], 'these would appear in site search results');
});

test('the shipped page index carries no private row either', () => {
  const index = JSON.parse(read('assets/search-index.json'));
  const leaked = index.pages.filter((p) => isPrivatePath(p.url)).map((p) => p.url);
  assert.deepEqual(leaked, [], 'these would appear in site search results');
});

test('nothing the public can reach links to the panel', () => {
  const linked = [];
  publicPages().forEach((f) => {
    [...read(f).matchAll(/href="([^"]+)"/g)].forEach((m) => {
      if (isPrivatePath(m[1].replace(/^https?:\/\/[^/]+/, ''))) linked.push(`${f} -> ${m[1]}`);
    });
  });
  ['assets/chrome-header.html', 'assets/chrome-footer.html'].forEach((f) => {
    [...read(f).matchAll(/href="([^"]+)"/g)].forEach((m) => {
      if (isPrivatePath(m[1])) linked.push(`${f} -> ${m[1]}`);
    });
  });
  assert.deepEqual(linked, [], 'a public page links straight to the panel');
});

test('the panel is kept out of the sitemap, robots and the crawlers', () => {
  assert.ok(!read('sitemap.xml').includes('admin'), 'the panel is in the sitemap');
  assert.match(read('robots.txt'), /Disallow: \/admin\.html/);
  assert.match(read('robots.txt'), /Disallow: \/api\//);
  /* robots.txt asks a crawler not to fetch it. A crawler that ignores robots
     can still index a URL it heard about elsewhere, so the page says so too. */
  assert.match(read('admin.html'), /<meta name="robots" content="noindex, nofollow">/,
    'admin.html must carry its own noindex, robots.txt is a request not a control');
});

test('site search drops a private row even if the next crawl adds one back', () => {
  const src = read('pfa-search.js');
  assert.match(src, /var PRIVATE = \/\^\\\/\?\(admin\\b\|api\\\/\)\/i;/,
    'pfa-search.js has no private-path rule, so a fresh crawl would restore the leak');
  assert.match(src, /!isPrivate\(r\.u\)/, 'the merged crawl rows are not filtered');
  /* The curated rows are hand-written, so this is the cheap check that nobody
     ever types the panel into them. */
  assert.ok(!/u: *'\/?admin/.test(src), 'a curated row points at the panel');
});

test('a private path can neither be recorded nor served as a popular search', () => {
  const src = read('lib/routes/search-popular.js');
  assert.match(src, /\/\^\\\/\?\(admin\\b\|api\\\/\)\/i\.test\(raw\)/,
    'search-popular.js does not reject private paths');
  /* It has to sit in normalisePath: that is the one function both the write
     and the read go through. */
  const fn = /function normalisePath\(value\)[\s\S]*?\n}/.exec(src)[0];
  assert.match(fn, /admin/, 'the guard is not in normalisePath, so one direction is unprotected');
});

test('the three copies of the rule still agree', () => {
  /* One is Node, one is browser code with no module system, one is a lambda.
     They cannot share an import, so this is what keeps them the same rule. */
  const written = PRIVATE.source;
  [['pfa-search.js', read('pfa-search.js')], ['lib/routes/search-popular.js', read('lib/routes/search-popular.js')]]
    .forEach(([name, src]) => assert.ok(src.includes(written), `${name} has drifted from PRIVATE in scripts/build-search-index.js`));
});
