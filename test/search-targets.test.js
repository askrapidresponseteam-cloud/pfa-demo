'use strict';

/* Site search, held to its word.

   Three promises, each of which has quietly broken before. One: every URL
   the search box can hand a visitor - the curated shortcuts in pfa-search.js
   and the popular list the lambda serves - lands on a page that exists, at
   an anchor that exists. Five of them did not when this test was written:
   three still pointed at sections the home page lost when the essay moved to
   someone.html, one at a donation flow that had been renamed, and one at a
   nomination form that was deliberately removed. Two: every public page is
   in the shipped index, so the first search can answer for the whole site.
   Three: every entry title in the record on achievements.html is in the
   index verbatim, because a record a visitor cannot search is not on offer.

   The builder's own exclusion list is read from its source rather than
   copied here, for the same reason sync-chrome reads one template: two
   copies of a list is how lists disagree. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function curatedTargets(source) {
  return [...source.matchAll(/u:\s*'([^']+)'/g)].map((m) => m[1]);
}

function builderExcludes() {
  const src = read('scripts/build-search-index.js');
  const m = /EXCLUDE = new Set\(\[([^\]]+)\]\)/.exec(src);
  assert.ok(m, 'the builder still declares its EXCLUDE list');
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

test('every curated search target lands on a real page and a real anchor', () => {
  const targets = new Set([
    ...curatedTargets(read('pfa-search.js')),
    ...curatedTargets(read('lib/routes/search-popular.js'))
  ]);
  const broken = [];
  for (const u of targets) {
    const [page, anchor] = u.split('#');
    if (!fs.existsSync(path.join(ROOT, page))) {
      broken.push(`${u} (no such page)`);
      continue;
    }
    if (anchor && !read(page).includes(`id="${anchor}"`)) {
      broken.push(`${u} (no such anchor)`);
    }
  }
  assert.deepEqual(broken, [], 'dead search targets:\n  ' + broken.join('\n  '));
});

test('every public page is in the shipped search index', () => {
  const exclude = builderExcludes();
  const indexed = new Set(
    JSON.parse(read('search-index.json')).pages
      .map((p) => (p.url === '/' ? 'index.html' : p.url.replace(/^\//, '')))
  );
  const missing = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html') && !exclude.has(f) && !indexed.has(f));
  assert.deepEqual(missing, [], 'public pages absent from the index: ' + missing.join(', '));
});

test('every entry in the record is searchable by its title', () => {
  const page = JSON.parse(read('search-index.json')).pages
    .find((p) => p.url === '/achievements.html');
  assert.ok(page, 'achievements.html is in the index');
  const inIndex = new Set(page.headings);
  const titles = [...read('achievements.html')
    .matchAll(/<h3 class="rec__t display">([\s\S]*?)<\/h3>/g)]
    .map((m) => m[1].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim());
  assert.ok(titles.length >= 100, 'the record still parses (' + titles.length + ' titles found)');
  const missing = titles.filter((t) => !inIndex.has(t));
  assert.deepEqual(missing, [], 'record entries a search cannot find:\n  ' + missing.join('\n  '));
});
